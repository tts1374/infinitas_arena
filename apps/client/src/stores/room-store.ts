import {
  REJOIN_COOLDOWN_SECONDS,
  type CloseReason,
  type ClientMessagePayloadMap,
  type ClientMessageType,
  type ErrorCode,
  type ResultReadyPayload,
  type RoomStateSnapshot,
  type ServerMessage,
  type ServerMessagePayloadMap,
  type SkipReason,
  type SoundEffectKey,
  type SourceType,
} from "@infinitas/shared";
import { recreateRoom } from "../services/worker-api-client";
import { logE2EEvent } from "../services/e2e-observability";
import { RoomSocketClient, type SocketConnectionState } from "../services/ws-client";
import { getActiveParticipationMode } from "../services/participation-mode";
import { createExternalStore, useExternalStore } from "./create-store";

export type RoomConnectionStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "JOINING"
  | "CONNECTED"
  | "CLOSED"
  | "ERROR";

export interface RoomDialogState {
  title: string;
  description: string;
  blocking: boolean;
  code?: string;
}

export interface RoomStoreState {
  roomId: string | null;
  joinCode: string | null;
  connectionPlayerId: string | null;
  connectionStatus: RoomConnectionStatus;
  connectionDetail: string;
  snapshot: RoomStateSnapshot | null;
  resultReady: ResultReadyPayload | null;
  serverTimeOffsetMs: number | null;
  errorDialog: RoomDialogState | null;
  roundConfirmations: Record<number, Array<ServerMessagePayloadMap["PLAYER_ROUND_CONFIRMED"]>>;
  endedRoundIndices: number[];
  eventLog: string[];
  audioEvents: RoomAudioEvent[];
}

export interface RoomConnectionSettings {
  apiBaseUrl: string;
  playerId: string;
  displayName: string;
  source: SourceType;
  bitUnlockEnabled: boolean;
  djpUnlockEnabled: boolean;
  allowLeggendaria: boolean;
  ownedPackIds: number[];
}

interface RoomReconnectContext {
  connection: {
    roomId: string;
    joinCode: string | null;
  };
  settings: RoomConnectionSettings;
}

