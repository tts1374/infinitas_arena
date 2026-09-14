import { SOURCE_TYPES, type SourceType } from "@infinitas/shared";

export interface RuntimeSourcePathDefaults {
  dakenTodayUpdateXml: string | undefined;
  notebookExportRecentJson: string | undefined;
  notebookRecordsRecentJson: string | undefined;
  refluxLatestJson: string | undefined;
  refluxTrackerTsv: string | undefined;
}

export interface RuntimeSettingsDefaults {
  apiBaseUrl: string | undefined;
  playerId: string | undefined;
  displayName: string | undefined;
  source: SourceType | undefined;
  dakenCounterV3Port: number | undefined;
  sourcePaths: RuntimeSourcePathDefaults;
}

export interface RuntimeUpdaterConfig {
  target: string | undefined;
  checkTimeoutMs: number;
}

export interface RuntimeConfig {
  debugUiEnabled: boolean;
  instanceId: string | null;
  instanceLabel: string;
  mockScenarioId: string | null;
  autoCapture: boolean;
  captureDelayMs: number;
  updater: RuntimeUpdaterConfig;
  settingsDefaults: RuntimeSettingsDefaults;
  e2e: RuntimeE2EConfig;
}

export interface RuntimeE2EConfig {
  enabled: boolean;
  profile: string | null;
  role: "host" | "guest" | null;
  scenario: string | null;
  matchCount: number;
  roomId: string | null;
  joinCode: string | null;
  watchDir: string | null;
  runtimeDir: string | null;
  logDir: string | null;
  roomKind: "NORMAL" | "HOST_EVENT";
  eventRoundCount: number;
  eventDisconnectHost: boolean;
}

