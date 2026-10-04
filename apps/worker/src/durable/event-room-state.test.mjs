import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_MAX_PLAYERS,
  HOST_EVENT_DISCONNECT_GRACE_SECONDS,
  HOST_EVENT_MISSCOUNT_ABSENT_VALUE,
  HOST_EVENT_PROTOCOL,
  HOST_EVENT_SCORE_ABSENT_VALUE,
} from "@infinitas/shared";
import { EventRoomState } from "./event-room-state.ts";

const BASE_TIME = new Date("2026-09-07T00:00:00.000Z");
const DEFAULT_UNLOCKS = {
  bit_unlocked: true,
  djp_unlocked: true,
  allow_leggendaria: true,
  owned_pack_ids: [10, 20],
};

function at(seconds) {
  return new Date(BASE_TIME.getTime() + seconds * 1_000);
}

function createChartMaster() {
  const charts = new Map([
    ["score-chart", {
      chart_key: "score-chart",
      expected_key: { play_style: "SP", difficulty: "HYPER", title_search_key: "score-chart", chart_id: 1 },
      display: { title: "Score Chart", level: 10 },
      requirement: "initial",
    }],
    ["pack-chart", {
      chart_key: "pack-chart",
      expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "pack-chart", chart_id: 2 },
      display: { title: "Pack Chart", level: 11 },
      requirement: "pack-20",
    }],
  ]);
  return {
    resolvePickChartKey(key, playStyle, _levelFilter, unlockFilter) {
      const chart = charts.get(key);
      if (!chart || chart.expected_key.play_style !== playStyle) return null;
      if (chart.requirement === "pack-20" && !unlockFilter?.common_pack_ids.includes(20)) return null;
      return chart;
    },
    pickRandomUnusedChart() { return null; },
    searchCharts() { return { charts: [], next_cursor: null }; },
    hasAliasExact() { return false; },
    resolveAliasExact() { return []; },
    getSongPacks() { return []; },
    getMetadata() { return {}; },
  };
}

function createState(eventType = "CASUAL", hostPlays = false, winMetric = "SCORE") {
  const state = new EventRoomState(createChartMaster());
  state.initialize({
    room_id: "event-room",
    created_at: BASE_TIME.toISOString(),
    host_player_id: "host",
    host_display_name: "Host",
    settings: {
      event_name: "Sunday session",
      event_type: eventType,
      host_plays: hostPlays,
      play_style: "SP",
      win_metric: winMetric,
      visibility: "PRIVATE",
      join_code: "ABCDEFGH",
    },
  });
  return state;
}

function joinHost(state, seconds = 1, extra = {}) {
  return state.join({
    player_id: "host",
    display_name: "Host",
    accept_new: true,
    now: at(seconds),
    ...extra,
  });
}

function joinPlayer(state, id, seconds, overrides = {}) {
  return state.join({
    player_id: id,
    display_name: id.toUpperCase(),
    source: "inf-notebook",
    song_unlocks: DEFAULT_UNLOCKS,
    accept_new: true,
    now: at(seconds),
    ...overrides,
  });
}

function beginSelectedRound(state, playerIds, eventType = "CASUAL") {
  assert.equal(joinHost(state).ok, true);
  playerIds.forEach((id, index) => assert.equal(joinPlayer(state, id, index + 2).ok, true));
  assert.equal(state.startEvent("host", `event-${eventType}`, at(20)).ok, true);
  const selectionRevision = state.toSnapshot().selection_revision;
  assert.equal(state.confirmPick("host", "score-chart", selectionRevision, "round-1", at(21)).ok, true);
  return state.toSnapshot().selection_revision;
}

test("host event constants preserve the protocol and capacity contract", () => {
  assert.equal(HOST_EVENT_PROTOCOL, 2);
  assert.equal(EVENT_MAX_PLAYERS, 20);
  assert.equal(HOST_EVENT_DISCONNECT_GRACE_SECONDS, 300);
});

test("dedicated host is outside the 20-player capacity", () => {
  const state = createState();
  assert.equal(joinHost(state).ok, true);
  for (let index = 0; index < EVENT_MAX_PLAYERS; index += 1) {
    assert.equal(joinPlayer(state, `p${index}`, index + 2).ok, true);
  }
  assert.equal(state.toSnapshot().participants.length, 20);
  assert.equal(joinPlayer(state, "overflow", 30).reason, "ROOM_FULL");
});

test("playing host occupies one of the 20 player slots and requires source data", () => {
  const state = createState("CASUAL", true);
  assert.equal(joinHost(state).reason, "SOURCE_REQUIRED");
  assert.equal(state.toSnapshot().host.connected, false);
  assert.equal(joinHost(state, 2, { source: "reflux", song_unlocks: DEFAULT_UNLOCKS }).ok, true);
  for (let index = 0; index < 19; index += 1) {
    assert.equal(joinPlayer(state, `p${index}`, index + 3).ok, true);
  }
  assert.equal(joinPlayer(state, "overflow", 30).reason, "ROOM_FULL");
});

test("a playing host slot is reserved before the host first connects", () => {
  const state = createState("CASUAL", true);
  for (let index = 0; index < EVENT_MAX_PLAYERS - 1; index += 1) {
    assert.equal(joinPlayer(state, `p${index}`, index + 1).ok, true);
  }
  assert.equal(joinPlayer(state, "overflow", 25).reason, "ROOM_FULL");
  assert.equal(joinHost(state, 26, { source: "reflux", song_unlocks: DEFAULT_UNLOCKS }).ok, true);
  assert.equal(state.toSnapshot().participants.length, EVENT_MAX_PLAYERS);
});

