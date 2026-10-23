import type { ChartSearchQuery, RoomStateSnapshot } from "@infinitas/shared";
import { runtimeConfig } from "../runtime/runtime-config";
import { listRoomCharts } from "./worker-api-client";
import {
  captureE2EScreenshot,
  initializeE2EObservability,
  logE2EEvent,
  writeE2EStateDump,
} from "./e2e-observability";
import { roomStore } from "../stores/room-store";
import { eventRoomStore } from "../stores/event-room-store";
import { settingsStore, isRoomEntryReady } from "../stores/settings-store";
import { sourceStore } from "../stores/source-store";
import { readMatchHistory } from "./match-history-overlay";
import { selectActiveMatchHistory } from "./match-history-view-model";
import { statsArchiveService } from "./stats-archive";
import { eventHistoryService, isReadableEventHistory } from "./event-history";

type GetView = () => string;

let runnerStarted = false;
let roomConnectRequested = false;
let automationStepInFlight = false;
let automationStepQueued = false;
let pickRequestInFlight = false;
let lastStateSignature: string | null = null;
let lastFailureSignature: string | null = null;
let readyRequestedKey: string | null = null;
let startMatchRequestedKey: string | null = null;
let pickRequestedKey: string | null = null;
const completedMatchIds = new Set<string>();
let returnToLobbyRequestedForMatchId: string | null = null;
let rematchTimerId: number | null = null;
let automationTimerId: number | null = null;
let eventConnectRequested = false;
let eventStartRequested = false;
let eventPickRequestedRevision: number | null = null;
let eventReadyRequestedRoundId: string | null = null;
let eventRoundStartRequestedId: string | null = null;
let eventNextPickRequestedId: string | null = null;
let eventNextPickAttemptCount = 0;
let eventNextPickLastAttemptAtMs = 0;
let eventEndRequested = false;
let eventDisconnectTriggered = false;
let eventHostDisconnectLogged = false;
let eventHostReconnectLogged = false;
let eventReloadScheduled = false;
let eventLobbyObservedAtMs: number | null = null;
let eventPickingObservedAtMs: number | null = null;
let eventFirstResultObservedAtMs: number | null = null;
let eventReconnectAdvanceTimerId: number | null = null;
let eventReconnectAdvancePollCount = 0;
const capturedEventStates = new Set<string>();
const observedEventResultRoundIds = new Set<string>();
const eventResultObservedAtMs = new Map<string, number>();
const stopSubscriptions: (() => void)[] = [];

const RESULT_EVIDENCE_SETTLE_MS = 1_000;
const EVENT_DISCONNECT_TRIGGERED_KEY = "inf-arena-e2e-event-disconnect-triggered";
const EVENT_HISTORY_RELOAD_KEY = "inf-arena-e2e-event-history-reload";
const E2E_PAGE_LOAD_NONCE = crypto.randomUUID();

function hasReloadedCurrentEventHistory(eventId: string | null): boolean {
  if (eventId === null) return false;
  try {
    const marker = JSON.parse(sessionStorage.getItem(EVENT_HISTORY_RELOAD_KEY) ?? "null") as { eventId?: unknown; pageLoadNonce?: unknown } | null;
    return marker?.eventId === eventId &&
      typeof marker.pageLoadNonce === "string" && marker.pageLoadNonce !== E2E_PAGE_LOAD_NONCE &&
      eventHistoryService.list().some((entry) => isReadableEventHistory(entry) && entry.event_id === eventId);
  } catch {
    return false;
  }
}

function wasEventDisconnectTriggered(): boolean {
  return eventDisconnectTriggered || sessionStorage.getItem(EVENT_DISCONNECT_TRIGGERED_KEY) === "1";
}

