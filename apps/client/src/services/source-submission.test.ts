import assert from "node:assert/strict";
import test from "node:test";
import type { ExpectedKey } from "@infinitas/shared";
import type { ParsedSourceObservationPayload } from "./tauri-bridge";
import { observationMatchesExpected } from "./source-observation";

const expected = { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song", chart_id: 42 } satisfies ExpectedKey;
const observed = { timestamp: "20260907-120000", playStyle: "SP", difficulty: "ANOTHER", title: "Song", titleSearchKey: "Song", chartId: 42, score: 2000, misscount: 10 } satisfies ParsedSourceObservationPayload;

for (const source of ["inf-notebook", "daken_counter_v3", "reflux"] as const) {
  test(`${source} adopts only an observation matching the authoritative expected key`, () => {
    assert.equal(observationMatchesExpected(observed, expected, source), true);
    assert.equal(observationMatchesExpected({ ...observed, difficulty: "HYPER" }, expected, source), false);
  });
}

test("daken_counter_v3 requires chart id when the expected key has one", () => {
  assert.equal(observationMatchesExpected({ ...observed, chartId: null }, expected, "daken_counter_v3"), false);
  assert.equal(observationMatchesExpected({ ...observed, chartId: null }, expected, "reflux"), true);
});
