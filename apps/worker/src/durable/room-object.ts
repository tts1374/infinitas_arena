import {
  CHART_DIFFICULTIES,
  CHART_SEARCH_PAGE_SIZE,
  LEVEL_FILTERS,
  MATCH_TTL_MS,
  MAX_PLAYERS_OPTIONS,
  MODES,
  PLAY_STYLES,
  QUICK_CHAT_MAX_COMPOSED_LENGTH,
  READY_CHECK_TTL_MS,
  ROOM_RECREATE_WINDOW_MINUTES,
  SKIP_REASONS,
  SOURCE_TYPES,
  WIN_METRICS,
  type ClientMessage,
  type ErrorCode,
  type ExpectedKey,
  type JsonObject,
  type LobbyRoomSummary,
  type RequestIdPayload,
  type RoomSettings,
  type RoomStateSnapshot,
  type SongUnlockSettings,
  type SkipReason,
  type ServerMessagePayloadMap,
  type ServerMessageType,
} from "@infinitas/shared";
import { normalizeJoinCode } from "../services/join-code";
import { removeLobbyDirectoryRoom, upsertLobbyDirectoryRoom } from "../services/lobby-directory";
import type { WorkerEnv } from "../types/env";
import { asEnumValue, asOptionalString, isRecord, parsePositiveInt } from "../utils/validation";
import { createServerEnvelope, decodeClientMessage } from "./ws-codec";
import {
  RoomLobbyState,
  type PickingTimeoutResult,
  type RoomInitializationInput,
  type RoomStatePersistenceRecord,
  type RoundTransitionResult,
} from "./room-state";
import { workerChartMaster } from "../master/chart-master";
import { EVENT_ROOM_RECORD_STORAGE_KEY, EventRoomController } from "./event-room-controller";
import type { EventRoomStatePersistenceRecord } from "./event-room-state";

type RoomSocketRole = "HOST" | "PLAYER" | "SPECTATOR";
type JoinAcceptedSessionRole = "HOST" | "PLAYER" | "SPECTATOR";

type RoomSocketAttachment = {
  playerId: string | null;
  joinedAt: string | null;
  role: RoomSocketRole | null;
  connectionId: string | null;
  attachedAt: string | null;
};

interface RoomSocketSession {
  socket: WebSocket;
  playerId: string | null;
  joinedAt: string | null;
  role: RoomSocketRole | null;
  connectionId: string | null;
  attachedAt: string | null;
}

interface HibernationWebSocketLike extends WebSocket {
  serializeAttachment(attachment: RoomSocketAttachment): void;
  deserializeAttachment(): unknown;
}

interface SocketCloseContext {
  trigger: "close" | "error";
  code: number | null;
  reason: string | null;
  wasClean: boolean | null;
}

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<unknown>;
  deleteAlarm(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
}

const IDEMPOTENCY_LOG_LIMIT = 300;
const REQUEST_ID_LOG_LIMIT = 300;
const OPEN_WEBSOCKET_STATE = 1;
const SWITCHING_PROTOCOLS_STATUS = 101;
const ROOM_RECORD_STORAGE_KEY = "room-record";
const DEFAULT_MIN_SUPPORTED_CLIENT_VERSION = "1.4.0";
const CLIENT_VERSION_UNSUPPORTED_REASON = "CLIENT_VERSION_UNSUPPORTED";
const CLIENT_VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ROOM_RECREATE_WINDOW_MS = ROOM_RECREATE_WINDOW_MINUTES * 60_000;
const ROOM_STATE_CHANGED_ERROR_MESSAGE = "部屋の状態が変わりました。一覧に戻ってください。";
const SPECTATOR_READ_ONLY_ERROR_MESSAGE = "Spectator sessions are read-only.";
const ROOM_JOIN_SESSION_KINDS = ["PLAYER", "SPECTATOR"] as const;

interface ParsedClientVersion {
  major: number;
  minor: number;
  patch: number;
}

type SeenClientMessageIdsRecord = Record<string, string[]>;

interface RoomDurableRecord {
  room_state: RoomStatePersistenceRecord;
  processed_request_keys: string[];
  seen_client_message_ids?: SeenClientMessageIdsRecord;
  next_event_seq: number;
  share_recruitment_closed?: boolean;
}

type RoomDoLogLevel = "INFO" | "WARN" | "ERROR";
type RoomDoLogOutcome = "ok" | "rejected" | "duplicate" | "ignored" | "error";

interface RoomDoStructuredLog {
  schema_version: 1;
  ts: string;
  level: RoomDoLogLevel;
  component: "room-do";
  event: string;
  room_id: string;
  room_state: RoomStateSnapshot["room_state"] | "(uninitialized)";
  host_player_id?: string | null;
  player_id?: string | null;
  is_host?: boolean | null;
  source?: RoomStateSnapshot["players"][number]["source"] | null;
  message_type?: string | null;
  client_msg_id?: string | null;
  request_id?: string | null;
  round_index?: number | null;
  close_reason?: string | null;
  error_code?: string | null;
  outcome?: RoomDoLogOutcome;
  detail?: JsonObject;
}

interface RoomDoLogInput {
  level?: RoomDoLogLevel;
  event: string;
  player_id?: string | null;
  is_host?: boolean | null;
  source?: RoomDoStructuredLog["source"];
  message_type?: string | null;
  client_msg_id?: string | null;
  request_id?: string | null;
  round_index?: number | null;
  close_reason?: string | null;
  error_code?: string | null;
  outcome?: RoomDoLogOutcome;
  room_state?: RoomDoStructuredLog["room_state"];
  detail?: JsonObject;
}

type RoomDoMessageLogContext = Omit<RoomDoLogInput, "event" | "player_id" | "message_type" | "client_msg_id">;
type RoomDoMessageEventLogInput = Omit<RoomDoLogInput, "player_id" | "message_type" | "client_msg_id">;

type ClientEnvelopeLogContext = {
  type: string;
  player_id: string;
  client_msg_id: string;
};

type InternalJoinRecruitmentStatus = "recruiting" | "full" | "closed";

interface InternalJoinStatusPayload {
  room_name: string;
  recruitment_status: InternalJoinRecruitmentStatus;
  shareable: boolean;
  updated_at: string;
}

function summarizeExpectedKey(expectedKey: ExpectedKey): JsonObject {
  return {
    play_style: expectedKey.play_style,
    difficulty: expectedKey.difficulty,
    title_search_key: expectedKey.title_search_key,
    ...(typeof expectedKey.chart_id === "number" && Number.isInteger(expectedKey.chart_id) && expectedKey.chart_id > 0
      ? { chart_id: expectedKey.chart_id }
      : {}),
  };
}

function normalizeUnknownError(error: unknown): JsonObject {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    value: String(error),
  };
}

function withRoundIndex(roundIndex: number | undefined): Pick<RoomDoLogInput, "round_index"> | Record<string, never> {
  return roundIndex === undefined ? {} : { round_index: roundIndex };
}

function normalizeSeenClientMessageIds(rawMessageIds: unknown[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (let index = rawMessageIds.length - 1; index >= 0; index -= 1) {
    const rawMessageId = rawMessageIds[index];
    if (typeof rawMessageId !== "string") {
      continue;
    }

    if (rawMessageId.trim().length === 0 || seen.has(rawMessageId)) {
      continue;
    }

    seen.add(rawMessageId);
    normalized.push(rawMessageId);
    if (normalized.length >= IDEMPOTENCY_LOG_LIMIT) {
      break;
    }
  }

  normalized.reverse();
  return normalized;
}

function deserializeSeenClientMessageIds(value: unknown): Map<string, Set<string>> {
  const seenClientMessageIds = new Map<string, Set<string>>();
  if (!isRecord(value)) {
    return seenClientMessageIds;
  }

  for (const [rawPlayerId, rawMessageIds] of Object.entries(value)) {
    if (rawPlayerId.trim().length === 0 || !Array.isArray(rawMessageIds)) {
      continue;
    }

    const normalized = normalizeSeenClientMessageIds(rawMessageIds);
    if (normalized.length === 0) {
      continue;
    }

    seenClientMessageIds.set(rawPlayerId, new Set(normalized));
  }

  return seenClientMessageIds;
}

function serializeSeenClientMessageIds(
  seenClientMessageIds: Map<string, Set<string>>,
): SeenClientMessageIdsRecord {
  const serialized: SeenClientMessageIdsRecord = {};
  for (const [rawPlayerId, messageIds] of seenClientMessageIds) {
    if (rawPlayerId.trim().length === 0 || messageIds.size === 0) {
      continue;
    }

    const normalized = normalizeSeenClientMessageIds(Array.from(messageIds));
    if (normalized.length === 0) {
      continue;
    }

    serialized[rawPlayerId] = normalized;
  }
  return serialized;
}

function isWebSocketUpgradeRequest(request: Request): boolean {
  const upgrade = request.headers.get("upgrade");
  return typeof upgrade === "string" && upgrade.toLowerCase() === "websocket";
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function parseChartSearchLimit(rawLimit: string | null): number {
  const parsed = parsePositiveInt(rawLimit);
  if (parsed === undefined) {
    return CHART_SEARCH_PAGE_SIZE;
  }

  return Math.min(parsed, CHART_SEARCH_PAGE_SIZE);
}

function normalizeVisibility(value: unknown): RoomSettings["visibility"] | undefined {
  const parsed = asEnumValue(value, ["PUBLIC", "PRIVATE", "UNLISTED"] as const);
  if (parsed === "UNLISTED") {
    return "PRIVATE";
  }

  return parsed;
}

function parseRoomSettings(value: unknown): RoomSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const visibility = normalizeVisibility(value.visibility);
  const joinCodeRaw = value.join_code;
  const mode = asEnumValue(value.mode, MODES);
  const winMetric = asEnumValue(value.win_metric, WIN_METRICS);
  const playStyle = asEnumValue(value.play_style, PLAY_STYLES);
  const levelFilter = asEnumValue(value.level_filter, LEVEL_FILTERS);
  const roomComment = asOptionalString(value.room_comment);
  const maxPlayers =
    value.max_players === 2 || value.max_players === 3 || value.max_players === 4
      ? value.max_players
      : undefined;

  if (
    visibility === undefined ||
    mode === undefined ||
    winMetric === undefined ||
    playStyle === undefined ||
    levelFilter === undefined ||
    roomComment === undefined ||
    maxPlayers === undefined ||
    !MAX_PLAYERS_OPTIONS.includes(maxPlayers)
  ) {
    return null;
  }

  if (joinCodeRaw !== null && typeof joinCodeRaw !== "string") {
    return null;
  }
  if ("auto_rematch" in value && typeof value.auto_rematch !== "boolean") {
    return null;
  }
  if ("auto_match" in value && typeof value.auto_match !== "boolean") {
    return null;
  }

  return {
    visibility,
    join_code: joinCodeRaw,
    auto_rematch: visibility === "PRIVATE" && value.auto_rematch === true,
    ...(visibility === "PUBLIC" && value.auto_match === true ? { auto_match: true } : {}),
    mode,
    win_metric: winMetric,
    play_style: playStyle,
    level_filter: levelFilter,
    room_comment: roomComment,
    max_players: maxPlayers,
  };
}

function parseInitializationInput(payload: unknown): RoomInitializationInput | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomId = asOptionalString(payload.room_id);
  const createdAt = asOptionalString(payload.created_at);
  const settings = parseRoomSettings(payload.settings);

  if (!roomId || !createdAt || settings === null) {
    return null;
  }

  return {
    room_id: roomId,
    settings,
    created_at: createdAt,
  };
}

interface ParsedRecreateInput {
  room_id: string;
  host_player_id: string;
}

function parseRecreateInput(payload: unknown): ParsedRecreateInput | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomId = asOptionalString(payload.room_id)?.trim() ?? "";
  const hostPlayerId = asOptionalString(payload.host_player_id)?.trim() ?? "";
  if (roomId.length === 0 || hostPlayerId.length === 0) {
    return null;
  }

  return {
    room_id: roomId,
    host_player_id: hostPlayerId,
  };
}

interface ParsedPlayerJoinPayload {
  session_kind: "PLAYER";
  display_name: string;
  source: RoomStateSnapshot["players"][number]["source"];
  join_code?: string;
  client_version?: string;
  song_unlocks: SongUnlockSettings;
}

interface ParsedSpectatorJoinPayload {
  session_kind: "SPECTATOR";
  join_code?: string;
  client_version?: string;
}

type ParsedRoomJoinPayload = ParsedPlayerJoinPayload | ParsedSpectatorJoinPayload;

function parseClientVersion(rawValue: string): ParsedClientVersion | null {
  const match = CLIENT_VERSION_PATTERN.exec(rawValue.trim());
  if (match === null) {
    return null;
  }

  const majorRaw = match[1];
  const minorRaw = match[2];
  const patchRaw = match[3];
  if (majorRaw === undefined || minorRaw === undefined || patchRaw === undefined) {
    return null;
  }

  return {
    major: Number.parseInt(majorRaw, 10),
    minor: Number.parseInt(minorRaw, 10),
    patch: Number.parseInt(patchRaw, 10),
  };
}