test("a LEFT participant cannot reclaim a slot after the 20 active slots are refilled", () => {
  const state = createState();
  assert.equal(joinHost(state).ok, true);
  for (let index = 0; index < EVENT_MAX_PLAYERS; index += 1) {
    assert.equal(joinPlayer(state, `p${index}`, index + 2).ok, true);
  }
  assert.equal(state.leave("p0", at(30)).ok, true);
  assert.equal(joinPlayer(state, "replacement", 31).ok, true);
  assert.equal(joinPlayer(state, "p0", 32, { accept_new: false }).reason, "ROOM_FULL");
  const active = state.toSnapshot().participants.filter(({ connection_state }) =>
    connection_state === "CONNECTED" || connection_state === "DISCONNECTED");
  assert.equal(active.length, EVENT_MAX_PLAYERS);
});

test("event id is null in LOBBY and issued with START_EVENT", () => {
  const state = createState();
  assert.equal(state.toSnapshot().event_id, null);
  assert.equal(joinHost(state).ok, true);
  assert.equal(state.startEvent("host", "event-1", at(2)).reason, "START_REQUIRES_MIN_PLAYERS");
  assert.equal(joinPlayer(state, "p1", 3).ok, true);
  assert.equal(state.startEvent("host", "event-1", at(4)).ok, true);
  assert.equal(state.toSnapshot().event_id, "event-1");
  assert.equal(state.toSnapshot().phase, "PICKING");
});

test("selection uses the unlock intersection and clears eligible projection on cancellation", () => {
  const state = createState();
  assert.equal(joinHost(state).ok, true);
  assert.equal(joinPlayer(state, "p1", 2).ok, true);
  assert.equal(joinPlayer(state, "p2", 3, { song_unlocks: { ...DEFAULT_UNLOCKS, owned_pack_ids: [10] } }).ok, true);
  assert.equal(state.startEvent("host", "event-1", at(4)).ok, true);
  let revision = state.toSnapshot().selection_revision;
  assert.equal(state.confirmPick("host", "pack-chart", revision, "round-bad", at(5)).reason, "CHART_NOT_AVAILABLE_TO_ALL");
  assert.equal(state.confirmPick("host", "score-chart", revision, "round-1", at(6)).ok, true);
  revision = state.toSnapshot().selection_revision;
  assert.equal(state.cancelPick("host", "round-1", revision, at(8)).ok, true);
  assert.deepEqual(state.toSnapshot().current_eligible_player_ids, []);
});

test("casual starts all eligible players without a ready action and waits for every submission", () => {
  const state = createState();
  const selectionRevision = beginSelectedRound(state, ["p1", "p2"]);
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  assert.deepEqual(state.toSnapshot().current_playing_player_ids, ["p1", "p2"]);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 2000, { score: 2000 }, at(24)).round_finalized, false);
  assert.equal(state.toSnapshot().latest_result, null);
  assert.equal(state.submit("p2", "round-1", key, 1000, null, at(25)).round_finalized, true);
  const result = state.toSnapshot().latest_result;
  assert.deepEqual(result.results.map((entry) => entry.player_id), ["p1", "p2"]);
  assert.equal("tournament_points" in result.results[0], false);
  assert.equal(JSON.stringify(state.toSnapshot()).includes("source_meta"), false);
});

for (const source of ["inf_daken_counter", "inf-notebook", "reflux"]) {
  test(`${source} accepts an observed ExpectedKey without chart_id`, () => {
    const state = createState();
    assert.equal(joinHost(state).ok, true);
    assert.equal(joinPlayer(state, "p1", 2, { source }).ok, true);
    assert.equal(state.startEvent("host", "event-1", at(3)).ok, true);
    const pickRevision = state.toSnapshot().selection_revision;
    assert.equal(state.confirmPick("host", "score-chart", pickRevision, "round-1", at(4)).ok, true);
    const readyRevision = state.toSnapshot().selection_revision;
    assert.equal(state.startRound("host", "round-1", readyRevision, at(6)).ok, true);
    const { chart_id: _chartId, ...observedWithoutChartId } = state.toSnapshot().selected_chart.expected_key;
    assert.equal(state.submit("p1", "round-1", observedWithoutChartId, 1000, null, at(7)).ok, true);
  });
}

test("daken_counter_v3 rejects a missing observed chart_id and all sources reject conflicting ids", () => {
  for (const source of ["inf_daken_counter", "inf-notebook", "daken_counter_v3", "reflux"]) {
    const state = createState();
    assert.equal(joinHost(state).ok, true);
    assert.equal(joinPlayer(state, "p1", 2, { source }).ok, true);
    assert.equal(state.startEvent("host", "event-1", at(3)).ok, true);
    const pickRevision = state.toSnapshot().selection_revision;
    assert.equal(state.confirmPick("host", "score-chart", pickRevision, "round-1", at(4)).ok, true);
    const readyRevision = state.toSnapshot().selection_revision;
    assert.equal(state.startRound("host", "round-1", readyRevision, at(6)).ok, true);
    const expected = state.toSnapshot().selected_chart.expected_key;
    assert.equal(state.submit("p1", "round-1", { ...expected, chart_id: 999 }, 1000, null, at(7)).reason, "RESULT_KEY_MISMATCH");
    if (source === "daken_counter_v3") {
      const { chart_id: _chartId, ...observedWithoutChartId } = expected;
      assert.equal(state.submit("p1", "round-1", observedWithoutChartId, 1000, null, at(8)).reason, "RESULT_KEY_MISMATCH");
    }
  }
});

test("tournament freezes N, starts all active targets, and scores tied submissions", () => {
  const state = createState("TOURNAMENT");
  const selectionRevision = beginSelectedRound(state, ["p1", "p2", "p3", "p4"], "TOURNAMENT");
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 2000, null, at(24)).ok, true);
  assert.equal(state.submit("p2", "round-1", key, 2000, null, at(25)).ok, true);
  assert.equal(state.skip("p3", "round-1", at(26)).ok, true);
  assert.equal(state.closeRound("host", "round-1", at(27)).ok, true);
  const result = state.toSnapshot().latest_result;
  assert.deepEqual(result.results.map(({ player_id, rank, tournament_points }) => [player_id, rank, tournament_points]), [
    ["p1", 1, 4], ["p2", 1, 4], ["p3", null, 0], ["p4", null, 0],
  ]);
  assert.equal(result.results[2].metric_value, HOST_EVENT_SCORE_ABSENT_VALUE);
  assert.equal(result.results[3].absence_reason, "DEADLINE");
});

