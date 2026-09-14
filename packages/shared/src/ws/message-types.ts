export const CLIENT_MESSAGE_TYPES = [
  "ROOM_JOIN",
  "ROOM_LEAVE",
  "READY_SET",
  "START_MATCH",
  "RETURN_TO_LOBBY",
  "AUTO_REMATCH_STOP",
  "AUTO_REMATCH_OPT_OUT",
  "SOURCE_STATUS_SET",
  "QUICK_CHAT_POST",
  "PICK_SUBMIT",
  "RESULT_SUBMIT",
  "SKIP_SELF",
  "SKIP_HOST_ASSIGN",
  "FORCE_ADVANCE",
  "STATE_GET",
  // Keepalive heartbeat from client to DO.
  "PING",
  "EVENT_JOIN",
  "EVENT_ACTION",
] as const;

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

export const SERVER_MESSAGE_TYPES = [
  "ROOM_JOIN_ACCEPTED",
  "ROOM_JOIN_REJECTED",
  "ROOM_UPDATED",
  "ROOM_CLOSED",
  "ROOM_NOTIFICATION",
  "READY_STATUS_CHANGED",
  "QUICK_CHAT_POSTED",
  "START_MATCH_REJECTED",
  "PICK_ACCEPTED",
  "PICK_REJECTED",
  "PICK_FROZEN",
  "ROUND_BEGIN",
  "PLAYER_ROUND_CONFIRMED",
  "ROUND_ENDED",
  "FORCE_ADVANCE_APPLIED",
  "RESULT_READY",
  "STATE_SNAPSHOT",
  "ERROR",
  // Keepalive heartbeat response from DO to client.
  "PONG",
  "EVENT_JOIN_ACCEPTED",
  "EVENT_STATE",
  "EVENT_ACTION_ACK",
  "EVENT_RESULTS",
  "EVENT_ERROR",
] as const;

export type ServerMessageType = (typeof SERVER_MESSAGE_TYPES)[number];

const CLIENT_MESSAGE_TYPE_SET = new Set<string>(CLIENT_MESSAGE_TYPES);
const SERVER_MESSAGE_TYPE_SET = new Set<string>(SERVER_MESSAGE_TYPES);

export function isClientMessageType(value: string): value is ClientMessageType {
  return CLIENT_MESSAGE_TYPE_SET.has(value);
}

export function isServerMessageType(value: string): value is ServerMessageType {
  return SERVER_MESSAGE_TYPE_SET.has(value);
}
