import assert from "node:assert/strict";
import test from "node:test";
import { activateParticipationMode, clearParticipationMode, getActiveParticipationMode } from "./participation-mode";

test("normal and host-event participation are mutually exclusive", () => {
  clearParticipationMode("NORMAL");
  clearParticipationMode("HOST_EVENT");
  assert.equal(activateParticipationMode("NORMAL"), true);
  assert.equal(activateParticipationMode("HOST_EVENT"), false);
  assert.equal(getActiveParticipationMode(), "NORMAL");
  clearParticipationMode("NORMAL");
  assert.equal(activateParticipationMode("HOST_EVENT"), true);
  clearParticipationMode("HOST_EVENT");
  assert.equal(getActiveParticipationMode(), null);
});
