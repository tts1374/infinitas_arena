import { useEffect, useState } from "react";
import type { ChartSearchEntry } from "@infinitas/shared";
import { listRoomCharts } from "../services/worker-api-client";
import { eventRoomStore, useEventRoomStore } from "../stores/event-room-store";
import { useSettingsStore } from "../stores/settings-store";
import { displayEventName } from "../features/event/event-name";
import { EventOverallResults, EventRoundsReview, EventRoundResults } from "../features/event/EventFinalReview";
import { EventHostInvite, shouldShowEventHostInvite } from "../features/event/EventHostInvite";
import { canUseEventUiAction, type EventUiAction } from "../services/event-action-policy";
import { eventChartSearchMessage, eventEndReasonLabel, eventRoundHeading, eventTypeLabel, hostDisconnectSeconds, participantStatusLabel, participationSummary, startRoundBlockReason, type EventChartSearchStatus } from "../features/event/event-presentation";

export function EventRoomPage({ onReturnToLobby }: { onReturnToLobby: () => void }) {
  const state = useEventRoomStore((value) => value);
  const apiBaseUrl = useSettingsStore((value) => value.saved.apiBaseUrl);
  const [nowMs, setNowMs] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [charts, setCharts] = useState<ChartSearchEntry[]>([]);
  const [selectedChartKey, setSelectedChartKey] = useState<string | null>(null);
  const [chartSearchStatus, setChartSearchStatus] = useState<EventChartSearchStatus>("IDLE");
  const [viewedRoundId, setViewedRoundId] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"ROUND" | "OVERALL">("ROUND");
  const snapshot = state.snapshot;
  const isHost = state.sessionRole === "HOST";
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!snapshot || !isHost || snapshot.phase !== "PICKING" || snapshot.selected_chart !== null) return;
    let cancelled = false;
    setChartSearchStatus("LOADING");
    void listRoomCharts(apiBaseUrl, snapshot.room_id, { play_style: snapshot.settings.play_style, level_filter: "ANY", keyword: search, limit: 20 }).then((response) => {
      if (!cancelled) { setCharts(response.charts); setChartSearchStatus("READY"); }
    }).catch(() => { if (!cancelled) { setCharts([]); setChartSearchStatus("ERROR"); } });
    return () => { cancelled = true; };
  }, [apiBaseUrl, search, snapshot?.phase, snapshot?.selected_chart, snapshot?.room_id, snapshot?.settings.play_style, isHost]);
  if (!snapshot) return <div className="event-empty"><p>{state.errorMessage ?? "開催へ接続しています…"}</p><button type="button" onClick={() => { eventRoomStore.disconnect(); onReturnToLobby(); }}>通常対戦へ戻る</button></div>;
  const self = snapshot.participants.find((p) => p.player_id === state.playerId);
  const participants = [...snapshot.participants].sort((a, b) => Number(b.player_id === state.playerId) - Number(a.player_id === state.playerId));
  const summary = participationSummary(snapshot);
  const disconnectSeconds = hostDisconnectSeconds(snapshot, nowMs);
  const roundHeading = eventRoundHeading(snapshot, state.resultRounds);
  const startBlock = startRoundBlockReason(snapshot);
  const active = snapshot.phase === "PLAYING" && snapshot.round_phase === "ACTIVE";
  const roundResult = snapshot.phase === "PLAYING" && snapshot.round_phase === "RESULT";
  const final = snapshot.phase === "RESULT" || snapshot.phase === "CLOSED";
  const done = snapshot.participants.filter((p) => snapshot.current_playing_player_ids.includes(p.player_id) && ["SUBMITTED", "SKIPPED", "ABSENT"].includes(p.round_status ?? "")).length;
  const tournament = snapshot.settings.event_type === "TOURNAMENT";
  const metricLabel = snapshot.settings.win_metric === "SCORE" ? "SCORE" : "MISS COUNT";
  const validRounds = state.resultRounds.filter((round) => round.invalidated_at === null);
  const noValidRounds = state.resultsSyncComplete && validRounds.length === 0;
  const viewedRound = state.resultRounds.find((round) => round.round_id === viewedRoundId);
  const canUse = (action: EventUiAction) => canUseEventUiAction({ action, snapshot, sessionRole: state.sessionRole, playerId: state.playerId, mutationPending: state.pendingMutationRequestIds.length > 0 });
  const end = () => { if (window.confirm("開催を終了します。全員の開催が終了し、進行中の曲は無効になります。続けますか？")) eventRoomStore.endEvent(); };
  const invalidate = () => {
    const id = active ? snapshot.current_round_id : snapshot.latest_result?.round_id;
    const title = active ? snapshot.selected_chart?.display.title : snapshot.latest_result?.chart.display.title;
    if (id && window.confirm(`「${title ?? "この曲"}」を無効にします。全員の集計から除外し、履歴は保持します。続けますか？`)) eventRoomStore.invalidateRound(id);
  };
  return <div id="visual-capture-root" className="event-room">
    {disconnectSeconds !== null ? <div className="event-disconnected">Host再接続待ち・残り {disconnectSeconds}秒（提出は継続できます）</div> : null}
    <header className="event-room-header"><div><p>{eventTypeLabel(snapshot)} · {isHost ? snapshot.host.plays ? "プレー兼任Host" : "専任Host" : "参加者"}</p><h1>{displayEventName(snapshot.settings)}</h1></div><button type="button" onClick={onReturnToLobby}>← 通常対戦へ</button></header>
    <div className="event-layout"><section className="event-arena">
      <div className="event-song"><span className="event-phase">{final ? "最終結果" : snapshot.phase === "LOBBY" ? "待機室" : active ? "プレー・提出待ち" : roundResult ? "曲別結果" : snapshot.selected_chart ? "Host開始待ち" : "選曲"}</span><h2>{snapshot.selected_chart?.display.title ?? (snapshot.phase === "LOBBY" ? "参加者を待っています" : "曲を選ぶ")}</h2><p>{snapshot.selected_chart ? `${snapshot.settings.play_style} ${snapshot.selected_chart.expected_key.difficulty} Lv${snapshot.selected_chart.display.level ?? "-"} · ` : ""}{roundHeading} · {metricLabel}</p></div>
      {viewedRound ? <div className="event-content"><button type="button" onClick={() => setViewedRoundId(null)}>← 現在の開催へ戻る</button><h2>{viewedRound.chart.display.title}{viewedRound.invalidated_at ? "（無効）" : ""}</h2><EventRoundResults entries={viewedRound.results} metricLabel={metricLabel} isTournament={tournament} selfPlayerId={state.playerId} showAllInitially={isHost} /></div> : final || roundResult ? <div className="event-content">
        <h2>{final ? "最終結果" : `${roundHeading} 結果`}</h2>
        {tournament ? <div className="event-tabs"><button type="button" aria-pressed={resultTab === "ROUND"} onClick={() => setResultTab("ROUND")}>曲別</button><button type="button" aria-pressed={resultTab === "OVERALL"} onClick={() => setResultTab("OVERALL")}>総合</button></div> : null}
        {resultTab === "OVERALL" && tournament ? !noValidRounds ? <EventOverallResults entries={snapshot.overall_results ?? []} selfPlayerId={state.playerId} /> : <p>有効な確定曲はありません。優勝者はありません。</p> : final ? <EventRoundsReview rounds={state.resultRounds} metricLabel={metricLabel} isTournament={tournament} selfPlayerId={state.playerId} /> : <EventRoundResults key={snapshot.latest_result?.round_id} entries={snapshot.latest_result?.results ?? []} metricLabel={metricLabel} isTournament={tournament} selfPlayerId={state.playerId} showAllInitially={isHost} />}
        {final ? <p>終了理由：{eventEndReasonLabel(snapshot.end_reason)}{noValidRounds ? "／有効な確定曲はありません。優勝者はありません。" : !state.resultsSyncComplete ? "／公開結果を受信しています。" : ""}</p> : null}
      </div> : <>
        {snapshot.phase === "PICKING" && snapshot.selected_chart === null ? <div className="event-picking">{isHost ? <><input aria-label="曲検索" disabled={!snapshot.host.connected} value={search} onChange={(event) => { setSearch(event.currentTarget.value); setSelectedChartKey(null); }} placeholder="曲検索・全員が遊べる候補" />{eventChartSearchMessage(chartSearchStatus, search, charts.length) ? <p role="status">{eventChartSearchMessage(chartSearchStatus, search, charts.length)}</p> : null}<div className="event-chart-list">{charts.map((chart) => <button type="button" key={chart.chart_key} aria-pressed={selectedChartKey === chart.chart_key} onClick={() => setSelectedChartKey(chart.chart_key)}><b>{chart.title}</b><span>{chart.play_style} {chart.difficulty} Lv{chart.level}</span></button>)}</div></> : <p>Hostが選曲しています。</p>}</div> : null}
        <div className="event-counts">{active ? `提出・欠場確定 ${done}/${snapshot.current_playing_player_ids.length}人` : snapshot.phase === "LOBBY" ? `参加者 ${participants.filter((p) => p.connection_state === "CONNECTED" || p.connection_state === "DISCONNECTED").length}/20人` : `この曲の対象 ${summary.target}人`}<span>接続 {summary.connected}人{summary.pendingNext ? ` · 次曲から参加：${summary.pendingNext}人` : ""}</span></div>
        {active && self ? <p className="event-self">あなた：{participantStatusLabel(self)}{self.round_status === "PENDING" ? " · プレーすると連携ツールから結果を自動送信します。" : ""}</p> : null}
        {state.sourceUnavailableMessage && self?.round_status === "PENDING" ? <p role="alert" className="event-source-warning">結果取得元を利用できません：{state.sourceUnavailableMessage}。復旧を待つか、必要ならスキップしてください。</p> : null}
        <div className="event-player-grid" tabIndex={0} aria-label="参加対象・接続・提出状況">{participants.length === 0 ? <p className="event-no-players">参加者はいません。Hostは待機または終了できます。</p> : participants.map((p) => <article key={p.player_id} className={`event-player ${p.player_id === state.playerId ? "event-player-self" : ""}`}><b>{p.display_name}</b>{p.player_id === state.playerId ? <small>あなた{p.player_id === snapshot.host.player_id ? "・Host" : ""}</small> : null}<span>{p.connection_state === "DISCONNECTED" ? "切断中" : p.connection_state === "CONNECTED" ? "接続中" : p.connection_state === "LEFT" ? "退出" : "Kick済み"}</span><strong>{p.pending_next || p.round_status !== null ? participantStatusLabel(p) : snapshot.current_eligible_player_ids.includes(p.player_id) ? "この曲に参加" : "参加中"}</strong>{isHost && p.player_id !== snapshot.host.player_id && p.connection_state !== "KICKED" ? <button type="button" className="event-player-manage" disabled={!canUse("KICK")} aria-label={`${p.display_name}の管理`} onClick={() => window.confirm(`${p.display_name}をKickします。この開催には再参加できません。続けますか？`) && eventRoomStore.kick(p.player_id)}>…</button> : null}</article>)}</div>
      </>}
      <footer className="event-main-action">
        {snapshot.phase === "LOBBY" ? <><p>{isHost ? "参加者を確認して開催を開始します。" : "Hostの開催開始を待っています。"}</p>{isHost ? <button type="button" className="event-primary" disabled={!canUse("START_EVENT")} onClick={() => { const n = participants.filter((p) => p.connection_state === "CONNECTED" || p.connection_state === "DISCONNECTED").length; if (!tournament || window.confirm(`大会を${n}人で開始します。人数Nを固定し、新規参加を締め切ります。続けますか？`)) eventRoomStore.startEvent(); }}>開催開始</button> : null}</> : snapshot.phase === "PICKING" && !snapshot.selected_chart ? <>{isHost ? <button type="button" className="event-primary" disabled={!canUse("CONFIRM_PICK") || !charts.some((chart) => chart.chart_key === selectedChartKey)} onClick={() => { if (selectedChartKey) eventRoomStore.confirmPick(selectedChartKey); }}>この譜面を確定</button> : <p>Hostが選曲しています。</p>}</> : snapshot.phase === "PICKING" && snapshot.selected_chart ? <><p>{isHost ? "通話・配信で曲と開始を共有したら、プレー開始。" : self?.pending_next ? "次の曲から参加します。" : "ゲーム内で準備して、Hostの開始を待っています。"}{isHost && startBlock ? <small>{startBlock}</small> : null}</p>{isHost ? <button type="button" className="event-primary" disabled={startBlock !== null || !canUse("START_ROUND")} onClick={() => eventRoomStore.startRound()}>この曲のプレーを開始</button> : null}</> : active ? <p>自動提出・結果待ち。スコアと順位は曲確定後に公開します。</p> : roundResult ? <>{isHost ? <button type="button" className="event-primary" disabled={!canUse("NEXT_PICK")} onClick={() => { setViewedRoundId(null); setSelectedChartKey(null); eventRoomStore.nextPick(); }}>次の曲を選ぶ</button> : <p>Hostの次曲開始を待っています。</p>}</> : final ? <><p>受信範囲：{state.resultRounds.length}曲 · {state.resultsSyncComplete && snapshot.phase === "RESULT" ? "完全" : "部分"}記録</p><button type="button" onClick={() => { eventRoomStore.disconnect(); onReturnToLobby(); }}>通常対戦へ戻る</button></> : null}
      </footer>
    </section><aside className="event-side">
      <section><h2>ここまでの曲</h2>{state.resultRounds.length ? state.resultRounds.map((round, index) => <button className="event-history-round" type="button" key={round.round_id} onClick={() => setViewedRoundId(round.round_id)}>第{index + 1}曲 {round.chart.display.title}{round.invalidated_at ? "（無効）" : ""}</button>) : <p>曲別結果はここに残ります。</p>}</section>
      <section><h2>開催情報</h2><dl><dt>モード</dt><dd>{eventTypeLabel(snapshot)}</dd><dt>指標</dt><dd>{metricLabel}</dd><dt>参加者</dt><dd>{participants.filter((p) => p.connection_state === "CONNECTED" || p.connection_state === "DISCONNECTED").length}/20</dd><dt>Host</dt><dd>{snapshot.host.plays ? "プレー兼任" : "専任"}</dd>{tournament ? <><dt>固定N</dt><dd>{snapshot.scoring_size_n ?? "開始前"}</dd></> : null}</dl></section>
      {shouldShowEventHostInvite(isHost, snapshot.phase) ? <EventHostInvite eventName={displayEventName(snapshot.settings)} roomId={snapshot.room_id} joinCode={snapshot.settings.join_code} /> : null}
      <details className="event-management"><summary>開催の管理</summary>{isHost && !final ? <>
        {snapshot.phase === "PICKING" && snapshot.selected_chart ? <button type="button" disabled={!canUse("CANCEL_PICK")} onClick={() => window.confirm("確定した譜面を取り消します。新しい譜面を参加者へ再共有してください。続けますか？") && eventRoomStore.cancelPick()}>選び直す</button> : null}
        {active ? <button type="button" disabled={!canUse("CLOSE_ROUND")} onClick={() => window.confirm(`未提出${Math.max(0, snapshot.current_playing_player_ids.length - done)}人を欠場として締め切ります。以降、この曲への提出はできません。${tournament ? "欠場は0ptです。" : ""}`) && eventRoomStore.closeRound()}>未提出を締め切る</button> : null}
        {(active || snapshot.latest_result) ? <button type="button" disabled={!canUse("INVALIDATE_ROUND") || (!active && snapshot.latest_result?.invalidated_at !== null)} onClick={invalidate}>{snapshot.phase === "PICKING" ? "前の曲を無効にする" : "この曲を無効にする"}</button> : null}
        <button type="button" disabled={!canUse("END_EVENT")} onClick={end}>開催を終了</button>
      </> : !isHost && !final ? <button type="button" disabled={state.leavePending || !canUse("LEAVE")} onClick={() => window.confirm("この開催から退出します。一時切断とは異なり、復帰しても確定済みの曲へ戻れず次曲から参加します。続けますか？") && eventRoomStore.leave()}>{state.leavePending ? "退出処理中…" : "開催から退出"}</button> : <p>開催は終了しました。</p>}</details>
      {self?.round_status === "PENDING" && active ? <button type="button" disabled={!canUse("SKIP")} onClick={() => window.confirm(`この曲をスキップし、自分を欠場として確定します。${tournament ? "大会では0ptです。" : ""}続けますか？`) && eventRoomStore.skip()}>この曲をスキップする</button> : null}
      <p className="event-save-status">公開結果の受信範囲：{state.resultsSyncComplete && snapshot.phase === "RESULT" ? "完全" : "部分"} · {state.resultRounds.length}曲</p>
    </aside></div>
    {state.errorMessage ? <div role="alert" className="event-error">{state.errorMessage}<button type="button" aria-label="エラーを閉じる" onClick={() => eventRoomStore.clearError()}>×</button></div> : null}
  </div>;
}
