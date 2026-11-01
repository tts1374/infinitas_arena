import assert from "node:assert/strict";
import test from "node:test";
import type { EventRoomSnapshot, EventRoundResult, EventRoundResultEntry } from "@infinitas/shared";
import { buildEventInviteText, clientRankingRows, eventAbsenceReasonLabel, eventChartSearchMessage, eventEndReasonLabel, eventRoundHeading, hostDisconnectSeconds, participationSummary, participantStatusLabel, startRoundBlockReason } from "./event-presentation";

const baseSnapshot = {
  schema_version: 2, room_kind: "HOST_EVENT", room_id: "room", generation: 1, event_id: "event",
  settings: { event_name: "Name", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "code" },
  phase: "PICKING", round_phase: null, revision: 1, selection_revision: 1,
  host: { player_id: "host", display_name: "HOST", connected: true, plays: false },
  participants: [], selected_chart: null, current_round_id: null, current_eligible_player_ids: [], current_playing_player_ids: [],
  fixed_roster_player_ids: [], scoring_size_n: null,
  host_disconnect_deadline: null, latest_result: null, started_at: null, ended_at: null, end_reason: null,
} satisfies EventRoomSnapshot;

test("connection and authoritative eligibility stay independent of submission and next-round waiting", () => {
  const snapshot = { ...baseSnapshot, current_eligible_player_ids: ["a", "b"], participants: [
    { player_id: "a", display_name: "A", connection_state: "CONNECTED", pending_next: false, round_status: "PENDING" },
    { player_id: "b", display_name: "B", connection_state: "DISCONNECTED", pending_next: false, round_status: "SUBMITTED" },
    { player_id: "c", display_name: "C", connection_state: "CONNECTED", pending_next: true, round_status: null },
  ] } satisfies EventRoomSnapshot;
  assert.deepEqual(participationSummary(snapshot), { connected: 2, target: 2, pendingNext: 1 });
  assert.equal(participantStatusLabel(snapshot.participants[1]!), "提出済み");
  assert.equal(participantStatusLabel(snapshot.participants[2]!), "次曲から参加");
});
test("both event types start with the authoritative targets even when disconnected; zero targets block", () => {
  for (const event_type of ["CASUAL", "TOURNAMENT"] as const) {
    const snapshot = { ...baseSnapshot, settings: { ...baseSnapshot.settings, event_type }, current_eligible_player_ids: ["a"], selected_chart: { chart_key: "c", expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song" }, display: { title: "Song", level: 12 } }, participants: [{ player_id: "a", display_name: "A", connection_state: "DISCONNECTED", pending_next: false, round_status: null }] } satisfies EventRoomSnapshot;
    assert.equal(startRoundBlockReason(snapshot), null);
    assert.equal(startRoundBlockReason({ ...snapshot, current_eligible_player_ids: [] }), "この曲の参加対象者がいません。");
    assert.equal(startRoundBlockReason({ ...snapshot, host: { ...snapshot.host, connected: false } }), "Hostの再接続を待っています。");
  }
});

test("client ranking combines top three and self neighborhood without duplicates", () => {
  const entries = Array.from({ length: 10 }, (_, index) => ({ player_id: `p${index + 1}`, display_name: `P${index + 1}`, status: "SUBMITTED", metric_value: 1000-index, absence_reason: null, rank: index+1, confirmed_at: "2026-01-01T00:00:00.000Z" })) satisfies EventRoundResultEntry[];
  const rows = clientRankingRows(entries, "p7");
  assert.deepEqual(rows.map((row) => row.player_id), ["p1", "p2", "p3", "p5", "p6", "p7", "p8", "p9"]);
  assert.equal(new Set(rows.map((row) => row.player_id)).size, rows.length);
});

test("event chart search distinguishes loading, no common charts, no matches, and API failure", () => {
  assert.equal(eventChartSearchMessage("LOADING", "", 0), "全員が遊べる譜面を確認しています…");
  assert.equal(eventChartSearchMessage("READY", "", 0), "参加者全員の所持・解禁条件を満たす譜面がありません。");
  assert.equal(eventChartSearchMessage("READY", "Song", 0), "検索条件に一致する共通譜面はありません。");
  assert.equal(eventChartSearchMessage("ERROR", "", 0), "選曲候補を取得できませんでした。通信状態を確認して検索し直してください。");
  assert.equal(eventChartSearchMessage("READY", "", 1), null);
});

test("host invite copy contains event name, room id, and join code", () => {
  assert.equal(buildEventInviteText("大会 DP", "room-1", "ABCDEFGH"), "大会 DP\nRoom ID: room-1\n参加コード: ABCDEFGH");
});

test("host reconnect countdown is clamped to the contractual grace period", () => {
  const nowMs = Date.parse("2026-09-09T00:00:00.000Z");
  assert.equal(hostDisconnectSeconds({ ...baseSnapshot, host: { ...baseSnapshot.host, connected: false }, host_disconnect_deadline: "2026-09-09T00:05:00.001Z" }, nowMs), 300);
  assert.equal(hostDisconnectSeconds({ ...baseSnapshot, host: { ...baseSnapshot.host, connected: false }, host_disconnect_deadline: "2026-09-08T23:59:59.000Z" }, nowMs), 0);
});

test("round heading stays correct across PICKING, ACTIVE, round RESULT, and final RESULT", () => {
  const result = {
    round_id: "round-1", chart: { chart_key: "c1", expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song" }, display: { title: "Song", level: 12 } },
    playing_player_ids: ["a"], started_at: "2026-09-09T00:00:00.000Z", confirmed_at: "2026-09-09T00:03:00.000Z", invalidated_at: null, public_revision: 1, results: [],
  } satisfies EventRoundResult;
  assert.equal(eventRoundHeading(baseSnapshot, [result]), "第2曲");
  assert.equal(eventRoundHeading({ ...baseSnapshot, phase: "PLAYING", round_phase: "ACTIVE" }, [result]), "第2曲");
  const second = { ...result, round_id: "round-2", public_revision: 2 } satisfies EventRoundResult;
  assert.equal(eventRoundHeading({ ...baseSnapshot, phase: "PLAYING", round_phase: "RESULT", latest_result: second }, [result]), "第2曲");
  assert.equal(eventRoundHeading({ ...baseSnapshot, phase: "RESULT" }, [result, second]), "全2曲");
});

test("event end reasons are readable without exposing or rewriting stored values", () => {
  assert.equal(eventEndReasonLabel("HOST_ENDED"), "Hostが開催を終了しました");
  assert.equal(eventEndReasonLabel("HOST_DISCONNECTED"), "Hostが再接続しなかったため終了しました");
  assert.equal(eventEndReasonLabel("ROOM_STATE_LOST"), "開催の状態を復元できなかったため終了しました");
  assert.equal(eventEndReasonLabel(null), "終了理由は未記録です");
  assert.equal(eventEndReasonLabel("FUTURE_REASON"), "終了理由を読み取れません（原本を保持しています）");
});

test("absence reasons are readable in round and saved result views", () => {
  assert.equal(eventAbsenceReasonLabel("DEADLINE"), "締切まで未提出");
  assert.equal(eventAbsenceReasonLabel("NOT_PRESENT"), "開始時に不在");
  assert.equal(eventAbsenceReasonLabel("SKIP"), "スキップ");
  assert.equal(eventAbsenceReasonLabel("LEFT"), "退出");
  assert.equal(eventAbsenceReasonLabel("KICKED"), "Kick済み");
});