function scheduleEventAdvanceAfterReconnect(roundId: string | null): void {
  if (roundId === null || eventReconnectAdvanceTimerId !== null) return;
  eventReconnectAdvanceTimerId = window.setTimeout(() => {
    eventReconnectAdvanceTimerId = null;
    eventReconnectAdvancePollCount += 1;
    const state = eventRoomStore.getState();
    const snapshot = state.snapshot;
    if (snapshot?.phase !== "PLAYING" || snapshot.round_phase !== "RESULT" || snapshot.current_round_id !== roundId) return;
    const canAttempt = state.connectionStatus === "CONNECTED" && snapshot.host.connected && state.pendingMutationRequestIds.length === 0;
    if (canAttempt && eventNextPickAttemptCount < 3) {
      const sent = eventRoomStore.nextPick();
      if (sent) {
        eventNextPickRequestedId = roundId;
        eventNextPickAttemptCount += 1;
        eventNextPickLastAttemptAtMs = Date.now();
        void logE2EEvent("event_next_pick_reconnect_attempted", { sent, attempt: eventNextPickAttemptCount, roundId });
      }
    }
    if (eventReconnectAdvancePollCount < 12 && eventRoomStore.getState().snapshot?.round_phase === "RESULT") {
      scheduleEventAdvanceAfterReconnect(roundId);
    }
  }, 1_000);
}

function getActivePlayerId(): string {
  const roomState = roomStore.getState();
  return roomState.connectionPlayerId ?? settingsStore.getState().saved.playerId;
}

function buildRoomConnectionSettings() {
  const settings = settingsStore.getState().saved;
  return {
    apiBaseUrl: settings.apiBaseUrl,
    playerId: settings.playerId,
    displayName: settings.displayName,
    source: settings.source,
    bitUnlockEnabled: settings.bitUnlockEnabled,
    djpUnlockEnabled: settings.djpUnlockEnabled,
    allowLeggendaria: settings.allowLeggendaria,
    ownedPackIds: settings.ownedPackIds,
  };
}

function canAutoStartMatch(snapshot: RoomStateSnapshot, activePlayerId: string): boolean {
  if (snapshot.room_state !== "LOBBY") {
    return false;
  }
  if (snapshot.players.length < 2) {
    return false;
  }
  if (snapshot.current_round !== null || snapshot.picks.length > 0 || snapshot.frozen_rounds.length > 0) {
    return false;
  }
  const me = snapshot.players.find((player) => player.player_id === activePlayerId);
  if (me?.source === "daken_counter_v3" && sourceStore.getState().watcherState.status !== "RUNNING") {
    return false;
  }

  return snapshot.players
    .filter((player) => player.player_id !== snapshot.host_player_id)
    .every((player) => player.ready);
}

function buildStateSignature(snapshot: RoomStateSnapshot | null): string {
  if (snapshot === null) {
    return "snapshot:null";
  }

  return [
    snapshot.room_id,
    snapshot.room_state,
    snapshot.players.map((player) => `${player.player_id}:${String(player.ready)}:${String(player.connected)}`).join(","),
    snapshot.picks.map((pick) => `${pick.player_id}:${pick.pick_chart_key}`).join(","),
    snapshot.current_round?.round_index ?? "none",
    snapshot.current_round?.confirmed.length ?? 0,
    String(snapshot.result_ready),
  ].join("|");
}

function buildMatchActionKey(snapshot: RoomStateSnapshot, activePlayerId: string, action: string): string {
  const matchId = snapshot.current_match_id ?? snapshot.room_id;
  return [
    snapshot.room_id,
    String(snapshot.generation ?? "na"),
    matchId,
    activePlayerId,
    action,
  ].join(":");
}

function getRequiredPickCountForPlayer(snapshot: RoomStateSnapshot): number {
  return snapshot.settings.mode === "BPL4" ? 2 : 1;
}

