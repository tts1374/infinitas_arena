import assert from "node:assert/strict";
import test from "node:test";
import type { EventRoomSnapshot } from "@infinitas/shared";
import type { ParsedSourceChangePayload, ParsedSourceObservationPayload } from "./tauri-bridge";
import { eventRoomStore } from "../stores/event-room-store";
import { eventNotebookReplayGuard } from "./event-notebook-replay";
import { eventHistoryService } from "./event-history";
import { submitParsedSourceChange } from "./source-submission";

const observation = { timestamp: "20261005-120000", playStyle: "SP", difficulty: "ANOTHER", title: "Song", titleSearchKey: "Song", chartId: 42, score: 2000, misscount: 10 } satisfies ParsedSourceObservationPayload;
const active = {
  schema_version: 2, room_kind: "HOST_EVENT", room_id: "room", generation: 1, event_id: "event",
  settings: { event_name: "", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "secret" },
  phase: "PLAYING", round_phase: "ACTIVE", revision: 1, selection_revision: 1,
  host: { player_id: "host", display_name: "HOST", connected: true, plays: false },
  participants: [{ player_id: "player", display_name: "PLAYER", connection_state: "CONNECTED", pending_next: false, round_status: "PENDING" }],
  fixed_roster_player_ids: [], scoring_size_n: null,
  selected_chart: { chart_key: "song", expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song", chart_id: 42 }, display: { title: "Song", level: 12 } },
  current_round_id: "round-1", current_eligible_player_ids: ["player"], current_playing_player_ids: ["player"],
  host_disconnect_deadline: null, latest_result: null, started_at: "2026-10-05T12:00:00.000Z", ended_at: null, end_reason: null,
} satisfies EventRoomSnapshot;

class FakeSocket extends EventTarget {
  static readonly OPEN = 1;
  static latest: FakeSocket;
  readyState = 1;
  sent: string[] = [];
  constructor(_url: string) { super(); FakeSocket.latest = this; queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
  send(value: string): void { this.sent.push(value); }
  close(): void { this.readyState = 3; }
  receive(type: string, payload: unknown): void { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type, payload }) })); }
}

for (const source of ["inf-notebook", "daken_counter_v3", "reflux", "inf_daken_counter"] as const) {
  for (const metric of ["SCORE", "MISSCOUNT"] as const) {
    test(`${source}/${metric}: automatic two-round submission uses ACK authority and preserves the source flow without Ready`, async () => {
      const previousSocket = globalThis.WebSocket;
      const previousStorage = globalThis.localStorage;
      globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
      const values = new Map<string, string>();
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
      eventNotebookReplayGuard.clearForTests();
      eventHistoryService.clearMemoryForTests();
      try {
        assert.equal(eventRoomStore.connect({ apiBaseUrl: "https://example.com", roomId: "room", playerId: "player", displayName: "PLAYER", joinCode: "secret", source }), true);
        await Promise.resolve();
        const socket = FakeSocket.latest;
        const first = { ...active, settings: { ...active.settings, win_metric: metric } } satisfies EventRoomSnapshot;
        socket.receive("EVENT_JOIN_ACCEPTED", { session_role: "PLAYER", event_room_snapshot: first });
        const change = { source, filePath: "test-source", fileSizeBytes: 1, observations: [observation], unresolvedCases: [] } satisfies ParsedSourceChangePayload;
        socket.receive("EVENT_STATE", { event_room_snapshot: { ...first, round_phase: "RESULT" } satisfies EventRoomSnapshot });
        assert.equal(submitParsedSourceChange(change, source).ok, false);
        socket.receive("EVENT_STATE", { event_room_snapshot: first });
        assert.equal(submitParsedSourceChange({ ...change, observations: [{ ...observation, difficulty: "HYPER" }] }, source).ok, false);
        assert.equal(submitParsedSourceChange(change, source).ok, true);
        const action = JSON.parse(socket.sent.at(-1)!) as { payload: { action: string; request_id: string; metric_value: number; round_id: string } };
        assert.equal(action.payload.action, "SUBMIT");
        assert.equal(action.payload.metric_value, metric === "SCORE" ? 2000 : 10);
        assert.equal(eventRoomStore.getState().snapshot?.participants[0]?.round_status, "PENDING");
        assert.equal(submitParsedSourceChange(change, source).ok, false);
        socket.receive("EVENT_ACTION_ACK", { request_id: action.payload.request_id });
        assert.deepEqual(eventRoomStore.getState().pendingMutationRequestIds, []);
        socket.receive("EVENT_STATE", { event_room_snapshot: { ...first, revision: 2, participants: [{ ...first.participants[0]!, round_status: "SUBMITTED" }] } satisfies EventRoomSnapshot });
        assert.equal(eventRoomStore.getState().snapshot?.participants[0]?.round_status, "SUBMITTED");
        assert.equal(submitParsedSourceChange(change, source).ok, false);
        const second = { ...first, revision: 3, current_round_id: "round-2", selection_revision: 2, host: { ...first.host, connected: false }, host_disconnect_deadline: "2026-10-05T12:05:00.000Z" } satisfies EventRoomSnapshot;
        socket.receive("EVENT_STATE", { event_room_snapshot: second });
        if (source === "inf-notebook") assert.equal(submitParsedSourceChange(change, source).ok, false);
        assert.equal(submitParsedSourceChange({ ...change, observations: [{ ...observation, timestamp: "20261005-120001" }] }, source).ok, true);
        const nextAction = JSON.parse(socket.sent.at(-1)!) as { payload: { action: string; round_id: string } };
        assert.equal(nextAction.payload.round_id, "round-2");
        assert.equal(socket.sent.some((message) => message.includes("SET_READY")), false);
        assert.equal(eventRoomStore.getState().snapshot?.latest_result, null);
      } finally {
        eventRoomStore.disconnect();
        eventNotebookReplayGuard.clearForTests();
        eventHistoryService.clearMemoryForTests();
        globalThis.WebSocket = previousSocket;
        Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousStorage });
      }
    });
  }
}

