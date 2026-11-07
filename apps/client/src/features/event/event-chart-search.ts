import type { ChartSearchEntry, ChartSearchQuery, ChartSearchResponse } from "@infinitas/shared";

export interface EventChartSearchState {
  charts: ChartSearchEntry[];
  nextCursor: string | null;
  loading: boolean;
  error: boolean;
}

/** Owns one room/query generation; obsolete responses never replace its candidates. */
export function createEventChartSearch(
  request: (roomId: string, query: ChartSearchQuery) => Promise<ChartSearchResponse>,
  changed: (state: EventChartSearchState) => void,
) {
  let generation = 0;
  let disposed = false;
  let roomId = "";
  let query: ChartSearchQuery;
  let failedCursor: string | null = null;
  let state: EventChartSearchState = { charts: [], nextCursor: null, loading: false, error: false };
  const publish = (next: EventChartSearchState) => { state = next; changed(next); };
  async function load(cursor: string | null) {
    if (disposed || state.loading) return;
    const current = generation;
    failedCursor = cursor;
    publish({ ...state, loading: true, error: false });
    try {
      const response = await request(roomId, { ...query, ...(cursor ? { cursor } : {}) });
      if (current !== generation) return;
      const charts = cursor ? [...state.charts, ...response.charts] : response.charts;
      publish({ charts: [...new Map(charts.map(chart => [chart.chart_key, chart])).values()], nextCursor: response.next_cursor, loading: false, error: false });
    } catch {
      if (current === generation) publish({ ...state, loading: false, error: true });
    }
  }
  return {
    reset(nextRoomId: string, nextQuery: ChartSearchQuery) {
      generation++;
      disposed = false;
      roomId = nextRoomId;
      query = nextQuery;
      publish({ charts: [], nextCursor: null, loading: false, error: false });
      return load(null);
    },
    loadMore() { return !state.error && state.nextCursor ? load(state.nextCursor) : Promise.resolve(); },
    retry() { return state.error ? load(failedCursor) : Promise.resolve(); },
    dispose() { generation++; disposed = true; },
  };
}