let activeClient: RoomSocketClient | null = null;
let activeMockScenarioId: string | null = null;
const requestIdsByKey = new Map<string, string>();
const DJ_NAME_PATTERN = /^[a-zA-Z0-9.\-*&!?#$]*$/;
const DJ_NAME_MAX_LENGTH = 6;
const RECONNECT_DELAY_MS = 1_200;
const RECONNECT_WINDOW_SECONDS = REJOIN_COOLDOWN_SECONDS;
const RECONNECT_MAX_ATTEMPTS = Math.ceil((RECONNECT_WINDOW_SECONDS * 1_000) / RECONNECT_DELAY_MS);
const ROOM_EXPIRED_MESSAGE = "部屋の有効期限が切れました。一覧に戻って再参加してください。";
const ROOM_STATE_CHANGED_MESSAGE = "部屋の状態が変わりました。一覧に戻ってください。";
const QUICK_CHAT_POST_MESSAGE_TYPE = "QUICK_CHAT_POST" as ClientMessageType;
let reconnectContext: RoomReconnectContext | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let reconnectDeadlineAtMs: number | null = null;
let lastSourceAvailability: boolean | null = null;

export interface MockRoomStoreState {
  scenarioId: string;
  roomId: string | null;
  joinCode: string | null;
  connectionStatus: RoomConnectionStatus;
  connectionDetail: string;
  snapshot: RoomStateSnapshot | null;
  resultReady: ResultReadyPayload | null;
  serverTimeOffsetMs?: number | null;
  errorDialog?: RoomDialogState | null;
  roundConfirmations: Record<number, Array<ServerMessagePayloadMap["PLAYER_ROUND_CONFIRMED"]>>;
  endedRoundIndices: number[];
  eventLog?: string[];
  audioEvents?: RoomAudioEvent[];
}

export interface RoomAudioEvent {
  kind: SoundEffectKey;
  eventId: string;
  scheduledAt: string;
  closeReason?: CloseReason | null;
}

const initialState: RoomStoreState = {
  roomId: null,
  joinCode: null,
  connectionPlayerId: null,
  connectionStatus: "DISCONNECTED",
  connectionDetail: "No active room.",
  snapshot: null,
  resultReady: null,
  serverTimeOffsetMs: null,
  errorDialog: null,
  roundConfirmations: {},
  endedRoundIndices: [],
  eventLog: [],
  audioEvents: [],
};

const internalStore = createExternalStore<RoomStoreState>(initialState);

function mapSocketState(state: SocketConnectionState): RoomConnectionStatus {
  switch (state) {
    case "CONNECTING":
      return "CONNECTING";
    case "JOINING":
      return "JOINING";
    case "CONNECTED":
      return "CONNECTED";
    case "DISCONNECTED":
    default:
      return "DISCONNECTED";
  }
}

function appendEventLog(message: string): void {
  internalStore.setState((state) => ({
    ...state,
    eventLog: [message, ...state.eventLog].slice(0, 12),
  }));
}

function clearRequestIds(): void {
  requestIdsByKey.clear();
  lastSourceAvailability = null;
}

function updateServerTimeOffset(serverTime: string, receivedAtMs: number): void {
  const serverTimeMs = Date.parse(serverTime);
  if (Number.isNaN(serverTimeMs)) {
    return;
  }

  internalStore.setState((state) => ({
    ...state,
    serverTimeOffsetMs: serverTimeMs - receivedAtMs,
  }));
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearReconnectContext(): void {
  clearReconnectTimer();
  reconnectAttempts = 0;
  reconnectDeadlineAtMs = null;
  reconnectContext = null;
}

function resetReconnectAttempts(): void {
  clearReconnectTimer();
  reconnectAttempts = 0;
  reconnectDeadlineAtMs = null;
}

function getReconnectRemainingSeconds(nowMs: number): number {
  if (reconnectDeadlineAtMs === null) {
    return RECONNECT_WINDOW_SECONDS;
  }

  return Math.max(0, Math.ceil((reconnectDeadlineAtMs - nowMs) / 1_000));
}

function formatReconnectDetail(attempt: number, remainingSeconds: number): string {
  return `再接続を試しています... 残り${remainingSeconds}s (${attempt}回目)`;
}

function markReconnectTimeout(): void {
  clearReconnectTimer();
  reconnectAttempts = 0;
  reconnectDeadlineAtMs = null;
  appendEventLog("Reconnect window expired.");
  internalStore.setState((state) => ({
    ...state,
    connectionStatus: "ERROR",
    connectionDetail: "ルームに接続できませんでした。",
  }));
  setErrorDialog(
    "ルームに接続できませんでした",
    "再接続時間を超過しました。再試行するか、一覧に戻ってください。",
    "RECONNECT_TIMEOUT",
    true,
  );
}

function canAutoReconnect(state: RoomStoreState): boolean {
  return (
    activeMockScenarioId === null &&
    reconnectContext !== null &&
    state.snapshot !== null &&
    state.snapshot.room_state !== "CLOSED" &&
    state.connectionStatus !== "CLOSED"
  );
}

function hasReconnectInFlight(state: RoomStoreState): boolean {
  return (
    reconnectContext !== null &&
    state.snapshot !== null &&
    state.snapshot.room_state !== "CLOSED" &&
    (reconnectDeadlineAtMs !== null ||
      reconnectTimer !== null ||
      reconnectAttempts > 0 ||
      state.connectionStatus === "CONNECTING" ||
      state.connectionStatus === "JOINING")
  );
}

function getOrCreateRequestId(key: string): string {
  const existing = requestIdsByKey.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const nextId = crypto.randomUUID();
  requestIdsByKey.set(key, nextId);
  return nextId;
}

function getCurrentGeneration(): number | null {
  const generation = internalStore.getState().snapshot?.generation;
  return typeof generation === "number" && Number.isInteger(generation) && generation > 0 ? generation : null;
}

function requireCurrentGeneration(): number | null {
  const generation = getCurrentGeneration();
  if (generation !== null) {
    return generation;
  }

  // Mock scenarios can omit generation in snapshots; actions are handled locally.
  if (activeMockScenarioId !== null) {
    return 1;
  }

  setErrorDialog("部屋の状態が変わりました", ROOM_STATE_CHANGED_MESSAGE, "ROOM_STATE_CHANGED", true);
  return null;
}

function pushAudioEvent(event: RoomAudioEvent): void {
  internalStore.setState((state) => ({
    ...state,
    audioEvents: [event, ...state.audioEvents].slice(0, 24),
  }));
}

function setErrorDialog(title: string, description: string, code?: string, blocking = false): void {
  const errorDialog: RoomDialogState =
    code === undefined
      ? {
          title,
          description,
          blocking,
        }
      : {
          title,
          description,
          blocking,
          code,
        };

  internalStore.setState((state) => ({
    ...state,
    errorDialog,
  }));
}

function upsertRoundConfirmation(payload: ServerMessagePayloadMap["PLAYER_ROUND_CONFIRMED"]): void {
  internalStore.setState((state) => {
    const currentEntries = state.roundConfirmations[payload.round_index] ?? [];
    const nextEntries = currentEntries.some((entry) => entry.player_id === payload.player_id)
      ? currentEntries.map((entry) => (entry.player_id === payload.player_id ? payload : entry))
      : [...currentEntries, payload];

    return {
      ...state,
      roundConfirmations: {
        ...state.roundConfirmations,
        [payload.round_index]: nextEntries,
      },
    };
  });
}

function markRoundEnded(roundIndex: number): void {
  internalStore.setState((state) => ({
    ...state,
    endedRoundIndices: state.endedRoundIndices.includes(roundIndex)
      ? state.endedRoundIndices
      : [...state.endedRoundIndices, roundIndex].sort((left, right) => left - right),
  }));
}

function buildSourceUnavailableDescription(detail: string, roomState: RoomStateSnapshot["room_state"]): string {
  if (roomState === "PLAYING") {
    return `${detail} Use TECH skip if this round cannot be auto-submitted.`;
  }

  return detail;
}

function buildRoomStateLostDescription(detail: string): string {
  return `${detail} The room has been closed locally. Review the latest saved snapshot for partial results.`;
}

function startMatchRejectMessage(reason: string): string {
  switch (reason) {
    case "START_REQUIRES_MIN_PLAYERS":
      return "At least two players are required.";
    case "NOT_ALL_PLAYERS_READY":
      return "All current players must be READY before the match starts.";
    case "PREVIOUS_MATCH_NOT_CLEARED":
      return "Previous match data is still being cleared.";
    case "BPL_REQUIRES_TWO_PLAYERS":
      return "BPL mode requires exactly two players.";
    case "AUTO_MATCH_ROOM_LOCKED":
      return "Auto-match rooms start automatically and cannot be started manually.";
    case "INVALID_STATE":
      return "Return to the lobby before starting a new match.";
    default:
      return reason;
  }
}

function roomClosedDialog(reason: CloseReason): {
  title: string;
  description: string;
} {
  switch (reason) {
    case "ALL_ROUNDS_COMPLETED":
      return {
        title: "対戦が終了しました",
        description: "全ラウンドが完了したため、ルームを終了しました。",
      };
    case "MATCH_TTL_EXPIRED":
      return {
        title: "ルームの有効期限が切れました",
        description: ROOM_EXPIRED_MESSAGE,
      };
    case "READY_CHECK_TTL_EXPIRED":
      return {
        title: "ルームの有効期限が切れました",
        description: ROOM_EXPIRED_MESSAGE,
      };
    case "HOST_DISCONNECTED":
      return {
        title: "ルームが終了しました",
        description: "ホストとの接続が切れたため、ルームを終了しました。",
      };
    case "HOST_ABORTED":
      return {
        title: "ルームが終了しました",
        description: "ホストが対戦を中断したため、ルームを終了しました。",
      };
    case "PICKING_ABORTED":
      return {
        title: "ルームが終了しました",
        description: "選曲フェーズが中断されたため、ルームを終了しました。",
      };
    case "FORCE_CLOSED":
      return {
        title: "ルームが終了しました",
        description: "ルームが強制的に終了されました。",
      };
    case "ROOM_STATE_LOST":
      return {
        title: "ルーム状態を復元できませんでした",
        description: "サーバ側の状態喪失によりルームを終了しました。保存済みの結果を確認してください。",
      };
    default:
      return {
        title: "ルームが終了しました",
        description: "ルームが終了しました。",
      };
  }
}

function joinRejectDialog(reason: string, hasSnapshot: boolean): {
  title: string;
  description: string;
  code?: string;
  blocking?: boolean;
} {
  const unsupportedVersionPrefix = "CLIENT_VERSION_UNSUPPORTED:";
  if (reason.startsWith(unsupportedVersionPrefix)) {
    const message = reason.slice(unsupportedVersionPrefix.length).trim();
    return {
      title: "アップデートが必要です",
      description:
        message.length > 0
          ? message
          : "このバージョンのクライアントはサポート対象外です。最新版へアップデートしてください。",
      code: "CLIENT_VERSION_UNSUPPORTED",
    };
  }

  switch (reason) {
    case "SOURCE_DEPRECATED":
      return {
        title: "参加できません",
        description: "旧打鍵カウンタ（inf_daken_counter）は非推奨のため使用できません。打鍵カウンタv3 / Reflux / リザルト手帳を選択してください。",
        code: reason,
      };
    case "ROOM_FULL":
      return {
        title: "参加できません",
        description: "部屋が満員でした",
      };
    case "INVALID_STATE":
      return {
        title: "参加できません",
        description: "対戦開始済みでした",
      };
    case "JOIN_CODE_INVALID":
      return {
        title: "参加できません",
        description: "合言葉が一致しませんでした",
      };
    case "ROOM_CLOSED":
      return {
        title: "参加できません",
        description: ROOM_EXPIRED_MESSAGE,
      };
    case "ROOM_STATE_LOST":
      if (!hasSnapshot) {
        return {
          title: "参加できません",
          description: ROOM_EXPIRED_MESSAGE,
        };
      }

      return {
        title: "Room state lost",
        description: buildRoomStateLostDescription("The room could not be recovered."),
        code: reason,
        blocking: true,
      };
    default:
      return {
        title: "Join rejected",
        description: reason,
      };
  }
}

function closeCurrentClient(sendLeaveMessage: boolean): void {
  const client = activeClient;
  activeClient = null;
  client?.disconnect(sendLeaveMessage);
}

function errorTitleFromCode(code: ErrorCode): string {
  switch (code) {
    case "ROOM_FULL":
      return "Room full";
    case "JOIN_CODE_INVALID":
      return "Join code invalid";
    case "NOT_HOST":
      return "Host only action";
    case "INVALID_STATE":
      return "Invalid state";
    case "START_REQUIRES_MIN_PLAYERS":
      return "Not enough players";
    case "RESULT_KEY_MISMATCH":
      return "Result key mismatch";
    case "ROUND_ALREADY_CONFIRMED":
      return "Round already confirmed";
    case "HOST_SKIP_LOCKED":
      return "Host skip locked";
    case "ROOM_STATE_LOST":
      return "Room state lost";
    case "SOURCE_UNAVAILABLE":
      return "Source unavailable";
    default:
      return "Room error";
  }
}

function formatEvent(message: ServerMessage): string | null {
  switch (message.type) {
    case "READY_STATUS_CHANGED": {
      const payload = message.payload as ServerMessagePayloadMap["READY_STATUS_CHANGED"];
      return `${payload.player_id} ready=${String(payload.ready)}.`;
    }
    case "PICK_ACCEPTED": {
      const payload = message.payload as ServerMessagePayloadMap["PICK_ACCEPTED"];
      return `${payload.player_id} picked ${payload.pick_chart_key}.`;
    }
    case "PICK_FROZEN": {
      const payload = message.payload as ServerMessagePayloadMap["PICK_FROZEN"];
      return `Frozen ${payload.frozen_rounds.length} rounds.`;
    }
    case "ROUND_BEGIN": {
      const payload = message.payload as ServerMessagePayloadMap["ROUND_BEGIN"];
      return `Round ${payload.round_index + 1} started.`;
    }
    case "PLAYER_ROUND_CONFIRMED": {
      const payload = message.payload as ServerMessagePayloadMap["PLAYER_ROUND_CONFIRMED"];
      return `${payload.player_id} confirmed ${payload.status}.`;
    }
    case "ROUND_ENDED": {
      const payload = message.payload as ServerMessagePayloadMap["ROUND_ENDED"];
      return `Round ${payload.round_index + 1} ended.`;
    }
    case "FORCE_ADVANCE_APPLIED": {
      const payload = message.payload as ServerMessagePayloadMap["FORCE_ADVANCE_APPLIED"];
      return `Force advance applied to ${payload.timed_out_players.length} player(s).`;
    }
    case "RESULT_READY":
      return "Result summary ready.";
    case "ROOM_CLOSED": {
      const payload = message.payload as ServerMessagePayloadMap["ROOM_CLOSED"];
      return `Room closed: ${payload.close_reason}.`;
    }
    case "ROOM_NOTIFICATION": {
      const payload = message.payload as ServerMessagePayloadMap["ROOM_NOTIFICATION"];
      return `Notification: ${payload.kind}.`;
    }
    default:
      return null;
  }
}

function updateClosedSnapshot(closeReason: CloseReason, closedAt: string, resultReady: boolean): void {
  internalStore.setState((state) => ({
    ...state,
    snapshot:
      state.snapshot === null
        ? null
        : {
            ...state.snapshot,
            room_state: "CLOSED",
            closed_at: closedAt,
            close_reason: closeReason,
            result_ready: resultReady,
          },
  }));
}

function startSocketConnection(
  connection: { roomId: string; joinCode: string | null },
  settings: RoomConnectionSettings,
  resetState: boolean,
): boolean {
  const displayNameError = validateDisplayName(settings.displayName);
  if (displayNameError !== null) {
    setErrorDialog("DJ NAME invalid", displayNameError);
    return false;
  }
  const trimmedDisplayName = settings.displayName.trim();

  closeCurrentClient(false);
  activeMockScenarioId = null;

  if (resetState) {
    clearRequestIds();
    internalStore.setState({
      ...initialState,
      roomId: connection.roomId,
      joinCode: connection.joinCode,
      connectionPlayerId: settings.playerId,
      connectionStatus: "CONNECTING",
      connectionDetail: `Opening room ${connection.roomId}.`,
    });
  } else {
    const remainingSeconds = getReconnectRemainingSeconds(Date.now());
    internalStore.setState((state) => ({
      ...state,
      roomId: connection.roomId,
      joinCode: connection.joinCode,
      connectionPlayerId: settings.playerId,
      connectionStatus: "CONNECTING",
      connectionDetail: formatReconnectDetail(Math.max(reconnectAttempts, 1), remainingSeconds),
    }));
  }

  const client = new RoomSocketClient({
    apiBaseUrl: settings.apiBaseUrl,
    roomId: connection.roomId,
    playerId: settings.playerId,
    displayName: trimmedDisplayName,
    source: settings.source,
    bitUnlockEnabled: settings.bitUnlockEnabled,
    djpUnlockEnabled: settings.djpUnlockEnabled,
    allowLeggendaria: settings.allowLeggendaria,
    ownedPackIds: settings.ownedPackIds,
    joinCode: connection.joinCode,
    getCurrentGeneration,
    onMessage(message) {
      handleServerMessage(client, message);
    },
    onStateChange(state, detail) {
      if (activeClient !== client) {
        return;
      }

      if (state === "CONNECTED") {
        const completedReconnectAttempt = reconnectAttempts;
        resetReconnectAttempts();
        void logE2EEvent("websocket_connected", {
          roomId: connection.roomId,
          detail,
        });
        if (completedReconnectAttempt > 0) {
          void logE2EEvent("reconnect_succeeded", {
            roomId: connection.roomId,
            attempt: completedReconnectAttempt,
          });
        }
      }

      internalStore.setState((currentState) => ({
        ...currentState,
        connectionStatus:
          currentState.connectionStatus === "CLOSED" ? currentState.connectionStatus : mapSocketState(state),
        connectionDetail: detail,
      }));
    },
    onError(error) {
      if (activeClient !== client) {
        return;
      }

      internalStore.setState((state) => ({
        ...state,
        connectionStatus: "ERROR",
        connectionDetail: error.message,
      }));
    },
    onClose(event) {
      if (activeClient !== client) {
        return;
      }

      activeClient = null;
      const stateBeforeClose = internalStore.getState();
      const shouldAutoReconnect = event.code !== 1000 && canAutoReconnect(stateBeforeClose);
      internalStore.setState((state) => ({
        ...state,
        connectionStatus:
          state.connectionStatus === "CLOSED"
            ? "CLOSED"
            : shouldAutoReconnect
              ? "DISCONNECTED"
              : event.code === 1000
                ? "DISCONNECTED"
                : "ERROR",
        connectionDetail:
          state.connectionStatus === "CLOSED"
            ? state.connectionDetail
            : event.reason || `Socket closed (${event.code}).`,
      }));

      if (shouldAutoReconnect) {
        scheduleReconnect();
      } else {
        resetReconnectAttempts();
      }
    },
  });

  activeClient = client;

  try {
    client.connect();
    return true;
  } catch (error) {
    activeClient = null;
    internalStore.setState((state) => ({
      ...state,
      connectionStatus: "ERROR",
      connectionDetail: error instanceof Error ? error.message : "Failed to connect.",
    }));
    if (resetState) {
      setErrorDialog("Connection failed", error instanceof Error ? error.message : "Failed to connect.");
    }
    return false;
  }
}

function scheduleReconnect(): void {
  const state = internalStore.getState();
  if (!canAutoReconnect(state)) {
    return;
  }

  const nowMs = Date.now();
  if (reconnectDeadlineAtMs === null) {
    reconnectDeadlineAtMs = nowMs + RECONNECT_WINDOW_SECONDS * 1_000;
  }

  const remainingMs = reconnectDeadlineAtMs - nowMs;
  if (remainingMs <= 0) {
    markReconnectTimeout();
    return;
  }

  if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
    markReconnectTimeout();
    return;
  }

  reconnectAttempts += 1;
  const attempt = reconnectAttempts;
  const remainingSeconds = getReconnectRemainingSeconds(nowMs);
  void logE2EEvent("reconnect_started", {
    roomId: reconnectContext?.connection.roomId ?? null,
    attempt,
    remainingSeconds,
    maxAttempts: RECONNECT_MAX_ATTEMPTS,
  });
  appendEventLog(`Connection lost. Reconnecting (${remainingSeconds}s left, attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS}).`);
  internalStore.setState((currentState) => ({
    ...currentState,
    connectionStatus: "CONNECTING",
    connectionDetail: formatReconnectDetail(attempt, remainingSeconds),
  }));

  clearReconnectTimer();
  const retryDelayMs = Math.min(RECONNECT_DELAY_MS, Math.max(100, remainingMs));
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    const context = reconnectContext;
    if (context === null || activeClient !== null) {
      return;
    }

    const connected = startSocketConnection(context.connection, context.settings, false);
    if (!connected) {
      scheduleReconnect();
    }
  }, retryDelayMs);
}