test("snapshot is the authoritative source for fixed tournament roster and scoring N", () => {
  const casual = createState();
  assert.deepEqual(casual.toSnapshot().fixed_roster_player_ids, []);
  assert.equal(casual.toSnapshot().scoring_size_n, null);

  const tournament = createState("TOURNAMENT");
  assert.deepEqual(tournament.toSnapshot().fixed_roster_player_ids, []);
  assert.equal(tournament.toSnapshot().scoring_size_n, null);
  assert.equal(joinHost(tournament).ok, true);
  assert.equal(joinPlayer(tournament, "p1", 2).ok, true);
  assert.equal(joinPlayer(tournament, "p2", 3).ok, true);
  assert.equal(tournament.startEvent("host", "event-1", at(4)).ok, true);

  const snapshot = tournament.toSnapshot();
  assert.deepEqual(snapshot.fixed_roster_player_ids, ["p1", "p2"]);
  assert.equal(snapshot.scoring_size_n, 2);
  snapshot.fixed_roster_player_ids.push("not-authoritative");
  assert.deepEqual(tournament.toSnapshot().fixed_roster_player_ids, ["p1", "p2"]);

  const restored = new EventRoomState(createChartMaster());
  restored.hydrate(tournament.toPersistenceRecord());
  assert.deepEqual(restored.toSnapshot().fixed_roster_player_ids, ["p1", "p2"]);
  assert.equal(restored.toSnapshot().scoring_size_n, 2);
});

test("MISSCOUNT sorts ascending and uses 9999 for absence", () => {
  const state = createState("TOURNAMENT", false, "MISSCOUNT");
  const selectionRevision = beginSelectedRound(state, ["p1", "p2"], "TOURNAMENT");
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 4, null, at(24)).ok, true);
  assert.equal(state.closeRound("host", "round-1", at(25)).ok, true);
  const [first, absent] = state.toSnapshot().latest_result.results;
  assert.equal(first.rank, 1);
  assert.equal(first.tournament_points, 2);
  assert.equal(absent.metric_value, HOST_EVENT_MISSCOUNT_ABSENT_VALUE);
  assert.equal(absent.rank, null);
});

test("published round orders ranked submissions before absences", () => {
  const state = createState("TOURNAMENT");
  const selectionRevision = beginSelectedRound(state, ["p1", "p2", "p3"], "TOURNAMENT");
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.skip("p1", "round-1", at(24)).ok, true);
  assert.equal(state.submit("p2", "round-1", key, 1000, null, at(25)).ok, true);
  assert.equal(state.submit("p3", "round-1", key, 2000, null, at(26)).ok, true);
  assert.deepEqual(state.toSnapshot().latest_result.results.map((entry) => [entry.player_id, entry.rank]), [
    ["p3", 1], ["p2", 2], ["p1", null],
  ]);
});

test("tournament roster permits existing return but rejects a new id after start", () => {
  const state = createState("TOURNAMENT");
  assert.equal(joinHost(state).ok, true);
  assert.equal(joinPlayer(state, "p1", 2).ok, true);
  assert.equal(state.startEvent("host", "event-1", at(3)).ok, true);
  assert.equal(joinPlayer(state, "new", 4).reason, "TOURNAMENT_ALREADY_STARTED");
  assert.equal(state.leave("p1", at(5)).ok, true);
  assert.equal(joinPlayer(state, "p1", 6, { accept_new: false }).ok, true);
  assert.equal(state.toSnapshot().participants[0].pending_next, false);
});

test("casual player joining after pick is pending_next and excluded from that round", () => {
  const state = createState();
  const selectionRevision = beginSelectedRound(state, ["p1"]);
  assert.equal(joinPlayer(state, "late", 22).ok, true);
  assert.equal(state.toSnapshot().participants.find((player) => player.player_id === "late")?.pending_next, true);
  assert.deepEqual(state.toSnapshot().current_eligible_player_ids, ["p1"]);
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  assert.deepEqual(state.toSnapshot().current_playing_player_ids, ["p1"]);
});

test("tournament eligible projection keeps disconnected slots and excludes left slots", () => {
  const state = createState("TOURNAMENT");
  const selectionRevision = beginSelectedRound(state, ["p1", "p2"], "TOURNAMENT");
  assert.equal(state.disconnect("p2", at(23)).ok, true);
  assert.deepEqual(state.toSnapshot().current_eligible_player_ids, ["p1", "p2"]);
  assert.equal(joinPlayer(state, "p2", 25, { accept_new: false }).ok, true);
  assert.equal(state.leave("p2", at(26)).ok, true);
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(27)).ok, true);
  assert.equal(state.toSnapshot().participants.find((player) => player.player_id === "p2")?.round_status, "ABSENT");
});

test("zero active participants in PICKING cannot create an empty round", () => {
  const state = createState();
  assert.equal(joinHost(state).ok, true);
  assert.equal(joinPlayer(state, "p1", 2).ok, true);
  assert.equal(state.startEvent("host", "event-1", at(3)).ok, true);
  assert.equal(state.leave("p1", at(4)).ok, true);
  assert.equal(state.confirmPick("host", "score-chart", state.toSnapshot().selection_revision, "empty", at(5)).reason, "NO_ELIGIBLE_PLAYERS");
  assert.equal(state.getPublicResults().length, 0);
});

test("leave and kick make active missing players absent while preserving submitted results", () => {
  const state = createState("TOURNAMENT");
  const selectionRevision = beginSelectedRound(state, ["p1", "p2"], "TOURNAMENT");
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 1000, null, at(24)).ok, true);
  assert.equal(state.leave("p1", at(25)).ok, true);
  assert.equal(state.kick("host", "p2", at(26)).round_finalized, true);
  const results = state.toSnapshot().latest_result.results;
  assert.equal(results.find((entry) => entry.player_id === "p1")?.status, "SUBMITTED");
  assert.equal(results.find((entry) => entry.player_id === "p2")?.absence_reason, "KICKED");
  assert.equal(joinPlayer(state, "p2", 27).reason, "PLAYER_KICKED");
});

