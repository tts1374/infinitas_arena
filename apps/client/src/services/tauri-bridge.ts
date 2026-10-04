import type { PlayStyle, SourceType } from "@infinitas/shared";
import type { SourcePaths } from "../stores/settings-store";

const SOURCE_WATCHER_EVENT_NAME = "source-watcher://event";

export type SourceWatcherStatus = "IDLE" | "RUNNING" | "STOPPED" | "ERROR" | "UNAVAILABLE";
export type SourceWatcherEventKind = "STARTED" | "STOPPED" | "FILE_CHANGED" | "ERROR";

export interface SourceWatcherStatePayload {
  status: SourceWatcherStatus;
  source: SourceType | null;
  watchedPaths: string[];
  detail: string;
  lastEventAtMs: number | null;
}

export interface ParsedSourceObservationPayload {
  timestamp: string;
  playStyle: PlayStyle | null;
  difficulty: string;
  title: string;
  titleSearchKey: string;
  chartId?: number | null;
  score: number;
  misscount: number;
  sourceMetaExtras?: Record<string, string | number | boolean | null>;
}

export type ParsedSourceUnresolvedCaseKind =
  | "unresolved_alias"
  | "resolved_partial"
  | "ambiguous_recent";

export interface ParsedSourceUnresolvedCasePayload {
  kind: ParsedSourceUnresolvedCaseKind;
  timestamp: string;
  playStyle: PlayStyle;
  difficulty: string;
  title: string;
  titleSearchKey: string | null;
  score: number | null;
  misscount: number | null;
  recentCandidateCount: number | null;
}

export interface ParsedSourceChangePayload {
  source: SourceType;
  filePath: string;
  fileSizeBytes: number;
  observations: ParsedSourceObservationPayload[];
  unresolvedCases?: ParsedSourceUnresolvedCasePayload[];
}

export interface SourceWatcherEventPayload {
  kind: SourceWatcherEventKind;
  state: SourceWatcherStatePayload;
  filePath: string | null;
  detail: string;
  occurredAtMs: number;
  parserOutput: ParsedSourceChangePayload | null;
}

interface StartSourceWatcherRequest {
  source: SourceType;
  sourcePaths: SourcePaths;
  apiBaseUrl?: string;
}

interface ValidateSourceDirectoryRequest {
  source: SourceType;
  directoryPath: string;
}

export interface ValidateSourceDirectoryResponse {
  missingPaths: string[];
}

export interface SaveLocalResultJsonRequest {
  roomId: string;
  createdAt: string | null;
  jsonText: string;
}

export interface SaveLocalResultJsonResponse {
  filePath: string;
}

export interface SaveEventResultJsonRequest {
  eventId: string;
  jsonText: string;
}

export interface ShowMatchHistoryWindowResponse {
  focusedExisting: boolean;
}

export interface NativeTtsSpeakRequest {
  text: string;
  voiceId?: string | null;
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  queueMode?: "flush" | "add";
}

export interface WriteE2eTextFileRequest {
  filePath: string;
  content: string;
  append?: boolean;
}

export interface WriteE2eBinaryFileRequest {
  filePath: string;
  bytes: number[];
}

export interface WriteE2eFileResponse {
  filePath: string;
  bytesWritten: number;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__ !== "undefined";
}

export async function getSourceWatcherState(): Promise<SourceWatcherStatePayload> {
  if (!isTauriRuntime()) {
    return createUnavailableState();
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SourceWatcherStatePayload>("get_source_watcher_state");
}

export async function startSourceWatcher(
  request: StartSourceWatcherRequest,
): Promise<SourceWatcherStatePayload> {
  if (!isTauriRuntime()) {
    return createUnavailableState();
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SourceWatcherStatePayload>("start_source_watcher", { request });
}

export async function stopSourceWatcher(): Promise<SourceWatcherStatePayload> {
  if (!isTauriRuntime()) {
    return createUnavailableState();
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SourceWatcherStatePayload>("stop_source_watcher");
}

export async function listenToSourceWatcherEvents(
  handler: (payload: SourceWatcherEventPayload) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<SourceWatcherEventPayload>(SOURCE_WATCHER_EVENT_NAME, (event) => {
    handler(event.payload);
  });
}

export async function saveLocalResultJson(
  request: SaveLocalResultJsonRequest,
): Promise<SaveLocalResultJsonResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Local result save is available only inside the Tauri desktop app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SaveLocalResultJsonResponse>("save_local_result_json", { request });
}

export async function saveEventResultJson(
  request: SaveEventResultJsonRequest,
): Promise<SaveLocalResultJsonResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Event result save is available only inside the Tauri desktop app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SaveLocalResultJsonResponse>("save_event_result_json", { request });
}

export async function showMatchHistoryWindow(): Promise<ShowMatchHistoryWindowResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Match history window is available only inside the Tauri desktop app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ShowMatchHistoryWindowResponse>("show_match_history_window");
}

export async function pickDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error("Directory picker is available only inside the Tauri desktop app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("pick_directory");
}

export async function validateSourceDirectory(
  request: ValidateSourceDirectoryRequest,
): Promise<ValidateSourceDirectoryResponse> {
  if (!isTauriRuntime()) {
    return { missingPaths: [] };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ValidateSourceDirectoryResponse>("validate_source_directory", { request });
}

export async function speakNativeTts(request: NativeTtsSpeakRequest): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("Native TTS is available only inside the Tauri desktop app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("plugin:tts|speak", {
    payload: {
      text: request.text,
      language: request.language ?? null,
      voiceId: request.voiceId ?? null,
      rate: request.rate ?? 1,
      pitch: request.pitch ?? 1,
      volume: request.volume ?? 1,
      queueMode: request.queueMode ?? "flush",
    },
  });
}

export async function stopNativeTts(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("plugin:tts|stop");
}

export async function writeE2eTextFile(
  request: WriteE2eTextFileRequest,
): Promise<WriteE2eFileResponse> {
  if (!isTauriRuntime()) {
    throw new Error("E2E file output is available only inside the Tauri desktop app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WriteE2eFileResponse>("write_e2e_text_file", { request });
}

export async function writeE2eBinaryFile(
  request: WriteE2eBinaryFileRequest,
): Promise<WriteE2eFileResponse> {
  if (!isTauriRuntime()) {
    throw new Error("E2E binary output is available only inside the Tauri desktop app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WriteE2eFileResponse>("write_e2e_binary_file", { request });
}

export async function getCurrentDeepLinkUrls(): Promise<string[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  const { getCurrent } = await import("@tauri-apps/plugin-deep-link");
  const urls = await getCurrent();
  return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : [];
}

export async function listenToDeepLinkUrls(
  handler: (urls: string[]) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
  return onOpenUrl((urls) => {
    handler(urls.filter((url): url is string => typeof url === "string"));
  });
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function createUnavailableState(): SourceWatcherStatePayload {
  return {
    status: "UNAVAILABLE",
    source: null,
    watchedPaths: [],
    detail: "Source watcher is available only inside the Tauri desktop app.",
    lastEventAtMs: null,
  };
}
