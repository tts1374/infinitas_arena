import type { EventParticipantState, EventRoomSnapshot, EventRoundResult } from "@infinitas/shared";
import type { EventRoomStoreState } from "../stores/event-room-store";

export type EventVisualScenarioId = "event-zero-host" | "event-twenty-source" | "event-disconnected-round-result" | "event-tie-absence-final" | "event-casual-final-mobile";

export interface EventVisualScenario {
  id: EventVisualScenarioId;
  label: string;
  state: EventRoomStoreState;
}

export const EVENT_VISUAL_SCENARIO_IDS: EventVisualScenarioId[] = ["event-zero-host", "event-twenty-source", "event-disconnected-round-result", "event-tie-absence-final", "event-casual-final-mobile"];

const chart = {
  chart_key: "e2e-event-chart",
  expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "E2E Visual Song" },
  display: { title: "E2E Visual Song", level: 12 },
} as const;

function participant(index: number, overrides: Partial<EventParticipantState> = {}): EventParticipantState {
  return { player_id: `visual-player-${index}`, display_name: `PLAYER ${String(index).padStart(2, "0")}`, connection_state: "CONNECTED", ready: true, pending_next: false, round_status: "PENDING", ...overrides };
}

function snapshot(overrides: Partial<EventRoomSnapshot> = {}): EventRoomSnapshot {
  return {
    schema_version: 1, room_kind: "HOST_EVENT", room_id: "VISUAL01", generation: 1, event_id: "visual-event",
    settings: { event_name: "開催画面ビジュアル検証", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "V8TEST88" },
    phase: "PLAYING", round_phase: "ACTIVE", revision: 8, selection_revision: 2,
    host: { player_id: "visual-host", display_name: "VISUAL HOST", connected: true, plays: false },
    participants: [], fixed_roster_player_ids: [], scoring_size_n: null, selected_chart: chart,
    current_round_id: "visual-round-2", current_playing_player_ids: [], host_disconnect_deadline: null, latest_result: null,
    started_at: "2026-09-14T00:00:00.000Z", ended_at: null, end_reason: null, ...overrides,
  };
}

function round(roundId: string, results: EventRoundResult["results"]): EventRoundResult {
  return { round_id: roundId, chart, playing_player_ids: results.map((entry) => entry.player_id), started_at: "2026-09-14T00:01:00.000Z", confirmed_at: "2026-09-14T00:04:00.000Z", invalidated_at: null, public_revision: 2, results };
}

function state(roomSnapshot: EventRoomSnapshot, overrides: Partial<EventRoomStoreState> = {}): EventRoomStoreState {
  return {
    connectionStatus: "CONNECTED", connectionDetail: "Visual evidence fixture.", roomId: roomSnapshot.room_id,
    playerId: roomSnapshot.host.player_id, sessionRole: "HOST", snapshot: roomSnapshot, resultRounds: [], resultsPublicRevision: null,
    resultsNextCursor: null, resultsSyncComplete: false, pendingMutationRequestIds: [], leavePending: false,
    sourceUnavailableMessage: null, errorMessage: null, ...overrides,
  };
}

export function getEventVisualScenario(id: string): EventVisualScenario | null {
  if (id === "event-zero-host") {
    return { id, label: "Host lobby / 0 participants", state: state(snapshot({ phase: "LOBBY", round_phase: null, event_id: null, selected_chart: null, current_round_id: null, started_at: null })) };
  }
  if (id === "event-twenty-source") {
    const participants = Array.from({ length: 20 }, (_, index) => participant(index + 1));
    return { id, label: "20 participants / source unavailable", state: state(snapshot({ participants, current_playing_player_ids: participants.map((entry) => entry.player_id) }), { playerId: participants[0]!.player_id, sessionRole: "PLAYER", sourceUnavailableMessage: "入力ファイルを読み取れませんでした" }) };
  }
  if (id === "event-disconnected-round-result" || id === "event-tie-absence-final") {
    const participants = [participant(1, { round_status: "SUBMITTED" }), participant(2, { round_status: "SUBMITTED" }), participant(3, { round_status: "ABSENT" })];
    const result = round("visual-round-2", [
      { player_id: participants[0]!.player_id, display_name: participants[0]!.display_name, status: "SUBMITTED", metric_value: 2500, absence_reason: null, rank: 1, tournament_points: 3, confirmed_at: "2026-09-14T00:04:00.000Z" },
      { player_id: participants[1]!.player_id, display_name: participants[1]!.display_name, status: "SUBMITTED", metric_value: 2500, absence_reason: null, rank: 1, tournament_points: 3, confirmed_at: "2026-09-14T00:04:00.000Z" },
      { player_id: participants[2]!.player_id, display_name: participants[2]!.display_name, status: "ABSENT", metric_value: 0, absence_reason: "DEADLINE", rank: null, tournament_points: 0, confirmed_at: "2026-09-14T00:04:00.000Z" },
    ]);
    const tournamentSnapshot = snapshot({
      settings: { event_name: "大会・同点と欠場", event_type: "TOURNAMENT", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "V8TEST88" },
      participants,
      fixed_roster_player_ids: participants.map((entry) => entry.player_id), scoring_size_n: 3, latest_result: result,
      overall_results: [
        { player_id: participants[0]!.player_id, display_name: participants[0]!.display_name, total_points: 6, rank: 1 },
        { player_id: participants[1]!.player_id, display_name: participants[1]!.display_name, total_points: 6, rank: 1 },
        { player_id: participants[2]!.player_id, display_name: participants[2]!.display_name, total_points: 0, rank: 3 },
      ],
    });
    if (id === "event-disconnected-round-result") {
      return { id, label: "Host disconnected / round result", state: state({ ...tournamentSnapshot,
        phase: "PLAYING", round_phase: "RESULT",
        host: { ...tournamentSnapshot.host, connected: false },
        host_disconnect_deadline: new Date(Date.now() + 301_000).toISOString(),
        ended_at: null, end_reason: null,
      }, { resultRounds: [result], resultsPublicRevision: 2, resultsSyncComplete: true }) };
    }
    return { id, label: "Tournament final / tie / absence", state: state({ ...tournamentSnapshot,
      phase: "RESULT", round_phase: null,
      host: { ...tournamentSnapshot.host, connected: true },
      host_disconnect_deadline: null,
      ended_at: "2026-09-14T00:08:00.000Z", end_reason: "HOST_ENDED",
    }, { resultRounds: [result], resultsPublicRevision: 2, resultsSyncComplete: true }) };
  }
  if (id === "event-casual-final-mobile") {
    const longName = "E2E2・とても長い参加者表示名・MOBILE";
    const first = round("visual-round-1", [{ player_id: "visual-player-1", display_name: longName, status: "SUBMITTED", metric_value: 2345, absence_reason: null, rank: 1, confirmed_at: "2026-09-14T00:04:00.000Z" }]);
    const second = { ...round("visual-round-2", [{ player_id: "visual-player-1", display_name: longName, status: "SUBMITTED", metric_value: 2456, absence_reason: null, rank: 1, confirmed_at: "2026-09-14T00:08:00.000Z" }]), public_revision: 3 };
    return { id, label: "CASUAL final / mobile overflow", state: state(snapshot({ phase: "RESULT", round_phase: null, participants: [participant(1, { display_name: longName, round_status: "SUBMITTED" })], latest_result: second, ended_at: "2026-09-14T00:08:00.000Z", end_reason: "HOST_ENDED" }), { resultRounds: [first, second], resultsPublicRevision: 3, resultsSyncComplete: true }) };
  }
  return null;
}