test("invalidating the latest round removes it from overall scoring and keeps history", () => {
  const state = createState("TOURNAMENT");
  const selectionRevision = beginSelectedRound(state, ["p1"], "TOURNAMENT");
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 1000, null, at(24)).round_finalized, true);
  assert.equal(state.toSnapshot().overall_results[0].total_points, 1);
  assert.equal(state.invalidateRound("host", "round-1", at(25)).ok, true);
  assert.equal(state.getPublicResults().length, 1);
  assert.notEqual(state.getPublicResults()[0].invalidated_at, null);
  assert.deepEqual(state.toSnapshot().overall_results, []);
  assert.equal(state.toSnapshot().phase, "PICKING");
});

test("result remains until NEXT_PICK and no timer advances it", () => {
  const state = createState();
  const selectionRevision = beginSelectedRound(state, ["p1"]);
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 1000, null, at(24)).ok, true);
  assert.equal(state.toSnapshot().round_phase, "RESULT");
  assert.equal(state.getNextAlarmAt(), null);
  assert.equal(state.nextPick("host", "round-1", at(10000)).ok, true);
  assert.equal(state.toSnapshot().phase, "PICKING");
});

test("host disconnect accepts submissions without publishing until reconnect", () => {
  const state = createState();
  const selectionRevision = beginSelectedRound(state, ["p1"]);
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  assert.equal(state.disconnect("host", at(24)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 1234, { secret: 1234 }, at(25)).ok, true);
  assert.equal(state.toSnapshot().latest_result, null);
  assert.equal(JSON.stringify(state.toSnapshot()).includes("1234"), false);
  assert.equal(state.skip("p1", "round-1", at(26)).reason, "HOST_DISCONNECTED");
  assert.equal(joinHost(state, 323).round_finalized, true);
  assert.equal(state.toSnapshot().latest_result.results[0].metric_value, 1234);
});

test("absolute host deadline is not extended and now >= deadline wins", () => {
  const state = createState();
  assert.equal(joinHost(state).ok, true);
  assert.equal(joinPlayer(state, "p1", 2).ok, true);
  assert.equal(state.disconnect("host", at(10)).ok, true);
  assert.equal(state.getNextAlarmAt()?.toISOString(), at(310).toISOString());
  assert.equal(joinHost(state, 309).ok, true);
  assert.equal(state.disconnect("host", at(320)).ok, true);
  assert.equal(state.getNextAlarmAt()?.toISOString(), at(620).toISOString());
  assert.equal(joinHost(state, 620).reason, "HOST_DISCONNECTED");
  assert.equal(state.toSnapshot().phase, "RESULT");
  assert.equal(state.toSnapshot().end_reason, "HOST_DISCONNECTED");
});

test("host deadline invalidates an active round without publishing private submissions", () => {
  const state = createState();
  const selectionRevision = beginSelectedRound(state, ["p1", "p2"]);
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 4321, { private_score: 4321 }, at(24)).ok, true);
  assert.equal(state.disconnect("host", at(25)).ok, true);
  assert.equal(state.expireHostDeadline(at(325)), true);
  const published = JSON.stringify(state.getPublicResults());
  assert.equal(published.includes("4321"), false);
  assert.deepEqual(state.getPublicResults()[0].results, []);
  assert.notEqual(state.getPublicResults()[0].invalidated_at, null);
});

test("never-connected host expires exactly 300 seconds after creation", () => {
  const state = createState();
  assert.equal(state.getNextAlarmAt()?.toISOString(), at(300).toISOString());
  assert.equal(state.expireHostDeadline(at(299)), false);
  assert.equal(state.expireHostDeadline(at(300)), true);
  assert.equal(state.toSnapshot().end_reason, "HOST_DISCONNECTED");
});

test("host socket close after HOST_ENDED does not mutate terminal state or recreate a deadline", () => {
  const state = createState();
  assert.equal(joinHost(state).ok, true);
  assert.equal(state.endEvent("host", at(2)).ok, true);
  const beforeDisconnect = state.toPersistenceRecord();
  assert.equal(beforeDisconnect.phase, "RESULT");
  assert.equal(beforeDisconnect.end_reason, "HOST_ENDED");
  assert.equal(beforeDisconnect.host_disconnect_deadline, null);

  assert.deepEqual(state.disconnect("host", at(3)), { ok: true, changed: false });
  assert.deepEqual(state.toPersistenceRecord(), beforeDisconnect);
  assert.equal(state.getNextAlarmAt(), null);

  const restored = new EventRoomState(createChartMaster());
  restored.hydrate(state.toPersistenceRecord());
  assert.deepEqual(restored.toPersistenceRecord(), beforeDisconnect);
});

test("idempotency distinguishes duplicate from conflicting payload and survives hydrate", () => {
  const state = createState();
  assert.deepEqual(state.checkIdempotency("p1", "request-1", "a"), { kind: "NEW" });
  state.rememberIdempotency("p1", "request-1", "a");
  assert.deepEqual(state.checkIdempotency("p1", "request-1", "a"), { kind: "DUPLICATE", applied_revision: 0 });
  assert.deepEqual(state.checkIdempotency("p1", "request-1", "b"), { kind: "CONFLICT" });
  const restored = new EventRoomState(createChartMaster());
  restored.hydrate(state.toPersistenceRecord());
  assert.equal(restored.checkIdempotency("p1", "request-1", "a").kind, "DUPLICATE");
});