function buildStateDumpPayload(activeView: string) {
  const roomState = roomStore.getState();
  const sourceState = sourceStore.getState();
  const settingsState = settingsStore.getState();
  const matchHistory = readMatchHistory();
  const visualRoot = typeof document === "undefined"
    ? null
    : (document.getElementById("visual-capture-root") as HTMLElement | null);

  return {
    activeView,
    connectionStatus: roomState.connectionStatus,
    connectionDetail: roomState.connectionDetail,
    roomId: roomState.roomId,
    joinCode: roomState.joinCode,
    activePlayerId: getActivePlayerId(),
    roomSnapshot: roomState.snapshot,
    resultReady: roomState.resultReady,
    roomEventLog: roomState.eventLog,
    sourceWatcherState: sourceState.watcherState,
    sourceLastEvent: sourceState.lastEvent,
    activeUnresolvedDialog: sourceState.activeUnresolvedDialog,
    datasource: settingsState.saved.source,
    sourcePaths: settingsState.saved.sourcePaths,
    matchHistory,
    activeMatchHistory: selectActiveMatchHistory(matchHistory),
    eventRoom: eventRoomStore.getState(),
    eventHistory: eventHistoryService.list(),
    eventHistoryReloaded: hasReloadedCurrentEventHistory(eventRoomStore.getState().snapshot?.event_id ?? null),
    visualLayout: visualRoot === null ? null : {
      clientWidth: visualRoot.clientWidth,
      scrollWidth: visualRoot.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      hasHorizontalOverflow: visualRoot.scrollWidth > visualRoot.clientWidth,
    },
    e2e: runtimeConfig.e2e,
  };
}

function captureEventState(label: string): void {
  if (capturedEventStates.has(label)) return;
  capturedEventStates.add(label);
  window.setTimeout(() => {
    const target = (document.getElementById("visual-capture-root") as HTMLElement | null) ?? document.body;
    void captureE2EScreenshot(label, target);
  }, 250);
}

function eventConnectionSettings() {
  const settings = settingsStore.getState().saved;
  return {
    apiBaseUrl: settings.apiBaseUrl,
    roomId: runtimeConfig.e2e.roomId!,
    joinCode: runtimeConfig.e2e.joinCode ?? "",
    playerId: settings.playerId,
    displayName: settings.displayName,
    source: settings.source,
    songUnlocks: {
      bit_unlocked: settings.bitUnlockEnabled,
      djp_unlocked: settings.djpUnlockEnabled,
      allow_leggendaria: settings.allowLeggendaria,
      owned_pack_ids: settings.ownedPackIds,
    },
  };
}

async function ensureEventConnected(): Promise<void> {
  if (eventConnectRequested || !runtimeConfig.e2e.roomId) return;
  eventConnectRequested = eventRoomStore.connect(eventConnectionSettings());
  if (!eventConnectRequested) await logE2EEvent("event_join_request_failed", { roomId: runtimeConfig.e2e.roomId });
}