function handleServerMessage(client: RoomSocketClient, message: ServerMessage): void {
  if (activeClient !== client) {
    return;
  }
  updateServerTimeOffset(message.server_time, Date.now());
  void logE2EEvent("websocket_message_received", {
    messageType: message.type,
  });

  const eventMessage = formatEvent(message);
  if (eventMessage) {
    appendEventLog(eventMessage);
  }

  switch (message.type) {
    case "ROOM_JOIN_ACCEPTED":
    case "ROOM_UPDATED":
    case "STATE_SNAPSHOT": {
      const payload = message.payload as { room_state_snapshot: RoomStateSnapshot };
      const previousSnapshot = internalStore.getState().snapshot;
      const previousMatchId = previousSnapshot?.current_match_id ?? previousSnapshot?.room_id ?? null;
      const nextMatchId = payload.room_state_snapshot.current_match_id ?? payload.room_state_snapshot.room_id;
      const enteredFirstRoundPlaying =
        payload.room_state_snapshot.room_state === "PLAYING" &&
        payload.room_state_snapshot.current_round?.round_index === 0 &&
        (
          previousSnapshot === null ||
          previousSnapshot.room_id !== payload.room_state_snapshot.room_id ||
          previousSnapshot.room_state !== "PLAYING" ||
          previousSnapshot.current_round?.round_index !== 0 ||
          previousSnapshot.current_round?.round_started_at !== payload.room_state_snapshot.current_round.round_started_at
        );
      const startedNewMatchFromResult =
        previousSnapshot !== null &&
        previousSnapshot.room_id === payload.room_state_snapshot.room_id &&
        previousSnapshot.room_state === "RESULT" &&
        (payload.room_state_snapshot.room_state === "PICKING" || enteredFirstRoundPlaying);
      const startedNewMatchByMatchId =
        previousSnapshot !== null &&
        previousSnapshot.room_id === payload.room_state_snapshot.room_id &&
        previousMatchId !== null &&
        previousMatchId !== nextMatchId;
      const startedAutoMatchPicking =
        previousSnapshot !== null &&
        previousSnapshot.room_id === payload.room_state_snapshot.room_id &&
        previousSnapshot.room_state === "LOBBY" &&
        payload.room_state_snapshot.room_state === "PICKING" &&
        payload.room_state_snapshot.settings.auto_match === true;
      if (message.type === "ROOM_JOIN_ACCEPTED") {
        void logE2EEvent("room_join_succeeded", {
          roomId: payload.room_state_snapshot.room_id,
          playerCount: payload.room_state_snapshot.players.length,
        });
      }
      const shouldResetRoundHistory =
        startedNewMatchFromResult ||
        startedNewMatchByMatchId ||
        (
          payload.room_state_snapshot.room_state === "LOBBY" &&
          payload.room_state_snapshot.current_round === null &&
          payload.room_state_snapshot.picks.length === 0 &&
          payload.room_state_snapshot.frozen_rounds.length === 0 &&
          !payload.room_state_snapshot.result_ready
        );
      if (
        payload.room_state_snapshot.room_state === "CLOSED" &&
        previousSnapshot?.room_state !== "CLOSED"
      ) {
        appendEventLog(`Room closed: ${payload.room_state_snapshot.close_reason ?? "CLOSED"}.`);
      }
      if (startedAutoMatchPicking) {
        pushAudioEvent({
          kind: "round_intro",
          eventId: `auto_match_picking_start:${payload.room_state_snapshot.room_id}:${nextMatchId}:${payload.room_state_snapshot.generation ?? "na"}`,
          scheduledAt: new Date().toISOString(),
        });
      }

      // Authoritative snapshots mark the end of a request cycle, so stale request_ids
      // must not leak into later rounds or rematches.
      clearRequestIds();

      internalStore.setState((state) => ({
        ...state,
        snapshot: payload.room_state_snapshot,
        resultReady:
          payload.room_state_snapshot.result_ready && !shouldResetRoundHistory
            ? state.resultReady
            : null,
        roundConfirmations: shouldResetRoundHistory ? {} : state.roundConfirmations,
        endedRoundIndices: shouldResetRoundHistory ? [] : state.endedRoundIndices,
        roomId: payload.room_state_snapshot.room_id,
        connectionStatus: "CONNECTED",
        connectionDetail: `Connected to ${payload.room_state_snapshot.room_state}.`,
      }));
      if (previousSnapshot?.room_state !== payload.room_state_snapshot.room_state) {
        void logE2EEvent("state_changed", {
          roomId: payload.room_state_snapshot.room_id,
          previousState: previousSnapshot?.room_state ?? null,
          nextState: payload.room_state_snapshot.room_state,
        });
      }
      return;
    }
    case "ROOM_NOTIFICATION": {
      const payload = message.payload as ServerMessagePayloadMap["ROOM_NOTIFICATION"];
      pushAudioEvent({
        kind: payload.kind,
        eventId: payload.event_id,
        scheduledAt: payload.scheduled_at,
      });
      return;
    }
    case "ROOM_JOIN_REJECTED": {
      const payload = message.payload as ServerMessagePayloadMap["ROOM_JOIN_REJECTED"];
      const currentState = internalStore.getState();
      if (payload.reason === "PLAYER_ALREADY_CONNECTED" && canAutoReconnect(currentState)) {
        closeCurrentClient(false);
        appendEventLog("Join rejected: PLAYER_ALREADY_CONNECTED. Retrying...");
        scheduleReconnect();
        return;
      }

      const { snapshot } = currentState;
      const dialog = joinRejectDialog(payload.reason, snapshot !== null);
      clearReconnectContext();
      closeCurrentClient(false);
      internalStore.setState((state) => ({
        ...state,
        connectionStatus: dialog.blocking ? "CLOSED" : "ERROR",
        connectionDetail: dialog.description,
      }));
      setErrorDialog(dialog.title, dialog.description, dialog.code, dialog.blocking ?? false);
      return;
    }
    case "START_MATCH_REJECTED": {
      const payload = message.payload as ServerMessagePayloadMap["START_MATCH_REJECTED"];
      setErrorDialog("Start rejected", startMatchRejectMessage(payload.reason), payload.reason);
      return;
    }
    case "PLAYER_ROUND_CONFIRMED": {
      const payload = message.payload as ServerMessagePayloadMap["PLAYER_ROUND_CONFIRMED"];
      upsertRoundConfirmation(payload);
      return;
    }
    case "ROUND_ENDED": {
      const payload = message.payload as ServerMessagePayloadMap["ROUND_ENDED"];
      markRoundEnded(payload.round_index);
      return;
    }
    case "PICK_REJECTED": {
      const payload = message.payload as ServerMessagePayloadMap["PICK_REJECTED"];
      setErrorDialog("Pick rejected", payload.reason);
      return;
    }
    case "RESULT_READY": {
      const payload = message.payload as ResultReadyPayload;
      internalStore.setState((state) => ({
        ...state,
        resultReady: payload,
      }));
      void logE2EEvent("result_received", {
        roomId: internalStore.getState().roomId,
      });
      return;
    }
    case "ROOM_CLOSED": {
      const payload = message.payload as ServerMessagePayloadMap["ROOM_CLOSED"];
      const closedDialog = roomClosedDialog(payload.close_reason);
      const isExpiredCloseReason =
        payload.close_reason === "READY_CHECK_TTL_EXPIRED" ||
        payload.close_reason === "MATCH_TTL_EXPIRED";
      clearReconnectContext();
      clearRequestIds();
      updateClosedSnapshot(payload.close_reason, payload.closed_at, payload.result_ready);
      pushAudioEvent({
        kind: "cancel",
        eventId: payload.event_id,
        scheduledAt: payload.closed_at,
        closeReason: payload.close_reason,
      });
      internalStore.setState((state) => ({
        ...state,
        connectionStatus: "CLOSED",
        connectionDetail: closedDialog.description,
      }));
      if (payload.close_reason !== "ALL_ROUNDS_COMPLETED") {
        setErrorDialog(
          closedDialog.title,
          closedDialog.description,
          isExpiredCloseReason ? "ROOM_EXPIRED" : "ROOM_CLOSED",
          true,
        );
      }
      return;
    }
    case "ERROR": {
      const payload = message.payload as ServerMessagePayloadMap["ERROR"];
      pushAudioEvent({
        kind: "error",
        eventId: `error:${message.server_time}:${payload.code}`,
        scheduledAt: message.server_time,
      });
      const snapshot = internalStore.getState().snapshot;
      const isRoomStateChanged =
        payload.code === "INVALID_STATE" &&
        payload.message.trim() === ROOM_STATE_CHANGED_MESSAGE;
      const description =
        isRoomStateChanged
          ? ROOM_STATE_CHANGED_MESSAGE
          : payload.code === "ROOM_STATE_LOST"
          ? buildRoomStateLostDescription(payload.message)
          : payload.code === "SOURCE_UNAVAILABLE" && snapshot !== null
            ? buildSourceUnavailableDescription(payload.message, snapshot.room_state)
            : payload.message;

      if (payload.code === "ROOM_STATE_LOST" || isRoomStateChanged) {
        clearReconnectContext();
        closeCurrentClient(false);
        if (payload.code === "ROOM_STATE_LOST") {
          updateClosedSnapshot("FORCE_CLOSED", message.server_time, internalStore.getState().resultReady !== null);
          appendEventLog("Room state lost. Showing the latest local snapshot.");
        } else {
          appendEventLog("Room generation changed. Return to lobby.");
        }
      }

      internalStore.setState((state) => ({
        ...state,
        connectionStatus:
          payload.code === "ROOM_STATE_LOST"
            ? "CLOSED"
            : isRoomStateChanged
              ? "ERROR"
              : state.connectionStatus,
        connectionDetail:
          payload.code === "ROOM_STATE_LOST"
            ? "Room state lost."
            : isRoomStateChanged
              ? ROOM_STATE_CHANGED_MESSAGE
              : state.connectionDetail,
      }));
      setErrorDialog(
        isRoomStateChanged ? "部屋の状態が変わりました" : errorTitleFromCode(payload.code),
        description,
        isRoomStateChanged ? "ROOM_STATE_CHANGED" : payload.code,
        payload.code === "ROOM_STATE_LOST" || payload.code === "SOURCE_UNAVAILABLE" || isRoomStateChanged,
      );
      return;
    }
    default:
      return;
  }
}

