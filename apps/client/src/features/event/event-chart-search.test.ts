import assert from "node:assert/strict";
import test from "node:test";
import type { ChartSearchEntry, ChartSearchQuery, ChartSearchResponse } from "@infinitas/shared";
import { createEventChartSearch, type EventChartSearchState } from "./event-chart-search";

const chart = (key: string): ChartSearchEntry => ({ chart_key: key, play_style: "SP", difficulty: "ANOTHER", level: 12, title: key, title_qualifier: "", artist: "artist", genre: "genre", title_search_key: key });
const query: ChartSearchQuery = { play_style: "SP", level_filter: "ANY", keyword: "" };
function fixture() {
  const requests: { room: string; query: ChartSearchQuery; resolve: (response: ChartSearchResponse) => void; reject: () => void }[] = [];
  let latest: EventChartSearchState = { charts: [], nextCursor: null, loading: false, error: false };
  const reader = createEventChartSearch((room, query) => new Promise((resolve, reject) => requests.push({ room, query, resolve, reject: () => reject(new Error("unavailable")) })), next => { latest = next; });
  return { reader, requests, get latest() { return latest; } };
}

test("room candidates continue past the first API page with one in-flight cursor request", async () => {
  const f = fixture();
  const first = f.reader.reset("room", query);
  f.requests[0]!.resolve({ charts: [chart("first")], next_cursor: "page-2" }); await first;
  const more = f.reader.loadMore(); await f.reader.loadMore();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1]!.query.cursor, "page-2");
  f.requests[1]!.resolve({ charts: [chart("first"), chart("later")], next_cursor: null }); await more;
  assert.deepEqual(f.latest.charts.map(chart => chart.chart_key), ["first", "later"]);
  assert.equal(f.latest.nextCursor, null);
  const next = f.reader.reset("another-room", query);
  f.requests[2]!.resolve({ charts: [chart("next")], next_cursor: "page-2" }); await next;
  f.reader.dispose(); await f.reader.loadMore();
  assert.equal(f.requests.length, 3, "a queued observer callback cannot start reads after unmount");
});

test("search/room changes and disposal reject obsolete successful or failed responses", async () => {
  const f = fixture();
  const old = f.reader.reset("old-room", query);
  const current = f.reader.reset("new-room", { ...query, keyword: "new", difficulty: "HYPER", level: 10, version: "30" });
  assert.equal(f.latest.charts.length, 0);
  f.requests[1]!.resolve({ charts: [chart("current")], next_cursor: null }); await current;
  f.requests[0]!.resolve({ charts: [chart("obsolete")], next_cursor: "old" }); await old;
  assert.deepEqual(f.latest.charts.map(chart => chart.chart_key), ["current"]);
  assert.equal(f.requests[1]!.room, "new-room");
  assert.deepEqual(f.requests[1]!.query, { ...query, keyword: "new", difficulty: "HYPER", level: 10, version: "30" });
  const pending = f.reader.reset("new-round", query); f.reader.dispose();
  f.requests[2]!.reject(); await pending;
  assert.equal(f.latest.error, false);
});

test("next-page failures remain visible and explicit retry uses the same cursor", async () => {
  const f = fixture();
  const first = f.reader.reset("room", query);
  f.requests[0]!.resolve({ charts: [chart("first")], next_cursor: "page-2" }); await first;
  const more = f.reader.loadMore(); f.requests[1]!.reject(); await more;
  assert.equal(f.latest.error, true);
  assert.equal(f.latest.charts[0]!.chart_key, "first");
  await f.reader.loadMore(); assert.equal(f.requests.length, 2);
  const retry = f.reader.retry(); assert.equal(f.requests[2]!.query.cursor, "page-2");
  f.requests[2]!.resolve({ charts: [chart("later")], next_cursor: null }); await retry;
  assert.equal(f.latest.error, false);
  assert.deepEqual(f.latest.charts.map(chart => chart.chart_key), ["first", "later"]);
});
