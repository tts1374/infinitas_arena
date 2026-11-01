import {
  LEVEL_FILTERS,
  LOBBY_ROOM_STATUSES,
  MATCH_TTL_MS,
  MODES,
  PLAY_STYLES,
  READY_CHECK_TTL_MS,
  WIN_METRICS,
  type LobbyRoomSummary,
} from "@infinitas/shared";
import { isRecord } from "../utils/validation";

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

const ROOMS_STORAGE_KEY = "rooms";
const LAST_UPDATED_AT_STORAGE_KEY = "lastUpdatedAtByRoomId";

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function parseRoomStatus(value: unknown): LobbyRoomSummary["status"] | null {
  return LOBBY_ROOM_STATUSES.includes(value as LobbyRoomSummary["status"])
    ? (value as LobbyRoomSummary["status"])
    : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseLobbyRoomSummary(payload: unknown): LobbyRoomSummary | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
  const roomName = typeof payload.roomName === "string" ? payload.roomName : "";
  const ownerUserId = typeof payload.ownerUserId === "string" ? payload.ownerUserId : "";
  const ownerDisplayName = typeof payload.ownerDisplayName === "string" ? payload.ownerDisplayName : "";
  const mode = MODES.includes(payload.mode as (typeof MODES)[number]) ? (payload.mode as (typeof MODES)[number]) : "ARENA";
  const playStyle = PLAY_STYLES.includes(payload.playStyle as (typeof PLAY_STYLES)[number])
    ? (payload.playStyle as (typeof PLAY_STYLES)[number])
    : "SP";
  const levelFilter = LEVEL_FILTERS.includes(payload.levelFilter as (typeof LEVEL_FILTERS)[number])
    ? (payload.levelFilter as (typeof LEVEL_FILTERS)[number])
    : "ANY";
  const winMetric = WIN_METRICS.includes(payload.winMetric as (typeof WIN_METRICS)[number])
    ? (payload.winMetric as (typeof WIN_METRICS)[number])
    : "SCORE";
  const hasJoinCode = typeof payload.hasJoinCode === "boolean" ? payload.hasJoinCode : false;
  const isPublic = typeof payload.isPublic === "boolean" ? payload.isPublic : null;
  const currentPlayers = typeof payload.currentPlayers === "number" ? payload.currentPlayers : null;
  const maxPlayers = payload.maxPlayers === 2 || payload.maxPlayers === 3 || payload.maxPlayers === 4 ? payload.maxPlayers : null;
  const isFull = typeof payload.isFull === "boolean" ? payload.isFull : null;
  const status = parseRoomStatus(payload.status);
  const ttlStartedAt = isFiniteNumber(payload.ttlStartedAt) ? payload.ttlStartedAt : null;
  const createdAt = isFiniteNumber(payload.createdAt) ? payload.createdAt : null;
  const updatedAt = isFiniteNumber(payload.updatedAt) ? payload.updatedAt : null;

  if (
    roomId.length === 0 ||
    isPublic === null ||
    currentPlayers === null ||
    maxPlayers === null ||
    isFull === null ||
    status === null ||
    ttlStartedAt === null ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null;
  }

  return {
    roomId,
    roomName,
    ownerUserId,
    ownerDisplayName,
    mode,
    playStyle,
    levelFilter,
    winMetric,
    hasJoinCode,
    isPublic,
    currentPlayers,
    maxPlayers,
    isFull,
    status,
    ttlStartedAt,
    createdAt,
    updatedAt,
  };
}

function isExpired(room: LobbyRoomSummary, now: number): boolean {
  const age = now - room.ttlStartedAt;
  if (age <= 0) {
    return false;
  }

  if (room.status === "LOBBY") {
    return age > READY_CHECK_TTL_MS;
  }

  return age > MATCH_TTL_MS;
}

function isListVisible(room: LobbyRoomSummary, now: number): boolean {
  if (isExpired(room, now)) {
    return false;
  }

  if (!room.isPublic || room.isFull) {
    return false;
  }

  return room.status === "LOBBY";
}

function isStoredRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function buildStoredRooms(input: unknown): Map<string, LobbyRoomSummary> {
  if (input === undefined) {
    return new Map<string, LobbyRoomSummary>();
  }
  if (!isStoredRecord(input)) {
    throw new Error("Invalid stored lobby rooms.");
  }

  const entries = Object.entries(input);
  const rooms = new Map<string, LobbyRoomSummary>();
  for (const [roomId, rawRoom] of entries) {
    const parsed = parseLobbyRoomSummary(rawRoom);
    if (
      parsed === null ||
      parsed.roomId !== roomId ||
      !Number.isSafeInteger(parsed.updatedAt) ||
      !Number.isSafeInteger(parsed.currentPlayers) ||
      parsed.currentPlayers < 0
    ) {
      throw new Error("Invalid stored lobby room summary.");
    }

    rooms.set(roomId, parsed);
  }

  return rooms;
}

function restoreLastIssuedUpdatedAt(
  input: unknown,
  rooms: Map<string, LobbyRoomSummary>,
): number {
  let lastIssuedUpdatedAt = Number.NEGATIVE_INFINITY;

  // An empty directory could previously persist this initial sentinel on remove.
  if (input === undefined || input === Number.NEGATIVE_INFINITY) {
    // Valid empty/legacy storage: derive the floor from the surviving summaries.
  } else if (isFiniteNumber(input) && Number.isSafeInteger(input)) {
    lastIssuedUpdatedAt = input;
  } else if (isStoredRecord(input)) {
    for (const value of Object.values(input)) {
      if (!isFiniteNumber(value) || !Number.isSafeInteger(value)) {
        throw new Error("Invalid stored lobby update counter.");
      }

      lastIssuedUpdatedAt = Math.max(lastIssuedUpdatedAt, value);
    }
  } else {
    throw new Error("Invalid stored lobby update counter.");
  }

  for (const room of rooms.values()) {
    lastIssuedUpdatedAt = Math.max(lastIssuedUpdatedAt, room.updatedAt);
  }

  return lastIssuedUpdatedAt;
}

