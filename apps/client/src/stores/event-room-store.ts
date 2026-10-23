import {
  type EventRoomAction,
  type EventRoomSnapshot,
  type EventRoundResult,
  type ExpectedKey,
  type JsonObject,
  type ServerMessage,
  type ServerMessagePayloadMap,
  type SongUnlockSettings,
  type SourceType,
} from "@infinitas/shared";
import { EventSocketClient, type EventSocketState } from "../services/event-ws-client";
import { buildEventKickAction, buildEventLeaveAction, canDispatchEventAction, releaseEventMutation, shouldDispatchQueuedEventLeave, trackEventMutation } from "../services/event-action-policy";
import { eventHistoryService } from "../services/event-history";
import { eventNotebookReplayGuard, type EventNotebookObservationToken } from "../services/event-notebook-replay";
import { applyEventResultsPage, createEventResultsSyncState } from "../services/event-results-sync";
import { activateParticipationMode, clearParticipationMode } from "../services/participation-mode";
import { roomStore } from "./room-store";
import { createExternalStore, useExternalStore } from "./create-store";

export interface EventRoomStoreState {
  connectionStatus: EventSocketState | "IDLE" | "ERROR";
  connectionDetail: string;
  roomId: string | null;
  playerId: string | null;
  sessionRole: "HOST" | "PLAYER" | null;
  snapshot: EventRoomSnapshot | null;
  resultRounds: EventRoundResult[];
  resultsPublicRevision: number | null;
  resultsNextCursor: string | null;
  resultsSyncComplete: boolean;
  pendingMutationRequestIds: string[];
  leavePending: boolean;
  sourceUnavailableMessage: string | null;
  errorMessage: string | null;
}

export interface EventRoomConnection {
  apiBaseUrl: string;
  roomId: string;
  playerId: string;
  displayName: string;
  joinCode: string;
  source?: SourceType;
  songUnlocks?: SongUnlockSettings;
}

const initialState: EventRoomStoreState = {
  connectionStatus: "IDLE",
  connectionDetail: "Not connected.",
  roomId: null,
  playerId: null,
  sessionRole: null,
  snapshot: null,
  resultRounds: [],
  resultsPublicRevision: null,
  resultsNextCursor: null,
  resultsSyncComplete: false,
  pendingMutationRequestIds: [],
  leavePending: false,
  sourceUnavailableMessage: null,
  errorMessage: null,
};

const internalStore = createExternalStore<EventRoomStoreState>(initialState);
let activeClient: EventSocketClient | null = null;
let awaitingResultsStateRefresh = false;
let queuedLeave = false;
let pendingLeaveRequestId: string | null = null;

function notePersistenceFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : "Failed to save event history.";
  internalStore.setState((state) => ({ ...state, errorMessage: message }));
}

function applySnapshot(snapshot: EventRoomSnapshot): "STALE" | "APPLIED" | "RESTART_RESULTS" {
  const current = internalStore.getState().snapshot;
  if (current !== null && snapshot.revision < current.revision) return "STALE";
  const state = internalStore.getState();
  const latestPublicRevision = snapshot.latest_result?.public_revision ?? null;
  const restartResults =
    current?.event_id !== snapshot.event_id ||
    (current?.phase !== "RESULT" && snapshot.phase === "RESULT") ||
    (latestPublicRevision !== null && (state.resultsPublicRevision === null || latestPublicRevision > state.resultsPublicRevision));
  const sync = restartResults ? createEventResultsSyncState() : {
    rounds: state.resultRounds,
    publicRevision: state.resultsPublicRevision,
    nextCursor: state.resultsNextCursor,
    complete: state.resultsSyncComplete,
  };
  internalStore.setState((previous) => ({
    ...previous,
    snapshot,
    resultRounds: sync.rounds,
    resultsPublicRevision: sync.publicRevision,
    resultsNextCursor: sync.nextCursor,
    resultsSyncComplete: sync.complete,
  }));
  void eventHistoryService.ingestSnapshot(snapshot, { complete: sync.complete, publicRevision: sync.publicRevision }).catch(notePersistenceFailure);
  return restartResults ? "RESTART_RESULTS" : "APPLIED";
}

function requestResultsPage(cursor: string | null): boolean {
  const base = currentBase();
  return base ? sendAction({ action: "RESULTS_GET", request_id: requestId(), ...base, ...(cursor ? { cursor } : {}), limit: 50 }) : false;
}

