import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EVENT_MAX_PLAYERS } from "@infinitas/shared";
import { EventRoomController } from "../apps/worker/src/durable/event-room-controller";
import { handleGetCapabilities } from "../apps/worker/src/routes/capabilities";

const fixture = JSON.parse(await readFile(new URL("../testdata/e2e/host-event/scenarios.json", import.meta.url), "utf8"));
const ROOM_ID = "host-event-e2e";
const JOIN_CODE = "E2E188AA";
const UNLOCKS = { bit_unlocked: true, djp_unlocked: true, allow_leggendaria: true, owned_pack_ids: [] };

class Storage {
  values = new Map();
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { this.values.delete(key); }
  async deleteAlarm() {}
  async setAlarm() {}
}

class Socket {
  readyState = 1;
  sent = [];
  attachment = null;
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return this.attachment; }
}

function createHarness(settings) {
  const storage = new Storage();
  const durableState = { storage, sockets: [], getWebSockets() { return this.sockets; } };
  const controller = new EventRoomController(durableState, { HOST_EVENT_ACCEPT_NEW: "true", MIN_SUPPORTED_CLIENT_VERSION: "1.4.0" });
  return { controller, storage, settings };
}

async function initialize(harness) {
  await harness.controller.initialize({
    room_id: ROOM_ID,
    created_at: new Date().toISOString(),
    host_player_id: "host",
    host_display_name: "Host",
    settings: {
      event_name: `E2E ${harness.settings.event_type}`,
      event_type: harness.settings.event_type,
      host_plays: harness.settings.host_plays,
      play_style: "SP",
      win_metric: "SCORE",
      visibility: "PRIVATE",
      join_code: JOIN_CODE,
    },
  });
}

class ProtocolClient {
  constructor(harness, playerId, source = "inf-notebook") {
    this.harness = harness;
    this.playerId = playerId;
    this.source = source;
    this.socket = new Socket();
    harness.controller.registerSocket(this.socket);
  }

  async join() {
    const payload = {
      host_event_protocol: 2,
      client_version: "1.4.0",
      join_code: JOIN_CODE,
      display_name: this.playerId,
      ...(this.source === null ? {} : { source: this.source, song_unlocks: UNLOCKS }),
    };
    await this.send("EVENT_JOIN", payload);
    assert.equal(this.last("EVENT_JOIN_ACCEPTED")?.type, "EVENT_JOIN_ACCEPTED", `${this.playerId} join`);
  }

  async action(action, fields = {}) {
    const snapshot = this.snapshot();
    const requestId = `${this.playerId}-${action.toLowerCase()}-${crypto.randomUUID()}`;
    await this.send("EVENT_ACTION", {
      action,
      request_id: requestId,
      generation: snapshot.generation,
      ...(snapshot.event_id === null ? {} : { event_id: snapshot.event_id }),
      ...fields,
    }, requestId);
    const error = this.socket.sent.findLast((message) => message.type === "EVENT_ERROR" && message.payload.request_id === requestId);
    assert.equal(error, undefined, `${action} rejected: ${error?.payload?.code ?? "unknown"}`);
    return requestId;
  }

  async send(type, payload, clientMsgId = crypto.randomUUID()) {
    await this.harness.controller.message(this.socket, JSON.stringify({
      type,
      client_msg_id: clientMsgId,
      room_id: ROOM_ID,
      player_id: this.playerId,
      payload,
    }));
  }

  snapshot() {
    return this.last("EVENT_STATE")?.payload.event_room_snapshot
      ?? this.last("EVENT_JOIN_ACCEPTED")?.payload.event_room_snapshot;
  }

  last(type) { return this.socket.sent.findLast((message) => message.type === type); }
}

