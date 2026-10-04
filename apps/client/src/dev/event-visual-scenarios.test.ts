import assert from "node:assert/strict";
import test from "node:test";
import { EVENT_VISUAL_SCENARIO_IDS, getEventVisualScenario } from "./event-visual-scenarios";

test("event visual evidence fixtures cover V8 edge states", () => {
  assert.deepEqual(EVENT_VISUAL_SCENARIO_IDS, ["event-zero-host", "event-twenty-source", "event-disconnected-round-result", "event-tie-absence-final", "event-casual-final-mobile"]);
  assert.equal(getEventVisualScenario("event-zero-host")?.state.snapshot?.participants.length, 0);
  assert.equal(getEventVisualScenario("event-twenty-source")?.state.snapshot?.participants.length, 20);
  const disconnected = getEventVisualScenario("event-disconnected-round-result")?.state.snapshot;
  assert.equal(disconnected?.phase, "PLAYING");
  assert.equal(disconnected?.round_phase, "RESULT");
  assert.equal(disconnected?.host.connected, false);
  assert.notEqual(disconnected?.host_disconnect_deadline, null);
  assert.equal(disconnected?.ended_at, null);
  assert.equal(disconnected?.end_reason, null);
  const terminal = getEventVisualScenario("event-tie-absence-final")?.state.snapshot;
  assert.equal(terminal?.phase, "RESULT");
  assert.equal(terminal?.host.connected, true);
  assert.equal(terminal?.host_disconnect_deadline, null);
  assert.equal(terminal?.end_reason, "HOST_ENDED");
  const result = terminal?.latest_result;
  assert.equal(result?.results.filter((entry) => entry.rank === 1).length, 2);
  assert.equal(result?.results.some((entry) => entry.status === "ABSENT"), true);
  assert.equal(getEventVisualScenario("event-casual-final-mobile")?.state.resultRounds.length, 2);
});
