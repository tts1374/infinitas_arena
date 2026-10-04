import type { EventOverallResultEntry, EventRoundResult } from "@infinitas/shared";

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
  return <div className="space-y-4">{rounds.map((round, index) => <section key={round.round_id} className="min-w-0 rounded-xl border border-white/10 p-3"><h3 className="mb-2 break-words font-black">第{index + 1}曲 {round.chart.display.title}{round.invalidated_at ? "（無効）" : ""}</h3><div className="space-y-2">{round.results.map((entry) => <div key={entry.player_id} className={`grid min-w-0 grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-lg px-3 py-2 sm:grid-cols-[60px_minmax(0,1fr)_150px_80px] sm:gap-y-0 ${entry.player_id === selfPlayerId ? "bg-cyan-500/15" : "bg-white/[0.04]"}`}><span>{entry.rank === null ? "欠場" : `${entry.rank}位`}</span><span className="min-w-0 break-words font-bold">{entry.display_name}{entry.absence_reason ? <small className="ml-2 text-amber-300">{entry.absence_reason}</small> : null}</span><span className="col-start-2 text-sm sm:col-start-auto sm:text-base">{metricLabel} {entry.metric_value}</span><span className="col-start-2 text-sm sm:col-start-auto sm:text-base">{isTournament ? `${entry.tournament_points ?? 0}pt` : ""}</span></div>)}</div></section>)}</div>;
}

export function EventOverallResults({ entries, selfPlayerId }: { entries: EventOverallResultEntry[]; selfPlayerId: string | null }) {
  if (entries.length === 0) return <p className="text-gray-400">確定済み曲の総合結果はありません。</p>;
  return <div className="space-y-2">{entries.map((entry) => <div key={entry.player_id} className={`grid grid-cols-[70px_1fr_100px] rounded-xl px-4 py-3 ${entry.player_id === selfPlayerId ? "bg-cyan-500/15" : "bg-white/[0.04]"}`}><span>{entry.rank}位</span><span className="font-bold">{entry.display_name}</span><span>{entry.total_points}pt</span></div>)}</div>;
}
