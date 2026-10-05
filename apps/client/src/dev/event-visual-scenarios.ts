import type { EventParticipantState, EventRoomSnapshot, EventRoundResult } from "@infinitas/shared";
import type { EventRoomStoreState } from "../stores/event-room-store";

export type EventVisualScenarioId = "event-full-ranks-host" | "event-full-ranks-host-disconnected" | "event-lobby-host-casual" | "event-lobby-host-tournament" | "event-active-host-tournament" | "event-previous-host-tournament" | "event-unselected-host" | "event-save-failure" | "event-host-casual" | "event-host-tournament" | "event-playing-host-casual" | "event-playing-host-tournament" | "event-player-casual" | "event-player-tournament" | "event-many-ranks" | "event-all-invalid" | "event-zero-host" | "event-twenty-source" | "event-disconnected-round-result" | "event-tie-absence-final" | "event-casual-final-mobile";

export interface EventVisualScenario {
  id: EventVisualScenarioId;
  label: string;
  state: EventRoomStoreState;
}

export const EVENT_VISUAL_SCENARIO_IDS: EventVisualScenarioId[] = ["event-host-casual", "event-host-tournament", "event-playing-host-casual", "event-playing-host-tournament", "event-player-casual", "event-player-tournament", "event-many-ranks", "event-all-invalid", "event-zero-host", "event-twenty-source", "event-disconnected-round-result", "event-tie-absence-final", "event-casual-final-mobile"];

const chart = {
  chart_key: "e2e-event-chart",
  expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "E2E Visual Song" },
  display: { title: "E2E Visual Song", level: 12 },
} as const;

function participant(index: number, overrides: Partial<EventParticipantState> = {}): EventParticipantState {
  return { player_id: `visual-player-${index}`, display_name: `PLAYER ${String(index).padStart(2, "0")}`, connection_state: "CONNECTED", pending_next: false, round_status: "PENDING", ...overrides };
}