async function maybeDriveHostEvent(): Promise<void> {
  const state = eventRoomStore.getState();
  const snapshot = state.snapshot;
  if (snapshot === null) return;
  const isHost = state.sessionRole === "HOST";
  const self = snapshot.participants.find((participant) => participant.player_id === state.playerId);
  const roundNumber = state.resultRounds.length + 1;

  if (isHost && wasEventDisconnectTriggered() && state.connectionStatus === "DISCONNECTED" && !eventHostDisconnectLogged) {
    eventHostDisconnectLogged = true;
    await logE2EEvent("event_host_disconnected_observed", { phase: snapshot.phase, roundId: snapshot.current_round_id });
  }

  if (!snapshot.host.connected) {
    if (snapshot.event_id !== null) captureEventState("event-host-disconnected");
    if (snapshot.event_id !== null && !eventHostDisconnectLogged) {
      eventHostDisconnectLogged = true;
      await logE2EEvent("event_host_disconnected_observed", { phase: snapshot.phase, roundId: snapshot.current_round_id });
    }
    return;
  }
  if (isHost && wasEventDisconnectTriggered() && eventHostDisconnectLogged && !eventHostReconnectLogged && state.connectionStatus === "CONNECTED") {
    eventHostReconnectLogged = true;
    await logE2EEvent("event_host_reconnected_observed", { phase: snapshot.phase, roundId: snapshot.current_round_id });
  }
  if (snapshot.phase === "LOBBY") {
    captureEventState("event-lobby");
    if (isHost && snapshot.participants.length > 0 && !eventStartRequested) {
      eventLobbyObservedAtMs ??= Date.now();
      // Native two-client launch can take several seconds before the outer
      // harness regains control. Keep this E2E-only state stable long enough
      // to assert and capture both real windows.
      if (Date.now() - eventLobbyObservedAtMs < 5_000) return;
      eventStartRequested = eventRoomStore.startEvent();
    }
    return;
  }
  if (snapshot.phase === "PICKING") {
    if (eventNextPickRequestedId !== null && eventNextPickRequestedId !== snapshot.current_round_id) {
      eventNextPickRequestedId = null;
      eventNextPickAttemptCount = 0;
      eventNextPickLastAttemptAtMs = 0;
    }
    captureEventState(`event-picking-round-${roundNumber}`);
    if (isHost && snapshot.selected_chart === null && eventPickRequestedRevision !== snapshot.selection_revision) {
      eventPickRequestedRevision = snapshot.selection_revision;
      try {
        const response = await listRoomCharts(settingsStore.getState().saved.apiBaseUrl, snapshot.room_id, {
          play_style: snapshot.settings.play_style,
          level_filter: "ANY",
          limit: 20,
        });
        const used = new Set(state.resultRounds.map((round) => round.chart.chart_key));
        const chart = response.charts.find((entry) => !used.has(entry.chart_key)) ?? response.charts[0];
        if (chart) eventRoomStore.confirmPick(chart.chart_key);
      } catch (error) {
        await logE2EEvent("event_auto_pick_failed", { reason: error instanceof Error ? error.message : "unknown" });
      }
      return;
    }
    if (snapshot.selected_chart !== null && self && !self.pending_next && !self.ready && eventReadyRequestedRoundId !== snapshot.current_round_id) {
      eventReadyRequestedRoundId = snapshot.current_round_id;
      eventRoomStore.setReady(true);
      return;
    }
    if (isHost && snapshot.selected_chart !== null && eventRoundStartRequestedId !== snapshot.current_round_id) {
      const eligible = snapshot.participants.filter(
        (participant) =>
          !participant.pending_next &&
          (participant.connection_state === "CONNECTED" || participant.connection_state === "DISCONNECTED"),
      );
      if (eligible.length > 0 && eligible.every((participant) => participant.ready)) {
        eventPickingObservedAtMs ??= Date.now();
        if (Date.now() - eventPickingObservedAtMs < 5_000) return;
        eventRoundStartRequestedId = snapshot.current_round_id;
        eventRoomStore.startRound();
      }
    }
    return;
  }
  if (snapshot.phase === "PLAYING" && snapshot.round_phase === "ACTIVE") {
    captureEventState(`event-active-round-${roundNumber}`);
    return;
  }
  if (snapshot.phase === "PLAYING" && snapshot.round_phase === "RESULT") {
    if (snapshot.latest_result !== null) observedEventResultRoundIds.add(snapshot.latest_result.round_id);
    captureEventState(`event-result-round-${state.resultRounds.length}`);
    if (!isHost) return;
    const resultRoundId = snapshot.latest_result?.round_id ?? snapshot.current_round_id;
    if (resultRoundId !== null) {
      const firstObservedAt = eventResultObservedAtMs.get(resultRoundId) ?? Date.now();
      eventResultObservedAtMs.set(resultRoundId, firstObservedAt);
      if (Date.now() - firstObservedAt < 5_000) return;
    }
    // EVENT_STATE can announce RESULT before the public results page arrives. Do not
    // advance (or skip the disconnect probe) until this round is in the public feed.
    const disconnectWasTriggered = wasEventDisconnectTriggered();
    if ((!state.resultsSyncComplete || state.resultRounds.length === 0) && !disconnectWasTriggered) return;
    if (runtimeConfig.e2e.eventDisconnectHost && !disconnectWasTriggered && state.resultRounds.length === 1) {
      eventFirstResultObservedAtMs ??= Date.now();
      if (Date.now() - eventFirstResultObservedAtMs < 1_500) return;
      eventDisconnectTriggered = eventRoomStore.interruptTransportForE2E(4_000);
      if (eventDisconnectTriggered) {
        sessionStorage.setItem(EVENT_DISCONNECT_TRIGGERED_KEY, "1");
        await logE2EEvent("event_host_disconnect_triggered", { roundId: snapshot.current_round_id });
        scheduleEventAdvanceAfterReconnect(snapshot.current_round_id);
      }
      return;
    }
    const latestResultAlreadySynced = snapshot.latest_result !== null && state.resultRounds.some(
      (round) => round.round_id === snapshot.latest_result?.round_id,
    );
    const completedRoundCount = Math.max(
      observedEventResultRoundIds.size,
      state.resultRounds.length + (snapshot.latest_result !== null && !latestResultAlreadySynced ? 1 : 0),
    );
    if (completedRoundCount < runtimeConfig.e2e.eventRoundCount) {
      if (state.connectionStatus !== "CONNECTED") return;
      if (state.pendingMutationRequestIds.length > 0) return;
      const sameRound = eventNextPickRequestedId === snapshot.current_round_id;
      if (sameRound && (eventNextPickAttemptCount >= 3 || Date.now() - eventNextPickLastAttemptAtMs < 2_000)) return;
      const sent = eventRoomStore.nextPick();
      if (sent) {
        eventNextPickRequestedId = snapshot.current_round_id;
        eventNextPickAttemptCount = sameRound ? eventNextPickAttemptCount + 1 : 1;
        eventNextPickLastAttemptAtMs = Date.now();
        await logE2EEvent("event_next_pick_attempted", { sent, attempt: eventNextPickAttemptCount, roundId: snapshot.current_round_id, completedRoundCount, connectionStatus: state.connectionStatus });
      } else {
        await logE2EEvent("event_next_pick_failed", { roundId: snapshot.current_round_id, completedRoundCount, connectionStatus: state.connectionStatus });
      }
    } else if (state.resultRounds.length >= runtimeConfig.e2e.eventRoundCount && !eventEndRequested) {
      eventEndRequested = eventRoomStore.endEvent();
    }
    return;
  }
  if (snapshot.phase === "RESULT" || snapshot.phase === "CLOSED") {
    captureEventState("event-final");
    if (state.resultsSyncComplete && state.resultRounds.length >= runtimeConfig.e2e.eventRoundCount) {
      const reloaded = hasReloadedCurrentEventHistory(snapshot.event_id);
      if (reloaded) {
        await logE2EEvent("event_history_reloaded", { eventId: snapshot.event_id, rounds: state.resultRounds.length, historyEntries: eventHistoryService.list().length });
      } else if (!eventReloadScheduled) {
        eventReloadScheduled = true;
        sessionStorage.setItem(EVENT_HISTORY_RELOAD_KEY, JSON.stringify({ eventId: snapshot.event_id, pageLoadNonce: E2E_PAGE_LOAD_NONCE }));
        await logE2EEvent("event_history_reload_requested", { eventId: snapshot.event_id });
        window.setTimeout(() => window.location.reload(), 3_000);
      }
    }
  }
}

