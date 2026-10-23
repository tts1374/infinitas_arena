import test from "node:test";
import assert from "node:assert/strict";
import { RoomDurableObject } from "./room-object.ts";

class TestStorage {
  #records = new Map();
  #alarm = null;

  async get(key) {
    return this.#records.get(key);
  }

  async put(key, value) {
    this.#records.set(key, value);
  }

  async delete(key) {
    return this.#records.delete(key);
  }

  async deleteAlarm() {
    this.#alarm = null;
  }

  async setAlarm(value) {
    this.#alarm = value instanceof Date ? value.getTime() : value;
  }
}

class TestDurableObjectState {
  storage = new TestStorage();
  #sockets = [];

  async blockConcurrencyWhile(callback) {
    return callback();
  }

  acceptWebSocket(socket) {
    this.#sockets.push(socket);
  }

  getWebSockets() {
    return [...this.#sockets];
  }
}

class TestSocket {
  readyState = 1;
  sent = [];
  closeCalls = [];
  #attachment = null;

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close(code, reason) {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
  }

  serializeAttachment(attachment) {
    this.#attachment = structuredClone(attachment);
  }

  deserializeAttachment() {
    return this.#attachment;
  }
}

function buildSettings() {
  return {
    visibility: "PUBLIC",
    join_code: "ABCDEFGH",
    mode: "ARENA",
    win_metric: "SCORE",
    play_style: "SP",
    level_filter: "ANY",
    room_comment: "room object test",
    max_players: 4,
  };
}

function createEnv() {
  const okResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  return {
    ROOM_DO: {
      idFromName(name) {
        return { toString: () => name };
      },
      get() {
        return {
          fetch: async () => okResponse(),
        };
      },
    },
    LOBBY_DIRECTORY_DO: {
      idFromName(name) {
        return { toString: () => name };
      },
      get() {
        return {
          fetch: async () => okResponse(),
        };
      },
    },
  };
}

async function createRoomObject() {
  const state = new TestDurableObjectState();
  const roomObject = new RoomDurableObject(state, createEnv());
  await roomObject.readyPromise;

  roomObject.roomState.initialize({
    room_id: "room-1",
    created_at: "2026-03-08T00:00:00.000Z",
    settings: buildSettings(),
  });

  return roomObject;
}

test("event initialization uses the same Room DO with a separate record and blocks normal initialization", async () => {
  const state = new TestDurableObjectState();
  const roomObject = new RoomDurableObject(state, { ...createEnv(), MIN_SUPPORTED_CLIENT_VERSION: "1.4.0", HOST_EVENT_ACCEPT_NEW: "true" });
  const eventPayload = { room_id: "event-1", created_at: new Date().toISOString(), host_player_id: "host", host_display_name: "Host",
    settings: { event_name: "event", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "ABCDEFGH" } };
  const eventResponse = await roomObject.fetch(new Request("https://room.internal/internal/event-init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(eventPayload) }));
  assert.equal(eventResponse.status, 200);
  assert.equal((await state.storage.get("event-room-record")).room_kind, "HOST_EVENT");
  assert.equal(await state.storage.get("room-record"), undefined);
  const normalResponse = await roomObject.fetch(new Request("https://room.internal/internal/init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room_id: "event-1", created_at: new Date().toISOString(), settings: buildSettings() }) }));
  assert.equal(normalResponse.status, 409);
});

function enableAutoMatchRoom(roomObject) {
  roomObject.roomState.settings.auto_match = true;
  roomObject.roomState.settings.max_players = 2;
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");
}

function createJoinMessage(playerId, clientMessageId, payloadOverrides = {}) {
  return {
    type: "ROOM_JOIN",
    client_msg_id: clientMessageId,
    room_id: "room-1",
    player_id: playerId,
    payload: {
      display_name: playerId.toUpperCase(),
      source: "inf-notebook",
      client_version: "1.4.0",
      ...payloadOverrides,
    },
  };
}

async function joinPlayer(roomObject, socket, playerId, clientMessageId, payloadOverrides = {}) {
  const session = roomObject.registerSocketSession(socket);
  await roomObject.handleRoomJoin(session, createJoinMessage(playerId, clientMessageId, payloadOverrides));
  return session;
}

async function joinSpectator(roomObject, socket, spectatorId, clientMessageId, payloadOverrides = {}) {
  const session = roomObject.registerSocketSession(socket);
  await roomObject.handleRoomJoin(
    session,
    createJoinMessage(spectatorId, clientMessageId, {
      session_kind: "SPECTATOR",
      ...payloadOverrides,
    }),
  );
  return session;
}

test("webSocketClose marks player as temporarily disconnected", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();

  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");

  await roomObject.webSocketClose(guestSocket, 1006, "abnormal close", false);

  const guest = roomObject.roomState.toSnapshot().players.find((player) => player.player_id === "guest");
  assert.ok(guest);
  assert.equal(guest.connected, false);
  assert.notEqual(guest.left_at, null);
  assert.notEqual(guest.rejoin_until, null);
});

test("reconnect replaces old socket and stale close does not mark player disconnected again", async () => {
  const roomObject = await createRoomObject();
  const oldSocket = new TestSocket();

  await joinPlayer(roomObject, oldSocket, "host", "msg-1");
  roomObject.roomState.markPlayerDisconnected("host", new Date());

  const reconnectSocket = new TestSocket();
  await joinPlayer(roomObject, reconnectSocket, "host", "msg-2");

  assert.equal(oldSocket.closeCalls.length, 1);
  assert.equal(oldSocket.closeCalls[0]?.code, 4002);

  let host = roomObject.roomState.toSnapshot().players.find((player) => player.player_id === "host");
  assert.ok(host);
  assert.equal(host.connected, true);
  assert.equal(host.left_at, null);
  assert.equal(host.rejoin_until, null);

  await roomObject.webSocketClose(oldSocket, 1000, "replaced", true);

  host = roomObject.roomState.toSnapshot().players.find((player) => player.player_id === "host");
  assert.ok(host);
  assert.equal(host.connected, true);
});

test("PING receives PONG response", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "PING",
      client_msg_id: "msg-2",
      room_id: "room-1",
      player_id: "host",
      payload: {},
    }),
  );

  const lastMessage = hostSocket.sent.at(-1);
  assert.ok(lastMessage);
  assert.equal(lastMessage.type, "PONG");
  assert.deepEqual(lastMessage.payload, {});
});

