import type {
  HOST_EVENT_ABSENCE_REASONS,
  HOST_EVENT_END_REASONS,
  HOST_EVENT_PHASES,
  HOST_EVENT_ROUND_PHASES,
  HOST_EVENT_TYPES,
} from "../constants/host-event";
import type { PlayStyle, WinMetric } from "../enums";
import type { ISO8601String } from "./common";
import type { ExpectedKey } from "./expected-key";
import type { FrozenRound } from "./frozen-round";

export type HostEventType = (typeof HOST_EVENT_TYPES)[number];
export type EventRoomPhase = (typeof HOST_EVENT_PHASES)[number];
export type EventRoundPhase = (typeof HOST_EVENT_ROUND_PHASES)[number];
export type HostEventEndReason = (typeof HOST_EVENT_END_REASONS)[number];
export type HostEventAbsenceReason = (typeof HOST_EVENT_ABSENCE_REASONS)[number];
export type EventParticipantConnectionState = "CONNECTED" | "DISCONNECTED" | "LEFT" | "KICKED";
export type EventParticipantRoundStatus = "PENDING" | "SUBMITTED" | "SKIPPED" | "ABSENT";
export type EventResultStatus = "SUBMITTED" | "ABSENT";

export interface EventRoomSettings {
  event_name: string;
  event_type: HostEventType;
  host_plays: boolean;
  play_style: PlayStyle;
  win_metric: WinMetric;
  visibility: "PRIVATE";
  join_code: string;
}

export interface EventChart {
  chart_key: string;
  expected_key: ExpectedKey;
  display: FrozenRound["display"];
}

export interface EventParticipantState {
  player_id: string;
  display_name: string;
  connection_state: EventParticipantConnectionState;
  ready: boolean;
  pending_next: boolean;
  round_status: EventParticipantRoundStatus | null;
}

export interface EventHostState {
  player_id: string;
  display_name: string;
  connected: boolean;
  plays: boolean;
}

export interface EventRoundResultEntry {
  player_id: string;
  display_name: string;
  status: EventResultStatus;
  metric_value: number;
  absence_reason: HostEventAbsenceReason | null;
  rank: number | null;
  tournament_points?: number;
  confirmed_at: ISO8601String;
}

export interface EventRoundResult {
  round_id: string;
  chart: EventChart;
  playing_player_ids: string[];
  started_at: ISO8601String;
  confirmed_at: ISO8601String;
  invalidated_at: ISO8601String | null;
  public_revision: number;
  results: EventRoundResultEntry[];
}

export interface EventOverallResultEntry {
  player_id: string;
  display_name: string;
  total_points: number;
  rank: number;
}

export interface EventRoomSnapshot {
  schema_version: 1;
  room_kind: "HOST_EVENT";
  room_id: string;
  generation: number;
  event_id: string | null;
  settings: EventRoomSettings;
  phase: EventRoomPhase;
  round_phase: EventRoundPhase | null;
  revision: number;
  selection_revision: number;
  host: EventHostState;
  participants: EventParticipantState[];
  /** Authoritative tournament roster metadata. CASUAL and pre-start TOURNAMENT snapshots use [] / null. */
  fixed_roster_player_ids: string[];
  scoring_size_n: number | null;
  selected_chart: EventChart | null;
  current_round_id: string | null;
  current_playing_player_ids: string[];
  host_disconnect_deadline: ISO8601String | null;
  latest_result: EventRoundResult | null;
  overall_results?: EventOverallResultEntry[];
  started_at: ISO8601String | null;
  ended_at: ISO8601String | null;
  end_reason: HostEventEndReason | null;
}