async function firstChart(controller) {
  const response = await controller.chartSearch(new URL("https://e2e.invalid/charts?level_filter=ANY&limit=1"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.charts.length > 0, "bundled chart master must expose a common chart");
  return body.charts[0];
}

async function selectAndStart(host, players, chart) {
  let snapshot = host.snapshot();
  await host.action("CONFIRM_PICK", { chart_key: chart.chart_key, selection_revision: snapshot.selection_revision });
  snapshot = host.snapshot();
  assert.ok(snapshot.current_eligible_player_ids.length > 0);
  assert.ok(snapshot.participants.every((participant) => !("ready" in participant)));
  snapshot = host.snapshot();
  await host.action("START_ROUND", { round_id: snapshot.current_round_id, selection_revision: snapshot.selection_revision });
  return host.snapshot();
}

test("CASUAL two-round protocol clients keep scores private, auto-finalize, advance, and recover Host disconnect", async () => {
  const harness = createHarness(fixture.casual);
  await initialize(harness);
  const host = new ProtocolClient(harness, "host", null);
  const players = fixture.casual.players.map((id) => new ProtocolClient(harness, id));
  await host.join();
  for (const player of players) await player.join();
  await host.action("START_EVENT");
  const chart = await firstChart(harness.controller);

  let snapshot = await selectAndStart(host, players, chart);
  await players[0].action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: fixture.casual.round_metrics[0][0] });
  assert.equal(JSON.stringify(host.snapshot()).includes(String(fixture.casual.round_metrics[0][0])), false, "unfinalized score leaked to Host");
  await players[1].action("SKIP", { round_id: snapshot.current_round_id });
  snapshot = host.snapshot();
  assert.equal(snapshot.round_phase, "RESULT");
  assert.equal(snapshot.latest_result.results.length, 2);
  await host.action("NEXT_PICK", { round_id: snapshot.current_round_id });
  assert.equal(host.snapshot().phase, "PICKING");

  snapshot = await selectAndStart(host, players, chart);
  await harness.controller.close(host.socket);
  await players[0].action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: fixture.casual.round_metrics[1][0] });
  await players[1].action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: fixture.casual.round_metrics[1][1] });
  assert.equal(JSON.stringify(players[0].snapshot()).includes(String(fixture.casual.round_metrics[1][0])), false, "score published while Host disconnected");
  const reconnected = new ProtocolClient(harness, "host", null);
  await reconnected.join();
  assert.equal(reconnected.snapshot().latest_result.results.length, 2);
  await reconnected.action("END_EVENT");
  assert.equal(reconnected.snapshot().phase, "RESULT");
});

test("TOURNAMENT playing Host freezes N and completes two rounds with ties and absences", async () => {
  const harness = createHarness(fixture.tournament);
  await initialize(harness);
  const host = new ProtocolClient(harness, "host");
  const guests = fixture.tournament.players.map((id) => new ProtocolClient(harness, id));
  await host.join();
  for (const guest of guests) await guest.join();
  await host.action("START_EVENT");
  let snapshot = host.snapshot();
  assert.deepEqual(snapshot.fixed_roster_player_ids, ["host", ...fixture.tournament.players]);
  assert.equal(snapshot.scoring_size_n, 3);
  const chart = await firstChart(harness.controller);

  const targets = [host, ...guests];
  snapshot = await selectAndStart(host, targets, chart);
  for (const player of [host, guests[0]]) {
    await player.action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: fixture.tournament.round_metrics[0][0] });
  }
  await guests[1].action("SKIP", { round_id: snapshot.current_round_id });
  snapshot = host.snapshot();
  assert.deepEqual(snapshot.latest_result.results.map((entry) => [entry.rank, entry.tournament_points]), [[1, 3], [1, 3], [null, 0]]);
  await host.action("NEXT_PICK", { round_id: snapshot.current_round_id });

  snapshot = await selectAndStart(host, targets, chart);
  await host.action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: fixture.tournament.round_metrics[1][0] });
  await guests[0].action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: fixture.tournament.round_metrics[1][1] });
  await host.action("CLOSE_ROUND", { round_id: snapshot.current_round_id });
  snapshot = host.snapshot();
  assert.equal(snapshot.latest_result.results.find((entry) => entry.player_id === guests[1].playerId).tournament_points, 0);
  assert.equal(snapshot.overall_results.length, 3);
  await host.action("END_EVENT");
});

