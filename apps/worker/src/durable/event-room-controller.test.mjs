import assert from "node:assert/strict";
import test from "node:test";
import { EventRoomController, EVENT_ROOM_RECORD_STORAGE_KEY } from "./event-room-controller";

class Storage {
  values = new Map(); alarms = []; alarmAttempts = []; failPut = false; failAlarm = false; failAlarmAttempts = 0;
  async get(key) { return this.values.get(key); }
  async put(key, value) { if (this.failPut) throw new Error("put failed"); this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async deleteAlarm() { if (this.failAlarm) throw new Error("alarm failed"); this.alarms.push(null); }
  async setAlarm(value) {
    const millis = value instanceof Date ? value.getTime() : value;
    this.alarmAttempts.push(millis);
    if (this.failAlarmAttempts > 0) { this.failAlarmAttempts -= 1; throw new Error("alarm failed"); }
    if (this.failAlarm) throw new Error("alarm failed");
    this.alarms.push(millis);
  }
}
class Socket {
  readyState = 1; sent = []; closed = []; attachment = null;
  send(value) { this.sent.push(JSON.parse(value)); }
  close(code, reason) { this.closed.push({ code, reason }); this.readyState = 3; }
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return this.attachment; }
}
function setup() {
  const storage = new Storage();
  const state = { storage, sockets: [], getWebSockets() { return this.sockets; } };
  const env = { HOST_EVENT_ACCEPT_NEW: "true", MIN_SUPPORTED_CLIENT_VERSION: "1.4.0" };
  return { controller: new EventRoomController(state, env), state, storage };
}
function init(controller, createdAt = new Date().toISOString()) {
  return controller.initialize({ room_id: "event-1", created_at: createdAt, host_player_id: "host", host_display_name: "Host",
    settings: { event_name: "  name  ", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "ABC123" } });
}
function envelope(type, player, payload, id = type === "EVENT_ACTION" ? payload.request_id : crypto.randomUUID()) { return JSON.stringify({ type, client_msg_id: id, room_id: "event-1", player_id: player, payload }); }
function joinPayload(displayName, source) { return { host_event_protocol: 1, client_version: "1.4.0", join_code: "ABC123", display_name: displayName,
  ...(source ? { source, song_unlocks: { bit_unlocked: true, djp_unlocked: true, allow_leggendaria: true, owned_pack_ids: [] } } : {}) }; }

