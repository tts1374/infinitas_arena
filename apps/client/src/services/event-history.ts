import {
  HOST_EVENT_ABSENCE_REASONS,
  HOST_EVENT_END_REASONS,
  HOST_EVENT_HISTORY_SCHEMA_VERSION,
  HOST_EVENT_TYPES,
  PLAY_STYLES,
  WIN_METRICS,
  type EventOverallResultEntry,
  type EventRoomSettings,
  type EventRoomSnapshot,
  type EventRoundResult,
  type HostEventEndReason,
} from "@infinitas/shared";
import { isTauriRuntime, saveEventResultJson } from "./tauri-bridge";

const STORAGE_KEY = "infinitas.client.event-results.v1";

export interface EventHistoryDocument {
  schema_version: 1;
  event_id: string;
  room_id: string;
  settings: EventRoomSettings;
  host: EventRoomSnapshot["host"];
  participants: EventRoomSnapshot["participants"];
  fixed_roster_player_ids: string[];
  scoring_size_n: number | null;
  started_at: string | null;
  ended_at: string | null;
  end_reason: HostEventEndReason | null;
  rounds: EventRoundResult[];
  overall_results?: EventOverallResultEntry[];
  last_public_revision: number;
  synced_round_count: number;
  results_sync_complete: boolean;
  last_received_at: string;
  completeness: "PARTIAL" | "COMPLETE";
}

export interface UnreadableEventHistory {
  readable: false;
  storage_key: string;
  event_id: string | null;
  schema_version: unknown;
  raw: unknown;
}

export type EventHistoryListEntry = EventHistoryDocument | UnreadableEventHistory;

const documents = new Map<string, EventHistoryDocument>();
const unreadableDocuments = new Map<string, UnreadableEventHistory>();
let loaded = false;

