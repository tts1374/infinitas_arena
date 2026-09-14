import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventRoundResult } from "@infinitas/shared";
import { EventOverallResults, EventRoundsReview } from "./EventFinalReview";

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