test("event controller uses a separate key, keeps name whitespace, and sets the absolute initial deadline", async () => {
  const { controller, storage } = setup(); const createdAt = new Date().toISOString(); await init(controller, createdAt);
  assert.equal(storage.values.has("room-record"), false);
  assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).settings.event_name, "  name  ");
  assert.equal(storage.alarms.at(-1), Date.parse(createdAt) + 300_000);
});
test("EVENT_JOIN succeeds while normal protocol is rejected before a snapshot", async () => {
  const { controller } = setup(); await init(controller);
  const normal = new Socket(); controller.registerSocket(normal);
  await controller.message(normal, envelope("ROOM_JOIN", "host", { display_name: "Host", source: "inf-notebook" }));
  assert.equal(normal.sent.at(-1).type, "EVENT_ERROR"); assert.equal(normal.sent.some((e) => e.type === "EVENT_STATE"), false);
  const host = new Socket(); controller.registerSocket(host); await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  assert.equal(host.sent.some((e) => e.type === "EVENT_JOIN_ACCEPTED"), true);
  const beforePing = host.sent.length; await controller.message(host, envelope("PING", "host", {}));
  assert.equal(host.sent.at(-1).type, "PONG"); assert.equal(host.sent.length, beforePing + 1);
});
test("empty envelope/action identifiers and client_msg_id/request_id mismatch are rejected", async () => {
  const { controller } = setup(); await init(controller);
  const socket = new Socket(); controller.registerSocket(socket);
  await controller.message(socket, envelope("EVENT_JOIN", " ", joinPayload("Guest", "inf-notebook")));
  assert.equal(socket.sent.at(-1).payload.code, "INVALID_MESSAGE");
  await controller.message(socket, envelope("EVENT_JOIN", "host", joinPayload("Host"), " "));
  assert.equal(socket.sent.at(-1).payload.code, "INVALID_MESSAGE");
  await controller.message(socket, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(socket, envelope("EVENT_ACTION", "host", { action: "STATE_GET", request_id: "request", generation: 1 }, "different"));
  assert.equal(socket.sent.at(-1).payload.code, "INVALID_ACTION");
  await controller.message(socket, envelope("EVENT_ACTION", "host", { action: "KICK", request_id: "target-empty", generation: 1, target_player_id: " " }));
  assert.equal(socket.sent.at(-1).payload.code, "INVALID_ACTION");
});
test("failed join persistence rolls back and sends no accepted snapshot", async () => {
  const { controller, storage } = setup(); await init(controller);
  const guest = new Socket(); controller.registerSocket(guest); storage.failPut = true;
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  assert.equal(guest.sent.at(-1).payload.code, "STORAGE_FAILURE"); assert.equal(guest.sent.some((e) => e.type === "EVENT_JOIN_ACCEPTED"), false);
  storage.failPut = false; await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  assert.equal(guest.sent.some((e) => e.type === "EVENT_JOIN_ACCEPTED"), true);
});
test("new connection replaces old socket and stale socket cannot act", async () => {
  const { controller } = setup(); await init(controller);
  const first = new Socket(); controller.registerSocket(first); await controller.message(first, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  const second = new Socket(); controller.registerSocket(second); await controller.message(second, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  assert.equal(first.closed[0].code, 4002);
  first.readyState = 1; await controller.message(first, envelope("EVENT_ACTION", "host", { action: "STATE_GET", request_id: "s", generation: 1 }));
  assert.equal(first.sent.at(-1).payload.code, "EVENT_JOIN_REQUIRED");
});
test("failed action persistence rolls back idempotency and mutation before retry", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); const guest = new Socket(); controller.registerSocket(host); controller.registerSocket(guest);
  await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  const action = { action: "START_EVENT", request_id: "start-fail", generation: 1 };
  storage.failPut = true; await controller.message(host, envelope("EVENT_ACTION", "host", action));
  assert.equal(host.sent.at(-1).payload.code, "STORAGE_FAILURE");
  storage.failPut = false; await controller.message(host, envelope("EVENT_ACTION", "host", action));
  assert.equal(host.sent.filter((entry) => entry.type === "EVENT_ACTION_ACK").at(-1).payload.duplicate, undefined);
});
test("alarm failure compensates durable action state and restart can retry the same request", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); const guest = new Socket(); controller.registerSocket(host); controller.registerSocket(guest);
  await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  const action = { action: "START_EVENT", request_id: "alarm-fail", generation: 1 };
  storage.failAlarm = true; await controller.message(host, envelope("EVENT_ACTION", "host", action));
  assert.equal(host.sent.at(-1).payload.code, "STORAGE_FAILURE"); assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).event_id, null);
  storage.failAlarm = false;
  const restartedState = { storage, sockets: [], getWebSockets() { return this.sockets; } };
  const restarted = new EventRoomController(restartedState, { HOST_EVENT_ACCEPT_NEW: "true", MIN_SUPPORTED_CLIENT_VERSION: "1.4.0" });
  await restarted.restore(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY));
  const reconnect = new Socket(); restarted.registerSocket(reconnect); await restarted.message(reconnect, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await restarted.message(reconnect, envelope("EVENT_ACTION", "host", action));
  assert.equal(reconnect.sent.filter((entry) => entry.type === "EVENT_ACTION_ACK").at(-1).payload.duplicate, undefined);
});
test("non-object source_meta is rejected before persistence", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); controller.registerSocket(host); await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  const before = JSON.stringify(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY));
  await controller.message(host, envelope("EVENT_ACTION", "host", { action: "SUBMIT", request_id: "bad-meta", generation: 1, event_id: "event", round_id: "round", observed_key: {}, metric_value: 1, source_meta: [] }));
  assert.equal(host.sent.at(-1).payload.code, "INVALID_ACTION"); assert.equal(JSON.stringify(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY)), before);
});
test("broken persisted records fail closed", async () => {
  const { controller, storage } = setup(); await init(controller); const record = storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY);
  const broken = setup(); await broken.controller.restore({ ...record, phase: "BROKEN" });
  const socket = new Socket(); broken.controller.registerSocket(socket); await broken.controller.message(socket, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  assert.equal(socket.sent.at(-1).payload.code, "ROOM_STATE_LOST");
});

