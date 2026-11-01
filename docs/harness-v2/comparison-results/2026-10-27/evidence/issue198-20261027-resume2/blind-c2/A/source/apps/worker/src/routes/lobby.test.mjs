import test from "node:test";
import assert from "node:assert/strict";
import { handleGetLobby } from "./lobby.ts";
import { LobbyDirectoryDO } from "../durable/lobby-directory-object.ts";

function createJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function buildRoom(roomId, roomName, updatedAt) {
  return {
    roomId,
    roomName,
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
    ttlStartedAt: 100,
    createdAt: 100,
    updatedAt,
  };
}

function createEnv({ eligibilityByRoomId = {}, removeCalls = [], failRemoveFor = new Set() } = {}) {
  return {
    ROOM_DO: {
      idFromName(name) {
        return { toString: () => name };
      },
      get(id) {
        const roomId = id.toString();
        return {
          fetch: async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/internal/lobby-eligibility") {
              const response = eligibilityByRoomId[roomId];
              if (response instanceof Error) {
                throw response;
              }
              return response ?? createJsonResponse({ eligible: true });
            }

            return createJsonResponse({ error: "unexpected room request" }, 500);
          },
        };
      },
    },
    LOBBY_DIRECTORY_DO: {
      idFromName() {
        return { toString: () => "lobby-directory" };
      },
      get() {
        return {
          fetch: async (request) => {
            const url = new URL(request.url);
            if (url.pathname === "/internal/list") {
              return createJsonResponse({
                rooms: [
                  buildRoom("room-eligible-false", "eligible false", 101),
                  buildRoom("room-lost", "lost", 102),
                  buildRoom("room-500", "server error", 103),
                  buildRoom("room-transport", "transport error", 104),
                ],
                serverTime: 123,
              });
            }

            if (url.pathname === "/internal/remove") {
              const payload = await request.json();
              if (failRemoveFor.has(payload.roomId)) {
                throw new Error("remove failed");
              }
              removeCalls.push(payload);
              return createJsonResponse({ ok: true });
            }

            return createJsonResponse({ error: "unexpected lobby request" }, 500);
          },
        };
      },
    },
  };
}

test("handleGetLobby removes stale eligibility failures but keeps response schema intact", async () => {
  const removeCalls = [];
  const env = createEnv({
    removeCalls,
    eligibilityByRoomId: {
      "room-eligible-false": createJsonResponse({ eligible: false }),
      "room-lost": createJsonResponse({ error: "ROOM_STATE_LOST" }, 404),
      "room-500": createJsonResponse({ error: "boom" }, 500),
      "room-transport": new Error("socket hang up"),
    },
  });

  const response = await handleGetLobby(new Request("https://worker.test/api/lobby", { method: "GET" }), env);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.deepEqual(payload.rooms.map((room) => room.roomId), ["room-500", "room-transport"]);
  assert.deepEqual(
    removeCalls
      .sort((left, right) => left.roomId.localeCompare(right.roomId))
      .map((call) => ({ roomId: call.roomId, expectedUpdatedAt: call.expectedUpdatedAt })),
    [
      { roomId: "room-eligible-false", expectedUpdatedAt: 101 },
      { roomId: "room-lost", expectedUpdatedAt: 102 },
    ],
  );
  assert.equal(payload.serverTime, 123);
  assert.ok(payload.rooms.every((room) => !("revision" in room)));
});

test("handleGetLobby fail-open keeps lobby response when eligibility probes reject", async () => {
  const env = createEnv({
    eligibilityByRoomId: {
      "room-eligible-false": createJsonResponse({ eligible: true }),
      "room-lost": createJsonResponse({ eligible: true }),
      "room-500": createJsonResponse({ error: "boom" }, 500),
      "room-transport": new Error("transport failure"),
    },
  });

  const response = await handleGetLobby(new Request("https://worker.test/api/lobby", { method: "GET" }), env);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.rooms.length, 4);
  assert.deepEqual(payload.rooms.map((room) => room.roomId), [
    "room-eligible-false",
    "room-lost",
    "room-500",
    "room-transport",
  ]);
});

