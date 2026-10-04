import assert from "node:assert/strict";
import test from "node:test";
import { HOST_EVENT_NAME_MAX_LENGTH } from "@infinitas/shared";
import { displayEventName, validateEventName } from "./event-name";

test("event name accepts empty and exactly the shared maximum without trimming storage", () => {
  assert.equal(validateEventName(""), null);
  const exact = ` ${"a".repeat(HOST_EVENT_NAME_MAX_LENGTH - 2)} `;
  assert.equal(exact.length, HOST_EVENT_NAME_MAX_LENGTH);
  assert.equal(validateEventName(exact), null);
  assert.equal(displayEventName({ event_name: exact, event_type: "CASUAL", play_style: "SP" }), exact);
});

test("event name rejects maximum plus one and either newline form", () => {
  assert.notEqual(validateEventName("a".repeat(HOST_EVENT_NAME_MAX_LENGTH + 1)), null);
  assert.notEqual(validateEventName("line1\nline2"), null);
  assert.notEqual(validateEventName("line1\rline2"), null);
});

test("whitespace-only event names use the event type and play style display fallback", () => {
  assert.equal(displayEventName({ event_name: " \t ", event_type: "CASUAL", play_style: "SP" }), "合同プレー SP");
  assert.equal(displayEventName({ event_name: "", event_type: "TOURNAMENT", play_style: "DP" }), "大会 DP");
});