async function updateStateDump(activeView: string, reason: string): Promise<void> {
  const roomSnapshot = roomStore.getState().snapshot;
  const eventState = eventRoomStore.getState();
  const eventSignature = eventState.snapshot === null
    ? "event:null"
    : `event:${eventState.snapshot.revision}:${eventState.snapshot.phase}:${eventState.snapshot.round_phase}:${eventState.resultRounds.length}:${eventState.resultsSyncComplete}`;
  const visualRoot = document.getElementById("visual-capture-root") as HTMLElement | null;
  const layoutSignature = visualRoot === null
    ? "layout:null"
    : `layout:${visualRoot.clientWidth}:${visualRoot.scrollWidth}:${document.documentElement.clientWidth}`;
  const nextSignature = `${buildStateSignature(roomSnapshot)}|${eventSignature}|${reason}|${activeView}|${layoutSignature}`;
  if (lastStateSignature === nextSignature) {
    return;
  }

  lastStateSignature = nextSignature;
  await writeE2EStateDump(buildStateDumpPayload(activeView), reason);
  const captureTarget =
    (document.getElementById("visual-capture-root") as HTMLElement | null) ??
    document.body;
  await captureE2EScreenshot("latest", captureTarget);
}

async function maybeCaptureFailure(activeView: string): Promise<void> {
  const roomState = roomStore.getState();
  const dialog = roomState.errorDialog;
  if (!dialog?.blocking) {
    return;
  }

  const signature = `${dialog.code ?? "blocking"}|${dialog.description}|${activeView}`;
  if (lastFailureSignature === signature) {
    return;
  }

  lastFailureSignature = signature;
  await logE2EEvent("blocking_error_dialog", {
    code: dialog.code ?? null,
    description: dialog.description,
    roomState: roomState.snapshot?.room_state ?? null,
  });
  const captureTarget =
    (document.getElementById("visual-capture-root") as HTMLElement | null) ??
    document.body;
  await captureE2EScreenshot("failure", captureTarget);
}

