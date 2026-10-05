import type { EventOverallResultEntry, EventRoundResult, EventRoundResultEntry } from "@infinitas/shared";
import { useState } from "react";
import { clientRankingRows, eventAbsenceReasonLabel } from "./event-presentation";

export function EventRoundResults({ entries, metricLabel, isTournament, selfPlayerId, showAllInitially = false }: { entries: EventRoundResultEntry[]; metricLabel: string; isTournament: boolean; selfPlayerId: string | null; showAllInitially?: boolean }) {
  const [showAll, setShowAll] = useState(showAllInitially);
  const visible = showAll || !selfPlayerId ? entries : clientRankingRows(entries, selfPlayerId);
  if (entries.length === 0) return <p>確定した曲はありません。</p>;
  return <div>
    <div className="event-rank-cards">{visible.filter((entry) => entry.rank !== null && entry.rank <= 3).map((entry) => <article key={entry.player_id} className={entry.rank === 1 ? "event-rank-winner" : ""}><strong>{entry.rank}位</strong><b>{entry.display_name}</b><span>{metricLabel} {entry.metric_value}</span>{isTournament ? <span>{entry.tournament_points ?? 0}pt</span> : null}</article>)}</div>
    <div className="event-result-table">{visible.map((entry) => <div key={entry.player_id} className={`event-result-row ${entry.player_id === selfPlayerId ? "event-result-self" : ""}`}><span>{entry.rank === null ? "欠場" : `${entry.rank}位`}</span><b>{entry.display_name}{entry.absence_reason ? <small> · {eventAbsenceReasonLabel(entry.absence_reason)}</small> : null}</b><span>{metricLabel} {entry.metric_value}</span>{isTournament ? <span>{entry.tournament_points ?? 0}pt</span> : null}</div>)}</div>
    {!showAllInitially && selfPlayerId && clientRankingRows(entries, selfPlayerId).length < entries.length ? <button type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "自分の周辺に戻す" : "全順位を見る"}</button> : null}
  </div>;
}

export function EventRoundsReview({
  rounds,
  metricLabel,
  isTournament,
  selfPlayerId,
}: {
  rounds: EventRoundResult[];
  metricLabel: string;
  isTournament: boolean;
  selfPlayerId: string | null;
}) {
  if (rounds.length === 0) return <p className="text-gray-400">確定した曲はありません。</p>;
  return <div className="space-y-4">{rounds.map((round, index) => <section key={round.round_id} className="min-w-0 rounded-xl border border-white/10 p-3"><h3 className="mb-2 break-words font-black">第{index + 1}曲 {round.chart.display.title}{round.invalidated_at ? "（無効）" : ""}</h3><div className="space-y-2">{round.results.map((entry) => <div key={entry.player_id} className={`grid min-w-0 grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-lg px-3 py-2 sm:grid-cols-[60px_minmax(0,1fr)_150px_80px] sm:gap-y-0 ${entry.player_id === selfPlayerId ? "bg-cyan-500/15" : "bg-white/[0.04]"}`}><span>{entry.rank === null ? "欠場" : `${entry.rank}位`}</span><span className="min-w-0 break-words font-bold">{entry.display_name}{entry.absence_reason ? <small className="ml-2 text-amber-300">{eventAbsenceReasonLabel(entry.absence_reason)}</small> : null}</span><span className="col-start-2 text-sm sm:col-start-auto sm:text-base">{metricLabel} {entry.metric_value}</span><span className="col-start-2 text-sm sm:col-start-auto sm:text-base">{isTournament ? `${entry.tournament_points ?? 0}pt` : ""}</span></div>)}</div></section>)}</div>;
}

export function EventOverallResults({ entries, selfPlayerId }: { entries: EventOverallResultEntry[]; selfPlayerId: string | null }) {
  if (entries.length === 0) return <p className="text-gray-400">確定済み曲の総合結果はありません。</p>;
  return <div className="event-result-table">{entries.map((entry) => <div key={entry.player_id} className={`event-result-row ${entry.rank === 1 ? "event-rank-winner" : ""} ${entry.player_id === selfPlayerId ? "event-result-self" : ""}`}><span>{entry.rank}位</span><b>{entry.display_name}</b><span>{entry.total_points}pt</span></div>)}</div>;
}
