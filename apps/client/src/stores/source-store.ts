import type { ChartDifficulty, EventRoomSnapshot, RoomStateSnapshot, SourceType } from "@infinitas/shared";
import {
  getSourceWatcherState,
  isTauriRuntime,
  listenToSourceWatcherEvents,
  type ParsedSourceChangePayload,
  type ParsedSourceObservationPayload,
  type ParsedSourceUnresolvedCasePayload,
  startSourceWatcher,
  stopSourceWatcher,
  type SourceWatcherEventKind,
  type SourceWatcherEventPayload,
  type SourceWatcherStatePayload,
  type SourceWatcherStatus,
} from "../services/tauri-bridge";
import { logE2EEvent } from "../services/e2e-observability";
import {
  submitNotebookForcedRegistration,
  submitParsedSourceChange,
  type NotebookDialogChartInfo,
  type NotebookForcedRegistrationPayload,
} from "../services/source-submission";
import { resolveChartAlias } from "../services/worker-api-client";
import { runtimeConfig } from "../runtime/runtime-config";
import { roomStore } from "./room-store";
import { eventRoomStore } from "./event-room-store";
import { createExternalStore, useExternalStore } from "./create-store";
import { isValidPortNumber, type ClientSettings, type SourcePaths } from "./settings-store";

export interface SourceWatcherState {
  status: SourceWatcherStatus;
  source: SourceType | null;
  watchedPaths: string[];
  detail: string;
  lastEventAt: string | null;
}

export interface SourceWatcherEventLogEntry {
  kind: SourceWatcherEventKind;
  filePath: string | null;
  detail: string;
  occurredAt: string;
  parserOutput: ParsedSourceChangePayload | null;
}

export interface SourceStoreState {
  watcherState: SourceWatcherState;
  lastEvent: SourceWatcherEventLogEntry | null;
  activeUnresolvedDialog: SourceUnresolvedDialog | null;
  unresolvedDialogQueue: SourceUnresolvedDialog[];
  runtimeReady: boolean;
}

type DialogAction = "accept" | "skip" | "close";

interface SourceDialogChartInfo {
  title: string;
  titleSearchKey: string | null;
  playStyle: "SP" | "DP";
  difficulty: string;
  metricLabel: "EXSCORE" | "MISSCOUNT";
  metricValue: number | null;
}

interface SourceUnresolvedDialogBase {
  id: string;
  source: SourceType;
  originLabel: string;
}

export interface SourceUnresolvedAliasDialog extends SourceUnresolvedDialogBase {
  kind: "unresolved_alias";
  expectedTarget: SourceDialogChartInfo;
  parsedResult: SourceDialogChartInfo;
  mismatchReason: string;
  forcePayload: NotebookForcedRegistrationPayload;
}

export interface SourceResolvedPartialDialog extends SourceUnresolvedDialogBase {
  kind: "resolved_partial";
  chart: SourceDialogChartInfo;
}

export interface SourceCatalogUnresolvedAliasDialog extends SourceUnresolvedDialogBase {
  kind: "unresolved_alias_catalog";
  chart: SourceDialogChartInfo;
  errorCode: "NB-UNRESOLVED-ALIAS";
}

export interface SourceAmbiguousRecentDialog extends SourceUnresolvedDialogBase {
  kind: "ambiguous_recent";
  chart: SourceDialogChartInfo;
  candidateCount: number;
  errorCode: "NB-AMBIGUOUS-RECENT";
}

export type SourceUnresolvedDialog =
  | SourceUnresolvedAliasDialog
  | SourceResolvedPartialDialog
  | SourceCatalogUnresolvedAliasDialog
  | SourceAmbiguousRecentDialog;

interface StartOptions {
  force?: boolean;
}

let attachedListener: (() => void) | null = null;
let attachPromise: Promise<void> | null = null;
let appliedConfigKey: string | null = null;
let unresolvedDialogSequence = 0;
let latestSettings: Pick<ClientSettings, "apiBaseUrl" | "source" | "sourcePaths" | "dakenCounterV3Port"> | null =
  null;
let dakenCounterV3Socket: WebSocket | null = null;
let dakenCounterV3SocketPort: number | null = null;
let dakenCounterV3ReconnectTimer: number | null = null;
let dakenCounterV3MonitoringEnabled = false;
let dakenCounterV3LastRoomState: string | null = null;
let latestEventRoomSnapshot: EventRoomSnapshot | null = null;
let dakenCounterV3HasSnapshotBaseline = false;
let dakenCounterV3SnapshotFingerprintCounts = new Map<string, number>();
let dakenCounterV3SocketMessageQueue: Promise<void> = Promise.resolve();
const dakenCounterV3ProcessedFingerprints = new Set<string>();
const dakenCounterV3ProcessedFingerprintQueue: string[] = [];
const dakenCounterV3AliasResolveCache = new Map<string, string[]>();

const DAKEN_COUNTER_V3_SOURCE: SourceType = "daken_counter_v3";
const DAKEN_COUNTER_V3_ORIGIN_LABEL = "打鍵カウンタv3";
const DAKEN_COUNTER_V3_DEFAULT_PORT = 8767;
const DAKEN_COUNTER_V3_WARNING_MESSAGE =
  "打鍵カウンタv3 に接続できませんでした。ポート設定と起動状態を確認してください。";
const DAKEN_COUNTER_V3_HISTORY_LIMIT = 512;
const DAKEN_COUNTER_V3_RECONNECT_DELAY_MS = 2000;
const DAKEN_COUNTER_V3_E2E_SUBPROTOCOL = "infinitas-arena-daken-v3";

function formatSourceOriginLabel(source: SourceType): string {
  if (source === "reflux") {
    return "Reflux";
  }
  return source;
}

const initialState: SourceStoreState = {
  watcherState: {
    status: "IDLE",
    source: null,
    watchedPaths: [],
    detail: "Watcher not attached.",
    lastEventAt: null,
  },
  lastEvent: null,
  activeUnresolvedDialog: null,
  unresolvedDialogQueue: [],
  runtimeReady: false,
};

const internalStore = createExternalStore<SourceStoreState>(initialState);

function createConfigKey(
  settings: Pick<ClientSettings, "apiBaseUrl" | "source" | "sourcePaths" | "dakenCounterV3Port">,
): string {
  return JSON.stringify({
    apiBaseUrl: settings.apiBaseUrl,
    source: settings.source,
    sourcePaths: settings.sourcePaths,
    dakenCounterV3Port: settings.dakenCounterV3Port,
  });
}

