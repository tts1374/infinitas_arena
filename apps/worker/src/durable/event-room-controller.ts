import {
  CHART_DIFFICULTIES,
  HOST_EVENT_CLOSED_RETENTION_SECONDS,
  HOST_EVENT_IDEMPOTENCY_CONFLICT,
  HOST_EVENT_PROTOCOL,
  HOST_EVENT_RESULTS_PAGE_SIZE,
  LEVEL_FILTERS,
  SOURCE_TYPES,
  type ClientMessage,
  type EventJoinPayload,
  type EventRoomAction,
  type ServerMessagePayloadMap,
  type ServerMessageType,
  type SongUnlockSettings,
} from "@infinitas/shared";
import { eventAcceptNew, supportedEventClientVersion } from "../services/event-room-create";
import type { WorkerEnv } from "../types/env";
import { asEnumValue, isRecord, parsePositiveInt } from "../utils/validation";
import { workerChartMaster } from "../master/chart-master";
import { EventRoomState, type EventRoomInitializationInput, type EventRoomStatePersistenceRecord, type EventStateResult } from "./event-room-state";
import { createServerEnvelope, decodeClientMessage } from "./ws-codec";

export const EVENT_ROOM_RECORD_STORAGE_KEY = "event-room-record";
const OPEN = 1;

class AlarmSyncAfterPersistError extends Error {
  constructor() { super("Alarm synchronization failed after event state was persisted."); }
}
type Role = "HOST" | "PLAYER";
type Attachment = { roomKind: "HOST_EVENT"; playerId: string | null; role: Role | null; connectionId: string | null; attachedAt: string | null };
type Session = Attachment & { socket: WebSocket };

export interface EventControllerStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<unknown>;
  deleteAlarm(): Promise<void>;
  setAlarm(value: Date | number): Promise<void>;
}
export interface EventControllerState {
  storage: EventControllerStorage;
  getWebSockets(): WebSocket[];
}
interface HibernationSocket extends WebSocket { serializeAttachment(value: Attachment): void; deserializeAttachment(): unknown }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function parseAttachment(value: unknown): Attachment | null {
  if (!isRecord(value) || value.roomKind !== "HOST_EVENT") return null;
  if (value.playerId !== null && typeof value.playerId !== "string") return null;
  if (value.role !== null && value.role !== "HOST" && value.role !== "PLAYER") return null;
  return { roomKind: "HOST_EVENT", playerId: value.playerId as string | null, role: value.role as Role | null,
    connectionId: typeof value.connectionId === "string" ? value.connectionId : null,
    attachedAt: typeof value.attachedAt === "string" ? value.attachedAt : null };
}
function parseUnlocks(value: unknown): SongUnlockSettings | undefined {
  if (!isRecord(value) || typeof value.bit_unlocked !== "boolean" || typeof value.djp_unlocked !== "boolean" ||
      typeof value.allow_leggendaria !== "boolean" || !Array.isArray(value.owned_pack_ids) ||
      value.owned_pack_ids.some((entry) => !Number.isInteger(entry) || (entry as number) < 0)) return undefined;
  return { bit_unlocked: value.bit_unlocked, djp_unlocked: value.djp_unlocked,
    allow_leggendaria: value.allow_leggendaria, owned_pack_ids: value.owned_pack_ids as number[] };
}
function isJsonValue(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValue(entry, seen))
    : Object.values(value as Record<string, unknown>).every((entry) => isJsonValue(entry, seen));
  seen.delete(value);
  return valid;
}
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value) && isJsonValue(value, new Set());
}
function validActionShape(action: Record<string, unknown>): boolean {
  const name = action.action;
  const known = ["START_EVENT", "CONFIRM_PICK", "CANCEL_PICK", "SET_READY", "START_ROUND", "SUBMIT", "SKIP", "CLOSE_ROUND", "NEXT_PICK", "INVALIDATE_ROUND", "KICK", "LEAVE", "END_EVENT", "STATE_GET", "RESULTS_GET"];
  if (typeof name !== "string" || !known.includes(name)) return false;
  if (action.event_id !== undefined && !nonEmpty(action.event_id)) return false;
  if (!["START_EVENT", "KICK", "LEAVE", "END_EVENT", "STATE_GET", "RESULTS_GET"].includes(name) && !nonEmpty(action.event_id)) return false;
  if (["CANCEL_PICK", "SET_READY", "START_ROUND", "SUBMIT", "SKIP", "CLOSE_ROUND", "NEXT_PICK"].includes(name) && !nonEmpty(action.round_id)) return false;
  if (["CONFIRM_PICK", "CANCEL_PICK", "SET_READY", "START_ROUND"].includes(name) && !Number.isInteger(action.selection_revision)) return false;
  if (name === "CONFIRM_PICK" && !nonEmpty(action.chart_key)) return false;
  if (name === "SET_READY" && typeof action.ready !== "boolean") return false;
  if (name === "SUBMIT" && (!isRecord(action.observed_key) || typeof action.metric_value !== "number" || !Number.isFinite(action.metric_value) ||
      (action.source_meta !== undefined && !isJsonObject(action.source_meta)))) return false;
  if (name === "INVALIDATE_ROUND" && !nonEmpty(action.target_round_id)) return false;
  if (name === "KICK" && !nonEmpty(action.target_player_id)) return false;
  if (name === "RESULTS_GET" && action.limit !== undefined && (!Number.isInteger(action.limit) || (action.limit as number) <= 0)) return false;
  return true;
}