function readSearchParam(name: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const value = new URLSearchParams(window.location.search).get(name)?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readRuntimeParam(names: string[]): string | undefined {
  for (const name of names) {
    const value = readSearchParam(name);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function readFlagParam(name: string): boolean {
  const value = readSearchParam(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function isTruthyValue(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readOptionalFlagParam(name: string): boolean | undefined {
  const value = readSearchParam(name);
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readNumberParam(name: string, fallback: number): number {
  const value = Number(readSearchParam(name));
  return Number.isFinite(value) ? value : fallback;
}

function normalizeInstanceId(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.length > 0 && normalized !== "default" ? normalized : null;
}

function parseSourceType(value: string | undefined): SourceType | undefined {
  return SOURCE_TYPES.includes(value as SourceType) ? (value as SourceType) : undefined;
}

function normalizeDirectoryPath(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.replace(/[\\/]+$/, "");
}

function joinPath(directory: string, ...segments: string[]): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  return [directory, ...segments].join(separator);
}

function resolveE2ESourcePaths(source: SourceType | undefined, watchDir: string | null): RuntimeSourcePathDefaults {
  if (watchDir === null || source === undefined) {
    return {
      dakenTodayUpdateXml: undefined,
      notebookExportRecentJson: undefined,
      notebookRecordsRecentJson: undefined,
      refluxLatestJson: undefined,
      refluxTrackerTsv: undefined,
    };
  }

  if (source === "inf_daken_counter") {
    return {
      dakenTodayUpdateXml: joinPath(watchDir, "today_update.xml"),
      notebookExportRecentJson: undefined,
      notebookRecordsRecentJson: undefined,
      refluxLatestJson: undefined,
      refluxTrackerTsv: undefined,
    };
  }

  if (source === "inf-notebook") {
    return {
      dakenTodayUpdateXml: undefined,
      notebookExportRecentJson: joinPath(watchDir, "export", "recent.json"),
      notebookRecordsRecentJson: joinPath(watchDir, "records", "summary.json"),
      refluxLatestJson: undefined,
      refluxTrackerTsv: undefined,
    };
  }

  if (source === "reflux") {
    return {
      dakenTodayUpdateXml: undefined,
      notebookExportRecentJson: undefined,
      notebookRecordsRecentJson: undefined,
      refluxLatestJson: joinPath(watchDir, "latest.json"),
      refluxTrackerTsv: joinPath(watchDir, "tracker.tsv"),
    };
  }

  return {
    dakenTodayUpdateXml: undefined,
    notebookExportRecentJson: undefined,
    notebookRecordsRecentJson: undefined,
    refluxLatestJson: undefined,
    refluxTrackerTsv: undefined,
  };
}

function normalizeE2ERole(value: string | undefined): "host" | "guest" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "host") {
    return "host";
  }
  if (normalized === "guest") {
    return "guest";
  }
  return null;
}

const profile = normalizeInstanceId(
  readRuntimeParam(["INF_ARENA_PROFILE", "profile"]),
);
const instanceId =
  normalizeInstanceId(readSearchParam("instance")) ??
  profile;
const displayName = readSearchParam("name");
const playerId = readSearchParam("playerId");
const viteEnv = import.meta.env ?? {};
const apiBaseUrlFromEnv = viteEnv.VITE_WORKER_API_BASE_URL?.trim();
const apiBaseUrl =
  apiBaseUrlFromEnv && apiBaseUrlFromEnv.length > 0 ? apiBaseUrlFromEnv : readSearchParam("api");
const e2eEnabled = isTruthyValue(readRuntimeParam(["INF_ARENA_E2E", "e2e"]));
const e2eDatasource = parseSourceType(
  readRuntimeParam(["INF_ARENA_DATASOURCE", "datasource", "source"]),
);
const source = e2eDatasource ?? parseSourceType(readSearchParam("source"));
const dakenCounterV3PortRaw = readRuntimeParam([
  "INF_ARENA_DAKEN_COUNTER_V3_PORT",
  "dakenCounterV3Port",
  "dakenPort",
]);
const dakenCounterV3PortFromRuntime =
  dakenCounterV3PortRaw === undefined ? undefined : Math.trunc(Number(dakenCounterV3PortRaw));
const dakenCounterV3Port =
  (Number.isFinite(dakenCounterV3PortFromRuntime) ? dakenCounterV3PortFromRuntime : undefined);
const e2eWatchDir = normalizeDirectoryPath(
  readRuntimeParam(["INF_ARENA_WATCH_DIR", "watchDir"]),
);
const e2eRuntimeDir = normalizeDirectoryPath(
  readRuntimeParam(["INF_ARENA_RUNTIME_DIR", "runtimeDir"]),
);
const e2eLogDir = normalizeDirectoryPath(
  readRuntimeParam(["INF_ARENA_LOG_DIR", "logDir"]),
);
const e2eMatchCountRaw = readRuntimeParam(["INF_ARENA_E2E_MATCH_COUNT", "e2eMatchCount"]);
const e2eMatchCountFromRuntime =
  e2eMatchCountRaw === undefined ? 1 : Math.trunc(Number(e2eMatchCountRaw));
const e2eMatchCount =
  Number.isFinite(e2eMatchCountFromRuntime) && e2eMatchCountFromRuntime >= 1
    ? e2eMatchCountFromRuntime
    : 1;
const e2eRoomKind = readRuntimeParam(["INF_ARENA_E2E_ROOM_KIND", "e2eRoomKind"])?.toUpperCase() === "HOST_EVENT"
  ? "HOST_EVENT" as const
  : "NORMAL" as const;
const e2eEventRoundCount = Math.max(1, Math.trunc(readNumberParam("e2eEventRoundCount", 2)));
const baseSourcePaths: RuntimeSourcePathDefaults = {
  dakenTodayUpdateXml: readSearchParam("dakenPath"),
  notebookExportRecentJson: readSearchParam("notebookPath"),
  notebookRecordsRecentJson: readSearchParam("recordsPath"),
  refluxLatestJson: readSearchParam("refluxLatestPath"),
  refluxTrackerTsv: readSearchParam("refluxTrackerPath"),
};
const e2eSourcePaths = resolveE2ESourcePaths(source, e2eEnabled ? e2eWatchDir : null);
const updaterTarget =
  readSearchParam("updateTarget") ?? viteEnv.VITE_UPDATER_TARGET?.trim() ?? "windows-x86_64";
const updaterTimeoutEnvRaw = viteEnv.VITE_UPDATER_CHECK_TIMEOUT_MS?.trim();
const updaterTimeoutEnv =
  updaterTimeoutEnvRaw && updaterTimeoutEnvRaw.length > 0
    ? Number(updaterTimeoutEnvRaw)
    : Number.NaN;
const debugUiEnabled = readOptionalFlagParam("debugUi") ?? viteEnv.DEV;

export const runtimeConfig: RuntimeConfig = {
  debugUiEnabled,
  instanceId,
  instanceLabel: readSearchParam("label") ?? displayName ?? profile ?? instanceId ?? "default",
  mockScenarioId: readSearchParam("scenario") ?? null,
  autoCapture: readFlagParam("capture"),
  captureDelayMs: readNumberParam("captureDelayMs", 500),
  updater: {
    target: updaterTarget.trim().length > 0 ? updaterTarget.trim() : undefined,
    checkTimeoutMs: Number.isFinite(updaterTimeoutEnv)
      ? updaterTimeoutEnv
      : readNumberParam("updateTimeoutMs", 10000),
  },
  settingsDefaults: {
    apiBaseUrl,
    playerId,
    displayName,
    source,
    dakenCounterV3Port,
    sourcePaths: {
      dakenTodayUpdateXml: e2eSourcePaths.dakenTodayUpdateXml ?? baseSourcePaths.dakenTodayUpdateXml,
      notebookExportRecentJson: e2eSourcePaths.notebookExportRecentJson ?? baseSourcePaths.notebookExportRecentJson,
      notebookRecordsRecentJson:
        e2eSourcePaths.notebookRecordsRecentJson ?? baseSourcePaths.notebookRecordsRecentJson,
      refluxLatestJson: e2eSourcePaths.refluxLatestJson ?? baseSourcePaths.refluxLatestJson,
      refluxTrackerTsv: e2eSourcePaths.refluxTrackerTsv ?? baseSourcePaths.refluxTrackerTsv,
    },
  },
  e2e: {
    enabled: e2eEnabled,
    profile,
    role: normalizeE2ERole(readRuntimeParam(["INF_ARENA_ROLE", "role"])),
    scenario: readRuntimeParam(["INF_ARENA_E2E_SCENARIO", "e2eScenario"]) ?? null,
    matchCount: e2eMatchCount,
    roomId: readRuntimeParam(["INF_ARENA_ROOM_ID", "roomId"]) ?? null,
    joinCode: readRuntimeParam(["INF_ARENA_JOIN_CODE", "joinCode"]) ?? null,
    watchDir: e2eWatchDir,
    runtimeDir: e2eRuntimeDir,
    logDir: e2eLogDir,
    roomKind: e2eRoomKind,
    eventRoundCount: e2eEventRoundCount,
    eventDisconnectHost: readFlagParam("e2eEventDisconnectHost"),
  },
};

export function buildScopedStorageKey(key: string): string {
  return runtimeConfig.instanceId === null ? key : `${key}:instance:${runtimeConfig.instanceId}`;
}
