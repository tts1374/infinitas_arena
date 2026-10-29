import {
  PING_INTERVAL_SECONDS,
  PING_TIMEOUT_MISSES,
  isServerMessageType,
  type ClientMessage,
  type EventJoinPayload,
  type EventRoomAction,
  type EventRoomSnapshot,
  type ServerMessage,
} from "@infinitas/shared";
import clientPackageJson from "../../package.json";
import { isEventSyncAction } from "./event-action-policy";

export type EventSocketState = "CONNECTING" | "JOINING" | "CONNECTED" | "DISCONNECTED";

const APP_VERSION = typeof clientPackageJson.version === "string" ? clientPackageJson.version : "unknown";
const devClients = new Map<string, EventSocketClient>();
const devObservers = new Set<(stage: "sent" | "received", message: unknown) => void>();
export function observeEventTransportForDevControl(observer: (stage: "sent" | "received", message: unknown) => void): () => void {
  devObservers.add(observer); return () => { devObservers.delete(observer); };
}
export function pauseEventTransportForDevControl(roomId: string, playerId: string, paused: boolean): boolean {
  if (import.meta.env?.MODE !== "dev-control") return false;
  const client = devClients.get(`${roomId}:${playerId}`);
  if (!client) return false;
  client.setDevControlPaused(paused);
  return true;
}
const HEARTBEAT_INTERVAL_MS = PING_INTERVAL_SECONDS * 1_000;
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * PING_TIMEOUT_MISSES;
const RECONNECT_DELAY_MS = 1_000;
const EVENT_SERVER_TYPES = new Set([
  "EVENT_JOIN_ACCEPTED",
  "EVENT_STATE",
  "EVENT_ACTION_ACK",
  "EVENT_RESULTS",
  "EVENT_ERROR",
  "PONG",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isTimestamp(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNullableTimestamp(value: unknown): boolean {
  return value === null || isTimestamp(value);
}

function isEventChart(value: unknown): boolean {
  if (!isRecord(value) || typeof value.chart_key !== "string" || !isRecord(value.expected_key) || !isRecord(value.display)) return false;
  return (typeof value.expected_key.play_style === "string" && ["SP", "DP"].includes(String(value.expected_key.play_style))) &&
    typeof value.expected_key.difficulty === "string" && typeof value.expected_key.title_search_key === "string" &&
    (value.expected_key.chart_id === undefined || value.expected_key.chart_id === null ||
      (Number.isInteger(value.expected_key.chart_id) && Number(value.expected_key.chart_id) > 0)) &&
    typeof value.display.title === "string" && (value.display.level === null || isNonNegativeInteger(value.display.level));
}

function isEventRound(value: unknown): boolean {
  return isRecord(value) && typeof value.round_id === "string" && isEventChart(value.chart) &&
    isStringArray(value.playing_player_ids) && isTimestamp(value.started_at) && isTimestamp(value.confirmed_at) &&
    isNullableTimestamp(value.invalidated_at) && isNonNegativeInteger(value.public_revision) &&
    Array.isArray(value.results) && value.results.every((entry) => isRecord(entry) &&
      typeof entry.player_id === "string" && typeof entry.display_name === "string" &&
      (typeof entry.status === "string" && ["SUBMITTED", "ABSENT"].includes(String(entry.status))) &&
      typeof entry.metric_value === "number" && Number.isFinite(entry.metric_value) &&
      (entry.absence_reason === null || (typeof entry.absence_reason === "string" && ["SKIP", "DEADLINE", "LEFT", "KICKED", "NOT_PRESENT"].includes(String(entry.absence_reason)))) &&
      (entry.rank === null || (Number.isInteger(entry.rank) && Number(entry.rank) > 0)) &&
      (entry.tournament_points === undefined || isNonNegativeInteger(entry.tournament_points)) && isTimestamp(entry.confirmed_at));
}

/** Validate the live boundary before accepting a connection or replaying actions. */
export function isSupportedEventSnapshot(value: unknown): value is EventRoomSnapshot {
  if (!isRecord(value) || value.schema_version !== 2 || value.room_kind !== "HOST_EVENT") return false;
  const settings = value.settings;
  const host = value.host;
  return typeof value.room_id === "string" && isNonNegativeInteger(value.generation) &&
    (value.event_id === null || typeof value.event_id === "string") &&
    isNonNegativeInteger(value.revision) && isNonNegativeInteger(value.selection_revision) &&
    (typeof value.phase === "string" && ["LOBBY", "PICKING", "PLAYING", "RESULT", "CLOSED"].includes(String(value.phase))) &&
    (value.round_phase === null || (typeof value.round_phase === "string" && ["ACTIVE", "RESULT"].includes(String(value.round_phase)))) &&
    isRecord(settings) && typeof settings.event_name === "string" &&
    (typeof settings.event_type === "string" && ["CASUAL", "TOURNAMENT"].includes(String(settings.event_type))) && typeof settings.host_plays === "boolean" &&
    (typeof settings.play_style === "string" && (typeof settings.win_metric === "string" && ["SP", "DP"].includes(String(settings.play_style))) && ["SCORE", "MISSCOUNT"].includes(String(settings.win_metric))) &&
    settings.visibility === "PRIVATE" && typeof settings.join_code === "string" &&
    isRecord(host) && typeof host.player_id === "string" && typeof host.display_name === "string" &&
    typeof host.connected === "boolean" && typeof host.plays === "boolean" &&
    Array.isArray(value.participants) && value.participants.every((entry) => isRecord(entry) &&
      typeof entry.player_id === "string" && typeof entry.display_name === "string" &&
      (typeof entry.connection_state === "string" && ["CONNECTED", "DISCONNECTED", "LEFT", "KICKED"].includes(String(entry.connection_state))) &&
      typeof entry.pending_next === "boolean" &&
      (entry.round_status === null || (typeof entry.round_status === "string" && ["PENDING", "SUBMITTED", "SKIPPED", "ABSENT"].includes(String(entry.round_status))))) &&
    isStringArray(value.current_eligible_player_ids) && isStringArray(value.current_playing_player_ids) &&
    isStringArray(value.fixed_roster_player_ids) &&
    (value.scoring_size_n === null || (Number.isInteger(value.scoring_size_n) && Number(value.scoring_size_n) > 0)) &&
    (value.current_round_id === null || typeof value.current_round_id === "string") &&
    (value.selected_chart === null || isEventChart(value.selected_chart)) &&
    (value.latest_result === null || isEventRound(value.latest_result)) &&
    (value.overall_results === undefined || (Array.isArray(value.overall_results) && value.overall_results.every((entry) =>
      isRecord(entry) && typeof entry.player_id === "string" && typeof entry.display_name === "string" &&
      isNonNegativeInteger(entry.total_points) && Number.isInteger(entry.rank) && Number(entry.rank) > 0))) &&
    isNullableTimestamp(value.host_disconnect_deadline) && isNullableTimestamp(value.started_at) &&
    isNullableTimestamp(value.ended_at) &&
    (value.end_reason === null || (typeof value.end_reason === "string" && ["HOST_ENDED", "HOST_DISCONNECTED", "ROOM_STATE_LOST"].includes(String(value.end_reason))));
}

export interface EventSocketClientOptions {
  apiBaseUrl: string;
  roomId: string;
  playerId: string;
  join: Omit<EventJoinPayload, "host_event_protocol" | "client_version">;
  onMessage: (message: ServerMessage) => void;
  onStateChange?: (state: EventSocketState, detail: string) => void;
  onError?: (error: Error) => void;
  onClose?: (event: CloseEvent) => void;
}

function buildWebSocketUrl(baseUrl: string, roomId: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("Worker API URL is required.");
  const url = new URL(`${normalized}/api/rooms/${encodeURIComponent(roomId)}/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class EventSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastServerTrafficAtMs = 0;
  private intentionallyClosed = false;
  private nextReconnectDelayMs = RECONNECT_DELAY_MS;
  private readonly pendingMutationActions = new Map<string, EventRoomAction>();

  constructor(private readonly options: EventSocketClientOptions) {
    if (import.meta.env?.MODE === "dev-control") devClients.set(`${options.roomId}:${options.playerId}`, this);
  }
  setDevControlPaused(paused: boolean): void {
    if (import.meta.env?.MODE !== "dev-control") return;
    if (paused) { this.disconnect(); this.options.onStateChange?.("DISCONNECTED", "Development manual disconnect (automatic reconnect paused)."); }
    else this.connect();
  }

  connect(): void {
    if (this.socket !== null) return;
    this.intentionallyClosed = false;
    this.options.onStateChange?.("CONNECTING", "Opening event WebSocket.");
    const socket = new WebSocket(buildWebSocketUrl(this.options.apiBaseUrl, this.options.roomId));
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.startHeartbeat();
      this.options.onStateChange?.("JOINING", "Sending EVENT_JOIN.");
      const message: ClientMessage<"EVENT_JOIN"> = {
        type: "EVENT_JOIN",
        client_msg_id: crypto.randomUUID(),
        room_id: this.options.roomId,
        player_id: this.options.playerId,
        payload: {
          host_event_protocol: 2,
          client_version: APP_VERSION,
          ...this.options.join,
        },
      };
      socket.send(JSON.stringify(message));
    });
    socket.addEventListener("message", (event) => this.handleMessage(socket, event));
    socket.addEventListener("error", () => this.options.onError?.(new Error("Event WebSocket transport error.")));
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.stopHeartbeat();
      this.socket = null;
      this.options.onStateChange?.("DISCONNECTED", `Event socket closed (${event.code}).`);
      this.options.onClose?.(event);
      if (!this.intentionallyClosed && this.reconnectTimer === null) {
        const reconnectDelayMs = this.nextReconnectDelayMs;
        this.nextReconnectDelayMs = RECONNECT_DELAY_MS;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, reconnectDelayMs);
      }
    });
  }

  sendAction(action: EventRoomAction): void {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Event WebSocket is not open.");
    }
    const message: ClientMessage<"EVENT_ACTION"> = {
      type: "EVENT_ACTION",
      client_msg_id: action.request_id,
      room_id: this.options.roomId,
      player_id: this.options.playerId,
      payload: action,
    };
    if (!isEventSyncAction(action)) this.pendingMutationActions.set(action.request_id, action);
    this.socket.send(JSON.stringify(message));
    for (const observer of devObservers) observer("sent", message);
  }

  acknowledge(requestId: string): void {
    this.pendingMutationActions.delete(requestId);
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.socket?.close(1000, "Event client disconnected.");
    this.socket = null;
  }

  interruptTransportForE2E(reconnectDelayMs: number): boolean {
    if (!Number.isFinite(reconnectDelayMs) || reconnectDelayMs < 0 || this.socket === null) return false;
    const interruptedSocket = this.socket;
    this.stopHeartbeat();
    // Tauri's WebView does not guarantee that an initiator-side close event is
    // delivered promptly. Detach first and schedule reconnect explicitly; a
    // delayed close from the old transport is ignored by the identity guard.
    this.socket = null;
    this.options.onStateChange?.("DISCONNECTED", "Event socket interrupted for E2E reconnect.");
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, reconnectDelayMs);
    interruptedSocket.close(4001, "E2E transport interruption.");
    return true;
  }

  private handleMessage(socket: WebSocket, event: MessageEvent): void {
    if (this.socket !== socket) return;
    this.lastServerTrafficAtMs = Date.now();
    if (typeof event.data !== "string") {
      this.options.onError?.(new Error("Received non-text event message."));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      this.options.onError?.(new Error("Failed to parse event message."));
      return;
    }
    const type = typeof parsed === "object" && parsed !== null ? (parsed as { type?: unknown }).type : null;
    if (typeof type !== "string" || !isServerMessageType(type) || !EVENT_SERVER_TYPES.has(type)) {
      this.options.onError?.(new Error("Unknown event server message received."));
      return;
    }
    if (type === "PONG") return;
    if (type === "EVENT_JOIN_ACCEPTED" || type === "EVENT_STATE") {
      const payload = isRecord(parsed) ? parsed.payload : null;
      if (!isRecord(payload) || !isSupportedEventSnapshot(payload.event_room_snapshot) ||
        (type === "EVENT_JOIN_ACCEPTED" && payload.session_role !== "HOST" && payload.session_role !== "PLAYER")) {
        this.disconnect();
        this.options.onError?.(new Error("開催の対応バージョンが一致しません。更新が必要です。開催受付は利用できません。通常対戦の対応状況は別に確認できます。"));
        return;
      }
    }
    if (type === "EVENT_JOIN_ACCEPTED") {
      this.options.onStateChange?.("CONNECTED", "EVENT_JOIN_ACCEPTED received.");
      for (const action of this.pendingMutationActions.values()) {
        const replay: ClientMessage<"EVENT_ACTION"> = {
          type: "EVENT_ACTION",
          client_msg_id: action.request_id,
          room_id: this.options.roomId,
          player_id: this.options.playerId,
          payload: action,
        };
        this.socket?.send(JSON.stringify(replay));
      }
    }
    for (const observer of devObservers) observer("received", parsed);
    this.options.onMessage(parsed as ServerMessage);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastServerTrafficAtMs = Date.now();
    this.heartbeatTimer = setInterval(() => {
      const socket = this.socket;
      if (socket === null || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastServerTrafficAtMs >= HEARTBEAT_TIMEOUT_MS) {
        this.stopHeartbeat();
        socket.close(4000, "Event heartbeat timeout.");
        return;
      }
      const ping: ClientMessage<"PING"> = {
        type: "PING",
        client_msg_id: crypto.randomUUID(),
        room_id: this.options.roomId,
        player_id: this.options.playerId,
        payload: {},
      };
      socket.send(JSON.stringify(ping));
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === null) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