function asSerializableRecord(rooms: Map<string, LobbyRoomSummary>): Record<string, LobbyRoomSummary> {
  const result: Record<string, LobbyRoomSummary> = {};
  for (const [roomId, room] of rooms.entries()) {
    result[roomId] = room;
  }

  return result;
}

function parseRemovePayload(payload: unknown): { roomId: string; expectedUpdatedAt?: number } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
  if (roomId.length === 0) {
    return null;
  }

  const expectedUpdatedAt = payload.expectedUpdatedAt;
  if (expectedUpdatedAt !== undefined && !isFiniteNumber(expectedUpdatedAt)) {
    return null;
  }

  return expectedUpdatedAt === undefined ? { roomId } : { roomId, expectedUpdatedAt };
}

export class LobbyDirectoryDO {
  private readonly rooms = new Map<string, LobbyRoomSummary>();
  private lastIssuedUpdatedAt = Number.NEGATIVE_INFINITY;
  private readonly readyPromise: Promise<void>;

  constructor(private readonly state: DurableObjectStateLike) {
    this.readyPromise = this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Record<string, LobbyRoomSummary>>(ROOMS_STORAGE_KEY);
      const storedLastUpdatedAt = await this.state.storage.get<unknown>(LAST_UPDATED_AT_STORAGE_KEY);

      const restored = buildStoredRooms(stored);
      this.rooms.clear();
      for (const [roomId, room] of restored.entries()) {
        this.rooms.set(roomId, room);
      }
      this.lastIssuedUpdatedAt = restoreLastIssuedUpdatedAt(storedLastUpdatedAt, restored);
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.readyPromise;

    const url = new URL(request.url);
    if (url.pathname === "/internal/list" && request.method === "GET") {
      return this.handleList();
    }
    if (url.pathname === "/internal/upsert" && request.method === "POST") {
      return this.handleUpsert(request);
    }
    if (url.pathname === "/internal/remove" && request.method === "POST") {
      return this.handleRemove(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleList(): Promise<Response> {
    const now = Date.now();
    const cleaned = this.cleanupExpired(now);
    if (cleaned) {
      await this.persistRooms();
    }

    const rooms = Array.from(this.rooms.values())
      .filter((room) => isListVisible(room, now))
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return right.createdAt - left.createdAt;
        }
        return left.roomId.localeCompare(right.roomId);
      });

    const response = {
      rooms,
      serverTime: now,
    };

    return jsonResponse(200, response);
  }

  private async handleUpsert(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }

    const parsed = parseLobbyRoomSummary(payload);
    if (parsed === null) {
      return jsonResponse(400, { error: "Invalid lobby room summary payload." });
    }

    const now = Date.now();
    const nextUpdatedAt = Math.max(now, this.lastIssuedUpdatedAt + 1);
    if (!Number.isSafeInteger(nextUpdatedAt) || nextUpdatedAt <= this.lastIssuedUpdatedAt) {
      throw new Error("Lobby update counter exhausted.");
    }
    this.cleanupExpired(now);
    this.lastIssuedUpdatedAt = nextUpdatedAt;

    const normalized: LobbyRoomSummary = {
      ...parsed,
      currentPlayers: Math.max(0, Math.floor(parsed.currentPlayers)),
      isFull: Math.max(0, Math.floor(parsed.currentPlayers)) >= parsed.maxPlayers,
      updatedAt: nextUpdatedAt,
    };

    if (isExpired(normalized, now) || !normalized.isPublic) {
      this.rooms.delete(normalized.roomId);
    } else {
      this.rooms.set(normalized.roomId, normalized);
    }

    await this.persistRooms();
    return jsonResponse(200, { ok: true });
  }

  private async handleRemove(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload." });
    }

    const parsed = parseRemovePayload(payload);
    if (parsed === null) {
      return jsonResponse(400, { error: "Invalid roomId payload." });
    }

    const now = Date.now();
    this.cleanupExpired(now);
    const current = this.rooms.get(parsed.roomId);
    if (current === undefined) {
      await this.persistRooms();
      return jsonResponse(200, { ok: true, removed: false });
    }

    if (
      parsed.expectedUpdatedAt !== undefined &&
      current.updatedAt !== parsed.expectedUpdatedAt
    ) {
      return jsonResponse(200, { ok: true, removed: false });
    }

    this.rooms.delete(parsed.roomId);
    await this.persistRooms();
    return jsonResponse(200, { ok: true, removed: true });
  }

  private cleanupExpired(now: number): boolean {
    let changed = false;

    for (const [roomId, room] of this.rooms.entries()) {
      if (!isExpired(room, now)) {
        continue;
      }

      this.rooms.delete(roomId);
      changed = true;
    }

    return changed;
  }

  private async persistRooms(): Promise<void> {
    await Promise.all([
      this.state.storage.put(ROOMS_STORAGE_KEY, asSerializableRecord(this.rooms)),
      this.state.storage.put(LAST_UPDATED_AT_STORAGE_KEY, this.lastIssuedUpdatedAt),
    ]);
  }
}