test("actions publish scores only after finalization and results cursors resync after invalidation", async () => {
  const { controller } = setup(); await init(controller);
  const host = new Socket(); const guest = new Socket(); controller.registerSocket(host); controller.registerSocket(guest);
  await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  const act = async (socket, player, payload) => controller.message(socket, envelope("EVENT_ACTION", player, payload));
  const startAction = { action: "START_EVENT", request_id: "start", generation: 1 };
  await act(host, "host", startAction);
  for (let index = 0; index < 2; index += 1) {
    let snapshot = host.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot;
    const chartResponse = await controller.chartSearch(new URL("https://room/charts?level_filter=ANY&limit=1"));
    const chart = (await chartResponse.json()).charts[0];
    await act(host, "host", { action: "CONFIRM_PICK", request_id: `pick-${index}`, generation: 1, event_id: snapshot.event_id, chart_key: chart.chart_key, selection_revision: snapshot.selection_revision });
    snapshot = host.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot;
    if (index === 0) assert.equal(JSON.stringify(snapshot).includes("metric_value"), false);
    await act(guest, "guest", { action: "SET_READY", request_id: `ready-${index}`, generation: 1, event_id: snapshot.event_id, round_id: snapshot.current_round_id, selection_revision: snapshot.selection_revision, ready: true });
    snapshot = host.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot;
    await act(host, "host", { action: "START_ROUND", request_id: `round-${index}`, generation: 1, event_id: snapshot.event_id, round_id: snapshot.current_round_id, selection_revision: snapshot.selection_revision });
    snapshot = guest.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot;
    if (index === 0) assert.equal(JSON.stringify(snapshot).includes("metric_value"), false);
    const submitAction = { action: "SUBMIT", request_id: `submit-${index}`, generation: 1, event_id: snapshot.event_id, round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: 1000 + index };
    await act(guest, "guest", submitAction);
    snapshot = host.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot;
    assert.equal(snapshot.latest_result.results[0].metric_value, 1000 + index);
    await act(guest, "guest", submitAction);
    assert.equal(guest.sent.filter((entry) => entry.type === "EVENT_ACTION_ACK").at(-1).payload.duplicate, true);
    if (index === 0) await act(host, "host", { action: "NEXT_PICK", request_id: "next", generation: 1, event_id: snapshot.event_id, round_id: snapshot.current_round_id });
  }
  const finalSnapshot = host.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot;
  await act(host, "host", { action: "RESULTS_GET", request_id: "results-1", generation: 1, event_id: finalSnapshot.event_id, limit: 1 });
  const firstPage = host.sent.filter((entry) => entry.type === "EVENT_RESULTS").at(-1).payload;
  assert.equal(firstPage.rounds.length, 1); assert.ok(firstPage.next_cursor);
  await act(host, "host", { action: "INVALIDATE_ROUND", request_id: "invalidate", generation: 1, event_id: finalSnapshot.event_id, target_round_id: finalSnapshot.current_round_id });
  await act(host, "host", { action: "RESULTS_GET", request_id: "results-2", generation: 1, event_id: finalSnapshot.event_id, cursor: firstPage.next_cursor, limit: 1 });
  assert.equal(host.sent.filter((entry) => entry.type === "EVENT_RESULTS").at(-1).payload.resync_required, true);
});

test("terminal event record is retained for 1800 seconds and then deleted", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); controller.registerSocket(host); await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(host, envelope("EVENT_ACTION", "host", { action: "END_EVENT", request_id: "end", generation: 1 }));
  const endedAt = storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).ended_at;
  assert.equal(storage.alarms.at(-1), Date.parse(endedAt) + 1_800_000);
  await controller.alarm(new Date(Date.parse(endedAt) + 1_800_000));
  assert.equal(storage.values.has(EVENT_ROOM_RECORD_STORAGE_KEY), false);
  assert.equal(controller.sessions.size, 0); assert.equal(host.closed.at(-1).reason, "Event retention expired.");
  const late = new Socket(); controller.registerSocket(late); await controller.message(late, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  assert.equal(late.sent.at(-1).payload.code, "EVENT_CLEANED_UP");
});

