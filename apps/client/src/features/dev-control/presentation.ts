import type { DevControlAction, DevControlClientState, DevControlResultStatus, DevControlState, SendPolicy } from "../../dev-control/protocol";

export const modeNames: Record<DevControlState["mode"], string> = { ARENA: "ARENA", BPL: "BPL", BPL4: "BPL4", CASUAL: "合同プレー", TOURNAMENT: "大会" };
export const policyNames: Record<SendPolicy, string> = { manual: "手動", auto: "毎曲自動", delay: "10秒後", hold: "送らずに待つ" };
export const operationStatusNames: Record<DevControlResultStatus, string> = {
  pending: "操作受付・返答待ち", reserved: "10秒後の送信を予約中", "input-written": "入力元へ投入しました（受付未確認）", parsed: "解析を観測しました（受付未確認）", sent: "送信しました（受付未確認）", confirmed: "操作結果を確認しました", rejected: "拒否されました", unknown: "結果不明・再同期で確認が必要です", cancelled: "未投入予約を取り消しました", failed: "失敗しました",
};
const phaseNames: Record<string, string> = { N0: "準備待ち", N1: "アプリで曲を選ぶ", N2: "ゲーム内選曲・開始カウント", N3: "結果の提出待ち", N4: "この曲の結果", N5: "対戦の最終結果", N6: "部屋が終了しました", E0: "参加者待ち", E1: "主催者の選曲", E2: "プレー開始待ち", E3: "結果の提出待ち", E4: "この曲の結果", E5: "開催の最終結果", E6: "部屋が終了しました" };
export function phaseName(client: DevControlClientState | undefined): string { return phaseNames[client?.displayPhase ?? ""] ?? "最新の部屋情報を待っています"; }
export function personName(client: DevControlClientState, state: DevControlState): string {
  if (client.manifest.role === "self") return "自分";
  const id = client.manifest.playerId;
  return client.eventSnapshot?.participants.find(p => p.player_id === id)?.display_name
    ?? client.normalSnapshot?.players.find(p => p.player_id === id)?.display_name
    ?? `相手${state.clients.filter(p => p.manifest.role === "participant").findIndex(p => p.manifest.clientId === client.manifest.clientId) + 1}`;
}
export function actionAvailability(client: DevControlClientState | undefined, action: DevControlAction) {
  return client?.actions.find(item => item.action === action) ?? { action, enabled: false, reason: "最新の操作条件を待っています。" };
}
export function participantStatus(client: DevControlClientState): string {
  const id = client.manifest.playerId;
  const member = client.eventSnapshot?.participants.find(p => p.player_id === id);
  if (client.connection === "LEFT" || member?.connection_state === "LEFT") return "退出済み";
  if (member?.connection_state === "KICKED") return "退出済み（退室処理）";
  if (client.connection === "DISCONNECTED" || member?.connection_state === "DISCONNECTED") return "接続が切れています";
  if (member?.round_status === "ABSENT") return "欠場確定";
  if (member?.round_status === "SKIPPED") return "スキップ確定";
  if (member?.round_status === "SUBMITTED") return "提出済み";
  if (member?.pending_next) return "次曲から参加";
  if (client.eventSnapshot?.phase === "PLAYING" && !client.eventSnapshot.current_playing_player_ids.includes(id ?? "")) return "当該曲の対象外";
  const normal = client.normalSnapshot;
  const confirmed = normal?.current_round?.confirmed.find(p => p.player_id === id);
  if (confirmed) return confirmed.status === "PLAYED" ? "提出済み" : confirmed.status === "TIMEOUT" ? "時間切れ確定" : "スキップ確定";
  if (client.displayPhase === "N0") return normal?.players.find(p => p.player_id === id)?.ready ? "準備完了" : "準備待ち";
  if (client.displayPhase === "N1") return `選曲 ${normal?.picks.filter(p => p.player_id === id).length ?? 0}/${normal?.settings.mode === "BPL4" ? 2 : 1}曲`;
  return client.connection === "CONNECTED" ? "接続中" : "接続しています";
}
export function currentProgress(snapshot: NonNullable<DevControlClientState["eventSnapshot"]>): { done: number; total: number } {
  const playing = new Set(snapshot.current_playing_player_ids);
  return { total: playing.size, done: snapshot.participants.filter(p => playing.has(p.player_id) && p.round_status !== null && p.round_status !== "PENDING").length };
}
export function hostAction(client: DevControlClientState | undefined): DevControlAction | null {
  return ({ N0: "match.start", N5: "match.returnToLobby", E0: "event.start", E1: "event.confirmPick", E2: "event.startRound", E4: "event.nextPick" } as Partial<Record<string, DevControlAction>>)[client?.displayPhase ?? ""] ?? null;
}
export const actionNames: Partial<Record<DevControlAction, string>> = {
  "ready.set": "準備完了にする", "pick.submit": "この人の曲を選ぶ", "match.start": "対戦を開始する", "match.returnToLobby": "待機室へ戻って再戦する", "event.start": "開催を開始する", "event.confirmPick": "主催者が曲を確定する", "event.startRound": "この曲を開始", "event.nextPick": "次の曲を選ぶ", "event.cancelPick": "確定を取り消して選び直す…", "event.closeRound": "未提出の人を欠場にして締め切る…", "match.forceAdvance": "未提出の人を時間切れにして進む…", "event.end": "開催を終了する…", "participant.disconnect": "接続を切る（席は残す）", "participant.reconnect": "同じ人としてつなぎ直す", "participant.leave": "この部屋から退出する…", "client.focus": "この人の画面を表示", "session.stop": "動作確認を終了する…",
};
export function resultMessage(client: DevControlClientState, lifecycle: DevControlState["lifecycle"]): string {
  if (lifecycle === "starting") return "専用sessionを起動しています。結果はまだ送れません。";
  if (lifecycle === "stopping") return "終了処理中です。停止の確認が終わるまで、新しい操作はできません。";
  if (lifecycle === "failed") return "動作確認で失敗が発生しました。停止と保存の記録を確認してください。";
  if (lifecycle !== "running") return "動作確認は終了しています。記録を保存するか、最初からやり直せます。";
  if (/[56]$/.test(client.displayPhase ?? "")) return "終了しました。記録を保存するか、最初からやり直せます。";
  const status = participantStatus(client);
  if (status === "提出済み") return "この人の結果は受け付けられました";
  if (status === "欠場確定") return "この曲は欠場で確定しました";
  if (status === "時間切れ確定" || status === "スキップ確定") return `この曲は${status}しました`;
  if (status === "次曲から参加" || status === "当該曲の対象外") return "この人は次の曲から参加します（当該曲の対象外）";
  if (status === "退出済み") return "退出済みです。再入室とは別の操作です。";
  if (status === "接続が切れています") return "接続が切れています。同じ人としてつなぎ直せます。";
  if (/[012]$/.test(client.displayPhase ?? "")) return "プレーが始まったら、結果を送れます";
  if (client.displayPhase === "N4" || client.displayPhase === "E4") return "この曲の公開結果を確認しています。次の曲の値を設定できます。";
  return client.policy === "auto" ? "毎曲、プレー開始後に自動で送る設定です" : client.policy === "hold" ? "この人は結果を送らずに待つ設定です" : "この曲への提出条件を確認しています";
}
export function parseDraftValue(value: string): number | null { return value.trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null; }
export function resultPayload(client: DevControlClientState): Record<string, unknown> {
  return client.policy === "delay" ? { valueRevision: client.context.valueRevision, delayMs: 10000 } : { valueRevision: client.context.valueRevision };
}