function beginResultsSync(): boolean {
  const reset = createEventResultsSyncState();
  internalStore.setState((state) => ({
    ...state,
    resultRounds: reset.rounds,
    resultsPublicRevision: reset.publicRevision,
    resultsNextCursor: reset.nextCursor,
    resultsSyncComplete: reset.complete,
  }));
  const snapshot = internalStore.getState().snapshot;
  if (snapshot) void eventHistoryService.ingestSnapshot(snapshot, { complete: false, publicRevision: null, resetResults: true }).catch(notePersistenceFailure);
  return requestResultsPage(null);
}

function handleMessage(message: ServerMessage): void {
  if (message.type === "EVENT_JOIN_ACCEPTED") {
    const payload = message.payload as ServerMessagePayloadMap["EVENT_JOIN_ACCEPTED"];
    internalStore.setState((state) => ({ ...state, sessionRole: payload.session_role }));
    applySnapshot(payload.event_room_snapshot);
    beginResultsSync();
    sendQueuedLeaveWhenReady();
    return;
  }
  if (message.type === "EVENT_STATE") {
    const snapshotResult = applySnapshot((message.payload as ServerMessagePayloadMap["EVENT_STATE"]).event_room_snapshot);
    if (snapshotResult !== "STALE" && (snapshotResult === "RESTART_RESULTS" || awaitingResultsStateRefresh)) {
      awaitingResultsStateRefresh = false;
      beginResultsSync();
    }
    return;
  }
  if (message.type === "EVENT_ACTION_ACK") {
    const payload = message.payload as ServerMessagePayloadMap["EVENT_ACTION_ACK"];
    eventNotebookReplayGuard.acknowledge(payload.request_id);
    activeClient?.acknowledge(payload.request_id);
    const leaveAcknowledged = payload.request_id === pendingLeaveRequestId;
    internalStore.setState((state) => ({
      ...state,
      pendingMutationRequestIds: releaseEventMutation(payload.request_id, state.pendingMutationRequestIds),
    }));
    if (leaveAcknowledged) {
      resetEventConnection();
    } else {
      sendQueuedLeaveWhenReady();
    }
    return;
  }
  if (message.type === "EVENT_RESULTS") {
    if (awaitingResultsStateRefresh) return;
    const payload = message.payload as ServerMessagePayloadMap["EVENT_RESULTS"];
    const snapshot = internalStore.getState().snapshot;
    if (snapshot === null) return;
    const state = internalStore.getState();
    const update = applyEventResultsPage({
      rounds: state.resultRounds,
      publicRevision: state.resultsPublicRevision,
      nextCursor: state.resultsNextCursor,
      complete: state.resultsSyncComplete,
    }, payload);
    internalStore.setState((previous) => ({
      ...previous,
      resultRounds: update.state.rounds,
      resultsPublicRevision: update.state.publicRevision,
      resultsNextCursor: update.state.nextCursor,
      resultsSyncComplete: update.state.complete,
    }));
    if (update.restartRequired) {
      awaitingResultsStateRefresh = true;
      void eventHistoryService.ingestSnapshot(snapshot, { complete: false, publicRevision: null, resetResults: true }).catch(notePersistenceFailure);
      eventRoomStore.requestState();
      return;
    }
    void eventHistoryService.ingestResults(snapshot, payload.rounds, payload.public_revision, payload.overall_results, update.state.complete).catch(notePersistenceFailure);
    if (update.state.nextCursor !== null) requestResultsPage(update.state.nextCursor);
    return;
  }
  if (message.type === "EVENT_ERROR") {
    const payload = message.payload as ServerMessagePayloadMap["EVENT_ERROR"];
    if (payload.request_id) {
      eventNotebookReplayGuard.reject(payload.request_id);
      activeClient?.acknowledge(payload.request_id);
    }
    internalStore.setState((state) => ({
      ...state,
      pendingMutationRequestIds: payload.request_id
        ? releaseEventMutation(payload.request_id, state.pendingMutationRequestIds)
        : state.pendingMutationRequestIds,
      errorMessage: payload.message,
    }));
    if (payload.request_id === pendingLeaveRequestId) {
      pendingLeaveRequestId = null;
      queuedLeave = false;
      internalStore.setState((state) => ({ ...state, leavePending: false }));
    } else {
      sendQueuedLeaveWhenReady();
    }
  }
}