export class EventRoomController {
  private stateMachine = new EventRoomState(workerChartMaster);
  private sessions = new Map<WebSocket, Session>();
  private active = new Map<string, WebSocket>();
  private restoreLost = false;
  private cleanedUp = false;
  private routedRoomId = "";

  constructor(private readonly state: EventControllerState, private readonly env: WorkerEnv) {}

  isInitialized(): boolean { return this.stateMachine.isInitialized(); }
  ownsRoom(): boolean { return this.isInitialized() || this.restoreLost || this.cleanedUp; }
  roomId(): string { return this.isInitialized() ? this.stateMachine.toSnapshot().room_id : this.routedRoomId; }

  async restore(record: unknown): Promise<void> {
    try {
      this.stateMachine.hydrate(record);
      this.routedRoomId = this.stateMachine.toSnapshot().room_id;
      const before = this.stateMachine.toPersistenceRecord();
      if (this.stateMachine.expireHostDeadline(new Date())) {
        try { await this.commit(before, false); } catch { await this.ensureRestoredAlarm(); }
      } else await this.ensureRestoredAlarm();
    } catch {
      this.restoreLost = true;
      if (isRecord(record) && typeof record.room_id === "string") this.routedRoomId = record.room_id;
    }
    this.rebuildSessions();
  }

  async initialize(input: EventRoomInitializationInput): Promise<void> {
    if (this.ownsRoom()) throw new Error("Event room is already initialized.");
    this.stateMachine.initialize(input);
    this.routedRoomId = input.room_id;
    try {
      await this.persist();
      await this.syncAlarm();
    } catch (error) {
      await this.state.storage.delete(EVENT_ROOM_RECORD_STORAGE_KEY);
      await this.state.storage.deleteAlarm();
      this.stateMachine = new EventRoomState(workerChartMaster); this.routedRoomId = "";
      throw error;
    }
  }

  registerSocket(socket: WebSocket): void {
    const attachment = this.readAttachment(socket) ?? this.blankAttachment();
    const session = { socket, ...attachment };
    this.sessions.set(socket, session);
    if (session.playerId !== null) {
      const previous = this.active.get(session.playerId);
      const prevAt = previous === undefined ? -Infinity : Date.parse(this.sessions.get(previous)?.attachedAt ?? "");
      if (Date.parse(session.attachedAt ?? "") >= prevAt) this.active.set(session.playerId, socket);
    }
  }

