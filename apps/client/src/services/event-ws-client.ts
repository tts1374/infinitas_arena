import {
  PING_INTERVAL_SECONDS,
  PING_TIMEOUT_MISSES,
  isServerMessageType,
  type ClientMessage,
  type EventJoinPayload,
  type EventRoomAction,
  type ServerMessage,
} from "@infinitas/shared";
import clientPackageJson from "../../package.json";
import { isEventSyncAction } from "./event-action-policy";

export type EventSocketState = "CONNECTING" | "JOINING" | "CONNECTED" | "DISCONNECTED";

const APP_VERSION = typeof clientPackageJson.version === "string" ? clientPackageJson.version : "unknown";
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

  constructor(private readonly options: EventSocketClientOptions) {}

  connect(): void {
    if (this.socket !== null) return;
    this.intentionallyClosed = false;
    this.options.onStateChange?.("CONNECTING", "Opening event WebSocket.");
    const socket = new WebSocket(buildWebSocketUrl(this.options.apiBaseUrl, this.options.roomId));
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.startHeartbeat();
      this.options.onStateChange?.("JOINING", "Sending EVENT_JOIN.");
      const message: ClientMessage<"EVENT_JOIN"> = {
        type: "EVENT_JOIN",
        client_msg_id: crypto.randomUUID(),
        room_id: this.options.roomId,
        player_id: this.options.playerId,
        payload: {
          host_event_protocol: 1,
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
