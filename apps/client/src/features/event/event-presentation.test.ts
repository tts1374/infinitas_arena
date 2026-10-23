import assert from "node:assert/strict";
import test from "node:test";
import type { EventRoomSnapshot, EventRoundResult, EventRoundResultEntry } from "@infinitas/shared";
import { buildEventInviteText, clientRankingRows, eventChartSearchMessage, eventRoundHeading, hostDisconnectSeconds, readySummary, shouldShowCasualUnreadyExclusionWarning, startRoundBlockReason } from "./event-presentation";

const baseSnapshot = {
  schema_version: 1, room_kind: "HOST_EVENT", room_id: "room", generation: 1, event_id: "event",
  settings: { event_name: "Name", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "code" },
  phase: "PICKING", round_phase: null, revision: 1, selection_revision: 1,
  host: { player_id: "host", display_name: "HOST", connected: true, plays: false },
  participants: [], selected_chart: null, current_round_id: null, current_playing_player_ids: [],
  fixed_roster_player_ids: [], scoring_size_n: null,
  host_disconnect_deadline: null, latest_result: null, started_at: null, ended_at: null, end_reason: null,
} satisfies EventRoomSnapshot;

test("ready summary excludes next-round, left and kicked participants", () => {
  const snapshot = { ...baseSnapshot, participants: [
    { player_id: "a", display_name: "A", connection_state: "CONNECTED", ready: true, pending_next: false, round_status: null },
    { player_id: "b", display_name: "B", connection_state: "CONNECTED", ready: true, pending_next: true, round_status: null },
    { player_id: "c", display_name: "C", connection_state: "LEFT", ready: false, pending_next: false, round_status: null },
  ] } satisfies EventRoomSnapshot;
  assert.deepEqual(readySummary(snapshot), { ready: 1, target: 1, pendingNext: 1 });
});

test("tournament start requires every current target", () => {
  const snapshot = { ...baseSnapshot, settings: { ...baseSnapshot.settings, event_type: "TOURNAMENT" }, selected_chart: { chart_key: "c", expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song" }, display: { title: "Song", level: 12 } }, participants: [
    { player_id: "a", display_name: "A", connection_state: "CONNECTED", ready: true, pending_next: false, round_status: null },
    { player_id: "b", display_name: "B", connection_state: "CONNECTED", ready: false, pending_next: false, round_status: null },
  ] } satisfies EventRoomSnapshot;
  assert.equal(startRoundBlockReason(snapshot), "大会は対象者全員の準備完了が必要です。");
});

test("CASUAL warns only the selected, eligible, unready participant about exclusion", () => {
  const selected = { ...baseSnapshot, selected_chart: { chart_key: "c", expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song" }, display: { title: "Song", level: 12 } }, participants: [
    { player_id: "self", display_name: "SELF", connection_state: "CONNECTED", ready: false, pending_next: false, round_status: null },
  ] } satisfies EventRoomSnapshot;
  assert.equal(shouldShowCasualUnreadyExclusionWarning(selected, "self"), true);
  assert.equal(shouldShowCasualUnreadyExclusionWarning({ ...selected, participants: [{ ...selected.participants[0]!, ready: true }] }, "self"), false);
  assert.equal(shouldShowCasualUnreadyExclusionWarning({ ...selected, participants: [{ ...selected.participants[0]!, pending_next: true }] }, "self"), false);
  assert.equal(shouldShowCasualUnreadyExclusionWarning({ ...selected, settings: { ...selected.settings, event_type: "TOURNAMENT" } }, "self"), false);
  assert.equal(shouldShowCasualUnreadyExclusionWarning({ ...selected, selected_chart: null }, "self"), false);
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
