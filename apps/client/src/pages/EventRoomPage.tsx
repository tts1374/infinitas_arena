import { useEffect, useMemo, useState } from "react";
import type { ChartSearchEntry, EventRoundResultEntry } from "@infinitas/shared";
import { listRoomCharts } from "../services/worker-api-client";
import { eventRoomStore, useEventRoomStore } from "../stores/event-room-store";
import { useSettingsStore } from "../stores/settings-store";
import { displayEventName } from "../features/event/event-name";
import { EventOverallResults, EventRoundsReview } from "../features/event/EventFinalReview";
import { EventHostInvite, shouldShowEventHostInvite } from "../features/event/EventHostInvite";
import { canUseEventUiAction, type EventUiAction } from "../services/event-action-policy";
import {
  clientRankingRows,
  eventChartSearchMessage,
  eventRoundHeading,
  type EventChartSearchStatus,
  eventTypeLabel,
  hostDisconnectSeconds,
  participantStatusLabel,
  readySummary,
  shouldShowCasualUnreadyExclusionWarning,
  startRoundBlockReason,
} from "../features/event/event-presentation";

const EMPTY_ROUND_RESULTS: EventRoundResultEntry[] = [];

export function EventRoomPage({ onReturnToLobby }: { onReturnToLobby: () => void }) {
  const state = useEventRoomStore((value) => value);
  const apiBaseUrl = useSettingsStore((value) => value.saved.apiBaseUrl);
  const [nowMs, setNowMs] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [charts, setCharts] = useState<ChartSearchEntry[]>([]);
  const [chartSearchStatus, setChartSearchStatus] = useState<EventChartSearchStatus>("IDLE");
  const [showAllRanks, setShowAllRanks] = useState(false);
  const [resultTab, setResultTab] = useState<"ROUND" | "OVERALL">("ROUND");
  const snapshot = state.snapshot;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if ((snapshot?.phase === "RESULT" || snapshot?.phase === "CLOSED") && snapshot.settings.event_type === "TOURNAMENT") {
      setResultTab("OVERALL");
    }
  }, [snapshot?.phase, snapshot?.settings.event_type]);

  useEffect(() => {
    if (!snapshot || state.sessionRole !== "HOST" || snapshot.phase !== "PICKING") return;
    let cancelled = false;
    setChartSearchStatus("LOADING");
    void listRoomCharts(apiBaseUrl, snapshot.room_id, {
      play_style: snapshot.settings.play_style,
      level_filter: "ANY",
      keyword: search,
      limit: 20,
    }).then((response) => {
      if (!cancelled) {
        setCharts(response.charts);
        setChartSearchStatus("READY");
      }
    }).catch(() => {
      if (!cancelled) {
        setCharts([]);
        setChartSearchStatus("ERROR");
      }
    });
    return () => { cancelled = true; };
  }, [apiBaseUrl, search, snapshot?.phase, snapshot?.revision, snapshot?.room_id, snapshot?.settings.play_style, state.sessionRole]);

  const self = snapshot?.participants.find((participant) => participant.player_id === state.playerId) ?? null;
  const isHost = state.sessionRole === "HOST";
  const summary = snapshot ? readySummary(snapshot) : null;
  const disconnectSeconds = snapshot ? hostDisconnectSeconds(snapshot, nowMs) : null;
  const resultEntries = snapshot?.latest_result?.results ?? EMPTY_ROUND_RESULTS;
  const visibleResults = useMemo(() => {
    if (isHost || showAllRanks || !state.playerId) return resultEntries;
    return clientRankingRows(resultEntries, state.playerId);
  }, [isHost, resultEntries, showAllRanks, state.playerId]);

  if (!snapshot) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 text-gray-400"><p>{state.errorMessage ?? "開催へ接続しています…"}</p>{state.errorMessage || state.connectionStatus === "DISCONNECTED" ? <button type="button" onClick={() => { eventRoomStore.disconnect(); onReturnToLobby(); }} className="rounded-xl border border-white/20 px-5 py-3 font-bold text-white">ロビーへ戻る</button> : null}</div>;
  }

  const roundHeading = eventRoundHeading(snapshot, state.resultRounds);
  const startBlock = startRoundBlockReason(snapshot);
  const submissionDone = snapshot.participants.filter((participant) => participant.round_status === "SUBMITTED" || participant.round_status === "SKIPPED" || participant.round_status === "ABSENT").length;
  const metricLabel = snapshot.settings.win_metric === "SCORE" ? "SCORE" : "MISS COUNT";
  const showingRoundResult = snapshot.phase === "PLAYING" && snapshot.round_phase === "RESULT";
  const showingFinalResult = snapshot.phase === "RESULT" || snapshot.phase === "CLOSED";
  const mutationPending = state.pendingMutationRequestIds.length > 0;
  const chartSearchMessage = eventChartSearchMessage(chartSearchStatus, search, charts.length);
  const eventName = displayEventName(snapshot.settings);
  const showCasualUnreadyWarning = shouldShowCasualUnreadyExclusionWarning(snapshot, state.playerId);
  const canUse = (action: EventUiAction) => canUseEventUiAction({
    action,
    snapshot,
    sessionRole: state.sessionRole,
    playerId: state.playerId,
    mutationPending,
  });

  function leave(): void {
    if (showingFinalResult) {
      eventRoomStore.disconnect();
      onReturnToLobby();
      return;
    }
    if (!window.confirm(isHost ? "開催を終了しますか？" : "この開催から退出しますか？")) return;
    if (isHost) eventRoomStore.endEvent(); else eventRoomStore.leave();
  }

  return (
    <div id="visual-capture-root" className="relative flex h-screen min-w-0 flex-col overflow-hidden bg-[#1e1e1e] text-white">
      {disconnectSeconds !== null ? (
        <div className="shrink-0 bg-amber-500 px-5 py-2 text-center text-sm font-black text-black">
          Host再接続待ち・残り {disconnectSeconds}秒（提出は継続できます）
        </div>
      ) : null}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-black tracking-[0.22em] text-cyan-400">{eventTypeLabel(snapshot)}</p>
          <h1 className="text-2xl font-black">{eventName}</h1>
        </div>
        <div className="flex items-center gap-4"><span className="font-bold text-gray-300">{roundHeading}</span><button type="button" disabled={state.leavePending || (!showingFinalResult && !canUse(isHost ? "END_EVENT" : "LEAVE"))} onClick={leave} className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-300 disabled:cursor-not-allowed disabled:opacity-50">{state.leavePending ? "退出処理中…" : showingFinalResult ? "ロビーへ戻る" : isHost ? "開催を終了" : "退出"}</button></div>
      </header>

      {shouldShowEventHostInvite(isHost, snapshot.phase) ? <EventHostInvite eventName={eventName} roomId={snapshot.room_id} joinCode={snapshot.settings.join_code} /> : null}

      <div className="shrink-0 border-b border-white/5 px-4 py-3 sm:px-6">
        <span className="font-black">準備完了 {summary?.ready ?? 0}/{summary?.target ?? 0}人</span>
        <span className="ml-3 text-xs text-gray-600">最大20人</span>
        {summary && summary.pendingNext > 0 ? <span className="ml-5 text-sm text-amber-300">次曲から参加：{summary.pendingNext}人</span> : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-3 lg:flex-row lg:gap-5 lg:p-5">
        <section className="custom-scrollbar min-h-[260px] min-w-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:p-5">
          {snapshot.phase === "LOBBY" ? (
            <div className="flex h-full flex-col items-center justify-center gap-4"><p className="text-gray-400">1人以上の参加者を確認して開催を開始します。</p>{isHost ? <button type="button" disabled={!canUse("START_EVENT")} onClick={() => eventRoomStore.startEvent()} className="rounded-xl bg-cyan-500 px-6 py-3 font-black text-black disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500">開催開始</button> : null}</div>
          ) : null}
          {snapshot.phase === "PICKING" ? (
            <div>
              <h2 className="mb-4 text-lg font-black">選曲</h2>
              {snapshot.selected_chart ? (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4"><p className="text-xl font-black">{snapshot.selected_chart.display.title}</p><p className="text-sm text-gray-400">{snapshot.settings.play_style}・{snapshot.selected_chart.expected_key.difficulty}・Lv{snapshot.selected_chart.display.level ?? "-"}</p>{isHost ? <button type="button" disabled={!canUse("CANCEL_PICK")} onClick={() => eventRoomStore.cancelPick()} className="mt-3 rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-50">選び直す</button> : null}</div>
              ) : isHost ? (
                <><input aria-label="曲検索" disabled={!snapshot.host.connected || mutationPending} value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="曲検索・全員が遊べる候補" className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 disabled:opacity-50"/>{chartSearchMessage ? <p role={chartSearchStatus === "ERROR" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${chartSearchStatus === "ERROR" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-white/10 bg-black/20 text-gray-400"}`}>{chartSearchMessage}</p> : null}<div className="space-y-2">{charts.map((chart) => <button type="button" disabled={!canUse("CONFIRM_PICK")} key={chart.chart_key} onClick={() => eventRoomStore.confirmPick(chart.chart_key)} className="flex w-full items-center justify-between rounded-xl border border-white/10 p-3 text-left hover:border-cyan-500/50 disabled:opacity-50"><span><b>{chart.title}</b><small className="ml-2 text-gray-500">{chart.artist}</small></span><span className="text-sm text-gray-400">{chart.play_style} {chart.difficulty} Lv{chart.level}</span></button>)}</div></>
              ) : <p className="text-gray-400">Hostが選曲しています。</p>}
              {self && !self.pending_next && snapshot.selected_chart ? <button type="button" disabled={!canUse("SET_READY")} onClick={() => eventRoomStore.setReady(!self.ready)} className="mt-5 rounded-xl bg-cyan-500 px-5 py-3 font-black text-black disabled:opacity-50">{self.ready ? "準備解除" : "準備完了"}</button> : null}
              {showCasualUnreadyWarning ? <p role="alert" className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200">未準備のままHostが開始すると、この曲のプレー対象外になります。</p> : null}
              {isHost ? <div className="mt-5 flex items-center gap-4"><button type="button" disabled={startBlock !== null || !canUse("START_ROUND")} onClick={() => { if (snapshot.settings.event_type === "CASUAL" && summary && summary.ready < summary.target && !window.confirm(`未準備の${summary.target-summary.ready}人はこの曲に参加しません。続けますか？`)) return; eventRoomStore.startRound(); }} className="rounded-xl bg-cyan-500 px-6 py-3 font-black text-black disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500">プレー開始</button>{startBlock ? <span className="text-sm text-amber-300">開始不可：{startBlock}</span> : null}</div> : null}
            </div>
          ) : null}
          {snapshot.phase === "PLAYING" && snapshot.round_phase === "ACTIVE" ? (
            <div className="space-y-5"><h2 className="text-xl font-black">{snapshot.selected_chart?.display.title}</h2><p className="text-gray-300">自分：{self ? participantStatusLabel(self) : "進行専任Host"}</p><p className="font-black">提出完了 {submissionDone}/{snapshot.current_playing_player_ids.length}人</p>{state.sourceUnavailableMessage && self?.round_status === "PENDING" ? <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">結果取得元を利用できません：{state.sourceUnavailableMessage}。復旧を待つか、必要ならスキップしてください。</p> : null}{self?.round_status === "PENDING" ? <button type="button" disabled={!canUse("SKIP")} onClick={() => eventRoomStore.skip()} className="rounded-xl border border-amber-500/50 px-5 py-3 font-bold text-amber-300 disabled:opacity-50">スキップ</button> : null}{isHost ? <div className="flex gap-3"><button type="button" disabled={!canUse("CLOSE_ROUND")} onClick={() => { const absent = snapshot.current_playing_player_ids.length-submissionDone; if (window.confirm(`未提出${Math.max(0, absent)}人を欠場として締め切りますか？`)) eventRoomStore.closeRound(); }} className="rounded-xl bg-cyan-500 px-5 py-3 font-black text-black disabled:opacity-50">締め切って結果へ</button><button type="button" disabled={!canUse("INVALIDATE_ROUND")} onClick={() => snapshot.current_round_id && window.confirm("この曲を無効にしますか？") && eventRoomStore.invalidateRound(snapshot.current_round_id)} className="rounded-xl border border-red-500/40 px-5 py-3 font-bold text-red-300 disabled:opacity-50">この曲を無効にする</button></div> : null}</div>
          ) : null}
          {(showingRoundResult || showingFinalResult) ? <div><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">{showingFinalResult ? "最終結果" : `${roundHeading} 結果`}</h2>{snapshot.settings.event_type === "TOURNAMENT" ? <div className="flex rounded-lg bg-black/30 p-1"><button type="button" onClick={() => setResultTab("ROUND")} className={`rounded-md px-3 py-1 text-sm ${resultTab === "ROUND" ? "bg-cyan-500 font-black text-black" : "text-gray-400"}`}>曲別</button><button type="button" onClick={() => setResultTab("OVERALL")} className={`rounded-md px-3 py-1 text-sm ${resultTab === "OVERALL" ? "bg-cyan-500 font-black text-black" : "text-gray-400"}`}>総合</button></div> : null}</div>{showingFinalResult ? (resultTab === "OVERALL" && snapshot.settings.event_type === "TOURNAMENT" ? <EventOverallResults entries={snapshot.overall_results ?? []} selfPlayerId={state.playerId} /> : <EventRoundsReview rounds={state.resultRounds} metricLabel={metricLabel} isTournament={snapshot.settings.event_type === "TOURNAMENT"} selfPlayerId={state.playerId} />) : <ResultView entries={visibleResults} metricLabel={metricLabel} isTournament={snapshot.settings.event_type === "TOURNAMENT"} selfPlayerId={state.playerId} />}</div> : null}
          {showingRoundResult && isHost ? <div className="mt-5 flex gap-3"><button type="button" disabled={!canUse("NEXT_PICK")} onClick={() => eventRoomStore.nextPick()} className="rounded-xl bg-cyan-500 px-5 py-3 font-black text-black disabled:opacity-50">次の曲を選ぶ</button><button type="button" disabled={!canUse("END_EVENT")} onClick={leave} className="rounded-xl border border-white/20 px-5 py-3 disabled:opacity-50">開催を終了</button>{snapshot.latest_result ? <button type="button" disabled={!canUse("INVALIDATE_ROUND")} onClick={() => eventRoomStore.invalidateRound(snapshot.latest_result!.round_id)} className="ml-auto text-sm text-red-300 disabled:opacity-50">… 曲を無効化</button> : null}</div> : null}
          {showingFinalResult ? <p className="mt-5 text-sm text-gray-400">終了理由：{snapshot.end_reason ?? "-"}{state.resultRounds.length === 0 ? "／確定した曲はありません" : ""}</p> : null}
          {!isHost && resultEntries.length > visibleResults.length ? <button type="button" onClick={() => setShowAllRanks((value) => !value)} className="mt-4 text-sm font-bold text-cyan-300">{showAllRanks ? "自分の周辺に戻す" : "全順位を見る"}</button> : null}
        </section>

        <aside className="custom-scrollbar h-[42%] w-full shrink-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:h-auto lg:w-[min(34vw,380px)]">
          <h2 className="mb-3 font-black">参加者</h2>
          {snapshot.participants.length === 0 ? <p className="text-sm text-gray-500">参加者はいません。Hostは待機または終了できます。</p> : snapshot.participants.map((participant) => <div key={participant.player_id} className="flex items-center justify-between border-b border-white/5 py-3"><span className="font-bold">{participant.display_name}</span><span className="flex items-center gap-2 text-xs text-gray-400">{participantStatusLabel(participant)}{isHost && participant.player_id !== snapshot.host.player_id && participant.connection_state !== "KICKED" ? <button type="button" disabled={!canUse("KICK")} aria-label={`${participant.display_name}をKick`} onClick={() => window.confirm(`${participant.display_name}をKickします。この開催には再参加できません。`) && eventRoomStore.kick(participant.player_id)} className="ml-2 rounded px-2 py-1 text-red-300 disabled:opacity-50">…</button> : null}</span></div>)}
        </aside>
      </div>
      {state.errorMessage ? <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-red-950 px-4 py-3 text-sm text-red-200">{state.errorMessage}<button type="button" onClick={() => eventRoomStore.clearError()} className="ml-3">×</button></div> : null}
    </div>
  );
}

function ResultView({ entries, metricLabel, isTournament, selfPlayerId }: { entries: EventRoundResultEntry[]; metricLabel: string; isTournament: boolean; selfPlayerId: string | null }) {
  if (entries.length === 0) return <p className="text-gray-400">確定した曲はありません。</p>;
  return <div className="space-y-2">{entries.map((entry) => <div key={entry.player_id} className={`grid min-w-0 grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-xl px-4 py-3 sm:grid-cols-[60px_minmax(0,1fr)_150px_80px] sm:gap-y-0 ${entry.player_id === selfPlayerId ? "bg-cyan-500/15" : "bg-white/[0.04]"}`}><span>{entry.rank === null ? "欠場" : `${entry.rank}位`}</span><span className="min-w-0 break-words font-bold">{entry.display_name}{entry.absence_reason ? <small className="ml-2 text-amber-300">{entry.absence_reason}</small> : null}</span><span className="col-start-2 text-sm sm:col-start-auto sm:text-base">{metricLabel} {entry.metric_value}</span><span className="col-start-2 text-sm sm:col-start-auto sm:text-base">{isTournament ? `${entry.tournament_points ?? 0}pt` : ""}</span></div>)}</div>;
}
