import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventRoundResult, EventRoundResultEntry } from "@infinitas/shared";
import { EventOverallResults, EventRoundResults, EventRoundsReview } from "./EventFinalReview";

const rounds = ["First Song", "Second Song"].map((title, index) => ({
  round_id: `round-${index + 1}`,
  chart: { chart_key: `chart-${index + 1}`, expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: title }, display: { title, level: 12 } },
  playing_player_ids: ["player"],
  started_at: "2026-09-09T00:00:00.000Z",
  confirmed_at: "2026-09-09T00:03:00.000Z",
  invalidated_at: null,
  public_revision: index + 1,
  results: [{ player_id: "player", display_name: "Player", status: "SUBMITTED", metric_value: 2000 + index, absence_reason: null, rank: 1, confirmed_at: "2026-09-09T00:03:00.000Z" }],
})) satisfies EventRoundResult[];

test("CASUAL final review renders every synchronized song", () => {
  const markup = renderToStaticMarkup(<EventRoundsReview rounds={rounds} metricLabel="SCORE" isTournament={false} selfPlayerId="player" />);
  assert.match(markup, /第1曲 First Song/);
  assert.match(markup, /第2曲 Second Song/);
  assert.match(markup, /grid-cols-\[52px_minmax\(0,1fr\)\]/);
  assert.match(markup, /sm:grid-cols-\[60px_minmax\(0,1fr\)_150px_80px\]/);
  assert.doesNotMatch(markup, /grid-cols-\[60px_1fr_150px_80px\]/);
});

test("TOURNAMENT history renders authoritative overall standings", () => {
  const markup = renderToStaticMarkup(<EventOverallResults entries={[{ player_id: "player", display_name: "Player", total_points: 8, rank: 1 }]} selfPlayerId={null} />);
  assert.match(markup, /1位/);
  assert.match(markup, /Player/);
  assert.match(markup, /8pt/);
});

test("round cards include a lower-ranked or absent self without duplicating a top-three self", () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({ ...rounds[0]!.results[0]!, player_id: `p${index}`, display_name: `PLAYER${index}`, rank: index + 1, tournament_points: 6 - index })) satisfies EventRoundResultEntry[];
  for (const selfPlayerId of ["p0", "p3", "p5"]) {
    const cards = renderToStaticMarkup(<EventRoundResults entries={entries} metricLabel="SCORE" isTournament selfPlayerId={selfPlayerId} />).split('class="event-result-table"')[0]!;
    assert.equal((cards.match(/<article/g) ?? []).length, selfPlayerId === "p0" ? 3 : 4);
    assert.equal((cards.match(new RegExp(`PLAYER${selfPlayerId.slice(1)}`, "g")) ?? []).length, 1);
  }
  const absent = entries.map((entry) => entry.player_id === "p5" ? { ...entry, rank: null, status: "ABSENT" as const, absence_reason: "DEADLINE" as const, metric_value: 0, tournament_points: 0 } : entry) satisfies EventRoundResultEntry[];
  const cards = renderToStaticMarkup(<EventRoundResults entries={absent} metricLabel="SCORE" isTournament selfPlayerId="p5" />).split('class="event-result-table"')[0]!;
  assert.match(cards, /欠場/);
  assert.match(cards, /締切まで未提出/);
  assert.match(cards, /0pt/);
});

test("tied winners receive the same card emphasis alongside a lower-ranked self", () => {
  const entries = [1, 1, 3, 4].map((rank, index) => ({ ...rounds[0]!.results[0]!, player_id: `p${index}`, rank })) satisfies EventRoundResultEntry[];
  const cards = renderToStaticMarkup(<EventRoundResults entries={entries} metricLabel="SCORE" isTournament={false} selfPlayerId="p3" />).split('class="event-result-table"')[0]!;
  assert.equal((cards.match(/event-rank-winner/g) ?? []).length, 2);
  assert.equal((cards.match(/<article/g) ?? []).length, 4);
});