test("schema2 persists settings.event_name and projects eligibility without ready", () => {
  const state = createState();
  assert.equal(joinHost(state).ok, true);
  assert.equal(joinPlayer(state, "p1", 2).ok, true);
  assert.equal(state.startEvent("host", "event-1", at(3)).ok, true);
  const pickRevision = state.toSnapshot().selection_revision;
  assert.equal(state.confirmPick("host", "score-chart", pickRevision, "round-1", at(4)).ok, true);
  const record = state.toPersistenceRecord();
  assert.equal("event_name" in record, false);
  assert.equal("ready_player_ids" in record, false);
  const restored = new EventRoomState(createChartMaster());
  restored.hydrate(record);
  assert.equal(restored.toSnapshot().settings.event_name, "Sunday session");
  assert.equal(record.schema_version, 2);
  assert.equal(restored.toSnapshot().schema_version, 2);
  assert.equal("ready" in record.participants[0], false);
  assert.equal("ready" in restored.toSnapshot().participants[0], false);
  assert.deepEqual(restored.toSnapshot().current_eligible_player_ids, ["p1"]);
});

test("hydrate rejects old or foreign records instead of creating an empty event", () => {
  const state = new EventRoomState(createChartMaster());
  assert.throws(() => state.hydrate({ schema_version: 0, room_kind: "HOST_EVENT" }), /ROOM_STATE_LOST/);
  assert.throws(() => state.hydrate({ schema_version: 2, room_kind: "NORMAL" }), /ROOM_STATE_LOST/);
});

test("hydrate rejects malformed enums, collections, phase/round links, and tournament roster N", () => {
  const lobby = createState().toPersistenceRecord();
  const tournament = createState("TOURNAMENT");
  assert.equal(joinHost(tournament).ok, true);
  assert.equal(joinPlayer(tournament, "p1", 2).ok, true);
  assert.equal(tournament.startEvent("host", "event-1", at(3)).ok, true);
  const tournamentRecord = tournament.toPersistenceRecord();
  const corruptRecords = [
    { ...structuredClone(lobby), phase: "BROKEN" },
    { ...structuredClone(lobby), participants: null },
    { ...structuredClone(lobby), rounds: null },
    { ...structuredClone(lobby), idempotency: null },
    { ...structuredClone(lobby), host_initial_connect_deadline: "not-a-date" },
    { ...structuredClone(lobby), participants: [{ player_id: "p1", source: "unknown" }] },
    { ...structuredClone(tournamentRecord), phase: "PLAYING", round_phase: "ACTIVE", current_round_id: null },
    { ...structuredClone(tournamentRecord), current_round_id: "missing-round" },
    { ...structuredClone(tournamentRecord), scoring_size_n: 2 },
    { ...structuredClone(tournamentRecord), fixed_roster_player_ids: ["p1", "missing"] },
  ];
  for (const record of corruptRecords) {
    const restored = new EventRoomState(createChartMaster());
    assert.throws(() => restored.hydrate(record), /ROOM_STATE_LOST/);
    assert.equal(restored.isInitialized(), false);
  }
});

test("hydrate enforces host lifecycle, absolute deadlines, and current-round phase consistency", () => {
  const neverConnected = createState();
  const neverConnectedRecord = neverConnected.toPersistenceRecord();

  const connected = createState();
  assert.equal(joinHost(connected).ok, true);
  const connectedRecord = connected.toPersistenceRecord();

  const disconnected = createState();
  assert.equal(joinHost(disconnected).ok, true);
  assert.equal(disconnected.disconnect("host", at(10)).ok, true);
  const disconnectedRecord = disconnected.toPersistenceRecord();

  const selected = createState();
  const selectedRevision = beginSelectedRound(selected, ["p1"]);
  const selectedRecord = selected.toPersistenceRecord();

  const playing = createState();
  const playingRevision = beginSelectedRound(playing, ["p1"]);
  assert.equal(playing.startRound("host", "round-1", playingRevision, at(23)).ok, true);
  const playingRecord = playing.toPersistenceRecord();

  const expired = createState();
  assert.equal(expired.expireHostDeadline(at(HOST_EVENT_DISCONNECT_GRACE_SECONDS)), true);
  const expiredRecord = expired.toPersistenceRecord();

  for (const record of [neverConnectedRecord, connectedRecord, disconnectedRecord, selectedRecord, playingRecord, expiredRecord]) {
    const restored = new EventRoomState(createChartMaster());
    restored.hydrate(record);
    assert.equal(restored.toPersistenceRecord().host_disconnect_deadline, record.host_disconnect_deadline);
    assert.equal(restored.toPersistenceRecord().host_initial_connect_deadline, record.host_initial_connect_deadline);
  }

  const corruptRecords = [
    { ...structuredClone(neverConnectedRecord), host_initial_connect_deadline: null },
    { ...structuredClone(neverConnectedRecord), host_initial_connect_deadline: at(301).toISOString() },
    { ...structuredClone(neverConnectedRecord), host_connected: true },
    { ...structuredClone(connectedRecord), host_disconnect_deadline: at(300).toISOString() },
    { ...structuredClone(connectedRecord), host_initial_connect_deadline: at(300).toISOString() },
    { ...structuredClone(disconnectedRecord), host_disconnect_deadline: null },
    { ...structuredClone(disconnectedRecord), host_disconnect_deadline: "invalid" },
    { ...structuredClone(disconnectedRecord), host_disconnect_deadline: at(0).toISOString() },
    { ...structuredClone(disconnectedRecord), host_initial_connect_deadline: at(300).toISOString() },
    { ...structuredClone(disconnectedRecord), event_id: "event-1", started_at: at(5).toISOString() },
    { ...structuredClone(neverConnectedRecord), event_id: "event-1", started_at: at(5).toISOString() },
    { ...structuredClone(selectedRecord), round_phase: "ACTIVE" },
    { ...structuredClone(selectedRecord), phase: "PLAYING", round_phase: "ACTIVE" },
    { ...structuredClone(playingRecord), phase: "PICKING", round_phase: null },
    { ...structuredClone(playingRecord), current_round_id: null },
    { ...structuredClone(expiredRecord), host_initial_connect_deadline: at(300).toISOString() },
    { ...structuredClone(expiredRecord), host_connected: true },
  ];
  for (const record of corruptRecords) {
    const restored = new EventRoomState(createChartMaster());
    assert.throws(() => restored.hydrate(record), /ROOM_STATE_LOST/);
    assert.equal(restored.isInitialized(), false);
  }
  assert.equal(selectedRevision, selectedRecord.selection_revision);
});

