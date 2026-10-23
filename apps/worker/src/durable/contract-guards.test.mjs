import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_MESSAGE_TYPES,
  CLOSE_REASONS,
  HOST_EVENT_PHASES,
  HOST_EVENT_PROTOCOL,
  SERVER_MESSAGE_TYPES,
} from "@infinitas/shared";
import { RoomLobbyState } from "./room-state.ts";

function buildChart(chartKey, titleSearchKey, title, level) {
  return {
    chart_key: chartKey,
    inf_unlock_type: "initial",
    inf_pack_id: null,
    expected_key: {
      play_style: "SP",
      difficulty: "HYPER",
      title_search_key: titleSearchKey,
    },
    display: {
      title,
      level,
    },
  };
}

function createChartMaster() {
  const charts = [
    buildChart("chart-1", "chart-one", "Chart One", 11),
    buildChart("chart-2", "chart-two", "Chart Two", 10),
    buildChart("chart-3", "chart-three", "Chart Three", 9),
  ];
  const chartsByKey = new Map(charts.map((chart) => [chart.chart_key, chart]));

  return {
    resolvePickChartKey(pickChartKey) {
      return chartsByKey.get(pickChartKey) ?? null;
    },
    pickRandomUnusedChart({ used_chart_keys }) {
      return charts.find((chart) => !used_chart_keys.has(chart.chart_key)) ?? null;
    },
    searchCharts() {
      return { entries: [], next_cursor: null, previous_cursor: null };
    },
    getMetadata() {
      return {
        source_repo: "test",
        release_tag: "test",
        sqlite_file_name: "test.sqlite3",
        schema_version: "1",
        generated_at: "2026-03-24T00:00:00.000Z",
        sha256: "test",
        byte_size: 0,
      };
    },
  };
}

function createArenaResultReadyState() {
  const state = new RoomLobbyState(createChartMaster());
  state.initialize({
    room_id: "room-1",
    created_at: "2026-03-24T00:00:00.000Z",
    settings: {
      visibility: "PUBLIC",
      join_code: "ABCDEFGH",
      mode: "ARENA",
      win_metric: "SCORE",
      play_style: "SP",
      level_filter: "ANY",
      room_comment: "contract guard",
      max_players: 2,
    },
  });

  assert.equal(
    state.joinPlayer({
      player_id: "host",
      display_name: "Host",
      source: "inf-notebook",
      now: new Date("2026-03-24T00:00:01.000Z"),
    }).ok,
    true,
  );
  assert.equal(
    state.joinPlayer({
      player_id: "guest",
      display_name: "Guest",
      source: "daken_counter_v3",
      now: new Date("2026-03-24T00:00:02.000Z"),
    }).ok,
    true,
  );

  assert.equal(state.setPlayerReady("host", true).ok, true);
  assert.equal(state.setPlayerReady("guest", true).ok, true);
  assert.equal(state.startMatch("host", new Date("2026-03-24T00:01:00.000Z")).ok, true);
  assert.equal(state.submitPick("host", "chart-1", new Date("2026-03-24T00:01:01.000Z")).ok, true);
  assert.equal(state.submitPick("guest", "chart-2", new Date("2026-03-24T00:01:02.000Z")).ok, true);

  while (state.getRoomState() === "PLAYING") {
    const snapshot = state.toSnapshot();
    assert.ok(snapshot.current_round);
    const round = snapshot.current_round;
    assert.equal(state.submitResult("host", round.round_index, round.expected_key, 2000, null, new Date()).ok, true);
    assert.equal(state.submitResult("guest", round.round_index, round.expected_key, 1500, null, new Date()).ok, true);
  }

  return state;
}

test("CloseReason contract includes ROOM_STATE_LOST", () => {
  assert.equal(CLOSE_REASONS.includes("ROOM_STATE_LOST"), true);
});

test("RESULT_READY payload follows structured per_round/per_player contract", () => {
  const state = createArenaResultReadyState();
  const payload = state.getResultReadyPayload();
  assert.ok(payload);

  assert.equal(Array.isArray(payload.per_round.rounds), true);
  assert.equal(Array.isArray(payload.per_player.players), true);
  assert.ok(payload.per_round.rounds.length > 0);
  assert.ok(payload.per_player.players.length > 0);

  const firstRound = payload.per_round.rounds[0];
  assert.equal(typeof firstRound.round_index, "number");
  assert.equal(typeof firstRound.played, "boolean");
  assert.equal(Array.isArray(firstRound.results), true);

  const firstPlayer = payload.per_player.players[0];
  assert.equal(typeof firstPlayer.player_id, "string");
  assert.equal(Array.isArray(firstPlayer.rounds), true);
});

test("host event protocol is additive and uses dedicated message families", () => {
  assert.equal(HOST_EVENT_PROTOCOL, 1);
  assert.deepEqual(HOST_EVENT_PHASES, ["LOBBY", "PICKING", "PLAYING", "RESULT", "CLOSED"]);
  assert.equal(CLIENT_MESSAGE_TYPES.includes("ROOM_JOIN"), true);
  assert.equal(CLIENT_MESSAGE_TYPES.includes("EVENT_JOIN"), true);
  assert.equal(CLIENT_MESSAGE_TYPES.includes("EVENT_ACTION"), true);
  assert.equal(SERVER_MESSAGE_TYPES.includes("ROOM_UPDATED"), true);
  for (const type of ["EVENT_JOIN_ACCEPTED", "EVENT_STATE", "EVENT_ACTION_ACK", "EVENT_RESULTS", "EVENT_ERROR"]) {
    assert.equal(SERVER_MESSAGE_TYPES.includes(type), true);
  }
});
