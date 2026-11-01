import { useState } from "react";
import { eventEndReasonLabel } from "../features/event/event-presentation";
import { displayEventName } from "../features/event/event-name";
import { EventOverallResults, EventRoundsReview } from "../features/event/EventFinalReview";
import { eventHistoryService, isReadableEventHistory, type EventHistoryDocument } from "../services/event-history";

function eventSummary(history: EventHistoryDocument): string {
  const kind = history.settings.event_type === "TOURNAMENT"
    ? `大会・固定${history.scoring_size_n ?? "未確定"}人`
    : "合同プレー";
  const completeness = history.completeness === "COMPLETE" ? "完全" : "部分";
  return `${kind}・同期済み${history.synced_round_count}曲・${completeness}`;
}

export function EventHistoryPage() {
  const [selected, setSelected] = useState<EventHistoryDocument | null>(null);
  const histories = eventHistoryService.list();

  if (selected) {
    return (
      <div className="mx-auto max-w-5xl text-white">
        <button type="button" onClick={() => setSelected(null)} className="mb-4 text-cyan-300">← 一覧へ</button>
        <h1 className="text-2xl font-black">{displayEventName(selected.settings)}</h1>
        <p className="mt-1 text-sm text-gray-400">{eventSummary(selected)} · 最後の受信：{new Date(selected.last_received_at).toLocaleString()} · 保存版{selected.schema_version}</p>
        <p className="mt-2 text-sm text-gray-400">終了理由：{eventEndReasonLabel(selected.end_reason)}</p>
        <div className="mt-5 space-y-4">
          {selected.settings.event_type === "TOURNAMENT" ? (
            <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] p-4">
              <h2 className="mb-3 font-black">総合結果</h2>
              {selected.results_sync_complete && selected.rounds.every((round) => round.invalidated_at !== null) ? <p>有効な確定曲はありません。優勝者はありません。</p> : <EventOverallResults entries={selected.overall_results ?? []} selfPlayerId={null} />}
            </section>
          ) : null}
          <EventRoundsReview rounds={selected.rounds} metricLabel={selected.settings.win_metric} isTournament={selected.settings.event_type === "TOURNAMENT"} selfPlayerId={null} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl text-white">
      <h1 className="mb-6 text-3xl font-black">開催履歴</h1>
      <div className="space-y-3">
        {histories.length === 0 ? <p className="text-gray-500">開催履歴はありません。</p> : histories.map((history) => (
          isReadableEventHistory(history) ? (
            <button
              type="button"
              key={history.event_id}
              onClick={() => setSelected(history)}
              className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left"
            >
              <span className="min-w-0 break-words">
                <b>{displayEventName(history.settings)}</b>
                <small className="ml-3 text-gray-500">
                  {history.started_at ? new Date(history.started_at).toLocaleString() : "開始前"}
                </small>
              </span>
              <span className="text-sm text-gray-400">{eventSummary(history)}</span>
            </button>
          ) : (
            <div key={history.storage_key} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
              <b className="text-amber-200">未対応バージョンの開催履歴</b>
              <p className="mt-1 text-sm text-amber-100/70">
                Event ID: {history.event_id ?? "不明"}／schema: {String(history.schema_version ?? "不明")}。原本を保持しています。
              </p>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
