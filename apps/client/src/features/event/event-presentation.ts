import { HOST_EVENT_DISCONNECT_GRACE_SECONDS, type EventParticipantState, type EventRoomSnapshot, type EventRoundResult, type EventRoundResultEntry } from "@infinitas/shared";

export type EventChartSearchStatus = "IDLE" | "LOADING" | "READY" | "ERROR";

export function eventChartSearchMessage(status: EventChartSearchStatus, keyword: string, resultCount: number): string | null {
  if (status === "LOADING") return "全員が遊べる譜面を確認しています…";
  if (status === "ERROR") return "選曲候補を取得できませんでした。通信状態を確認して検索し直してください。";
  if (status !== "READY" || resultCount > 0) return null;
  return keyword.trim().length > 0
    ? "検索条件に一致する共通譜面はありません。"
    : "参加者全員の所持・解禁条件を満たす譜面がありません。";
}

export function buildEventInviteText(eventName: string, roomId: string, joinCode: string): string {
  return `${eventName}\nRoom ID: ${roomId}\n参加コード: ${joinCode}`;
}

export function eventRoundHeading(snapshot: EventRoomSnapshot, syncedRounds: EventRoundResult[]): string {
  if (snapshot.phase === "RESULT" || snapshot.phase === "CLOSED") return `全${syncedRounds.length}曲`;
  if (snapshot.phase === "PLAYING" && snapshot.round_phase === "RESULT" && snapshot.latest_result) {
    const resultIndex = syncedRounds.findIndex((round) => round.round_id === snapshot.latest_result?.round_id);
    return `第${resultIndex >= 0 ? resultIndex + 1 : syncedRounds.length + 1}曲`;
  }
  return `第${syncedRounds.length + 1}曲`;
}

export interface EventRankingRow extends EventRoundResultEntry {
  is_self: boolean;
}

export function eventTypeLabel(snapshot: EventRoomSnapshot): string {
  return snapshot.settings.event_type === "TOURNAMENT" ? "大会" : "合同プレー";
}

export function readySummary(snapshot: EventRoomSnapshot): { ready: number; target: number; pendingNext: number } {
  const targets = snapshot.participants.filter((participant) => !participant.pending_next && participant.connection_state !== "LEFT" && participant.connection_state !== "KICKED");
  return {
    ready: targets.filter((participant) => participant.ready).length,
    target: targets.length,
    pendingNext: snapshot.participants.filter((participant) => participant.pending_next).length,
  };
}

export function participantStatusLabel(participant: EventParticipantState): string {
  if (participant.pending_next) return "次曲から参加";
  if (participant.connection_state === "DISCONNECTED") return "切断中";
  if (participant.connection_state === "LEFT") return "退出";
  if (participant.connection_state === "KICKED") return "Kick済み";
  if (participant.round_status === "SUBMITTED") return "提出済み";
  if (participant.round_status === "SKIPPED") return "スキップ";
  if (participant.round_status === "ABSENT") return "欠場";
  return participant.ready ? "準備完了" : "未準備";
}

export function clientRankingRows(entries: EventRoundResultEntry[], selfPlayerId: string): EventRankingRow[] {
  const stable = [...entries].sort((left, right) => {
    if (left.rank === null && right.rank !== null) return 1;
    if (left.rank !== null && right.rank === null) return -1;
    return (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER);
  });
  const selected = new Set(stable.slice(0, 3).map((entry) => entry.player_id));
  const selfIndex = stable.findIndex((entry) => entry.player_id === selfPlayerId);
  if (selfIndex >= 0) {
    for (let index = Math.max(0, selfIndex - 2); index <= Math.min(stable.length - 1, selfIndex + 2); index += 1) {
      selected.add(stable[index]!.player_id);
    }
  }
  return stable.filter((entry) => selected.has(entry.player_id)).map((entry) => ({ ...entry, is_self: entry.player_id === selfPlayerId }));
}

export function startRoundBlockReason(snapshot: EventRoomSnapshot): string | null {
  if (snapshot.selected_chart === null) return "選曲を確定してください。";
  const summary = readySummary(snapshot);
  if (summary.ready === 0) return "準備完了した参加者がいません。";
  if (snapshot.settings.event_type === "TOURNAMENT" && summary.ready !== summary.target) return "大会は対象者全員の準備完了が必要です。";
  return null;
}

export function shouldShowCasualUnreadyExclusionWarning(
  snapshot: EventRoomSnapshot,
  playerId: string | null,
): boolean {
  if (snapshot.settings.event_type !== "CASUAL" || snapshot.phase !== "PICKING" || snapshot.selected_chart === null || playerId === null) {
    return false;
  }
  const self = snapshot.participants.find((participant) => participant.player_id === playerId);
  return self !== undefined && !self.pending_next && !self.ready && self.connection_state !== "LEFT" && self.connection_state !== "KICKED";
}

export function hostDisconnectSeconds(snapshot: EventRoomSnapshot, nowMs: number): number | null {
  if (snapshot.host_disconnect_deadline === null) return null;
  return Math.min(HOST_EVENT_DISCONNECT_GRACE_SECONDS, Math.max(0, Math.ceil((Date.parse(snapshot.host_disconnect_deadline) - nowMs) / 1000)));
}