test("auto-match room rejects manual START_MATCH", async () => {
  const roomObject = await createRoomObject();
  enableAutoMatchRoom(roomObject);
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");
  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "START_MATCH",
      client_msg_id: "msg-2",
      room_id: "room-1",
      player_id: "host",
      payload: {
        request_id: "start-1",
        generation: 1,
      },
    }),
  );

  const lastMessage = hostSocket.sent.at(-1);
  assert.ok(lastMessage);
  assert.equal(lastMessage.type, "START_MATCH_REJECTED");
  assert.equal(lastMessage.payload.reason, "AUTO_MATCH_ROOM_LOCKED");
});

test("auto-match room auto-starts on the final join and closes after the result deadline", async () => {
  const roomObject = await createRoomObject();
  enableAutoMatchRoom(roomObject);
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");
  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();

  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");

  assert.equal(roomObject.roomState.getRoomState(), "PICKING");
  const notifications = [...hostSocket.sent, ...guestSocket.sent].filter((message) => message.type === "ROOM_NOTIFICATION");
  assert.ok(notifications.some((message) => message.payload.kind === "match_found"));

  roomObject.roomState["enterResult"](new Date("2026-03-08T00:03:00.000Z"));
  assert.equal(roomObject.roomState.getRoomState(), "RESULT");
  roomObject.roomState.resultDeadline = new Date(Date.now() - 1);

  await roomObject.alarm();

  assert.equal(roomObject.roomState.getRoomState(), "CLOSED");
  assert.equal(roomObject.roomState.toSnapshot().close_reason, "ALL_ROUNDS_COMPLETED");
  assert.ok(hostSocket.closeCalls.some((call) => call.reason === "Auto-match result expired."));
});

