import assert from "node:assert/strict";
import test from "node:test";
import type { ExpectedKey, RoomStateSnapshot } from "@infinitas/shared";
import type { ParsedSourceObservationPayload } from "./tauri-bridge";
import { roomStore } from "../stores/room-store";
import { settingsStore } from "../stores/settings-store";
import { getVisualScenario } from "../dev/visual-scenarios";
import { submitSkipReason } from "./source-submission";
import { observationMatchesExpected } from "./source-observation";

const expected = { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song", chart_id: 42 } satisfies ExpectedKey;
const observed = { timestamp: "20260907-120000", playStyle: "SP", difficulty: "ANOTHER", title: "Song", titleSearchKey: "Song", chartId: 42, score: 2000, misscount: 10 } satisfies ParsedSourceObservationPayload;

for (const source of ["inf-notebook", "daken_counter_v3", "reflux", "inf_daken_counter"] as const) {
  test(`${source} adopts only an observation matching the authoritative expected key`, () => {
    assert.equal(observationMatchesExpected(observed, expected, source), true);
    assert.equal(observationMatchesExpected({ ...observed, difficulty: "HYPER" }, expected, source), false);
  });
}

test("daken_counter_v3 requires chart id when the expected key has one", () => {
  assert.equal(observationMatchesExpected({ ...observed, chartId: null }, expected, "daken_counter_v3"), false);
  assert.equal(observationMatchesExpected({ ...observed, chartId: null }, expected, "reflux"), true);
});

test("normal SOURCE_UNAVAILABLE preserves the active round and allows TECH self skip", async () => {
  class Socket extends EventTarget {
    static readonly OPEN = 1;
    static latest: Socket;
    readyState = 1;
    sent: string[] = [];
    constructor(_url: string) { super(); Socket.latest = this; queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(value: string): void { this.sent.push(value); }
    close(): void { this.readyState = 3; }
    receive(type: string, payload: unknown): void { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type, payload }) })); }
  }
  const previousSocket = globalThis.WebSocket;
  const previousSettings = settingsStore.getState().saved;
  const scenario = getVisualScenario("arena-playing")!;
  const snapshot = { ...scenario.room.snapshot, current_round: { ...scenario.room.snapshot.current_round!, confirmed: [] } } satisfies RoomStateSnapshot;
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  try {
    settingsStore.save({ ...scenario.settings, displayName: "TEST", source: "reflux" });
    assert.equal(roomStore.connect({ roomId: scenario.room.roomId!, joinCode: scenario.room.joinCode }, { ...scenario.settings, displayName: "TEST", source: "reflux" }), true);
    await Promise.resolve();
    const socket = Socket.latest;
    socket.receive("ROOM_JOIN_ACCEPTED", { room_state_snapshot: snapshot });
    roomStore.reportSourceUnavailable("入力ファイルを読み取れません");
    assert.equal(roomStore.getState().snapshot?.room_state, "PLAYING");
    assert.ok(roomStore.getState().errorDialog?.description.includes("TECH"));
    assert.equal(submitSkipReason("TECH", "source unavailable").ok, true);
    const action = JSON.parse(socket.sent.at(-1)!) as { type: string; payload: { reason: string; round_index: number } };
    assert.equal(action.type, "SKIP_SELF");
    assert.equal(action.payload.reason, "TECH");
    assert.equal(action.payload.round_index, snapshot.current_round.round_index);
    assert.equal(roomStore.getState().snapshot?.current_round?.confirmed.length, 0);
  } finally { roomStore.leaveRoom(); settingsStore.save(previousSettings); globalThis.WebSocket = previousSocket; }
});
