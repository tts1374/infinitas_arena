import {
  EVENT_MAX_PLAYERS,
  HOST_EVENT_DISCONNECT_GRACE_SECONDS,
  HOST_EVENT_MISSCOUNT_ABSENT_VALUE,
  HOST_EVENT_SCORE_ABSENT_VALUE,
  type EventChart,
  type EventOverallResultEntry,
  type EventParticipantRoundStatus,
  type EventRoomSettings,
  type EventRoomSnapshot,
  type EventRoundResult,
  type EventRoundResultEntry,
  type ExpectedKey,
  type HostEventAbsenceReason,
  type HostEventEndReason,
  type JsonObject,
  type MatchSongUnlockFilter,
  type SongUnlockSettings,
  type SourceType,
} from "@infinitas/shared";
import type { RoomChartMaster, SearchChartsOptions } from "../master/chart-master";

type EventConnectionState = "CONNECTED" | "DISCONNECTED" | "LEFT" | "KICKED";

interface EventParticipantRecord {
  player_id: string;
  display_name: string;
  connection_state: EventConnectionState;
  source: SourceType;
  song_unlocks: SongUnlockSettings;
  ready: boolean;
  pending_next: boolean;
}

interface EventPrivateSubmission {
  status: "SUBMITTED" | "ABSENT";
  metric_value: number;
  source_meta: JsonObject | null;
  absence_reason: HostEventAbsenceReason | null;
  confirmed_at: string;
}

interface EventRoundRecord {
  round_id: string;
  chart: EventChart;
  selection_revision: number;
  eligible_player_ids: string[];
  playing_player_ids: string[];
  started_at: string | null;
  confirmed_at: string | null;
  invalidated_at: string | null;
  public_revision: number | null;
  submissions: Record<string, EventPrivateSubmission>;
  public_result: EventRoundResult | null;
}

interface IdempotencyEntry {
  player_id: string;
  request_id: string;
  payload_fingerprint: string;
  applied_revision: number;
}

export interface EventRoomStatePersistenceRecord {
  schema_version: 1;
  room_kind: "HOST_EVENT";
  room_id: string;
  generation: number;
  event_id: string | null;
  // Canonical storage mapping: the conceptual record event_name is settings.event_name.
  settings: EventRoomSettings;
  phase: EventRoomSnapshot["phase"];
  round_phase: EventRoomSnapshot["round_phase"];
  revision: number;
  selection_revision: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  end_reason: HostEventEndReason | null;
  host_player_id: string;
  host_display_name: string;
  host_connected: boolean;
  host_ever_connected: boolean;
  host_initial_connect_deadline: string | null;
  host_disconnect_deadline: string | null;
  // Current-round ready_player_ids are derived from participants[].ready and are not duplicated.
  participants: EventParticipantRecord[];
  fixed_roster_player_ids: string[];
  scoring_size_n: number | null;
  current_round_id: string | null;
  rounds: EventRoundRecord[];
  idempotency: IdempotencyEntry[];
}

export interface EventRoomInitializationInput {
  room_id: string;
  generation?: number;
  created_at: string;
  host_player_id: string;
  host_display_name: string;
  settings: EventRoomSettings;
}

export interface EventParticipantJoinInput {
  player_id: string;
  display_name: string;
  source?: SourceType;
  song_unlocks?: SongUnlockSettings;
  accept_new: boolean;
  now: Date;
}

export interface EventStateResult {
  ok: boolean;
  reason?: string;
  changed?: boolean;
  round_finalized?: boolean;
}

export type EventIdempotencyResult =
  | { kind: "NEW" }
  | { kind: "DUPLICATE"; applied_revision: number }
  | { kind: "CONFLICT" };

const DEFAULT_UNLOCKS: SongUnlockSettings = {
  bit_unlocked: false,
  djp_unlocked: false,
  allow_leggendaria: false,
  owned_pack_ids: [],
};

function cloneUnlocks(value: SongUnlockSettings): SongUnlockSettings {
  return { ...value, owned_pack_ids: [...value.owned_pack_ids] };
}

function normalizedUnlocks(value: SongUnlockSettings | undefined): SongUnlockSettings {
  if (value === undefined) {
    return cloneUnlocks(DEFAULT_UNLOCKS);
  }
  return {
    bit_unlocked: value.bit_unlocked === true,
    djp_unlocked: value.djp_unlocked === true,
    allow_leggendaria: value.allow_leggendaria === true,
    owned_pack_ids: Array.from(new Set(value.owned_pack_ids.filter((id) => Number.isInteger(id) && id > 0))).sort(
      (left, right) => left - right,
    ),
  };
}

function unlockIntersection(players: EventParticipantRecord[]): MatchSongUnlockFilter {
  if (players.length === 0) {
    return { include_bit: false, include_djp: false, include_leggendaria: false, common_pack_ids: [] };
  }
  const common = new Set(players[0]?.song_unlocks.owned_pack_ids ?? []);
  for (const player of players.slice(1)) {
    const owned = new Set(player.song_unlocks.owned_pack_ids);
    for (const id of common) {
      if (!owned.has(id)) common.delete(id);
    }
  }
  return {
    include_bit: players.every((player) => player.song_unlocks.bit_unlocked),
    include_djp: players.every((player) => player.song_unlocks.djp_unlocked),
    include_leggendaria: players.every((player) => player.song_unlocks.allow_leggendaria),
    common_pack_ids: [...common].sort((left, right) => left - right),
  };
}

function sameExpectedKey(expected: ExpectedKey, observed: ExpectedKey, source: SourceType): boolean {
  if (
    expected.play_style !== observed.play_style ||
    expected.difficulty !== observed.difficulty ||
    expected.title_search_key !== observed.title_search_key
  ) return false;
  const expectedChartId = expected.chart_id;
  const observedChartId = observed.chart_id;
  if (expectedChartId != null && observedChartId != null) return expectedChartId === observedChartId;
  return !(source === "daken_counter_v3" && expectedChartId != null && observedChartId == null);
}

function cloneChart(chart: EventChart): EventChart {
  return { ...chart, expected_key: { ...chart.expected_key }, display: { ...chart.display } };
}