test("capacity integration supports 20 participants with a dedicated Host and 19 with a playing Host", async () => {
  for (const hostPlays of [false, true]) {
    const harness = createHarness({ event_type: "CASUAL", host_plays: hostPlays });
    await initialize(harness);
    const host = new ProtocolClient(harness, "host", hostPlays ? "inf-notebook" : null);
    await host.join();
    const playerCount = hostPlays ? EVENT_MAX_PLAYERS - 1 : EVENT_MAX_PLAYERS;
    for (let index = 0; index < playerCount; index += 1) await new ProtocolClient(harness, `p-${hostPlays}-${index}`).join();
    assert.equal(host.snapshot().participants.length, EVENT_MAX_PLAYERS);
    const overflow = new ProtocolClient(harness, `overflow-${hostPlays}`);
    await overflow.send("EVENT_JOIN", { host_event_protocol: 2, client_version: "1.4.0", join_code: JOIN_CODE, display_name: "Overflow", source: "inf-notebook", song_unlocks: UNLOCKS });
    assert.equal(overflow.last("EVENT_ERROR").payload.code, "ROOM_FULL");
  }
});

test("capability boundary is disabled by default and enabled only by the explicit flag", async () => {
  assert.deepEqual(await handleGetCapabilities({}).json(), { host_event_protocol: 2, host_event_accept_new: false });
  assert.deepEqual(await handleGetCapabilities({ HOST_EVENT_ACCEPT_NEW: "true" }).json(), { host_event_protocol: 2, host_event_accept_new: true });
});

test("15-player rounds wait at 14/15, allow same-round reconnect, and reject late submission after the deadline", async () => {
  for (const event_type of ["CASUAL", "TOURNAMENT"]) {
    const harness = createHarness({ event_type, host_plays: false });
    await initialize(harness);
    const host = new ProtocolClient(harness, "host", null);
    await host.join();
    const players = Array.from({ length: 15 }, (_, i) => new ProtocolClient(harness, `p${i}`));
    for (const player of players) await player.join();
    await host.action("START_EVENT");
    const chart = await firstChart(harness.controller);
    let snapshot = await selectAndStart(host, players, chart);
    await harness.controller.close(players[14].socket);
    for (const player of players.slice(0, 14)) await player.action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: 2100 });
    assert.equal(host.snapshot().round_phase, "ACTIVE");
    assert.equal(host.snapshot().latest_result, null);
    const restored = new ProtocolClient(harness, players[14].playerId);
    await restored.join();
    assert.equal(restored.snapshot().participants.find((p) => p.player_id === restored.playerId).round_status, "PENDING");
    await restored.action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: 2200 });
    assert.equal(host.snapshot().round_phase, "RESULT");
    await host.action("NEXT_PICK", { round_id: snapshot.current_round_id });
    snapshot = await selectAndStart(host, players, chart);
    await harness.controller.close(restored.socket);
    for (const player of players.slice(0, 14)) await player.action("SUBMIT", { round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: 2300 });
    assert.equal(host.snapshot().round_phase, "ACTIVE");
    await host.action("CLOSE_ROUND", { round_id: snapshot.current_round_id });
    assert.equal(host.snapshot().latest_result.results.find((entry) => entry.player_id === restored.playerId).absence_reason, "DEADLINE");
    const late = new ProtocolClient(harness, restored.playerId);
    await late.join();
    const request_id = crypto.randomUUID();
    await late.send("EVENT_ACTION", { action: "SUBMIT", request_id, generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: 9999 });
    assert.ok(late.last("EVENT_ERROR"));
    assert.equal(host.snapshot().latest_result.results.find((entry) => entry.player_id === restored.playerId).metric_value, 0);
  }
});

test("protocol 1 cannot JOIN protocol 2 and deprecated event Ready is rejected", async () => {
  const harness = createHarness(fixture.casual);
  await initialize(harness);
  const old = new ProtocolClient(harness, "old");
  await old.send("EVENT_JOIN", { host_event_protocol: 1, client_version: "1.4.0", join_code: JOIN_CODE, display_name: "Old", source: "inf-notebook", song_unlocks: UNLOCKS });
  assert.ok(old.last("EVENT_ERROR"));
  assert.equal(old.last("EVENT_JOIN_ACCEPTED"), undefined);
  const host = new ProtocolClient(harness, "host", null);
  await host.join();
  await host.send("EVENT_ACTION", { action: "SET_READY", request_id: crypto.randomUUID(), generation: host.snapshot().generation, ready: true });
  assert.ok(host.last("EVENT_ERROR"));
  assert.equal(host.snapshot().participants.length, 0);
});
