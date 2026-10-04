import assert from "node:assert/strict";
import test from "node:test";
import { handlePostEventRooms } from "./event-rooms";

function env(enabled = true) {
  const calls = [];
  return { calls, value: { HOST_EVENT_ACCEPT_NEW: enabled ? "true" : "false", MIN_SUPPORTED_CLIENT_VERSION: "1.4.0",
    ROOM_DO: { idFromName(value) { return { toString: () => value }; }, get() { return { async fetch(request) { calls.push(await request.json()); return Response.json({ ok: true }); } }; } } } };
}
function payload(eventName = "  weekly  ") { return { host_event_protocol: 1, client_version: "1.4.0", host_player_id: "host", host_display_name: "Host",
  settings: { event_name: eventName, event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "ABCD2345" } }; }
function request(body) { return new Request("https://worker/api/event-rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

test("event room create preserves name whitespace and initializes the shared ROOM_DO", async () => {
  const mocked = env(); const response = await handlePostEventRooms(request(payload()), mocked.value);
  assert.equal(response.status, 201); const body = await response.json();
  assert.equal(body.settings.event_name, "  weekly  "); assert.equal(body.join_code, "ABCD2345"); assert.equal(mocked.calls[0].settings.event_name, "  weekly  ");
});
test("event room creation is disabled by default and rejects newline names", async () => {
  const disabled = env(false); assert.equal((await handlePostEventRooms(request(payload()), disabled.value)).status, 400); assert.equal(disabled.calls.length, 0);
  const enabled = env(true); const response = await handlePostEventRooms(request(payload("bad\nname")), enabled.value);
  assert.equal(response.status, 400); assert.equal(enabled.calls.length, 0);
});