test("buildLobbySummary excludes auto-match rooms from public listing", async () => {
  const roomObject = await createRoomObject();
  enableAutoMatchRoom(roomObject);

  const summary = roomObject.buildLobbySummary(roomObject.roomState.toSnapshot(), Date.now());
  assert.equal(summary, null);
});

test("MATCH_TTL_EXPIRED closes sockets and clears sessions", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();

  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");

  roomObject.roomState.enterResult(new Date("2026-03-08T00:20:00.000Z"));
  roomObject.roomState.matchDeadline = new Date("2026-03-08T00:19:59.000Z");

  await roomObject.processDueTransitions(new Date("2026-03-08T00:20:01.000Z"));

  assert.equal(roomObject.roomState.getRoomState(), "CLOSED");
  assert.equal(roomObject.sessionsBySocket.size, 0);
  assert.equal(hostSocket.closeCalls.length, 1);
  assert.equal(guestSocket.closeCalls.length, 1);
  assert.equal(hostSocket.closeCalls[0]?.code, 4000);
  assert.equal(guestSocket.closeCalls[0]?.code, 4000);
});

test("SOURCE_STATUS_SET no-op skips additional persist and alarm sync", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  let persistCalls = 0;
  let syncAlarmCalls = 0;
  const originalPersist = roomObject.persistRoomRecord.bind(roomObject);
  const originalSyncAlarm = roomObject.syncAlarm.bind(roomObject);
  roomObject.persistRoomRecord = async () => {
    persistCalls += 1;
    await originalPersist();
  };
  roomObject.syncAlarm = async () => {
    syncAlarmCalls += 1;
    await originalSyncAlarm();
  };

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "SOURCE_STATUS_SET",
      client_msg_id: "msg-2",
      room_id: "room-1",
      player_id: "host",
      payload: {
        request_id: "source-1",
        available: true,
      },
    }),
  );

  assert.equal(persistCalls, 1);
  assert.equal(syncAlarmCalls, 0);
});

test("SOURCE_STATUS_SET changed update persists and syncs alarm", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  let persistCalls = 0;
  let syncAlarmCalls = 0;
  const originalPersist = roomObject.persistRoomRecord.bind(roomObject);
  const originalSyncAlarm = roomObject.syncAlarm.bind(roomObject);
  roomObject.persistRoomRecord = async () => {
    persistCalls += 1;
    await originalPersist();
  };
  roomObject.syncAlarm = async () => {
    syncAlarmCalls += 1;
    await originalSyncAlarm();
  };

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "SOURCE_STATUS_SET",
      client_msg_id: "msg-2",
      room_id: "room-1",
      player_id: "host",
      payload: {
        request_id: "source-2",
        available: false,
      },
    }),
  );

  assert.equal(persistCalls, 2);
  assert.equal(syncAlarmCalls, 1);
});

test("internal join-status returns recruiting for PUBLIC LOBBY room", async () => {
  const roomObject = await createRoomObject();
  const response = await roomObject.fetch(new Request("https://room.internal/join-status", { method: "GET" }));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.room_name, "room object test");
  assert.equal(payload.recruitment_status, "recruiting");
  assert.equal(payload.shareable, true);
});

test("internal join-status returns full when lobby is at capacity", async () => {
  const roomObject = await createRoomObject();
  roomObject.roomState.settings.max_players = 2;
  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");

  const response = await roomObject.fetch(new Request("https://room.internal/join-status", { method: "GET" }));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.recruitment_status, "full");
  assert.equal(payload.shareable, false);
});

test("internal join-status returns closed after match has started", async () => {
  const roomObject = await createRoomObject();
  const now = new Date("2026-03-08T00:00:00.000Z");
  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();

  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");
  roomObject.roomState.setPlayerReady("host", true);
  roomObject.roomState.setPlayerReady("guest", true);
  const startResult = roomObject.roomState.startMatch("host", now);
  assert.equal(startResult.ok, true);

  const response = await roomObject.fetch(new Request("https://room.internal/join-status", { method: "GET" }));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.recruitment_status, "closed");
  assert.equal(payload.shareable, false);
});

