import type { EventRoomSnapshot, RoomStateSnapshot } from "@infinitas/shared";
import type { DevControlAction, DevControlClientState, DevControlIdentity, DevControlState } from "../../dev-control/protocol";

export const identity = { protocolVersion: 1, sessionId: "ui-checkpoint", clientId: "controller", role: "controller" } satisfies DevControlIdentity;
export function makeUiState(phase = "E2", mode: DevControlState["mode"] = "CASUAL", count = 4): DevControlState {
  const chart = { chart_key: "song", expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "テスト曲" }, display: { title: "テスト曲", level: 12 } } as const;
  const ids = Array.from({ length: count }, (_, index) => index === 0 ? "A" : String.fromCharCode(65 + index));
  const snapshot = {
    schema_version: 2, room_kind: "HOST_EVENT", room_id: "LOCAL01", generation: 1, event_id: "event", settings: { event_name: "動作確認", event_type: mode === "TOURNAMENT" ? "TOURNAMENT" : "CASUAL", host_plays: true, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "TEST" },
    phase: phase === "E0" ? "LOBBY" : ["E1", "E2"].includes(phase) ? "PICKING" : phase === "E5" ? "RESULT" : phase === "E6" ? "CLOSED" : "PLAYING", round_phase: phase === "E3" ? "ACTIVE" : phase === "E4" ? "RESULT" : null,
    revision: 1, selection_revision: 1, host: { player_id: "B", display_name: "相手1", connected: true, plays: true },
    participants: ids.map((id, index) => ({ player_id: id, display_name: index === 0 ? "自分" : `相手${index}`, connection_state: "CONNECTED", pending_next: false, round_status: phase === "E3" ? "PENDING" : null })),
    fixed_roster_player_ids: mode === "TOURNAMENT" ? ids : [], scoring_size_n: mode === "TOURNAMENT" ? count : null, selected_chart: chart, current_eligible_player_ids: ids, current_round_id: "round-1", current_playing_player_ids: ids, host_disconnect_deadline: null, latest_result: null, started_at: null, ended_at: null, end_reason: null,
  } satisfies EventRoomSnapshot;
  const normal = {
    room_id: "LOCAL01", generation: 1, current_match_id: "match", room_state: phase === "N0" ? "LOBBY" : phase === "N1" ? "PICKING" : phase === "N5" ? "RESULT" : phase === "N6" ? "CLOSED" : "PLAYING",
    settings: { visibility: "PRIVATE", join_code: "TEST", mode: mode === "BPL" || mode === "BPL4" ? mode : "ARENA", win_metric: "SCORE", play_style: "SP", level_filter: "ANY", room_comment: "", max_players: 4 }, host_player_id: "B",
    players: ids.map((id, index) => ({ player_id: id, display_name: index === 0 ? "自分" : `相手${index}`, source: "daken_counter_v3", connected: true, ready: false })), picks: [], frozen_rounds: [],
    current_round: { round_index: 0, expected_key: chart.expected_key, round_started_at: "2026-10-25T00:00:00.000Z", soft_ttl_seconds: 180, confirmed: [] },
    timers: { ready_check_deadline: null, picking_deadline: null, match_deadline: null, result_deadline: null }, result_ready: false,
  } satisfies RoomStateSnapshot;
  const actions: DevControlAction[] = ["draft.update", "policy.apply", "result.send", "result.delay", "ready.set", "pick.submit", "client.focus", "session.stop", "event.start", "event.confirmPick", "event.startRound", "event.nextPick", "event.end", "event.closeRound", "event.cancelPick", "participant.disconnect", "participant.reconnect", "participant.leave", "participant.add", "reservation.cancel", "match.start", "match.returnToLobby"];
  const clients = [...ids, "controller"].map((id): DevControlClientState => ({
    manifest: { clientId: id, playerId: id === "controller" ? null : id, identifier: `test.${id}`, role: id === "A" ? "self" : id === "controller" ? "controller" : "participant", transport: id === "controller" ? null : id === "A" || id === "B" ? "real-client" : "headless", windowLabel: "main", source: "daken_counter_v3", readOnlySource: id === "A" ? { paths: [], port: 8767 } : null, fixtureRoot: id === "A" ? null : "runtime/opponent", sourcePort: id === "A" ? null : 19999, storageRoot: "runtime/storage", spoolRoot: "runtime/spool" },
    context: { sessionId: identity.sessionId, targetClientId: id, transportEpoch: 1, roomId: "LOCAL01", roomGeneration: 1, matchId: null, eventId: "event", roundIndex: null, roundId: "round-1", expectedKey: chart.expected_key, selectionRevision: 1, policyRevision: 1, valueRevision: 1 },
    connection: "CONNECTED", normalSnapshot: phase.startsWith("N") ? normal : null, eventSnapshot: phase.startsWith("N") ? null : snapshot, displayPhase: phase, draft: { exScore: 1800, missCount: 20 }, policy: "manual", lastError: null,
    actions: actions.map(action => ({ action, enabled: id !== "A" && (action !== "result.send" && action !== "result.delay" || /[NE]3/.test(phase)) && (action !== "client.focus" || id === "B"), reason: null })),
  }));
  return { protocolVersion: 1, sessionId: identity.sessionId, sourceHead: "test", lifecycle: "running", mode, hostClientId: "B", restartOptions: { mode, hostClientId: "B", opponentSource: "daken_counter_v3", visibleOpponents: 1, playerCount: count }, apiBaseUrl: "http://127.0.0.1:19998", roomId: "LOCAL01", joinCode: "TEST", clients, chartCandidates: [{ chartKey: chart.chart_key, expectedKey: chart.expected_key, title: chart.display.title }], availableParticipants: [], operations: [], observations: [], save: { status: "idle", path: null, error: null, missing: [] } };
}