test("hydrate accepts only canonical terminal phase and end_reason pairs", () => {
  const lobby = createState();
  assert.equal(joinHost(lobby).ok, true);
  const lobbyRecord = lobby.toPersistenceRecord();

  const picking = createState();
  const pickingRevision = beginSelectedRound(picking, ["p1"]);
  const pickingRecord = picking.toPersistenceRecord();

  const playing = createState();
  const playingRevision = beginSelectedRound(playing, ["p1"]);
  assert.equal(playing.startRound("host", "round-1", playingRevision, at(23)).ok, true);
  const playingRecord = playing.toPersistenceRecord();

  const hostEnded = createState();
  assert.equal(joinHost(hostEnded).ok, true);
  assert.equal(hostEnded.endEvent("host", at(2)).ok, true);
  const hostEndedRecord = hostEnded.toPersistenceRecord();

  const hostDisconnected = createState();
  assert.equal(hostDisconnected.expireHostDeadline(at(HOST_EVENT_DISCONNECT_GRACE_SECONDS)), true);
  const hostDisconnectedRecord = hostDisconnected.toPersistenceRecord();

  const roomStateLostRecord = {
    ...structuredClone(hostEndedRecord),
    phase: "CLOSED",
    end_reason: "ROOM_STATE_LOST",
  };
  const validTerminalRecords = [hostEndedRecord, hostDisconnectedRecord, roomStateLostRecord];
  for (const record of validTerminalRecords) {
    const restored = new EventRoomState(createChartMaster());
    restored.hydrate(record);
    assert.equal(restored.toSnapshot().end_reason, record.end_reason);
  }

  const invalidTerminalPairs = [
    { ...structuredClone(hostEndedRecord), phase: "CLOSED" },
    { ...structuredClone(hostEndedRecord), end_reason: "HOST_DISCONNECTED" },
    { ...structuredClone(hostEndedRecord), end_reason: "ROOM_STATE_LOST" },
    { ...structuredClone(hostDisconnectedRecord), phase: "CLOSED" },
    { ...structuredClone(hostDisconnectedRecord), end_reason: "HOST_ENDED" },
    { ...structuredClone(hostDisconnectedRecord), end_reason: "ROOM_STATE_LOST" },
    { ...structuredClone(roomStateLostRecord), phase: "RESULT" },
    { ...structuredClone(roomStateLostRecord), end_reason: "HOST_ENDED" },
    { ...structuredClone(roomStateLostRecord), end_reason: "HOST_DISCONNECTED" },
    ...[lobbyRecord, pickingRecord, playingRecord].flatMap((record) =>
      ["HOST_ENDED", "HOST_DISCONNECTED", "ROOM_STATE_LOST"].map((endReason) => ({
        ...structuredClone(record),
        ended_at: at(100).toISOString(),
        end_reason: endReason,
      }))),
  ];
  for (const record of invalidTerminalPairs) {
    const restored = new EventRoomState(createChartMaster());
    assert.throws(() => restored.hydrate(record), /ROOM_STATE_LOST/);
    assert.equal(restored.isInitialized(), false);
  }
  assert.equal(pickingRevision, pickingRecord.selection_revision);
});

test("hydrate rejects public results inconsistent with their round and private submissions", () => {
  const state = createState("TOURNAMENT");
  const selectionRevision = beginSelectedRound(state, ["p1", "p2"], "TOURNAMENT");
  assert.equal(state.startRound("host", "round-1", selectionRevision, at(23)).ok, true);
  const key = state.toSnapshot().selected_chart.expected_key;
  assert.equal(state.submit("p1", "round-1", key, 1000, null, at(24)).ok, true);
  assert.equal(state.skip("p2", "round-1", at(25)).ok, true);
  const valid = state.toPersistenceRecord();
  const restored = new EventRoomState(createChartMaster());
  restored.hydrate(valid);
  assert.deepEqual(restored.toSnapshot().overall_results.map((entry) => entry.player_id).sort(), ["p1", "p2"]);

  const corruptRecords = [];
  const intruder = structuredClone(valid);
  intruder.rounds[0].public_result.results[0].player_id = "intruder";
  corruptRecords.push(intruder);
  const duplicate = structuredClone(valid);
  duplicate.rounds[0].public_result.results[1].player_id = duplicate.rounds[0].public_result.results[0].player_id;
  corruptRecords.push(duplicate);
  const chart = structuredClone(valid);
  chart.rounds[0].public_result.chart.chart_key = "other-chart";
  corruptRecords.push(chart);
  const time = structuredClone(valid);
  time.rounds[0].public_result.confirmed_at = at(26).toISOString();
  corruptRecords.push(time);
  const status = structuredClone(valid);
  status.rounds[0].public_result.results[0].status = "ABSENT";
  corruptRecords.push(status);
  const submission = structuredClone(valid);
  submission.rounds[0].submissions.p1.metric_value = 999;
  corruptRecords.push(submission);
  const roster = structuredClone(valid);
  roster.rounds[0].public_result.playing_player_ids.reverse();
  corruptRecords.push(roster);
  const invalidated = structuredClone(valid);
  invalidated.rounds[0].public_result.invalidated_at = at(26).toISOString();
  corruptRecords.push(invalidated);
  const points = structuredClone(valid);
  points.rounds[0].public_result.results[0].tournament_points += 1;
  corruptRecords.push(points);

  for (const record of corruptRecords) {
    const corruptRestore = new EventRoomState(createChartMaster());
    assert.throws(() => corruptRestore.hydrate(record), /ROOM_STATE_LOST/);
    assert.equal(corruptRestore.isInitialized(), false);
  }
});