function toIsoString(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapWatcherState(payload: SourceWatcherStatePayload): SourceWatcherState {
  return {
    status: payload.status,
    source: payload.source,
    watchedPaths: payload.watchedPaths,
    detail: payload.detail,
    lastEventAt: toIsoString(payload.lastEventAtMs),
  };
}

function mapWatcherEvent(payload: SourceWatcherEventPayload): SourceWatcherEventLogEntry {
  return {
    kind: payload.kind,
    filePath: payload.filePath,
    detail: payload.detail,
    occurredAt: new Date(payload.occurredAtMs).toISOString(),
    parserOutput: payload.parserOutput,
  };
}

interface DakenCounterV3ObservationEntry {
  fingerprint: string;
  observation: ParsedSourceObservationPayload;
}

const DAKEN_COUNTER_V3_DIFFICULTY_MAP: Record<
  string,
  { playStyle: "SP" | "DP"; difficulty: ParsedSourceObservationPayload["difficulty"] }
> = {
  SPB: { playStyle: "SP", difficulty: "BEGINNER" },
  SPN: { playStyle: "SP", difficulty: "NORMAL" },
  SPH: { playStyle: "SP", difficulty: "HYPER" },
  SPA: { playStyle: "SP", difficulty: "ANOTHER" },
  SPL: { playStyle: "SP", difficulty: "LEGGENDARIA" },
  DPB: { playStyle: "DP", difficulty: "BEGINNER" },
  DPN: { playStyle: "DP", difficulty: "NORMAL" },
  DPH: { playStyle: "DP", difficulty: "HYPER" },
  DPA: { playStyle: "DP", difficulty: "ANOTHER" },
  DPL: { playStyle: "DP", difficulty: "LEGGENDARIA" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTitle(value: unknown): string | null {
  const rawTitle = normalizeText(value);
  if (rawTitle.length === 0) {
    return null;
  }

  return rawTitle;
}

const DAKEN_COUNTER_V3_ALIAS_DIFFICULTIES: ChartDifficulty[] = [
  "BEGINNER",
  "NORMAL",
  "HYPER",
  "ANOTHER",
  "LEGGENDARIA",
];

function isChartDifficulty(value: string): value is ChartDifficulty {
  return DAKEN_COUNTER_V3_ALIAS_DIFFICULTIES.includes(value as ChartDifficulty);
}

function buildDakenCounterV3AliasResolveCacheKey(alias: string, playStyle: "SP" | "DP", difficulty: ChartDifficulty): string {
  return `${playStyle}::${difficulty}::${alias}`;
}

function clearDakenCounterV3AliasResolveCache(): void {
  dakenCounterV3AliasResolveCache.clear();
}

async function resolveDakenCounterV3AliasCandidates(
  rawAlias: string,
  playStyle: "SP" | "DP",
  difficulty: string,
): Promise<string[]> {
  const alias = rawAlias.trim();
  if (alias.length === 0 || !isChartDifficulty(difficulty)) {
    return [];
  }

  const cacheKey = buildDakenCounterV3AliasResolveCacheKey(alias, playStyle, difficulty);
  const cached = dakenCounterV3AliasResolveCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const apiBaseUrl = latestSettings?.apiBaseUrl?.trim() ?? "";
  if (apiBaseUrl.length === 0) {
    return [];
  }

  try {
    const response = await resolveChartAlias(apiBaseUrl, {
      alias,
      play_style: playStyle,
      difficulty,
    });
    const normalized = Array.from(
      new Set(
        response.title_search_keys
          .map((titleSearchKey) => titleSearchKey.trim())
          .filter((titleSearchKey) => titleSearchKey.length > 0),
      ),
    );
    dakenCounterV3AliasResolveCache.set(cacheKey, normalized);
    return normalized;
  } catch (error) {
    console.warn(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: runtime alias resolve failed.`, error);
    return [];
  }
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized >= 0 ? normalized : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDifficultyCode(rawDifficulty: unknown): {
  code: string;
  playStyle: "SP" | "DP";
  difficulty: ParsedSourceObservationPayload["difficulty"];
} | null {
  const normalized = normalizeText(rawDifficulty).normalize("NFKC").toUpperCase();
  if (normalized.length === 0) {
    return null;
  }

  const mapped = DAKEN_COUNTER_V3_DIFFICULTY_MAP[normalized];
  if (!mapped) {
    return null;
  }

  return {
    code: normalized,
    playStyle: mapped.playStyle,
    difficulty: mapped.difficulty,
  };
}

function fingerprintHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function rememberProcessedFingerprint(fingerprint: string): void {
  if (dakenCounterV3ProcessedFingerprints.has(fingerprint)) {
    return;
  }

  dakenCounterV3ProcessedFingerprints.add(fingerprint);
  dakenCounterV3ProcessedFingerprintQueue.push(fingerprint);
  while (dakenCounterV3ProcessedFingerprintQueue.length > DAKEN_COUNTER_V3_HISTORY_LIMIT) {
    const oldest = dakenCounterV3ProcessedFingerprintQueue.shift();
    if (oldest !== undefined) {
      dakenCounterV3ProcessedFingerprints.delete(oldest);
    }
  }
}

function resetDakenCounterV3SnapshotTracking(): void {
  dakenCounterV3MonitoringEnabled = false;
  dakenCounterV3LastRoomState = null;
  dakenCounterV3HasSnapshotBaseline = false;
  dakenCounterV3SnapshotFingerprintCounts = new Map<string, number>();
  dakenCounterV3SocketMessageQueue = Promise.resolve();
  clearDakenCounterV3AliasResolveCache();
  dakenCounterV3ProcessedFingerprints.clear();
  dakenCounterV3ProcessedFingerprintQueue.splice(0, dakenCounterV3ProcessedFingerprintQueue.length);
}

function resetDakenCounterV3MatchTracking(): void {
  dakenCounterV3MonitoringEnabled = false;
  // Keep baseline across rematches so the first PLAYING update is still diffed/submitted.
  dakenCounterV3SocketMessageQueue = Promise.resolve();
  clearDakenCounterV3AliasResolveCache();
  dakenCounterV3ProcessedFingerprints.clear();
  dakenCounterV3ProcessedFingerprintQueue.splice(0, dakenCounterV3ProcessedFingerprintQueue.length);
}

function clearDakenCounterV3ReconnectTimer(): void {
  if (dakenCounterV3ReconnectTimer !== null) {
    window.clearTimeout(dakenCounterV3ReconnectTimer);
    dakenCounterV3ReconnectTimer = null;
  }
}

function buildDakenCounterV3Endpoint(port: number): string {
  return `ws://localhost:${port}`;
}

function createDakenCounterV3WebSocket(endpoint: string): WebSocket {
  if (runtimeConfig.e2e.enabled) {
    return new WebSocket(endpoint, DAKEN_COUNTER_V3_E2E_SUBPROTOCOL);
  }
  return new WebSocket(endpoint);
}

function currentDakenCounterV3Port(): number {
  const configuredPort = latestSettings?.dakenCounterV3Port ?? DAKEN_COUNTER_V3_DEFAULT_PORT;
  return isValidPortNumber(configuredPort) ? configuredPort : DAKEN_COUNTER_V3_DEFAULT_PORT;
}

function isDakenCounterV3SocketOpen(): boolean {
  return dakenCounterV3Socket !== null && dakenCounterV3Socket.readyState === WebSocket.OPEN;
}

function updateDakenCounterV3WatcherState(
  status: SourceWatcherStatus,
  detail: string,
  watchedPaths: string[] = [],
): void {
  internalStore.setState((state) => ({
    ...state,
    watcherState: {
      ...state.watcherState,
      status,
      source: DAKEN_COUNTER_V3_SOURCE,
      watchedPaths,
      detail,
      lastEventAt: new Date().toISOString(),
    },
  }));
}

function parseDakenCounterV3Item(
  rawItem: unknown,
  index: number,
): DakenCounterV3ObservationEntry | null {
  if (!isRecord(rawItem)) {
    console.warn(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded item[${index}] because it is not an object.`);
    return null;
  }

  const battle = parseNonNegativeInteger(rawItem.battle);
  if (battle === 1) {
    console.info(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded item[${index}] because battle == 1.`);
    return null;
  }

  const title = normalizeText(rawItem.title);
  const titleSearchKey = normalizeTitle(rawItem.title);
  if (title.length === 0 || titleSearchKey === null) {
    console.warn(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded item[${index}] because title is empty.`);
    return null;
  }

  const parsedDifficulty = parseDifficultyCode(rawItem.difficulty);
  if (parsedDifficulty === null) {
    console.warn(
      `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded item[${index}] because difficulty is unknown.`,
      rawItem.difficulty,
    );
    return null;
  }

  const score = parseNonNegativeInteger(rawItem.score);
  if (score === null) {
    console.warn(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded item[${index}] because score is invalid.`);
    return null;
  }

  const chartId = parseNonNegativeInteger(rawItem.chart_id);

  const rawBp = parseNonNegativeInteger(rawItem.bp);
  const rawPreScore = parseNonNegativeInteger(rawItem.pre_score);
  const rawPreBp = parseNonNegativeInteger(rawItem.pre_bp);
  const bp = rawBp ?? 9999;
  const preBp = rawPreBp ?? 9999;
  const bestScore = rawPreScore === null ? score : Math.max(score, rawPreScore);
  const bestBp = Math.min(bp, preBp);

  const lamp = parseOptionalString(rawItem.lamp);
  const preLamp = parseOptionalString(rawItem.pre_lamp);
  const opt = parseOptionalString(rawItem.opt);
  const playSpeed = parseOptionalString(rawItem.playspeed);
  const notes = parseNonNegativeInteger(rawItem.notes);

  const fingerprintSeed = [
    titleSearchKey,
    parsedDifficulty.code,
    score,
    bp,
    rawPreScore ?? "",
    preBp,
    lamp ?? "",
    opt ?? "",
    playSpeed ?? "",
  ].join("|");

  return {
    fingerprint: fingerprintHash(fingerprintSeed),
    observation: {
      timestamp: new Date().toISOString(),
      playStyle: parsedDifficulty.playStyle,
      difficulty: parsedDifficulty.difficulty,
      title,
      titleSearchKey,
      chartId,
      score,
      misscount: bp,
      sourceMetaExtras: {
        chart_id: chartId,
        best_score: bestScore,
        best_bp: bestBp,
        pre_score: rawPreScore ?? score,
        pre_bp: preBp,
        lamp,
        pre_lamp: preLamp,
        opt,
        playspeed: playSpeed,
        notes,
      },
    },
  };
}

function parseDakenCounterV3Message(rawMessage: string): {
  entries: DakenCounterV3ObservationEntry[];
  fingerprintCounts: Map<string, number>;
} | null {
  let parsedMessage: unknown;
  try {
    parsedMessage = JSON.parse(rawMessage);
  } catch (error) {
    console.warn(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded malformed JSON message.`, error);
    return null;
  }

  if (!isRecord(parsedMessage)) {
    console.warn(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded message because payload is not an object.`);
    return null;
  }

  if (parsedMessage.type !== "today_updates") {
    console.info(
      `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: ignored message because type is not today_updates.`,
      parsedMessage.type,
    );
    return null;
  }

  if (!isRecord(parsedMessage.data) || !Array.isArray(parsedMessage.data.items)) {
    console.warn(
      `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded today_updates because data.items is not an array.`,
    );
    return null;
  }

  const entries: DakenCounterV3ObservationEntry[] = [];
  for (let index = 0; index < parsedMessage.data.items.length; index += 1) {
    const nextEntry = parseDakenCounterV3Item(parsedMessage.data.items[index], index);
    if (nextEntry !== null) {
      entries.push(nextEntry);
    }
  }

  return {
    entries,
    fingerprintCounts: buildDakenCounterV3FingerprintCounts(entries),
  };
}

function buildDakenCounterV3FingerprintCounts(
  entries: DakenCounterV3ObservationEntry[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.fingerprint, (counts.get(entry.fingerprint) ?? 0) + 1);
  }

  return counts;
}

function diffDakenCounterV3SnapshotEntries(
  previousCounts: Map<string, number>,
  currentCounts: Map<string, number>,
  currentEntries: DakenCounterV3ObservationEntry[],
): DakenCounterV3ObservationEntry[] {
  const remaining = new Map<string, number>();
  for (const [fingerprint, currentCount] of currentCounts) {
    const previousCount = previousCounts.get(fingerprint) ?? 0;
    if (currentCount > previousCount) {
      remaining.set(fingerprint, currentCount - previousCount);
    }
  }

  if (remaining.size === 0) {
    return [];
  }

  const deltaEntries: DakenCounterV3ObservationEntry[] = [];
  for (const entry of currentEntries) {
    const rest = remaining.get(entry.fingerprint) ?? 0;
    if (rest <= 0) {
      continue;
    }

    deltaEntries.push(entry);
    if (rest === 1) {
      remaining.delete(entry.fingerprint);
    } else {
      remaining.set(entry.fingerprint, rest - 1);
    }
  }

  return deltaEntries;
}

function normalizeExactTitle(value: string): string {
  return value.trim();
}

function getExpectedDisplayTitleForCurrentRound(snapshot: RoomStateSnapshot): string | null {
  const currentRound = snapshot.current_round;
  if (currentRound === null) {
    return null;
  }

  const frozenRound = snapshot.frozen_rounds.find((round) => round.round_index === currentRound.round_index);
  const displayTitle = frozenRound?.display.title.trim() ?? "";
  if (displayTitle.length > 0) {
    return displayTitle;
  }

  return null;
}

async function resolveDakenCounterV3ObservationAgainstCurrentRound(
  observation: ParsedSourceObservationPayload,
  snapshot: RoomStateSnapshot,
): Promise<{
  observation: ParsedSourceObservationPayload;
  unresolvedCase: ParsedSourceUnresolvedCasePayload | null;
}> {
  const currentRound = snapshot.current_round;
  if (currentRound === null) {
    return { observation, unresolvedCase: null };
  }

  const expectedKey = currentRound.expected_key;
  const observedPlayStyle = observation.playStyle ?? expectedKey.play_style;
  const playStyleMatches = observedPlayStyle === expectedKey.play_style;
  const difficultyMatches = observation.difficulty === expectedKey.difficulty;
  const expectedDisplayTitle = getExpectedDisplayTitleForCurrentRound(snapshot);
  const titleMatches =
    expectedDisplayTitle !== null && normalizeExactTitle(observation.title) === normalizeExactTitle(expectedDisplayTitle);

  const expectedChartId =
    typeof expectedKey.chart_id === "number" && Number.isInteger(expectedKey.chart_id) && expectedKey.chart_id > 0
      ? expectedKey.chart_id
      : null;
  const observedChartId =
    typeof observation.chartId === "number" && Number.isInteger(observation.chartId) && observation.chartId > 0
      ? observation.chartId
      : null;
  const chartIdMatches =
    expectedChartId !== null && observedChartId !== null && observedChartId === expectedChartId;
  const aliasMatches =
    playStyleMatches && difficultyMatches && !chartIdMatches && !titleMatches
      ? (await resolveDakenCounterV3AliasCandidates(
          observation.title,
          observedPlayStyle,
          observation.difficulty,
        )).includes(expectedKey.title_search_key)
      : false;

  if (playStyleMatches && difficultyMatches && (chartIdMatches || titleMatches || aliasMatches)) {
    const mergedSourceMetaExtras = {
      ...(observation.sourceMetaExtras ?? {}),
      ...(expectedChartId === null ? {} : { chart_id: expectedChartId }),
    };
    return {
      observation: {
        ...observation,
        playStyle: expectedKey.play_style,
        difficulty: expectedKey.difficulty,
        titleSearchKey: expectedKey.title_search_key,
        chartId: expectedChartId,
        sourceMetaExtras: mergedSourceMetaExtras,
      },
      unresolvedCase: null,
    };
  }

  return {
    observation,
    unresolvedCase: {
      kind: "unresolved_alias",
      timestamp: observation.timestamp,
      playStyle: observation.playStyle ?? expectedKey.play_style,
      difficulty: observation.difficulty,
      title: observation.title,
      titleSearchKey: observation.titleSearchKey,
      score: observation.score,
      misscount: observation.misscount,
      recentCandidateCount: null,
    },
  };
}

function isRetryableDakenCounterV3SubmitFailure(message: string): boolean {
  return (
    message === "A connected PLAYING room is required before injecting source data." ||
    message === "Failed to send RESULT_SUBMIT for the injected payload."
  );
}

function effectiveSourcePhase(snapshot: RoomStateSnapshot | null): string | null {
  return snapshot?.room_state ?? latestEventRoomSnapshot?.phase ?? null;
}

function shouldKeepDakenCounterV3Connection(snapshot: RoomStateSnapshot | null): boolean {
  const phase = effectiveSourcePhase(snapshot);
  return (
    latestSettings?.source === DAKEN_COUNTER_V3_SOURCE &&
    phase !== null &&
    phase !== "CLOSED"
  );
}

function disconnectDakenCounterV3Socket(options: { resetTracking: boolean }): void {
  clearDakenCounterV3ReconnectTimer();

  const activeSocket = dakenCounterV3Socket;
  dakenCounterV3Socket = null;
  dakenCounterV3SocketPort = null;
  if (activeSocket !== null) {
    activeSocket.onopen = null;
    activeSocket.onmessage = null;
    activeSocket.onerror = null;
    activeSocket.onclose = null;

    if (
      activeSocket.readyState === WebSocket.CONNECTING ||
      activeSocket.readyState === WebSocket.OPEN
    ) {
      activeSocket.close();
    }
  }

  if (options.resetTracking) {
    resetDakenCounterV3SnapshotTracking();
  }
}

function scheduleDakenCounterV3Reconnect(snapshot: RoomStateSnapshot | null): void {
  if (!shouldKeepDakenCounterV3Connection(snapshot) || dakenCounterV3ReconnectTimer !== null) {
    return;
  }

  void logE2EEvent("reconnect_started", {
    source: DAKEN_COUNTER_V3_SOURCE,
    delayMs: DAKEN_COUNTER_V3_RECONNECT_DELAY_MS,
  });
  dakenCounterV3ReconnectTimer = window.setTimeout(() => {
    dakenCounterV3ReconnectTimer = null;
    connectDakenCounterV3Socket(roomStore.getState().snapshot);
  }, DAKEN_COUNTER_V3_RECONNECT_DELAY_MS);
}

async function handleDakenCounterV3SocketMessage(rawMessage: string): Promise<void> {
  const parsedSnapshot = parseDakenCounterV3Message(rawMessage);
  if (parsedSnapshot === null) {
    return;
  }
  const endpoint = buildDakenCounterV3Endpoint(currentDakenCounterV3Port());
  void logE2EEvent("file_detected", {
    source: DAKEN_COUNTER_V3_SOURCE,
    filePath: endpoint,
    detail: "today_updates message received",
  });
  void logE2EEvent("file_parsed", {
    source: DAKEN_COUNTER_V3_SOURCE,
    observationCount: parsedSnapshot.entries.length,
    unresolvedCount: 0,
  });

  const previousCounts = dakenCounterV3SnapshotFingerprintCounts;
  const deltaEntries = dakenCounterV3HasSnapshotBaseline
    ? diffDakenCounterV3SnapshotEntries(
        previousCounts,
        parsedSnapshot.fingerprintCounts,
        parsedSnapshot.entries,
      )
    : [];

  if (!dakenCounterV3HasSnapshotBaseline) {
    dakenCounterV3SnapshotFingerprintCounts = parsedSnapshot.fingerprintCounts;
    dakenCounterV3HasSnapshotBaseline = true;
  }

  const roomSnapshot = roomStore.getState().snapshot;
  if (
    roomSnapshot === null ||
    roomSnapshot.room_state !== "PLAYING" ||
    !dakenCounterV3MonitoringEnabled
  ) {
    dakenCounterV3SnapshotFingerprintCounts = parsedSnapshot.fingerprintCounts;
    return;
  }

  const uniqueEntries = deltaEntries.filter(
    (entry) => !dakenCounterV3ProcessedFingerprints.has(entry.fingerprint),
  );
  if (uniqueEntries.length === 0) {
    dakenCounterV3SnapshotFingerprintCounts = parsedSnapshot.fingerprintCounts;
    return;
  }

  let hasRetryableFailure = false;
  for (const entry of uniqueEntries) {
    const resolvedEntry = await resolveDakenCounterV3ObservationAgainstCurrentRound(
      entry.observation,
      roomSnapshot,
    );
    const parsedChange: ParsedSourceChangePayload = {
      source: DAKEN_COUNTER_V3_SOURCE,
      filePath: buildDakenCounterV3Endpoint(currentDakenCounterV3Port()),
      fileSizeBytes: 0,
      observations: resolvedEntry.unresolvedCase === null ? [resolvedEntry.observation] : [],
      unresolvedCases: resolvedEntry.unresolvedCase === null ? [] : [resolvedEntry.unresolvedCase],
    };

    if (parsedChange.observations.length === 0 && (parsedChange.unresolvedCases?.length ?? 0) > 0) {
      const unresolvedDialogs = buildUnresolvedDialogsFromParserOutput(parsedChange);
      enqueueUnresolvedDialogs(unresolvedDialogs);
      rememberProcessedFingerprint(entry.fingerprint);
      roomStore.noteLocalEvent(
        `Source auto-submit skipped: ${DAKEN_COUNTER_V3_ORIGIN_LABEL} requires unresolved_alias confirmation.`,
      );
      void logE2EEvent("normalize_failed", {
        source: DAKEN_COUNTER_V3_SOURCE,
        originLabel: DAKEN_COUNTER_V3_ORIGIN_LABEL,
        message: "daken_counter_v3 observation requires unresolved_alias confirmation.",
        hasPendingUnresolvedAlias: false,
      });
      continue;
    }

    const outcome = submitParsedSourceChange(parsedChange, DAKEN_COUNTER_V3_ORIGIN_LABEL);
    if (outcome.ok) {
      rememberProcessedFingerprint(entry.fingerprint);
      void logE2EEvent("normalize_succeeded", {
        source: DAKEN_COUNTER_V3_SOURCE,
        originLabel: DAKEN_COUNTER_V3_ORIGIN_LABEL,
        unresolvedCount: parsedChange.unresolvedCases?.length ?? 0,
      });
      continue;
    }

    if (outcome.pendingUnresolvedAlias !== undefined) {
      void logE2EEvent("normalize_failed", {
        source: DAKEN_COUNTER_V3_SOURCE,
        originLabel: DAKEN_COUNTER_V3_ORIGIN_LABEL,
        message: outcome.message,
        hasPendingUnresolvedAlias: true,
      });
      continue;
    }

    if (isRetryableDakenCounterV3SubmitFailure(outcome.message)) {
      hasRetryableFailure = true;
      void logE2EEvent("normalize_failed", {
        source: DAKEN_COUNTER_V3_SOURCE,
        originLabel: DAKEN_COUNTER_V3_ORIGIN_LABEL,
        message: outcome.message,
        hasPendingUnresolvedAlias: false,
      });
      continue;
    }

    roomStore.noteLocalEvent(`Source auto-submit skipped: ${outcome.message}`);
    void logE2EEvent("normalize_failed", {
      source: DAKEN_COUNTER_V3_SOURCE,
      originLabel: DAKEN_COUNTER_V3_ORIGIN_LABEL,
      message: outcome.message,
      hasPendingUnresolvedAlias: false,
    });
  }

  if (!hasRetryableFailure) {
    dakenCounterV3SnapshotFingerprintCounts = parsedSnapshot.fingerprintCounts;
  }
}

function connectDakenCounterV3Socket(snapshot: RoomStateSnapshot | null): void {
  if (!shouldKeepDakenCounterV3Connection(snapshot)) {
    disconnectDakenCounterV3Socket({ resetTracking: false });
    return;
  }

  const port = currentDakenCounterV3Port();
  if (!isValidPortNumber(port)) {
    updateDakenCounterV3WatcherState(
      "ERROR",
      `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: invalid port ${String(port)}.`,
    );
    return;
  }

  if (
    dakenCounterV3Socket !== null &&
    dakenCounterV3SocketPort === port &&
    (dakenCounterV3Socket.readyState === WebSocket.CONNECTING ||
      dakenCounterV3Socket.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  disconnectDakenCounterV3Socket({ resetTracking: false });

  const endpoint = buildDakenCounterV3Endpoint(port);
  try {
    const socket = createDakenCounterV3WebSocket(endpoint);
    dakenCounterV3Socket = socket;
    dakenCounterV3SocketPort = port;
    updateDakenCounterV3WatcherState("IDLE", `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: connecting...`, [endpoint]);

    socket.onopen = () => {
      if (dakenCounterV3Socket !== socket) {
        return;
      }
      updateDakenCounterV3WatcherState("RUNNING", `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: connected.`, [endpoint]);
      console.info(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: connected to ${endpoint}.`);
      const latestSnapshot = roomStore.getState().snapshot;
      if (effectiveSourcePhase(latestSnapshot) === "PLAYING") {
        dakenCounterV3MonitoringEnabled = true;
        void logE2EEvent("reconnect_succeeded", {
          source: DAKEN_COUNTER_V3_SOURCE,
          roomState: effectiveSourcePhase(latestSnapshot),
        });
      }
      void logE2EEvent("watcher_started", {
        source: DAKEN_COUNTER_V3_SOURCE,
        watchedPaths: [endpoint],
      });
    };

    socket.onmessage = (event) => {
      if (dakenCounterV3Socket !== socket) {
        return;
      }

      if (typeof event.data !== "string") {
        console.warn(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: discarded non-text WebSocket payload.`);
        return;
      }

      dakenCounterV3SocketMessageQueue = dakenCounterV3SocketMessageQueue
        .then(() => handleDakenCounterV3SocketMessage(event.data))
        .catch((error) => {
          console.error(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: failed to process WebSocket payload.`, error);
        });
    };

    socket.onerror = (event) => {
      if (dakenCounterV3Socket !== socket) {
        return;
      }
      console.error(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: WebSocket error.`, event);
    };

    socket.onclose = (event) => {
      if (dakenCounterV3Socket !== socket) {
        return;
      }

      dakenCounterV3Socket = null;
      dakenCounterV3SocketPort = null;
      const reason = event.reason.trim().length > 0 ? event.reason : `code=${event.code}`;
      console.warn(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: connection closed (${reason}).`);

      const latestSnapshot = roomStore.getState().snapshot;
      if (shouldKeepDakenCounterV3Connection(latestSnapshot)) {
        updateDakenCounterV3WatcherState(
          "ERROR",
          `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: connection closed (${reason}). retrying...`,
          [endpoint],
        );
        scheduleDakenCounterV3Reconnect(latestSnapshot);
        return;
      }

      updateDakenCounterV3WatcherState(
        "STOPPED",
        `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: disconnected.`,
      );
    };
  } catch (error) {
    updateDakenCounterV3WatcherState(
      "ERROR",
      error instanceof Error ? error.message : `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: failed to connect.`,
      [endpoint],
    );
    console.error(`${DAKEN_COUNTER_V3_ORIGIN_LABEL}: failed to open WebSocket.`, error);
    scheduleDakenCounterV3Reconnect(snapshot);
  }
}

function syncDakenCounterV3RoomLifecycle(snapshot: RoomStateSnapshot | null): void {
  const previousState = dakenCounterV3LastRoomState;
  const currentState = effectiveSourcePhase(snapshot);
  dakenCounterV3LastRoomState = currentState;

  if (latestSettings?.source !== DAKEN_COUNTER_V3_SOURCE) {
    disconnectDakenCounterV3Socket({ resetTracking: true });
    return;
  }

  if (!shouldKeepDakenCounterV3Connection(snapshot)) {
    disconnectDakenCounterV3Socket({ resetTracking: true });
    updateDakenCounterV3WatcherState(
      "IDLE",
      `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: join a room to start monitoring.`,
    );
    return;
  }

  if (currentState === "LOBBY") {
    if (previousState !== "LOBBY") {
      // Clear per-match dedupe state so rematches can submit identical result tuples.
      resetDakenCounterV3MatchTracking();
    }
    connectDakenCounterV3Socket(snapshot);
    dakenCounterV3MonitoringEnabled = false;
    return;
  }

  if (currentState !== "PLAYING") {
    dakenCounterV3MonitoringEnabled = false;
    return;
  }

  if (previousState === "PLAYING") {
    return;
  }

  if (!isDakenCounterV3SocketOpen()) {
    dakenCounterV3MonitoringEnabled = false;
    roomStore.reportSourceUnavailable(DAKEN_COUNTER_V3_WARNING_MESSAGE);
    roomStore.setSourceAvailability(false);
    eventRoomStore.reportSourceUnavailable(DAKEN_COUNTER_V3_WARNING_MESSAGE);
    eventRoomStore.setSourceAvailability(false);
    console.warn(
      `${DAKEN_COUNTER_V3_ORIGIN_LABEL}: monitoring is disabled because the connection was unavailable at PLAYING start.`,
    );
    return;
  }

  dakenCounterV3MonitoringEnabled = true;
  roomStore.setSourceAvailability(true);
  eventRoomStore.setSourceAvailability(true);
}

function nextUnresolvedDialogId(): string {
  unresolvedDialogSequence += 1;
  return `source-unresolved-${Date.now()}-${unresolvedDialogSequence}`;
}

function getActiveRoundMetricContext():
  | { winMetric: "SCORE" | "MISSCOUNT"; metricLabel: "EXSCORE" | "MISSCOUNT" }
  | null {
  const snapshot = roomStore.getState().snapshot;
  if (snapshot === null || snapshot.room_state !== "PLAYING" || snapshot.current_round === null) {
    return null;
  }

  return {
    winMetric: snapshot.settings.win_metric,
    metricLabel: snapshot.settings.win_metric === "SCORE" ? "EXSCORE" : "MISSCOUNT",
  };
}

function normalizePlayStyle(value: string): "SP" | "DP" {
  return value === "DP" ? "DP" : "SP";
}

function buildDialogChartInfo(
  unresolvedCase: ParsedSourceUnresolvedCasePayload,
  metricContext: { winMetric: "SCORE" | "MISSCOUNT"; metricLabel: "EXSCORE" | "MISSCOUNT" },
): SourceDialogChartInfo {
  const metricValue =
    metricContext.winMetric === "SCORE" ? unresolvedCase.score : unresolvedCase.misscount;
  return {
    title:
      unresolvedCase.title.trim().length > 0
        ? unresolvedCase.title
        : (unresolvedCase.titleSearchKey ?? "(unknown)"),
    titleSearchKey: unresolvedCase.titleSearchKey,
    playStyle: normalizePlayStyle(unresolvedCase.playStyle),
    difficulty: unresolvedCase.difficulty,
    metricLabel: metricContext.metricLabel,
    metricValue,
  };
}

function buildUnresolvedDialogsFromParserOutput(
  parserOutput: ParsedSourceChangePayload,
): SourceUnresolvedDialog[] {
  const metricContext = getActiveRoundMetricContext();
  if (metricContext === null) {
    return [];
  }

  const originLabel = formatSourceOriginLabel(parserOutput.source);
  const unresolvedCases = parserOutput.unresolvedCases ?? [];
  const dialogs: SourceUnresolvedDialog[] = [];
  for (const unresolvedCase of unresolvedCases) {
    if (unresolvedCase.kind === "unresolved_alias") {
      dialogs.push({
        id: nextUnresolvedDialogId(),
        kind: "unresolved_alias_catalog",
        source: parserOutput.source,
        originLabel,
        chart: buildDialogChartInfo(unresolvedCase, metricContext),
        errorCode: "NB-UNRESOLVED-ALIAS",
      });
      continue;
    }

    if (unresolvedCase.kind === "resolved_partial") {
      dialogs.push({
        id: nextUnresolvedDialogId(),
        kind: "resolved_partial",
        source: parserOutput.source,
        originLabel,
        chart: buildDialogChartInfo(unresolvedCase, metricContext),
      });
      continue;
    }

    if (unresolvedCase.kind === "ambiguous_recent") {
      dialogs.push({
        id: nextUnresolvedDialogId(),
        kind: "ambiguous_recent",
        source: parserOutput.source,
        originLabel,
        chart: buildDialogChartInfo(unresolvedCase, metricContext),
        candidateCount: Math.max(2, unresolvedCase.recentCandidateCount ?? 2),
        errorCode: "NB-AMBIGUOUS-RECENT",
      });
    }
  }

  return dialogs;
}

function buildUnresolvedAliasDialog(
  source: SourceType,
  originLabel: string,
  pending: {
    expectedTarget: NotebookDialogChartInfo;
    parsedResult: NotebookDialogChartInfo;
    mismatchReason: string;
    forcePayload: NotebookForcedRegistrationPayload;
  },
): SourceUnresolvedAliasDialog {
  return {
    id: nextUnresolvedDialogId(),
    kind: "unresolved_alias",
    source,
    originLabel,
    expectedTarget: pending.expectedTarget,
    parsedResult: pending.parsedResult,
    mismatchReason: pending.mismatchReason,
    forcePayload: pending.forcePayload,
  };
}

function enqueueUnresolvedDialogs(newDialogs: SourceUnresolvedDialog[]): void {
  if (newDialogs.length === 0) {
    return;
  }

  internalStore.setState((state) => {
    const queue = [...state.unresolvedDialogQueue, ...newDialogs];
    if (state.activeUnresolvedDialog !== null) {
      return {
        ...state,
        unresolvedDialogQueue: queue,
      };
    }

    const [nextDialog, ...remainingQueue] = queue;
    return {
      ...state,
      activeUnresolvedDialog: nextDialog ?? null,
      unresolvedDialogQueue: remainingQueue,
    };
  });

  const firstUnresolvedDialog = newDialogs.find(
    (dialog) => dialog.kind === "unresolved_alias" || dialog.kind === "unresolved_alias_catalog",
  );
  if (firstUnresolvedDialog) {
    void logE2EEvent("unresolved_alias_dialog_opened", {
      source: firstUnresolvedDialog.source,
      kind: firstUnresolvedDialog.kind,
      originLabel: firstUnresolvedDialog.originLabel,
    });
  }
}

function advanceUnresolvedDialogQueue(): void {
  internalStore.setState((state) => {
    if (state.unresolvedDialogQueue.length === 0) {
      return {
        ...state,
        activeUnresolvedDialog: null,
      };
    }

    const [nextDialog, ...remainingQueue] = state.unresolvedDialogQueue;
    return {
      ...state,
      activeUnresolvedDialog: nextDialog ?? null,
      unresolvedDialogQueue: remainingQueue,
    };
  });
}

function handleWatcherError(payload: SourceWatcherEventPayload): void {
  if (payload.kind !== "ERROR") {
    return;
  }

  roomStore.reportSourceUnavailable(payload.detail);
  roomStore.setSourceAvailability(false);
  eventRoomStore.reportSourceUnavailable(payload.detail);
  eventRoomStore.setSourceAvailability(false);
}

function handleWatcherEvent(payload: SourceWatcherEventPayload): void {
  internalStore.setState((state) => ({
    ...state,
    runtimeReady: true,
    watcherState: mapWatcherState(payload.state),
    lastEvent: mapWatcherEvent(payload),
  }));

  handleWatcherError(payload);

  if (payload.kind !== "FILE_CHANGED" || payload.parserOutput === null) {
    if (payload.kind === "STARTED") {
      void logE2EEvent("watcher_started", {
        source: payload.state.source,
        detail: payload.detail,
      });
    }
    return;
  }
  roomStore.setSourceAvailability(true);
  eventRoomStore.setSourceAvailability(true);
  void logE2EEvent("file_detected", {
    source: payload.parserOutput.source,
    filePath: payload.filePath,
    detail: payload.detail,
  });
  void logE2EEvent("file_parsed", {
    source: payload.parserOutput.source,
    observationCount: payload.parserOutput.observations.length,
    unresolvedCount: payload.parserOutput.unresolvedCases?.length ?? 0,
  });

  const originLabel = formatSourceOriginLabel(payload.parserOutput.source);
  const unresolvedDialogs = buildUnresolvedDialogsFromParserOutput(payload.parserOutput);
  const outcome = submitParsedSourceChange(payload.parserOutput, originLabel);
  if (outcome.pendingUnresolvedAlias) {
    unresolvedDialogs.push(
      buildUnresolvedAliasDialog(
        payload.parserOutput.source,
        originLabel,
        outcome.pendingUnresolvedAlias,
      ),
    );
  }

  enqueueUnresolvedDialogs(unresolvedDialogs);
  if (outcome.ok) {
    void logE2EEvent("normalize_succeeded", {
      source: payload.parserOutput.source,
      originLabel,
      unresolvedCount: unresolvedDialogs.length,
    });
  } else {
    void logE2EEvent("normalize_failed", {
      source: payload.parserOutput.source,
      originLabel,
      message: outcome.message,
      hasPendingUnresolvedAlias: outcome.pendingUnresolvedAlias !== undefined,
    });
  }

  if (!outcome.ok && outcome.pendingUnresolvedAlias === undefined && unresolvedDialogs.length === 0) {
    roomStore.noteLocalEvent(`Source auto-submit skipped: ${outcome.message}`);
  }
}

function getMissingPathMessage(source: SourceType, paths: SourcePaths): string | null {
  if (source === "inf_daken_counter" && paths.dakenTodayUpdateXml.trim().length === 0) {
    return "Set inf_daken_counter / today_update.xml before starting the watcher.";
  }

  if (source === "inf-notebook" && paths.notebookExportRecentJson.trim().length === 0) {
    return "Set inf-notebook / export/recent.json before starting the watcher.";
  }

  if (source === "inf-notebook" && paths.notebookRecordsRecentJson.trim().length === 0) {
    return "Set inf-notebook / records/summary.json before starting the watcher.";
  }

  if (source === "reflux" && paths.refluxLatestJson.trim().length === 0) {
    return "Set Reflux / latest.json before starting the watcher.";
  }

  if (source === "reflux" && paths.refluxTrackerTsv.trim().length === 0) {
    return "Set Reflux / tracker.tsv before starting the watcher.";
  }

  return null;
}

async function ensureAttached(): Promise<void> {
  if (attachedListener !== null) {
    return;
  }

  if (attachPromise !== null) {
    await attachPromise;
    return;
  }

  attachPromise = (async () => {
    if (!isTauriRuntime()) {
      internalStore.setState((state) => ({
        ...state,
        runtimeReady: false,
        watcherState: {
          status: "UNAVAILABLE",
          source: null,
          watchedPaths: [],
          detail: "Source watcher is available only inside the Tauri desktop app.",
          lastEventAt: null,
        },
      }));
      return;
    }

    attachedListener = await listenToSourceWatcherEvents(handleWatcherEvent);

    const statePayload = await getSourceWatcherState();
    internalStore.setState((state) => ({
      ...state,
      runtimeReady: true,
      watcherState: mapWatcherState(statePayload),
    }));
  })().finally(() => {
    attachPromise = null;
  });

  await attachPromise;
}

function logUnresolvedAliasDecision(
  dialog: SourceUnresolvedAliasDialog,
  userAccepted: boolean,
): void {
  const logPayload: {
    expected_target: SourceUnresolvedAliasDialog["expectedTarget"];
    parsed_result: SourceUnresolvedAliasDialog["parsedResult"];
    mismatch_reason: string;
    user_accepted: boolean;
    user_skipped?: boolean;
  } = {
    expected_target: dialog.expectedTarget,
    parsed_result: dialog.parsedResult,
    mismatch_reason: dialog.mismatchReason,
    user_accepted: userAccepted,
  };
  if (!userAccepted) {
    logPayload.user_skipped = true;
  }
  console.info("inf-notebook unresolved_alias decision", logPayload);
}

export const sourceStore = {
  ...internalStore,
  async attach(): Promise<void> {
    await ensureAttached();
  },
  resolveActiveUnresolvedDialog(action: DialogAction): void {
    const activeDialog = internalStore.getState().activeUnresolvedDialog;
    if (activeDialog === null) {
      return;
    }

    if (activeDialog.kind === "unresolved_alias") {
      const userAccepted = action === "accept";
      logUnresolvedAliasDecision(activeDialog, userAccepted);
      if (userAccepted) {
        const outcome = submitNotebookForcedRegistration(
          activeDialog.forcePayload,
          activeDialog.originLabel,
        );
        if (!outcome.ok) {
          roomStore.noteLocalEvent(`Source auto-submit skipped: ${outcome.message}`);
        }
      } else {
        roomStore.noteLocalEvent("Source auto-submit skipped: unresolved_alias was not approved.");
      }
    } else if (activeDialog.kind === "resolved_partial") {
      roomStore.noteLocalEvent(
        `Source auto-submit skipped: ${activeDialog.originLabel} resolved_partial requires re-registration.`,
      );
    } else if (activeDialog.kind === "unresolved_alias_catalog") {
      roomStore.noteLocalEvent(
        `Source auto-submit skipped: ${activeDialog.errorCode} (unresolved alias).`,
      );
    } else {
      roomStore.noteLocalEvent(
        `Source auto-submit skipped: ${activeDialog.errorCode} (candidates=${activeDialog.candidateCount}).`,
      );
    }

    advanceUnresolvedDialogQueue();
  },
  detach(): void {
    attachedListener?.();
    attachedListener = null;
    attachPromise = null;
    latestSettings = null;
    latestEventRoomSnapshot = null;
    disconnectDakenCounterV3Socket({ resetTracking: true });
    internalStore.setState((state) => ({
      ...state,
      runtimeReady: false,
      activeUnresolvedDialog: null,
      unresolvedDialogQueue: [],
    }));
  },
  async start(
    settings: Pick<ClientSettings, "apiBaseUrl" | "source" | "sourcePaths" | "dakenCounterV3Port">,
    options: StartOptions = {},
  ): Promise<void> {
    await ensureAttached();

    latestSettings = settings;
    clearDakenCounterV3AliasResolveCache();
    void logE2EEvent("datasource_initialized", {
      source: settings.source,
      apiBaseUrl: settings.apiBaseUrl,
      dakenCounterV3Port: settings.dakenCounterV3Port,
      sourcePaths: settings.sourcePaths,
    });

    if (settings.source === DAKEN_COUNTER_V3_SOURCE) {
      appliedConfigKey = createConfigKey(settings);
      if (isTauriRuntime()) {
        const currentWatcherState = internalStore.getState().watcherState;
        if (
          currentWatcherState.source !== null &&
          currentWatcherState.source !== DAKEN_COUNTER_V3_SOURCE &&
          currentWatcherState.status !== "IDLE"
        ) {
          try {
            const stoppedPayload = await stopSourceWatcher();
            internalStore.setState((state) => ({
              ...state,
              watcherState: mapWatcherState(stoppedPayload),
            }));
          } catch {
            // noop: legacy watcher may already be inactive
          }
        }
      }

      syncDakenCounterV3RoomLifecycle(roomStore.getState().snapshot);
      return;
    }

    disconnectDakenCounterV3Socket({ resetTracking: true });

    if (!isTauriRuntime()) {
      return;
    }

    const missingPathMessage = getMissingPathMessage(settings.source, settings.sourcePaths);
    if (missingPathMessage) {
      appliedConfigKey = null;
      const currentWatcherState = internalStore.getState().watcherState;
      if (currentWatcherState.source !== null && currentWatcherState.status !== "IDLE") {
        try {
          const stoppedPayload = await stopSourceWatcher();
          internalStore.setState((state) => ({
            ...state,
            watcherState: mapWatcherState(stoppedPayload),
          }));
        } catch {
          // Keep the UI actionable even if the previous watcher has already exited.
        }
      }

      internalStore.setState((state) => ({
        ...state,
        watcherState: {
          ...state.watcherState,
          status: "IDLE",
          source: settings.source,
          watchedPaths: [],
          detail: missingPathMessage,
          lastEventAt: null,
        },
      }));
      roomStore.reportSourceUnavailable(missingPathMessage);
      roomStore.setSourceAvailability(false);
      eventRoomStore.reportSourceUnavailable(missingPathMessage);
      eventRoomStore.setSourceAvailability(false);
      return;
    }

    const nextConfigKey = createConfigKey(settings);
    const currentState = internalStore.getState().watcherState;
    if (!options.force && appliedConfigKey === nextConfigKey && currentState.status === "RUNNING") {
      return;
    }

    try {
      const payload = await startSourceWatcher({
        source: settings.source,
        sourcePaths: settings.sourcePaths,
        apiBaseUrl: settings.apiBaseUrl,
      });

      appliedConfigKey = nextConfigKey;
      internalStore.setState((state) => ({
        ...state,
        watcherState: mapWatcherState(payload),
      }));
      roomStore.setSourceAvailability(true);
      eventRoomStore.setSourceAvailability(true);
      void logE2EEvent("watcher_started", {
        source: settings.source,
        watchedPaths: payload.watchedPaths,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to start watcher.";
      internalStore.setState((state) => ({
        ...state,
        watcherState: {
          ...state.watcherState,
          status: "ERROR",
          source: settings.source,
          detail: errorMessage,
          watchedPaths: [],
          lastEventAt: new Date().toISOString(),
        },
      }));
      roomStore.reportSourceUnavailable(errorMessage);
      roomStore.setSourceAvailability(false);
      eventRoomStore.reportSourceUnavailable(errorMessage);
      eventRoomStore.setSourceAvailability(false);
    }
  },
  async stop(): Promise<void> {
    latestSettings = null;
    disconnectDakenCounterV3Socket({ resetTracking: true });
    await ensureAttached();

    if (!isTauriRuntime()) {
      return;
    }

    try {
      const payload = await stopSourceWatcher();
      appliedConfigKey = null;
      internalStore.setState((state) => ({
        ...state,
        watcherState: mapWatcherState(payload),
      }));
    } catch (error) {
      internalStore.setState((state) => ({
        ...state,
        watcherState: {
          ...state.watcherState,
          status: "ERROR",
          detail: error instanceof Error ? error.message : "Failed to stop watcher.",
          lastEventAt: new Date().toISOString(),
        },
      }));
    }
  },
  syncRoomSnapshot(snapshot: RoomStateSnapshot | null): void {
    syncDakenCounterV3RoomLifecycle(snapshot);
  },
  syncEventRoomSnapshot(snapshot: EventRoomSnapshot | null): void {
    latestEventRoomSnapshot = snapshot;
    syncDakenCounterV3RoomLifecycle(roomStore.getState().snapshot);
  },
};

export function useSourceStore<TSelected>(
  selector: (state: SourceStoreState) => TSelected,
): TSelected {
  return useExternalStore(internalStore, selector);
}