function clonePublicResult(result: EventRoundResult): EventRoundResult {
  return {
    ...result,
    chart: cloneChart(result.chart),
    playing_player_ids: [...result.playing_player_ids],
    results: result.results.map((entry) => ({ ...entry })),
  };
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValue(entry, seen))
    : Object.values(value as Record<string, unknown>).every((entry) => isJsonValue(entry, seen));
  seen.delete(value);
  return valid;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value, new Set());
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || validDate(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isUnique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isExpectedKey(value: unknown): value is ExpectedKey {
  if (!isRecord(value)) return false;
  return (
    (value.play_style === "SP" || value.play_style === "DP") &&
    typeof value.difficulty === "string" &&
    typeof value.title_search_key === "string" &&
    (value.chart_id === undefined || value.chart_id === null || Number.isInteger(value.chart_id))
  );
}

function isEventChart(value: unknown): value is EventChart {
  if (!isRecord(value) || !isRecord(value.display)) return false;
  return (
    typeof value.chart_key === "string" &&
    isExpectedKey(value.expected_key) &&
    typeof value.display.title === "string" &&
    (value.display.level === null || typeof value.display.level === "number")
  );
}

function isSettings(value: unknown): value is EventRoomSettings {
  if (!isRecord(value)) return false;
  return (
    typeof value.event_name === "string" &&
    (value.event_type === "CASUAL" || value.event_type === "TOURNAMENT") &&
    typeof value.host_plays === "boolean" &&
    (value.play_style === "SP" || value.play_style === "DP") &&
    (value.win_metric === "SCORE" || value.win_metric === "MISSCOUNT") &&
    value.visibility === "PRIVATE" &&
    typeof value.join_code === "string"
  );
}

function isParticipant(value: unknown): value is EventParticipantRecord {
  if (!isRecord(value) || !isRecord(value.song_unlocks)) return false;
  return (
    typeof value.player_id === "string" &&
    typeof value.display_name === "string" &&
    ["CONNECTED", "DISCONNECTED", "LEFT", "KICKED"].includes(String(value.connection_state)) &&
    ["inf_daken_counter", "inf-notebook", "daken_counter_v3", "reflux"].includes(String(value.source)) &&
    typeof value.song_unlocks.bit_unlocked === "boolean" &&
    typeof value.song_unlocks.djp_unlocked === "boolean" &&
    typeof value.song_unlocks.allow_leggendaria === "boolean" &&
    Array.isArray(value.song_unlocks.owned_pack_ids) &&
    value.song_unlocks.owned_pack_ids.every((id) => Number.isInteger(id) && (id as number) > 0) &&
    typeof value.ready === "boolean" &&
    typeof value.pending_next === "boolean"
  );
}

function isSubmission(value: unknown): value is EventPrivateSubmission {
  if (!isRecord(value)) return false;
  const validAbsenceReason = ["SKIP", "DEADLINE", "LEFT", "KICKED", "NOT_PRESENT"].includes(
    String(value.absence_reason),
  );
  return (
    (value.status === "SUBMITTED" || value.status === "ABSENT") &&
    typeof value.metric_value === "number" && Number.isFinite(value.metric_value) &&
    (value.source_meta === null || isJsonObject(value.source_meta)) &&
    ((value.status === "SUBMITTED" && value.absence_reason === null) ||
      (value.status === "ABSENT" && validAbsenceReason)) &&
    validDate(value.confirmed_at)
  );
}

function isPublicResult(value: unknown, roundId: string): value is EventRoundResult {
  if (!isRecord(value) || value.round_id !== roundId || !isEventChart(value.chart)) return false;
  if (!isStringArray(value.playing_player_ids) || !isUnique(value.playing_player_ids)) return false;
  if (!validDate(value.started_at) || !validDate(value.confirmed_at) || !isNullableDate(value.invalidated_at)) return false;
  if (!isNonNegativeInteger(value.public_revision) || !Array.isArray(value.results)) return false;
  return value.results.every((entry) => {
    if (!isRecord(entry)) return false;
    return (
      typeof entry.player_id === "string" &&
      typeof entry.display_name === "string" &&
      (entry.status === "SUBMITTED" || entry.status === "ABSENT") &&
      typeof entry.metric_value === "number" && Number.isFinite(entry.metric_value) &&
      (entry.absence_reason === null || ["SKIP", "DEADLINE", "LEFT", "KICKED", "NOT_PRESENT"].includes(String(entry.absence_reason))) &&
      (entry.rank === null || (Number.isInteger(entry.rank) && (entry.rank as number) > 0)) &&
      (entry.tournament_points === undefined || isNonNegativeInteger(entry.tournament_points)) &&
      validDate(entry.confirmed_at)
    );
  });
}

function isRound(value: unknown, participantIds: Set<string>): value is EventRoundRecord {
  if (!isRecord(value) || typeof value.round_id !== "string" || !isEventChart(value.chart)) return false;
  if (!isNonNegativeInteger(value.selection_revision)) return false;
  if (!isStringArray(value.eligible_player_ids) || !isUnique(value.eligible_player_ids)) return false;
  if (!isStringArray(value.playing_player_ids) || !isUnique(value.playing_player_ids)) return false;
  const playingPlayerIds = value.playing_player_ids;
  if (![...value.eligible_player_ids, ...playingPlayerIds].every((id) => participantIds.has(id))) return false;
  if (!isNullableDate(value.started_at) || !isNullableDate(value.confirmed_at) || !isNullableDate(value.invalidated_at)) return false;
  if (value.started_at === null && (value.confirmed_at !== null || value.invalidated_at !== null)) return false;
  if (value.public_revision !== null && !isNonNegativeInteger(value.public_revision)) return false;
  if (!isRecord(value.submissions)) return false;
  if (!Object.entries(value.submissions).every(([id, submission]) => playingPlayerIds.includes(id) && isSubmission(submission))) {
    return false;
  }
  if (value.public_result !== null && !isPublicResult(value.public_result, value.round_id)) return false;
  return (
    (value.public_result === null && value.public_revision === null) ||
    (value.public_result !== null && value.public_revision === value.public_result.public_revision)
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameChart(left: EventChart, right: EventChart): boolean {
  return left.chart_key === right.chart_key &&
    left.expected_key.play_style === right.expected_key.play_style &&
    left.expected_key.difficulty === right.expected_key.difficulty &&
    left.expected_key.title_search_key === right.expected_key.title_search_key &&
    (left.expected_key.chart_id ?? null) === (right.expected_key.chart_id ?? null) &&
    left.display.title === right.display.title && left.display.level === right.display.level;
}

function isPublicResultConsistent(
  round: EventRoundRecord,
  settings: EventRoomSettings,
  scoringSizeN: number | null,
): boolean {
  const result = round.public_result;
  if (result === null) return true;
  if (
    !sameChart(result.chart, round.chart) ||
    !sameStringArray(result.playing_player_ids, round.playing_player_ids) ||
    result.started_at !== round.started_at || result.confirmed_at !== round.confirmed_at ||
    result.invalidated_at !== round.invalidated_at || result.public_revision !== round.public_revision
  ) return false;

  // An active/incomplete round can be invalidated without publishing private submissions.
  if (result.results.length === 0) return round.invalidated_at !== null;
  if (result.results.length !== round.playing_player_ids.length) return false;
  const resultIds = result.results.map((entry) => entry.player_id);
  if (!isUnique(resultIds) || !resultIds.every((id) => round.playing_player_ids.includes(id))) return false;

  const submitted = round.playing_player_ids
    .map((id) => ({ id, submission: round.submissions[id] }))
    .filter((entry): entry is { id: string; submission: EventPrivateSubmission } => entry.submission !== undefined)
    .filter((entry) => entry.submission.status === "SUBMITTED")
    .sort((left, right) => {
      const diff = left.submission.metric_value - right.submission.metric_value;
      return settings.win_metric === "SCORE" ? -diff : diff;
    });
  if (Object.keys(round.submissions).length !== round.playing_player_ids.length) return false;
  const rankById = new Map<string, number>();
  let priorMetric: number | null = null;
  let priorRank = 0;
  submitted.forEach((entry, index) => {
    const rank = priorMetric !== null && entry.submission.metric_value === priorMetric ? priorRank : index + 1;
    rankById.set(entry.id, rank);
    priorMetric = entry.submission.metric_value;
    priorRank = rank;
  });
  const expectedOrder = [
    ...submitted.map((entry) => entry.id),
    ...round.playing_player_ids.filter((id) => round.submissions[id]?.status === "ABSENT"),
  ];
  if (!sameStringArray(resultIds, expectedOrder)) return false;
  return result.results.every((entry) => {
    const submission = round.submissions[entry.player_id];
    if (submission === undefined) return false;
    const expectedRank = submission.status === "SUBMITTED" ? (rankById.get(entry.player_id) ?? null) : null;
    if (
      entry.status !== submission.status || entry.metric_value !== submission.metric_value ||
      entry.absence_reason !== submission.absence_reason || entry.confirmed_at !== submission.confirmed_at ||
      entry.rank !== expectedRank
    ) return false;
    if (settings.event_type === "TOURNAMENT") {
      const expectedPoints = expectedRank === null ? 0 : Math.max(0, (scoringSizeN ?? 0) - expectedRank + 1);
      return entry.tournament_points === expectedPoints;
    }
    return entry.tournament_points === undefined;
  });
}

function isIdempotencyEntry(value: unknown): value is IdempotencyEntry {
  return isRecord(value) && typeof value.player_id === "string" && typeof value.request_id === "string" &&
    typeof value.payload_fingerprint === "string" && isNonNegativeInteger(value.applied_revision);
}

function isPersistenceRecord(value: unknown): value is EventRoomStatePersistenceRecord {
  if (!isRecord(value) || value.schema_version !== 1 || value.room_kind !== "HOST_EVENT") return false;
  if (
    typeof value.room_id !== "string" || !Number.isInteger(value.generation) || (value.generation as number) < 1 ||
    (value.event_id !== null && typeof value.event_id !== "string") || !isSettings(value.settings) ||
    !["LOBBY", "PICKING", "PLAYING", "RESULT", "CLOSED"].includes(String(value.phase)) ||
    (value.round_phase !== null && value.round_phase !== "ACTIVE" && value.round_phase !== "RESULT") ||
    !isNonNegativeInteger(value.revision) || !isNonNegativeInteger(value.selection_revision) ||
    !validDate(value.created_at) || !isNullableDate(value.started_at) || !isNullableDate(value.ended_at) ||
    (value.end_reason !== null && !["HOST_ENDED", "HOST_DISCONNECTED", "ROOM_STATE_LOST"].includes(String(value.end_reason))) ||
    typeof value.host_player_id !== "string" || typeof value.host_display_name !== "string" ||
    typeof value.host_connected !== "boolean" || typeof value.host_ever_connected !== "boolean" ||
    !isNullableDate(value.host_initial_connect_deadline) || !isNullableDate(value.host_disconnect_deadline) ||
    !Array.isArray(value.participants) || !value.participants.every(isParticipant) ||
    !isStringArray(value.fixed_roster_player_ids) || !Array.isArray(value.rounds) ||
    !Array.isArray(value.idempotency) || !value.idempotency.every(isIdempotencyEntry)
  ) return false;

  const participants = value.participants as EventParticipantRecord[];
  const participantIds = new Set(participants.map((participant) => participant.player_id));
  if (participantIds.size !== participants.length) return false;
  const activeCount = participants.filter((participant) =>
    participant.connection_state === "CONNECTED" || participant.connection_state === "DISCONNECTED").length;
  if (activeCount > EVENT_MAX_PLAYERS) return false;
  if (!isUnique(value.fixed_roster_player_ids) || !value.fixed_roster_player_ids.every((id) => participantIds.has(id))) return false;
  if (value.scoring_size_n !== null && (!Number.isInteger(value.scoring_size_n) || (value.scoring_size_n as number) < 1)) return false;

  const rounds = value.rounds as unknown[];
  if (!rounds.every((round) => isRound(round, participantIds))) return false;
  const typedRounds = rounds as EventRoundRecord[];
  const roundIds = new Set(typedRounds.map((round) => round.round_id));
  if (roundIds.size !== typedRounds.length) return false;
  if (value.current_round_id !== null && (typeof value.current_round_id !== "string" || !roundIds.has(value.current_round_id))) {
    return false;
  }

  const phase = value.phase;
  if ((phase === "LOBBY" || phase === "PICKING") && value.round_phase !== null) return false;
  if (phase === "PLAYING" && (value.current_round_id === null || value.round_phase === null)) return false;
  if ((phase === "RESULT" || phase === "CLOSED") && value.round_phase !== null) return false;
  if (phase === "LOBBY" && (value.current_round_id !== null || typedRounds.length !== 0)) return false;
  if (phase === "LOBBY" && value.event_id !== null) return false;
  if ((phase === "PICKING" || phase === "PLAYING") && value.event_id === null) return false;
  if ((value.event_id === null) !== (value.started_at === null)) return false;
  if ((value.ended_at === null) !== (value.end_reason === null)) return false;
  if ((phase === "RESULT" || phase === "CLOSED") !== (value.ended_at !== null)) return false;
  if (phase === "RESULT" && value.end_reason !== "HOST_ENDED" && value.end_reason !== "HOST_DISCONNECTED") return false;
  if (phase === "CLOSED" && value.end_reason !== "ROOM_STATE_LOST") return false;

  const currentRound = value.current_round_id === null
    ? null
    : typedRounds.find((round) => round.round_id === value.current_round_id) ?? null;
  if (phase === "PICKING" && currentRound !== null && currentRound.started_at !== null) return false;
  if (phase === "PICKING" && currentRound !== null && (
    currentRound.selection_revision !== value.selection_revision || currentRound.playing_player_ids.length !== 0 ||
    Object.keys(currentRound.submissions).length !== 0 || currentRound.public_result !== null
  )) return false;
  if (phase === "PLAYING") {
    if (currentRound === null || currentRound.started_at === null || currentRound.playing_player_ids.length === 0) return false;
    if (value.round_phase === "ACTIVE" && (
      currentRound.confirmed_at !== null || currentRound.invalidated_at !== null || currentRound.public_result !== null
    )) return false;
    if (value.round_phase === "RESULT" && (currentRound.confirmed_at === null || currentRound.public_result === null)) {
      return false;
    }
  }

  const isTerminal = value.ended_at !== null;
  const initialDeadline = value.host_initial_connect_deadline;
  const disconnectDeadline = value.host_disconnect_deadline;
  if (value.host_connected && !value.host_ever_connected) return false;
  if (isTerminal) {
    if (initialDeadline !== null || disconnectDeadline !== null) return false;
    if (value.end_reason === "HOST_DISCONNECTED" && value.host_connected) return false;
    if (value.end_reason === "HOST_ENDED" && !value.host_connected) return false;
  } else if (!value.host_ever_connected) {
    const expectedInitialDeadline = new Date(
      new Date(value.created_at).getTime() + HOST_EVENT_DISCONNECT_GRACE_SECONDS * 1_000,
    ).getTime();
    if (
      value.host_connected || phase !== "LOBBY" || value.event_id !== null ||
      initialDeadline === null || new Date(initialDeadline).getTime() !== expectedInitialDeadline ||
      disconnectDeadline !== null
    ) return false;
  } else if (value.host_connected) {
    if (initialDeadline !== null || disconnectDeadline !== null) return false;
  } else if (initialDeadline !== null || disconnectDeadline === null) {
    return false;
  } else if (new Date(disconnectDeadline).getTime() <= new Date(value.created_at).getTime()) {
    return false;
  }

  if (value.settings.event_type === "CASUAL") {
    if (value.fixed_roster_player_ids.length !== 0 || value.scoring_size_n !== null) return false;
  } else if (value.event_id === null) {
    if (value.fixed_roster_player_ids.length !== 0 || value.scoring_size_n !== null) return false;
  } else if (value.scoring_size_n !== value.fixed_roster_player_ids.length || value.fixed_roster_player_ids.length === 0) {
    return false;
  }

  const eventStartedAt = value.started_at === null ? null : new Date(value.started_at).getTime();
  const fixedRoster = new Set(value.fixed_roster_player_ids);
  for (const round of typedRounds) {
    if (round.public_revision !== null && round.public_revision > value.revision) return false;
    if ((round.confirmed_at === null) !== (round.public_result === null)) return false;
    if (round.started_at !== null) {
      const roundStartedAt = new Date(round.started_at).getTime();
      if (eventStartedAt === null || roundStartedAt < eventStartedAt) return false;
      if (round.confirmed_at !== null && new Date(round.confirmed_at).getTime() < roundStartedAt) return false;
    }
    if (
      round.invalidated_at !== null &&
      (round.confirmed_at === null || new Date(round.invalidated_at).getTime() < new Date(round.confirmed_at).getTime())
    ) return false;
    if (
      value.settings.event_type === "TOURNAMENT" &&
      ![...round.eligible_player_ids, ...round.playing_player_ids].every((id) => fixedRoster.has(id))
    ) return false;
    if (!isPublicResultConsistent(round, value.settings, value.scoring_size_n)) return false;
  }

  const hostParticipant = participants.find((participant) => participant.player_id === value.host_player_id);
  if (!value.settings.host_plays) {
    if (hostParticipant !== undefined) return false;
  } else if (!value.host_ever_connected) {
    if (hostParticipant !== undefined) return false;
  } else if (value.host_connected) {
    if (hostParticipant?.connection_state !== "CONNECTED") return false;
  } else if (hostParticipant?.connection_state !== "DISCONNECTED") {
    return false;
  }
  return true;
}

export class EventRoomState {
  private initialized = false;
  private roomId = "";
  private generation = 1;
  private eventId: string | null = null;
  private settings!: EventRoomSettings;
  private phase: EventRoomSnapshot["phase"] = "LOBBY";
  private roundPhase: EventRoomSnapshot["round_phase"] = null;
  private revision = 0;
  private selectionRevision = 0;
  private createdAt = "";
  private startedAt: string | null = null;
  private endedAt: string | null = null;
  private endReason: HostEventEndReason | null = null;
  private hostPlayerId = "";
  private hostDisplayName = "";
  private hostConnected = false;
  private hostEverConnected = false;
  private hostInitialConnectDeadline: string | null = null;
  private hostDisconnectDeadline: string | null = null;
  private readonly participants = new Map<string, EventParticipantRecord>();
  private fixedRosterPlayerIds: string[] = [];
  private scoringSizeN: number | null = null;
  private currentRoundId: string | null = null;
  private readonly rounds = new Map<string, EventRoundRecord>();
  private readonly idempotency = new Map<string, IdempotencyEntry>();

  constructor(private readonly chartMaster: RoomChartMaster) {}

  initialize(input: EventRoomInitializationInput): void {
    if (this.initialized) throw new Error("Event room is already initialized.");
    if (!validDate(input.created_at)) throw new Error("created_at must be a valid timestamp.");
    this.initialized = true;
    this.roomId = input.room_id;
    this.generation = input.generation ?? 1;
    this.createdAt = new Date(input.created_at).toISOString();
    this.hostPlayerId = input.host_player_id;
    this.hostDisplayName = input.host_display_name;
    this.settings = { ...input.settings };
    this.hostInitialConnectDeadline = new Date(
      new Date(this.createdAt).getTime() + HOST_EVENT_DISCONNECT_GRACE_SECONDS * 1_000,
    ).toISOString();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getRevision(): number {
    return this.revision;
  }

  getEventId(): string | null {
    return this.eventId;
  }

  getCurrentRoundId(): string | null {
    return this.currentRoundId;
  }

  getNextAlarmAt(): Date | null {
    const deadline = this.hostEverConnected ? this.hostDisconnectDeadline : this.hostInitialConnectDeadline;
    return deadline === null ? null : new Date(deadline);
  }

  checkIdempotency(playerId: string, requestId: string, payloadFingerprint: string): EventIdempotencyResult {
    const entry = this.idempotency.get(`${playerId}:${requestId}`);
    if (entry === undefined) return { kind: "NEW" };
    if (entry.payload_fingerprint !== payloadFingerprint) return { kind: "CONFLICT" };
    return { kind: "DUPLICATE", applied_revision: entry.applied_revision };
  }

  rememberIdempotency(playerId: string, requestId: string, payloadFingerprint: string): void {
    const key = `${playerId}:${requestId}`;
    const existing = this.idempotency.get(key);
    if (existing !== undefined) {
      if (existing.payload_fingerprint !== payloadFingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
      return;
    }
    this.idempotency.set(key, {
      player_id: playerId,
      request_id: requestId,
      payload_fingerprint: payloadFingerprint,
      applied_revision: this.revision,
    });
  }

  join(input: EventParticipantJoinInput): EventStateResult {
    this.assertInitialized();
    if (this.expireHostDeadline(input.now)) return { ok: false, reason: "HOST_DISCONNECTED" };
    if (this.phase === "CLOSED" || this.endedAt !== null) return { ok: false, reason: "EVENT_ENDED" };

    if (input.player_id === this.hostPlayerId) {
      if (this.settings.host_plays && input.source === undefined) return { ok: false, reason: "SOURCE_REQUIRED" };
      const existing = this.participants.get(input.player_id);
      if (
        this.settings.host_plays &&
        (existing === undefined || existing.connection_state === "LEFT") &&
        this.activeParticipantCount() >= EVENT_MAX_PLAYERS
      ) return { ok: false, reason: "ROOM_FULL" };
      this.hostDisplayName = input.display_name;
      this.hostConnected = true;
      this.hostEverConnected = true;
      this.hostInitialConnectDeadline = null;
      this.hostDisconnectDeadline = null;
      if (this.settings.host_plays) {
        if (existing === undefined) {
          this.participants.set(input.player_id, this.createParticipant(input));
        } else {
          this.reconnectParticipant(existing, input);
        }
      }
      const finalized = this.maybeFinalizeCurrentRound(input.now);
      this.touch();
      return { ok: true, changed: true, round_finalized: finalized };
    }

    const existing = this.participants.get(input.player_id);
    if (existing !== undefined) {
      if (existing.connection_state === "KICKED") return { ok: false, reason: "PLAYER_KICKED" };
      if (existing.connection_state === "LEFT" && this.activeParticipantCount() >= this.nonHostParticipantLimit()) {
        return { ok: false, reason: "ROOM_FULL" };
      }
      this.reconnectParticipant(existing, input);
      this.touchSelectionIfUnfrozen();
      this.touch();
      return { ok: true, changed: true };
    }
    if (!input.accept_new) return { ok: false, reason: "HOST_EVENT_ACCEPT_NEW_DISABLED" };
    if (this.settings.event_type === "TOURNAMENT" && this.eventId !== null) {
      return { ok: false, reason: "TOURNAMENT_ALREADY_STARTED" };
    }
    if (this.activeParticipantCount() >= this.nonHostParticipantLimit()) return { ok: false, reason: "ROOM_FULL" };
    if (input.source === undefined) return { ok: false, reason: "SOURCE_REQUIRED" };
    const participant = this.createParticipant(input);
    participant.pending_next = this.eventId !== null && this.currentRound() !== null;
    this.participants.set(input.player_id, participant);
    this.touchSelectionIfUnfrozen();
    this.touch();
    return { ok: true, changed: true };
  }

  disconnect(playerId: string, now: Date): EventStateResult {
    this.assertInitialized();
    if (playerId === this.hostPlayerId) {
      if (this.endedAt !== null || this.phase === "RESULT" || this.phase === "CLOSED") {
        return { ok: true, changed: false };
      }
      if (!this.hostConnected) return { ok: true, changed: false };
      this.hostConnected = false;
      if (this.hostDisconnectDeadline === null) {
        this.hostDisconnectDeadline = new Date(now.getTime() + HOST_EVENT_DISCONNECT_GRACE_SECONDS * 1_000).toISOString();
      }
      const participant = this.participants.get(playerId);
      if (participant !== undefined && participant.connection_state === "CONNECTED") {
        participant.connection_state = "DISCONNECTED";
      }
      this.touch();
      return { ok: true, changed: true };
    }
    const participant = this.participants.get(playerId);
    if (participant === undefined || participant.connection_state !== "CONNECTED") return { ok: true, changed: false };
    participant.connection_state = "DISCONNECTED";
    this.touch();
    return { ok: true, changed: true };
  }

  startEvent(playerId: string, eventId: string, now: Date): EventStateResult {
    const rejected = this.requireHostMutation(playerId, now);
    if (rejected) return rejected;
    if (this.phase !== "LOBBY" || this.eventId !== null) return { ok: false, reason: "INVALID_STATE" };
    const active = this.activeParticipants();
    if (active.length === 0) return { ok: false, reason: "START_REQUIRES_MIN_PLAYERS" };
    this.eventId = eventId;
    this.startedAt = now.toISOString();
    this.phase = "PICKING";
    if (this.settings.event_type === "TOURNAMENT") {
      this.fixedRosterPlayerIds = active.map((player) => player.player_id);
      this.scoringSizeN = this.fixedRosterPlayerIds.length;
    }
    this.touchSelection();
    this.touch();
    return { ok: true, changed: true };
  }

  confirmPick(playerId: string, chartKey: string, expectedSelectionRevision: number, roundId: string, now: Date): EventStateResult {
    const rejected = this.requireHostMutation(playerId, now);
    if (rejected) return rejected;
    if (this.phase !== "PICKING" || this.currentRound() !== null) return { ok: false, reason: "INVALID_STATE" };
    if (expectedSelectionRevision !== this.selectionRevision) return { ok: false, reason: "SELECTION_CHANGED" };
    const eligible = this.selectionParticipants();
    if (eligible.length === 0) return { ok: false, reason: "NO_ELIGIBLE_PLAYERS" };
    const resolved = this.chartMaster.resolvePickChartKey(
      chartKey,
      this.settings.play_style,
      "ANY",
      unlockIntersection(eligible),
    );
    if (resolved === null) return { ok: false, reason: "CHART_NOT_AVAILABLE_TO_ALL" };
    const round: EventRoundRecord = {
      round_id: roundId,
      chart: cloneChart(resolved),
      selection_revision: this.selectionRevision,
      eligible_player_ids: eligible.map((entry) => entry.player_id),
      playing_player_ids: [],
      started_at: null,
      confirmed_at: null,
      invalidated_at: null,
      public_revision: null,
      submissions: {},
      public_result: null,
    };
    this.rounds.set(roundId, round);
    this.currentRoundId = roundId;
    for (const participant of this.participants.values()) participant.ready = false;
    this.touchSelection();
    round.selection_revision = this.selectionRevision;
    this.touch();
    return { ok: true, changed: true };
  }

  cancelPick(playerId: string, roundId: string, expectedSelectionRevision: number, now: Date): EventStateResult {
    const rejected = this.requireHostMutation(playerId, now);
    if (rejected) return rejected;
    const round = this.currentRound();
    if (this.phase !== "PICKING" || round === null || round.started_at !== null) return { ok: false, reason: "INVALID_STATE" };
    if (round.round_id !== roundId || expectedSelectionRevision !== this.selectionRevision) {
      return { ok: false, reason: "SELECTION_CHANGED" };
    }
    this.rounds.delete(roundId);
    this.currentRoundId = null;
    for (const participant of this.participants.values()) participant.ready = false;
    this.touchSelection();
    this.touch();
    return { ok: true, changed: true };
  }

  setReady(playerId: string, roundId: string, expectedSelectionRevision: number, ready: boolean, now: Date): EventStateResult {
    if (this.expireHostDeadline(now)) return { ok: false, reason: "HOST_DISCONNECTED" };
    if (!this.hostConnected) return { ok: false, reason: "HOST_DISCONNECTED" };
    const round = this.currentRound();
    const participant = this.participants.get(playerId);
    if (
      this.phase !== "PICKING" ||
      round === null ||
      round.started_at !== null ||
      round.round_id !== roundId ||
      expectedSelectionRevision !== this.selectionRevision
    ) return { ok: false, reason: "INVALID_STATE" };
    if (participant === undefined || participant.connection_state !== "CONNECTED" || participant.pending_next) {
      return { ok: false, reason: "NOT_ELIGIBLE" };
    }
    if (!round.eligible_player_ids.includes(playerId)) return { ok: false, reason: "NOT_ELIGIBLE" };
    participant.ready = ready;
    this.touch();
    return { ok: true, changed: true };
  }

  startRound(playerId: string, roundId: string, expectedSelectionRevision: number, now: Date): EventStateResult {
    const rejected = this.requireHostMutation(playerId, now);
    if (rejected) return rejected;
    const round = this.currentRound();
    if (
      this.phase !== "PICKING" ||
      round === null ||
      round.started_at !== null ||
      round.round_id !== roundId ||
      expectedSelectionRevision !== this.selectionRevision
    ) return { ok: false, reason: "INVALID_STATE" };
    const expected = round.eligible_player_ids
      .map((id) => this.participants.get(id))
      .filter((participant): participant is EventParticipantRecord =>
        participant !== undefined && participant.connection_state !== "LEFT" && participant.connection_state !== "KICKED",
      );
    const ready = expected.filter((participant) => participant.ready);
    if (ready.length === 0) return { ok: false, reason: "START_REQUIRES_READY_PLAYER" };
    if (this.settings.event_type === "TOURNAMENT" && ready.length !== expected.length) {
      return { ok: false, reason: "TOURNAMENT_REQUIRES_ALL_READY" };
    }
    round.playing_player_ids =
      this.settings.event_type === "TOURNAMENT" ? [...this.fixedRosterPlayerIds] : ready.map((entry) => entry.player_id);
    round.started_at = now.toISOString();
    if (this.settings.event_type === "TOURNAMENT") {
      for (const id of round.playing_player_ids) {
        const participant = this.participants.get(id);
        if (participant === undefined || participant.connection_state === "LEFT" || participant.connection_state === "KICKED") {
          round.submissions[id] = this.absence("NOT_PRESENT", now);
        }
      }
    }
    this.phase = "PLAYING";
    this.roundPhase = "ACTIVE";
    this.touch();
    const finalized = this.maybeFinalizeCurrentRound(now);
    return { ok: true, changed: true, round_finalized: finalized };
  }

  submit(
    playerId: string,
    roundId: string,
    observedKey: ExpectedKey,
    metricValue: number,
    sourceMeta: JsonObject | null,
    now: Date,
  ): EventStateResult {
    if (this.expireHostDeadline(now)) return { ok: false, reason: "HOST_DISCONNECTED" };
    const round = this.currentRound();
    if (
      this.phase !== "PLAYING" || this.roundPhase !== "ACTIVE" || round === null || round.round_id !== roundId ||
      !round.playing_player_ids.includes(playerId)
    ) return { ok: false, reason: "INVALID_STATE" };
    const participant = this.participants.get(playerId);
    if (participant === undefined || participant.connection_state !== "CONNECTED") return { ok: false, reason: "NOT_ELIGIBLE" };
    if (round.submissions[playerId] !== undefined) return { ok: false, reason: "ROUND_ALREADY_CONFIRMED" };
    if (!sameExpectedKey(round.chart.expected_key, observedKey, participant.source)) {
      return { ok: false, reason: "RESULT_KEY_MISMATCH" };
    }
    if (!Number.isFinite(metricValue)) return { ok: false, reason: "INVALID_METRIC" };
    round.submissions[playerId] = {
      status: "SUBMITTED",
      metric_value: metricValue,
      source_meta: sourceMeta,
      absence_reason: null,
      confirmed_at: now.toISOString(),
    };
    this.touch();
    const finalized = this.maybeFinalizeCurrentRound(now);
    return { ok: true, changed: true, round_finalized: finalized };
  }

  skip(playerId: string, roundId: string, now: Date): EventStateResult {
    if (this.expireHostDeadline(now)) return { ok: false, reason: "HOST_DISCONNECTED" };
    if (!this.hostConnected) return { ok: false, reason: "HOST_DISCONNECTED" };
    return this.confirmAbsence(playerId, roundId, "SKIP", now);
  }

  closeRound(playerId: string, roundId: string, now: Date): EventStateResult {
    const rejected = this.requireHostMutation(playerId, now);
    if (rejected) return rejected;
    const round = this.currentRound();
    if (this.phase !== "PLAYING" || this.roundPhase !== "ACTIVE" || round?.round_id !== roundId) {
      return { ok: false, reason: "INVALID_STATE" };
    }
    for (const id of round.playing_player_ids) {
      if (round.submissions[id] === undefined) round.submissions[id] = this.absence("DEADLINE", now);
    }
    this.finalizeCurrentRound(now);
    return { ok: true, changed: true, round_finalized: true };
  }

  leave(playerId: string, now: Date): EventStateResult {
    if (this.expireHostDeadline(now)) return { ok: false, reason: "HOST_DISCONNECTED" };
    if (!this.hostConnected) return { ok: false, reason: "HOST_DISCONNECTED" };
    if (playerId === this.hostPlayerId) return { ok: false, reason: "HOST_MUST_END_EVENT" };
    const participant = this.participants.get(playerId);
    if (participant === undefined || participant.connection_state === "KICKED") return { ok: false, reason: "NOT_PARTICIPANT" };
    participant.connection_state = "LEFT";
    participant.ready = false;
    participant.pending_next = true;
    const round = this.currentRound();
    if (this.phase === "PLAYING" && this.roundPhase === "ACTIVE" && round?.playing_player_ids.includes(playerId)) {
      if (round.submissions[playerId] === undefined) round.submissions[playerId] = this.absence("LEFT", now);
    }
    this.touchSelectionIfUnfrozen();
    this.touch();
    const finalized = this.maybeFinalizeCurrentRound(now);
    return { ok: true, changed: true, round_finalized: finalized };
  }

  restoreDuplicateLeave(playerId: string): EventStateResult {
    if (playerId === this.hostPlayerId) return { ok: false, reason: "HOST_MUST_END_EVENT" };
    const participant = this.participants.get(playerId);
    if (participant === undefined || participant.connection_state === "KICKED") {
      return { ok: false, reason: "NOT_PARTICIPANT" };
    }
    if (participant.connection_state === "LEFT") return { ok: true, changed: false };

    // A matching idempotency record proves that LEAVE was already durably applied.
    // Re-impose only its membership effect after reconnect; do not advance/finalize a round.
    participant.connection_state = "LEFT";
    participant.ready = false;
    participant.pending_next = true;
    this.touchSelectionIfUnfrozen();
    this.touch();
    return { ok: true, changed: true };
  }

  kick(hostPlayerId: string, targetPlayerId: string, now: Date): EventStateResult {
    const rejected = this.requireHostMutation(hostPlayerId, now);
    if (rejected) return rejected;
    if (targetPlayerId === this.hostPlayerId) return { ok: false, reason: "HOST_CANNOT_KICK_SELF" };
    const participant = this.participants.get(targetPlayerId);
    if (participant === undefined || participant.connection_state === "KICKED") return { ok: false, reason: "NOT_PARTICIPANT" };
    participant.connection_state = "KICKED";
    participant.ready = false;
    participant.pending_next = true;
    const round = this.currentRound();
    if (this.phase === "PLAYING" && this.roundPhase === "ACTIVE" && round?.playing_player_ids.includes(targetPlayerId)) {
      if (round.submissions[targetPlayerId] === undefined) round.submissions[targetPlayerId] = this.absence("KICKED", now);
    }
    this.touchSelectionIfUnfrozen();
    this.touch();
    const finalized = this.maybeFinalizeCurrentRound(now);
    return { ok: true, changed: true, round_finalized: finalized };
  }

  nextPick(playerId: string, roundId: string, now: Date): EventStateResult {
    const rejected = this.requireHostMutation(playerId, now);
    if (rejected) return rejected;
    const round = this.currentRound();
    if (this.phase !== "PLAYING" || this.roundPhase !== "RESULT" || round?.round_id !== roundId) {
      return { ok: false, reason: "INVALID_STATE" };
    }
    this.phase = "PICKING";
    this.roundPhase = null;
    this.currentRoundId = null;
    for (const participant of this.participants.values()) {
      participant.ready = false;
      if (participant.connection_state === "CONNECTED" || participant.connection_state === "DISCONNECTED") {
        participant.pending_next = false;
      }
    }
    this.touchSelection();
    this.touch();
    return { ok: true, changed: true };
  }

  invalidateRound(playerId: string, targetRoundId: string, now: Date): EventStateResult {
    const rejected = this.requireHostMutation(playerId, now);
    if (rejected) return rejected;
    const target = this.rounds.get(targetRoundId);
    if (target === undefined || target.invalidated_at !== null || target.started_at === null) {
      return { ok: false, reason: "INVALID_ROUND" };
    }
    const startedRounds = [...this.rounds.values()].filter((round) => round.started_at !== null);
    if (startedRounds.at(-1)?.round_id !== targetRoundId) return { ok: false, reason: "ROUND_LOCKED" };
    target.invalidated_at = now.toISOString();
    target.confirmed_at ??= now.toISOString();
    this.touch();
    target.public_revision = this.revision;
    if (target.public_result !== null) {
      target.public_result = { ...target.public_result, invalidated_at: target.invalidated_at, public_revision: this.revision };
    } else {
      target.public_result = this.buildInvalidatedRoundMarker(target);
    }
    if (this.currentRoundId === targetRoundId) {
      this.currentRoundId = null;
      this.phase = "PICKING";
      this.roundPhase = null;
      for (const participant of this.participants.values()) participant.ready = false;
      this.touchSelection();
    }
    return { ok: true, changed: true };
  }

  endEvent(playerId: string, now: Date, confirmActive = false): EventStateResult {
    const rejected = this.requireHostMutation(playerId, now);
    if (rejected) return rejected;
    if (this.eventId === null && this.phase !== "LOBBY") return { ok: false, reason: "INVALID_STATE" };
    if (this.phase === "PLAYING" && this.roundPhase === "ACTIVE") {
      if (!confirmActive) return { ok: false, reason: "ACTIVE_END_REQUIRES_CONFIRMATION" };
      const current = this.currentRound();
      if (current !== null) {
        current.invalidated_at = now.toISOString();
        current.confirmed_at = now.toISOString();
        for (const id of current.playing_player_ids) {
          if (current.submissions[id] === undefined) current.submissions[id] = this.absence("DEADLINE", now);
        }
        this.touch();
        current.public_revision = this.revision;
        current.public_result = this.buildInvalidatedRoundMarker(current);
      }
    }
    this.finish("HOST_ENDED", now);
    return { ok: true, changed: true };
  }

  expireHostDeadline(now: Date): boolean {
    if (this.endedAt !== null) return false;
    const rawDeadline = this.hostEverConnected ? this.hostDisconnectDeadline : this.hostInitialConnectDeadline;
    if (rawDeadline === null || now.getTime() < new Date(rawDeadline).getTime()) return false;
    const current = this.currentRound();
    if (this.phase === "PLAYING" && this.roundPhase === "ACTIVE" && current !== null) {
      current.invalidated_at = now.toISOString();
      current.confirmed_at = now.toISOString();
      for (const id of current.playing_player_ids) {
        if (current.submissions[id] === undefined) current.submissions[id] = this.absence("DEADLINE", now);
      }
      this.touch();
      current.public_revision = this.revision;
      current.public_result = this.buildInvalidatedRoundMarker(current);
    }
    this.finish("HOST_DISCONNECTED", now);
    return true;
  }

  getPublicResults(): EventRoundResult[] {
    return [...this.rounds.values()]
      .filter((round): round is EventRoundRecord & { public_result: EventRoundResult } => round.public_result !== null)
      .map((round) => clonePublicResult(round.public_result));
  }

  searchCharts(options: SearchChartsOptions) {
    this.assertInitialized();
    if (this.phase !== "PICKING") throw new Error("CHART_SEARCH_UNAVAILABLE_IN_CURRENT_STATE");
    const eligible = this.selectionParticipants();
    return this.chartMaster.searchCharts({
      ...options,
      play_style: this.settings.play_style,
      unlock_filter: unlockIntersection(eligible),
    });
  }

  toSnapshot(): EventRoomSnapshot {
    this.assertInitialized();
    const current = this.currentRound();
    const latestResult = this.getPublicResults().at(-1) ?? null;
    const snapshot: EventRoomSnapshot = {
      schema_version: 1,
      room_kind: "HOST_EVENT",
      room_id: this.roomId,
      generation: this.generation,
      event_id: this.eventId,
      settings: { ...this.settings },
      phase: this.phase,
      round_phase: this.roundPhase,
      revision: this.revision,
      selection_revision: this.selectionRevision,
      host: {
        player_id: this.hostPlayerId,
        display_name: this.hostDisplayName,
        connected: this.hostConnected,
        plays: this.settings.host_plays,
      },
      participants: [...this.participants.values()].map((participant) => ({
        player_id: participant.player_id,
        display_name: participant.display_name,
        connection_state: participant.connection_state,
        ready: participant.ready,
        pending_next: participant.pending_next,
        round_status: this.publicRoundStatus(participant.player_id, current),
      })),
      fixed_roster_player_ids: [...this.fixedRosterPlayerIds],
      scoring_size_n: this.scoringSizeN,
      selected_chart: current === null ? null : cloneChart(current.chart),
      current_round_id: this.currentRoundId,
      current_playing_player_ids: current === null ? [] : [...current.playing_player_ids],
      host_disconnect_deadline: this.hostEverConnected ? this.hostDisconnectDeadline : this.hostInitialConnectDeadline,
      latest_result: latestResult,
      started_at: this.startedAt,
      ended_at: this.endedAt,
      end_reason: this.endReason,
    };
    if (this.settings.event_type === "TOURNAMENT") snapshot.overall_results = this.buildOverallResults();
    return snapshot;
  }

  toPersistenceRecord(): EventRoomStatePersistenceRecord {
    this.assertInitialized();
    return structuredClone({
      schema_version: 1,
      room_kind: "HOST_EVENT",
      room_id: this.roomId,
      generation: this.generation,
      event_id: this.eventId,
      settings: this.settings,
      phase: this.phase,
      round_phase: this.roundPhase,
      revision: this.revision,
      selection_revision: this.selectionRevision,
      created_at: this.createdAt,
      started_at: this.startedAt,
      ended_at: this.endedAt,
      end_reason: this.endReason,
      host_player_id: this.hostPlayerId,
      host_display_name: this.hostDisplayName,
      host_connected: this.hostConnected,
      host_ever_connected: this.hostEverConnected,
      host_initial_connect_deadline: this.hostInitialConnectDeadline,
      host_disconnect_deadline: this.hostDisconnectDeadline,
      participants: [...this.participants.values()],
      fixed_roster_player_ids: this.fixedRosterPlayerIds,
      scoring_size_n: this.scoringSizeN,
      current_round_id: this.currentRoundId,
      rounds: [...this.rounds.values()],
      idempotency: [...this.idempotency.values()],
    });
  }

  hydrate(record: unknown): void {
    if (!isPersistenceRecord(record)) {
      throw new Error("ROOM_STATE_LOST");
    }
    this.initialized = true;
    this.roomId = record.room_id;
    this.generation = record.generation;
    this.eventId = record.event_id;
    this.settings = structuredClone(record.settings);
    this.phase = record.phase;
    this.roundPhase = record.round_phase;
    this.revision = record.revision;
    this.selectionRevision = record.selection_revision;
    this.createdAt = record.created_at;
    this.startedAt = record.started_at;
    this.endedAt = record.ended_at;
    this.endReason = record.end_reason;
    this.hostPlayerId = record.host_player_id;
    this.hostDisplayName = record.host_display_name;
    this.hostConnected = record.host_connected;
    this.hostEverConnected = record.host_ever_connected;
    this.hostInitialConnectDeadline = record.host_initial_connect_deadline;
    this.hostDisconnectDeadline = record.host_disconnect_deadline;
    this.participants.clear();
    for (const participant of record.participants) this.participants.set(participant.player_id, structuredClone(participant));
    this.fixedRosterPlayerIds = [...record.fixed_roster_player_ids];
    this.scoringSizeN = record.scoring_size_n;
    this.currentRoundId = record.current_round_id;
    this.rounds.clear();
    for (const round of record.rounds) this.rounds.set(round.round_id, structuredClone(round));
    this.idempotency.clear();
    for (const entry of record.idempotency) this.idempotency.set(`${entry.player_id}:${entry.request_id}`, { ...entry });
  }

  private createParticipant(input: EventParticipantJoinInput): EventParticipantRecord {
    return {
      player_id: input.player_id,
      display_name: input.display_name,
      connection_state: "CONNECTED",
      source: input.source!,
      song_unlocks: normalizedUnlocks(input.song_unlocks),
      ready: false,
      pending_next: false,
    };
  }

  private reconnectParticipant(participant: EventParticipantRecord, input: EventParticipantJoinInput): void {
    const wasLeft = participant.connection_state === "LEFT";
    participant.display_name = input.display_name;
    participant.connection_state = "CONNECTED";
    if (input.source !== undefined) participant.source = input.source;
    if (input.song_unlocks !== undefined) participant.song_unlocks = normalizedUnlocks(input.song_unlocks);
    if (wasLeft) participant.pending_next = this.currentRound() !== null;
  }

  private requireHostMutation(playerId: string, now: Date): EventStateResult | null {
    if (this.expireHostDeadline(now)) return { ok: false, reason: "HOST_DISCONNECTED" };
    if (playerId !== this.hostPlayerId) return { ok: false, reason: "NOT_HOST" };
    if (!this.hostConnected) return { ok: false, reason: "HOST_DISCONNECTED" };
    if (this.endedAt !== null || this.phase === "CLOSED" || this.phase === "RESULT") return { ok: false, reason: "EVENT_ENDED" };
    return null;
  }

  private confirmAbsence(playerId: string, roundId: string, reason: HostEventAbsenceReason, now: Date): EventStateResult {
    const round = this.currentRound();
    if (
      this.phase !== "PLAYING" || this.roundPhase !== "ACTIVE" || round?.round_id !== roundId ||
      !round.playing_player_ids.includes(playerId)
    ) return { ok: false, reason: "INVALID_STATE" };
    if (round.submissions[playerId] !== undefined) return { ok: false, reason: "ROUND_ALREADY_CONFIRMED" };
    round.submissions[playerId] = this.absence(reason, now);
    this.touch();
    const finalized = this.maybeFinalizeCurrentRound(now);
    return { ok: true, changed: true, round_finalized: finalized };
  }

  private absence(reason: HostEventAbsenceReason, now: Date): EventPrivateSubmission {
    return {
      status: "ABSENT",
      metric_value:
        this.settings.win_metric === "SCORE" ? HOST_EVENT_SCORE_ABSENT_VALUE : HOST_EVENT_MISSCOUNT_ABSENT_VALUE,
      source_meta: null,
      absence_reason: reason,
      confirmed_at: now.toISOString(),
    };
  }

  private maybeFinalizeCurrentRound(now: Date): boolean {
    const round = this.currentRound();
    if (
      !this.hostConnected || this.phase !== "PLAYING" || this.roundPhase !== "ACTIVE" || round === null ||
      round.playing_player_ids.some((id) => round.submissions[id] === undefined)
    ) return false;
    this.finalizeCurrentRound(now);
    return true;
  }

  private finalizeCurrentRound(now: Date): void {
    const round = this.currentRound();
    if (round === null) throw new Error("No current event round.");
    round.confirmed_at = now.toISOString();
    this.touch();
    round.public_revision = this.revision;
    round.public_result = this.buildPublicRoundResult(round);
    this.roundPhase = "RESULT";
  }

  private buildPublicRoundResult(round: EventRoundRecord): EventRoundResult {
    const submitted = round.playing_player_ids
      .map((id) => ({ id, submission: round.submissions[id] }))
      .filter((entry): entry is { id: string; submission: EventPrivateSubmission } => entry.submission !== undefined)
      .filter((entry) => entry.submission.status === "SUBMITTED")
      .sort((left, right) => {
        const diff = left.submission.metric_value - right.submission.metric_value;
        return this.settings.win_metric === "SCORE" ? -diff : diff;
      });
    const rankById = new Map<string, number>();
    let priorMetric: number | null = null;
    let priorRank = 0;
    submitted.forEach((entry, index) => {
      const rank = priorMetric !== null && entry.submission.metric_value === priorMetric ? priorRank : index + 1;
      rankById.set(entry.id, rank);
      priorMetric = entry.submission.metric_value;
      priorRank = rank;
    });
    const results: EventRoundResultEntry[] = round.playing_player_ids.map((id) => {
      const participant = this.participants.get(id);
      const submission = round.submissions[id];
      if (submission === undefined) throw new Error("Cannot publish an incomplete event round.");
      const rank = submission.status === "SUBMITTED" ? (rankById.get(id) ?? null) : null;
      const entry: EventRoundResultEntry = {
        player_id: id,
        display_name: participant?.display_name ?? id,
        status: submission.status,
        metric_value: submission.metric_value,
        absence_reason: submission.absence_reason,
        rank,
        confirmed_at: submission.confirmed_at,
      };
      if (this.settings.event_type === "TOURNAMENT") {
        entry.tournament_points = rank === null ? 0 : Math.max(0, (this.scoringSizeN ?? 0) - rank + 1);
      }
      return entry;
    });
    results.sort((left, right) => {
      if (left.rank === null && right.rank === null) return 0;
      if (left.rank === null) return 1;
      if (right.rank === null) return -1;
      return left.rank - right.rank;
    });
    return {
      round_id: round.round_id,
      chart: cloneChart(round.chart),
      playing_player_ids: [...round.playing_player_ids],
      started_at: round.started_at!,
      confirmed_at: round.confirmed_at!,
      invalidated_at: round.invalidated_at,
      public_revision: round.public_revision!,
      results,
    };
  }

  private buildInvalidatedRoundMarker(round: EventRoundRecord): EventRoundResult {
    if (round.started_at === null || round.confirmed_at === null || round.invalidated_at === null || round.public_revision === null) {
      throw new Error("Invalidated round marker is missing metadata.");
    }
    return {
      round_id: round.round_id,
      chart: cloneChart(round.chart),
      playing_player_ids: [...round.playing_player_ids],
      started_at: round.started_at,
      confirmed_at: round.confirmed_at,
      invalidated_at: round.invalidated_at,
      public_revision: round.public_revision,
      results: [],
    };
  }

  private buildOverallResults(): EventOverallResultEntry[] {
    const totals = new Map(this.fixedRosterPlayerIds.map((id) => [id, 0]));
    let validRoundCount = 0;
    for (const round of this.rounds.values()) {
      if (round.public_result === null || round.invalidated_at !== null) continue;
      validRoundCount += 1;
      for (const result of round.public_result.results) {
        totals.set(result.player_id, (totals.get(result.player_id) ?? 0) + (result.tournament_points ?? 0));
      }
    }
    if (validRoundCount === 0) return [];
    const ordered = [...totals.entries()].sort((left, right) => right[1] - left[1]);
    let priorPoints: number | null = null;
    let priorRank = 0;
    return ordered.map(([id, points], index) => {
      const rank = priorPoints !== null && points === priorPoints ? priorRank : index + 1;
      priorPoints = points;
      priorRank = rank;
      return {
        player_id: id,
        display_name: this.participants.get(id)?.display_name ?? id,
        total_points: points,
        rank,
      };
    });
  }

  private publicRoundStatus(playerId: string, round: EventRoundRecord | null): EventParticipantRoundStatus | null {
    if (round === null || !round.playing_player_ids.includes(playerId)) return null;
    const submission = round.submissions[playerId];
    if (submission === undefined) return "PENDING";
    if (submission.status === "SUBMITTED") return "SUBMITTED";
    return submission.absence_reason === "SKIP" ? "SKIPPED" : "ABSENT";
  }

  private selectionParticipants(): EventParticipantRecord[] {
    if (this.settings.event_type === "TOURNAMENT" && this.eventId !== null) {
      return this.fixedRosterPlayerIds
        .map((id) => this.participants.get(id))
        .filter((participant): participant is EventParticipantRecord =>
          participant !== undefined && participant.connection_state !== "LEFT" && participant.connection_state !== "KICKED",
        );
    }
    return this.activeParticipants().filter((participant) => !participant.pending_next);
  }

  private activeParticipants(): EventParticipantRecord[] {
    return [...this.participants.values()].filter(
      (participant) => participant.connection_state === "CONNECTED" || participant.connection_state === "DISCONNECTED",
    );
  }

  private activeParticipantCount(): number {
    return this.activeParticipants().length;
  }

  private nonHostParticipantLimit(): number {
    const hostParticipant = this.participants.get(this.hostPlayerId);
    const hostOccupiesSlot = hostParticipant !== undefined &&
      (hostParticipant.connection_state === "CONNECTED" || hostParticipant.connection_state === "DISCONNECTED");
    return EVENT_MAX_PLAYERS - (this.settings.host_plays && !hostOccupiesSlot ? 1 : 0);
  }

  private currentRound(): EventRoundRecord | null {
    return this.currentRoundId === null ? null : (this.rounds.get(this.currentRoundId) ?? null);
  }

  private touchSelectionIfUnfrozen(): void {
    if (this.phase === "LOBBY" || (this.phase === "PICKING" && this.currentRound() === null)) this.touchSelection();
  }

  private touchSelection(): void {
    this.selectionRevision += 1;
  }

  private touch(): void {
    this.revision += 1;
  }

  private finish(reason: HostEventEndReason, now: Date): void {
    this.phase = reason === "ROOM_STATE_LOST" ? "CLOSED" : "RESULT";
    this.roundPhase = null;
    this.endedAt = now.toISOString();
    this.endReason = reason;
    this.hostDisconnectDeadline = null;
    this.hostInitialConnectDeadline = null;
    this.touch();
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new Error("ROOM_STATE_LOST");
  }
}