  async message(socket: WebSocket, raw: string | ArrayBuffer | ArrayBufferView): Promise<void> {
    const session = this.sessions.get(socket) ?? (this.registerSocket(socket), this.sessions.get(socket)!);
    if (typeof raw !== "string") return this.error(socket, "INVALID_MESSAGE", "Only text messages are supported.");
    const decoded = decodeClientMessage(raw);
    if (!decoded.ok) return this.error(socket, "INVALID_MESSAGE", decoded.error);
    const message = decoded.message;
    if (!nonEmpty(message.client_msg_id) || !nonEmpty(message.player_id) || !nonEmpty(message.room_id)) {
      return this.error(socket, "INVALID_MESSAGE", "Envelope identifiers must not be empty.");
    }
    if (message.room_id !== this.roomId()) return this.error(socket, "ROOM_MISMATCH", "room_id does not match this room.");
    if (this.cleanedUp) return this.error(socket, "EVENT_CLEANED_UP", "Event retention has expired.");
    if (this.restoreLost) return this.error(socket, "ROOM_STATE_LOST", "Event room state could not be restored.");
    try { await this.expireBeforeRequest(); } catch { return this.error(socket, "STORAGE_FAILURE", "Failed to confirm the Host deadline."); }
    if (session.playerId !== null && (session.playerId !== message.player_id || this.active.get(session.playerId) !== socket)) {
      return this.error(socket, "STALE_SOCKET", "This socket is no longer current.");
    }
    if (message.type === "EVENT_JOIN") return this.join(session, message as ClientMessage<"EVENT_JOIN">);
    if (message.type === "PING") {
      if (session.playerId === null) return this.error(socket, "EVENT_JOIN_REQUIRED", "Send EVENT_JOIN before PING.");
      this.send(socket, "PONG", {});
      return;
    }
    if (message.type !== "EVENT_ACTION") return this.error(socket, "PROTOCOL_MISMATCH", "EVENT_JOIN is required for event rooms.");
    if (session.playerId === null) return this.error(socket, "EVENT_JOIN_REQUIRED", "Send EVENT_JOIN before EVENT_ACTION.");
    if (!isRecord(message.payload) || !nonEmpty(message.payload.request_id) || message.client_msg_id !== message.payload.request_id) {
      return this.error(socket, "INVALID_ACTION", "client_msg_id must equal the non-empty request_id.");
    }
    try {
      await this.action(session, message.payload as unknown as EventRoomAction);
    } catch {
      this.error(socket, "INVALID_ACTION", "Invalid event action.");
    }
  }

  async close(socket: WebSocket): Promise<void> {
    const session = this.sessions.get(socket);
    this.sessions.delete(socket);
    if (session?.playerId == null || this.active.get(session.playerId) !== socket || !this.isInitialized()) return;
    this.active.delete(session.playerId);
    const before = this.stateMachine.toPersistenceRecord();
    const result = this.stateMachine.disconnect(session.playerId, new Date());
    if (!result.changed) return;
    try {
      await this.commit(before, false);
    } catch (error) {
      if (error instanceof AlarmSyncAfterPersistError) this.broadcastState();
      return;
    }
    this.broadcastState();
  }

  async alarm(now = new Date()): Promise<void> {
    if (!this.isInitialized()) return;
    const snapshot = this.stateMachine.toSnapshot();
    if (snapshot.ended_at !== null && now.getTime() >= Date.parse(snapshot.ended_at) + HOST_EVENT_CLOSED_RETENTION_SECONDS * 1_000) {
      await this.state.storage.delete(EVENT_ROOM_RECORD_STORAGE_KEY);
      await this.state.storage.deleteAlarm();
      for (const session of this.sessions.values()) if (session.socket.readyState === OPEN) session.socket.close(4000, "Event retention expired.");
      this.sessions.clear(); this.active.clear(); this.stateMachine = new EventRoomState(workerChartMaster);
      this.restoreLost = false; this.cleanedUp = true;
      return;
    }
    const before = this.stateMachine.toPersistenceRecord();
    if (this.stateMachine.expireHostDeadline(now)) {
      try {
        await this.commit(before, false);
      } catch {
        // A failed alarm update after a successful put must not suppress the terminal state.
        if (this.stateMachine.toSnapshot().ended_at !== null) this.broadcastState();
        throw new Error("Failed to persist event timeout.");
      }
      this.broadcastState();
    }
    if (!this.stateMachine.toSnapshot().ended_at) await this.syncAlarm();
  }

