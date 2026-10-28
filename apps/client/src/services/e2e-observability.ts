import { runtimeConfig } from "../runtime/runtime-config";
import {
  isTauriRuntime,
  writeE2eBinaryFile,
  writeE2eTextFile,
} from "./tauri-bridge";
import { renderElementAsPngBlob } from "../dev/visual-capture";

interface E2EFilePaths {
  eventJsonlPath: string;
  stateDumpPath: string;
}

let writeQueue: Promise<void> = Promise.resolve();
let initialized = false;
const devControlObservers = new Set<(event: string, detail: Record<string, unknown>) => void>();
export function observeSourceForDevControl(observer: (event: string, detail: Record<string, unknown>) => void): () => void {
  devControlObservers.add(observer);
  return () => { devControlObservers.delete(observer); };
}

function isE2EEnabled(): boolean {
  return runtimeConfig.e2e.enabled && isTauriRuntime();
}

function inferPathSeparator(basePath: string): "/" | "\\" {
  return basePath.includes("\\") ? "\\" : "/";
}

function joinPath(basePath: string, fileName: string): string {
  const separator = inferPathSeparator(basePath);
  const normalizedBasePath = basePath.replace(/[\\/]+$/, "");
  return `${normalizedBasePath}${separator}${fileName}`;
}

function resolveFilePaths(): E2EFilePaths | null {
  if (!isE2EEnabled()) {
    return null;
  }

  const profile = runtimeConfig.e2e.profile ?? runtimeConfig.instanceId ?? "default";
  const runtimeDir = runtimeConfig.e2e.runtimeDir;
  const logDir = runtimeConfig.e2e.logDir ?? runtimeDir;
  if (!runtimeDir || !logDir) {
    return null;
  }

  return {
    eventJsonlPath: joinPath(logDir, `${profile}.events.jsonl`),
    stateDumpPath: joinPath(runtimeDir, `${profile}.state.json`),
  };
}

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue
    .then(task)
    .catch((error) => {
      console.error("[e2e-observability] write failed", error);
    });
  return writeQueue;
}

function buildEventRecord(
  event: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    event,
    profile: runtimeConfig.e2e.profile ?? runtimeConfig.instanceId ?? "default",
    datasource: runtimeConfig.settingsDefaults.source ?? null,
    ...payload,
  };
}

export async function initializeE2EObservability(): Promise<void> {
  if (initialized || !isE2EEnabled()) {
    return;
  }

  initialized = true;
  await logE2EEvent("app_started", {
    role: runtimeConfig.e2e.role,
    scenario: runtimeConfig.e2e.scenario,
    roomId: runtimeConfig.e2e.roomId,
    watchDir: runtimeConfig.e2e.watchDir,
    runtimeDir: runtimeConfig.e2e.runtimeDir,
    logDir: runtimeConfig.e2e.logDir,
  });
}

export async function logE2EEvent(
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (import.meta.env?.MODE === "dev-control" && ["file_parsed", "normalize_succeeded", "normalize_failed", "watcher_started", "reconnect_started"].includes(event)) {
    // Counts and source identity only. Never forward original source paths/settings or whole-day payloads.
    const detail = Object.fromEntries(["source", "observationCount", "unresolvedCount", "hasPendingUnresolvedAlias"].filter(key => key in payload).map(key => [key, payload[key]]));
    for (const observer of devControlObservers) observer(event, detail);
  }
  const filePaths = resolveFilePaths();
  if (!filePaths) {
    return;
  }

  const line = `${JSON.stringify(buildEventRecord(event, payload))}\n`;
  await enqueueWrite(async () => {
    await writeE2eTextFile({
      filePath: filePaths.eventJsonlPath,
      content: line,
      append: true,
    });
  });
}

export async function writeE2EStateDump(
  state: unknown,
  reason: string,
): Promise<void> {
  const filePaths = resolveFilePaths();
  if (!filePaths) {
    return;
  }

  const content = `${JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      reason,
      profile: runtimeConfig.e2e.profile ?? runtimeConfig.instanceId ?? "default",
      state,
    },
    null,
    2,
  )}\n`;
  await enqueueWrite(async () => {
    await writeE2eTextFile({
      filePath: filePaths.stateDumpPath,
      content,
      append: false,
    });
  });
}

function sanitizeFileLabel(rawLabel: string): string {
  const normalized = rawLabel
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized : "capture";
}

export async function captureE2EScreenshot(
  label: string,
  targetElement: HTMLElement | null,
): Promise<void> {
  const filePaths = resolveFilePaths();
  if (!filePaths || targetElement === null) {
    return;
  }

  const runtimeDir = runtimeConfig.e2e.runtimeDir;
  if (!runtimeDir) {
    return;
  }

  const filePath = joinPath(
    runtimeDir,
    `${runtimeConfig.e2e.profile ?? runtimeConfig.instanceId ?? "default"}.${sanitizeFileLabel(label)}.png`,
  );

  try {
    const blob = await renderElementAsPngBlob(targetElement);
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    await enqueueWrite(async () => {
      await writeE2eBinaryFile({
        filePath,
        bytes,
      });
    });
  } catch (error) {
    console.error("[e2e-observability] screenshot capture failed", error);
  }
}

export async function flushE2EWrites(): Promise<void> {
  await writeQueue;
}
