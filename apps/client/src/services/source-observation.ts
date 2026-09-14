import type { ExpectedKey } from "@infinitas/shared";
import type { ParsedSourceChangePayload, ParsedSourceObservationPayload } from "./tauri-bridge";

export function observationMatchesExpected(
  observation: ParsedSourceObservationPayload,
  expectedKey: ExpectedKey,
  source: ParsedSourceChangePayload["source"],
): boolean {
  const expectedChartId =
    typeof expectedKey.chart_id === "number" && Number.isInteger(expectedKey.chart_id) && expectedKey.chart_id > 0
      ? expectedKey.chart_id
      : null;
  const observedChartId =
    typeof observation.chartId === "number" && Number.isInteger(observation.chartId) && observation.chartId > 0
      ? observation.chartId
      : null;

  if (expectedChartId !== null) {
    if (observedChartId !== null && observedChartId !== expectedChartId) return false;
    if (source === "daken_counter_v3" && observedChartId === null) return false;
  }

  const observedPlayStyle = observation.playStyle ?? expectedKey.play_style;
  return observedPlayStyle === expectedKey.play_style &&
    observation.difficulty === expectedKey.difficulty &&
    observation.titleSearchKey === expectedKey.title_search_key;
}