function sendAction(action: EventRoomAction): boolean {
  if (activeClient === null) return false;
  const current = internalStore.getState();
  if (!canDispatchEventAction(action, current.pendingMutationRequestIds)) return false;
  try {
    activeClient.sendAction(action);
    internalStore.setState((state) => ({
      ...state,
      pendingMutationRequestIds: trackEventMutation(action, state.pendingMutationRequestIds),
      errorMessage: null,
    }));
    return true;
  } catch (error) {
    internalStore.setState((state) => ({
      ...state,
      errorMessage: error instanceof Error ? error.message : "Event action failed.",
    }));
    return false;
  }
}

function currentBase(): { generation: number; event_id?: string } | null {
  const snapshot = internalStore.getState().snapshot;
  if (snapshot === null) return null;
  return {
    generation: snapshot.generation,
    ...(snapshot.event_id ? { event_id: snapshot.event_id } : {}),
  };
}

function requestId(): string {
  return crypto.randomUUID();
}

function releasePendingNotebookSubmissions(client: EventSocketClient): void {
  const requestIds = eventNotebookReplayGuard.releasePending();
  if (requestIds.length === 0) return;
  for (const pendingRequestId of requestIds) client.acknowledge(pendingRequestId);
  const released = new Set(requestIds);
  internalStore.setState((state) => ({
    ...state,
    pendingMutationRequestIds: state.pendingMutationRequestIds.filter((pendingRequestId) => !released.has(pendingRequestId)),
  }));
}

function resetEventConnection(): void {
  const client = activeClient;
  if (client) releasePendingNotebookSubmissions(client);
  activeClient = null;
  client?.disconnect();
  awaitingResultsStateRefresh = false;
  queuedLeave = false;
  pendingLeaveRequestId = null;
  clearParticipationMode("HOST_EVENT");
  internalStore.setState(initialState);
}

function sendQueuedLeaveWhenReady(): boolean {
  if (activeClient === null || !shouldDispatchQueuedEventLeave({
    queued: queuedLeave,
    pendingLeaveRequestId,
    pendingMutationRequestIds: internalStore.getState().pendingMutationRequestIds,
  })) return false;
  const base = currentBase();
  if (!base) return false;
  const leaveRequestId = requestId();
  const sent = sendAction(buildEventLeaveAction(leaveRequestId, base));
  if (sent) pendingLeaveRequestId = leaveRequestId;
  return sent;
}