test("internal join-status returns recruiting after host recreates room via RETURN_TO_LOBBY", async () => {
  const roomObject = await createRoomObject();
  const now = new Date();
  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();

  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");
  roomObject.roomState.setPlayerReady("host", true);
  roomObject.roomState.setPlayerReady("guest", true);
  const startResult = roomObject.roomState.startMatch("host", now);
  assert.equal(startResult.ok, true);
  await roomObject.persistRoomRecord();

  roomObject.roomState.enterResult(new Date(now.getTime() + 1_000));
  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "RETURN_TO_LOBBY",
      client_msg_id: "msg-3",
      room_id: "room-1",
      player_id: "host",
      payload: {
        request_id: "return-1",
        generation: 1,
      },
    }),
  );
  assert.equal(roomObject.roomState.getRoomState(), "LOBBY");

  const response = await roomObject.fetch(new Request("https://room.internal/join-status", { method: "GET" }));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.recruitment_status, "recruiting");
  assert.equal(payload.shareable, true);
});

test("internal lobby-eligibility returns eligible for PUBLIC lobby rooms", async () => {
  const roomObject = await createRoomObject();
  const response = await roomObject.fetch(new Request("https://room.internal/internal/lobby-eligibility", { method: "GET" }));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.eligible, true);
});

test("internal lobby-eligibility returns false for auto-match rooms", async () => {
  const roomObject = await createRoomObject();
  enableAutoMatchRoom(roomObject);

  const response = await roomObject.fetch(new Request("https://room.internal/internal/lobby-eligibility", { method: "GET" }));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.eligible, false);
});

test("internal lobby-eligibility returns false when lobby is full", async () => {
  const roomObject = await createRoomObject();
  roomObject.roomState.settings.max_players = 2;
  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");

  const response = await roomObject.fetch(new Request("https://room.internal/internal/lobby-eligibility", { method: "GET" }));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.eligible, false);
});

test("internal lobby-eligibility returns false after match starts", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");
  roomObject.roomState.setPlayerReady("host", true);
  roomObject.roomState.setPlayerReady("guest", true);
  const startResult = roomObject.roomState.startMatch("host", new Date("2026-03-08T00:00:00.000Z"));
  assert.equal(startResult.ok, true);

  const response = await roomObject.fetch(new Request("https://room.internal/internal/lobby-eligibility", { method: "GET" }));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.eligible, false);
});

test("internal lobby-eligibility returns ROOM_STATE_LOST for uninitialized rooms", async () => {
  const state = new TestDurableObjectState();
  const roomObject = new RoomDurableObject(state, createEnv());
  await roomObject.readyPromise;

  const response = await roomObject.fetch(new Request("https://room.internal/internal/lobby-eligibility", { method: "GET" }));
  assert.equal(response.status, 404);

  const payload = await response.json();
  assert.equal(payload.error, "ROOM_STATE_LOST");
});

test("READY_SET with stale generation is rejected", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "READY_SET",
      client_msg_id: "msg-2",
      room_id: "room-1",
      player_id: "host",
      payload: {
        ready: true,
        generation: 2,
      },
    }),
  );

  const lastMessage = hostSocket.sent.at(-1);
  assert.ok(lastMessage);
  assert.equal(lastMessage.type, "ERROR");
  assert.equal(lastMessage.payload.code, "INVALID_STATE");
  assert.equal(lastMessage.payload.message, "部屋の状態が変わりました。一覧に戻ってください。");
  const host = roomObject.roomState.toSnapshot().players.find((player) => player.player_id === "host");
  assert.ok(host);
  assert.equal(host.ready, false);
});

test("internal recreate increments generation for last host on closed room", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");

  roomObject.roomState.close("READY_CHECK_TTL_EXPIRED", new Date(Date.now() - 5 * 60_000));
  await roomObject.persistRoomRecord();

  const response = await roomObject.fetch(
    new Request("https://room.internal/internal/recreate", {
      method: "POST",
      body: JSON.stringify({
        room_id: "room-1",
        host_player_id: "host",
      }),
    }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.generation, 2);
  assert.equal(roomObject.roomState.getGeneration(), 2);
  assert.equal(roomObject.roomState.getRoomState(), "LOBBY");
  assert.equal(roomObject.roomState.toSnapshot().players.length, 0);
});