  async chartSearch(url: URL): Promise<Response> {
    if (!this.isInitialized()) return Response.json({ error: "ROOM_STATE_LOST" }, { status: 404 });
    const levelFilter = asEnumValue(url.searchParams.get("level_filter"), LEVEL_FILTERS);
    if (levelFilter === undefined) return Response.json({ error: "level_filter is required." }, { status: 400 });
    try {
      const difficulty = asEnumValue(url.searchParams.get("difficulty"), CHART_DIFFICULTIES);
      const level = parsePositiveInt(url.searchParams.get("level"));
      const result = this.stateMachine.searchCharts({
        play_style: this.stateMachine.toSnapshot().settings.play_style,
        level_filter: levelFilter,
        ...(difficulty === undefined ? {} : { difficulty }),
        ...(level === undefined ? {} : { level }),
        ...(url.searchParams.get("version") === null ? {} : { version: url.searchParams.get("version")! }),
        ...(url.searchParams.get("keyword") === null ? {} : { keyword: url.searchParams.get("keyword")! }),
        ...(url.searchParams.get("cursor") === null ? {} : { cursor: url.searchParams.get("cursor")! }),
        limit: Math.min(parsePositiveInt(url.searchParams.get("limit")) ?? HOST_EVENT_RESULTS_PAGE_SIZE, HOST_EVENT_RESULTS_PAGE_SIZE),
      });
      return Response.json(result);
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "CHART_SEARCH_FAILED" }, { status: 409 }); }
  }

  private async join(session: Session, message: ClientMessage<"EVENT_JOIN">): Promise<void> {
    if (session.playerId !== null) return this.error(session.socket, "ALREADY_JOINED", "Socket already joined.");
    const payload = message.payload as EventJoinPayload;
    const source = asEnumValue(payload.source, SOURCE_TYPES);
    if (payload.host_event_protocol !== HOST_EVENT_PROTOCOL || typeof payload.client_version !== "string" ||
        !supportedEventClientVersion(payload.client_version, this.env.MIN_SUPPORTED_CLIENT_VERSION) ||
        typeof payload.join_code !== "string" || typeof payload.display_name !== "string" || payload.display_name.trim().length === 0 ||
        (payload.source !== undefined && source === undefined) || payload.join_code.toUpperCase() !== this.stateMachine.toSnapshot().settings.join_code) {
      return this.error(session.socket, "EVENT_JOIN_REJECTED", "Invalid EVENT_JOIN.");
    }
    const unlocks = payload.song_unlocks === undefined ? undefined : parseUnlocks(payload.song_unlocks);
    if (payload.song_unlocks !== undefined && unlocks === undefined) return this.error(session.socket, "EVENT_JOIN_REJECTED", "Invalid song unlock settings.");
    const terminal = this.stateMachine.toSnapshot();
    if (terminal.ended_at !== null) {
      const known = message.player_id === terminal.host.player_id || terminal.participants.some((entry) => entry.player_id === message.player_id && entry.connection_state !== "KICKED");
      if (!known) return this.error(session.socket, "EVENT_ENDED", "Event join rejected.");
      this.assignJoinedSession(session, message.player_id);
      this.send(session.socket, "EVENT_JOIN_ACCEPTED", { session_role: session.role === "HOST" ? "HOST" : "PLAYER", event_room_snapshot: terminal });
      return;
    }
    const before = this.stateMachine.toPersistenceRecord();
    const result = this.stateMachine.join({ player_id: message.player_id, display_name: payload.display_name,
      ...(source === undefined ? {} : { source }), ...(unlocks === undefined ? {} : { song_unlocks: unlocks }),
      accept_new: eventAcceptNew(this.env), now: new Date() });
    if (!result.ok) return this.error(session.socket, result.reason ?? "EVENT_JOIN_REJECTED", "Event join rejected.");
    try { await this.commit(before); } catch { return this.error(session.socket, "STORAGE_FAILURE", "Event join was not applied."); }
    this.assignJoinedSession(session, message.player_id);
    this.send(session.socket, "EVENT_JOIN_ACCEPTED", { session_role: session.role === "HOST" ? "HOST" : "PLAYER", event_room_snapshot: this.stateMachine.toSnapshot() });
    this.broadcastState();
  }

  private async action(session: Session, action: EventRoomAction): Promise<void> {
    if (!isRecord(action) || !validActionShape(action) || !nonEmpty(action.request_id) ||
        !Number.isInteger(action.generation) || action.generation !== this.stateMachine.toSnapshot().generation) {
      return this.error(session.socket, "INVALID_ACTION", "Invalid event action.", isRecord(action) && typeof action.request_id === "string" ? action.request_id : undefined);
    }
    const playerId = session.playerId!;
    const snapshot = this.stateMachine.toSnapshot();
    if ((snapshot.event_id !== null && action.event_id !== snapshot.event_id) ||
        (snapshot.event_id === null && action.event_id !== undefined)) {
      return this.error(session.socket, "EVENT_MISMATCH", "event_id mismatch.", action.request_id);
    }
    const fingerprint = canonical(action);
    const prior = this.stateMachine.checkIdempotency(playerId, action.request_id, fingerprint);
    if (prior.kind === "CONFLICT") return this.error(session.socket, HOST_EVENT_IDEMPOTENCY_CONFLICT, "request_id payload conflict.", action.request_id);
    if (prior.kind === "DUPLICATE") {
      if (action.action === "LEAVE") {
        const before = this.stateMachine.toPersistenceRecord();
        const replay = this.stateMachine.restoreDuplicateLeave(playerId);
        if (replay.ok && replay.changed) {
          try { await this.commit(before); } catch { return this.error(session.socket, "STORAGE_FAILURE", "Duplicate LEAVE could not be restored.", action.request_id); }
          this.broadcastState();
        }
      }
      return this.send(session.socket, "EVENT_ACTION_ACK", { request_id: action.request_id, accepted: true, applied_revision: prior.applied_revision, duplicate: true });
    }
    if (action.action === "STATE_GET") { this.send(session.socket, "EVENT_STATE", { event_room_snapshot: snapshot }); return; }
    if (action.action === "RESULTS_GET") { this.sendResults(session.socket, action.cursor, action.limit); return; }
    const before = this.stateMachine.toPersistenceRecord();
    const now = new Date();
    const requestId = action.request_id;
    let result: EventStateResult;
    switch (action.action) {
      case "START_EVENT": result = this.stateMachine.startEvent(playerId, crypto.randomUUID(), now); break;
      case "CONFIRM_PICK": result = this.stateMachine.confirmPick(playerId, action.chart_key, action.selection_revision, crypto.randomUUID(), now); break;
      case "CANCEL_PICK": result = this.stateMachine.cancelPick(playerId, action.round_id, action.selection_revision, now); break;
      case "SET_READY": result = this.stateMachine.setReady(playerId, action.round_id, action.selection_revision, action.ready, now); break;
      case "START_ROUND": result = this.stateMachine.startRound(playerId, action.round_id, action.selection_revision, now); break;
      case "SUBMIT": result = this.stateMachine.submit(playerId, action.round_id, action.observed_key, action.metric_value, action.source_meta ?? null, now); break;
      case "SKIP": result = this.stateMachine.skip(playerId, action.round_id, now); break;
      case "CLOSE_ROUND": result = this.stateMachine.closeRound(playerId, action.round_id, now); break;
      case "NEXT_PICK": result = this.stateMachine.nextPick(playerId, action.round_id, now); break;
      case "INVALIDATE_ROUND": result = this.stateMachine.invalidateRound(playerId, action.target_round_id, now); break;
      case "KICK": result = this.stateMachine.kick(playerId, action.target_player_id, now); break;
      case "LEAVE": result = this.stateMachine.leave(playerId, now); break;
      case "END_EVENT": result = this.stateMachine.endEvent(playerId, now, true); break;
      default: return this.error(session.socket, "INVALID_ACTION", "Unknown action.", requestId);
    }
    if (!result.ok) return this.error(session.socket, result.reason ?? "ACTION_REJECTED", "Event action rejected.", action.request_id);
    this.stateMachine.rememberIdempotency(playerId, action.request_id, fingerprint);
    try { await this.commit(before); } catch { return this.error(session.socket, "STORAGE_FAILURE", "Event action was not applied.", action.request_id); }
    this.send(session.socket, "EVENT_ACTION_ACK", { request_id: action.request_id, accepted: true, applied_revision: this.stateMachine.getRevision() });
    this.broadcastState();
  }

  private sendResults(socket: WebSocket, cursor?: string, rawLimit?: number): void {
    const rounds = this.stateMachine.getPublicResults();
    const revision = rounds.reduce((max, entry) => Math.max(max, entry.public_revision), 0);
    let offset = 0;
    if (cursor !== undefined) {
      const match = /^(\d+):(\d+)$/.exec(cursor);
      if (match === null || Number(match[1]) !== revision) {
        this.send(socket, "EVENT_RESULTS", { public_revision: revision, rounds: [], next_cursor: null, resync_required: true }); return;
      }
      offset = Number(match[2]);
    }
    const limit = Math.min(Number.isInteger(rawLimit) && (rawLimit ?? 0) > 0 ? rawLimit! : HOST_EVENT_RESULTS_PAGE_SIZE, HOST_EVENT_RESULTS_PAGE_SIZE);
    const page = rounds.slice(offset, offset + limit);
    const snap = this.stateMachine.toSnapshot();
    this.send(socket, "EVENT_RESULTS", { public_revision: revision, rounds: page,
      ...(snap.overall_results === undefined ? {} : { overall_results: snap.overall_results }),
      next_cursor: offset + page.length < rounds.length ? `${revision}:${offset + page.length}` : null, resync_required: false });
  }

  private async persist(): Promise<void> { await this.state.storage.put(EVENT_ROOM_RECORD_STORAGE_KEY, this.stateMachine.toPersistenceRecord()); }
  private async commit(before: EventRoomStatePersistenceRecord, compensate = true): Promise<void> {
    try {
      await this.persist();
    } catch (persistError) {
      this.stateMachine.hydrate(before);
      throw persistError;
    }
    try {
      if (compensate) await this.syncAlarm();
      else await this.syncAlarmWithRetry();
    } catch (alarmError) {
      if (!compensate) throw new AlarmSyncAfterPersistError();
      try {
        await this.state.storage.put(EVENT_ROOM_RECORD_STORAGE_KEY, before);
        this.stateMachine.hydrate(before);
        await this.syncAlarm();
      } catch {
        // The new record may already be durable. Keep its idempotency entry in memory so retry is safe.
      }
      throw alarmError;
    }
  }
  private async syncAlarm(): Promise<void> {
    const snapshot = this.stateMachine.toSnapshot();
    const host = this.stateMachine.getNextAlarmAt()?.getTime() ?? Infinity;
    const cleanup = snapshot.ended_at === null ? Infinity : Date.parse(snapshot.ended_at) + HOST_EVENT_CLOSED_RETENTION_SECONDS * 1_000;
    const next = Math.min(host, cleanup);
    if (Number.isFinite(next)) await this.state.storage.setAlarm(next); else await this.state.storage.deleteAlarm();
  }
  private async syncAlarmWithRetry(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { await this.syncAlarm(); return; } catch (error) { lastError = error; }
    }
    throw lastError;
  }
  private async ensureRestoredAlarm(): Promise<void> {
    try {
      await this.syncAlarmWithRetry();
    } catch { /* absolute deadline remains durable and is re-evaluated on restore/request/alarm */ }
  }
  private async expireBeforeRequest(): Promise<void> {
    if (!this.isInitialized()) return;
    const before = this.stateMachine.toPersistenceRecord();
    if (!this.stateMachine.expireHostDeadline(new Date())) return;
    await this.commit(before, false);
    this.broadcastState();
  }
  private blankAttachment(): Attachment { return { roomKind: "HOST_EVENT", playerId: null, role: null, connectionId: null, attachedAt: null }; }
  private asHibernate(socket: WebSocket): HibernationSocket | null { const value = socket as Partial<HibernationSocket>; return typeof value.serializeAttachment === "function" && typeof value.deserializeAttachment === "function" ? socket as HibernationSocket : null; }
  private readAttachment(socket: WebSocket): Attachment | null { try { const hs = this.asHibernate(socket); return hs === null ? null : parseAttachment(hs.deserializeAttachment()); } catch { return null; } }
  private writeAttachment(session: Session): void { try { this.asHibernate(session.socket)?.serializeAttachment({ roomKind: "HOST_EVENT", playerId: session.playerId, role: session.role, connectionId: session.connectionId, attachedAt: session.attachedAt }); } catch { /* fail closed on restore */ } }
  private rebuildSessions(): void { this.sessions.clear(); this.active.clear(); for (const socket of this.state.getWebSockets()) this.registerSocket(socket); }
  private assignJoinedSession(session: Session, playerId: string): void { session.playerId = playerId; session.role = playerId === this.stateMachine.toSnapshot().host.player_id ? "HOST" : "PLAYER"; session.connectionId = crypto.randomUUID(); session.attachedAt = new Date().toISOString(); this.writeAttachment(session); this.replaceSocket(session); }
  private replaceSocket(session: Session): void { const old = session.playerId === null ? undefined : this.active.get(session.playerId); this.active.set(session.playerId!, session.socket); if (old !== undefined && old !== session.socket) { const prior = this.sessions.get(old); if (prior !== undefined) { prior.playerId = null; prior.role = null; this.writeAttachment(prior); } if (old.readyState === OPEN) old.close(4002, "Replaced by a new connection."); } }
  private send<T extends ServerMessageType>(socket: WebSocket, type: T, payload: ServerMessagePayloadMap[T]): void { if (socket.readyState === OPEN) socket.send(JSON.stringify(createServerEnvelope(this.roomId(), type, payload))); }
  private error(socket: WebSocket, code: string, message: string, requestId?: string): void { this.send(socket, "EVENT_ERROR", { code, message, ...(requestId === undefined ? {} : { request_id: requestId }) }); }
  private broadcastState(): void { if (!this.isInitialized()) return; const payload = { event_room_snapshot: this.stateMachine.toSnapshot() }; for (const session of this.sessions.values()) if (session.playerId !== null && this.active.get(session.playerId) === session.socket) this.send(session.socket, "EVENT_STATE", payload); }
}