export const eventRoomStore = {
  ...internalStore,
  connect(connection: EventRoomConnection): boolean {
    const normalState = roomStore.getState();
    if (normalState.snapshot !== null || normalState.connectionStatus === "CONNECTING" || normalState.connectionStatus === "JOINING") {
      internalStore.setState((state) => ({ ...state, errorMessage: "通常対戦への参加中は開催へ参加できません。" }));
      return false;
    }
    if (!activateParticipationMode("HOST_EVENT")) return false;
    awaitingResultsStateRefresh = false;
    queuedLeave = false;
    pendingLeaveRequestId = null;
    if (activeClient) releasePendingNotebookSubmissions(activeClient);
    activeClient?.disconnect();
    const client = new EventSocketClient({
      apiBaseUrl: connection.apiBaseUrl,
      roomId: connection.roomId,
      playerId: connection.playerId,
      join: {
        join_code: connection.joinCode,
        display_name: connection.displayName,
        ...(connection.source ? { source: connection.source } : {}),
        ...(connection.songUnlocks ? { song_unlocks: connection.songUnlocks } : {}),
      },
      onMessage: handleMessage,
      onStateChange: (connectionStatus, connectionDetail) => {
        internalStore.setState((state) => ({ ...state, connectionStatus, connectionDetail }));
      },
      onError: (error) => internalStore.setState((state) => ({ ...state, connectionStatus: "ERROR", errorMessage: error.message })),
      onClose: () => {
        if (activeClient !== client) return;
        internalStore.setState((state) => ({ ...state, connectionStatus: "DISCONNECTED" }));
      },
    });
    activeClient = client;
    internalStore.setState({ ...initialState, connectionStatus: "CONNECTING", roomId: connection.roomId, playerId: connection.playerId });
    activeClient.connect();
    return true;
  },
  disconnect(): void {
    resetEventConnection();
  },
  leave(): boolean {
    if (queuedLeave || activeClient === null || currentBase() === null) return false;
    queuedLeave = true;
    internalStore.setState((state) => ({ ...state, leavePending: true, errorMessage: null }));
    return internalStore.getState().pendingMutationRequestIds.length > 0 || sendQueuedLeaveWhenReady();
  },
  startEvent(): boolean {
    const base = currentBase();
    return base ? sendAction({ action: "START_EVENT", request_id: requestId(), generation: base.generation }) : false;
  },
  confirmPick(chartKey: string): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id) return false;
    return sendAction({ action: "CONFIRM_PICK", request_id: requestId(), generation: snapshot.generation, event_id: snapshot.event_id, chart_key: chartKey, selection_revision: snapshot.selection_revision });
  },
  cancelPick(): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id || !snapshot.current_round_id) return false;
    return sendAction({ action: "CANCEL_PICK", request_id: requestId(), generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id, selection_revision: snapshot.selection_revision });
  },
  setReady(ready: boolean): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id || !snapshot.current_round_id) return false;
    return sendAction({ action: "SET_READY", request_id: requestId(), generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id, selection_revision: snapshot.selection_revision, ready });
  },
  startRound(): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id || !snapshot.current_round_id) return false;
    return sendAction({ action: "START_ROUND", request_id: requestId(), generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id, selection_revision: snapshot.selection_revision });
  },
  submitResult(observedKey: ExpectedKey, metricValue: number, sourceMeta?: JsonObject, notebookToken?: EventNotebookObservationToken): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id || !snapshot.current_round_id) return false;
    const submitRequestId = requestId();
    const sent = sendAction({ action: "SUBMIT", request_id: submitRequestId, generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id, observed_key: observedKey, metric_value: metricValue, ...(sourceMeta ? { source_meta: sourceMeta } : {}) });
    if (sent && notebookToken) eventNotebookReplayGuard.track(submitRequestId, notebookToken);
    return sent;
  },
  skip(): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id || !snapshot.current_round_id) return false;
    return sendAction({ action: "SKIP", request_id: requestId(), generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id });
  },
  closeRound(): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id || !snapshot.current_round_id) return false;
    return sendAction({ action: "CLOSE_ROUND", request_id: requestId(), generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id });
  },
  nextPick(): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id || !snapshot.current_round_id) return false;
    return sendAction({ action: "NEXT_PICK", request_id: requestId(), generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id });
  },
  invalidateRound(roundId: string): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot?.event_id) return false;
    return sendAction({ action: "INVALIDATE_ROUND", request_id: requestId(), generation: snapshot.generation, event_id: snapshot.event_id, target_round_id: roundId });
  },
  kick(playerId: string): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot) return false;
    return sendAction(buildEventKickAction(requestId(), snapshot, playerId));
  },
  endEvent(): boolean {
    const snapshot = internalStore.getState().snapshot;
    if (!snapshot) return false;
    return sendAction({ action: "END_EVENT", request_id: requestId(), generation: snapshot.generation, ...(snapshot.event_id ? { event_id: snapshot.event_id } : {}), ...(snapshot.current_round_id ? { round_id: snapshot.current_round_id } : {}) });
  },
  requestState(): boolean {
    const base = currentBase();
    return base ? sendAction({ action: "STATE_GET", request_id: requestId(), ...base }) : false;
  },
  requestResults(cursor?: string): boolean {
    return cursor ? requestResultsPage(cursor) : beginResultsSync();
  },
  interruptTransportForE2E(reconnectDelayMs: number): boolean {
    return activeClient?.interruptTransportForE2E(reconnectDelayMs) ?? false;
  },
  reportSourceUnavailable(detail: string): void {
    const snapshot = internalStore.getState().snapshot;
    if (snapshot?.phase !== "PLAYING") return;
    internalStore.setState((state) => ({ ...state, sourceUnavailableMessage: detail }));
  },
  setSourceAvailability(available: boolean): void {
    if (available) {
      internalStore.setState((state) => ({ ...state, sourceUnavailableMessage: null }));
    }
  },
  clearError(): void {
    internalStore.setState((state) => ({ ...state, errorMessage: null }));
  },
  hydrateVisualState(state: EventRoomStoreState): void {
    resetEventConnection();
    internalStore.setState(state);
  },
};

export function useEventRoomStore<TSelected>(selector: (state: EventRoomStoreState) => TSelected): TSelected {
  return useExternalStore(internalStore, selector);
}