test("internal recreate rejects when active generation exists", async () => {
  const roomObject = await createRoomObject();
  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");

  const response = await roomObject.fetch(
    new Request("https://room.internal/internal/recreate", {
      method: "POST",
      body: JSON.stringify({
        room_id: "room-1",
        host_player_id: "host",
      }),
    }),
  );
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.error, "ACTIVE_GENERATION_EXISTS");
});

test("spectator join keeps player slots unchanged and receives redacted snapshot", async () => {
  const roomObject = await createRoomObject();
  roomObject.roomState.settings.visibility = "PRIVATE";
  roomObject.roomState.settings.join_code = "ABCDEFGH";

  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1", { join_code: "ABCDEFGH" });
  const beforeSpectatorJoinCount = roomObject.roomState.toSnapshot().players.length;

  const spectatorSocket = new TestSocket();
  const spectatorSession = await joinSpectator(roomObject, spectatorSocket, "viewer-1", "msg-2", { join_code: "ABCDEFGH" });

  assert.equal(spectatorSession.role, "SPECTATOR");
  assert.equal(roomObject.roomState.toSnapshot().players.length, beforeSpectatorJoinCount);

  const joinAccepted = spectatorSocket.sent.find((message) => message.type === "ROOM_JOIN_ACCEPTED");
  assert.ok(joinAccepted);
  assert.equal(joinAccepted.payload.session_role, "SPECTATOR");
  assert.equal(joinAccepted.payload.room_state_snapshot.settings.join_code, null);
});

test("spectator join rejects invalid join_code in PRIVATE room", async () => {
  const roomObject = await createRoomObject();
  roomObject.roomState.settings.visibility = "PRIVATE";
  roomObject.roomState.settings.join_code = "ABCDEFGH";

  const spectatorSocket = new TestSocket();
  await joinSpectator(roomObject, spectatorSocket, "viewer-2", "msg-1", { join_code: "WRONG999" });

  const rejected = spectatorSocket.sent.find((message) => message.type === "ROOM_JOIN_REJECTED");
  assert.ok(rejected);
  assert.equal(rejected.payload.reason, "JOIN_CODE_INVALID");
});

test("spectator mutation messages are rejected as read-only", async () => {
  const roomObject = await createRoomObject();
  const spectatorSocket = new TestSocket();
  await joinSpectator(roomObject, spectatorSocket, "viewer-3", "msg-1");
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  const rejectedTypes = [
    "READY_SET",
    "START_MATCH",
    "SOURCE_STATUS_SET",
    "QUICK_CHAT_POST",
    "PICK_SUBMIT",
    "RESULT_SUBMIT",
    "FORCE_ADVANCE",
  ];

  let clientMessageIndex = 1;
  for (const type of rejectedTypes) {
    clientMessageIndex += 1;
    await roomObject.webSocketMessage(
      spectatorSocket,
      JSON.stringify({
        type,
        client_msg_id: `msg-${clientMessageIndex}`,
        room_id: "room-1",
        player_id: "viewer-3",
        payload: {},
      }),
    );
  }

  const errors = spectatorSocket.sent.filter((message) => message.type === "ERROR");
  assert.equal(errors.length, rejectedTypes.length);
  for (const errorMessage of errors) {
    assert.equal(errorMessage.payload.code, "INVALID_STATE");
    assert.equal(errorMessage.payload.message, "Spectator sessions are read-only.");
  }
});

test("ROOM_UPDATED is redacted for spectator and full for player", async () => {
  const roomObject = await createRoomObject();
  roomObject.roomState.settings.visibility = "PRIVATE";
  roomObject.roomState.settings.join_code = "ABCDEFGH";
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1", { join_code: "ABCDEFGH" });
  hostSocket.sent = [];

  const spectatorSocket = new TestSocket();
  await joinSpectator(roomObject, spectatorSocket, "viewer-4", "msg-2", { join_code: "ABCDEFGH" });
  spectatorSocket.sent = [];

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "READY_SET",
      client_msg_id: "msg-3",
      room_id: "room-1",
      player_id: "host",
      payload: {
        ready: true,
        generation: 1,
      },
    }),
  );

  const hostUpdated = hostSocket.sent.find((message) => message.type === "ROOM_UPDATED");
  const spectatorUpdated = spectatorSocket.sent.find((message) => message.type === "ROOM_UPDATED");

  assert.ok(hostUpdated);
  assert.ok(spectatorUpdated);
  assert.equal(hostUpdated.payload.room_state_snapshot.settings.join_code, "ABCDEFGH");
  assert.equal(spectatorUpdated.payload.room_state_snapshot.settings.join_code, null);
});

