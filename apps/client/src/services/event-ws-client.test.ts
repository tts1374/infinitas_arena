import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { buildEventNotebookFingerprint, eventNotebookReplayGuard } from "./event-notebook-replay";
import { EventSocketClient } from "./event-ws-client";

class FakeWebSocket extends EventTarget {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.dispatchEvent(new Event("open")));
  }
  send(value: string): void { this.sent.push(value); }
  close(code = 1000, reason = ""): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    const event = new Event("close") as Event & { code: number; reason: string };
    Object.defineProperties(event, {
      code: { value: code },
      reason: { value: reason },
    });
    this.dispatchEvent(event);
  }
}

test("event socket uses the shared room endpoint and sends EVENT_JOIN before actions", async () => {
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  try {
    const client = new EventSocketClient({
      apiBaseUrl: "https://example.com/",
      roomId: "room/a",
      playerId: "player",
      join: { join_code: "secret", display_name: "Player" },
      onMessage: () => undefined,
    });
    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = (client as unknown as { socket: FakeWebSocket }).socket;
    assert.equal(socket.url, "wss://example.com/api/rooms/room%2Fa/ws");
    const join = JSON.parse(socket.sent[0]!) as { type: string; payload: { host_event_protocol: number; join_code: string } };
    assert.equal(join.type, "EVENT_JOIN");
    assert.equal(join.payload.host_event_protocol, 1);
    assert.equal(join.payload.join_code, "secret");
    client.sendAction({ action: "STATE_GET", request_id: "state-sync", generation: 1 });
    client.sendAction({ action: "RESULTS_GET", request_id: "results-sync", generation: 1, cursor: "page-2" });
    client.sendAction({ action: "START_EVENT", request_id: "retry-me", generation: 1 });
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "EVENT_JOIN_ACCEPTED", payload: { session_role: "PLAYER", event_room_snapshot: {} } }) }));
    const replay = JSON.parse(socket.sent[4]!) as { type: string; client_msg_id: string; payload: { action: string } };
    assert.equal(replay.type, "EVENT_ACTION");
    assert.equal(replay.client_msg_id, "retry-me");
    assert.equal(replay.payload.action, "START_EVENT");
    assert.equal(socket.sent.filter((value) => value.includes('"action":"STATE_GET"')).length, 1);
    assert.equal(socket.sent.filter((value) => value.includes('"action":"RESULTS_GET"')).length, 1);
    client.acknowledge("retry-me");
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "EVENT_JOIN_ACCEPTED", payload: { session_role: "PLAYER", event_room_snapshot: {} } }) }));
    assert.equal(socket.sent.length, 5);
    client.disconnect();
  } finally {
    globalThis.WebSocket = previous;
  }
});

test("EVENT_ERROR preserves the server SOURCE_REQUIRED reason for participant feedback", async () => {
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  try {
    const received: unknown[] = [];
    const client = new EventSocketClient({
      apiBaseUrl: "https://example.com/",
      roomId: "room",
      playerId: "participant",
      join: { join_code: "secret", display_name: "Player" },
      onMessage: (message) => received.push(message),
    });
    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = (client as unknown as { socket: FakeWebSocket }).socket;
    const error = { type: "EVENT_ERROR", payload: { code: "SOURCE_REQUIRED", message: "A data source is required to play." } };
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(error) }));
    assert.deepEqual(received, [error]);
    client.disconnect();
  } finally {
    globalThis.WebSocket = previous;
  }
});

test("event socket heartbeat sends PING and PONG or other traffic keeps the connection alive", async () => {
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  FakeWebSocket.instances = [];
  mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1_000 });
  try {
    const client = new EventSocketClient({
      apiBaseUrl: "https://example.com",
      roomId: "room",
      playerId: "host",
      join: { join_code: "secret", display_name: "Host" },
      onMessage: () => undefined,
    });
    client.connect();
    await Promise.resolve();
    const socket = FakeWebSocket.instances[0]!;

    mock.timers.tick(20_000);
    assert.equal(JSON.parse(socket.sent.at(-1)!).type, "PING");
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "PONG", payload: {} }) }));
    mock.timers.tick(20_000);
    assert.equal(socket.readyState, FakeWebSocket.OPEN);
    assert.equal(socket.sent.filter((value) => JSON.parse(value).type === "PING").length, 2);

    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "EVENT_RESULTS", payload: {} }) }));
    mock.timers.tick(20_000);
    assert.equal(socket.readyState, FakeWebSocket.OPEN);
    client.disconnect();
  } finally {
    mock.timers.reset();
    globalThis.WebSocket = previous;
  }
});

test("event socket heartbeat timeout closes and reconnects without duplicate timers", async () => {
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  FakeWebSocket.instances = [];
  mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1_000 });
  try {
    const client = new EventSocketClient({
      apiBaseUrl: "https://example.com",
      roomId: "room",
      playerId: "host",
      join: { join_code: "secret", display_name: "Host" },
      onMessage: () => undefined,
    });
    client.connect();
    client.connect();
    await Promise.resolve();
    const firstSocket = FakeWebSocket.instances[0]!;

    mock.timers.tick(40_000);
    assert.equal(firstSocket.readyState, 3);
    assert.equal(FakeWebSocket.instances.length, 1);
    mock.timers.tick(1_000);
    await Promise.resolve();
    assert.equal(FakeWebSocket.instances.length, 2);

    const secondSocket = FakeWebSocket.instances[1]!;
    mock.timers.tick(20_000);
    assert.equal(secondSocket.sent.filter((value) => JSON.parse(value).type === "PING").length, 1);
    client.disconnect();
  } finally {
    mock.timers.reset();
    globalThis.WebSocket = previous;
  }
});

