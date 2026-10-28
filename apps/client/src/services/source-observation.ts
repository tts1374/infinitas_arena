import type { ExpectedKey } from "@infinitas/shared";
import type { ParsedSourceChangePayload, ParsedSourceObservationPayload } from "./tauri-bridge";

/** The existing v3 dedupe tuple; timestamp is deliberately excluded. */
export function dakenCounterV3ObservationFingerprint(observation: ParsedSourceObservationPayload): string {
  const codes: Record<string, string> = { BEGINNER: "B", NORMAL: "N", HYPER: "H", ANOTHER: "A", LEGGENDARIA: "L" };
  const extras = observation.sourceMetaExtras ?? {};
  const seed = [observation.title.trim(), `${observation.playStyle}${codes[observation.difficulty]}`,
    observation.score, observation.misscount, extras.pre_score ?? "", extras.pre_bp ?? 9999,
    extras.lamp ?? "", extras.opt ?? "", extras.playspeed ?? ""].join("|");
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) { hash ^= seed.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

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
