import type { PlayStyle } from "@infinitas/shared";
import { useState, type ReactNode } from "react";
import { Activity, BarChart3, ChevronLeft, History, TrendingUp, ZapOff } from "lucide-react";
import type { ChartRankingEntry, DetailedMatchHistoryEntry, StatsMatchResult } from "../features/stats/models";
import {
  getChartRankings,
  getCurrentRating,
  getDetailedMatchHistory,
  getStabilitySummary,
} from "../features/stats/stats";
import { useStatsArchiveStore } from "../services/stats-archive";
import { formatDateTime } from "../utils/format";

const RULE_OPTIONS = ["ARENA", "BPL"] as const;
const PLAY_MODE_OPTIONS = ["SP", "DP"] as const;
const RATING_TREND_LIMIT = 20;
const MATCH_HISTORY_LIMIT = 10;

type RuleFilter = (typeof RULE_OPTIONS)[number];

function formatCompactNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1).replace(/\.?0+$/, "");
}

function formatRating(value: number | null): string {
  return value === null ? "--" : String(Math.round(value));
}

function formatDelta(value: number | null): string {
  if (value === null) {
    return "--";
  }

  if (value === 0) {
    return "±0";
  }

  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

function formatChartMeta(entry: ChartRankingEntry): string {
  return entry.chart_level === null ? entry.chart_difficulty : `${entry.chart_difficulty} / Lv${entry.chart_level}`;
}

function formatMatchPoints(left: number, right: number | null): string {
  if (right === null) {
    return formatCompactNumber(left);
  }

  return `${formatCompactNumber(left)} - ${formatCompactNumber(right)}`;
}

function formatMetricTotal(value: number | null): string {
  return value === null ? "--" : value.toLocaleString();
}

function getDisplayedRank(entry: Pick<DetailedMatchHistoryEntry, "display_rank" | "final_rank">): number | null {
  return entry.display_rank ?? entry.final_rank;
}

function getDisplayedMatchPoints(entry: Pick<DetailedMatchHistoryEntry, "display_match_point_total" | "display_opponent_point_total">): string {
  return formatMatchPoints(entry.display_match_point_total, entry.display_opponent_point_total);
}

function getPrimaryMetricLabel(entry: Pick<DetailedMatchHistoryEntry, "win_metric">): string {
  return entry.win_metric === "MISSCOUNT" ? "Total MISS Count" : "Total EX Score";
}

function getSecondaryMetricLabel(entry: Pick<DetailedMatchHistoryEntry, "win_metric">): string {
  return entry.win_metric === "MISSCOUNT" ? "Total EX Score" : "Total MISS Count";
}

function getPrimaryMetricValue(entry: Pick<DetailedMatchHistoryEntry, "win_metric" | "total_bp" | "total_ex_score">): number | null {
  return entry.win_metric === "MISSCOUNT" ? entry.total_bp : entry.total_ex_score;
}

function getSecondaryMetricValue(entry: Pick<DetailedMatchHistoryEntry, "win_metric" | "total_bp" | "total_ex_score">): number | null {
  return entry.win_metric === "MISSCOUNT" ? entry.total_ex_score : entry.total_bp;
}

function formatSignedNumber(value: number | null, suffix = ""): string {
  if (value === null) {
    return "--";
  }

  const rounded = Math.round(value * 10) / 10;
  const formatted = `${rounded > 0 ? "+" : ""}${formatCompactNumber(rounded)}`;
  return suffix ? `${formatted}${suffix}` : formatted;
}

function getDeltaColor(value: number | null): string {
  if (value === null) {
    return "text-slate-500";
  }

  if (value > 0) {
    return "text-cyan-400";
  }

  if (value < 0) {
    return "text-red-400";
  }

  return "text-slate-400";
}

function getRankColor(rank: number | null): string {
  if (rank === 1) {
    return "bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]";
  }

  if (rank === 2) {
    return "bg-slate-300 text-black";
  }

  if (rank === 3) {
    return "bg-amber-700 text-white";
  }

  if (rank === 4) {
    return "bg-slate-700 text-gray-300";
  }

  return "bg-white/10 text-gray-400";
}

function getRankText(rank: number | null): string {
  if (rank === null) {
    return "--";
  }

  if (rank === 1) {
    return "1ST";
  }

  if (rank === 2) {
    return "2ND";
  }

  if (rank === 3) {
    return "3RD";
  }

  if (rank === 4) {
    return "4TH";
  }

  return `${rank}TH`;
}

function getRoundPointColor(result: StatsMatchResult): string {
  if (result === "WIN") {
    return "border-cyan-500/30 text-cyan-400";
  }

  if (result === "LOSE") {
    return "border-red-500/30 text-red-400";
  }

  return "border-amber-500/30 text-amber-300";
}

function renderRoundPointBadge(
  battleType: RuleFilter,
  game: DetailedMatchHistoryEntry["games"][number],
): ReactNode {
  if (battleType === "BPL" && game.game_result === "DRAW") {
    return "1";
  }

  return formatCompactNumber(game.round_point);
}

function getResultBadgeColor(result: StatsMatchResult): string {
  if (result === "WIN") {
    return "bg-cyan-500 text-black";
  }

  if (result === "LOSE") {
    return "bg-red-500 text-black";
  }

  return "bg-slate-500 text-black";
}

function RankingList(props: {
  entries: ChartRankingEntry[];
  accentClassName: string;
  hoverClassName: string;
  emptyMessage: string;
}) {
  const { entries, accentClassName, hoverClassName, emptyMessage } = props;

  if (entries.length === 0) {
    return <div className="p-8 text-center text-[10px] italic text-gray-700">{emptyMessage}</div>;
  }

  return (
    <div className="divide-y divide-white/5">
      {entries.map((entry) => {
        const earned = entry.wins + entry.draws * 0.5;

        return (
          <div key={entry.chart_id} className="group flex items-center justify-between px-5 py-3 transition-colors hover:bg-white/[0.01]">
            <div className="min-w-0 flex-1 pr-4">
              <div className={`truncate text-xs font-bold uppercase tracking-tight text-gray-200 transition-colors ${hoverClassName}`}>
                {entry.chart_title}
              </div>
              <div className="text-[9px] font-black uppercase tracking-tighter text-gray-600">{formatChartMeta(entry)}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className={`text-xs font-mono font-black leading-none ${accentClassName}`}>{entry.win_rate.toFixed(1)}%</div>
              <div className="text-[9px] font-bold uppercase tracking-tighter text-gray-600">
                ({formatCompactNumber(earned)}/{entry.matches})
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RatingTrendGraph(props: {
  battleType: RuleFilter;
  entries: DetailedMatchHistoryEntry[];
}) {
  const { battleType, entries } = props;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const plotData = entries
    .filter((entry) => entry.rating_after !== null)
    .slice(0, RATING_TREND_LIMIT)
    .reverse();

  if (plotData.length < 2) {
    return null;
  }

  const ratings = plotData.map((entry) => entry.rating_after ?? 0);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const ratingRange = maxRating - minRating || 100;
  const yMin = minRating - ratingRange * 0.2;
  const yMax = maxRating + ratingRange * 0.2;
  const yRange = yMax - yMin;
  const width = 800;
  const height = 150;
  const paddingX = 40;
  const paddingY = 30;

  function getX(index: number): number {
    return paddingX + (index * (width - paddingX * 2)) / (plotData.length - 1);
  }

  function getY(rating: number): number {
    return height - paddingY - ((rating - yMin) * (height - paddingY * 2)) / yRange;
  }

  const points = plotData.map((entry, index) => `${getX(index)},${getY(entry.rating_after ?? 0)}`).join(" ");
  const hoveredEntry = hoveredIndex === null ? null : plotData[hoveredIndex];

  return (
    <div className="relative border-b border-white/5 bg-[#1a1a1e] p-4" onMouseLeave={() => setHoveredIndex(null)}>
      <div className="mb-4 flex items-center justify-between px-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          Rating Trend (Last {plotData.length} Matches)
        </span>
        <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-600">
          <div className="h-2 w-2 rounded-full bg-cyan-500" />
          RATING
        </div>
      </div>

      <div className="relative h-[150px] w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" preserveAspectRatio="none">
          {[0, 0.5, 1].map((position) => {
            const rating = Math.round(yMax - position * yRange);
            const y = paddingY + position * (height - paddingY * 2);

            return (
              <g key={position}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="rgba(255,255,255,0.03)"
                  strokeWidth="1"
                />
                <text x={paddingX - 10} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.2)" className="text-[8px] font-mono">
                  {rating}
                </text>
              </g>
            );
          })}

          <polyline
            points={points}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_10px_rgba(6,182,212,0.3)]"
          />

          {plotData.map((entry, index) => (
            <g key={entry.match_id}>
              <circle
                cx={getX(index)}
                cy={getY(entry.rating_after ?? 0)}
                r={12}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(index)}
                className="cursor-pointer"
              />
              <circle
                cx={getX(index)}
                cy={getY(entry.rating_after ?? 0)}
                r={hoveredIndex === index ? 5 : 3}
                fill={hoveredIndex === index ? "#06b6d4" : "#1a1a1e"}
                stroke="#06b6d4"
                strokeWidth="2"
                className="pointer-events-none transition-all duration-200"
              />
            </g>
          ))}

          {hoveredEntry ? (
            <g className="pointer-events-none">
              <rect
                x={Math.min(width - 90, Math.max(10, getX(hoveredIndex ?? 0) - 45))}
                y={getY(hoveredEntry.rating_after ?? 0) - 55}
                width="90"
                height="42"
                rx="6"
                fill="rgba(6,182,212,0.95)"
              />
              <text
                x={Math.min(width - 45, Math.max(55, getX(hoveredIndex ?? 0)))}
                y={getY(hoveredEntry.rating_after ?? 0) - 38}
                textAnchor="middle"
                fill="black"
                className="text-[12px] font-mono font-black"
              >
                {Math.round(hoveredEntry.rating_after ?? 0)}
              </text>
              <text
                x={Math.min(width - 45, Math.max(55, getX(hoveredIndex ?? 0)))}
                y={getY(hoveredEntry.rating_after ?? 0) - 24}
                textAnchor="middle"
                fill="rgba(0,0,0,0.6)"
                className="text-[9px] font-black uppercase italic tracking-tighter"
              >
                {battleType === "ARENA"
                  ? `RANK ${getRankText(getDisplayedRank(hoveredEntry))}`
                  : getDisplayedMatchPoints(hoveredEntry)}
              </text>
              <line
                x1={getX(hoveredIndex ?? 0)}
                y1={getY(hoveredEntry.rating_after ?? 0) - 10}
                x2={getX(hoveredIndex ?? 0)}
                y2={height - paddingY}
                stroke="rgba(6,182,212,0.3)"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

interface StatsPageProps {
  onNavigateToLobby: () => void;
}

export function StatsPage({ onNavigateToLobby }: StatsPageProps) {
  const archive = useStatsArchiveStore((state) => state.archive);
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>("ARENA");
  const [playMode, setPlayMode] = useState<PlayStyle>("SP");
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  const currentRating = getCurrentRating(archive, ruleFilter, playMode);
  const detailedHistory = getDetailedMatchHistory(archive, ruleFilter, playMode);
  const recentHistory = detailedHistory.slice(0, MATCH_HISTORY_LIMIT);
  const ranking = getChartRankings(archive, ruleFilter, playMode);
  const stability = getStabilitySummary(archive, playMode);
  const lastDelta = detailedHistory[0]?.rating_delta ?? null;
  const scoreStabilityWidth =
    stability.scoreStability === null ? 0 : Math.max(0, Math.min(stability.scoreStability, 100));

  return (
    <section className="w-full space-y-8 px-2 pb-2 text-white">
      <div className="flex flex-col items-start justify-between gap-6 border-b border-white/5 pb-8 md:flex-row md:items-end">
        <div className="space-y-4">
          <button
            type="button"
            onClick={onNavigateToLobby}
            className="group mb-4 flex items-center gap-2 text-sm font-bold text-gray-500 transition-colors hover:text-white"
          >
            <ChevronLeft size={18} className="transition-transform group-hover:-translate-x-1" />
            戻る
          </button>

          <h1 className="flex items-center gap-3 text-4xl font-black italic uppercase tracking-tighter text-white">
            <BarChart3 className="h-8 w-8 text-cyan-500" />
            Battle Statistics
          </h1>

          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg border border-white/5 bg-[#1e1e22] p-1">
              {RULE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setRuleFilter(option);
                    setExpandedMatchId(null);
                  }}
                  className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${
                    ruleFilter === option
                      ? option === "ARENA"
                        ? "bg-cyan-500 text-black"
                        : "bg-amber-500 text-black"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg border border-white/5 bg-[#1e1e22] p-1">
              {PLAY_MODE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setPlayMode(option);
                    setExpandedMatchId(null);
                  }}
                  className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${
                    playMode === option ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-left md:text-right">
          <span className="mb-1 block text-xs font-black uppercase tracking-widest text-gray-500">Current Rating</span>
          <div className="flex items-baseline gap-4 md:justify-end">
            <span className={`text-2xl font-mono font-black ${getDeltaColor(lastDelta)}`}>{formatDelta(lastDelta)}</span>
            <span className="text-6xl font-mono font-black leading-none text-white">{formatRating(currentRating)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          <section className="flex min-h-[600px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#1a1a1e]">
            <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-black italic uppercase tracking-tight">
                <History className="h-5 w-5 text-cyan-400" />
                Match History
              </h2>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Showing Latest {MATCH_HISTORY_LIMIT} Matches
              </div>
            </div>

            {recentHistory.length > 0 ? (
              <>
                <RatingTrendGraph battleType={ruleFilter} entries={detailedHistory} />

                <div className="flex-1 divide-y divide-white/5">
                  {recentHistory.map((entry) => (
                    <div
                      key={entry.match_id}
                      className="group flex cursor-pointer flex-col transition-colors hover:bg-white/[0.02]"
                      onClick={() => {
                        setExpandedMatchId((current) => (current === entry.match_id ? null : entry.match_id));
                      }}
                    >
                      <div className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-4">
                          {ruleFilter === "ARENA" ? (
                            <div className={`rounded px-2 py-1 text-[10px] font-black uppercase italic ${getRankColor(getDisplayedRank(entry))}`}>
                              Rank {getRankText(getDisplayedRank(entry))}
                            </div>
                          ) : (
                            <div className={`rounded px-2 py-1 text-[10px] font-black uppercase italic ${getResultBadgeColor(entry.match_result)}`}>
                              {getDisplayedMatchPoints(entry)}
                            </div>
                          )}

                          <div className="flex flex-col">
                            <div className="flex flex-wrap gap-1.5">
                              {entry.games.map((game) => (
                                <div
                                  key={game.match_game_id}
                                  className={`rounded border px-1.5 py-0.5 text-[10px] font-mono font-bold ${getRoundPointColor(game.game_result)}`}
                                >
                                  {renderRoundPointBadge(ruleFilter, game)}
                                </div>
                              ))}
                            </div>
                            <span className="mt-1 text-[10px] font-mono uppercase text-gray-500">
                              {formatDateTime(entry.ended_at)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={`text-xl font-mono font-black ${getDeltaColor(entry.rating_delta)}`}>
                            {formatDelta(entry.rating_delta)}
                          </div>
                          <div className="text-[10px] font-bold uppercase italic text-gray-500">Rating Delta</div>
                        </div>
                      </div>

                      {expandedMatchId === entry.match_id ? (
                        <div className="border-t border-white/5 bg-black/20 px-6 pb-4 pt-2">
                          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">{getPrimaryMetricLabel(entry)}</span>
                              <span className="text-lg font-mono font-black text-white">
                                {formatMetricTotal(getPrimaryMetricValue(entry))}
                              </span>
                            </div>
                            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">{getSecondaryMetricLabel(entry)}</span>
                              <span className="text-lg font-mono font-black text-white">
                                {formatMetricTotal(getSecondaryMetricValue(entry))}
                              </span>
                            </div>
                            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Total Points</span>
                              <span className="text-lg font-mono font-black text-cyan-400">
                                {getDisplayedMatchPoints(entry)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {entry.games.map((game, index) => (
                              <div
                                key={game.match_game_id}
                                className="flex items-center justify-between border-b border-white/5 py-1 text-xs opacity-80 last:border-0"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-gray-500">#{index + 1}</span>
                                  <span className="font-bold text-gray-300">{game.chart_title}</span>
                                </div>
                                <div className="flex gap-4 font-mono">
                                  <span className="text-gray-400">EX {game.my_ex_score === null ? "--" : game.my_ex_score.toLocaleString()}</span>
                                  <span className="text-red-400/70">BP {game.my_bp === null ? "--" : game.my_bp}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-12 text-center">
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-gray-600">
                  <History size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">No Match History</h3>
                  <p className="max-w-[260px] text-[10px] font-bold uppercase italic text-gray-600">
                    No archived matches yet. Play Arena or BPL battles to populate this panel.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToLobby}
                  className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-6 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-400 transition-all hover:bg-cyan-500/20"
                >
                  Find Match
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <section className="group relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#1a1a1e] p-6">
            <div className="absolute right-0 top-0 p-6 text-cyan-500/5 transition-colors group-hover:text-cyan-500/10">
              <Activity className="h-24 w-24" />
            </div>

            <div className="relative space-y-6">
              <h2 className="text-lg font-black italic uppercase tracking-tighter text-white">Stability Analysis</h2>

              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Score Consistency</span>
                  <span className="text-xl font-mono font-black text-cyan-400">
                    {stability.scoreStability === null ? "--" : `${stability.scoreStability.toFixed(1)}%`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full border border-white/5 bg-white/5">
                  <div
                    className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000"
                    style={{ width: `${scoreStabilityWidth}%` }}
                  />
                </div>
                <p className="text-[10px] italic text-gray-600">vs Personal Best (Recent 20 avg)</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Miss Stability</span>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-mono font-black ${
                      stability.missStability !== null && stability.missStability > 0 ? "text-red-400" : "text-cyan-400"
                    }`}
                  >
                    {formatSignedNumber(stability.missStability)}
                  </span>
                  <span className="text-xs font-black uppercase italic text-gray-600">BP</span>
                </div>
                <p className="text-[10px] italic text-gray-600">Current BP - Best BP average</p>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-4 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                <span>Target Range</span>
                {stability.comparedCount > 0 ? (
                  <span>
                    {stability.comparedCount} / {stability.recentCount} Samples
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-500/50">
                    <ZapOff size={10} />
                    NO DATA
                  </span>
                )}
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-white/5 bg-[#1a1a1e] shadow-xl">
              <div className="border-b border-white/5 bg-white/[0.02] px-5 py-3">
                <h2 className="flex items-center gap-2 text-[11px] font-black italic tracking-widest text-cyan-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Top Performing Songs
                </h2>
              </div>
              <RankingList
                entries={ranking.highest}
                accentClassName="text-cyan-400"
                hoverClassName="group-hover:text-cyan-400"
                emptyMessage="3戦以上のデータが必要です"
              />
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/5 bg-[#1a1a1e] shadow-xl">
              <div className="border-b border-white/5 bg-white/[0.02] px-5 py-3">
                <h2 className="flex items-center gap-2 text-[11px] font-black italic tracking-widest text-red-400">
                  <TrendingUp className="h-3.5 w-3.5 rotate-180" />
                  Challenging Songs
                </h2>
              </div>
              <RankingList
                entries={ranking.lowest}
                accentClassName="text-red-400"
                hoverClassName="group-hover:text-red-400"
                emptyMessage="3戦以上のデータが必要です"
              />
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
