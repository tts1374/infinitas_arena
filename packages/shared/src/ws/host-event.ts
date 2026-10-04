import type { JsonObject } from "../models/common";
import type { ExpectedKey } from "../models/expected-key";
import type {
  EventOverallResultEntry,
  EventRoomSnapshot,
  EventRoundResult,
} from "../models/host-event";
import type { SongUnlockSettings } from "../models/song-unlock";
import type { SourceType } from "../enums/source";

export interface EventJoinPayload {
  host_event_protocol: 1;
  client_version: string;
  join_code: string;
  display_name: string;
  source?: SourceType;
  song_unlocks?: SongUnlockSettings;
}

interface EventActionBase {
  action: string;
  request_id: string;
  generation: number;
  event_id?: string;
}

interface EventStartedActionBase extends EventActionBase {
  event_id: string;
}

interface EventRoundActionBase extends EventStartedActionBase {
  round_id: string;
}

interface EventSelectionActionBase extends EventRoundActionBase {
  selection_revision: number;
}

export interface StartEventAction extends EventActionBase {
  action: "START_EVENT";
}

export interface ConfirmPickAction extends EventStartedActionBase {
  action: "CONFIRM_PICK";
  chart_key: string;
  selection_revision: number;
}

export interface CancelPickAction extends EventSelectionActionBase {
  action: "CANCEL_PICK";
}

export interface SetEventReadyAction extends EventSelectionActionBase {
  action: "SET_READY";
  ready: boolean;
}

export interface StartEventRoundAction extends EventSelectionActionBase {
  action: "START_ROUND";
}

export interface SubmitEventResultAction extends EventRoundActionBase {
  action: "SUBMIT";
  observed_key: ExpectedKey;
  metric_value: number;
  source_meta?: JsonObject;
}

export interface SkipEventRoundAction extends EventRoundActionBase {
  action: "SKIP";
}

export interface CloseEventRoundAction extends EventRoundActionBase {
  action: "CLOSE_ROUND";
}

export interface NextEventPickAction extends EventRoundActionBase {
  action: "NEXT_PICK";
}

export interface InvalidateEventRoundAction extends EventStartedActionBase {
  action: "INVALIDATE_ROUND";
  target_round_id: string;
}

export interface KickEventPlayerAction extends EventActionBase {
  action: "KICK";
  event_id?: string;
  target_player_id: string;
}

export interface LeaveEventAction extends EventActionBase {
  action: "LEAVE";
}

export interface EndEventAction extends EventActionBase {
  action: "END_EVENT";
  event_id?: string;
  round_id?: string;
}

export interface EventStateGetAction extends EventActionBase {
  action: "STATE_GET";
  event_id?: string;
}

export interface EventResultsGetAction extends EventActionBase {
  action: "RESULTS_GET";
  event_id?: string;
  cursor?: string;
  limit?: number;
}

export type EventRoomAction =
  | StartEventAction
  | ConfirmPickAction
  | CancelPickAction
  | SetEventReadyAction
  | StartEventRoundAction
  | SubmitEventResultAction
  | SkipEventRoundAction
  | CloseEventRoundAction
  | NextEventPickAction
  | InvalidateEventRoundAction
  | KickEventPlayerAction
  | LeaveEventAction
  | EndEventAction
  | EventStateGetAction
  | EventResultsGetAction;

export interface EventJoinAcceptedPayload {
  session_role: "HOST" | "PLAYER";
  event_room_snapshot: EventRoomSnapshot;
}

export interface EventStatePayload {
  event_room_snapshot: EventRoomSnapshot;
}

export interface EventActionAckPayload {
  request_id: string;
  accepted: true;
  applied_revision: number;
  duplicate?: boolean;
}

export interface EventResultsPayload {
  // EventRoomSnapshot is authoritative for fixed_roster_player_ids/scoring_size_n;
  // this payload remains a paged projection of public results only.
  public_revision: number;
  rounds: EventRoundResult[];
  overall_results?: EventOverallResultEntry[];
  next_cursor: string | null;
  resync_required: boolean;
}

export interface EventErrorPayload {
  code: string;
  message: string;
  request_id?: string;
}