function compareClientVersions(left: ParsedClientVersion, right: ParsedClientVersion): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

function formatClientVersion(version: ParsedClientVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function resolveMinSupportedClientVersion(rawValue: unknown): ParsedClientVersion {
  if (typeof rawValue === "string") {
    const parsed = parseClientVersion(rawValue);
    if (parsed !== null) {
      return parsed;
    }
  }

  const fallback = parseClientVersion(DEFAULT_MIN_SUPPORTED_CLIENT_VERSION);
  if (fallback === null) {
    throw new Error("DEFAULT_MIN_SUPPORTED_CLIENT_VERSION must be a valid semantic version.");
  }

  return fallback;
}

function buildUnsupportedClientVersionReason(minSupportedVersion: ParsedClientVersion): string {
  return (
    `${CLIENT_VERSION_UNSUPPORTED_REASON}: ` +
    `このバージョンのクライアントはサポート対象外です。` +
    `v${formatClientVersion(minSupportedVersion)} 以上へアップデートしてください。`
  );
}

function normalizeOwnedPackIds(rawOwnedPackIds: unknown): number[] {
  if (!Array.isArray(rawOwnedPackIds)) {
    return [];
  }

  const deduped = new Set<number>();
  for (const value of rawOwnedPackIds) {
    if (!Number.isInteger(value) || value <= 0) {
      continue;
    }
    deduped.add(value);
  }

  return Array.from(deduped).sort((left, right) => left - right);
}

function parseSongUnlockSettings(rawClientCapabilities: unknown): SongUnlockSettings {
  if (!isRecord(rawClientCapabilities)) {
    return {
      bit_unlocked: false,
      djp_unlocked: false,
      allow_leggendaria: false,
      owned_pack_ids: [],
    };
  }

  const rawSongUnlocks = rawClientCapabilities.song_unlocks;
  if (!isRecord(rawSongUnlocks)) {
    return {
      bit_unlocked: false,
      djp_unlocked: false,
      allow_leggendaria: false,
      owned_pack_ids: [],
    };
  }

  return {
    bit_unlocked: rawSongUnlocks.bit_unlocked === true,
    djp_unlocked: rawSongUnlocks.djp_unlocked === true,
    allow_leggendaria: rawSongUnlocks.allow_leggendaria === true,
    owned_pack_ids: normalizeOwnedPackIds(rawSongUnlocks.owned_pack_ids),
  };
}

function parseRoomJoinPayload(payload: unknown): ParsedRoomJoinPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const sessionKind = asEnumValue(payload.session_kind, ROOM_JOIN_SESSION_KINDS) ?? "PLAYER";
  const joinCode = asOptionalString(payload.join_code);
  const clientVersionRaw = asOptionalString(payload.client_version);
  const clientVersion = clientVersionRaw?.trim() ?? "";

  if (sessionKind === "SPECTATOR") {
    return {
      session_kind: "SPECTATOR",
      ...(clientVersion.length === 0 ? {} : { client_version: clientVersion }),
      ...(joinCode === undefined ? {} : { join_code: joinCode }),
    };
  }

  const displayNameRaw = asOptionalString(payload.display_name);
  const source = asEnumValue(payload.source, SOURCE_TYPES);
  const displayName = displayNameRaw?.trim() ?? "";
  if (displayName.length === 0 || source === undefined) {
    return null;
  }

  return {
    session_kind: "PLAYER",
    display_name: displayName,
    source,
    ...(clientVersion.length === 0 ? {} : { client_version: clientVersion }),
    song_unlocks: parseSongUnlockSettings(payload.client_capabilities),
    ...(joinCode === undefined ? {} : { join_code: joinCode }),
  };
}

function parseGeneration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function parseReadySetPayload(payload: unknown): { ready: boolean; generation: number } | null {
  if (!isRecord(payload) || typeof payload.ready !== "boolean") {
    return null;
  }

  const generation = parseGeneration(payload.generation);
  if (generation === null) {
    return null;
  }

  return {
    ready: payload.ready,
    generation,
  };
}

function parseRequestIdPayload(payload: unknown): RequestIdPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId = asOptionalString(payload.request_id)?.trim() ?? "";
  if (requestId.length === 0) {
    return null;
  }

  return {
    request_id: requestId,
  };
}

function parseRequestIdWithGenerationPayload(payload: unknown): (RequestIdPayload & { generation: number }) | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestIdPayload = parseRequestIdPayload(payload);
  const generation = parseGeneration(payload.generation);
  if (requestIdPayload === null || generation === null) {
    return null;
  }

  return {
    ...requestIdPayload,
    generation,
  };
}

function parseRoomLeavePayload(payload: unknown): { generation: number } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const generation = parseGeneration(payload.generation);
  if (generation === null) {
    return null;
  }

  return { generation };
}

function parseSourceStatusSetPayload(payload: unknown): { request_id: string; available: boolean } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId = asOptionalString(payload.request_id)?.trim() ?? "";
  if (requestId.length === 0 || typeof payload.available !== "boolean") {
    return null;
  }

  return {
    request_id: requestId,
    available: payload.available,
  };
}

function parseQuickChatPostPayload(payload: unknown): { request_id: string; phrase_ids: string[] } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId = asOptionalString(payload.request_id)?.trim() ?? "";
  if (requestId.length === 0 || !Array.isArray(payload.phrase_ids)) {
    return null;
  }

  const phraseIds: string[] = [];
  for (const rawPhraseId of payload.phrase_ids) {
    const phraseId = typeof rawPhraseId === "string" ? rawPhraseId.trim() : "";
    if (phraseId.length === 0) {
      return null;
    }
    phraseIds.push(phraseId);
    if (phraseIds.length > QUICK_CHAT_MAX_COMPOSED_LENGTH) {
      return null;
    }
  }

  return {
    request_id: requestId,
    phrase_ids: phraseIds,
  };
}

function parsePickSubmitPayload(payload: unknown): { request_id: string; pick_chart_key: string } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId = asOptionalString(payload.request_id)?.trim() ?? "";
  const pickChartKeyRaw = asOptionalString(payload.pick_chart_key);
  const pickChartKey = pickChartKeyRaw?.trim() ?? "";
  if (requestId.length === 0 || pickChartKey.length === 0) {
    return null;
  }

  return {
    request_id: requestId,
    pick_chart_key: pickChartKey,
  };
}

function parseExpectedKey(value: unknown): ExpectedKey | null {
  if (!isRecord(value)) {
    return null;
  }

  const playStyle = asEnumValue(value.play_style, PLAY_STYLES);
  const difficulty = asOptionalString(value.difficulty)?.trim() ?? "";
  const titleSearchKey = asOptionalString(value.title_search_key)?.trim() ?? "";
  const chartIdRaw = value.chart_id;
  const chartId =
    typeof chartIdRaw === "number" && Number.isInteger(chartIdRaw) && chartIdRaw > 0
      ? chartIdRaw
      : typeof chartIdRaw === "string" && /^\d+$/.test(chartIdRaw)
        ? Number.parseInt(chartIdRaw, 10)
        : null;

  if (playStyle === undefined || difficulty.length === 0 || titleSearchKey.length === 0) {
    return null;
  }

  return {
    play_style: playStyle,
    difficulty,
    title_search_key: titleSearchKey,
    ...(chartId === null ? {} : { chart_id: chartId }),
  };
}

function parseResultSubmitPayload(
  payload: unknown,
): {
  request_id: string;
  generation: number;
  round_index: number;
  observed_key: ExpectedKey;
  metric_value: number;
  source_meta: JsonObject | null;
} | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId = asOptionalString(payload.request_id)?.trim() ?? "";
  const generation = parseGeneration(payload.generation);
  const roundIndex = typeof payload.round_index === "number" ? payload.round_index : Number.NaN;
  const metricValue = typeof payload.metric_value === "number" ? payload.metric_value : Number.NaN;
  const observedKey = parseExpectedKey(payload.observed_key);
  const sourceMeta = payload.source_meta;
  if (
    requestId.length === 0 ||
    generation === null ||
    !Number.isInteger(roundIndex) ||
    roundIndex < 0 ||
    !Number.isInteger(metricValue) ||
    metricValue < 0 ||
    observedKey === null ||
    (sourceMeta !== undefined && sourceMeta !== null && !isRecord(sourceMeta))
  ) {
    return null;
  }

  return {
    request_id: requestId,
    generation,
    round_index: roundIndex,
    observed_key: observedKey,
    metric_value: metricValue,
    source_meta: sourceMeta === undefined || sourceMeta === null ? null : (sourceMeta as JsonObject),
  };
}

function parseSkipPayload(payload: unknown): { request_id: string; round_index: number; reason: SkipReason } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId = asOptionalString(payload.request_id)?.trim() ?? "";
  const roundIndex = typeof payload.round_index === "number" ? payload.round_index : Number.NaN;
  const reason = asEnumValue(payload.reason, SKIP_REASONS);
  if (requestId.length === 0 || !Number.isInteger(roundIndex) || roundIndex < 0 || reason === undefined) {
    return null;
  }

  return {
    request_id: requestId,
    round_index: roundIndex,
    reason,
  };
}

function parseRoomSocketRole(value: unknown): RoomSocketRole | null {
  if (value === "HOST" || value === "PLAYER" || value === "SPECTATOR") {
    return value;
  }

  return null;
}

function parseRoomSocketAttachment(value: unknown): RoomSocketAttachment | null {
  if (!isRecord(value)) {
    return null;
  }

  const playerId = value.playerId;
  const joinedAt = value.joinedAt;
  const rawRole = value.role;
  const rawConnectionId = value.connectionId;
  const rawAttachedAt = value.attachedAt;
  if ((typeof playerId !== "string" && playerId !== null) || (typeof joinedAt !== "string" && joinedAt !== null)) {
    return null;
  }
  if (
    (typeof rawConnectionId !== "string" && rawConnectionId !== null && rawConnectionId !== undefined) ||
    (typeof rawAttachedAt !== "string" && rawAttachedAt !== null && rawAttachedAt !== undefined)
  ) {
    return null;
  }

  if (rawRole === null) {
    return {
      playerId,
      joinedAt,
      role: null,
      connectionId: typeof rawConnectionId === "string" ? rawConnectionId : null,
      attachedAt: typeof rawAttachedAt === "string" ? rawAttachedAt : null,
    };
  }

  const role = parseRoomSocketRole(rawRole);
  if (role === null) {
    return null;
  }

  return {
    playerId,
    joinedAt,
    role,
    connectionId: typeof rawConnectionId === "string" ? rawConnectionId : null,
    attachedAt: typeof rawAttachedAt === "string" ? rawAttachedAt : null,
  };
}

