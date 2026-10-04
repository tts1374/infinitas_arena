export interface DurableObjectIdLike {
  toString(): string;
}

export interface KVNamespacePutOptions {
  expirationTtl?: number;
}

export interface WorkerKVNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
}

export interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

export interface RoomDurableObjectNamespace {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

export interface LobbyDirectoryDurableObjectNamespace {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

export interface MatchmakingDurableObjectNamespace {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

export interface WorkerEnv {
  ROOM_DO: RoomDurableObjectNamespace;
  LOBBY_DIRECTORY_DO: LobbyDirectoryDurableObjectNamespace;
  MATCHMAKING_DO: MatchmakingDurableObjectNamespace;
  FEEDBACK_KV: WorkerKVNamespace;
  APP_DOWNLOAD_URL?: string;
  REPO_OWNER_GITHUB: string;
  REPO_NAME_GITHUB: string;
  APP_ENV: string;
  MIN_SUPPORTED_CLIENT_VERSION: string;
  /** Rollout gate. Missing and every value other than "true" disable new event rooms/participants. */
  HOST_EVENT_ACCEPT_NEW?: string;
  ISSUE_TOKEN: string;
  DISCORD_WEBHOOK_URL: string;
}