async function ensureRoomConnected(): Promise<void> {
  if (!runtimeConfig.e2e.roomId || roomConnectRequested) {
    return;
  }

  const settings = settingsStore.getState().saved;
  if (!isRoomEntryReady(settings)) {
    return;
  }

  roomConnectRequested = true;
  const connected = roomStore.connect(
    {
      roomId: runtimeConfig.e2e.roomId,
      joinCode: runtimeConfig.e2e.joinCode,
    },
    buildRoomConnectionSettings(),
  );
  if (!connected) {
    roomConnectRequested = false;
    await logE2EEvent("room_join_request_failed", {
      roomId: runtimeConfig.e2e.roomId,
    });
  }
}

async function maybeAutoReadyAndStart(): Promise<void> {
  const roomState = roomStore.getState();
  const snapshot = roomState.snapshot;
  if (snapshot === null || snapshot.room_state !== "LOBBY") {
    readyRequestedKey = null;
    startMatchRequestedKey = null;
    return;
  }

  const activePlayerId = getActivePlayerId();
  const me = snapshot.players.find((player) => player.player_id === activePlayerId);
  if (me && !me.ready) {
    const readyKey = buildMatchActionKey(snapshot, activePlayerId, "ready");
    if (readyRequestedKey === readyKey) {
      return;
    }
    if (roomStore.setReady(true)) {
      readyRequestedKey = readyKey;
    }
    return;
  }
  readyRequestedKey = null;

  if (activePlayerId === snapshot.host_player_id && canAutoStartMatch(snapshot, activePlayerId)) {
    const startKey = buildMatchActionKey(snapshot, activePlayerId, "start");
    if (startMatchRequestedKey === startKey) {
      return;
    }
    if (roomStore.startMatch()) {
      startMatchRequestedKey = startKey;
    }
  }
}

function buildChartSearchQuery(snapshot: RoomStateSnapshot): ChartSearchQuery {
  return {
    play_style: snapshot.settings.play_style,
    level_filter: snapshot.settings.level_filter,
    limit: 20,
  };
}