test("E2E interrupt explicitly reconnects after the requested delay and ignores the detached close", async () => {
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  FakeWebSocket.instances = [];
  mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1_000 });
  try {
    const states: string[] = [];
    const client = new EventSocketClient({
      apiBaseUrl: "https://example.com",
      roomId: "room",
      playerId: "host",
      join: { join_code: "secret", display_name: "Host" },
      onMessage: () => undefined,
      onStateChange: (state) => states.push(state),
    });
    client.connect();
    await Promise.resolve();
    const firstSocket = FakeWebSocket.instances[0]!;

    assert.equal(client.interruptTransportForE2E(4_000), true);
    assert.equal(firstSocket.readyState, 3);
    assert.equal(states.at(-1), "DISCONNECTED");
    mock.timers.tick(3_999);
    assert.equal(FakeWebSocket.instances.length, 1);
    mock.timers.tick(1);
    await Promise.resolve();
    assert.equal(FakeWebSocket.instances.length, 2);
    const secondSocket = FakeWebSocket.instances[1]!;
    assert.equal(JSON.parse(secondSocket.sent[0]!).type, "EVENT_JOIN");
    assert.equal(states.filter((state) => state === "DISCONNECTED").length, 1);
    client.disconnect();
  } finally {
    mock.timers.reset();
    globalThis.WebSocket = previous;
  }
});

test("disconnect cleans heartbeat and reconnect timers without acknowledging pending mutations", async () => {
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  FakeWebSocket.instances = [];
  mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1_000 });
  try {
    const client = new EventSocketClient({
      apiBaseUrl: "https://example.com",
      roomId: "room",
      playerId: "host",
      join: { join_code: "secret", display_name: "Host" },
      onMessage: () => undefined,
    });
    client.connect();
    await Promise.resolve();
    const socket = FakeWebSocket.instances[0]!;
    client.sendAction({ action: "START_EVENT", request_id: "pending-mutation", generation: 1 });
    mock.timers.tick(20_000);
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "PONG", payload: {} }) }));
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "EVENT_JOIN_ACCEPTED", payload: {} }) }));
    assert.equal(socket.sent.filter((value) => value.includes('"request_id":"pending-mutation"')).length, 2);

    socket.close(1006, "transport lost");
    client.disconnect();
    const sentBeforeCleanupTick = socket.sent.length;
    mock.timers.tick(100_000);
    assert.equal(socket.sent.length, sentBeforeCleanupTick);
    assert.equal(FakeWebSocket.instances.length, 1);
  } finally {
    mock.timers.reset();
    globalThis.WebSocket = previous;
  }
});

test("unacknowledged notebook SUBMIT and LEAVE replay with the same request ids after reconnect", async () => {
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  FakeWebSocket.instances = [];
  eventNotebookReplayGuard.clearForTests();
  mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1_000 });
  try {
    const fingerprint = buildEventNotebookFingerprint({ titleSearchKey: "Song", difficulty: "ANOTHER", score: 2000, misscount: 10 });
    const client = new EventSocketClient({
      apiBaseUrl: "https://example.com", roomId: "room", playerId: "player",
      join: { join_code: "secret", display_name: "Player" },
      onMessage: (message) => {
        if (message.type === "EVENT_ACTION_ACK") {
          eventNotebookReplayGuard.acknowledge((message.payload as { request_id: string }).request_id);
        }
      },
    });
    client.connect();
    await Promise.resolve();
    const first = FakeWebSocket.instances[0]!;
    client.sendAction({ action: "SUBMIT", request_id: "submit-request", generation: 1, event_id: "event", round_id: "round", observed_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song" }, metric_value: 2000 });
    eventNotebookReplayGuard.track("submit-request", { eventId: "event", playerId: "player", timestamp: "20260909-120000", fingerprint });
    client.sendAction({ action: "LEAVE", request_id: "leave-request", generation: 1, event_id: "event" });
    first.close(1006, "ack lost");

    mock.timers.tick(1_000);
    await Promise.resolve();
    const second = FakeWebSocket.instances[1]!;
    second.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "EVENT_JOIN_ACCEPTED", payload: {} }) }));
    const replayedIds = second.sent.map((value) => JSON.parse(value) as { client_msg_id: string }).map((message) => message.client_msg_id);
    assert.deepEqual(replayedIds.slice(-2), ["submit-request", "leave-request"]);
    assert.notEqual(eventNotebookReplayGuard.rejection("event", "player", "20260909-120000", fingerprint), null);

    second.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "EVENT_ACTION_ACK", payload: { request_id: "submit-request" } }) }));
    assert.notEqual(eventNotebookReplayGuard.rejection("event", "player", "20260909-120000", fingerprint), null);
    client.disconnect();
  } finally {
    eventNotebookReplayGuard.clearForTests();
    mock.timers.reset();
    globalThis.WebSocket = previous;
  }
});