for (const source of ["inf-notebook", "daken_counter_v3", "reflux", "inf_daken_counter"] as const) {
  test(`${source}: unavailable input cannot invent a result; user skip waits for server authority`, async () => {
    const previousSocket = globalThis.WebSocket;
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
    try {
      eventRoomStore.connect({ apiBaseUrl: "https://example.com", roomId: "room", playerId: "player", displayName: "PLAYER", joinCode: "secret", source });
      await Promise.resolve();
      const socket = FakeSocket.latest;
      socket.receive("EVENT_JOIN_ACCEPTED", { session_role: "PLAYER", event_room_snapshot: active });
      eventRoomStore.reportSourceUnavailable("入力を読み取れません");
      const before = socket.sent.length;
      assert.equal(submitParsedSourceChange({ source, filePath: "missing", observations: [], unresolvedCases: [], fileSizeBytes: 0 } satisfies ParsedSourceChangePayload, source).ok, false);
      assert.equal(socket.sent.length, before);
      assert.equal(eventRoomStore.getState().snapshot?.participants[0]?.round_status, "PENDING");
      assert.equal(eventRoomStore.skip(), true);
      const action = JSON.parse(socket.sent.at(-1)!) as { payload: { action: string; request_id: string } };
      assert.equal(action.payload.action, "SKIP");
      socket.receive("EVENT_ACTION_ACK", { request_id: action.payload.request_id });
      assert.equal(eventRoomStore.getState().snapshot?.participants[0]?.round_status, "PENDING");
      socket.receive("EVENT_STATE", { event_room_snapshot: { ...active, revision: 2, participants: [{ ...active.participants[0]!, round_status: "SKIPPED" }] } satisfies EventRoomSnapshot });
      assert.equal(eventRoomStore.getState().snapshot?.participants[0]?.round_status, "SKIPPED");
      assert.equal(submitParsedSourceChange({ source, filePath: "missing", observations: [observation], unresolvedCases: [], fileSizeBytes: 1 } satisfies ParsedSourceChangePayload, source).ok, false);
    } finally { eventRoomStore.disconnect(); globalThis.WebSocket = previousSocket; }
  });
}