test("handleGetLobby excludes rooms that probe as stale on the same response", async () => {
  const removeCalls = [];
  const env = createEnv({
    removeCalls,
    eligibilityByRoomId: {
      "room-eligible-false": createJsonResponse({ eligible: false }),
      "room-lost": createJsonResponse({ error: "ROOM_STATE_LOST" }, 404),
      "room-500": createJsonResponse({ eligible: true }),
      "room-transport": createJsonResponse({ eligible: true }),
    },
  });

  const response = await handleGetLobby(new Request("https://worker.test/api/lobby", { method: "GET" }), env);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.deepEqual(payload.rooms.map((room) => room.roomId), ["room-500", "room-transport"]);
  assert.deepEqual(
    removeCalls
      .sort((left, right) => left.roomId.localeCompare(right.roomId))
      .map((call) => ({ roomId: call.roomId, expectedUpdatedAt: call.expectedUpdatedAt })),
    [
      { roomId: "room-eligible-false", expectedUpdatedAt: 101 },
      { roomId: "room-lost", expectedUpdatedAt: 102 },
    ],
  );
});

test("handleGetLobby keeps stale rooms excluded when cleanup removal fails", async () => {
  const removeCalls = [];
  const env = createEnv({
    removeCalls,
    failRemoveFor: new Set(["room-eligible-false"]),
    eligibilityByRoomId: {
      "room-eligible-false": createJsonResponse({ eligible: false }),
      "room-lost": createJsonResponse({ eligible: false }),
      "room-500": createJsonResponse({ eligible: true }),
      "room-transport": createJsonResponse({ eligible: true }),
    },
  });

  const response = await handleGetLobby(new Request("https://worker.test/api/lobby", { method: "GET" }), env);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.deepEqual(payload.rooms.map((room) => room.roomId), ["room-500", "room-transport"]);
  assert.deepEqual(removeCalls, [{ roomId: "room-lost", expectedUpdatedAt: 102 }]);
});

function createProbeBarrier() {
  let enter;
  let release;
  const started = new Promise((resolve) => { enter = resolve; });
  const response = new Promise((resolve) => { release = resolve; });
  return {
    started,
    release,
    async fetch() {
      enter();
      return response;
    },
  };
}

for (const lost of [false, true]) {
  for (const recreate of [false, true]) {
    test(`delayed lobby probe preserves same-ms newer summary (lost=${lost}, recreate=${recreate})`, async () => {
      const originalNow = Date.now;
      Date.now = () => 1_000;
      try {
        const records = new Map();
        const directory = new LobbyDirectoryDO({
          storage: {
            async get(key) { return structuredClone(records.get(key)); },
            async put(key, value) { records.set(key, structuredClone(value)); },
          },
          async blockConcurrencyWhile(callback) { return callback(); },
        });
        const callDirectory = (path, body) => directory.fetch(new Request(
          `https://lobby-directory.internal/internal/${path}`,
          body === undefined ? {} : { method: "POST", body: JSON.stringify(body) },
        ));
        const summary = buildRoom("race-room", "before", 1_000);
        const list = async () => (await (await callDirectory("list")).json()).rooms;
        await callDirectory("upsert", summary);
        const first = (await list())[0].updatedAt;
        const createRaceEnv = (probe) => ({
          LOBBY_DIRECTORY_DO: { idFromName: (name) => name, get: () => directory },
          ROOM_DO: { idFromName: (name) => name, get: () => probe },
        });
        const olderProbe = createProbeBarrier();
        const laterProbe = createProbeBarrier();
        const oldResponse = handleGetLobby(new Request("https://worker.test/api/lobby"), createRaceEnv(olderProbe));
        await olderProbe.started;
        const laterResponse = handleGetLobby(new Request("https://worker.test/api/lobby"), createRaceEnv(laterProbe));
        await laterProbe.started;
        if (recreate) {
          assert.equal((await (await callDirectory("remove", { roomId: summary.roomId })).json()).removed, true);
        }
        await callDirectory("upsert", { ...summary, roomName: "after" });
        const fresh = (await list())[0];
        assert.ok(fresh.updatedAt > first);

        // Complete the later request first; both probes still refer to the old summary.
        laterProbe.release(createJsonResponse({ eligible: false }));
        assert.deepEqual((await (await laterResponse).json()).rooms, []);
        assert.deepEqual(await list(), [fresh]);
        olderProbe.release(lost
          ? createJsonResponse({ error: "ROOM_STATE_LOST" }, 404)
          : createJsonResponse({ eligible: false }));
        assert.deepEqual((await (await oldResponse).json()).rooms, []);
        assert.deepEqual(await list(), [fresh]);
        assert.equal(fresh.roomName, "after");
      } finally {
        Date.now = originalNow;
      }
    });
  }
}
