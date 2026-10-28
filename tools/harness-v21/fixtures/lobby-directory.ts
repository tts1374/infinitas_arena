/** Synthetic C2 fixture, not production code or a storage migration.
 * Contract: absent/legacy v1 rooms + scalar/map high-water counter, optional
 * schemaVersion=1. Corrupt/future storage is unavailable, never an empty room set.
 * Runtime restart/hibernation is outside this in-memory fixture's evidence.
 */
import { LEVEL_FILTERS, LOBBY_ROOM_STATUSES, MATCH_TTL_MS, MODES,
  PLAY_STYLES, READY_CHECK_TTL_MS, WIN_METRICS, type LobbyRoomSummary } from "@infinitas/shared";

export interface FixtureStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}
export interface FixtureState {
  storage: FixtureStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function summary(value: unknown): value is LobbyRoomSummary {
  if (!record(value)) return false;
  return typeof value.roomId === "string" && value.roomId.length > 0 && value.roomId.trim() === value.roomId
    && ["roomName", "ownerUserId", "ownerDisplayName"].every(key => typeof value[key] === "string")
    && MODES.includes(value.mode as never) && PLAY_STYLES.includes(value.playStyle as never)
    && LEVEL_FILTERS.includes(value.levelFilter as never) && WIN_METRICS.includes(value.winMetric as never)
    && LOBBY_ROOM_STATUSES.includes(value.status as never)
    && ["hasJoinCode", "isPublic", "isFull"].every(key => typeof value[key] === "boolean")
    && integer(value.currentPlayers) && [2, 3, 4].includes(value.maxPlayers as number)
    && value.currentPlayers <= (value.maxPlayers as number)
    && value.isFull === (value.currentPlayers >= (value.maxPlayers as number))
    && ["ttlStartedAt", "createdAt", "updatedAt"].every(key => integer(value[key]));
}
const response = (status: number, payload: unknown) => Response.json(payload, { status });
function expired(room: LobbyRoomSummary, now: number): boolean {
  return now - room.ttlStartedAt > (room.status === "LOBBY" ? READY_CHECK_TTL_MS : MATCH_TTL_MS);
}

export class SyntheticLobbyDirectoryDO {
  private rooms = new Map<string, LobbyRoomSummary>();
  private counter = 0;
  private readonly ready: Promise<boolean>;

  constructor(private readonly state: FixtureState) {
    // Handle failure inside the stored promise: no unhandled rejection or raw
    // exception text can be emitted before fetch observes unavailable storage.
    this.ready = state.blockConcurrencyWhile(async () => {
      const version = await state.storage.get("schemaVersion");
      const rooms = await state.storage.get("rooms");
      const counter = await state.storage.get("lastUpdatedAtByRoomId");
      if (version !== undefined && version !== 1) return false;
      if (rooms !== undefined && !record(rooms)) return false;
      const restored = new Map<string, LobbyRoomSummary>();
      for (const [id, value] of Object.entries(rooms ?? {})) {
        if (!summary(value) || id !== value.roomId) return false;
        restored.set(id, structuredClone(value));
      }
      let high = 0;
      if (counter !== undefined) {
        if (integer(counter)) high = counter;
        else if (record(counter)) {
          for (const value of Object.values(counter)) {
            if (!integer(value)) return false;
            high = Math.max(high, value);
          }
        } else return false;
      }
      for (const room of restored.values()) high = Math.max(high, room.updatedAt);
      this.rooms = restored;
      this.counter = high;
      return true;
    }).catch(() => false);
  }

  async fetch(request: Request): Promise<Response> {
    if (!await this.ready) return response(503, { error: "CORRUPT_STATE" });
    const path = new URL(request.url).pathname;
    const now = Date.now();
    if (!integer(now)) return response(503, { error: "INVALID_CLOCK" });
    if (path === "/internal/list" && request.method === "GET") {
      if (this.cleanup(now)) await this.persist();
      return response(200, { rooms: [...this.rooms.values()].filter(room => room.isPublic && !room.isFull && room.status === "LOBBY")
        .sort((a, b) => b.createdAt - a.createdAt || a.roomId.localeCompare(b.roomId)), serverTime: now });
    }
    if (request.method !== "POST" || !["/internal/upsert", "/internal/remove"].includes(path)) return response(404, {});
    let payload: unknown;
    try { payload = await request.json(); } catch { return response(400, { error: "INVALID_PAYLOAD" }); }
    if (path === "/internal/upsert") {
      if (!summary(payload)) return response(400, { error: "INVALID_PAYLOAD" });
      const next = Math.max(now, this.counter + 1);
      if (!integer(next) || next <= this.counter) return response(503, { error: "COUNTER_EXHAUSTED" });
      this.cleanup(now);
      const room = { ...payload, updatedAt: next };
      this.counter = next;
      if (expired(room, now) || !room.isPublic) this.rooms.delete(room.roomId);
      else this.rooms.set(room.roomId, room);
      await this.persist();
      return response(200, { ok: true });
    }
    if (!record(payload) || typeof payload.roomId !== "string" || !payload.roomId
      || (payload.expectedUpdatedAt !== undefined && !integer(payload.expectedUpdatedAt))) return response(400, { error: "INVALID_PAYLOAD" });
    const current = this.rooms.get(payload.roomId);
    if (current && payload.expectedUpdatedAt !== undefined && current.updatedAt !== payload.expectedUpdatedAt)
      return response(200, { ok: true, removed: false });
    const removed = this.rooms.delete(payload.roomId);
    this.cleanup(now);
    await this.persist();
    return response(200, { ok: true, removed });
  }

  private cleanup(now: number): boolean {
    let changed = false;
    for (const [id, room] of this.rooms) if (expired(room, now)) { this.rooms.delete(id); changed = true; }
    return changed;
  }
  private async persist(): Promise<void> {
    await Promise.all([
      this.state.storage.put("rooms", Object.fromEntries(this.rooms)),
      this.state.storage.put("lastUpdatedAtByRoomId", this.counter),
    ]);
  }
}