export const roomStore = {
  ...internalStore,
  hydrateMockScenario(input: MockRoomStoreState): void {
    clearReconnectContext();
    closeCurrentClient(false);
    clearRequestIds();
    activeMockScenarioId = input.scenarioId;
    internalStore.setState({
      ...initialState,
      roomId: input.roomId,
      joinCode: input.joinCode,
      connectionStatus: input.connectionStatus,
      connectionDetail: input.connectionDetail,
      snapshot: input.snapshot,
      resultReady: input.resultReady,
      serverTimeOffsetMs: input.serverTimeOffsetMs ?? null,
      errorDialog: input.errorDialog ?? null,
      roundConfirmations: input.roundConfirmations,
      endedRoundIndices: input.endedRoundIndices,
      eventLog: input.eventLog ?? [`Mock scenario: ${input.scenarioId}`],
      audioEvents: input.audioEvents ?? [],
    });
  },
  connect(
    connection: { roomId: string; joinCode?: string | null },
    settings: RoomConnectionSettings,
  ): boolean {
    if (getActiveParticipationMode() === "HOST_EVENT") {
      setErrorDialog("開催に参加中", "開催から退出してから通常対戦へ参加してください。", "PARTICIPATION_CONFLICT");
      return false;
    }
    if (settings.source === "inf_daken_counter") {
      setErrorDialog(
        "Source deprecated",
        "旧打鍵カウンタ（inf_daken_counter）は非推奨のため入室できません。打鍵カウンタv3 / Reflux / リザルト手帳を選択してください。",
        "SOURCE_DEPRECATED",
      );
      return false;
    }

    const normalizedJoinCode = connection.joinCode?.trim() || null;
    reconnectContext = {
      connection: {
        roomId: connection.roomId,
        joinCode: normalizedJoinCode,
      },
      settings: {
        ...settings,
        displayName: settings.displayName.trim(),
      },
    };
    resetReconnectAttempts();
    void logE2EEvent("room_join_requested", {
      roomId: connection.roomId,
      hasJoinCode: normalizedJoinCode !== null,
      source: settings.source,
    });

    return startSocketConnection(
      {
        roomId: connection.roomId,
        joinCode: normalizedJoinCode,
      },
      settings,
      true,
    );
  },
  leaveRoom(): void {
    clearReconnectContext();
    closeCurrentClient(true);
    clearRequestIds();
    activeMockScenarioId = null;
    internalStore.setState(initialState);
  },
  async recreateClosedRoom(settings: RoomConnectionSettings): Promise<boolean> {
    const state = internalStore.getState();
    const snapshot = state.snapshot;
    const hostPlayerId = state.connectionPlayerId;
    if (
      snapshot === null ||
      snapshot.room_state !== "CLOSED" ||
      hostPlayerId === null ||
      snapshot.host_player_id !== hostPlayerId
    ) {
      setErrorDialog("再作成できません", ROOM_STATE_CHANGED_MESSAGE, "ROOM_STATE_CHANGED", true);
      return false;
    }

    try {
      const response = await recreateRoom(settings.apiBaseUrl, {
        room_id: snapshot.room_id,
        host_player_id: hostPlayerId,
      });

      clearReconnectContext();
      closeCurrentClient(false);
      clearRequestIds();
      activeMockScenarioId = null;
      internalStore.setState((currentState) => ({
        ...currentState,
        errorDialog: null,
      }));

      return this.connect(
        {
          roomId: response.room_id,
          joinCode: response.settings.visibility === "PRIVATE" ? response.settings.join_code : null,
        },
        settings,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "同じ ROOM ID での再作成に失敗しました。";
      setErrorDialog("再作成に失敗しました", message);
      return false;
    }
  },
  clearError(): void {
    internalStore.setState((state) => ({
      ...state,
      errorDialog: null,
    }));
  },
  retryReconnect(): boolean {
    const state = internalStore.getState();
    if (!canAutoReconnect(state) || activeClient !== null) {
      return false;
    }

    internalStore.setState((currentState) => ({
      ...currentState,
      errorDialog: null,
    }));
    reconnectAttempts = 0;
    reconnectDeadlineAtMs = null;
    scheduleReconnect();
    return true;
  },
  noteLocalEvent(message: string): void {
    if (internalStore.getState().snapshot === null) {
      return;
    }

    appendEventLog(message);
  },
  sendHeartbeatPing(): boolean {
    if (activeMockScenarioId !== null || activeClient === null) {
      return false;
    }

    try {
      activeClient.send("PING", {});
      return true;
    } catch {
      return false;
    }
  },
  reportSourceUnavailable(detail: string): void {
    const state = internalStore.getState();
    if (state.snapshot === null || state.snapshot.room_state === "CLOSED") {
      return;
    }

    const description = buildSourceUnavailableDescription(detail, state.snapshot.room_state);
    if (
      state.errorDialog?.code === "SOURCE_UNAVAILABLE" &&
      state.errorDialog.description === description
    ) {
      return;
    }

    appendEventLog(`Source unavailable: ${detail}`);
    setErrorDialog(
      "Source unavailable",
      description,
      "SOURCE_UNAVAILABLE",
      state.snapshot.room_state === "PLAYING",
    );
  },
  send<TType extends ClientMessageType>(
    type: TType,
    payload: ClientMessagePayloadMap[TType],
  ): boolean {
    if (type === "READY_SET") {
      const readyPayload = payload as ClientMessagePayloadMap["READY_SET"];
      void logE2EEvent("ready_set_sent", {
        ready: readyPayload.ready,
      });
    }

    if (activeMockScenarioId !== null) {
      appendEventLog(`[mock] ${type}`);
      return true;
    }

    if (activeClient === null) {
      const state = internalStore.getState();
      if (hasReconnectInFlight(state)) {
        return false;
      }

      setErrorDialog("No active room", "Join a room before sending room actions.");
      pushAudioEvent({
        kind: "error",
        eventId: `error:local:${Date.now()}:no-active-room`,
        scheduledAt: new Date().toISOString(),
      });
      return false;
    }

    try {
      activeClient.send(type, payload);
      return true;
    } catch (error) {
      setErrorDialog("Send failed", error instanceof Error ? error.message : "Failed to send message.");
      pushAudioEvent({
        kind: "error",
        eventId: `error:local:${Date.now()}:send-failed`,
        scheduledAt: new Date().toISOString(),
      });
      return false;
    }
  },
  setReady(ready: boolean): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (
      snapshot === null ||
      snapshot.room_state !== "LOBBY" ||
      snapshot.settings.auto_match === true
    ) {
      return false;
    }

    const generation = requireCurrentGeneration();
    if (generation === null) {
      return false;
    }

    return this.send("READY_SET", {
      ready,
      generation,
    });
  },
  startMatch(): boolean {
    const generation = requireCurrentGeneration();
    if (generation === null) {
      return false;
    }

    return this.send("START_MATCH", {
      request_id: getOrCreateRequestId("START_MATCH"),
      generation,
    });
  },
  returnToLobby(): boolean {
    const generation = requireCurrentGeneration();
    if (generation === null) {
      return false;
    }

    return this.send("RETURN_TO_LOBBY", {
      request_id: getOrCreateRequestId("RETURN_TO_LOBBY"),
      generation,
    });
  },
  stopAutoRematch(): boolean {
    return this.send("AUTO_REMATCH_STOP", {
      request_id: getOrCreateRequestId("AUTO_REMATCH_STOP"),
    });
  },
  optOutNextMatch(): boolean {
    return this.send("AUTO_REMATCH_OPT_OUT", {
      request_id: getOrCreateRequestId("AUTO_REMATCH_OPT_OUT"),
    });
  },
  setSourceAvailability(available: boolean): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (snapshot === null || snapshot.room_state === "CLOSED") {
      lastSourceAvailability = null;
      return false;
    }

    if (lastSourceAvailability === available) {
      return false;
    }

    const sent = this.send("SOURCE_STATUS_SET", {
      request_id: `SOURCE_STATUS_SET:${available ? "1" : "0"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      available,
    });
    if (sent) {
      lastSourceAvailability = available;
    }
    return sent;
  },
  submitPick(pickChartKey: string): boolean {
    return this.send("PICK_SUBMIT", {
      request_id: getOrCreateRequestId(`PICK_SUBMIT:${pickChartKey}`),
      pick_chart_key: pickChartKey,
    });
  },
  sendQuickChat(input: { phraseIds: string[]; message: string }): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (
      snapshot === null ||
      (snapshot.room_state !== "LOBBY" && snapshot.room_state !== "PICKING")
    ) {
      return false;
    }

    const requestId = `QUICK_CHAT_POST:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    return this.send(QUICK_CHAT_POST_MESSAGE_TYPE, {
      request_id: requestId,
      phrase_ids: input.phraseIds,
    } as ClientMessagePayloadMap[ClientMessageType]);
  },
  submitResult(input: {
    round_index: number;
    observed_key: ClientMessagePayloadMap["RESULT_SUBMIT"]["observed_key"];
    metric_value: number;
    source_meta?: ClientMessagePayloadMap["RESULT_SUBMIT"]["source_meta"];
  }): boolean {
    const generation = requireCurrentGeneration();
    if (generation === null) {
      return false;
    }

    const requestKey =
      `RESULT_SUBMIT:${input.round_index}:${input.metric_value}:` +
      `${input.observed_key.play_style}:${input.observed_key.difficulty}:${input.observed_key.title_search_key}`;
    return this.send("RESULT_SUBMIT", {
      request_id: getOrCreateRequestId(requestKey),
      generation,
      round_index: input.round_index,
      observed_key: input.observed_key,
      metric_value: input.metric_value,
      ...(input.source_meta === undefined ? {} : { source_meta: input.source_meta }),
    });
  },
  skipSelf(roundIndex: number, reason: SkipReason): boolean {
    return this.send("SKIP_SELF", {
      request_id: getOrCreateRequestId(`SKIP_SELF:${roundIndex}:${reason}`),
      round_index: roundIndex,
      reason,
    });
  },
  skipHostAssign(roundIndex: number, targetPlayerId: string, reason: SkipReason): boolean {
    return this.send("SKIP_HOST_ASSIGN", {
      request_id: getOrCreateRequestId(`SKIP_HOST_ASSIGN:${roundIndex}:${targetPlayerId}:${reason}`),
      round_index: roundIndex,
      target_player_id: targetPlayerId,
      reason,
    });
  },
  forceAdvance(roundIndex: number): boolean {
    return this.send("FORCE_ADVANCE", {
      request_id: getOrCreateRequestId(`FORCE_ADVANCE:${roundIndex}`),
    });
  },
};

export function useRoomStore<TSelected>(selector: (state: RoomStoreState) => TSelected): TSelected {
  return useExternalStore(internalStore, selector);
}

function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "DJ NAME は必須です。";
  }

  if (Array.from(trimmed).length > DJ_NAME_MAX_LENGTH) {
    return "DJ NAME は6文字以内で入力してください。";
  }

  if (!DJ_NAME_PATTERN.test(trimmed)) {
    return "使用可能文字はa-z A-Z 0-9 .- *&!?#$です";
  }

  return null;
}