test("QUICK_CHAT_POST stores history, broadcasts posted message, and snapshots include recent messages", async () => {
  const roomObject = await createRoomObject();
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");
  hostSocket.sent = [];
  guestSocket.sent = [];

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "QUICK_CHAT_POST",
      client_msg_id: "msg-3",
      room_id: "room-1",
      player_id: "host",
      payload: {
        request_id: "chat-1",
        phrase_ids: ["a-001", "symbol-037"],
      },
    }),
  );

  const posted = guestSocket.sent.find((message) => message.type === "QUICK_CHAT_POSTED");
  assert.ok(posted);
  assert.equal(posted.payload.message.player_id, "host");
  assert.deepEqual(posted.payload.message.phrase_ids, ["a-001", "symbol-037"]);
  assert.equal(posted.payload.message.message, "お願いします！");

  const updated = guestSocket.sent.find((message) => message.type === "ROOM_UPDATED");
  assert.ok(updated);
  assert.equal(updated.payload.room_state_snapshot.quick_chat_messages.length, 1);
  assert.equal(updated.payload.room_state_snapshot.quick_chat_messages[0].message, "お願いします！");
});

test("QUICK_CHAT_POST duplicate request returns snapshot without duplicate history", async () => {
  const roomObject = await createRoomObject();
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  const hostSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  hostSocket.sent = [];

  const payload = {
    type: "QUICK_CHAT_POST",
    room_id: "room-1",
    player_id: "host",
    payload: {
      request_id: "chat-1",
      phrase_ids: ["a-001"],
    },
  };

  await roomObject.webSocketMessage(hostSocket, JSON.stringify({ ...payload, client_msg_id: "msg-2" }));
  await roomObject.webSocketMessage(hostSocket, JSON.stringify({ ...payload, client_msg_id: "msg-3" }));

  assert.equal(roomObject.roomState.toSnapshot().quick_chat_messages.length, 1);
  const snapshots = hostSocket.sent.filter((message) => message.type === "STATE_SNAPSHOT");
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].payload.room_state_snapshot.quick_chat_messages.length, 1);
});

test("QUICK_CHAT_POST rejects invalid payload and PLAYING state", async () => {
  const roomObject = await createRoomObject();
  roomObject.roomState.readyCheckDeadline = new Date("2099-01-01T00:00:00.000Z");

  const hostSocket = new TestSocket();
  const guestSocket = new TestSocket();
  await joinPlayer(roomObject, hostSocket, "host", "msg-1");
  await joinPlayer(roomObject, guestSocket, "guest", "msg-2");
  hostSocket.sent = [];

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "QUICK_CHAT_POST",
      client_msg_id: "msg-3",
      room_id: "room-1",
      player_id: "host",
      payload: {
        request_id: "chat-invalid",
        phrase_ids: ["unknown"],
      },
    }),
  );

  let error = hostSocket.sent.find((message) => message.type === "ERROR");
  assert.ok(error);
  assert.equal(error.payload.code, "INVALID_STATE");

  roomObject.roomState.roomState = "PLAYING";
  hostSocket.sent = [];

  await roomObject.webSocketMessage(
    hostSocket,
    JSON.stringify({
      type: "QUICK_CHAT_POST",
      client_msg_id: "msg-4",
      room_id: "room-1",
      player_id: "host",
      payload: {
        request_id: "chat-playing",
        phrase_ids: ["a-001"],
      },
    }),
  );

  error = hostSocket.sent.find((message) => message.type === "ERROR");
  assert.ok(error);
  assert.equal(error.payload.code, "INVALID_STATE");
});