test("restore expires an overdue absolute Host deadline before serving state", async () => {
  const original = setup(); await init(original.controller); const record = original.storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY);
  const created = new Date(Date.now() - 600_000); record.created_at = created.toISOString(); record.host_initial_connect_deadline = new Date(created.getTime() + 300_000).toISOString();
  const restored = setup(); await restored.controller.restore(record);
  assert.equal(restored.storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).phase, "RESULT");
  assert.equal(restored.storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).end_reason, "HOST_DISCONNECTED");
});

test("persistent alarm failure preserves the absolute deadline and closes only when it is reached", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); const guest = new Socket(); controller.registerSocket(host); controller.registerSocket(guest);
  await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  storage.failAlarm = true; await controller.close(host);
  const disconnected = storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY);
  const deadline = disconnected.host_disconnect_deadline;
  assert.equal(disconnected.phase, "LOBBY"); assert.equal(disconnected.ended_at, null); assert.ok(deadline);
  const disconnectedState = guest.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot;
  assert.equal(disconnectedState.host.connected, false); assert.equal(disconnectedState.host_disconnect_deadline, deadline);
  const overdue = structuredClone(disconnected);
  overdue.created_at = new Date(Date.now() - 600_000).toISOString();
  overdue.host_disconnect_deadline = new Date(Date.now() - 300_000).toISOString();
  const restartedOverdue = setup(); await restartedOverdue.controller.restore(overdue);
  assert.equal(restartedOverdue.storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).end_reason, "HOST_DISCONNECTED");
  await assert.rejects(controller.alarm(new Date(Date.parse(deadline) - 1)));
  assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).ended_at, null);
  await assert.rejects(controller.alarm(new Date(deadline)));
  const terminal = storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY);
  assert.equal(terminal.phase, "RESULT"); assert.equal(terminal.end_reason, "HOST_DISCONNECTED");
  assert.equal(terminal.ended_at, deadline);
  storage.failAlarm = false;
  const restartedState = { storage, sockets: [], getWebSockets() { return this.sockets; } };
  const restarted = new EventRoomController(restartedState, { HOST_EVENT_ACCEPT_NEW: "true", MIN_SUPPORTED_CLIENT_VERSION: "1.4.0" });
  await restarted.restore(terminal);
  const reconnect = new Socket(); restarted.registerSocket(reconnect); await restarted.message(reconnect, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  assert.equal(reconnect.sent.find((entry) => entry.type === "EVENT_JOIN_ACCEPTED").payload.event_room_snapshot.host_disconnect_deadline, null);
});

test("Host disconnect does not broadcast when its durable record put fails", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); const guest = new Socket(); controller.registerSocket(host); controller.registerSocket(guest);
  await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  const statesBeforeClose = guest.sent.filter((entry) => entry.type === "EVENT_STATE").length;
  storage.failPut = true;
  await controller.close(host);
  assert.equal(guest.sent.filter((entry) => entry.type === "EVENT_STATE").length, statesBeforeClose);
  assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).host_connected, true);
  assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).host_disconnect_deadline, null);
});

test("Host disconnect retries the same absolute deadline after the first alarm failure", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); controller.registerSocket(host); await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  const attemptStart = storage.alarmAttempts.length;
  storage.failAlarmAttempts = 1;
  await controller.close(host);
  const deadline = Date.parse(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).host_disconnect_deadline);
  assert.deepEqual(storage.alarmAttempts.slice(attemptStart), [deadline, deadline]);
  assert.equal(storage.alarms.at(-1), deadline);
});

test("terminal timeout is broadcast even when cleanup alarm scheduling fails", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); const guest = new Socket(); controller.registerSocket(host); controller.registerSocket(guest);
  await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  await controller.close(host);
  const deadline = storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).host_disconnect_deadline;
  storage.failAlarm = true;
  await assert.rejects(controller.alarm(new Date(deadline)));
  const terminalState = guest.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot;
  assert.equal(terminalState.phase, "RESULT");
  assert.equal(terminalState.end_reason, "HOST_DISCONNECTED");
  assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).ended_at, deadline);
});

