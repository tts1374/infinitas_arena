import test from "node:test";
import assert from "node:assert/strict";
import { READY_CHECK_TTL_MS } from "@infinitas/shared";
import { LobbyDirectoryDO } from "./lobby-directory-object.ts";

class TestStorage {
  #records = new Map();

  async get(key) {
    return this.#records.get(key);
  }

  async put(key, value) {
    this.#records.set(key, value);
  }

  snapshot() {
    return Object.fromEntries(this.#records.entries());
  }

}

class TestDurableObjectState {
  storage = new TestStorage();

  async blockConcurrencyWhile(callback) {
    return callback();
  }
}

function createSummary(roomId) {
  return {
    roomId,
    roomName: "Lobby Room",
    ownerUserId: "owner-1",
    ownerDisplayName: "Owner",
    mode: "ARENA",
    playStyle: "SP",
    levelFilter: "ANY",
    winMetric: "SCORE",
    hasJoinCode: false,
    isPublic: true,
    currentPlayers: 1,
    maxPlayers: 2,
    isFull: false,
    status: "LOBBY",
    ttlStartedAt: 1_000,
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

async function withMockedNow(now, callback) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return await callback();
  } finally {
    Date.now = originalNow;
  }
}

async function upsertRoom(lobbyDirectory, now, roomId = "room-1") {
  return withMockedNow(now, async () =>
    lobbyDirectory.fetch(
      new Request("https://lobby-directory.internal/internal/upsert", {
        method: "POST",
        body: JSON.stringify(createSummary(roomId)),
      }),
    ),
  );
}

async function removeRoom(lobbyDirectory, now, payload) {
  return withMockedNow(now, async () =>
    lobbyDirectory.fetch(
      new Request("https://lobby-directory.internal/internal/remove", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    ),
  );
}

async function listRooms(lobbyDirectory, now) {
  return withMockedNow(now, async () =>
    lobbyDirectory.fetch(
      new Request("https://lobby-directory.internal/internal/list", {
        method: "GET",
      }),
    ),
  );
}

test("conditional remove does not delete a newer lobby summary from the same millisecond", async () => {
  const lobbyDirectory = new LobbyDirectoryDO(new TestDurableObjectState());

  await upsertRoom(lobbyDirectory, 1_000);
  await upsertRoom(lobbyDirectory, 1_000);

  const removeResponse = await removeRoom(lobbyDirectory, 2_000, {
    roomId: "room-1",
    expectedUpdatedAt: 1_000,
  });
  assert.equal(removeResponse.status, 200);

  const removePayload = await removeResponse.json();
  assert.equal(removePayload.removed, false);

  const listResponse = await listRooms(lobbyDirectory, 2_000);
  const listPayload = await listResponse.json();
  assert.equal(listPayload.rooms.length, 1);
  assert.equal(listPayload.rooms[0].roomId, "room-1");
  assert.equal(listPayload.rooms[0].updatedAt, 1_001);
});

test("conditional remove deletes the matching lobby summary", async () => {
  const lobbyDirectory = new LobbyDirectoryDO(new TestDurableObjectState());

  await upsertRoom(lobbyDirectory, 1_000);

  const removeResponse = await removeRoom(lobbyDirectory, 2_000, {
    roomId: "room-1",
    expectedUpdatedAt: 1_000,
  });
  assert.equal(removeResponse.status, 200);

  const removePayload = await removeResponse.json();
  assert.equal(removePayload.removed, true);

  const listResponse = await listRooms(lobbyDirectory, 2_000);
  const listPayload = await listResponse.json();
  assert.equal(listPayload.rooms.length, 0);
});

test("conditional remove does not delete a recreated summary from the same millisecond", async () => {
  const lobbyDirectory = new LobbyDirectoryDO(new TestDurableObjectState());

  await upsertRoom(lobbyDirectory, 1_000);

  const firstRemoveResponse = await removeRoom(lobbyDirectory, 1_000, {
    roomId: "room-1",
    expectedUpdatedAt: 1_000,
  });
  assert.equal(firstRemoveResponse.status, 200);
  assert.equal((await firstRemoveResponse.json()).removed, true);

  await upsertRoom(lobbyDirectory, 1_000);

  const delayedRemoveResponse = await removeRoom(lobbyDirectory, 1_001, {
    roomId: "room-1",
    expectedUpdatedAt: 1_000,
  });
  assert.equal(delayedRemoveResponse.status, 200);
  assert.equal((await delayedRemoveResponse.json()).removed, false);

  const listResponse = await listRooms(lobbyDirectory, 1_001);
  const listPayload = await listResponse.json();
  assert.equal(listPayload.rooms.length, 1);
  assert.equal(listPayload.rooms[0].roomId, "room-1");
  assert.equal(listPayload.rooms[0].updatedAt, 1_001);
});

test("restores the monotonic updatedAt counter from legacy per-room storage", async () => {
  const state = new TestDurableObjectState();
  await state.storage.put("rooms", {
    "room-legacy": createSummary("room-legacy"),
  });
  await state.storage.put("lastUpdatedAtByRoomId", {
    "room-legacy": 1_000,
    "room-old": 2_500,
  });

  const lobbyDirectory = new LobbyDirectoryDO(state);
  await upsertRoom(lobbyDirectory, 2_000, "room-new");

  const listResponse = await listRooms(lobbyDirectory, 2_000);
  const listPayload = await listResponse.json();
  const roomNew = listPayload.rooms.find((room) => room.roomId === "room-new");
  assert.equal(roomNew?.updatedAt, 2_501);
});

test("persisted monotonic counter does not retain per-room tombstones after remove and expiry cleanup", async () => {
  const state = new TestDurableObjectState();
  const lobbyDirectory = new LobbyDirectoryDO(state);

  await upsertRoom(lobbyDirectory, 1_000, "room-remove");
  await upsertRoom(lobbyDirectory, 1_000, "room-expire");

  await removeRoom(lobbyDirectory, 2_000, {
    roomId: "room-remove",
    expectedUpdatedAt: 1_000,
  });

  await listRooms(lobbyDirectory, 1_000 + READY_CHECK_TTL_MS + 1);

  const storage = state.storage.snapshot();
  assert.equal(storage.rooms["room-remove"], undefined);
  assert.equal(storage.rooms["room-expire"], undefined);
  assert.equal(typeof storage.lastUpdatedAtByRoomId, "number");
});

test("scalar counter survives cold restore after every room has been removed", async () => {
  const state = new TestDurableObjectState();
  const first = new LobbyDirectoryDO(state);
  await upsertRoom(first, 1_000);
  await upsertRoom(first, 1_000);
  await removeRoom(first, 1_000, { roomId: "room-1" });
  assert.deepEqual(state.storage.snapshot().rooms, {});
  assert.equal(state.storage.snapshot().lastUpdatedAtByRoomId, 1_001);

  const restored = new LobbyDirectoryDO(state);
  await upsertRoom(restored, 1_000);
  const staleRemoval = await removeRoom(restored, 1_000, {
    roomId: "room-1",
    expectedUpdatedAt: 1_001,
  });
  assert.equal((await staleRemoval.json()).removed, false);
  const payload = await (await listRooms(restored, 1_000)).json();
  assert.equal(payload.rooms[0].updatedAt, 1_002);
});

test("restored summaries set a counter floor even when helper storage is missing or behind", async () => {
  for (const helper of [undefined, 500, { deleted: 500 }]) {
    const state = new TestDurableObjectState();
    await state.storage.put("rooms", {
      existing: { ...createSummary("existing"), updatedAt: 2_500 },
    });
    if (helper !== undefined) {
      await state.storage.put("lastUpdatedAtByRoomId", helper);
    }
    const restored = new LobbyDirectoryDO(state);
    await upsertRoom(restored, 2_000, "new");
    const payload = await (await listRooms(restored, 2_000)).json();
    assert.equal(payload.rooms.find((room) => room.roomId === "new").updatedAt, 2_501);
    assert.equal(state.storage.snapshot().lastUpdatedAtByRoomId, 2_501);
  }
});

test("legacy migration and repeated remove/TTL churn keep only live rooms and a scalar", async () => {
  const state = new TestDurableObjectState();
  await state.storage.put("lastUpdatedAtByRoomId", { deleted: 2_500 });
  const directory = new LobbyDirectoryDO(state);
  for (let index = 0; index < 200; index += 1) {
    const roomId = `churn-${index}`;
    await upsertRoom(directory, 2_000, roomId);
    await removeRoom(directory, 2_000, { roomId });
  }
  await upsertRoom(directory, 2_000, "expires");
  const atDeadline = await (await listRooms(directory, 1_000 + READY_CHECK_TTL_MS)).json();
  assert.equal(atDeadline.rooms.length, 1);
  const afterDeadline = await (await listRooms(directory, 1_000 + READY_CHECK_TTL_MS + 1)).json();
  assert.equal(afterDeadline.rooms.length, 0);
  const storage = state.storage.snapshot();
  assert.deepEqual(Object.keys(storage).sort(), ["lastUpdatedAtByRoomId", "rooms"]);
  assert.deepEqual(storage.rooms, {});
  assert.equal(storage.lastUpdatedAtByRoomId, 2_701);
});

test("counter advancement preserves public fields, TTL origin, filters and ordering", async () => {
  const directory = new LobbyDirectoryDO(new TestDurableObjectState());
  const summaries = [
    { ...createSummary("older"), createdAt: 900 },
    createSummary("visible"),
    { ...createSummary("private"), isPublic: false },
    { ...createSummary("full"), currentPlayers: 2 },
    { ...createSummary("playing"), status: "PLAYING" },
  ];
  await withMockedNow(1_000, async () => {
    for (const summary of summaries) {
      await directory.fetch(new Request("https://lobby-directory.internal/internal/upsert", {
        method: "POST", body: JSON.stringify(summary),
      }));
    }
  });
  const payload = await (await listRooms(directory, 1_000 + READY_CHECK_TTL_MS)).json();
  assert.deepEqual(Object.keys(payload).sort(), ["rooms", "serverTime"]);
  assert.deepEqual(payload.rooms.map((room) => room.roomId), ["visible", "older"]);
  for (const room of payload.rooms) {
    assert.deepEqual(Object.keys(room).sort(), Object.keys(createSummary(room.roomId)).sort());
    assert.equal(room.ttlStartedAt, 1_000);
  }
  assert.equal((await (await listRooms(directory, 1_000 + READY_CHECK_TTL_MS + 1)).json()).rooms.length, 0);
});

test("storage restore failure is observable and does not overwrite the stored state", async () => {
  const failure = new Error("synthetic storage read failure");
  const writes = [];
  const directory = new LobbyDirectoryDO({
    storage: {
      async get() { throw failure; },
      async put(...args) { writes.push(args); },
    },
    async blockConcurrencyWhile(callback) { return callback(); },
  });
  await assert.rejects(listRooms(directory, 1_000), failure);
  assert.deepEqual(writes, []);
});

test("corrupt stored rooms or counters fail restoration without overwriting evidence", async () => {
  const fixtures = [
    { rooms: null, lastUpdatedAtByRoomId: 2_500 },
    { rooms: [], lastUpdatedAtByRoomId: 2_500 },
    { rooms: new Map(), lastUpdatedAtByRoomId: 2_500 },
    { rooms: { bad: null }, lastUpdatedAtByRoomId: 2_500 },
    { rooms: { "room-1": { ...createSummary("room-1"), ttlStartedAt: "corrupt" } }, lastUpdatedAtByRoomId: 2_500 },
    { rooms: { "room-1": { ...createSummary("room-1"), currentPlayers: Number.NaN } }, lastUpdatedAtByRoomId: 2_500 },
    { rooms: { "room-1": { ...createSummary("room-1"), currentPlayers: Number.POSITIVE_INFINITY } }, lastUpdatedAtByRoomId: 2_500 },
    { rooms: { "room-1": { ...createSummary("room-1"), currentPlayers: -1 } }, lastUpdatedAtByRoomId: 2_500 },
    { rooms: { mismatch: createSummary("room-1") }, lastUpdatedAtByRoomId: 2_500 },
    { rooms: {}, lastUpdatedAtByRoomId: "corrupt" },
    { rooms: {}, lastUpdatedAtByRoomId: null },
    { rooms: {}, lastUpdatedAtByRoomId: [] },
    { rooms: {}, lastUpdatedAtByRoomId: new Map() },
    { rooms: {}, lastUpdatedAtByRoomId: { deleted: "corrupt" } },
    { rooms: {}, lastUpdatedAtByRoomId: Number.POSITIVE_INFINITY },
    { rooms: {}, lastUpdatedAtByRoomId: 2 ** 53 },
    { rooms: { "room-1": { ...createSummary("room-1"), updatedAt: 2 ** 53 } } },
    { rooms: {}, lastUpdatedAtByRoomId: 2_500.5 },
  ];
  for (const fixture of fixtures) {
    const state = new TestDurableObjectState();
    for (const [key, value] of Object.entries(fixture)) {
      await state.storage.put(key, value);
    }
    const before = structuredClone(state.storage.snapshot());
    const directory = new LobbyDirectoryDO(state);
    await assert.rejects(upsertRoom(directory, 2_000), /Invalid stored lobby/);
    await assert.rejects(listRooms(directory, 2_000), /Invalid stored lobby/);
    assert.deepEqual(state.storage.snapshot(), before);
  }
});

test("counter exhaustion cannot reuse the last exact integer or modify storage", async () => {
  const state = new TestDurableObjectState();
  await state.storage.put("lastUpdatedAtByRoomId", Number.MAX_SAFE_INTEGER - 1);
  const directory = new LobbyDirectoryDO(state);
  await upsertRoom(directory, 1_000);
  const before = structuredClone(state.storage.snapshot());
  assert.equal(before.rooms["room-1"].updatedAt, Number.MAX_SAFE_INTEGER);
  await assert.rejects(upsertRoom(directory, 1_000), /counter exhausted/);
  assert.deepEqual(state.storage.snapshot(), before);
});

test("empty-directory sentinel persisted by an absent remove remains readable", async () => {
  const state = new TestDurableObjectState();
  const first = new LobbyDirectoryDO(state);
  await removeRoom(first, 1_000, { roomId: "absent" });
  assert.equal(state.storage.snapshot().lastUpdatedAtByRoomId, Number.NEGATIVE_INFINITY);
  const restored = new LobbyDirectoryDO(state);
  await upsertRoom(restored, 1_000);
  assert.equal((await (await listRooms(restored, 1_000)).json()).rooms[0].updatedAt, 1_000);
});
