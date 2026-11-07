import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartSearchEntry, ChartSearchQuery, PlayStyle } from "@infinitas/shared";
import { SongSearchModalView, resolveSongVersionDbValue } from "../../components/SongSearchModalView";
import { listRoomCharts } from "../../services/worker-api-client";
import { getDifficultyFromShortLabel, getDifficultyShortLabel } from "../room/presentation-shared";
import { createEventChartSearch, type EventChartSearchState } from "./event-chart-search";
import { eventChartSearchMessage } from "./event-presentation";

const emptyResults: EventChartSearchState = { charts: [], nextCursor: null, loading: true, error: false };

export function EventChartPicker({ apiBaseUrl, roomId, playStyle, enabled, selected, onSelect }: {
  apiBaseUrl: string;
  roomId: string;
  playStyle: PlayStyle;
  enabled: boolean;
  selected: ChartSearchEntry | null;
  onSelect: (chart: ChartSearchEntry | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const closePicker = useCallback(() => { setOpen(false); openButton.current?.focus(); }, []);
  const query: ChartSearchQuery = useMemo(() => {
    const chartDifficulty = getDifficultyFromShortLabel(difficulty);
    return { play_style: playStyle, level_filter: "ANY", keyword: search, ...(chartDifficulty ? { difficulty: chartDifficulty } : {}), ...(level === null ? {} : { level }), ...(version === null ? {} : { version: resolveSongVersionDbValue(version) ?? version }) };
  }, [playStyle, search, difficulty, level, version]);
  const queryKey = JSON.stringify([roomId, query]);
  const [result, setResult] = useState<{ key: string; value: EventChartSearchState } | null>(null);
  const reader = useMemo(() => createEventChartSearch((room, params) => listRoomCharts(apiBaseUrl, room, params), value => setResult({ key: queryKey, value })), [apiBaseUrl, queryKey]);
  useEffect(() => {
    void reader.reset(roomId, query);
    return () => reader.dispose();
  }, [reader, roomId, query]);
  const results = result?.key === queryKey ? result.value : emptyResults;
  const status = eventChartSearchMessage(results.error ? "ERROR" : results.loading && results.charts.length === 0 ? "LOADING" : "READY", search, results.charts.length);
  function changeFilter(change: () => void) { onSelect(null); change(); }
  return <>
    <div className="event-picking">
      {selected ? <p>選択中：{selected.title} · {selected.play_style} {selected.difficulty} Lv{selected.level}。内容を確認して「この譜面を確定」を押してください。</p> : <p>全員が遊べる譜面から選びます。検索や絞り込み、一覧の追加読込ができます。</p>}
      <button ref={openButton} type="button" disabled={!enabled} onClick={() => setOpen(true)}>{selected ? "別の譜面を選ぶ" : "曲を選ぶ"}</button>
    </div>
    <SongSearchModalView
      isOpen={open && enabled}
      search={search}
      selectedDiff={difficulty}
      selectedLevel={level}
      selectedVersion={version}
      timeLeft={null}
      hideTimer
      displayedSongs={results.error ? [] : results.charts.map(chart => ({ id: chart.chart_key, title: chart.title, artist: chart.artist, ...(chart.version ? { version: chart.version } : {}), difficulty: getDifficultyShortLabel(chart.difficulty), level: chart.level, genre: chart.genre }))}
      totalSongs={results.charts.length}
      hasMore={!results.error && results.nextCursor !== null}
      isLoadingMore={results.loading}
      onSearchChange={value => changeFilter(() => setSearch(value))}
      onToggleDiff={value => changeFilter(() => setDifficulty(current => current === value ? null : value))}
      onToggleLevel={value => changeFilter(() => setLevel(current => current === value ? null : value))}
      onToggleVersion={value => changeFilter(() => setVersion(value || null))}
      onLoadMore={() => void reader.loadMore()}
      onSelect={song => {
        if (!enabled || results.error) return;
        const chart = results.charts.find(candidate => candidate.chart_key === song.id);
        if (chart) { onSelect(chart); closePicker(); }
      }}
      onClose={closePicker}
      searchPlaceholder="曲名・アーティストで検索"
      subtitle="全員が遊べる譜面から選択"
      footerLabel="選択後に譜面を確認・確定します"
      statusContent={status ? <div role={results.error ? "alert" : "status"}><p>{status}</p>{results.error ? <button type="button" onClick={() => void reader.retry()}>もう一度読み込む</button> : null}</div> : null}
    />
  </>;
}
