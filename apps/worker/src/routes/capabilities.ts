import { HOST_EVENT_PROTOCOL } from "@infinitas/shared";
import { eventAcceptNew } from "../services/event-room-create";
import type { WorkerEnv } from "../types/env";
import type { CapabilitiesResponse } from "../types/api";
import { ok } from "../utils/http";

export function handleGetCapabilities(env: WorkerEnv): Response {
  const payload: CapabilitiesResponse = { host_event_protocol: HOST_EVENT_PROTOCOL, host_event_accept_new: eventAcceptNew(env) };
  return ok(payload);
}
