import assert from "node:assert/strict";
import test from "node:test";
import { armDevControlSource, invalidateDevControlSource, isDevControlObservationCurrent, setDevControlSourceContext } from "./adapter-source-gate";
import { canonicalDevControlJson, devControlConfirmationToken, type ContextToken } from "./protocol";
import { RoomSocketClient } from "../services/ws-client";
import { capturePrivacyReason, guardCapturePrivacy, type CapturePrivacyInput } from "./capture-policy";

test("capture commit rejects transient private screens and always stops observation", async () => {
  for (const change of ["safe", "private", "private-then-safe", "capture-failed"] as const) {
    let privacy: string | null = null, stopped = false, check = () => {}, accepted: boolean | undefined;
    const work = guardCapturePrivacy({ privacy: () => privacy,
      watch: callback => { check = callback; return () => { stopped = true; }; },
      capture: async () => {
        if (change === "capture-failed") throw Error("capture failed");
        if (change !== "safe") { privacy = "private"; check(); }
        if (change === "private-then-safe") { privacy = null; check(); }
        return "memory-image";
      }, commit: async (image, accept) => { accepted = accept; return image; },
    });
    if (change === "capture-failed") await assert.rejects(work, /capture failed/);
    else { assert.equal(await work, "memory-image"); assert.equal(accepted, change === "safe"); }
    assert.equal(stopped, true);
  }
  await assert.rejects(guardCapturePrivacy({ privacy: () => "private", watch: () => () => {}, capture: async () => assert.fail("private capture must not start"), commit: async () => assert.fail("private capture must not commit") }), /機密情報/);
});

test("native capture is never requested while source paths, invitations or editable settings are visible", () => {
  const safe = { hasEditableFields: false, visibleText: "PLAYING", joinCode: "private-code", sourcePaths: ["C:/real-source"], hostInviteVisible: false } satisfies CapturePrivacyInput;
  assert.equal(capturePrivacyReason(safe), null);
  for (const unsafe of [{ ...safe, hasEditableFields: true }, { ...safe, hostInviteVisible: true }, { ...safe, visibleText: "code private-code" }, { ...safe, visibleText: "source C:/real-source" }]) assert.notEqual(capturePrivacyReason(unsafe), null);
});

const token = {
  sessionId: "session", targetClientId: "B", transportEpoch: 1, roomId: "room", roomGeneration: 1,
  matchId: "match", eventId: null, roundIndex: 0, roundId: null,
  expectedKey: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "song", chart_id: 123 },
  selectionRevision: null, policyRevision: 1, valueRevision: 1,
} satisfies ContextToken;

test("a source arm accepts only the current context and matching source freshness", () => {
  let current: ContextToken = structuredClone(token);
  setDevControlSourceContext(() => current);
  try {
    for (const source of ["inf-notebook", "reflux", "daken_counter_v3"] as const) {
      current = structuredClone(token);
      armDevControlSource({ context: token, source, timestamp: "fresh", inputId: "input", sourceFingerprint: "1234abcd" });
      assert.equal(isDevControlObservationCurrent({ source, timestamp: "fresh", sourceFingerprint: "1234abcd" }), true);
      if (source === "daken_counter_v3") {
        assert.equal(isDevControlObservationCurrent({ source, timestamp: "fresh", sourceFingerprint: "old12345" }), false);
        assert.equal(isDevControlObservationCurrent({ source, timestamp: "fresh" }), false);
      }
      if (source !== "daken_counter_v3") assert.equal(isDevControlObservationCurrent({ source, timestamp: "old" }), false);
      for (const field of ["transportEpoch", "policyRevision", "valueRevision", "roomGeneration", "roundIndex"] as const) {
        current = { ...token, [field]: 2 };
        assert.equal(isDevControlObservationCurrent({ source, timestamp: "fresh", sourceFingerprint: "1234abcd" }), false, field);
      }
      current = { ...token, matchId: "next" };
      assert.equal(isDevControlObservationCurrent({ source, timestamp: "fresh", sourceFingerprint: "1234abcd" }), false);
    }
    invalidateDevControlSource();current = structuredClone(token);
    assert.equal(isDevControlObservationCurrent({ source: "reflux", timestamp: "fresh" }), false);
  } finally { setDevControlSourceContext(null); }
  assert.equal(isDevControlObservationCurrent({ source: "reflux", timestamp: "ordinary launch" }), true);
});

test("confirmation binds target, value and policy revisions without object-order ambiguity", () => {
  const draft = { exScore: 0, missCount: 0 };
  const confirmed = devControlConfirmationToken(token, draft, "policy.auto");
  assert.equal(confirmed, devControlConfirmationToken({ ...token }, { missCount: 0, exScore: 0 }, "policy.auto"));
  assert.notEqual(confirmed, devControlConfirmationToken({ ...token, targetClientId: "C" }, draft, "policy.auto"));
  assert.notEqual(confirmed, devControlConfirmationToken({ ...token, policyRevision: 2 }, draft, "policy.auto"));
  assert.notEqual(confirmed, devControlConfirmationToken(token, { ...draft, exScore: 1 }, "policy.auto"));
  assert.equal(canonicalDevControlJson({ z: 1, a: [2, 3] }), '{"a":[2,3],"z":1}');
});

class FakeSocket extends EventTarget {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 1;
  sent: string[] = [];
  constructor(_url: string) { super(); FakeSocket.instances.push(this); }
  send(value: string): void { this.sent.push(value); }
  close(): void { this.readyState = 3; }
}

test("callbacks from a detached normal socket cannot mutate or send through the replacement", () => {
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  FakeSocket.instances = [];
  let messages = 0, errors = 0;
  const options = {
    apiBaseUrl: "http://127.0.0.1:19999", roomId: "room", playerId: "b", displayName: "B", source: "reflux",
    bitUnlockEnabled: true, djpUnlockEnabled: true, allowLeggendaria: true, ownedPackIds: [],
    onMessage: () => { messages++; }, onError: () => { errors++; },
  } satisfies ConstructorParameters<typeof RoomSocketClient>[0];
  const client = new RoomSocketClient(options);
  try {
    client.connect();const old = FakeSocket.instances[0]!;
    client.disconnect(false);client.connect();const current = FakeSocket.instances[1]!;
    current.dispatchEvent(new Event("open"));
    const sends = current.sent.length;
    old.dispatchEvent(new Event("open"));old.dispatchEvent(new Event("error"));
    old.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "ROOM_UPDATED", payload: {} }) }));
    assert.equal(messages, 0);assert.equal(errors, 0);assert.equal(current.sent.length, sends);
  } finally { client.disconnect(false);globalThis.WebSocket = previous; }
});
