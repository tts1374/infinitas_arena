export const HOST_EVENT_PROTOCOL = 1 as const;
export const HOST_EVENT_ACCEPT_NEW = false as const;
export const HOST_EVENT_ROOM_SCHEMA_VERSION = 1 as const;
export const EVENT_MAX_PLAYERS = 20 as const;
export const HOST_EVENT_DISCONNECT_GRACE_SECONDS = 300 as const;
export const HOST_EVENT_CLOSED_RETENTION_SECONDS = 1_800 as const;
export const HOST_EVENT_RESULTS_PAGE_SIZE = 50 as const;
export const HOST_EVENT_HISTORY_SCHEMA_VERSION = 1 as const;
// Event names intentionally share the normal room-comment input contract.
export const HOST_EVENT_NAME_MAX_LENGTH = ROOM_COMMENT_MAX_LENGTH;
export const HOST_EVENT_NAME_ALLOW_EMPTY = ROOM_COMMENT_ALLOW_EMPTY;
export const HOST_EVENT_NAME_ALLOW_NEWLINE = ROOM_COMMENT_ALLOW_NEWLINE;

export const HOST_EVENT_TYPES = ["CASUAL", "TOURNAMENT"] as const;
export const HOST_EVENT_PHASES = ["LOBBY", "PICKING", "PLAYING", "RESULT", "CLOSED"] as const;
export const HOST_EVENT_ROUND_PHASES = ["ACTIVE", "RESULT"] as const;
export const HOST_EVENT_END_REASONS = ["HOST_ENDED", "HOST_DISCONNECTED", "ROOM_STATE_LOST"] as const;
export const HOST_EVENT_ABSENCE_REASONS = ["SKIP", "DEADLINE", "LEFT", "KICKED", "NOT_PRESENT"] as const;

export const HOST_EVENT_SCORE_ABSENT_VALUE = 0 as const;
export const HOST_EVENT_MISSCOUNT_ABSENT_VALUE = 9_999 as const;
export const HOST_EVENT_ABSENT_TOURNAMENT_POINTS = 0 as const;
export const HOST_EVENT_IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT" as const;
import {
  ROOM_COMMENT_ALLOW_EMPTY,
  ROOM_COMMENT_ALLOW_NEWLINE,
  ROOM_COMMENT_MAX_LENGTH,
} from "./room";
