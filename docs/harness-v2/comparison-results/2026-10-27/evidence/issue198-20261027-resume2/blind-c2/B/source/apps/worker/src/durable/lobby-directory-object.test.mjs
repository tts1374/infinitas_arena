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
  assert.equal(state.storage.snapshot().lastUpdatedAtByRoomId, 2_501);
});

test("restores the persisted scalar counter after all rooms were removed and the clock moved backwards", async () => {
  const state = new TestDurableObjectState();
  const lobbyDirectory = new LobbyDirectoryDO(state);
  await upsertRoom(lobbyDirectory, 1_000);
  await upsertRoom(lobbyDirectory, 1_000);
  const removeResponse = await removeRoom(lobbyDirectory, 1_000, {
    roomId: "room-1",
    expectedUpdatedAt: 1_001,
  });
  assert.equal((await removeResponse.json()).removed, true);

  const snapshot = structuredClone(state.storage.snapshot());
  assert.deepEqual(snapshot.rooms, {});
  assert.equal(snapshot.lastUpdatedAtByRoomId, 1_001);
  const restoredState = new TestDurableObjectState();
  for (const [key, value] of Object.entries(snapshot)) {
    await restoredState.storage.put(key, value);
  }
  const restoredDirectory = new LobbyDirectoryDO(restoredState);
  await upsertRoom(restoredDirectory, 999);
  const staleRemoveResponse = await removeRoom(restoredDirectory, 999, {
    roomId: "room-1",
    expectedUpdatedAt: 1_001,
  });
  assert.equal((await staleRemoveResponse.json()).removed, false);
  const listPayload = await (await listRooms(restoredDirectory, 999)).json();
  assert.equal(listPayload.rooms.length, 1);
  assert.equal(listPayload.rooms[0].updatedAt, 1_002);
  assert.equal(restoredState.storage.snapshot().lastUpdatedAtByRoomId, 1_002);
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
