import assert from "node:assert/strict";
import test from "node:test";
import type { EventRoundResult, ServerMessagePayloadMap } from "@infinitas/shared";
import { applyEventResultsPage, createEventResultsSyncState } from "./event-results-sync";

function round(index: number, revision = 10): EventRoundResult {
  return {
    round_id: `round-${index}`,
    chart: { chart_key: `chart-${index}`, expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: `Song ${index}` }, display: { title: `Song ${index}`, level: 12 } },
    playing_player_ids: [], started_at: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`, confirmed_at: "2026-01-01T01:00:00.000Z",
    invalidated_at: null, public_revision: revision, results: [],
  };
}

function page(rounds: EventRoundResult[], nextCursor: string | null, publicRevision = 10, resyncRequired = false): ServerMessagePayloadMap["EVENT_RESULTS"] {
  return { rounds, next_cursor: nextCursor, public_revision: publicRevision, resync_required: resyncRequired };
}

test("all pages beyond fifty rounds are accumulated and duplicate rounds are upserted", () => {
  const firstPage = Array.from({ length: 50 }, (_, index) => round(index));
  firstPage[49] = round(49, 9);
  let sync = applyEventResultsPage(createEventResultsSyncState(), page(firstPage, "page-2")).state;
  assert.equal(sync.complete, false);
  sync = applyEventResultsPage(sync, page([round(49), ...Array.from({ length: 6 }, (_, index) => round(index + 50))], null)).state;
  assert.equal(sync.rounds.length, 56);
  assert.equal(sync.rounds.find((value) => value.round_id === "round-49")?.public_revision, 10);
  assert.equal(sync.complete, true);
});

test("cursor invalidation and revision changes discard partial pages and require a fresh sync", () => {
  const partial = applyEventResultsPage(createEventResultsSyncState(), page([round(1)], "page-2")).state;
  assert.equal(applyEventResultsPage(partial, page([], null, 10, true)).restartRequired, true);
  assert.equal(applyEventResultsPage(partial, page([], null, 11)).restartRequired, true);
});
