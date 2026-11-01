import assert from "node:assert/strict";
import test from "node:test";
import type { EventRoomSnapshot, EventRoundResult } from "@infinitas/shared";
import { eventHistoryService, isReadableEventHistory } from "./event-history";
import type { EventHistoryDocument } from "./event-history";

const STORAGE_KEY = "infinitas.client.event-results.v2";
const LEGACY_STORAGE_KEY = "infinitas.client.event-results.v1";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const snapshot = {
  schema_version: 2, room_kind: "HOST_EVENT", room_id: "room", generation: 1, event_id: "event",
  settings: { event_name: "opaque event", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "secret" },
  phase: "PLAYING", round_phase: "ACTIVE", revision: 2, selection_revision: 1,
  host: { player_id: "host", display_name: "Host", connected: true, plays: false }, participants: [],
  fixed_roster_player_ids: [], scoring_size_n: null,
  selected_chart: null, current_round_id: "round", current_eligible_player_ids: [], current_playing_player_ids: [], host_disconnect_deadline: null,
  latest_result: null, started_at: "2026-01-01T00:00:00.000Z", ended_at: null, end_reason: null,
} satisfies EventRoomSnapshot;

const round = {
  round_id: "round", chart: { chart_key: "chart", expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song" }, display: { title: "Song", level: 12 } },
  playing_player_ids: ["p"], started_at: "2026-01-01T00:01:00.000Z", confirmed_at: "2026-01-01T00:02:00.000Z",
  invalidated_at: null, public_revision: 3,
  results: [{ player_id: "p", display_name: "P", status: "SUBMITTED", metric_value: 2000, absence_reason: null, rank: 1, confirmed_at: "2026-01-01T00:02:00.000Z" }],
} satisfies EventRoundResult;

function installStorage(storage = new MemoryStorage()): { storage: MemoryStorage; restore: () => void } {
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  return { storage, restore: () => Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous }) };
}

const legacy = {
  schema_version: 1, event_id: "event", room_id: "room", settings: snapshot.settings, host: snapshot.host,
  participants: [{ player_id: "p", display_name: "P", connection_state: "DISCONNECTED", pending_next: false, round_status: "SUBMITTED", ready: true }],
  fixed_roster_player_ids: ["p"], scoring_size_n: 1, started_at: snapshot.started_at,
  ended_at: "2026-01-01T00:03:00.000Z", end_reason: "HOST_ENDED", rounds: [round],
  last_public_revision: 3, synced_round_count: 1, results_sync_complete: true,
  last_received_at: "2026-01-01T00:03:00.000Z", completeness: "COMPLETE",
} satisfies Omit<EventHistoryDocument, "participants"> & { participants: Array<EventHistoryDocument["participants"][number] & { ready: boolean }> };

test("v1 read adapter ignores ready and preserves original bytes, saved targets, ranks, points and completeness", async () => {
  const fixture = installStorage();
  const original = JSON.stringify([legacy, { schema_version: 99, event_id: "future" }], null, 2);
  fixture.storage.setItem(LEGACY_STORAGE_KEY, original);
  try {
    eventHistoryService.clearMemoryForTests();
    const entry = eventHistoryService.list()[0]!;
    assert.equal(isReadableEventHistory(entry), true);
    if (!isReadableEventHistory(entry)) throw new Error("Expected legacy history");
    assert.equal(entry.schema_version, 1);
    assert.equal("ready" in entry.participants[0]!, false);
    assert.deepEqual(entry.rounds, legacy.rounds);
    assert.equal(entry.completeness, "COMPLETE");
    assert.equal(fixture.storage.getItem(LEGACY_STORAGE_KEY), original);
    assert.equal(fixture.storage.getItem(STORAGE_KEY), null);
    await eventHistoryService.ingestResults(snapshot, [round], 3, undefined, false);
    assert.equal(fixture.storage.getItem(LEGACY_STORAGE_KEY), original);
    const saved = JSON.parse(fixture.storage.getItem(STORAGE_KEY)!) as EventHistoryDocument[];
    assert.equal(saved[0]?.schema_version, 2);
    assert.equal(saved[0]?.participants.some((participant) => "ready" in participant), false);
    eventHistoryService.clearMemoryForTests();
    const entries = eventHistoryService.list();
    assert.equal(entries.filter(isReadableEventHistory).length, 1);
    assert.equal(entries.find(isReadableEventHistory)?.schema_version, 2);
    assert.equal(entries.filter((value) => !isReadableEventHistory(value)).length, 1);
  } finally { eventHistoryService.clearMemoryForTests(); fixture.restore(); }
});

