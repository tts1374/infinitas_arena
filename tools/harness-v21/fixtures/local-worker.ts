/** Local-only probe adapter. Never deploy: admin endpoints seed synthetic data. */
import { SyntheticLobbyDirectoryDO, type FixtureState } from "./lobby-directory";

interface LocalState extends FixtureState {
  storage: FixtureState["storage"] & { list(): Promise<Map<string, unknown>> };
}
interface LocalEnv {
  OWNER_NONCE: string;
  FIXTURE: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
}
function room() {
  const now = Date.now();
  return { roomId: "r", roomName: "Synthetic", ownerUserId: "fixture", ownerDisplayName: "Fixture",
    mode: "ARENA", playStyle: "SP", levelFilter: "ANY", winMetric: "SCORE", hasJoinCode: false,
    isPublic: true, currentPlayers: 1, maxPlayers: 2, isFull: false, status: "LOBBY",
    ttlStartedAt: now, createdAt: now, updatedAt: now };
}
export class LocalFixtureDO {
  private fixture: SyntheticLobbyDirectoryDO | undefined;
  private writes = 0;
  constructor(private readonly state: LocalState) {}
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/admin/seed/") && request.method === "POST") {
      if ((await this.state.storage.list()).size) return Response.json({ error: "ALREADY_SEEDED" }, { status: 409 });
      const kind = path.slice("/admin/seed/".length), value = room();
      if (!["scalar", "map", "corrupt"].includes(kind)) return Response.json({}, { status: 400 });
      const high = value.updatedAt + 5000;
      if (kind === "corrupt") value.mode = "invalid";
      await this.state.storage.put("rooms", { r: value });
      await this.state.storage.put("lastUpdatedAtByRoomId", kind === "map" ? { deleted: high } : high);
      return Response.json({ seeded: true });
    }
    if (path === "/admin/inspect") {
      const storage = Object.fromEntries(await this.state.storage.list());
      const bytes = new TextEncoder().encode(JSON.stringify(storage));
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
      return Response.json({ hash, writes: this.writes, counter: storage.lastUpdatedAtByRoomId });
    }
    this.fixture ??= new SyntheticLobbyDirectoryDO({
      blockConcurrencyWhile: callback => this.state.blockConcurrencyWhile(callback),
      storage: {
        get: key => this.state.storage.get(key),
        put: async (key, value) => { this.writes++; await this.state.storage.put(key, value); },
      },
    });
    return this.fixture.fetch(request);
  }
}
export default {
  async fetch(request: Request, env: LocalEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname !== "127.0.0.1" || !env.OWNER_NONCE) return Response.json({}, { status: 403 });
    if (url.pathname === "/health") return Response.json({ owner: env.OWNER_NONCE });
    const [kind, ...parts] = url.pathname.slice(1).split("/");
    if (!kind || !["scalar", "map", "corrupt"].includes(kind)) return Response.json({}, { status: 404 });
    url.pathname = "/" + parts.join("/");
    return env.FIXTURE.get(env.FIXTURE.idFromName(kind)).fetch(new Request(url, request));
  },
};
