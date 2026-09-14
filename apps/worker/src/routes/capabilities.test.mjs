import assert from "node:assert/strict";
import test from "node:test";
import { handleGetCapabilities } from "./capabilities";

test("capabilities exposes protocol and defaults event creation to disabled", async () => {
  assert.deepEqual(await handleGetCapabilities({}).json(), { host_event_protocol: 1, host_event_accept_new: false });
  assert.deepEqual(await handleGetCapabilities({ HOST_EVENT_ACCEPT_NEW: "true" }).json(), { host_event_protocol: 1, host_event_accept_new: true });
});