export function isReadableEventHistory(entry: EventHistoryListEntry): entry is EventHistoryDocument {
  return !("readable" in entry) || entry.readable !== false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSettings(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.event_name === "string" &&
    HOST_EVENT_TYPES.includes(value.event_type as (typeof HOST_EVENT_TYPES)[number]) &&
    typeof value.host_plays === "boolean" &&
    PLAY_STYLES.includes(value.play_style as (typeof PLAY_STYLES)[number]) &&
    WIN_METRICS.includes(value.win_metric as (typeof WIN_METRICS)[number]) &&
    value.visibility === "PRIVATE" &&
    typeof value.join_code === "string";
}

function isHost(value: unknown): boolean {
  return isRecord(value) && typeof value.player_id === "string" && typeof value.display_name === "string" &&
    typeof value.connected === "boolean" && typeof value.plays === "boolean";
}

function isParticipant(value: unknown): boolean {
  return isRecord(value) && typeof value.player_id === "string" && typeof value.display_name === "string" &&
    ["CONNECTED", "DISCONNECTED", "LEFT", "KICKED"].includes(String(value.connection_state)) &&
    typeof value.ready === "boolean" && typeof value.pending_next === "boolean" &&
    (value.round_status === null || ["PENDING", "SUBMITTED", "SKIPPED", "ABSENT"].includes(String(value.round_status)));
}

function isChart(value: unknown): boolean {
  if (!isRecord(value) || typeof value.chart_key !== "string" || !isRecord(value.expected_key) || !isRecord(value.display)) return false;
  const expected = value.expected_key;
  return PLAY_STYLES.includes(expected.play_style as (typeof PLAY_STYLES)[number]) &&
    typeof expected.difficulty === "string" && typeof expected.title_search_key === "string" &&
    (expected.chart_id === undefined || expected.chart_id === null || isPositiveInteger(expected.chart_id)) &&
    typeof value.display.title === "string" &&
    (value.display.level === null || isNonNegativeInteger(value.display.level));
}

function isRoundResultEntry(value: unknown): boolean {
  return isRecord(value) && typeof value.player_id === "string" && typeof value.display_name === "string" &&
    ["SUBMITTED", "ABSENT"].includes(String(value.status)) && isFiniteNumber(value.metric_value) &&
    (value.absence_reason === null || HOST_EVENT_ABSENCE_REASONS.includes(value.absence_reason as (typeof HOST_EVENT_ABSENCE_REASONS)[number])) &&
    (value.rank === null || isPositiveInteger(value.rank)) &&
    (value.tournament_points === undefined || isNonNegativeInteger(value.tournament_points)) && isTimestamp(value.confirmed_at);
}

function isRound(value: unknown): boolean {
  return isRecord(value) && typeof value.round_id === "string" && isChart(value.chart) &&
    isStringArray(value.playing_player_ids) && isTimestamp(value.started_at) && isTimestamp(value.confirmed_at) &&
    isNullableTimestamp(value.invalidated_at) && isNonNegativeInteger(value.public_revision) &&
    Array.isArray(value.results) && value.results.every(isRoundResultEntry);
}

function isOverallResult(value: unknown): boolean {
  return isRecord(value) && typeof value.player_id === "string" && typeof value.display_name === "string" &&
    isNonNegativeInteger(value.total_points) && isPositiveInteger(value.rank);
}

function isKnownDocument(value: unknown): value is EventHistoryDocument {
  if (!isRecord(value) || value.schema_version !== HOST_EVENT_HISTORY_SCHEMA_VERSION ||
    typeof value.event_id !== "string" || typeof value.room_id !== "string" || !isSettings(value.settings) ||
    !isHost(value.host) || !Array.isArray(value.participants) || !value.participants.every(isParticipant) ||
    !isStringArray(value.fixed_roster_player_ids) ||
    !(value.scoring_size_n === null || isPositiveInteger(value.scoring_size_n)) ||
    !isNullableTimestamp(value.started_at) || !isNullableTimestamp(value.ended_at) ||
    !(value.end_reason === null || HOST_EVENT_END_REASONS.includes(value.end_reason as (typeof HOST_EVENT_END_REASONS)[number])) ||
    !Array.isArray(value.rounds) || !value.rounds.every(isRound) ||
    !(value.overall_results === undefined || (Array.isArray(value.overall_results) && value.overall_results.every(isOverallResult))) ||
    !isNonNegativeInteger(value.last_public_revision) || !isNonNegativeInteger(value.synced_round_count) ||
    value.synced_round_count !== value.rounds.length || typeof value.results_sync_complete !== "boolean" ||
    !isTimestamp(value.last_received_at) ||
    !["PARTIAL", "COMPLETE"].includes(String(value.completeness))) return false;

  if (value.completeness === "COMPLETE" && value.results_sync_complete === false) return false;
  return true;
}

function normalizeKnownDocument(value: EventHistoryDocument): EventHistoryDocument {
  return {
    ...value,
    fixed_roster_player_ids: [...value.fixed_roster_player_ids],
    completeness: value.completeness === "COMPLETE" && value.results_sync_complete ? "COMPLETE" : "PARTIAL",
  };
}

function load(): void {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    parsed.forEach((value, index) => {
      const eventId = typeof value === "object" && value !== null && typeof (value as { event_id?: unknown }).event_id === "string"
        ? (value as { event_id: string }).event_id
        : null;
      const schemaVersion = typeof value === "object" && value !== null ? (value as { schema_version?: unknown }).schema_version : undefined;
      if (schemaVersion === HOST_EVENT_HISTORY_SCHEMA_VERSION && eventId !== null && isKnownDocument(value)) {
        documents.set(eventId, normalizeKnownDocument(value));
      } else {
        const storageKey = `unreadable:${index}:${eventId ?? "unknown"}`;
        unreadableDocuments.set(storageKey, { readable: false, storage_key: storageKey, event_id: eventId, schema_version: schemaVersion, raw: value });
      }
    });
  } catch {
    // Invalid root JSON has no record boundary, so it cannot be recovered as an unreadable record.
  }
}

function storageValues(): unknown[] {
  return [...documents.values(), ...[...unreadableDocuments.values()].map((entry) => entry.raw)];
}

async function persist(document: EventHistoryDocument): Promise<void> {
  load();
  documents.set(document.event_id, document);
  const jsonText = JSON.stringify(document, null, 2);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storageValues()));
  if (isTauriRuntime()) await saveEventResultJson({ eventId: document.event_id, jsonText });
}

