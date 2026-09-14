import assert from "node:assert/strict";
import test from "node:test";
import type { EventRoomAction, EventRoomSnapshot } from "@infinitas/shared";
import { buildEventKickAction, buildEventLeaveAction, canDispatchEventAction, canUseEventUiAction, releaseEventMutation, shouldDispatchQueuedEventLeave, trackEventMutation } from "./event-action-policy";

const stateGet = { action: "STATE_GET", request_id: "state", generation: 1 } satisfies EventRoomAction;
const resultsGet = { action: "RESULTS_GET", request_id: "results", generation: 1, cursor: "page-2" } satisfies EventRoomAction;
const startEvent = { action: "START_EVENT", request_id: "start-event", generation: 1 } satisfies EventRoomAction;
const startRound = { action: "START_ROUND", request_id: "start-round", generation: 1, event_id: "event", round_id: "round", selection_revision: 1 } satisfies EventRoomAction;

test("initial results and paginated synchronization never block host mutations", () => {
  let pending: string[] = [];
  pending = trackEventMutation(resultsGet, pending);
  assert.deepEqual(pending, []);
  assert.equal(canDispatchEventAction(startEvent, pending), true);
  pending = trackEventMutation(stateGet, pending);
  pending = trackEventMutation(resultsGet, pending);
  assert.deepEqual(pending, []);
  assert.equal(canDispatchEventAction(startRound, pending), true);
});

test("only ACK or request-scoped ERROR releases a mutation and duplicate dispatch is rejected", () => {
  let pending = trackEventMutation(startEvent, []);
  assert.deepEqual(pending, ["start-event"]);
  assert.equal(canDispatchEventAction(startEvent, pending), false);
  assert.equal(canDispatchEventAction(resultsGet, pending), true);
  pending = releaseEventMutation("unrelated-sync", pending);
  assert.deepEqual(pending, ["start-event"]);
  pending = releaseEventMutation("start-event", pending);
  assert.deepEqual(pending, []);
  assert.equal(canDispatchEventAction(startRound, pending), true);
});

test("explicit LEAVE waits behind a mutation and includes the current event id", () => {
  const pending = trackEventMutation(startRound, []);
  assert.equal(shouldDispatchQueuedEventLeave({ queued: true, pendingLeaveRequestId: null, pendingMutationRequestIds: pending }), false);
  const released = releaseEventMutation(startRound.request_id, pending);
  assert.equal(shouldDispatchQueuedEventLeave({ queued: true, pendingLeaveRequestId: null, pendingMutationRequestIds: released }), true);
  const leave = buildEventLeaveAction("leave", { generation: 2, event_id: "event-2" });
  assert.deepEqual(leave, { action: "LEAVE", request_id: "leave", generation: 2, event_id: "event-2" });
  assert.equal(shouldDispatchQueuedEventLeave({ queued: true, pendingLeaveRequestId: "leave", pendingMutationRequestIds: ["leave"] }), false);
});

test("KICK omits event_id in LOBBY and carries the authoritative event_id after start", () => {
  assert.deepEqual(buildEventKickAction("kick-lobby", { generation: 1, event_id: null }, "target"), {
    action: "KICK", request_id: "kick-lobby", generation: 1, target_player_id: "target",
  });
  assert.deepEqual(buildEventKickAction("kick-started", { generation: 1, event_id: "event" }, "target"), {
    action: "KICK", request_id: "kick-started", generation: 1, event_id: "event", target_player_id: "target",
  });
});

function uiSnapshot(overrides: Partial<EventRoomSnapshot> = {}): EventRoomSnapshot {
  return {
    schema_version: 1, room_kind: "HOST_EVENT", room_id: "room", generation: 1, event_id: null,
    settings: { event_name: "", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "CODE1234" },
    phase: "LOBBY", round_phase: null, revision: 1, selection_revision: 0,
    host: { player_id: "host", display_name: "Host", connected: true, plays: false },
    participants: [], fixed_roster_player_ids: [], scoring_size_n: null, selected_chart: null,
    current_round_id: null, current_playing_player_ids: [], host_disconnect_deadline: null,
    latest_result: null, started_at: null, ended_at: null, end_reason: null,
    ...overrides,
  };
}

test("UI action gate requires a participant and a clear mutation slot before START_EVENT", () => {
  const empty = uiSnapshot();
  assert.equal(canUseEventUiAction({ action: "START_EVENT", snapshot: empty, sessionRole: "HOST", playerId: "host", mutationPending: false }), false);
  const joined = uiSnapshot({ participants: [{ player_id: "p", display_name: "P", connection_state: "CONNECTED", ready: false, pending_next: false, round_status: null }] });
  assert.equal(canUseEventUiAction({ action: "START_EVENT", snapshot: joined, sessionRole: "HOST", playerId: "host", mutationPending: false }), true);
  assert.equal(canUseEventUiAction({ action: "START_EVENT", snapshot: joined, sessionRole: "HOST", playerId: "host", mutationPending: true }), false);
  assert.equal(canUseEventUiAction({ action: "START_EVENT", snapshot: joined, sessionRole: "PLAYER", playerId: "p", mutationPending: false }), false);
});

test("Host disconnect disables every visible action except an eligible SUBMIT", () => {
  const disconnected = uiSnapshot({
    event_id: "event", phase: "PLAYING", round_phase: "ACTIVE", current_round_id: "round",
    host: { player_id: "host", display_name: "Host", connected: false, plays: false },
    participants: [{ player_id: "p", display_name: "P", connection_state: "CONNECTED", ready: true, pending_next: false, round_status: "PENDING" }],
    current_playing_player_ids: ["p"],
  });
  assert.equal(canUseEventUiAction({ action: "SUBMIT", snapshot: disconnected, sessionRole: "PLAYER", playerId: "p", mutationPending: false }), true);
  for (const action of ["SKIP", "CLOSE_ROUND", "INVALIDATE_ROUND", "END_EVENT", "LEAVE"] as const) {
    assert.equal(canUseEventUiAction({ action, snapshot: disconnected, sessionRole: action === "LEAVE" ? "PLAYER" : "HOST", playerId: "p", mutationPending: false }), false, action);
  }
});

test("PICKING/ACTIVE/RESULT actions are phase- and role-scoped", () => {
  const participant = { player_id: "p", display_name: "P", connection_state: "CONNECTED" as const, ready: false, pending_next: false, round_status: null };
  const picking = uiSnapshot({ event_id: "event", phase: "PICKING", selected_chart: { chart_key: "chart", expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "song" }, display: { title: "Song", level: 12 } }, current_round_id: "round", participants: [participant] });
  assert.equal(canUseEventUiAction({ action: "SET_READY", snapshot: picking, sessionRole: "PLAYER", playerId: "p", mutationPending: false }), true);
  assert.equal(canUseEventUiAction({ action: "START_ROUND", snapshot: picking, sessionRole: "HOST", playerId: "host", mutationPending: false }), true);
  assert.equal(canUseEventUiAction({ action: "START_ROUND", snapshot: picking, sessionRole: "PLAYER", playerId: "p", mutationPending: false }), false);
  const result = { ...picking, phase: "PLAYING", round_phase: "RESULT" } satisfies EventRoomSnapshot;
  assert.equal(canUseEventUiAction({ action: "NEXT_PICK", snapshot: result, sessionRole: "HOST", playerId: "host", mutationPending: false }), true);
  assert.equal(canUseEventUiAction({ action: "KICK", snapshot: result, sessionRole: "HOST", playerId: "host", mutationPending: false }), false);
});
