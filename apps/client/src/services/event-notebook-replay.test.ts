import assert from "node:assert/strict";
import test from "node:test";
import { buildEventNotebookFingerprint, eventNotebookReplayGuard } from "./event-notebook-replay";

const fingerprint = buildEventNotebookFingerprint({
  titleSearchKey: "Song",
  difficulty: "ANOTHER",
  score: 2000,
  misscount: 10,
});

function token(timestamp = "20260907-120000") {
  return { eventId: "event", playerId: "player", timestamp, fingerprint };
}

test("notebook observation commits only on its matching SUBMIT ACK and duplicate ACK is inert", () => {
  eventNotebookReplayGuard.clearForTests();
  assert.equal(eventNotebookReplayGuard.rejection("event", "player", token().timestamp, fingerprint), null);
  assert.equal(eventNotebookReplayGuard.track("submit-1", token()), true);
  assert.notEqual(eventNotebookReplayGuard.rejection("event", "player", token().timestamp, fingerprint), null);
  assert.equal(eventNotebookReplayGuard.acknowledge("unrelated-action"), false);
  assert.equal(eventNotebookReplayGuard.acknowledge("submit-1"), true);
  assert.equal(eventNotebookReplayGuard.acknowledge("submit-1"), false);
  assert.deepEqual(eventNotebookReplayGuard.rejection("event", "player", token().timestamp, fingerprint), {
    current: token().timestamp,
    previous: token().timestamp,
  });
});

test("EVENT_ERROR releases a pending observation while an unacknowledged reconnect remains pending", () => {
  eventNotebookReplayGuard.clearForTests();
  eventNotebookReplayGuard.track("failed", token());
  assert.equal(eventNotebookReplayGuard.reject("failed"), true);
  assert.equal(eventNotebookReplayGuard.rejection("event", "player", token().timestamp, fingerprint), null);

  eventNotebookReplayGuard.track("accepted", token());
  eventNotebookReplayGuard.acknowledge("accepted");
  const nextFingerprint = buildEventNotebookFingerprint({ titleSearchKey: "Next", difficulty: "ANOTHER", score: 2100, misscount: 8 });
  eventNotebookReplayGuard.track("new-pending", { ...token("20260907-120001"), fingerprint: nextFingerprint });
  assert.notEqual(eventNotebookReplayGuard.rejection("event", "player", "20260907-120001", nextFingerprint), null);
  assert.equal(eventNotebookReplayGuard.acknowledge("new-pending"), true);
  assert.notEqual(eventNotebookReplayGuard.rejection("event", "player", "20260907-120001", nextFingerprint), null);
  assert.notEqual(eventNotebookReplayGuard.rejection("event", "player", token().timestamp, fingerprint), null);
});

test("explicit disconnect may discard pending observation state", () => {
  eventNotebookReplayGuard.clearForTests();
  eventNotebookReplayGuard.track("pending", token());
  assert.deepEqual(eventNotebookReplayGuard.releasePending(), ["pending"]);
  assert.equal(eventNotebookReplayGuard.rejection("event", "player", token().timestamp, fingerprint), null);
});
