import { createEventRoom } from "../services/event-room-create";
import type { WorkerEnv } from "../types/env";
import { badRequest, created, parseJsonBody } from "../utils/http";

export async function handlePostEventRooms(request: Request, env: WorkerEnv): Promise<Response> {
  try {
    return created(await createEventRoom(env, await parseJsonBody(request)));
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid request.");
  }
}
