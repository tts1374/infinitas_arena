import {
  isServerMessageType,
  type ClientMessage,
  type ClientMessagePayloadMap,
  type ClientMessageType,
  type ServerMessage,
  type SourceType,
} from "@infinitas/shared";
import { logE2EEvent } from "./e2e-observability";
import clientPackageJson from "../../package.json";

export type SocketConnectionState = "CONNECTING" | "JOINING" | "CONNECTED" | "DISCONNECTED";

const APP_VERSION = typeof clientPackageJson.version === "string" ? clientPackageJson.version : "unknown";
const devClients = new Map<string, RoomSocketClient>();
const devObservers = new Set<(stage: "sent" | "received", message: unknown) => void>();
export function observeRoomTransportForDevControl(observer: (stage: "sent" | "received", message: unknown) => void): () => void {
  devObservers.add(observer); return () => { devObservers.delete(observer); };
}
export function pauseRoomTransportForDevControl(roomId: string, playerId: string, paused: boolean): boolean {
  if (import.meta.env?.MODE !== "dev-control") return false;
  const client = devClients.get(`${roomId}:${playerId}`);
  if (!client) return false;
  client.setDevControlPaused(paused); return true;
}

interface RoomSocketClientOptions {
  apiBaseUrl: string;
  roomId: string;
  playerId: string;
  displayName: string;
  source: SourceType;
  bitUnlockEnabled: boolean;
  djpUnlockEnabled: boolean;
  allowLeggendaria: boolean;
  ownedPackIds: number[];
  joinCode?: string | null;
  getCurrentGeneration?: () => number | null;
  onMessage: (message: ServerMessage) => void;
  onStateChange?: (state: SocketConnectionState, detail: string) => void;
  onError?: (error: Error) => void;
  onClose?: (event: CloseEvent) => void;
}

function normalizeApiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (trimmed.length === 0) {
    throw new Error("Worker API URL is required.");
  }

  return trimmed.replace(/\/+$/, "");
}

function buildWebSocketUrl(baseUrl: string, roomId: string): string {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const httpUrl = new URL(`${normalizedBaseUrl}/api/rooms/${encodeURIComponent(roomId)}/ws`);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  return httpUrl.toString();
}

export class RoomSocketClient {
  private socket: WebSocket | null = null;

  constructor(private readonly options: RoomSocketClientOptions) {
    if (import.meta.env?.MODE === "dev-control") devClients.set(`${options.roomId}:${options.playerId}`, this);
  }

  setDevControlPaused(paused: boolean): void {
    if (import.meta.env?.MODE !== "dev-control") return;
    if (paused) {
      const socket = this.socket;
      this.socket = null;
      socket?.close(4001, "Development manual disconnect");
      this.options.onStateChange?.("DISCONNECTED", "Development manual disconnect (automatic reconnect paused).");
    } else this.connect();
  }

  connect(): void {
    if (this.socket !== null) {
      return;
    }

    const wsUrl = buildWebSocketUrl(this.options.apiBaseUrl, this.options.roomId);
    this.options.onStateChange?.("CONNECTING", "Opening WebSocket.");

    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.options.onStateChange?.("JOINING", "Sending ROOM_JOIN.");
      this.send("ROOM_JOIN", {
        display_name: this.options.displayName,
        source: this.options.source,
        client_version: APP_VERSION,
        client_capabilities: {
          song_unlocks: {
            bit_unlocked: this.options.bitUnlockEnabled,
            djp_unlocked: this.options.djpUnlockEnabled,
            allow_leggendaria: this.options.allowLeggendaria,
            owned_pack_ids: this.options.ownedPackIds,
          },
        },
        ...(this.options.joinCode?.trim()
          ? { join_code: this.options.joinCode.trim() }
          : {}),
      });
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event);
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) return;
      this.options.onError?.(new Error("WebSocket transport error."));
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.options.onStateChange?.("DISCONNECTED", `Socket closed (${event.code}).`);
      this.options.onClose?.(event);
    });
  }

  disconnect(sendLeaveMessage: boolean): void {
    const socket = this.socket;
    if (socket === null) {
      return;
    }

    if (sendLeaveMessage && socket.readyState === WebSocket.OPEN) {
      try {
        const generation = this.options.getCurrentGeneration?.() ?? null;
        if (generation !== null) {
          this.send("ROOM_LEAVE", {
            generation,
          });
        }
      } catch {
        // no-op
      }
    }

    socket.close(1000, "Client disconnected.");
    this.socket = null;
  }

  send<TType extends ClientMessageType>(
    type: TType,
    payload: ClientMessagePayloadMap[TType],
  ): void {
    const socket = this.socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open.");
    }

    const message: ClientMessage<TType> = {
      type,
      client_msg_id: crypto.randomUUID(),
      room_id: this.options.roomId,
      player_id: this.options.playerId,
      payload,
    };

    socket.send(JSON.stringify(message));
    for (const observer of devObservers) observer("sent", message);
    void logE2EEvent("websocket_message_sent", {
      messageType: type,
      roomId: this.options.roomId,
    });
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== "string") {
      this.options.onError?.(new Error("Received non-text WebSocket message."));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      this.options.onError?.(new Error("Failed to parse WebSocket message."));
      return;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { type?: unknown }).type !== "string" ||
      !isServerMessageType((parsed as { type: string }).type)
    ) {
      this.options.onError?.(new Error("Unknown server message received."));
      return;
    }

    const message = parsed as ServerMessage;
    for (const observer of devObservers) observer("received", message);

    if (message.type === "PONG") {
      // Heartbeat acknowledgment; no store update required.
      return;
    }

    if (message.type === "ROOM_JOIN_ACCEPTED") {
      this.options.onStateChange?.("CONNECTED", "ROOM_JOIN_ACCEPTED received.");
    }

    this.options.onMessage(message);
  }
}
