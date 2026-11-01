import type {
  EventHistoryParticipant,
  EventJoinPayload,
  EventParticipantState,
  EventRoomAction,
  EventRoomSnapshot,
} from "./index";

// Compile this fixture independently during the shared-contract checkpoint.
// Consumer fixtures are then checked by the root typecheck after integration.
export const eventParticipantFixture = {
  player_id: "player-1",
  display_name: "PLAYER 1",
  connection_state: "DISCONNECTED",
  pending_next: false,
  round_status: null,
} satisfies EventParticipantState;

export const eventHistoryParticipantFixture = {
  player_id: "player-1",
  display_name: "PLAYER 1",
  connection_state: "DISCONNECTED",
  pending_next: false,
  round_status: "SUBMITTED",
} satisfies EventHistoryParticipant;

export const eventJoinFixture = {
  host_event_protocol: 2,
  client_version: "1.4.0",
  join_code: "code",
  display_name: "HOST",
} satisfies EventJoinPayload;

export const eventLobbyFixture = {
  schema_version: 2,
  room_kind: "HOST_EVENT",
  room_id: "room-1",
  generation: 1,
  event_id: null,
  settings: {
    event_name: "",
    event_type: "CASUAL",
    host_plays: false,
    play_style: "SP",
    win_metric: "SCORE",
    visibility: "PRIVATE",
    join_code: "code",
  },
  phase: "LOBBY",
  round_phase: null,
  revision: 1,
  selection_revision: 0,
  host: { player_id: "host", display_name: "HOST", connected: true, plays: false },
  participants: [eventParticipantFixture],
  fixed_roster_player_ids: [],
  scoring_size_n: null,
  selected_chart: null,
  current_round_id: null,
  current_eligible_player_ids: [],
  current_playing_player_ids: [],
  host_disconnect_deadline: null,
  latest_result: null,
  started_at: null,
  ended_at: null,
  end_reason: null,
} satisfies EventRoomSnapshot;

export const eventSelectedFixture = {
  ...eventLobbyFixture,
  event_id: "event-1",
  phase: "PICKING",
  selected_chart: {
    chart_key: "AA-SP-ANOTHER",
    expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "AA" },
    display: { title: "AA", level: 12 },
  },
  selection_revision: 1,
  current_round_id: "round-1",
  current_eligible_player_ids: [eventParticipantFixture.player_id],
  started_at: "2026-10-05T00:00:00.000Z",
} satisfies EventRoomSnapshot;

export const eventStartRoundFixture = {
  action: "START_ROUND",
  request_id: "request-1",
  generation: 1,
  event_id: "event-1",
  round_id: "round-1",
  selection_revision: 1,
} satisfies EventRoomAction;

type Assert<T extends true> = T;
export type HostEventV2ContractAssertions = [
  Assert<Extract<EventRoomAction, { action: "SET_READY" }> extends never ? true : false>,
  Assert<"ready" extends keyof EventParticipantState ? false : true>,
  Assert<"ready" extends keyof EventHistoryParticipant ? false : true>,
  Assert<EventJoinPayload["host_event_protocol"] extends 2 ? true : false>,
  Assert<EventRoomSnapshot["schema_version"] extends 2 ? true : false>,
  Assert<"current_eligible_player_ids" extends keyof EventRoomSnapshot ? true : false>,
];