for (const eventType of ["CASUAL", "TOURNAMENT"]) {
  for (const metric of ["SCORE", "MISSCOUNT"]) {
    for (const beforePick of [false, true]) {
      test(`${eventType}/${metric} 14/15 waits for disconnected slot (${beforePick ? "before" : "after"} pick)`, () => {
        const state = createState(eventType, false, metric);
        const ids = Array.from({ length: 15 }, (_, i) => `p${i}`);
        assert.equal(joinHost(state).ok, true);
        ids.forEach((id, i) => assert.equal(joinPlayer(state, id, i + 2).ok, true));
        assert.equal(state.startEvent("host", "event-15", at(20)).ok, true);
        if (beforePick) assert.equal(state.disconnect("p14", at(21)).ok, true);
        assert.equal(state.confirmPick("host", "score-chart", state.toSnapshot().selection_revision, "round-1", at(22)).ok, true);
        if (!beforePick) assert.equal(state.disconnect("p14", at(23)).ok, true);
        assert.deepEqual(state.toSnapshot().current_eligible_player_ids, ids);
        assert.equal(state.startRound("host", "round-1", state.toSnapshot().selection_revision, at(24)).ok, true);
        assert.deepEqual(state.toSnapshot().current_playing_player_ids, ids);
        const key = state.toSnapshot().selected_chart.expected_key;
        ids.slice(0, 14).forEach((id, i) => {
          const value = metric === "SCORE" ? (i < 2 ? 2000 : 2000 - i) : (i < 2 ? 0 : i);
          assert.equal(state.submit(id, "round-1", key, value, { secret: 314159 }, at(25 + i)).ok, true);
        });
        assert.equal(state.toSnapshot().round_phase, "ACTIVE");
        assert.equal(state.toSnapshot().latest_result, null);
        assert.equal(state.toSnapshot().participants.find((p) => p.player_id === "p14").round_status, "PENDING");
        assert.equal(JSON.stringify(state.toSnapshot()).includes("314159"), false);
        const restored = new EventRoomState(createChartMaster());
        restored.hydrate(state.toPersistenceRecord());
        assert.equal(restored.toSnapshot().round_phase, "ACTIVE");
        assert.equal(restored.closeRound("host", "round-1", at(40)).ok, true);
        const result = restored.toSnapshot().latest_result;
        const absent = result.results.find((p) => p.player_id === "p14");
        assert.equal(absent.absence_reason, "DEADLINE");
        assert.equal(absent.rank, null);
        assert.equal(absent.metric_value, metric === "SCORE" ? 0 : 9999);
        if (eventType === "TOURNAMENT") {
          assert.equal(restored.toSnapshot().scoring_size_n, 15);
          assert.deepEqual(result.results.slice(0, 3).map((p) => [p.rank, p.tournament_points]), [[1, 15], [1, 15], [3, 13]]);
          assert.equal(absent.tournament_points, 0);
        } else assert.equal("tournament_points" in absent, false);
        assert.equal(joinPlayer(restored, "p14", 41, { accept_new: false }).ok, true);
        assert.equal(restored.submit("p14", "round-1", key, 100, null, at(42)).ok, false);
        assert.equal(restored.nextPick("host", "round-1", at(43)).ok, true);
        assert.equal(restored.confirmPick("host", "score-chart", restored.toSnapshot().selection_revision, "round-2", at(44)).ok, true);
        assert.deepEqual(restored.toSnapshot().current_eligible_player_ids, ids);
        assert.equal(restored.startRound("host", "round-2", restored.toSnapshot().selection_revision, at(45)).ok, true);
        assert.deepEqual(restored.toSnapshot().current_playing_player_ids, ids);
      });
    }
  }

  test(`${eventType} temporary reconnect accepts first same-round submission before deadline`, () => {
    const state = createState(eventType);
    const revision = beginSelectedRound(state, ["p1", "p2"], eventType);
    assert.equal(state.disconnect("p2", at(22)).ok, true);
    assert.equal(state.startRound("host", "round-1", revision, at(23)).ok, true);
    const key = state.toSnapshot().selected_chart.expected_key;
    assert.equal(state.submit("p1", "round-1", key, 1000, null, at(24)).round_finalized, false);
    assert.equal(joinPlayer(state, "p2", 25, { accept_new: false }).ok, true);
    assert.equal(state.toSnapshot().participants.find((p) => p.player_id === "p2").pending_next, false);
    assert.equal(state.submit("p2", "round-1", key, 2000, null, at(26)).round_finalized, true);
    assert.equal(state.submit("p2", "round-1", key, 3000, null, at(27)).ok, false);
    assert.equal(state.toSnapshot().latest_result.results.find((p) => p.player_id === "p2").metric_value, 2000);
  });

  test(`${eventType} LEFT return and KICK stay excluded and zero eligible cannot start`, () => {
    const state = createState(eventType);
    const revision = beginSelectedRound(state, ["p1", "p2", "p3"], eventType);
    assert.equal(state.leave("p2", at(22)).ok, true);
    assert.equal(joinPlayer(state, "p2", 23, { accept_new: false }).ok, true);
    assert.equal(state.kick("host", "p3", at(24)).ok, true);
    assert.deepEqual(state.toSnapshot().current_eligible_player_ids, ["p1"]);
    const copy = new EventRoomState(createChartMaster());
    copy.hydrate(state.toPersistenceRecord());
    assert.equal(copy.leave("p1", at(25)).ok, true);
    assert.deepEqual(copy.toSnapshot().current_eligible_player_ids, []);
    assert.equal(copy.startRound("host", "round-1", revision, at(26)).reason, "START_REQUIRES_ELIGIBLE_PLAYER");
    assert.equal(state.startRound("host", "round-1", revision, at(25)).ok, true);
    if (eventType === "TOURNAMENT") {
      assert.equal(state.toSnapshot().scoring_size_n, 3);
      const record = state.toPersistenceRecord();
      assert.equal(record.rounds[0].submissions.p2.absence_reason, "NOT_PRESENT");
      assert.equal(record.rounds[0].submissions.p3.absence_reason, "NOT_PRESENT");
    } else assert.deepEqual(state.toSnapshot().current_playing_player_ids, ["p1"]);
  });

  test(`${eventType} all disconnected eligible slots still permit Host start`, () => {
    const state = createState(eventType);
    const revision = beginSelectedRound(state, ["p1", "p2"], eventType);
    assert.equal(state.disconnect("p1", at(22)).ok, true);
    assert.equal(state.disconnect("p2", at(23)).ok, true);
    assert.equal(state.startRound("host", "round-1", revision, at(24)).ok, true);
    assert.deepEqual(state.toSnapshot().current_playing_player_ids, ["p1", "p2"]);
    assert.equal(state.toSnapshot().round_phase, "ACTIVE");
    assert.equal(state.toSnapshot().latest_result, null);
  });
}