function upsertRounds(existing: EventRoundResult[], incoming: EventRoundResult[]): EventRoundResult[] {
  const byId = new Map(existing.map((round) => [round.round_id, round]));
  for (const round of incoming) {
    const previous = byId.get(round.round_id);
    if (!previous || round.public_revision >= previous.public_revision) byId.set(round.round_id, round);
  }
  return [...byId.values()].sort((a, b) => a.started_at.localeCompare(b.started_at));
}

function isAuthoritativeFinal(snapshot: EventRoomSnapshot): boolean {
  return snapshot.phase === "RESULT" && snapshot.ended_at !== null && snapshot.end_reason !== null;
}

function completeness(snapshot: EventRoomSnapshot, resultsSyncComplete: boolean): "PARTIAL" | "COMPLETE" {
  return isAuthoritativeFinal(snapshot) && resultsSyncComplete ? "COMPLETE" : "PARTIAL";
}

export const eventHistoryService = {
  async ingestSnapshot(snapshot: EventRoomSnapshot, sync?: { complete: boolean; publicRevision: number | null; resetResults?: boolean }): Promise<void> {
    if (snapshot.event_id === null) return;
    load();
    const previous = documents.get(snapshot.event_id);
    const previousRounds = sync?.resetResults ? [] : (previous?.rounds ?? []);
    const rounds = snapshot.latest_result ? upsertRounds(previousRounds, [snapshot.latest_result]) : previousRounds;
    const resultsSyncComplete = sync?.complete ?? previous?.results_sync_complete ?? false;
    await persist({
      schema_version: 1,
      event_id: snapshot.event_id,
      room_id: snapshot.room_id,
      settings: snapshot.settings,
      host: snapshot.host,
      participants: snapshot.participants,
      fixed_roster_player_ids: snapshot.fixed_roster_player_ids,
      scoring_size_n: snapshot.scoring_size_n,
      started_at: snapshot.started_at,
      ended_at: snapshot.ended_at,
      end_reason: snapshot.end_reason,
      rounds,
      ...(snapshot.overall_results
        ? { overall_results: snapshot.overall_results }
        : !sync?.resetResults && previous?.overall_results
          ? { overall_results: previous.overall_results }
          : {}),
      last_public_revision: Math.max(sync?.resetResults ? 0 : (previous?.last_public_revision ?? 0), sync?.publicRevision ?? 0),
      synced_round_count: rounds.length,
      results_sync_complete: resultsSyncComplete,
      last_received_at: new Date().toISOString(),
      completeness: completeness(snapshot, resultsSyncComplete),
    });
  },
  async ingestResults(snapshot: EventRoomSnapshot, rounds: EventRoundResult[], publicRevision: number, overall: EventOverallResultEntry[] | undefined, syncComplete: boolean): Promise<void> {
    if (snapshot.event_id === null) return;
    load();
    const previous = documents.get(snapshot.event_id);
    const mergedRounds = upsertRounds(previous?.rounds ?? [], rounds);
    await persist({
      schema_version: 1,
      event_id: snapshot.event_id,
      room_id: snapshot.room_id,
      settings: snapshot.settings,
      host: snapshot.host,
      participants: snapshot.participants,
      fixed_roster_player_ids: snapshot.fixed_roster_player_ids,
      scoring_size_n: snapshot.scoring_size_n,
      started_at: snapshot.started_at,
      ended_at: snapshot.ended_at,
      end_reason: snapshot.end_reason,
      rounds: mergedRounds,
      ...(overall ? { overall_results: overall } : previous?.overall_results ? { overall_results: previous.overall_results } : {}),
      last_public_revision: Math.max(previous?.last_public_revision ?? 0, publicRevision),
      synced_round_count: mergedRounds.length,
      results_sync_complete: syncComplete,
      last_received_at: new Date().toISOString(),
      completeness: completeness(snapshot, syncComplete),
    });
  },
  list(): EventHistoryListEntry[] {
    load();
    return [
      ...[...documents.values()].sort((a, b) => b.last_received_at.localeCompare(a.last_received_at)),
      ...unreadableDocuments.values(),
    ];
  },
  clearMemoryForTests(): void {
    documents.clear();
    unreadableDocuments.clear();
    loaded = false;
  },
};