export class RoomDurableObject {
  private readonly roomState = new RoomLobbyState(workerChartMaster);
  private readonly eventController: EventRoomController;
  private readonly sessionsBySocket = new Map<WebSocket, RoomSocketSession>();
  private readonly activeSocketByPlayerId = new Map<string, WebSocket>();
  private readonly seenClientMessageIds = new Map<string, Set<string>>();
  private readonly processedRequestKeySet = new Set<string>();
  private readonly minSupportedClientVersion: ParsedClientVersion;
  private processedRequestKeys: string[] = [];
  private nextEventSeq = 0;
  private shareRecruitmentClosed = false;
  private readonly readyPromise: Promise<void>;

  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: WorkerEnv,
  ) {
    this.eventController = new EventRoomController(this.state, this.env);
    this.minSupportedClientVersion = resolveMinSupportedClientVersion(this.env.MIN_SUPPORTED_CLIENT_VERSION);
    this.readyPromise = this.state.blockConcurrencyWhile(async () => {
      const record = await this.state.storage.get<RoomDurableRecord>(ROOM_RECORD_STORAGE_KEY);
      const eventRecord = await this.state.storage.get<EventRoomStatePersistenceRecord>(EVENT_ROOM_RECORD_STORAGE_KEY);
      if (record !== undefined && eventRecord !== undefined) {
        await this.eventController.restore({ room_id: eventRecord.room_id, invalid: "dual-room-record" });
        return;
      }
      if (eventRecord !== undefined) {
        await this.eventController.restore(eventRecord);
        return;
      }
      if (record !== undefined) {
        this.roomState.hydrate(record.room_state);
        this.processedRequestKeys = [...record.processed_request_keys];
        for (const key of this.processedRequestKeys) {
          this.processedRequestKeySet.add(key);
        }
        const hydratedSeenClientMessageIds = deserializeSeenClientMessageIds(record.seen_client_message_ids);
        for (const [playerId, messageIds] of hydratedSeenClientMessageIds) {
          this.seenClientMessageIds.set(playerId, messageIds);
        }
        this.nextEventSeq = record.next_event_seq;
        this.shareRecruitmentClosed =
          record.share_recruitment_closed === true || this.roomState.getRoomState() !== "LOBBY";
      }

      this.rebuildSessionsFromWebSockets();
    });
  }

  private buildMessageLogInput(message: ClientEnvelopeLogContext): Omit<RoomDoLogInput, "event">;
  private buildMessageLogInput(
    message: ClientEnvelopeLogContext,
    input: RoomDoMessageLogContext,
  ): Omit<RoomDoLogInput, "event">;
  private buildMessageLogInput(
    message: ClientEnvelopeLogContext,
    input: RoomDoMessageEventLogInput,
  ): RoomDoLogInput;
  private buildMessageLogInput(
    message: ClientEnvelopeLogContext,
    input: RoomDoMessageLogContext | RoomDoMessageEventLogInput = {},
  ): Omit<RoomDoLogInput, "event"> | RoomDoLogInput {
    return {
      player_id: message.player_id,
      message_type: message.type,
      client_msg_id: message.client_msg_id,
      ...input,
    };
  }

  private resolvePlayerSource(playerId: string | null | undefined): RoomDoStructuredLog["source"] | undefined {
    if (!this.roomState.isInitialized() || playerId == null) {
      return undefined;
    }

    const snapshot = this.roomState.toSnapshot();
    const player = snapshot.players.find((entry) => entry.player_id === playerId);
    return player?.source;
  }

  private logRoomEvent(input: RoomDoLogInput): void {
    const roomId = this.roomState.isInitialized() ? this.roomState.getRoomId() : "(uninitialized)";
    const roomState = input.room_state ?? (this.roomState.isInitialized() ? this.roomState.getRoomState() : "(uninitialized)");
    const hostPlayerId = this.roomState.isInitialized() ? this.roomState.getHostPlayerId() : null;
    const playerId = input.player_id;
    const logEntry: RoomDoStructuredLog = {
      schema_version: 1,
      ts: new Date().toISOString(),
      level: input.level ?? "INFO",
      component: "room-do",
      event: input.event,
      room_id: roomId,
      room_state: roomState,
      ...(hostPlayerId === null ? {} : { host_player_id: hostPlayerId }),
      ...(playerId === undefined ? {} : { player_id: playerId }),
      ...(input.is_host === undefined
        ? playerId == null || hostPlayerId == null
          ? {}
          : { is_host: hostPlayerId === playerId }
        : { is_host: input.is_host }),
      ...(input.source === undefined
        ? playerId == null
          ? {}
          : { source: this.resolvePlayerSource(playerId) ?? null }
        : { source: input.source }),
      ...(input.message_type === undefined ? {} : { message_type: input.message_type }),
      ...(input.client_msg_id === undefined ? {} : { client_msg_id: input.client_msg_id }),
      ...(input.request_id === undefined ? {} : { request_id: input.request_id }),
      ...(input.round_index === undefined ? {} : { round_index: input.round_index }),
      ...(input.close_reason === undefined ? {} : { close_reason: input.close_reason }),
      ...(input.error_code === undefined ? {} : { error_code: input.error_code }),
      ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
      ...(input.detail === undefined ? {} : { detail: input.detail }),
    };

    const serialized = JSON.stringify(logEntry);
    switch (logEntry.level) {
      case "ERROR":
        console.error(serialized);
        return;
      case "WARN":
        console.warn(serialized);
        return;
      default:
        console.info(serialized);
    }
  }

  private logTransitionIfChanged(
    previousState: RoomDoStructuredLog["room_state"],
    input: Omit<RoomDoLogInput, "event" | "room_state" | "close_reason"> = {},
  ): void {
    if (!this.roomState.isInitialized()) {
      return;
    }

    const nextState = this.roomState.getRoomState();
    if (previousState === nextState) {
      return;
    }

    const snapshot = this.roomState.toSnapshot();
    this.logRoomEvent({
      ...input,
      event: "fsm.transition",
      room_state: nextState,
      ...(snapshot.close_reason === undefined ? {} : { close_reason: snapshot.close_reason }),
      detail: {
        from_state: previousState,
        to_state: nextState,
        ...(input.detail ?? {}),
      },
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.readyPromise;
    const url = new URL(request.url);

    if (url.pathname === "/internal/init" && request.method === "POST") {
      return this.handleInternalInitialize(request);
    }
    if (url.pathname === "/internal/event-init" && request.method === "POST") {
      return this.handleInternalEventInitialize(request);
    }
    if (url.pathname === "/internal/recreate" && request.method === "POST") {
      return this.handleInternalRecreate(request);
    }
    if (url.pathname === "/join-status") {
      if (request.method !== "GET") {
        return jsonResponse(405, { error: "Method not allowed." });
      }
      return this.handleInternalJoinStatus();
    }
    if (url.pathname === "/internal/lobby-eligibility") {
      if (request.method !== "GET") {
        return jsonResponse(405, { error: "Method not allowed." });
      }
      return this.handleInternalLobbyEligibility();
    }
    if (url.pathname === "/charts") {
      if (request.method !== "GET") {
        return jsonResponse(405, { error: "Method not allowed." });
      }
      return this.eventController.ownsRoom() ? this.eventController.chartSearch(url) : this.handleInternalChartSearch(url);
    }
    if (!isWebSocketUpgradeRequest(request)) {
      return new Response("Expected websocket upgrade request.", { status: 426 });
    }

    const roomIdHeader = request.headers.get("x-room-id");
    const ownedRoomId = this.eventController.ownsRoom() ? this.eventController.roomId() : this.roomState.isInitialized() ? this.roomState.getRoomId() : null;
    if (ownedRoomId !== null && roomIdHeader !== ownedRoomId) {
      return new Response("room_id routing mismatch.", { status: 400 });
    }

    const socketPairCtor = (globalThis as unknown as {
      WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };
    }).WebSocketPair;
    const socketPair = new socketPairCtor();
    const clientSocket = socketPair[0];
    const serverSocket = socketPair[1];

    this.state.acceptWebSocket(serverSocket);
    if (this.eventController.ownsRoom()) {
      this.eventController.registerSocket(serverSocket);
      return new Response(null, { status: SWITCHING_PROTOCOLS_STATUS, webSocket: clientSocket } as ResponseInit);
    }
    const attachment = this.buildInitialSocketAttachment();
    this.writeSocketAttachment(serverSocket, attachment);
    this.registerSocketSession(serverSocket, attachment);

    return new Response(null, {
      status: SWITCHING_PROTOCOLS_STATUS,
      webSocket: clientSocket,
    } as ResponseInit);
  }

  async alarm(): Promise<void> {
    await this.readyPromise;
    if (this.eventController.ownsRoom()) return this.eventController.alarm(new Date());
    await this.processDueTransitions(new Date());
    await this.syncAlarm();
  }

  private async handleInternalEventInitialize(request: Request): Promise<Response> {
    if (this.roomState.isInitialized() || this.eventController.ownsRoom()) return jsonResponse(409, { error: "ROOM_KIND_CONFLICT" });
    let payload: unknown;
    try { payload = await request.json(); } catch { return jsonResponse(400, { error: "Invalid JSON payload." }); }
    if (!isRecord(payload) || typeof payload.room_id !== "string" || typeof payload.created_at !== "string" ||
        typeof payload.host_player_id !== "string" || typeof payload.host_display_name !== "string" || !isRecord(payload.settings)) {
      return jsonResponse(400, { error: "Invalid event room initialization payload." });
    }
    try {
      await this.eventController.initialize(payload as unknown as import("./event-room-state").EventRoomInitializationInput);
      return jsonResponse(200, { ok: true, room_id: payload.room_id });
    } catch (error) { return jsonResponse(400, { error: error instanceof Error ? error.message : "Failed to initialize event room." }); }
  }

  private async handleInternalInitialize(request: Request): Promise<Response> {
    if (this.eventController.ownsRoom()) return jsonResponse(409, { error: "ROOM_KIND_CONFLICT" });
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }

    const parsed = parseInitializationInput(payload);
    if (parsed === null) {
      return jsonResponse(400, { error: "Invalid room initialization payload." });
    }

    try {
      this.roomState.initialize(parsed);
      await this.persistRoomRecord();
      await this.syncAlarm();
      await this.syncLobbyDirectory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize room.";
      return jsonResponse(400, { error: message });
    }

    return jsonResponse(200, {
      ok: true,
      room_id: this.roomState.getRoomId(),
    });
  }

  private async handleInternalRecreate(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }

    const parsed = parseRecreateInput(payload);
    if (parsed === null) {
      return jsonResponse(400, { error: "Invalid room recreate payload." });
    }

    if (!this.roomState.isInitialized()) {
      return jsonResponse(409, { error: "ROOM_STATE_LOST" });
    }

    if (parsed.room_id !== this.roomState.getRoomId()) {
      return jsonResponse(400, { error: "room_id mismatch." });
    }

    const recreateResult = this.roomState.recreateAsLastHost(parsed.host_player_id, new Date(), ROOM_RECREATE_WINDOW_MS);
    if (!recreateResult.ok) {
      return jsonResponse(409, { error: recreateResult.reason ?? "ROOM_RECREATE_REJECTED" });
    }

    this.clearSeenClientMessageIds();
    this.clearProcessedRequestHistory();
    this.shareRecruitmentClosed = false;
    await this.persistRoomRecord();
    await this.syncAlarm();
    await this.syncLobbyDirectory();
    if (this.sessionsBySocket.size > 0) {
      this.disconnectAll(4000, "Room recreated.");
    }
    this.broadcastRoomUpdated();

    const snapshot = this.roomState.toSnapshot();
    return jsonResponse(200, {
      ok: true,
      room_id: snapshot.room_id,
      generation: snapshot.generation ?? this.roomState.getGeneration(),
      created_at: snapshot.created_at ?? new Date().toISOString(),
      settings: snapshot.settings,
    });
  }

  private handleInternalChartSearch(url: URL): Response {
    if (!this.roomState.isInitialized()) {
      return jsonResponse(404, { error: "ROOM_STATE_LOST" });
    }

    const roomState = this.roomState.getRoomState();
    if (roomState !== "PICKING") {
      return jsonResponse(409, { error: "CHART_SEARCH_UNAVAILABLE_IN_CURRENT_STATE" });
    }

    const playStyle = asEnumValue(url.searchParams.get("play_style"), PLAY_STYLES);
    const levelFilter = asEnumValue(url.searchParams.get("level_filter"), LEVEL_FILTERS);
    if (playStyle === undefined || levelFilter === undefined) {
      return jsonResponse(400, { error: "play_style and level_filter are required." });
    }

    const difficulty = asEnumValue(url.searchParams.get("difficulty"), CHART_DIFFICULTIES);
    const level = parsePositiveInt(url.searchParams.get("level"));
    const versionRaw = url.searchParams.get("version");
    const version = versionRaw !== null && versionRaw.trim().length > 0 ? versionRaw.trim() : undefined;
    const keywordRaw = url.searchParams.get("keyword");
    const cursorRaw = url.searchParams.get("cursor");
    const cursor = cursorRaw !== null && cursorRaw.trim().length > 0 ? cursorRaw : undefined;

    const response = this.roomState.searchCharts({
      play_style: playStyle,
      level_filter: levelFilter,
      ...(difficulty === undefined ? {} : { difficulty }),
      ...(level === undefined ? {} : { level }),
      ...(version === undefined ? {} : { version }),
      ...(keywordRaw === null ? {} : { keyword: keywordRaw }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: parseChartSearchLimit(url.searchParams.get("limit")),
    });

    return jsonResponse(200, response);
  }

  private buildInternalJoinStatus(snapshot: RoomStateSnapshot): InternalJoinStatusPayload | null {
    if (snapshot.settings.visibility !== "PUBLIC") {
      return null;
    }

    const currentPlayers = snapshot.players.length;
    const maxPlayers = snapshot.settings.max_players;
    const isFull = currentPlayers >= maxPlayers;
    const inRecruitingLobby = snapshot.room_state === "LOBBY";
    const recruitmentClosed = this.shareRecruitmentClosed || !inRecruitingLobby;
    const recruitmentStatus: InternalJoinRecruitmentStatus =
      recruitmentClosed ? "closed" : isFull ? "full" : "recruiting";

    return {
      room_name: this.deriveLobbyRoomName(snapshot),
      recruitment_status: recruitmentStatus,
      shareable: recruitmentStatus === "recruiting",
      updated_at: new Date().toISOString(),
    };
  }

  private handleInternalJoinStatus(): Response {
    if (!this.roomState.isInitialized()) {
      return jsonResponse(404, { error: "ROOM_STATE_LOST" });
    }

    const snapshot = this.roomState.toSnapshot();
    const payload = this.buildInternalJoinStatus(snapshot);
    if (payload === null) {
      return jsonResponse(404, { error: "NOT_PUBLIC_ROOM" });
    }

    return jsonResponse(200, payload);
  }

  private handleInternalLobbyEligibility(): Response {
    if (!this.roomState.isInitialized()) {
      return jsonResponse(404, { error: "ROOM_STATE_LOST" });
    }

    return jsonResponse(200, {
      eligible: this.isLobbyEligible(this.roomState.toSnapshot()),
    });
  }

  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer | ArrayBufferView,
  ): Promise<void> {
    await this.readyPromise;
    if (this.eventController.ownsRoom()) return this.eventController.message(socket, message);
    await this.handleSocketMessage(socket, message);
  }

  async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    await this.readyPromise;
    if (this.eventController.ownsRoom()) return this.eventController.close(socket);
    await this.handleSocketClose(socket, {
      trigger: "close",
      code,
      reason,
      wasClean,
    });
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    await this.readyPromise;
    if (this.eventController.ownsRoom()) return this.eventController.close(socket);
    const session = this.getOrCreateSocketSession(socket);
    this.logRoomEvent({
      level: "WARN",
      event: "socket.error",
      player_id: session.playerId,
      outcome: "error",
      detail: {
        error: normalizeUnknownError(error),
      },
    });
    await this.handleSocketClose(socket, {
      trigger: "error",
      code: null,
      reason: null,
      wasClean: null,
    });
  }

  private buildInitialSocketAttachment(): RoomSocketAttachment {
    return {
      playerId: null,
      joinedAt: null,
      role: null,
      connectionId: null,
      attachedAt: null,
    };
  }

  private asHibernationSocket(socket: WebSocket): HibernationWebSocketLike | null {
    const maybeSocket = socket as Partial<HibernationWebSocketLike>;
    if (
      typeof maybeSocket.serializeAttachment !== "function" ||
      typeof maybeSocket.deserializeAttachment !== "function"
    ) {
      return null;
    }

    return socket as HibernationWebSocketLike;
  }

  private readSocketAttachment(socket: WebSocket): RoomSocketAttachment {
    const hibernationSocket = this.asHibernationSocket(socket);
    if (hibernationSocket === null) {
      return this.buildInitialSocketAttachment();
    }

    try {
      const parsed = parseRoomSocketAttachment(hibernationSocket.deserializeAttachment());
      if (parsed === null) {
        return this.buildInitialSocketAttachment();
      }

      return parsed;
    } catch {
      return this.buildInitialSocketAttachment();
    }
  }

  private writeSocketAttachment(socket: WebSocket, attachment: RoomSocketAttachment): void {
    const hibernationSocket = this.asHibernationSocket(socket);
    if (hibernationSocket === null) {
      return;
    }

    try {
      hibernationSocket.serializeAttachment(attachment);
    } catch {
      // no-op: attachment sync failure is treated as unjoined fallback on next restore.
    }
  }

  private registerSocketSession(
    socket: WebSocket,
    attachment = this.readSocketAttachment(socket),
  ): RoomSocketSession {
    const session: RoomSocketSession = {
      socket,
      playerId: attachment.playerId,
      joinedAt: attachment.joinedAt,
      role: attachment.role,
      connectionId: attachment.connectionId,
      attachedAt: attachment.attachedAt,
    };
    this.sessionsBySocket.set(socket, session);
    return session;
  }

  private getOrCreateSocketSession(socket: WebSocket): RoomSocketSession {
    const existing = this.sessionsBySocket.get(socket);
    if (existing !== undefined) {
      return existing;
    }

    return this.registerSocketSession(socket);
  }

  private rebuildSessionsFromWebSockets(): void {
    this.sessionsBySocket.clear();
    this.activeSocketByPlayerId.clear();
    for (const socket of this.state.getWebSockets()) {
      this.registerSocketSession(socket);
    }

    this.rebuildActiveSocketIndex();
  }

  private syncSocketAttachment(session: RoomSocketSession): void {
    this.writeSocketAttachment(session.socket, {
      playerId: session.playerId,
      joinedAt: session.joinedAt,
      role: session.role,
      connectionId: session.connectionId,
      attachedAt: session.attachedAt,
    });
  }

  private resolveSocketRole(playerId: string): RoomSocketRole {
    return this.roomState.getHostPlayerId() === playerId ? "HOST" : "PLAYER";
  }

  private isSpectatorAllowedMessage(type: string): boolean {
    return type === "ROOM_JOIN" || type === "ROOM_LEAVE" || type === "STATE_GET" || type === "PING";
  }

  private redactSnapshotForSpectator(snapshot: RoomStateSnapshot): RoomStateSnapshot {
    if (snapshot.settings.join_code === null) {
      return snapshot;
    }

    return {
      ...snapshot,
      settings: {
        ...snapshot.settings,
        join_code: null,
      },
    };
  }

  private buildSnapshotForSession(
    session: RoomSocketSession | undefined,
    baseSnapshot: RoomStateSnapshot,
  ): RoomStateSnapshot {
    return session?.role === "SPECTATOR" ? this.redactSnapshotForSpectator(baseSnapshot) : baseSnapshot;
  }

  private resolveJoinAcceptedSessionRole(
    session: RoomSocketSession,
    fallbackPlayerId: string,
  ): JoinAcceptedSessionRole {
    if (session.role === "HOST" || session.role === "PLAYER" || session.role === "SPECTATOR") {
      return session.role;
    }

    return this.resolveSocketRole(fallbackPlayerId);
  }

  private parseAttachmentTimestamp(value: string | null): number {
    if (typeof value !== "string") {
      return Number.NEGATIVE_INFINITY;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  }

  private rebuildActiveSocketIndex(): void {
    this.activeSocketByPlayerId.clear();
    const newestAttachedAtByPlayerId = new Map<string, number>();

    for (const session of this.sessionsBySocket.values()) {
      if (session.playerId === null || session.role === "SPECTATOR") {
        continue;
      }

      const attachedAt = this.parseAttachmentTimestamp(session.attachedAt);
      const knownAttachedAt = newestAttachedAtByPlayerId.get(session.playerId) ?? Number.NEGATIVE_INFINITY;
      if (attachedAt >= knownAttachedAt) {
        newestAttachedAtByPlayerId.set(session.playerId, attachedAt);
        this.activeSocketByPlayerId.set(session.playerId, session.socket);
      }
    }
  }

  private isCurrentSocketForPlayer(playerId: string, socket: WebSocket): boolean {
    return this.activeSocketByPlayerId.get(playerId) === socket;
  }

  private clearActiveSocketForPlayer(playerId: string, socket: WebSocket): void {
    if (this.activeSocketByPlayerId.get(playerId) === socket) {
      this.activeSocketByPlayerId.delete(playerId);
    }
  }

  private clearSessionPlayerBinding(session: RoomSocketSession): void {
    if (session.playerId !== null) {
      this.clearActiveSocketForPlayer(session.playerId, session.socket);
    }

    session.playerId = null;
    session.joinedAt = null;
    session.role = null;
    session.connectionId = null;
    session.attachedAt = null;
    this.syncSocketAttachment(session);
  }

  private assignSessionToPlayer(session: RoomSocketSession, playerId: string, joinedAt: string, attachedAt: string): void {
    session.playerId = playerId;
    session.joinedAt = joinedAt;
    session.role = this.resolveSocketRole(playerId);
    session.connectionId = crypto.randomUUID();
    session.attachedAt = attachedAt;
    this.syncSocketAttachment(session);
    this.activeSocketByPlayerId.set(playerId, session.socket);
  }

  private assignSessionToSpectator(
    session: RoomSocketSession,
    spectatorId: string,
    attachedAt: string,
  ): void {
    session.playerId = spectatorId;
    session.joinedAt = attachedAt;
    session.role = "SPECTATOR";
    session.connectionId = crypto.randomUUID();
    session.attachedAt = attachedAt;
    this.syncSocketAttachment(session);
  }

  private replacePlayerSocket(playerId: string, currentSession: RoomSocketSession): void {
    for (const session of this.sessionsBySocket.values()) {
      if (session.socket === currentSession.socket || session.playerId !== playerId) {
        continue;
      }

      this.clearSessionPlayerBinding(session);
      this.safeCloseSocket(session.socket, 4002, "Replaced by a new connection.");
    }
  }

  private async handleSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer | ArrayBufferView,
  ): Promise<void> {
    const session = this.getOrCreateSocketSession(socket);
    let messageContext: ClientEnvelopeLogContext | null = null;
    try {
      if (typeof data !== "string") {
        this.sendError(socket, "INVALID_STATE", "Only text messages are supported.", {
          player_id: session.playerId,
          detail: {
            validation: "non_text_payload",
          },
        });
        return;
      }

      const decoded = decodeClientMessage(data);
      if (!decoded.ok) {
        this.sendError(socket, "INVALID_STATE", decoded.error, {
          player_id: session.playerId,
          detail: {
            validation: "decode_failed",
          },
        });
        return;
      }

      const message = decoded.message;
      messageContext = message;
      if (
        message.client_msg_id.trim().length === 0 ||
        message.player_id.trim().length === 0 ||
        message.room_id.trim().length === 0
      ) {
        this.sendError(socket, "INVALID_STATE", "Envelope fields must not be empty.", this.buildMessageLogInput(message, {
          detail: {
            validation: "empty_envelope_field",
          },
        }));
        return;
      }

      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.recv",
        outcome: "ok",
      }));

      if (this.roomState.isInitialized() && message.room_id !== this.roomState.getRoomId()) {
        this.sendError(socket, "INVALID_STATE", "room_id does not match this room.", this.buildMessageLogInput(message, {
          detail: {
            validation: "room_id_mismatch",
            observed_room_id: message.room_id,
          },
        }));
        return;
      }

      if (session.playerId !== null && session.playerId !== message.player_id) {
        this.sendError(socket, "INVALID_STATE", "player_id mismatch on this socket.", this.buildMessageLogInput(message, {
          detail: {
            validation: "player_id_mismatch",
            session_player_id: session.playerId,
          },
        }));
        return;
      }

      if (await this.processDueTransitions(new Date())) {
        return;
      }

      if (this.isDuplicateMessage(message.player_id, message.client_msg_id)) {
        this.logRoomEvent(this.buildMessageLogInput(message, {
          event: "ws.duplicate",
          outcome: "duplicate",
        }));
        return;
      }
      await this.persistRoomRecord();

      if (message.type !== "ROOM_JOIN" && session.playerId === null) {
        this.sendError(socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
        return;
      }

      if (session.role === "SPECTATOR" && !this.isSpectatorAllowedMessage(message.type)) {
        this.sendError(socket, "INVALID_STATE", SPECTATOR_READ_ONLY_ERROR_MESSAGE, this.buildMessageLogInput(message, {
          detail: {
            validation: "spectator_read_only",
            rejected_type: message.type,
          },
        }));
        return;
      }

      switch (message.type) {
        case "ROOM_JOIN":
          await this.handleRoomJoin(session, message as ClientMessage<"ROOM_JOIN">);
          return;
        case "ROOM_LEAVE":
          await this.handleRoomLeaveMessage(session, message as ClientMessage<"ROOM_LEAVE">);
          return;
        case "READY_SET":
          await this.handleReadySet(session, message as ClientMessage<"READY_SET">);
          return;
        case "START_MATCH":
          await this.handleStartMatch(session, message as ClientMessage<"START_MATCH">);
          return;
        case "RETURN_TO_LOBBY":
          await this.handleReturnToLobby(session, message as ClientMessage<"RETURN_TO_LOBBY">);
          return;
        case "AUTO_REMATCH_STOP":
          await this.handleAutoRematchStop(session, message as ClientMessage<"AUTO_REMATCH_STOP">);
          return;
        case "AUTO_REMATCH_OPT_OUT":
          await this.handleAutoRematchOptOut(session, message as ClientMessage<"AUTO_REMATCH_OPT_OUT">);
          return;
        case "SOURCE_STATUS_SET":
          await this.handleSourceStatusSet(session, message as ClientMessage<"SOURCE_STATUS_SET">);
          return;
        case "QUICK_CHAT_POST":
          await this.handleQuickChatPost(session, message as ClientMessage<"QUICK_CHAT_POST">);
          return;
        case "PICK_SUBMIT":
          await this.handlePickSubmit(session, message as ClientMessage<"PICK_SUBMIT">);
          return;
        case "RESULT_SUBMIT":
          await this.handleResultSubmit(session, message as ClientMessage<"RESULT_SUBMIT">);
          return;
        case "SKIP_SELF":
          await this.handleSkipSelf(session, message as ClientMessage<"SKIP_SELF">);
          return;
        case "SKIP_HOST_ASSIGN":
          await this.handleSkipHostAssign(session, message as ClientMessage<"SKIP_HOST_ASSIGN">);
          return;
        case "FORCE_ADVANCE":
          await this.handleForceAdvance(session, message as ClientMessage<"FORCE_ADVANCE">);
          return;
        case "STATE_GET":
          this.sendStateSnapshot(socket);
          return;
        case "PING":
          // Keepalive heartbeat is accepted for active phases and answered with PONG.
          this.send(socket, "PONG", {});
          return;
        default:
          this.sendError(
            socket,
            "INVALID_STATE",
            `Message type ${message.type} is unavailable in ${this.roomState.getRoomState()}.`,
            this.buildMessageLogInput(message),
          );
      }
    } catch (error) {
      if (messageContext === null) {
        this.sendError(socket, "INVALID_STATE", "Failed to process message.", {
          level: "ERROR",
          outcome: "error",
          player_id: session.playerId,
          detail: {
            error: normalizeUnknownError(error),
          },
        });
      } else {
        this.sendError(
          socket,
          "INVALID_STATE",
          "Failed to process message.",
          this.buildMessageLogInput(messageContext, {
            level: "ERROR",
            outcome: "error",
            detail: {
              error: normalizeUnknownError(error),
            },
          }),
        );
      }
    }
  }

  private async handleSocketClose(
    socket: WebSocket,
    context: SocketCloseContext,
  ): Promise<void> {
    const session = this.getOrCreateSocketSession(socket);
    const playerId = session.playerId;
    const isCurrentSocket = playerId !== null && this.isCurrentSocketForPlayer(playerId, socket);
    this.logRoomEvent({
      event: "socket.close",
      player_id: playerId,
      outcome: "ok",
      detail: {
        trigger: context.trigger,
        code: context.code,
        reason: context.reason,
        was_clean: context.wasClean,
        active_socket_count: this.sessionsBySocket.size,
        is_current_socket: isCurrentSocket,
        connection_id: session.connectionId,
      },
    });

    this.sessionsBySocket.delete(socket);
    if (session.role === "SPECTATOR") {
      return;
    }

    if (playerId === null || !isCurrentSocket) {
      return;
    }

    this.clearActiveSocketForPlayer(playerId, socket);
    const leaveResult = this.roomState.markPlayerDisconnected(playerId, new Date());
    if (!leaveResult.changed) {
      return;
    }

    await this.persistRoomRecord();
    await this.syncAlarm();
    await this.syncLobbyDirectory();
    this.broadcastRoomUpdated();
  }

  private async handleRoomJoin(session: RoomSocketSession, message: ClientMessage<"ROOM_JOIN">): Promise<void> {
    if (!this.roomState.isInitialized()) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        level: "ERROR",
        event: "state.loss",
        error_code: "ROOM_STATE_LOST",
        outcome: "error",
        detail: {
          operation: "ROOM_JOIN",
        },
      }));
      this.sendJoinRejected(session.socket, "ROOM_STATE_LOST", this.buildMessageLogInput(message, {
        level: "ERROR",
        outcome: "error",
      }));
      return;
    }

    const isCurrentPlayerSession =
      session.playerId === message.player_id &&
      session.role !== "SPECTATOR" &&
      this.roomState.isPlayerConnected(message.player_id) &&
      this.isCurrentSocketForPlayer(message.player_id, session.socket);
    const isCurrentSpectatorSession = session.playerId === message.player_id && session.role === "SPECTATOR";

    if (isCurrentPlayerSession || isCurrentSpectatorSession) {
      const snapshot = this.roomState.toSnapshot();
      this.send(session.socket, "ROOM_JOIN_ACCEPTED", {
        room_state_snapshot: this.buildSnapshotForSession(session, snapshot),
        session_role: session.role ?? this.resolveSocketRole(message.player_id),
      });
      this.sendResultReadyIfAvailable(session.socket);
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "room.join",
        outcome: "ignored",
        detail: {
          join_type: "CURRENT_SESSION",
        },
      }));
      return;
    }

    const payload = parseRoomJoinPayload(message.payload);
    if (payload === null) {
      this.sendJoinRejected(session.socket, "INVALID_JOIN_PAYLOAD", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_join_payload",
        },
      }));
      return;
    }

    if (payload.session_kind === "PLAYER") {
      if (payload.source === "inf_daken_counter") {
        this.sendJoinRejected(
          session.socket,
          "SOURCE_DEPRECATED",
          this.buildMessageLogInput(message, {
            source: payload.source,
            detail: {
              validation: "source_deprecated",
            },
          }),
        );
        return;
      }
    }

    const parsedClientVersion =
      payload.client_version === undefined ? null : parseClientVersion(payload.client_version);
    if (
      parsedClientVersion === null ||
      compareClientVersions(parsedClientVersion, this.minSupportedClientVersion) < 0
    ) {
      this.sendJoinRejected(
        session.socket,
        buildUnsupportedClientVersionReason(this.minSupportedClientVersion),
        this.buildMessageLogInput(message, {
          ...(payload.session_kind === "PLAYER" ? { source: payload.source } : {}),
          detail: {
            validation: "client_version_unsupported",
            client_version: payload.client_version ?? null,
            min_supported_client_version: formatClientVersion(this.minSupportedClientVersion),
          },
        }),
      );
      return;
    }

    const settings = this.roomState.getSettings();
    if (settings.visibility === "PRIVATE") {
      const expectedJoinCode = normalizeJoinCode(settings.join_code);
      const observedJoinCode = normalizeJoinCode(payload.join_code);
      if (expectedJoinCode === null || observedJoinCode !== expectedJoinCode) {
        this.sendJoinRejected(session.socket, "JOIN_CODE_INVALID", this.buildMessageLogInput(message, {
          ...(payload.session_kind === "PLAYER" ? { source: payload.source } : {}),
          detail: {
            validation: "join_code_invalid",
          },
        }));
        return;
      }
    }

    if (payload.session_kind === "SPECTATOR") {
      const attachedAt = new Date().toISOString();
      this.assignSessionToSpectator(session, message.player_id, attachedAt);
      const snapshot = this.roomState.toSnapshot();
      this.send(session.socket, "ROOM_JOIN_ACCEPTED", {
        room_state_snapshot: this.buildSnapshotForSession(session, snapshot),
        session_role: this.resolveJoinAcceptedSessionRole(session, message.player_id),
      });
      this.sendResultReadyIfAvailable(session.socket);
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "room.join",
        outcome: "ok",
        detail: {
          join_type: "SPECTATOR",
          attached_at: attachedAt,
        },
      }));
      return;
    }

    const now = new Date();
    const previousState = this.roomState.getRoomState();
    const joinResult = this.roomState.joinPlayer({
      player_id: message.player_id,
      display_name: payload.display_name,
      source: payload.source,
      song_unlocks: payload.song_unlocks,
      now,
    });
    if (!joinResult.ok) {
      this.sendJoinRejected(
        session.socket,
        joinResult.reason ?? "ROOM_JOIN_REJECTED",
        this.buildMessageLogInput(message, {
          source: payload.source,
          detail: {
            join_reason: joinResult.reason ?? "ROOM_JOIN_REJECTED",
          },
        }),
      );
      return;
    }

    const snapshot = this.roomState.toSnapshot();
    const joinedPlayer = snapshot.players.find((player) => player.player_id === message.player_id);
    const attachedAt = now.toISOString();
    const joinedAt = typeof joinedPlayer?.joined_at === "string"
      ? joinedPlayer.joined_at
      : attachedAt;
    this.assignSessionToPlayer(session, message.player_id, joinedAt, attachedAt);
    this.replacePlayerSocket(message.player_id, session);
    await this.persistRoomRecord();
    await this.syncAlarm();
    await this.syncLobbyDirectory();

    this.send(session.socket, "ROOM_JOIN_ACCEPTED", {
      room_state_snapshot: snapshot,
      session_role: this.resolveJoinAcceptedSessionRole(session, message.player_id),
    });
    this.sendResultReadyIfAvailable(session.socket);
    if (previousState === "LOBBY" && snapshot.room_state === "PICKING" && snapshot.settings.auto_match === true) {
      this.broadcast("ROOM_NOTIFICATION", {
        kind: "match_found",
        event_id: this.nextEventId("match_found"),
        scheduled_at: new Date().toISOString(),
      });
      this.logTransitionIfChanged(previousState, this.buildMessageLogInput(message, {
        source: payload.source,
        outcome: "ok",
        detail: {
          trigger: "auto_match_start",
          join_type: joinResult.join_type,
          joined_at: joinedAt,
          attached_at: attachedAt,
        },
      }));
    }
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "room.join",
      source: payload.source,
      outcome: "ok",
      detail: {
        join_type: joinResult.join_type,
        joined_at: joinedAt,
        attached_at: attachedAt,
      },
    }));
    this.broadcastRoomUpdated();
  }

  private async handleRoomLeaveMessage(session: RoomSocketSession, message: ClientMessage<"ROOM_LEAVE">): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    if (session.role === "SPECTATOR") {
      await this.handleRoomLeave(session, true);
      return;
    }

    const payload = parseRoomLeavePayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "ROOM_LEAVE payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_room_leave_payload",
        },
      }));
      return;
    }

    if (!this.ensureGenerationMatch(session, message, payload.generation)) {
      return;
    }

    await this.handleRoomLeave(session, true);
  }

  private async handleRoomLeave(session: RoomSocketSession, closeSocket: boolean): Promise<void> {
    const playerId = session.playerId;
    const role = session.role;
    const previousState = this.roomState.isInitialized() ? this.roomState.getRoomState() : "(uninitialized)";
    this.clearSessionPlayerBinding(session);

    if (playerId === null) {
      if (closeSocket) {
        this.safeCloseSocket(session.socket, 1000, "Left room.");
      }
      return;
    }

    if (role === "SPECTATOR") {
      this.logRoomEvent({
        event: "room.leave",
        player_id: playerId,
        outcome: "ok",
        detail: {
          close_socket: closeSocket,
          leave_reason: "SPECTATOR_LEFT",
          was_host: false,
          room_was_closed: false,
        },
      });
      if (closeSocket) {
        this.safeCloseSocket(session.socket, 1000, "Left room.");
      }
      return;
    }

    const leaveReason = closeSocket ? "HOST_ABORTED" : "HOST_DISCONNECTED";
    const leaveResult = this.roomState.leavePlayer(
      playerId,
      new Date(),
      leaveReason,
    );
    this.logRoomEvent({
      event: "room.leave",
      player_id: playerId,
      outcome: "ok",
      detail: {
        close_socket: closeSocket,
        leave_reason: leaveReason,
        was_host: leaveResult.was_host,
        room_was_closed: leaveResult.room_was_closed,
      },
    });
    if (!leaveResult.changed) {
      if (closeSocket) {
        this.safeCloseSocket(session.socket, 1000, "Left room.");
      }
      return;
    }

    if (leaveResult.was_host && !leaveResult.room_was_closed) {
      await this.persistRoomRecord();
      await this.syncAlarm();
      if (this.roomState.getRoomState() === "CLOSED") {
        await this.clearAlarm();
        this.logTransitionIfChanged(previousState, {
          player_id: playerId,
          outcome: "ok",
          detail: {
            trigger: "room_leave",
            leave_reason: leaveReason,
          },
        });
        this.broadcastRoomClosed(true);
        await this.removeLobbyDirectoryEntry();
        this.disconnectAll(4000, closeSocket ? "Host left." : "Host disconnected.");
        return;
      }

      await this.syncLobbyDirectory();
      this.broadcastRoomUpdated();
      return;
    }

    await this.persistRoomRecord();
    await this.syncAlarm();
    await this.syncLobbyDirectory();
    this.broadcastRoomUpdated();
    if (closeSocket) {
      this.safeCloseSocket(session.socket, 1000, "Left room.");
    }
  }

  private ensureGenerationMatch(
    session: RoomSocketSession,
    message: ClientEnvelopeLogContext,
    observedGeneration: number,
    input: RoomDoMessageLogContext = {},
  ): boolean {
    const currentGeneration = this.roomState.getGeneration();
    if (observedGeneration === currentGeneration) {
      return true;
    }

    this.sendError(
      session.socket,
      "INVALID_STATE",
      ROOM_STATE_CHANGED_ERROR_MESSAGE,
      this.buildMessageLogInput(message, {
        ...input,
        detail: {
          ...(input.detail ?? {}),
          reason: "STALE_GENERATION",
          observed_generation: observedGeneration,
          current_generation: currentGeneration,
        },
      }),
    );
    return false;
  }

  private async handleReadySet(session: RoomSocketSession, message: ClientMessage<"READY_SET">): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseReadySetPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "READY_SET payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_ready_set_payload",
        },
      }));
      return;
    }

    if (!this.ensureGenerationMatch(session, message, payload.generation)) {
      return;
    }

    const result = this.roomState.setPlayerReady(session.playerId, payload.ready);
    if (!result.ok) {
      this.sendError(session.socket, "INVALID_STATE", "READY_SET is only available in LOBBY.", this.buildMessageLogInput(message, {
        detail: {
          reason: result.reason ?? "INVALID_STATE",
        },
      }));
      return;
    }

    await this.persistRoomRecord();
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "ready.set",
      outcome: "ok",
      detail: {
        ready: payload.ready,
      },
    }));
    this.broadcast("READY_STATUS_CHANGED", {
      player_id: session.playerId,
      ready: payload.ready,
    });
    this.broadcastRoomUpdated();
  }

  private async handleStartMatch(
    session: RoomSocketSession,
    message: ClientMessage<"START_MATCH">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseRequestIdWithGenerationPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "START_MATCH payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_request_id_payload",
        },
      }));
      return;
    }

    if (!this.ensureGenerationMatch(session, message, payload.generation, {
      request_id: payload.request_id,
    })) {
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const previousState = this.roomState.getRoomState();
    const result = this.roomState.startMatch(session.playerId, new Date());
    if (!result.ok) {
      switch (result.reason) {
        case "NOT_HOST":
          this.sendError(session.socket, "NOT_HOST", "Only the host can start the match.", this.buildMessageLogInput(message, {
            request_id: payload.request_id,
          }));
          return;
        case "AUTO_MATCH_ROOM_LOCKED":
          this.sendStartMatchRejected(session.socket, "AUTO_MATCH_ROOM_LOCKED", this.buildMessageLogInput(message, {
            request_id: payload.request_id,
            detail: {
              reason: result.reason,
            },
          }));
          return;
        case "START_REQUIRES_MIN_PLAYERS":
          this.sendStartMatchRejected(session.socket, "START_REQUIRES_MIN_PLAYERS", this.buildMessageLogInput(message, {
            request_id: payload.request_id,
          }));
          return;
        case "NOT_ALL_PLAYERS_READY":
          this.sendStartMatchRejected(session.socket, "NOT_ALL_PLAYERS_READY", this.buildMessageLogInput(message, {
            request_id: payload.request_id,
          }));
          return;
        case "PREVIOUS_MATCH_NOT_CLEARED":
          this.sendStartMatchRejected(session.socket, "PREVIOUS_MATCH_NOT_CLEARED", this.buildMessageLogInput(message, {
            request_id: payload.request_id,
          }));
          return;
        case "BPL_REQUIRES_TWO_PLAYERS":
          this.sendStartMatchRejected(session.socket, "BPL_REQUIRES_TWO_PLAYERS", this.buildMessageLogInput(message, {
            request_id: payload.request_id,
          }));
          return;
        default:
          this.sendStartMatchRejected(session.socket, "INVALID_STATE", this.buildMessageLogInput(message, {
            request_id: payload.request_id,
          }));
          return;
      }
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    await this.persistRoomRecord();
    await this.syncAlarm();
    await this.syncLobbyDirectory();
    const matchSongUnlockFilter = this.roomState.getMatchSongUnlockFilter();
    this.broadcast("ROOM_NOTIFICATION", {
      kind: "match_found",
      event_id: this.nextEventId("match_found"),
      scheduled_at: new Date().toISOString(),
    });
    this.logTransitionIfChanged(previousState, this.buildMessageLogInput(message, {
      request_id: payload.request_id,
      outcome: "ok",
      detail: {
        trigger: "start_match",
        ...(matchSongUnlockFilter === null
          ? {}
          : {
              match_song_unlock_filter: {
                include_bit: matchSongUnlockFilter.include_bit,
                include_djp: matchSongUnlockFilter.include_djp,
                include_leggendaria: matchSongUnlockFilter.include_leggendaria,
                common_pack_ids: matchSongUnlockFilter.common_pack_ids,
              },
            }),
      },
    }));
    this.broadcastRoomUpdated();
  }

  private async handleReturnToLobby(
    session: RoomSocketSession,
    message: ClientMessage<"RETURN_TO_LOBBY">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseRequestIdWithGenerationPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "RETURN_TO_LOBBY payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_request_id_payload",
        },
      }));
      return;
    }

    if (!this.ensureGenerationMatch(session, message, payload.generation, {
      request_id: payload.request_id,
    })) {
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const previousState = this.roomState.getRoomState();
    const result = this.roomState.returnToLobby(session.playerId, new Date());
    if (!result.ok) {
      if (result.reason === "NOT_HOST") {
        this.sendError(session.socket, "NOT_HOST", "Only the host can return the room to LOBBY.", this.buildMessageLogInput(message, {
          request_id: payload.request_id,
        }));
        return;
      }

      if (result.reason === "AUTO_MATCH_ROOM_LOCKED") {
        this.sendError(session.socket, "INVALID_STATE", "RETURN_TO_LOBBY is unavailable in auto-match rooms.", this.buildMessageLogInput(message, {
          request_id: payload.request_id,
          detail: {
            reason: result.reason,
          },
        }));
        return;
      }

      this.sendError(session.socket, "INVALID_STATE", "RETURN_TO_LOBBY is only available in RESULT.", this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        detail: {
          reason: result.reason ?? "INVALID_STATE",
        },
      }));
      return;
    }

    // Host-initiated room recreation reopens recruitment for the same shared URL.
    this.shareRecruitmentClosed = false;
    this.rememberRequest(session.playerId, message.type, payload.request_id);
    await this.persistRoomRecord();
    await this.syncAlarm();
    await this.syncLobbyDirectory();
    this.logTransitionIfChanged(previousState, this.buildMessageLogInput(message, {
      request_id: payload.request_id,
      outcome: "ok",
      detail: {
        trigger: "return_to_lobby",
      },
    }));
    this.broadcastRoomUpdated();
  }

  private async handleAutoRematchStop(
    session: RoomSocketSession,
    message: ClientMessage<"AUTO_REMATCH_STOP">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseRequestIdPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "AUTO_REMATCH_STOP payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_request_id_payload",
        },
      }));
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const result = this.roomState.stopAutoRematch(session.playerId);
    if (!result.ok) {
      if (result.reason === "NOT_HOST") {
        this.sendError(session.socket, "NOT_HOST", "Only the host can stop auto rematch.", this.buildMessageLogInput(message, {
          request_id: payload.request_id,
        }));
        return;
      }

      this.sendError(session.socket, "INVALID_STATE", "AUTO_REMATCH_STOP is unavailable in the current state.", this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        detail: {
          reason: result.reason ?? "INVALID_STATE",
        },
      }));
      return;
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    await this.persistRoomRecord();
    await this.syncAlarm();
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "auto_rematch.stop",
      request_id: payload.request_id,
      outcome: "ok",
    }));
    this.broadcastRoomUpdated();
  }

  private async handleAutoRematchOptOut(
    session: RoomSocketSession,
    message: ClientMessage<"AUTO_REMATCH_OPT_OUT">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseRequestIdPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "AUTO_REMATCH_OPT_OUT payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_request_id_payload",
        },
      }));
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const result = this.roomState.optOutNextMatch(session.playerId);
    if (!result.ok) {
      this.sendError(session.socket, "INVALID_STATE", "AUTO_REMATCH_OPT_OUT is unavailable in the current state.", this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        detail: {
          reason: result.reason ?? "INVALID_STATE",
        },
      }));
      return;
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    await this.persistRoomRecord();
    await this.syncAlarm();
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "auto_rematch.opt_out",
      request_id: payload.request_id,
      outcome: "ok",
    }));
    this.broadcastRoomUpdated();
  }

  private async handleSourceStatusSet(
    session: RoomSocketSession,
    message: ClientMessage<"SOURCE_STATUS_SET">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseSourceStatusSetPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "SOURCE_STATUS_SET payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_source_status_payload",
        },
      }));
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const result = this.roomState.setPlayerSourceAvailability(session.playerId, payload.available);
    if (!result.ok) {
      this.sendError(session.socket, "INVALID_STATE", "SOURCE_STATUS_SET rejected.", this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        detail: {
          reason: result.reason ?? "INVALID_STATE",
        },
      }));
      return;
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    if (result.changed) {
      await this.persistRoomRecord();
      await this.syncAlarm();
      this.broadcastRoomUpdated();
    }
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "source.status_set",
      request_id: payload.request_id,
      outcome: "ok",
      detail: {
        available: payload.available,
        changed: result.changed,
      },
    }));
  }

  private async handleQuickChatPost(
    session: RoomSocketSession,
    message: ClientMessage<"QUICK_CHAT_POST">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseQuickChatPostPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "QUICK_CHAT_POST payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_quick_chat_post_payload",
        },
      }));
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const result = this.roomState.postQuickChat(session.playerId, payload.phrase_ids, new Date());
    if (!result.ok || result.message === undefined) {
      this.sendError(session.socket, "INVALID_STATE", "QUICK_CHAT_POST is unavailable or invalid.", this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        detail: {
          reason: result.reason ?? "INVALID_STATE",
        },
      }));
      return;
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    await this.persistRoomRecord();
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "quick_chat.post",
      request_id: payload.request_id,
      outcome: "ok",
      detail: {
        message_id: result.message.message_id,
        phrase_count: result.message.phrase_ids.length,
      },
    }));
    this.broadcast("QUICK_CHAT_POSTED", {
      message: result.message,
    });
    this.broadcastRoomUpdated();
  }

  private async handlePickSubmit(session: RoomSocketSession, message: ClientMessage<"PICK_SUBMIT">): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parsePickSubmitPayload(message.payload);
    if (payload === null) {
      this.sendPickRejected(session.socket, "INVALID_PICK_CHART_KEY", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_pick_submit_payload",
        },
      }));
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const previousState = this.roomState.getRoomState();
    const result = this.roomState.submitPick(session.playerId, payload.pick_chart_key, new Date());
    if (!result.ok || result.accepted_pick === undefined) {
      this.sendPickRejected(session.socket, result.reason ?? "PICK_REJECTED", this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        detail: {
          pick_chart_key: payload.pick_chart_key,
        },
      }));
      return;
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    await this.persistRoomRecord();
    this.broadcastAcceptedPick(result.accepted_pick);
    this.broadcastFrozenRoundTransition(result.frozen_rounds, result.round_begin);

    await this.syncAlarm();
    await this.syncLobbyDirectory();
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "pick.submit",
      request_id: payload.request_id,
      outcome: "ok",
      ...withRoundIndex(result.round_begin?.round_index),
      detail: {
        pick_chart_key: result.accepted_pick.pick_chart_key,
        round_started: result.round_begin !== undefined,
      },
    }));
    this.logTransitionIfChanged(previousState, this.buildMessageLogInput(message, {
      request_id: payload.request_id,
      outcome: "ok",
      ...withRoundIndex(result.round_begin?.round_index),
      detail: {
        trigger: result.round_begin === undefined ? "pick_submit" : "pick_submit_complete",
        accepted_pick_chart_key: result.accepted_pick.pick_chart_key,
      },
    }));
    this.broadcastRoomUpdated();
  }

  private async handleResultSubmit(
    session: RoomSocketSession,
    message: ClientMessage<"RESULT_SUBMIT">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseResultSubmitPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "RESULT_SUBMIT payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_result_submit_payload",
        },
      }));
      return;
    }

    if (!this.ensureGenerationMatch(session, message, payload.generation, {
      request_id: payload.request_id,
      round_index: payload.round_index,
    })) {
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        round_index: payload.round_index,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const previousState = this.roomState.getRoomState();
    const result = this.roomState.submitResult(
      session.playerId,
      payload.round_index,
      payload.observed_key,
      payload.metric_value,
      payload.source_meta,
      new Date(),
    );
    if (!result.ok) {
      switch (result.reason) {
        case "RESULT_KEY_MISMATCH": {
          const expectedKey = this.roomState.toSnapshot().current_round?.expected_key ?? null;
          const detail = {
            expected_key: expectedKey === null ? null : summarizeExpectedKey(expectedKey),
            observed_key: summarizeExpectedKey(payload.observed_key),
          };
          this.logRoomEvent(this.buildMessageLogInput(message, {
            level: "WARN",
            event: "round.key_mismatch",
            request_id: payload.request_id,
            round_index: payload.round_index,
            outcome: "rejected",
            detail,
          }));
          this.sendError(
            session.socket,
            "RESULT_KEY_MISMATCH",
            "observed_key does not match current round.",
            this.buildMessageLogInput(message, {
              request_id: payload.request_id,
              round_index: payload.round_index,
              detail,
            }),
          );
          return;
        }
        case "ROUND_ALREADY_CONFIRMED":
          this.sendError(
            session.socket,
            "ROUND_ALREADY_CONFIRMED",
            "Player already confirmed for this round.",
            this.buildMessageLogInput(message, {
              request_id: payload.request_id,
              round_index: payload.round_index,
            }),
          );
          return;
        default:
          this.sendError(
            session.socket,
            "INVALID_STATE",
            "RESULT_SUBMIT is unavailable in the current state.",
            this.buildMessageLogInput(message, {
              request_id: payload.request_id,
              round_index: payload.round_index,
              detail: {
                reason: result.reason ?? "INVALID_STATE",
              },
            }),
          );
          return;
      }
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "round.confirm",
      request_id: payload.request_id,
      round_index: payload.round_index,
      outcome: "ok",
      detail: {
        status: "PLAYED",
        metric_value: payload.metric_value,
        observed_key: summarizeExpectedKey(payload.observed_key),
        confirmation_count: result.confirmations.length,
      },
    }));
    await this.publishRoundTransition(result, {
      ...this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        round_index: payload.round_index,
        outcome: "ok",
        detail: {
          trigger: "result_submit",
        },
      }),
      previous_room_state: previousState,
    });
  }

  private async handleSkipSelf(session: RoomSocketSession, message: ClientMessage<"SKIP_SELF">): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseSkipPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "SKIP_SELF payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_skip_payload",
        },
      }));
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        round_index: payload.round_index,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const previousState = this.roomState.getRoomState();
    const result = this.roomState.skipSelf(session.playerId, payload.round_index, payload.reason, new Date());
    if (!result.ok) {
      switch (result.reason) {
        case "ROUND_ALREADY_CONFIRMED":
          this.sendError(
            session.socket,
            "ROUND_ALREADY_CONFIRMED",
            "Player already confirmed for this round.",
            this.buildMessageLogInput(message, {
              request_id: payload.request_id,
              round_index: payload.round_index,
            }),
          );
          return;
        default:
          this.sendError(
            session.socket,
            "INVALID_STATE",
            "SKIP_SELF is unavailable in the current state.",
            this.buildMessageLogInput(message, {
              request_id: payload.request_id,
              round_index: payload.round_index,
              detail: {
                reason: result.reason ?? "INVALID_STATE",
              },
            }),
          );
          return;
      }
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "round.confirm",
      request_id: payload.request_id,
      round_index: payload.round_index,
      outcome: "ok",
      detail: {
        status: "SKIPPED",
        reason: payload.reason,
        confirmation_count: result.confirmations.length,
      },
    }));
    await this.publishRoundTransition(result, {
      ...this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        round_index: payload.round_index,
        outcome: "ok",
        detail: {
          trigger: "skip_self",
        },
      }),
      previous_room_state: previousState,
    });
  }

  private async handleSkipHostAssign(
    session: RoomSocketSession,
    message: ClientMessage<"SKIP_HOST_ASSIGN">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    this.sendError(session.socket, "INVALID_STATE", "SKIP_HOST_ASSIGN is disabled. Use SKIP_SELF.", this.buildMessageLogInput(message, {
      detail: {
        feature_state: "disabled",
      },
    }));
  }

  private async handleForceAdvance(
    session: RoomSocketSession,
    message: ClientMessage<"FORCE_ADVANCE">,
  ): Promise<void> {
    if (session.playerId === null) {
      this.sendError(session.socket, "INVALID_STATE", "Send ROOM_JOIN before this message.", this.buildMessageLogInput(message));
      return;
    }

    const payload = parseRequestIdPayload(message.payload);
    if (payload === null) {
      this.sendError(session.socket, "INVALID_STATE", "FORCE_ADVANCE payload is invalid.", this.buildMessageLogInput(message, {
        detail: {
          validation: "invalid_request_id_payload",
        },
      }));
      return;
    }

    if (this.isDuplicateRequest(session.playerId, message.type, payload.request_id)) {
      this.logRoomEvent(this.buildMessageLogInput(message, {
        event: "ws.duplicate",
        request_id: payload.request_id,
        outcome: "duplicate",
        detail: {
          dedupe_key: "request_id",
        },
      }));
      this.sendStateSnapshot(session.socket);
      return;
    }

    const previousState = this.roomState.getRoomState();
    const result = this.roomState.forceAdvance(session.playerId, new Date());
    if (!result.ok) {
      switch (result.reason) {
        case "NOT_HOST":
          this.sendError(session.socket, "NOT_HOST", "Only the host can force advance.", this.buildMessageLogInput(message, {
            request_id: payload.request_id,
          }));
          return;
        default:
          this.sendError(
            session.socket,
            "INVALID_STATE",
            "FORCE_ADVANCE is unavailable unless the current round still has unconfirmed players.",
            this.buildMessageLogInput(message, {
              request_id: payload.request_id,
              detail: {
                reason: result.reason ?? "INVALID_STATE",
              },
            }),
          );
          return;
      }
    }

    this.rememberRequest(session.playerId, message.type, payload.request_id);
    this.logRoomEvent(this.buildMessageLogInput(message, {
      event: "round.force_advance",
      request_id: payload.request_id,
      outcome: "ok",
      ...withRoundIndex(result.force_advance_applied?.round_index),
      detail: {
        timed_out_players: result.force_advance_applied?.timed_out_players ?? [],
        confirmation_count: result.confirmations.length,
      },
    }));
    await this.publishRoundTransition(result, {
      ...this.buildMessageLogInput(message, {
        request_id: payload.request_id,
        outcome: "ok",
        ...withRoundIndex(result.force_advance_applied?.round_index),
        detail: {
          trigger: "force_advance",
        },
      }),
      previous_room_state: previousState,
    });
  }

  private sendStateSnapshot(socket: WebSocket): void {
    const session = this.getOrCreateSocketSession(socket);
    const snapshot = this.roomState.toSnapshot();
    this.send(socket, "STATE_SNAPSHOT", {
      room_state_snapshot: this.buildSnapshotForSession(session, snapshot),
    });
    this.sendResultReadyIfAvailable(socket);
  }

  private broadcastRoomUpdated(): void {
    const snapshot = this.roomState.toSnapshot();
    for (const session of this.sessionsBySocket.values()) {
      if (session.playerId === null) {
        continue;
      }

      this.send(session.socket, "ROOM_UPDATED", {
        room_state_snapshot: this.buildSnapshotForSession(session, snapshot),
      });
    }
  }

  private broadcastAcceptedPick(acceptedPick: {
    player_id: string;
    pick_chart_key: string;
    accepted_at: Date;
  }): void {
    this.broadcast("PICK_ACCEPTED", {
      player_id: acceptedPick.player_id,
      pick_chart_key: acceptedPick.pick_chart_key,
      accepted_at: acceptedPick.accepted_at.toISOString(),
    });
  }

  private broadcastFrozenRoundTransition(
    frozenRounds: ServerMessagePayloadMap["PICK_FROZEN"]["frozen_rounds"] | undefined,
    roundBegin: ServerMessagePayloadMap["ROUND_BEGIN"] | undefined,
  ): void {
    if (frozenRounds !== undefined) {
      this.broadcast("PICK_FROZEN", {
        frozen_rounds: frozenRounds,
      });
    }

    if (roundBegin !== undefined) {
      this.broadcast("ROUND_BEGIN", roundBegin);
    }
  }

  private broadcastPickingTimeoutTransition(result: PickingTimeoutResult): void {
    for (const acceptedPick of result.accepted_picks) {
      this.broadcastAcceptedPick(acceptedPick);
    }

    this.broadcastFrozenRoundTransition(result.frozen_rounds, result.round_begin);
  }

  private broadcastRoundTransition(result: RoundTransitionResult): void {
    for (const confirmation of result.confirmations) {
      this.broadcast("PLAYER_ROUND_CONFIRMED", confirmation);
    }

    if (result.force_advance_applied !== undefined) {
      this.broadcast("FORCE_ADVANCE_APPLIED", result.force_advance_applied);
    }

    if (result.round_ended !== undefined) {
      this.broadcast("ROUND_ENDED", result.round_ended);
    }

    if (result.round_begin !== undefined) {
      this.broadcast("ROUND_BEGIN", result.round_begin);
    }

    if (result.result_ready !== undefined) {
      this.broadcast("RESULT_READY", result.result_ready);
    }
  }

  private broadcast<TType extends ServerMessageType>(
    type: TType,
    payload: ServerMessagePayloadMap[TType],
    includeUnjoined = false,
  ): void {
    for (const session of this.sessionsBySocket.values()) {
      if (!includeUnjoined && session.playerId === null) {
        continue;
      }
      if (session.role === "SPECTATOR" && type === "ROOM_UPDATED") {
        const roomUpdatedPayload = payload as ServerMessagePayloadMap["ROOM_UPDATED"];
        this.send(session.socket, type, {
          room_state_snapshot: this.redactSnapshotForSpectator(roomUpdatedPayload.room_state_snapshot),
        } as ServerMessagePayloadMap[TType]);
        continue;
      }
      this.send(session.socket, type, payload);
    }
  }

  private send<TType extends ServerMessageType>(
    socket: WebSocket,
    type: TType,
    payload: ServerMessagePayloadMap[TType],
  ): void {
    if (socket.readyState !== OPEN_WEBSOCKET_STATE) {
      return;
    }

    const roomId = this.roomState.isInitialized() ? this.roomState.getRoomId() : "";
    const envelope = createServerEnvelope(roomId, type, payload);
    socket.send(JSON.stringify(envelope));
  }

  private sendError(
    socket: WebSocket,
    code: ErrorCode,
    message: string,
    input: Omit<RoomDoLogInput, "event" | "error_code"> = {},
  ): void {
    this.logRoomEvent({
      ...input,
      level: input.level ?? (input.outcome === "error" ? "ERROR" : "WARN"),
      event: "ws.reject",
      error_code: code,
      outcome: input.outcome ?? "rejected",
    });
    this.send(socket, "ERROR", { code, message });
  }

  private sendJoinRejected(
    socket: WebSocket,
    reason: string,
    input: Omit<RoomDoLogInput, "event" | "error_code"> = {},
  ): void {
    this.logRoomEvent({
      ...input,
      level: input.level ?? "WARN",
      event: "ws.reject",
      error_code: reason,
      outcome: input.outcome ?? "rejected",
    });
    this.send(socket, "ROOM_JOIN_REJECTED", { reason });
  }

  private sendStartMatchRejected(
    socket: WebSocket,
    reason: string,
    input: Omit<RoomDoLogInput, "event" | "error_code"> = {},
  ): void {
    this.logRoomEvent({
      ...input,
      level: input.level ?? "WARN",
      event: "ws.reject",
      error_code: reason,
      outcome: input.outcome ?? "rejected",
    });
    this.send(socket, "START_MATCH_REJECTED", { reason });
  }

  private sendPickRejected(
    socket: WebSocket,
    reason: string,
    input: Omit<RoomDoLogInput, "event" | "error_code"> = {},
  ): void {
    this.logRoomEvent({
      ...input,
      level: input.level ?? "WARN",
      event: "ws.reject",
      error_code: reason,
      outcome: input.outcome ?? "rejected",
    });
    this.send(socket, "PICK_REJECTED", { reason });
  }

  private sendResultReadyIfAvailable(socket: WebSocket): void {
    const payload = this.roomState.getResultReadyPayload();
    if (payload === null) {
      return;
    }

    this.send(socket, "RESULT_READY", payload);
  }

  private buildRoomClosedPayload(): ServerMessagePayloadMap["ROOM_CLOSED"] {
    const snapshot = this.roomState.toSnapshot();
    if (snapshot.close_reason == null || snapshot.closed_at == null) {
      throw new Error("Closed room snapshot is missing close metadata.");
    }

    return {
      close_reason: snapshot.close_reason,
      closed_at: snapshot.closed_at,
      result_ready: snapshot.result_ready,
      event_id: this.nextEventId(`cancel:${snapshot.close_reason}`),
    };
  }

  private broadcastRoomClosed(includeUnjoined = false): void {
    const payload = this.buildRoomClosedPayload();
    this.logRoomEvent({
      level: "WARN",
      event: "room.close",
      room_state: "CLOSED",
      close_reason: payload.close_reason,
      outcome: "ok",
      detail: {
        closed_at: payload.closed_at,
        include_unjoined: includeUnjoined,
        result_ready: payload.result_ready,
      },
    });
    this.broadcast("ROOM_CLOSED", payload, includeUnjoined);
  }

  private isDuplicateMessage(playerId: string, clientMessageId: string): boolean {
    if (this.hasSeenClientMessageId(playerId, clientMessageId)) {
      return true;
    }

    this.rememberClientMessageId(playerId, clientMessageId);
    return false;
  }

  private hasSeenClientMessageId(playerId: string, clientMessageId: string): boolean {
    const seenIds = this.seenClientMessageIds.get(playerId);
    return seenIds?.has(clientMessageId) ?? false;
  }

  private rememberClientMessageId(playerId: string, clientMessageId: string): void {
    let seenIds = this.seenClientMessageIds.get(playerId);
    if (seenIds === undefined) {
      seenIds = new Set<string>();
      this.seenClientMessageIds.set(playerId, seenIds);
    }

    if (seenIds.has(clientMessageId)) {
      return;
    }

    seenIds.add(clientMessageId);
    while (seenIds.size > IDEMPOTENCY_LOG_LIMIT) {
      const oldest = seenIds.values().next().value;
      if (typeof oldest !== "string") {
        break;
      }

      seenIds.delete(oldest);
    }
  }

  private clearSeenClientMessageIds(): void {
    this.seenClientMessageIds.clear();
  }

  private clearProcessedRequestHistory(): void {
    this.processedRequestKeys = [];
    this.processedRequestKeySet.clear();
  }

  private buildRequestKey(playerId: string, type: string, requestId: string): string {
    return `${playerId}:${type}:${requestId}`;
  }

  private isDuplicateRequest(playerId: string, type: string, requestId: string): boolean {
    return this.processedRequestKeySet.has(this.buildRequestKey(playerId, type, requestId));
  }

  private rememberRequest(playerId: string, type: string, requestId: string): void {
    const key = this.buildRequestKey(playerId, type, requestId);
    if (this.processedRequestKeySet.has(key)) {
      return;
    }

    this.processedRequestKeySet.add(key);
    this.processedRequestKeys.push(key);
    if (this.processedRequestKeys.length > REQUEST_ID_LOG_LIMIT) {
      const removed = this.processedRequestKeys.shift();
      if (removed !== undefined) {
        this.processedRequestKeySet.delete(removed);
      }
    }
  }

  private nextEventId(kind: string): string {
    this.nextEventSeq += 1;
    return `${kind}:${this.roomState.getRoomId()}:${this.nextEventSeq}`;
  }

  private disconnectAll(code: number, reason: string): void {
    const sessions = Array.from(this.sessionsBySocket.values());
    this.sessionsBySocket.clear();
    this.activeSocketByPlayerId.clear();

    for (const session of sessions) {
      this.clearSessionPlayerBinding(session);
      this.safeCloseSocket(session.socket, code, reason);
    }
  }

  private safeCloseSocket(socket: WebSocket, code: number, reason: string): void {
    if (socket.readyState === OPEN_WEBSOCKET_STATE) {
      socket.close(code, reason);
    }
  }

  private async clearAlarm(): Promise<void> {
    await this.state.storage.deleteAlarm();
  }

  private async syncAlarm(): Promise<void> {
    // Keep a single state-derived alarm only for required deadlines/cleanup.
    const nextAlarmAt = this.roomState.getNextAlarmAt();
    if (nextAlarmAt === null) {
      await this.clearAlarm();
      return;
    }

    await this.state.storage.setAlarm(nextAlarmAt);
  }

  private async persistRoomRecord(): Promise<void> {
    if (this.roomState.getRoomState() === "CLOSED") {
      // CLOSED means the room lifecycle ended, so message-level dedupe history is discarded.
      this.clearSeenClientMessageIds();
    }
    if (!this.shareRecruitmentClosed && this.roomState.getRoomState() !== "LOBBY") {
      this.shareRecruitmentClosed = true;
    }

    const record: RoomDurableRecord = {
      room_state: this.roomState.toPersistenceRecord(),
      processed_request_keys: [...this.processedRequestKeys],
      seen_client_message_ids: serializeSeenClientMessageIds(this.seenClientMessageIds),
      next_event_seq: this.nextEventSeq,
      share_recruitment_closed: this.shareRecruitmentClosed,
    };
    await this.state.storage.put(ROOM_RECORD_STORAGE_KEY, record);
  }

  private async publishRoundTransition(
    result: RoundTransitionResult,
    logInput: (Omit<RoomDoLogInput, "event" | "room_state" | "close_reason"> & {
      previous_room_state?: RoomDoStructuredLog["room_state"];
    }) = {},
  ): Promise<void> {
    await this.persistRoomRecord();
    await this.syncAlarm();
    await this.syncLobbyDirectory();
    this.broadcastRoundTransition(result);
    this.broadcastRoomUpdated();
    if (logInput.previous_room_state !== undefined) {
      const { previous_room_state: previousState, ...transitionInput } = logInput;
      this.logTransitionIfChanged(previousState, transitionInput);
    }
    if (this.roomState.getRoomState() === "CLOSED") {
      this.broadcastRoomClosed();
      this.disconnectAll(4000, "Room closed.");
    }
  }

  private async processDueTransitions(now: Date): Promise<boolean> {
    if (await this.closeHostDisconnectOnTimeout(now)) {
      return true;
    }

    if (await this.closeReadyCheckOnTimeout(now)) {
      return true;
    }

    const previousPickingState = this.roomState.getRoomState();
    const pickingTransition = this.roomState.expirePickingIfNeeded(now);
    if (pickingTransition !== null) {
      await this.persistRoomRecord();
      this.broadcastPickingTimeoutTransition(pickingTransition);
      await this.syncAlarm();
      await this.syncLobbyDirectory();
      this.logRoomEvent({
        event: "pick.timeout",
        outcome: "ok",
        ...withRoundIndex(pickingTransition.round_begin?.round_index),
        detail: {
          auto_pick_count: pickingTransition.accepted_picks.length,
          auto_picks: pickingTransition.accepted_picks.map((pick) => ({
            player_id: pick.player_id,
            pick_chart_key: pick.pick_chart_key,
          })),
        },
      });
      this.logTransitionIfChanged(previousPickingState, {
        outcome: "ok",
        ...withRoundIndex(pickingTransition.round_begin?.round_index),
        detail: {
          trigger: "picking_ttl",
          auto_pick_count: pickingTransition.accepted_picks.length,
        },
      });
      this.broadcastRoomUpdated();
      return false;
    }

    const previousMatchState = this.roomState.getRoomState();
    const matchTransition = this.roomState.expireMatchIfNeeded(now);
    if (matchTransition !== null) {
      if (matchTransition.confirmations.length > 0) {
        this.logRoomEvent({
          event: "round.timeout",
          outcome: "ok",
          ...withRoundIndex(matchTransition.confirmations[0]?.round_index),
          detail: {
            trigger: "match_ttl",
            timed_out_players: matchTransition.confirmations.map((confirmation) => confirmation.player_id),
            confirmation_count: matchTransition.confirmations.length,
          },
        });
      }
      await this.publishRoundTransition(matchTransition, {
        previous_room_state: previousMatchState,
        outcome: "ok",
        ...withRoundIndex(matchTransition.confirmations[0]?.round_index),
        detail: {
          trigger: "match_ttl",
        },
      });
      return false;
    }

    const previousAutoRematchState = this.roomState.getRoomState();
    const autoRematchTransition = this.roomState.expireAutoRematchIfNeeded(now);
    if (autoRematchTransition !== null) {
      await this.persistRoomRecord();
      await this.syncAlarm();
      await this.syncLobbyDirectory();
      if (autoRematchTransition.kind === "STARTED") {
        this.broadcast("ROOM_NOTIFICATION", {
          kind: "match_found",
          event_id: this.nextEventId("match_found"),
          scheduled_at: new Date().toISOString(),
        });
        this.logTransitionIfChanged(previousAutoRematchState, {
          outcome: "ok",
          detail: {
            trigger: "auto_rematch_due",
            generation: autoRematchTransition.generation,
            participant_count: autoRematchTransition.participant_player_ids?.length ?? 0,
          },
        });
      } else {
        this.logRoomEvent({
          event: "auto_rematch.cancelled",
          outcome: "ok",
          detail: {
            trigger: "auto_rematch_due",
            generation: autoRematchTransition.generation,
            reason: autoRematchTransition.reason ?? null,
          },
        });
      }
      this.broadcastRoomUpdated();
      return false;
    }

    const previousAutoMatchResultState = this.roomState.getRoomState();
    const autoMatchResultExpired = this.roomState.expireAutoMatchResultIfNeeded(now);
    if (autoMatchResultExpired) {
      await this.persistRoomRecord();
      await this.clearAlarm();
      this.logTransitionIfChanged(previousAutoMatchResultState, {
        level: "WARN",
        outcome: "ok",
        detail: {
          trigger: "auto_match_result_due",
        },
      });
      this.broadcastRoomClosed();
      await this.removeLobbyDirectoryEntry();
      this.disconnectAll(4000, "Auto-match result expired.");
      return true;
    }

    const previousRoundState = this.roomState.getRoomState();
    const roundTransition = this.roomState.expireCurrentRoundIfNeeded(now);
    if (roundTransition !== null) {
      this.logRoomEvent({
        event: "round.timeout",
        outcome: "ok",
        ...withRoundIndex(roundTransition.confirmations[0]?.round_index),
        detail: {
          trigger: "round_ttl",
          timed_out_players: roundTransition.confirmations.map((confirmation) => confirmation.player_id),
          confirmation_count: roundTransition.confirmations.length,
        },
      });
      await this.publishRoundTransition(roundTransition, {
        previous_room_state: previousRoundState,
        outcome: "ok",
        ...withRoundIndex(roundTransition.confirmations[0]?.round_index),
        detail: {
          trigger: "round_ttl",
        },
      });
    }

    return false;
  }

  private async closeHostDisconnectOnTimeout(now: Date): Promise<boolean> {
    const previousState = this.roomState.getRoomState();
    const closed = this.roomState.closeHostDisconnectIfExpired(now);
    if (!closed) {
      return false;
    }

    await this.persistRoomRecord();
    await this.clearAlarm();
    this.logTransitionIfChanged(previousState, {
      level: "WARN",
      outcome: "ok",
      detail: {
        trigger: "host_disconnect_ttl",
      },
    });
    this.broadcastRoomClosed(true);
    await this.removeLobbyDirectoryEntry();
    this.disconnectAll(4000, "Host disconnected.");
    return true;
  }

  private async closeReadyCheckOnTimeout(now: Date): Promise<boolean> {
    const previousState = this.roomState.getRoomState();
    const closed = this.roomState.closeReadyCheckIfExpired(now);
    if (!closed) {
      return false;
    }

    await this.persistRoomRecord();
    await this.clearAlarm();
    this.logTransitionIfChanged(previousState, {
      level: "WARN",
      outcome: "ok",
      detail: {
        trigger: "ready_check_ttl",
      },
    });
    this.broadcastRoomClosed(true);
    await this.removeLobbyDirectoryEntry();
    this.disconnectAll(4001, "Ready check timed out.");
    return true;
  }

  private deriveLobbyRoomName(snapshot: RoomStateSnapshot): string {
    const comment = snapshot.settings.room_comment.trim();
    if (comment.length > 0) {
      return comment;
    }

    return `${snapshot.settings.mode} ${snapshot.settings.play_style}`;
  }

  private resolveLobbyStatus(roomState: RoomStateSnapshot["room_state"]): LobbyRoomSummary["status"] | null {
    switch (roomState) {
      case "LOBBY":
      case "PICKING":
      case "PLAYING":
      case "RESULT":
        return roomState;
      default:
        return null;
    }
  }

  private resolveLobbyTtlStartedAt(snapshot: RoomStateSnapshot, createdAtMs: number): number {
    const parseTimestamp = (value: string | null): number | null => {
      if (value === null) {
        return null;
      }

      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    if (snapshot.room_state === "LOBBY") {
      const readyCheckDeadline = parseTimestamp(snapshot.timers.ready_check_deadline);
      if (readyCheckDeadline !== null) {
        return readyCheckDeadline - READY_CHECK_TTL_MS;
      }
      return createdAtMs;
    }

    const matchDeadline = parseTimestamp(snapshot.timers.match_deadline);
    if (matchDeadline !== null) {
      return matchDeadline - MATCH_TTL_MS;
    }

    return createdAtMs;
  }

  private isLobbyEligible(snapshot: RoomStateSnapshot): boolean {
    if (snapshot.settings.visibility !== "PUBLIC" || snapshot.settings.auto_match === true) {
      return false;
    }

    if (snapshot.room_state !== "LOBBY") {
      return false;
    }

    if (snapshot.players.length >= snapshot.settings.max_players) {
      return false;
    }

    return this.buildLobbySummary(snapshot, Date.now()) !== null;
  }

  private buildLobbySummary(snapshot: RoomStateSnapshot, nowMs: number): LobbyRoomSummary | null {
    if (snapshot.settings.visibility !== "PUBLIC" || snapshot.settings.auto_match === true) {
      return null;
    }

    const status = this.resolveLobbyStatus(snapshot.room_state);
    if (status === null) {
      return null;
    }

    if (typeof snapshot.created_at !== "string") {
      return null;
    }
    const createdAtMs = Date.parse(snapshot.created_at);
    if (!Number.isFinite(createdAtMs)) {
      return null;
    }

    const hostPlayer = snapshot.players.find((player) => player.player_id === snapshot.host_player_id);
    const currentPlayers = snapshot.players.length;
    const maxPlayers = snapshot.settings.max_players;

    return {
      roomId: snapshot.room_id,
      roomName: this.deriveLobbyRoomName(snapshot),
      ownerUserId: hostPlayer?.player_id ?? snapshot.host_player_id,
      ownerDisplayName: hostPlayer?.display_name ?? "",
      mode: snapshot.settings.mode,
      playStyle: snapshot.settings.play_style,
      levelFilter: snapshot.settings.level_filter,
      winMetric: snapshot.settings.win_metric,
      hasJoinCode: snapshot.settings.join_code !== null,
      isPublic: true,
      currentPlayers,
      maxPlayers,
      isFull: currentPlayers >= maxPlayers,
      status,
      ttlStartedAt: this.resolveLobbyTtlStartedAt(snapshot, createdAtMs),
      createdAt: createdAtMs,
      updatedAt: nowMs,
    };
  }

  private async removeLobbyDirectoryEntry(): Promise<void> {
    if (!this.roomState.isInitialized()) {
      return;
    }

    try {
      await removeLobbyDirectoryRoom(this.env, this.roomState.getRoomId());
    } catch {
      // no-op: lobby listing is best-effort from room events
    }
  }

  private async syncLobbyDirectory(): Promise<void> {
    if (!this.roomState.isInitialized()) {
      return;
    }

    const snapshot = this.roomState.toSnapshot();
    const nowMs = Date.now();
    const summary = this.buildLobbySummary(snapshot, nowMs);

    if (summary === null) {
      await this.removeLobbyDirectoryEntry();
      return;
    }

    try {
      await upsertLobbyDirectoryRoom(this.env, summary);
    } catch {
      // no-op: listing will converge on next state update/poll
    }
  }
}
