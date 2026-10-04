import assert from "node:assert/strict";
import test from "node:test";
import { createEventRoom, getCapabilities, getMatchmakingWaitingCount, HostEventCapabilitiesTracker, supportsHostEventCreation, supportsHostEvents, WorkerApiError } from "./worker-api-client";

test("host events are enabled only for protocol 1 and a legacy 404 remains usable for normal rooms", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ host_event_protocol: 1 }), { status: 200 })) as typeof fetch;
    assert.equal(supportsHostEvents(await getCapabilities("https://example.com")), true);
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    assert.deepEqual(await getCapabilities("https://legacy.example.com"), {});
    assert.equal(supportsHostEvents({}), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("host event creation requires the accept-new capability and sends protocol metadata", async () => {
  assert.equal(supportsHostEventCreation({ host_event_protocol: 1, host_event_accept_new: true }), true);
  assert.equal(supportsHostEventCreation({ host_event_protocol: 1, host_event_accept_new: false }), false);
  const previousFetch = globalThis.fetch;
  let body: unknown;
  globalThis.fetch = (async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ room_id: "event", generation: 1, join_code: "ABCDEFGH", settings: (body as { settings: unknown }).settings }), { status: 200 });
  }) as typeof fetch;
  try {
    await createEventRoom("https://example.com", {
      host_player_id: "host",
      host_display_name: "Host",
      settings: { event_name: "  opaque name  ", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "" },
    });
    assert.equal((body as { host_event_protocol: number }).host_event_protocol, 1);
    assert.equal(typeof (body as { client_version: unknown }).client_version, "string");
    assert.equal((body as { settings: { event_name: string } }).settings.event_name, "  opaque name  ");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("capabilities reset immediately on URL change and only the newest response applies", () => {
  const tracker = new HostEventCapabilitiesTracker();
  const oldRequest = tracker.start();
  assert.deepEqual(oldRequest.availability, { hostEventsAvailable: false, hostEventCreationAvailable: false });
  assert.deepEqual(tracker.resolve(oldRequest.generation, { host_event_protocol: 1, host_event_accept_new: true }), {
    hostEventsAvailable: true,
    hostEventCreationAvailable: true,
  });

  const newRequest = tracker.start();
  assert.deepEqual(newRequest.availability, { hostEventsAvailable: false, hostEventCreationAvailable: false });
  assert.equal(tracker.resolve(oldRequest.generation, { host_event_protocol: 1, host_event_accept_new: true }), null);
  assert.deepEqual(tracker.resolve(newRequest.generation, { host_event_protocol: 1, host_event_accept_new: false }), {
    hostEventsAvailable: true,
    hostEventCreationAvailable: false,
  });
  tracker.cancel(newRequest.generation);
  assert.equal(tracker.resolve(newRequest.generation, { host_event_protocol: 1, host_event_accept_new: true }), null);
});

test("getMatchmakingWaitingCount builds waiting-count query from mode/play_style/win_metric", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: URL | RequestInfo; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ waiting_count: 4 }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }) as typeof fetch;

  try {
    const response = await getMatchmakingWaitingCount(" https://example.com/ ", {
      mode: "ARENA",
      play_style: "SP",
      win_metric: "SCORE",
    });

    assert.equal(response.waiting_count, 4);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.init?.method, "GET");

    const requestUrl = new URL(String(calls[0]?.input));
    assert.equal(requestUrl.origin, "https://example.com");
    assert.equal(requestUrl.pathname, "/api/matchmaking/waiting-count");
    assert.equal(requestUrl.searchParams.get("mode"), "ARENA");
    assert.equal(requestUrl.searchParams.get("play_style"), "SP");
    assert.equal(requestUrl.searchParams.get("win_metric"), "SCORE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getMatchmakingWaitingCount rejects empty base URL", async () => {
  await assert.rejects(
    () =>
      getMatchmakingWaitingCount("   ", {
        mode: "ARENA",
        play_style: "SP",
        win_metric: "SCORE",
      }),
    (error: unknown) =>
      error instanceof WorkerApiError &&
      error.status === 0 &&
      error.message === "Worker API URL is required.",
  );
});