async function maybeAutoPick(): Promise<void> {
  const roomState = roomStore.getState();
  const snapshot = roomState.snapshot;
  if (snapshot === null || snapshot.room_state !== "PICKING" || pickRequestInFlight) {
    if (snapshot?.room_state !== "PICKING") {
      pickRequestedKey = null;
    }
    return;
  }

  const activePlayerId = getActivePlayerId();
  const ownPickCount = snapshot.picks.filter((pick) => pick.player_id === activePlayerId).length;
  if (ownPickCount >= getRequiredPickCountForPlayer(snapshot)) {
    pickRequestedKey = null;
    return;
  }

  const pickKey = buildMatchActionKey(snapshot, activePlayerId, `pick:${ownPickCount}`);
  if (pickRequestedKey === pickKey) {
    return;
  }

  pickRequestInFlight = true;
  pickRequestedKey = pickKey;
  try {
    const settings = settingsStore.getState().saved;
    const response = await listRoomCharts(
      settings.apiBaseUrl,
      snapshot.room_id,
      buildChartSearchQuery(snapshot),
    );
    const alreadyPicked = new Set(snapshot.picks.map((pick) => pick.pick_chart_key));
    const nextChart =
      response.charts.find((chart) => !alreadyPicked.has(chart.chart_key)) ??
      response.charts[0];

    if (!nextChart) {
      pickRequestedKey = null;
      await logE2EEvent("auto_pick_failed", {
        roomId: snapshot.room_id,
        reason: "no chart candidates from room chart search",
      });
      return;
    }

    if (!roomStore.submitPick(nextChart.chart_key)) {
      pickRequestedKey = null;
    }
  } catch (error) {
    pickRequestedKey = null;
    await logE2EEvent("auto_pick_failed", {
      roomId: snapshot.room_id,
      reason: error instanceof Error ? error.message : "unknown error",
    });
  } finally {
    pickRequestInFlight = false;
  }
}

function resolveResultMatchId(): string | null {
  const roomState = roomStore.getState();
  const snapshot = roomState.snapshot;
  if (snapshot === null) {
    return null;
  }

  const summary = roomState.resultReady?.summary;
  if (summary && typeof summary.match_id === "string" && summary.match_id.trim().length > 0) {
    return summary.match_id;
  }

  if (typeof snapshot.current_match_id === "string" && snapshot.current_match_id.trim().length > 0) {
    return snapshot.current_match_id;
  }

  return typeof snapshot.room_id === "string" && snapshot.room_id.trim().length > 0
    ? snapshot.room_id
    : null;
}

async function maybeAutoReturnToLobbyForRematch(): Promise<void> {
  const roomState = roomStore.getState();
  const snapshot = roomState.snapshot;
  if (snapshot === null || snapshot.room_state !== "RESULT") {
    returnToLobbyRequestedForMatchId = null;
    return;
  }

  const activePlayerId = getActivePlayerId();
  if (runtimeConfig.e2e.matchCount <= 1 || activePlayerId !== snapshot.host_player_id) {
    return;
  }

  const resultMatchId = resolveResultMatchId();
  if (resultMatchId === null) {
    return;
  }

  completedMatchIds.add(resultMatchId);
  if (completedMatchIds.size >= runtimeConfig.e2e.matchCount) {
    return;
  }

  if (returnToLobbyRequestedForMatchId === resultMatchId) {
    return;
  }

  returnToLobbyRequestedForMatchId = resultMatchId;
  if (rematchTimerId !== null) {
    window.clearTimeout(rematchTimerId);
  }
  rematchTimerId = window.setTimeout(() => {
    rematchTimerId = null;
    const sent = roomStore.returnToLobby();
    void logE2EEvent("return_to_lobby_sent", {
      roomId: snapshot.room_id,
      matchId: resultMatchId,
      actorPlayerId: activePlayerId,
      hostPlayerId: snapshot.host_player_id,
      completedMatches: completedMatchIds.size,
      targetMatches: runtimeConfig.e2e.matchCount,
      sent,
    });
  }, RESULT_EVIDENCE_SETTLE_MS);
}

