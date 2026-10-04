import assert from "node:assert/strict";
import test from "node:test";
import { isEventCreateIdentityReady, isEventJoinIdentityReady, resolveEventJoinParticipantEquipment } from "./event-join-policy";

const settings = {
  playerId: "host-or-player",
  displayName: "DJ",
  source: "inf-notebook" as const,
  bitUnlockEnabled: true,
  djpUnlockEnabled: false,
  allowLeggendaria: true,
  ownedPackIds: [1, 2],
};

test("an event identity without source configuration may reach the server for dedicated-host recognition", () => {
  assert.equal(isEventJoinIdentityReady(settings), true);
  assert.equal(resolveEventJoinParticipantEquipment(settings, false), null);
});

test("an unconfigured participant sends no source and remains subject to server SOURCE_REQUIRED", () => {
  const equipment = resolveEventJoinParticipantEquipment(settings, false);
  assert.deepEqual(equipment, null);
});

test("a configured participant keeps source and unlock metadata", () => {
  const equipment = resolveEventJoinParticipantEquipment(settings, true);
  assert.deepEqual(equipment, {
    source: "inf-notebook",
    songUnlocks: { bit_unlocked: true, djp_unlocked: false, allow_leggendaria: true, owned_pack_ids: [1, 2] },
  });
});

test("event creation needs source readiness only when the host also plays", () => {
  assert.equal(isEventCreateIdentityReady(settings, false, false), true);
  assert.equal(isEventCreateIdentityReady(settings, true, false), false);
  assert.equal(isEventCreateIdentityReady(settings, true, true), true);
});
