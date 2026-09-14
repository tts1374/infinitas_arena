import type { EventRoomAction, EventRoomSnapshot } from "@infinitas/shared";

export type EventUiAction = EventRoomAction["action"];

export function canUseEventUiAction(input: {
  action: EventUiAction;
  snapshot: EventRoomSnapshot;
  sessionRole: "HOST" | "PLAYER" | null;
  playerId: string | null;
  mutationPending: boolean;
}): boolean {
  const { action, snapshot, sessionRole, playerId, mutationPending } = input;
  if (mutationPending) return false;
  if (!snapshot.host.connected && action !== "SUBMIT") return false;
  const isHost = sessionRole === "HOST";
  const self = snapshot.participants.find((participant) => participant.player_id === playerId);
  switch (action) {
    case "START_EVENT": return isHost && snapshot.phase === "LOBBY" && snapshot.participants.length > 0;
    case "CONFIRM_PICK": return isHost && snapshot.phase === "PICKING" && snapshot.selected_chart === null;
    case "CANCEL_PICK": return isHost && snapshot.phase === "PICKING" && snapshot.selected_chart !== null;
    case "START_ROUND": return isHost && snapshot.phase === "PICKING" && snapshot.selected_chart !== null;
    case "CLOSE_ROUND": return isHost && snapshot.phase === "PLAYING" && snapshot.round_phase === "ACTIVE";
    case "NEXT_PICK": return isHost && snapshot.phase === "PLAYING" && snapshot.round_phase === "RESULT";
    case "INVALIDATE_ROUND": return isHost && (snapshot.phase === "PLAYING" || snapshot.phase === "RESULT");
    case "KICK": return isHost && (snapshot.phase === "LOBBY" || snapshot.phase === "PICKING");
    case "END_EVENT": return isHost && snapshot.phase !== "CLOSED";
    case "SET_READY": return snapshot.phase === "PICKING" && self !== undefined && !self.pending_next;
    case "SKIP": return snapshot.phase === "PLAYING" && snapshot.round_phase === "ACTIVE" && self?.round_status === "PENDING";
    case "SUBMIT": return snapshot.phase === "PLAYING" && snapshot.round_phase === "ACTIVE" && self?.round_status === "PENDING";
    case "LEAVE": return !isHost && snapshot.phase !== "CLOSED";
    case "STATE_GET":
    case "RESULTS_GET":
      return true;
    default:
      return false;
  }
}

export function isEventSyncAction(action: EventRoomAction): boolean {
  return action.action === "STATE_GET" || action.action === "RESULTS_GET";
}

export function canDispatchEventAction(action: EventRoomAction, pendingMutationRequestIds: string[]): boolean {
  return isEventSyncAction(action) || pendingMutationRequestIds.length === 0;
}

export function trackEventMutation(action: EventRoomAction, pendingMutationRequestIds: string[]): string[] {
  return isEventSyncAction(action) ? pendingMutationRequestIds : [...pendingMutationRequestIds, action.request_id];
}

export function releaseEventMutation(requestId: string, pendingMutationRequestIds: string[]): string[] {
  return pendingMutationRequestIds.filter((id) => id !== requestId);
}

export function shouldDispatchQueuedEventLeave(input: {
  queued: boolean;
  pendingLeaveRequestId: string | null;
  pendingMutationRequestIds: string[];
}): boolean {
  return input.queued && input.pendingLeaveRequestId === null && input.pendingMutationRequestIds.length === 0;
}

export function buildEventLeaveAction(
  requestId: string,
  base: { generation: number; event_id?: string },
): Extract<EventRoomAction, { action: "LEAVE" }> {
  return { action: "LEAVE", request_id: requestId, ...base };
}

export function buildEventKickAction(
  requestId: string,
  snapshot: { generation: number; event_id: string | null },
  targetPlayerId: string,
): Extract<EventRoomAction, { action: "KICK" }> {
  return {
    action: "KICK",
    request_id: requestId,
    generation: snapshot.generation,
    ...(snapshot.event_id ? { event_id: snapshot.event_id } : {}),
    target_player_id: targetPlayerId,
  };
}