test("malformed v1 root and unknown v2 records remain preserved; malformed v2 root cannot be overwritten", async () => {
  const fixture = installStorage();
  try {
    fixture.storage.setItem(LEGACY_STORAGE_KEY, "{broken-v1");
    const unknown = { schema_version: 99, event_id: "future", payload: "untouched" };
    fixture.storage.setItem(STORAGE_KEY, JSON.stringify([unknown]));
    eventHistoryService.clearMemoryForTests();
    assert.equal(eventHistoryService.list().filter((value) => !isReadableEventHistory(value)).length, 2);
    await eventHistoryService.ingestSnapshot(snapshot);
    assert.equal(fixture.storage.getItem(LEGACY_STORAGE_KEY), "{broken-v1");
    assert.deepEqual(JSON.parse(fixture.storage.getItem(STORAGE_KEY)!).find((value: { schema_version: number }) => value.schema_version === 99), unknown);
    fixture.storage.setItem(STORAGE_KEY, "{broken-v2");
    eventHistoryService.clearMemoryForTests();
    await assert.rejects(eventHistoryService.ingestSnapshot(snapshot), /原本を保持/);
    assert.equal(fixture.storage.getItem(STORAGE_KEY), "{broken-v2");
  } finally { eventHistoryService.clearMemoryForTests(); fixture.restore(); }
});

test("invalidated public round replaces its prior revision without rewriting v1", async () => {
  const fixture = installStorage();
  const original = JSON.stringify([legacy]);
  fixture.storage.setItem(LEGACY_STORAGE_KEY, original);
  try {
    eventHistoryService.clearMemoryForTests();
    const invalidated = { ...round, public_revision: 4, invalidated_at: "2026-01-01T00:04:00.000Z" } satisfies EventRoundResult;
    await eventHistoryService.ingestResults(snapshot, [invalidated], 4, [], false);
    eventHistoryService.clearMemoryForTests();
    const entry = eventHistoryService.list().find(isReadableEventHistory)!;
    assert.equal(entry.rounds.length, 1);
    assert.equal(entry.rounds[0]?.invalidated_at, invalidated.invalidated_at);
    assert.equal(entry.completeness, "PARTIAL");
    assert.equal(fixture.storage.getItem(LEGACY_STORAGE_KEY), original);
  } finally { eventHistoryService.clearMemoryForTests(); fixture.restore(); }
});

