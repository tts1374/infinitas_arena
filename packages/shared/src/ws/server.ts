import type { ErrorCode } from "../errors";
import type { CloseReason, SubmissionStatus, SubmittedBy } from "../enums";
import type { JsonObject, ISO8601String } from "../models/common";
import type { ExpectedKey } from "../models/expected-key";
import type { FrozenRound } from "../models/frozen-round";
import type { QuickChatMessage } from "../models/quick-chat";
import type { RoomStateSnapshot } from "../models/room-state-snapshot";
import type { SubmissionReason } from "../models/submission";
import type { SoundEffectKey } from "../constants/audio";
import type { WsEmptyPayload } from "./common";
import type { ServerEnvelope } from "./envelope";
import type { ServerMessageType } from "./message-types";
import type {
  EventActionAckPayload,
  EventErrorPayload,
  EventJoinAcceptedPayload,
  EventResultsPayload,
  EventStatePayload,
} from "./host-event";

export type RoomJoinAcceptedSessionRole = "HOST" | "PLAYER" | "SPECTATOR";

export interface RoomJoinAcceptedPayload {
  room_state_snapshot: RoomStateSnapshot;
  session_role?: RoomJoinAcceptedSessionRole;
}

export interface RoomRejectedPayload {
  reason: string;
}

export interface RoomUpdatedPayload {
  room_state_snapshot: RoomStateSnapshot;
}

export interface RoomClosedPayload {
  close_reason: CloseReason;
  closed_at: ISO8601String;
  result_ready: boolean;
  event_id: string;
}

export interface RoomNotificationPayload {
  kind: SoundEffectKey;
  event_id: string;
  scheduled_at: ISO8601String;
}

export interface ReadyStatusChangedPayload {
  player_id: string;
  ready: boolean;
}

export interface QuickChatPostedPayload {
  message: QuickChatMessage;
}

export interface PickAcceptedPayload {
  player_id: string;
  pick_chart_key: string;
  accepted_at: ISO8601String;
}

export interface PickRejectedPayload {
  reason: string;
}

export interface PickFrozenPayload {
  frozen_rounds: FrozenRound[];
}

export interface RoundBeginPayload {
  round_index: number;
  expected_key: ExpectedKey;
  round_started_at: ISO8601String;
  soft_ttl_seconds: number;
}

export interface PlayerRoundConfirmedPayload {
  round_index: number;
  player_id: string;
  status: SubmissionStatus;
  metric_value: number;
  reason: SubmissionReason;
  submitted_at: ISO8601String;
  submitted_by: SubmittedBy;
  source_meta: JsonObject | null;
}

export interface RoundEndedPayload {
  round_index: number;
}

export interface ForceAdvanceAppliedPayload {
  round_index: number;
  timed_out_players: string[];
}

export type RatedBlockReason =
  | "private_room"
  | "missing_submission"
  | "mismatch_observed_key"
  | "incomplete_match"
  | "skip_occurred"
  | "timeout_occurred"
  | "force_advanced"
  | "result_conflict";

export interface ResultReadySummary {
  match_id: string;
  mode: "ARENA" | "BPL";
  win_metric: "SCORE" | "MISSCOUNT";
  total_rounds: number;
  completed_rounds: number;
  winner_player_ids: string[];
  is_draw: boolean;
  is_rated: boolean;
  rated_block_reason: RatedBlockReason | null;
  rating_before: number | null;
  rating_after: number | null;
  rating_delta: number | null;
}

export interface ResultReadyRoundPlayerResult {
  round_index: number;
  player_id: string;
  display_name: string;
  status: SubmissionStatus | null;
  metric_value: number | null;
  reason: SubmissionReason;
  submitted_at: ISO8601String | null;
  submitted_by: SubmittedBy | null;
  source_meta: JsonObject | null;
}

export interface ResultReadyArenaRoundPlayerResult extends ResultReadyRoundPlayerResult {
  rank: number | null;
  arena_points: number;
}

export interface ResultReadyBplRoundPlayerResult extends ResultReadyRoundPlayerResult {
  round_win: boolean;
}

export interface ResultReadyRoundBase {
  round_index: number;
  expected_key: ExpectedKey;
  display: FrozenRound["display"];
  round_started_at: ISO8601String | null;
  played: boolean;
  winner_player_ids: string[];
}

export interface ResultReadyArenaRound extends ResultReadyRoundBase {
  results: ResultReadyArenaRoundPlayerResult[];
}

export interface ResultReadyBplRound extends ResultReadyRoundBase {
  results: ResultReadyBplRoundPlayerResult[];
}

export type ResultReadyRound = ResultReadyArenaRound | ResultReadyBplRound;

export interface ResultReadyArenaPlayer {
  player_id: string;
  display_name: string;
  total_points: number;
  total_ex_score: number | null;
  last_confirmed_at: ISO8601String | null;
  rounds: ResultReadyArenaRoundPlayerResult[];
}

export interface ResultReadyBplPlayer {
  player_id: string;
  display_name: string;
  round_wins: number;
  rounds: ResultReadyBplRoundPlayerResult[];
}

export type ResultReadyPlayer = ResultReadyArenaPlayer | ResultReadyBplPlayer;

export interface ResultReadyPerRound {
  rounds: ResultReadyRound[];
}

export interface ResultReadyPerPlayer {
  players: ResultReadyPlayer[];
}

export interface ResultReadyPayload {
  summary: ResultReadySummary;
  per_round: ResultReadyPerRound;
  per_player: ResultReadyPerPlayer;
}

export interface StateSnapshotPayload {
  room_state_snapshot: RoomStateSnapshot;
}

export interface ErrorMessagePayload {
  code: ErrorCode;
  message: string;
}

export interface ServerMessagePayloadMap {
  ROOM_JOIN_ACCEPTED: RoomJoinAcceptedPayload;
  ROOM_JOIN_REJECTED: RoomRejectedPayload;
  ROOM_UPDATED: RoomUpdatedPayload;
  ROOM_CLOSED: RoomClosedPayload;
  ROOM_NOTIFICATION: RoomNotificationPayload;
  READY_STATUS_CHANGED: ReadyStatusChangedPayload;
  QUICK_CHAT_POSTED: QuickChatPostedPayload;
  START_MATCH_REJECTED: RoomRejectedPayload;
  PICK_ACCEPTED: PickAcceptedPayload;
  PICK_REJECTED: PickRejectedPayload;
  PICK_FROZEN: PickFrozenPayload;
  ROUND_BEGIN: RoundBeginPayload;
  PLAYER_ROUND_CONFIRMED: PlayerRoundConfirmedPayload;
  ROUND_ENDED: RoundEndedPayload;
  FORCE_ADVANCE_APPLIED: ForceAdvanceAppliedPayload;
  RESULT_READY: ResultReadyPayload;
  STATE_SNAPSHOT: StateSnapshotPayload;
  ERROR: ErrorMessagePayload;
  PONG: WsEmptyPayload;
  EVENT_JOIN_ACCEPTED: EventJoinAcceptedPayload;
  EVENT_STATE: EventStatePayload;
  EVENT_ACTION_ACK: EventActionAckPayload;
  EVENT_RESULTS: EventResultsPayload;
  EVENT_ERROR: EventErrorPayload;
}

export type ServerMessage<
  TType extends ServerMessageType = ServerMessageType,
> = ServerEnvelope<TType, ServerMessagePayloadMap[TType]>;
