import {
  HOST_EVENT_NAME_ALLOW_EMPTY,
  HOST_EVENT_NAME_ALLOW_NEWLINE,
  HOST_EVENT_NAME_MAX_LENGTH,
  HOST_EVENT_PROTOCOL,
  HOST_EVENT_TYPES,
  PLAY_STYLES,
  WIN_METRICS,
  type EventRoomSettings,
} from "@infinitas/shared";
import type { CreateEventRoomResponse } from "../types/api";
import type { WorkerEnv } from "../types/env";
import { asEnumValue, isRecord } from "../utils/validation";
import { generateJoinCode, isValidJoinCode, normalizeJoinCode } from "./join-code";
import { initializeEventRoomDurableObject } from "./room-do";

const CLIENT_VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionParts(value: string): number[] | null {
  const match = CLIENT_VERSION_PATTERN.exec(value);
  return match === null ? null : match.slice(1).map(Number);
}

export function supportedEventClientVersion(client: string, minimum: string): boolean {
  const left = versionParts(client);
  const right = versionParts(minimum);
  if (left === null || right === null) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! !== right[index]!) return left[index]! > right[index]!;
  }
  return true;
}

export function eventAcceptNew(env: Pick<WorkerEnv, "HOST_EVENT_ACCEPT_NEW">): boolean {
  return env.HOST_EVENT_ACCEPT_NEW?.trim().toLowerCase() === "true";
}

function parseSettings(value: unknown): EventRoomSettings {
  if (!isRecord(value)) throw new Error("settings must be an object.");
  const eventName = typeof value.event_name === "string" ? value.event_name : null;
  const eventType = asEnumValue(value.event_type, HOST_EVENT_TYPES);
  const playStyle = asEnumValue(value.play_style, PLAY_STYLES);
  const winMetric = asEnumValue(value.win_metric, WIN_METRICS);
  if (eventName === null || eventType === undefined || playStyle === undefined || winMetric === undefined ||
      typeof value.host_plays !== "boolean" || value.visibility !== "PRIVATE") {
    throw new Error("Invalid event room settings.");
  }
  if (!HOST_EVENT_NAME_ALLOW_EMPTY && eventName.length === 0) throw new Error("event_name must not be empty.");
  if (!HOST_EVENT_NAME_ALLOW_NEWLINE && /[\r\n]/.test(eventName)) throw new Error("event_name cannot contain newline.");
  if (eventName.length > HOST_EVENT_NAME_MAX_LENGTH) throw new Error(`event_name must be <= ${HOST_EVENT_NAME_MAX_LENGTH} characters.`);
  const joinCode = normalizeJoinCode(typeof value.join_code === "string" ? value.join_code : null) ?? generateJoinCode();
  if (!isValidJoinCode(joinCode)) throw new Error("Invalid join_code.");
  return { event_name: eventName, event_type: eventType, host_plays: value.host_plays, play_style: playStyle, win_metric: winMetric, visibility: "PRIVATE", join_code: joinCode };
}

export async function createEventRoom(env: WorkerEnv, payload: unknown): Promise<CreateEventRoomResponse> {
  if (!eventAcceptNew(env)) throw new Error("HOST_EVENT_ACCEPT_NEW_DISABLED");
  if (!isRecord(payload) || payload.host_event_protocol !== HOST_EVENT_PROTOCOL) throw new Error("HOST_EVENT_PROTOCOL_UNSUPPORTED");
  const clientVersion = typeof payload.client_version === "string" ? payload.client_version : "";
  if (!supportedEventClientVersion(clientVersion, env.MIN_SUPPORTED_CLIENT_VERSION)) throw new Error("CLIENT_VERSION_UNSUPPORTED");
  const hostPlayerId = typeof payload.host_player_id === "string" ? payload.host_player_id.trim() : "";
  const hostDisplayName = typeof payload.host_display_name === "string" ? payload.host_display_name.trim() : "";
  if (hostPlayerId.length === 0 || hostDisplayName.length === 0) throw new Error("Host identity is required.");
  const settings = parseSettings(payload.settings);
  const roomId = crypto.randomUUID();
  await initializeEventRoomDurableObject(env, { room_id: roomId, created_at: new Date().toISOString(), host_player_id: hostPlayerId, host_display_name: hostDisplayName, settings });
  return { room_id: roomId, generation: 1, join_code: settings.join_code, settings };
}