for (const elapsed of [299999, 300000, 300001]) {
  test(`restored Host reconnect at ${elapsed}ms obeys original absolute deadline`, () => {
    const state = createState();
    const revision = beginSelectedRound(state, ["p1"]);
    assert.equal(state.startRound("host", "round-1", revision, at(23)).ok, true);
    assert.equal(state.disconnect("host", at(24)).ok, true);
    const key = state.toSnapshot().selected_chart.expected_key;
    assert.equal(state.submit("p1", "round-1", key, 7654, { secret: 7654 }, at(25)).ok, true);
    assert.equal(state.toSnapshot().latest_result, null);
    const restored = new EventRoomState(createChartMaster());
    restored.hydrate(state.toPersistenceRecord());
    assert.equal(restored.getNextAlarmAt().getTime(), at(24).getTime() + 300000);
    const result = restored.join({ player_id: "host", display_name: "Host", accept_new: false, now: new Date(at(24).getTime() + elapsed) });
    if (elapsed < 300000) {
      assert.equal(result.ok, true);
      assert.equal(restored.toSnapshot().latest_result.results[0].metric_value, 7654);
    } else {
      assert.equal(result.reason, "HOST_DISCONNECTED");
      assert.equal(restored.toSnapshot().end_reason, "HOST_DISCONNECTED");
      assert.equal(JSON.stringify(restored.getPublicResults()).includes("7654"), false);
    }
  });
}

test("schema1 records at every phase fail closed without mutating their original data", () => {
  const state = createState("TOURNAMENT");
  const records = [state.toPersistenceRecord()];
  const revision = beginSelectedRound(state, ["p1"], "TOURNAMENT");
  records.push(state.toPersistenceRecord());
  assert.equal(state.startRound("host", "round-1", revision, at(23)).ok, true);
  records.push(state.toPersistenceRecord());
  assert.equal(state.submit("p1", "round-1", state.toSnapshot().selected_chart.expected_key, 9876, null, at(24)).ok, true);
  records.push(state.toPersistenceRecord());
  assert.equal(state.endEvent("host", at(25)).ok, true);
  records.push(state.toPersistenceRecord());
  records.push({ ...state.toPersistenceRecord(), phase: "CLOSED", end_reason: "ROOM_STATE_LOST" });
  assert.deepEqual([...new Set(records.map((record) => record.phase))], ["LOBBY", "PICKING", "PLAYING", "RESULT", "CLOSED"]);
  for (const record of records) {
    record.schema_version = 1;
    for (const participant of record.participants) participant.ready = true;
    const original = structuredClone(record);
    const restored = new EventRoomState(createChartMaster());
    assert.throws(() => restored.hydrate(record), /ROOM_STATE_LOST/);
    assert.equal(restored.isInitialized(), false);
    assert.deepEqual(record, original);
  }
});

test("Host start enforces authority, selected round and revision even without ready", () => {
  const state = createState();
  const revision = beginSelectedRound(state, ["p1"]);
  assert.equal(state.startRound("p1", "round-1", revision, at(22)).reason, "NOT_HOST");
  assert.equal(state.startRound("host", "old-round", revision, at(22)).reason, "INVALID_STATE");
  assert.equal(state.startRound("host", "round-1", revision - 1, at(22)).reason, "INVALID_STATE");
  assert.equal(state.disconnect("host", at(23)).ok, true);
  assert.equal(state.startRound("host", "round-1", revision, at(24)).reason, "HOST_DISCONNECTED");
  assert.equal(joinHost(state, 25).ok, true);
  assert.equal(state.cancelPick("host", "round-1", revision, at(26)).ok, true);
  assert.equal(state.startRound("host", "round-1", revision, at(27)).reason, "INVALID_STATE");
});

test("latest-round invalidation is ordered against next-round start and zero valid rounds has no winner", () => {
  const state = createState("TOURNAMENT");
  assert.deepEqual(state.toSnapshot().overall_results, []);
  const revision = beginSelectedRound(state, ["p1"], "TOURNAMENT");
  assert.equal(state.startRound("host", "round-1", revision, at(22)).ok, true);
  assert.equal(state.submit("p1", "round-1", state.toSnapshot().selected_chart.expected_key, 1234, null, at(23)).ok, true);
  assert.equal(state.nextPick("host", "round-1", at(24)).ok, true);
  assert.equal(state.confirmPick("host", "score-chart", state.toSnapshot().selection_revision, "round-2", at(25)).ok, true);
  const copy = new EventRoomState(createChartMaster());
  copy.hydrate(state.toPersistenceRecord());
  assert.equal(state.invalidateRound("host", "round-1", at(26)).ok, true);
  assert.deepEqual(state.toSnapshot().overall_results, []);
  assert.equal(state.toSnapshot().current_round_id, "round-2");
  assert.equal(copy.startRound("host", "round-2", copy.toSnapshot().selection_revision, at(26)).ok, true);
  assert.equal(copy.invalidateRound("host", "round-1", at(26)).reason, "ROUND_LOCKED");
  assert.equal(state.endEvent("host", at(27)).ok, true);
  assert.deepEqual(state.toSnapshot().overall_results, []);
});