function snapshot(overrides: Partial<EventRoomSnapshot> = {}): EventRoomSnapshot {
  return {
    schema_version: 2, room_kind: "HOST_EVENT", room_id: "VISUAL01", generation: 1, event_id: "visual-event",
    settings: { event_name: "開催画面ビジュアル検証", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "V8TEST88" },
    phase: "PLAYING", round_phase: "ACTIVE", revision: 8, selection_revision: 2,
    host: { player_id: "visual-host", display_name: "VISUAL HOST", connected: true, plays: false },
    participants: [], fixed_roster_player_ids: [], scoring_size_n: null, selected_chart: chart,
    current_eligible_player_ids: [], current_round_id: "visual-round-2", current_playing_player_ids: [], host_disconnect_deadline: null, latest_result: null,
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
  if (id === "event-full-ranks-host" || id === "event-full-ranks-host-disconnected") {
    const original = getEventVisualScenario("event-many-ranks")!;
    const room = original.state.snapshot!;
    const disconnected = id === "event-full-ranks-host-disconnected";
    room.host.connected = !disconnected;
    room.host_disconnect_deadline = disconnected ? new Date(Date.now() + 240_000).toISOString() : null;
    room.settings.event_name = "全順位20人・とても長い開催名で下部主操作とスクロールを確認";
    room.latest_result!.results.forEach((entry) => { entry.display_name += "・とても長い参加者表示名の確認"; });
    return { id, label: "Host full ranks / primary action visibility", state: { ...original.state, sessionRole: "HOST", playerId: room.host.player_id } };
  }
  if (id === "event-host-casual" || id === "event-host-tournament" || id === "event-playing-host-casual" || id === "event-playing-host-tournament" || id === "event-player-casual" || id === "event-player-tournament") {
    const isPlayer = id.startsWith("event-player-");
    const plays = id.startsWith("event-playing-host-");
    const tournament = id.endsWith("tournament");
    const participants = Array.from({ length: 20 }, (_, index) => participant(index + 1, { round_status: null, ...(index === 2 ? { connection_state: "DISCONNECTED" } : {}), ...(index === 19 ? { display_name: "非常に長いDJ NAME_ABCDEFGHIJKLMNOPQRSTUVWXYZ_表示折り返し" } : {}) }));
    if (plays) participants[0] = { ...participants[0]!, player_id: "visual-host", display_name: "HOST PLAYER" };
    const room = snapshot({ phase: "PICKING", round_phase: null, participants, current_eligible_player_ids: participants.map((p) => p.player_id), host: { player_id: "visual-host", display_name: "VISUAL HOST", connected: true, plays }, settings: { ...snapshot().settings, event_type: tournament ? "TOURNAMENT" : "CASUAL", host_plays: plays }, scoring_size_n: tournament ? 20 : null, fixed_roster_player_ids: tournament ? participants.map((p) => p.player_id) : [] });
    return { id, label: "3 roles / 2 event types / 20 players", state: state(room, { sessionRole: isPlayer ? "PLAYER" : "HOST", playerId: isPlayer ? participants[4]!.player_id : "visual-host" }) };
  }
  if (id === "event-many-ranks" || id === "event-all-invalid") {
    const participants = Array.from({ length: 20 }, (_, index) => participant(index + 1, { round_status: "SUBMITTED" }));
    const result = round("visual-round-1", participants.map((p, i) => ({ player_id: p.player_id, display_name: p.display_name, status: "SUBMITTED", metric_value: 2500 - i * 10, absence_reason: null, rank: i + 1, tournament_points: 20 - i, confirmed_at: "2026-09-14T00:04:00.000Z" })));
    if (id === "event-all-invalid") result.invalidated_at = "2026-09-14T00:05:00.000Z";
    const room = snapshot({ phase: id === "event-all-invalid" ? "RESULT" : "PLAYING", round_phase: id === "event-all-invalid" ? null : "RESULT", participants, latest_result: result, settings: { ...snapshot().settings, event_type: "TOURNAMENT" }, ended_at: id === "event-all-invalid" ? "2026-09-14T00:06:00.000Z" : null, end_reason: id === "event-all-invalid" ? "HOST_ENDED" : null });
    return { id, label: "Full ranks / all invalid", state: state(room, { playerId: participants[9]!.player_id, sessionRole: "PLAYER", resultRounds: [result], resultsPublicRevision: 2, resultsSyncComplete: true }) };
  }
  if (id === "event-lobby-host-casual" || id === "event-lobby-host-tournament" || id === "event-active-host-tournament" || id === "event-previous-host-tournament" || id === "event-unselected-host" || id === "event-save-failure") {
    const original = getEventVisualScenario(id === "event-lobby-host-casual" ? "event-host-casual" : "event-host-tournament")!;
    const room = original.state.snapshot!;
    const result = round("visual-round-1", [{ player_id: room.participants[0]!.player_id, display_name: "PLAYER 01", status: "SUBMITTED", metric_value: 2000, absence_reason: null, rank: 1, tournament_points: 20, confirmed_at: "2026-09-14T00:04:00.000Z" }]);
    if (id.startsWith("event-lobby-")) Object.assign(room, { phase: "LOBBY", event_id: null, selected_chart: null, current_round_id: null, started_at: null, current_eligible_player_ids: [] });
    if (id === "event-active-host-tournament") Object.assign(room, { phase: "PLAYING", round_phase: "ACTIVE", current_playing_player_ids: room.current_eligible_player_ids, participants: room.participants.map((p, index) => ({ ...p, round_status: index === 19 ? "PENDING" : "SUBMITTED" })) });
    if (id === "event-previous-host-tournament") Object.assign(room, { latest_result: result });
    if (id === "event-unselected-host") Object.assign(room, { selected_chart: null });
    return { id, label: "Confirmation / saving boundary", state: { ...original.state, resultRounds: id === "event-previous-host-tournament" ? [result] : [], ...(id === "event-save-failure" ? { errorMessage: "開催履歴を保存できませんでした。ディスク容量を確認してください。" } : {}) } };
  }
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