test("lost LEAVE ACK followed by reconnect and duplicate replay restores authoritative LEFT", async () => {
  const { controller, storage } = setup(); await init(controller);
  const host = new Socket(); const guest = new Socket(); controller.registerSocket(host); controller.registerSocket(guest);
  await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  const leave = { action: "LEAVE", request_id: "leave-lost-ack", generation: 1 };
  await controller.message(guest, envelope("EVENT_ACTION", "guest", leave));
  assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).participants.find((entry) => entry.player_id === "guest").connection_state, "LEFT");
  await controller.close(guest);
  await controller.close(host);
  const reconnect = new Socket(); controller.registerSocket(reconnect);
  await controller.message(reconnect, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).participants.find((entry) => entry.player_id === "guest").connection_state, "CONNECTED");
  await controller.message(reconnect, envelope("EVENT_ACTION", "guest", leave));
  assert.equal(reconnect.sent.filter((entry) => entry.type === "EVENT_ACTION_ACK").at(-1).payload.duplicate, true);
  assert.equal(storage.values.get(EVENT_ROOM_RECORD_STORAGE_KEY).participants.find((entry) => entry.player_id === "guest").connection_state, "LEFT");
});

test("pre-start KICK is allowed only to Host and started actions require matching event_id", async () => {
  const { controller } = setup(); await init(controller);
  const host = new Socket(); const guest = new Socket(); controller.registerSocket(host); controller.registerSocket(guest);
  await controller.message(host, envelope("EVENT_JOIN", "host", joinPayload("Host")));
  await controller.message(guest, envelope("EVENT_JOIN", "guest", joinPayload("Guest", "inf-notebook")));
  await controller.message(guest, envelope("EVENT_ACTION", "guest", { action: "KICK", request_id: "guest-kick", generation: 1, target_player_id: "host" }));
  assert.equal(guest.sent.at(-1).type, "EVENT_ERROR");
  await controller.message(host, envelope("EVENT_ACTION", "host", { action: "KICK", request_id: "host-kick", generation: 1, target_player_id: "guest" }));
  assert.equal(host.sent.filter((entry) => entry.type === "EVENT_ACTION_ACK").at(-1).payload.request_id, "host-kick");
  const guest2 = new Socket(); controller.registerSocket(guest2); await controller.message(guest2, envelope("EVENT_JOIN", "guest-2", joinPayload("Guest2", "inf-notebook")));
  await controller.message(host, envelope("EVENT_ACTION", "host", { action: "START_EVENT", request_id: "start-event-id", generation: 1 }));
  const eventId = host.sent.filter((entry) => entry.type === "EVENT_STATE").at(-1).payload.event_room_snapshot.event_id;
  const samples = [
    { action: "START_EVENT" },
    { action: "CONFIRM_PICK", chart_key: "chart", selection_revision: 1 },
    { action: "CANCEL_PICK", round_id: "round", selection_revision: 1 },
    { action: "SET_READY", round_id: "round", selection_revision: 1, ready: true },
    { action: "START_ROUND", round_id: "round", selection_revision: 1 },
    { action: "SUBMIT", round_id: "round", observed_key: {}, metric_value: 1 },
    { action: "SKIP", round_id: "round" }, { action: "CLOSE_ROUND", round_id: "round" },
    { action: "NEXT_PICK", round_id: "round" }, { action: "INVALIDATE_ROUND", target_round_id: "round" },
    { action: "KICK", target_player_id: "guest-2" }, { action: "LEAVE" }, { action: "END_EVENT" },
    { action: "STATE_GET" }, { action: "RESULTS_GET" },
  ];
  for (const [index, sample] of samples.entries()) {
    await controller.message(host, envelope("EVENT_ACTION", "host", { ...sample, request_id: `missing-${index}`, generation: 1 }));
    assert.equal(host.sent.at(-1).type, "EVENT_ERROR");
    await controller.message(host, envelope("EVENT_ACTION", "host", { ...sample, request_id: `wrong-${index}`, generation: 1, event_id: "wrong" }));
    assert.equal(host.sent.at(-1).payload.code, "EVENT_MISMATCH");
  }
  await controller.message(host, envelope("EVENT_ACTION", "host", { action: "STATE_GET", request_id: "correct", generation: 1, event_id: eventId }));
  assert.equal(host.sent.at(-1).type, "EVENT_STATE");
});
