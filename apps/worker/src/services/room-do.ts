import type { EventRoomSettings, RoomSettings } from "@infinitas/shared";
import type { WorkerEnv } from "../types/env";

const INTERNAL_ROOM_INIT_URL = "https://room.internal/internal/init";
const INTERNAL_ROOM_RECREATE_URL = "https://room.internal/internal/recreate";
const INTERNAL_EVENT_ROOM_INIT_URL = "https://room.internal/internal/event-init";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

interface InitializeRoomRequest {
  room_id: string;
  settings: RoomSettings;
  created_at: string;
}

export interface InitializeEventRoomRequest {
  room_id: string;
  created_at: string;
  host_player_id: string;
  host_display_name: string;
  settings: EventRoomSettings;
}

interface RecreateRoomRequest {
  room_id: string;
  host_player_id: string;
}

interface RecreateRoomResponse {
  ok: true;
  room_id: string;
  generation: number;
  created_at: string;
  settings: RoomSettings;
}

export async function initializeRoomDurableObject(
  env: WorkerEnv,
  roomId: string,
  settings: RoomSettings,
  createdAtIso: string,
): Promise<void> {
  const doId = env.ROOM_DO.idFromName(roomId);
  const stub = env.ROOM_DO.get(doId);

  const payload: InitializeRoomRequest = {
    room_id: roomId,
    settings,
    created_at: createdAtIso,
  };

  const response = await stub.fetch(
    new Request(INTERNAL_ROOM_INIT_URL, {
      method: "POST",
      headers: {
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(payload),
    }),
  );

  if (!response.ok) {
    throw new Error("Failed to initialize room state.");
  }
}

export async function initializeEventRoomDurableObject(
  env: WorkerEnv,
  payload: InitializeEventRoomRequest,
): Promise<void> {
  const doId = env.ROOM_DO.idFromName(payload.room_id);
  const response = await env.ROOM_DO.get(doId).fetch(new Request(INTERNAL_EVENT_ROOM_INIT_URL, {
    method: "POST",
    headers: { "content-type": JSON_CONTENT_TYPE },
    body: JSON.stringify(payload),
  }));
  if (!response.ok) throw new Error("Failed to initialize event room state.");
}

export async function recreateRoomDurableObject(
  env: WorkerEnv,
  roomId: string,
  hostPlayerId: string,
): Promise<RecreateRoomResponse> {
  const doId = env.ROOM_DO.idFromName(roomId);
  const stub = env.ROOM_DO.get(doId);

  const payload: RecreateRoomRequest = {
    room_id: roomId,
    host_player_id: hostPlayerId,
  };

  const response = await stub.fetch(
    new Request(INTERNAL_ROOM_RECREATE_URL, {
      method: "POST",
      headers: {
        "content-type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(payload),
    }),
  );

  if (!response.ok) {
    let reason = "Failed to recreate room state.";
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.trim().length > 0) {
        reason = body.error;
      }
    } catch {
      // no-op
    }
    throw new Error(reason);
  }

  return (await response.json()) as RecreateRoomResponse;
}