test("Tauri bridge saves schema2, reports native failures, and reloads WebView storage while preserving v1", async () => {
  const fixture = installStorage();
  const previousWindow = globalThis.window;
  const original = JSON.stringify([legacy]);
  fixture.storage.setItem(LEGACY_STORAGE_KEY, original);
  const calls: Array<{ command: string; request: { eventId: string; jsonText: string } }> = [];
  let fail = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { __TAURI_INTERNALS__: { invoke: async (command: string, args: { request: { eventId: string; jsonText: string } }) => {
    if (fail) throw new Error("native disk unavailable");
    calls.push({ command, request: args.request });
    return { filePath: "event-results/event.v2.json" };
  } } } });
  try {
    eventHistoryService.clearMemoryForTests();
    await eventHistoryService.ingestResults(snapshot, [round], 3, undefined, false);
    assert.equal(calls[0]?.command, "save_event_result_json");
    assert.equal(JSON.parse(calls[0]!.request.jsonText).schema_version, 2);
    eventHistoryService.clearMemoryForTests();
    assert.equal(eventHistoryService.list().find(isReadableEventHistory)?.schema_version, 2);
    fail = true;
    await assert.rejects(eventHistoryService.ingestResults(snapshot, [round], 3, undefined, false), /native disk unavailable/);
    assert.equal(fixture.storage.getItem(LEGACY_STORAGE_KEY), original);
  } finally {
    eventHistoryService.clearMemoryForTests(); fixture.restore();
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("browser storage failure is reported without touching a legacy original", async () => {
  class FailingStorage extends MemoryStorage {
    override setItem(key: string, value: string): void {
      if (key === STORAGE_KEY) throw new Error("quota exceeded");
      super.setItem(key, value);
    }
  }
  const fixture = installStorage(new FailingStorage());
  const original = JSON.stringify([legacy]);
  fixture.storage.setItem(LEGACY_STORAGE_KEY, original);
  try {
    eventHistoryService.clearMemoryForTests();
    await assert.rejects(eventHistoryService.ingestSnapshot(snapshot), /quota exceeded/);
    assert.equal(fixture.storage.getItem(LEGACY_STORAGE_KEY), original);
  } finally { eventHistoryService.clearMemoryForTests(); fixture.restore(); }
});

test("history becomes complete only after authoritative final RESULT and the final public page", async () => {
  const fixture = installStorage();
  try {
    eventHistoryService.clearMemoryForTests();
    const finalSnapshot = { ...snapshot, settings: { ...snapshot.settings, event_type: "TOURNAMENT" }, fixed_roster_player_ids: ["p"], scoring_size_n: 1, phase: "RESULT", round_phase: null, ended_at: "2026-01-01T00:03:00.000Z", end_reason: "HOST_ENDED", latest_result: round, revision: 4 } satisfies EventRoomSnapshot;
    await eventHistoryService.ingestSnapshot(finalSnapshot, { complete: false, publicRevision: null });
    let entry = eventHistoryService.list()[0]!;
    assert.equal(isReadableEventHistory(entry) && entry.completeness, "PARTIAL");
    await eventHistoryService.ingestResults(finalSnapshot, [round], 3, undefined, true);
    entry = eventHistoryService.list()[0]!;
    assert.equal(isReadableEventHistory(entry) && entry.completeness, "COMPLETE");
    assert.equal(isReadableEventHistory(entry) && entry.synced_round_count, 1);
    assert.deepEqual(isReadableEventHistory(entry) && entry.fixed_roster_player_ids, ["p"]);
    assert.equal(isReadableEventHistory(entry) && entry.scoring_size_n, 1);
  } finally {
    eventHistoryService.clearMemoryForTests(); fixture.restore();
  }
});

test("CLOSED state and an unfinished result cursor remain partial", async () => {
  const fixture = installStorage();
  try {
    eventHistoryService.clearMemoryForTests();
    const closed = { ...snapshot, phase: "CLOSED", round_phase: null, ended_at: "2026-01-01T00:03:00.000Z", end_reason: "ROOM_STATE_LOST", latest_result: round, revision: 4 } satisfies EventRoomSnapshot;
    await eventHistoryService.ingestResults(closed, [round], 3, undefined, true);
    const entry = eventHistoryService.list()[0]!;
    assert.equal(isReadableEventHistory(entry) && entry.completeness, "PARTIAL");
  } finally {
    eventHistoryService.clearMemoryForTests(); fixture.restore();
  }
});

test("unknown schema records remain visible and are preserved when a known record is persisted", async () => {
  const fixture = installStorage();
  const unknown = { schema_version: 99, event_id: "future-event", future: { untouched: true } };
  fixture.storage.setItem(STORAGE_KEY, JSON.stringify([unknown]));
  try {
    eventHistoryService.clearMemoryForTests();
    const unreadable = eventHistoryService.list()[0]!;
    assert.equal(isReadableEventHistory(unreadable), false);
    assert.deepEqual(!isReadableEventHistory(unreadable) && unreadable.raw, unknown);
    await eventHistoryService.ingestSnapshot(snapshot, { complete: false, publicRevision: null });
    const persisted = JSON.parse(fixture.storage.getItem(STORAGE_KEY)!) as unknown[];
    assert.deepEqual(persisted.find((value) => (value as { schema_version?: number }).schema_version === 99), unknown);
  } finally {
    eventHistoryService.clearMemoryForTests(); fixture.restore();
  }
});

test("a restarted public-results sync removes rounds and overall results from the invalidated page set", async () => {
  const fixture = installStorage();
  try {
    eventHistoryService.clearMemoryForTests();
    const withOverall = { ...snapshot, overall_results: [{ player_id: "p", display_name: "P", total_points: 1, rank: 1 }] } satisfies EventRoomSnapshot;
    await eventHistoryService.ingestResults(withOverall, [round], 3, withOverall.overall_results, false);
    await eventHistoryService.ingestSnapshot(snapshot, { complete: false, publicRevision: null, resetResults: true });
    const entry = eventHistoryService.list()[0]!;
    assert.equal(isReadableEventHistory(entry) && entry.rounds.length, 0);
    assert.equal(isReadableEventHistory(entry) && entry.overall_results, undefined);
    assert.equal(isReadableEventHistory(entry) && entry.last_public_revision, 0);
    assert.equal(isReadableEventHistory(entry) && entry.completeness, "PARTIAL");
  } finally {
    eventHistoryService.clearMemoryForTests(); fixture.restore();
  }
});

test("malformed known-schema records stay unreadable with their raw source preserved", async () => {
  const fixture = installStorage();
  try {
    eventHistoryService.clearMemoryForTests();
    await eventHistoryService.ingestResults(snapshot, [round], 3, undefined, false);
    const valid = (JSON.parse(fixture.storage.getItem(STORAGE_KEY)!) as unknown[])[0] as Record<string, unknown>;
    const corruptions: Array<[string, (document: Record<string, unknown>) => void]> = [
      ["missing settings", (document) => { delete document.settings; }],
      ["broken round", (document) => { (document.rounds as Array<Record<string, unknown>>)[0]!.started_at = "not-a-timestamp"; }],
      ["broken result", (document) => {
        const storedRound = (document.rounds as Array<Record<string, unknown>>)[0]!;
        (storedRound.results as Array<Record<string, unknown>>)[0]!.metric_value = "2000";
      }],
      ["invalid tournament N", (document) => { document.scoring_size_n = "1"; }],
      ["invalid public revision", (document) => { document.last_public_revision = -1; }],
      ["missing fixed roster", (document) => { delete document.fixed_roster_player_ids; }],
      ["missing tournament N", (document) => { delete document.scoring_size_n; }],
      ["missing synced round count", (document) => { delete document.synced_round_count; }],
      ["missing results sync state", (document) => { delete document.results_sync_complete; }],
    ];

    for (const [label, corrupt] of corruptions) {
      const malformed = structuredClone(valid);
      corrupt(malformed);
      fixture.storage.setItem(STORAGE_KEY, JSON.stringify([malformed]));
      eventHistoryService.clearMemoryForTests();
      const entry = eventHistoryService.list()[0]!;
      assert.equal(isReadableEventHistory(entry), false, label);
      assert.deepEqual(!isReadableEventHistory(entry) && entry.raw, malformed, label);
    }
  } finally {
    eventHistoryService.clearMemoryForTests(); fixture.restore();
  }
});
