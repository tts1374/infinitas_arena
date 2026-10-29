import { roomStore } from "../stores/room-store";
import { eventRoomStore } from "../stores/event-room-store";
import { settingsStore } from "../stores/settings-store";
import { observeRoomTransportForDevControl, pauseRoomTransportForDevControl } from "../services/ws-client";
import { observeEventTransportForDevControl, pauseEventTransportForDevControl } from "../services/event-ws-client";
import { captureDevControlEvidence, commitDevControlCapture, getDevControlAdapterState, getDevControlIdentity, pollDevControlCommands, reportDevControlObservation, finishDevControlCommand, focusDevControlWindow } from "./transport";
import { observeSourceForDevControl } from "../services/e2e-observability";
import { capturePrivacyReason, guardCapturePrivacy } from "./capture-policy";
import { armDevControlSource, invalidateDevControlSource, setDevControlSourceContext } from "./adapter-source-gate";
import { canonicalDevControlJson, type ContextToken, type DevControlAdapterReport, type DevControlCaptureReceipt, type DevControlCommand, type DevControlResult } from "./protocol";

/** Main-window-only adapter. It never writes snapshots or submits mock result values. */
export async function startDevControlAdapter(): Promise<() => void> {
  const identity = await getDevControlIdentity();
  if (identity.role === "controller") throw new Error("Controller must not mount the product App");
  let active = true, epoch = 0, lastConnection = "", joined = false, left = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let brokerContext: ContextToken | null = null;
  let executing: string | null = null;
  let sourceOperation: { operationId: string; context: ContextToken } | null = null;
  const events: DevControlAdapterReport["events"] = [];
  const captures: DevControlCaptureReceipt[] = [];
  const stopSourceObservation = observeSourceForDevControl((event, detail) => {
    if (!active) return;
    // Generic parser diagnostics do not prove that one particular tool operation was parsed.
    events.push({ stage: event === "file_parsed" ? "parsed" : "operation", detail: { event, ...detail, operationId: null, context: context() } });
  });
  const observe = (stage: "sent" | "received", message: unknown) => {
    const envelope = message as { type?: string; payload?: { action?: string } };
    const resultSend = stage === "sent" && (envelope.type === "RESULT_SUBMIT" || envelope.type === "EVENT_ACTION" && envelope.payload?.action === "SUBMIT");
    const sourceId = resultSend && sourceOperation && canonicalDevControlJson(sourceOperation.context) === canonicalDevControlJson(context()) ? sourceOperation.operationId : null;
    events.push({ stage, detail: { message, operationId: executing ?? sourceId, context: context() } });
  };
  const stopRoomObservation = observeRoomTransportForDevControl(observe);
  const stopEventObservation = observeEventTransportForDevControl(observe);
  function context(): ContextToken | null {
    if (!brokerContext) return null;
    const normalState = roomStore.getState(), eventState = eventRoomStore.getState();
    const normal = normalState.snapshot, event = eventState.snapshot;
    const connection = event ? eventState.connectionStatus : normalState.connectionStatus;
    if (connection !== lastConnection) { lastConnection = connection; epoch++; invalidateDevControlSource(); }
    return { ...brokerContext, transportEpoch: epoch, roomId: event?.room_id ?? normal?.room_id ?? null,
      roomGeneration: event?.generation ?? normal?.generation ?? null, matchId: normal?.current_match_id ?? null,
      eventId: event?.event_id ?? null, roundIndex: normal?.current_round?.round_index ?? null,
      roundId: event?.current_round_id ?? null, expectedKey: event?.selected_chart?.expected_key ?? normal?.current_round?.expected_key ?? null,
      selectionRevision: event?.selection_revision ?? null };
  }
  if (identity.role === "participant") setDevControlSourceContext(context);
  function run(command: DevControlCommand): boolean {
    const snapshot = roomStore.getState().snapshot;
    const event = eventRoomStore.getState().snapshot;
    const roomId = event?.room_id ?? snapshot?.room_id;
    const playerId = settingsStore.getState().saved.playerId;
    switch (command.action) {
      case "ready.set": return roomStore.setReady(command.payload.ready === true);
      case "pick.submit": return roomStore.submitPick(String(command.payload.chartKey));
      case "match.start": return roomStore.startMatch();
      case "match.forceAdvance": return roomStore.forceAdvance(snapshot?.current_round?.round_index ?? -1);
      case "match.returnToLobby": return roomStore.returnToLobby();
      case "event.start": return eventRoomStore.startEvent();
      case "event.confirmPick": return eventRoomStore.confirmPick(String(command.payload.chartKey));
      case "event.cancelPick": return eventRoomStore.cancelPick();
      case "event.startRound": return eventRoomStore.startRound();
      case "event.closeRound": return eventRoomStore.closeRound();
      case "event.nextPick": return eventRoomStore.nextPick();
      case "event.end": return eventRoomStore.endEvent();
      case "state.refresh": return event ? eventRoomStore.requestState() : roomStore.send("STATE_GET", {});
      case "participant.leave": left = true; if (event) return eventRoomStore.leave(); roomStore.leaveRoom(); return true;
      case "participant.disconnect":
      case "participant.reconnect": {
        if (!roomId) return false;
        invalidateDevControlSource(); epoch++;
        return event ? pauseEventTransportForDevControl(roomId, playerId, command.action === "participant.disconnect") : pauseRoomTransportForDevControl(roomId, playerId, command.action === "participant.disconnect");
      }
      default: return false;
    }
  }
  async function tick(): Promise<void> {
    try {
      const normal = roomStore.getState(), event = eventRoomStore.getState();
      const connection = event.snapshot ? event.connectionStatus : normal.connectionStatus;
      if (connection !== lastConnection) { lastConnection = connection; epoch++; invalidateDevControlSource(); }
      const reportEvents = events.splice(0), reportCaptures = captures.splice(0);
      try {
        await reportDevControlObservation({ normalSnapshot: normal.snapshot, eventSnapshot: event.snapshot, connection, transportEpoch: epoch, events: reportEvents, captures: reportCaptures });
      } catch (error) { events.unshift(...reportEvents); captures.unshift(...reportCaptures); throw error; }
      if (!active) return;
      const config = await getDevControlAdapterState();
      if (!active) return;
      brokerContext = config.client.context;
      if (config.lifecycle !== "running") { invalidateDevControlSource(); if (config.lifecycle !== "stopping") return; }
      // A is observational only. Its owner joins and operates through the real App.
      if (config.lifecycle === "running" && identity.role === "participant" && !joined && !left && config.roomId && config.joinCode && (config.hostClientId === identity.clientId || config.hostReady)) {
        joined = true;
        const settings = settingsStore.getState().saved;
        if (["CASUAL", "TOURNAMENT"].includes(config.mode)) {
          eventRoomStore.connect({ apiBaseUrl: config.apiBaseUrl, roomId: config.roomId, playerId: settings.playerId, displayName: settings.displayName, joinCode: config.joinCode, source: settings.source,
            songUnlocks: { bit_unlocked: settings.bitUnlockEnabled, djp_unlocked: settings.djpUnlockEnabled, allow_leggendaria: settings.allowLeggendaria, owned_pack_ids: settings.ownedPackIds } });
        } else roomStore.connect({ roomId: config.roomId, joinCode: config.joinCode }, { apiBaseUrl: config.apiBaseUrl, playerId: settings.playerId, displayName: settings.displayName, source: settings.source, bitUnlockEnabled: settings.bitUnlockEnabled, djpUnlockEnabled: settings.djpUnlockEnabled, allowLeggendaria: settings.allowLeggendaria, ownedPackIds: settings.ownedPackIds });
      }
      if (identity.role === "participant" || identity.role === "self") {
        const commands = await pollDevControlCommands();
        if (!active) return;
        for (const command of commands) {
          if ("kind" in command && command.kind === "evidence-capture") {
            if (!active) return;
            if (Date.now() > Date.parse(command.deadlineAt) || canonicalDevControlJson(command.context) !== canonicalDevControlJson(context())) { captures.push({ captureId: command.captureId, clientId: identity.clientId, status: "missing", relativePath: null, error: "画像取得前にcontextまたは期限が変わりました。" }); continue; }
            const privacyReason = () => capturePrivacyReason({ hasEditableFields: Array.from(document.querySelectorAll("input,textarea,select")).some(element => element.getClientRects().length > 0),
              visibleText: document.body.innerText, joinCode: config.joinCode, sourcePaths: config.client.manifest.readOnlySource?.paths ?? [],
              hostInviteVisible: eventRoomStore.getState().snapshot?.host.player_id === settingsStore.getState().saved.playerId && ["LOBBY", "PICKING"].includes(eventRoomStore.getState().snapshot?.phase ?? "") });
            const privacy = privacyReason();
            if (privacy) { captures.push({ captureId: command.captureId, clientId: identity.clientId, status: "missing", relativePath: null, error: privacy }); continue; }
            try { captures.push(await guardCapturePrivacy({ privacy: () => Date.now() > Date.parse(command.deadlineAt) || canonicalDevControlJson(command.context) !== canonicalDevControlJson(context()) ? "画像取得中にcontextまたは期限が変わりました。" : privacyReason(),
              watch: check => {
                const observer = new MutationObserver(check);
                observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
                const stopRoom = roomStore.subscribe(check), stopEvent = eventRoomStore.subscribe(check);
                document.addEventListener("input", check, true); document.addEventListener("change", check, true);
                window.addEventListener("resize", check);
                return () => { observer.disconnect(); stopRoom(); stopEvent(); document.removeEventListener("input", check, true); document.removeEventListener("change", check, true); window.removeEventListener("resize", check); };
              }, capture: () => captureDevControlEvidence(command),
              commit: (receipt, accept) => receipt.status === "pending" ? commitDevControlCapture(command.captureId, accept) : Promise.resolve(receipt),
            })); }
            catch (cause) { captures.push({ captureId: command.captureId, clientId: identity.clientId, status: "failed", relativePath: null, error: String(cause) }); }
            continue;
          }
          // poll is an asynchronous claim, not permission to execute an old token.
          // Re-read broker-owned value/policy revisions after every poll/finish await.
          const latest = await getDevControlAdapterState();
          if (!active || latest.lifecycle !== "running") { invalidateDevControlSource(); return; }
          brokerContext = latest.client.context;
          if ("kind" in command && command.kind === "source-arm") {
            if (!active || canonicalDevControlJson(command.context) !== canonicalDevControlJson(context())) { invalidateDevControlSource(); continue; }
            armDevControlSource(command.input);
            sourceOperation = { operationId: command.operationId, context: command.context };
            await reportDevControlObservation({ normalSnapshot: roomStore.getState().snapshot, eventSnapshot: eventRoomStore.getState().snapshot, connection: lastConnection, transportEpoch: epoch, events: [], armedInputId: command.input.inputId });
            continue;
          }
          const result: DevControlResult = { protocolVersion: 1, operationId: command.operationId, sessionId: identity.sessionId, context: command.context, status: "failed", reason: null, evidenceSequences: [] };
          if (!active || canonicalDevControlJson(command.context) !== canonicalDevControlJson(context())) { result.reason = "context changed before dispatch"; }
          else if (identity.role === "self" && !["client.focus", "state.refresh"].includes(command.action)) { result.reason = "本人Aの代理操作は禁止されています。"; }
          else if (command.action === "client.focus") {
            try {
              result.nativeFocus = await focusDevControlWindow(command);
              result.status = result.nativeFocus.focused ? "confirmed" : "failed";
              result.reason = result.nativeFocus.focused ? "この端末の実窓の表示・フォーカスを確認しました。製品WS受付ではありません。" : "実窓のフォーカスを確認できませんでした。";
            } catch (cause) { result.reason = String(cause); }
          }
          else {
            executing = command.operationId;
            let sent = false;
            try { sent = run(command); } finally { executing = null; }
            result.status = sent ? "sent" : "failed";
            result.reason = sent ? "正規操作を配送しました。server受付は未確認です。" : "正規storeが操作を拒否しました。";
          }
          await finishDevControlCommand(result);
        }
      }
    } catch {
      // Broker loss stops this adapter; it must never replay an old command.
      invalidateDevControlSource();
    } finally { if (active) timer = setTimeout(() => { void tick(); }, 300); }
  }
  void tick();
  return () => { active = false; if (timer) clearTimeout(timer); stopRoomObservation(); stopEventObservation(); stopSourceObservation(); setDevControlSourceContext(null); };
}