async function runAutomationStep(getView: GetView): Promise<void> {
  if (automationStepInFlight) {
    automationStepQueued = true;
    return;
  }

  automationStepInFlight = true;
  try {
    do {
      automationStepQueued = false;
      if (runtimeConfig.e2e.roomKind === "HOST_EVENT") {
        await ensureEventConnected();
        await maybeDriveHostEvent();
        await updateStateDump(getView(), "event_automation_step");
        await maybeCaptureFailure(getView());
        continue;
      }
      await ensureRoomConnected();
      await maybeAutoReadyAndStart();
      await maybeAutoPick();
      await maybeAutoReturnToLobbyForRematch();
      await updateStateDump(getView(), "automation_step");
      await maybeCaptureFailure(getView());
    } while (automationStepQueued);
  } finally {
    automationStepInFlight = false;
  }
}

function clearRunnerState(): void {
  runnerStarted = false;
  roomConnectRequested = false;
  automationStepInFlight = false;
  automationStepQueued = false;
  pickRequestInFlight = false;
  lastStateSignature = null;
  lastFailureSignature = null;
  readyRequestedKey = null;
  startMatchRequestedKey = null;
  pickRequestedKey = null;
  completedMatchIds.clear();
  returnToLobbyRequestedForMatchId = null;
  eventConnectRequested = false;
  eventStartRequested = false;
  eventPickRequestedRevision = null;
  eventReadyRequestedRoundId = null;
  eventRoundStartRequestedId = null;
  eventNextPickRequestedId = null;
  eventNextPickAttemptCount = 0;
  eventNextPickLastAttemptAtMs = 0;
  eventEndRequested = false;
  eventDisconnectTriggered = false;
  eventHostDisconnectLogged = false;
  eventHostReconnectLogged = false;
  eventReloadScheduled = false;
  eventLobbyObservedAtMs = null;
  eventPickingObservedAtMs = null;
  eventFirstResultObservedAtMs = null;
  eventReconnectAdvancePollCount = 0;
  if (eventReconnectAdvanceTimerId !== null) {
    window.clearTimeout(eventReconnectAdvanceTimerId);
    eventReconnectAdvanceTimerId = null;
  }
  capturedEventStates.clear();
  observedEventResultRoundIds.clear();
  eventResultObservedAtMs.clear();
  if (rematchTimerId !== null) {
    window.clearTimeout(rematchTimerId);
    rematchTimerId = null;
  }
  if (automationTimerId !== null) {
    window.clearInterval(automationTimerId);
    automationTimerId = null;
  }
  while (stopSubscriptions.length > 0) {
    const stop = stopSubscriptions.pop();
    stop?.();
  }
}

export function startE2EScenarioRunner(getView: GetView): () => void {
  if (!runtimeConfig.e2e.enabled || !runtimeConfig.e2e.roomId || runnerStarted) {
    return () => {
      clearRunnerState();
    };
  }

  runnerStarted = true;
  void initializeE2EObservability();
  void logE2EEvent("scenario_runner_started", {
    scenario: runtimeConfig.e2e.scenario,
    role: runtimeConfig.e2e.role,
    roomId: runtimeConfig.e2e.roomId,
    matchCount: runtimeConfig.e2e.matchCount,
  });

  stopSubscriptions.push(
    settingsStore.subscribe(() => {
      void runAutomationStep(getView);
    }),
  );
  stopSubscriptions.push(
    roomStore.subscribe(() => {
      void runAutomationStep(getView);
    }),
  );
  stopSubscriptions.push(
    eventRoomStore.subscribe(() => {
      void runAutomationStep(getView);
    }),
  );
  stopSubscriptions.push(
    sourceStore.subscribe(() => {
      void updateStateDump(getView(), "source_state_changed");
    }),
  );
  stopSubscriptions.push(
    statsArchiveService.subscribe(() => {
      void updateStateDump(getView(), "stats_archive_changed");
    }),
  );

  // Transport reconnects do not necessarily change a store after the final
  // JOIN/results messages. A low-frequency tick keeps the deterministic E2E
  // driver moving without affecting production (the runner is E2E-only).
  automationTimerId = window.setInterval(() => {
    void runAutomationStep(getView);
  }, 500);

  void runAutomationStep(getView);

  return () => {
    clearRunnerState();
  };
}
