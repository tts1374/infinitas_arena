import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventParticipantState, EventRoomSnapshot, EventRoundResult } from "@infinitas/shared";
import { EventRoomPage } from "./EventRoomPage";
import { eventRoomStore, type EventRoomStoreState } from "../stores/event-room-store";

const chart = {
  chart_key: "visual:stargaze:spa",
  expected_key: { play_style: "SP", difficulty: "ANOTHER", title_search_key: "Stargaze" },
  display: { title: "Stargaze", level: 12 },
} as const;

const participant = (index: number, overrides: Partial<EventParticipantState> = {}): EventParticipantState => ({
  player_id: `player-${index}`,
  display_name: `PLAYER_${String(index).padStart(2, "0")}`,
  connection_state: "CONNECTED",
  ready: true,
  pending_next: false,
  round_status: null,
  ...overrides,
});

const baseSnapshot: EventRoomSnapshot = {
  schema_version: 1,
  room_kind: "HOST_EVENT",
  room_id: "VISUAL01",
  generation: 1,
  event_id: "visual-event",
  settings: { event_name: "Issue 188 visual", event_type: "CASUAL", host_plays: false, play_style: "SP", win_metric: "SCORE", visibility: "PRIVATE", join_code: "VISUAL88" },
  phase: "PICKING",
  round_phase: null,
  revision: 4,
  selection_revision: 1,
  host: { player_id: "host", display_name: "HOST", connected: true, plays: false },
  participants: [],
  fixed_roster_player_ids: [],
  scoring_size_n: null,
  selected_chart: chart,
  current_round_id: "round-1",
  current_playing_player_ids: [],
  host_disconnect_deadline: null,
  latest_result: null,
  started_at: "2026-09-11T00:00:00.000Z",
  ended_at: null,
  end_reason: null,
};

function render(snapshot: EventRoomSnapshot, state: Partial<EventRoomStoreState> = {}): string {
  eventRoomStore.hydrateVisualState({
    connectionStatus: "CONNECTED",
    connectionDetail: "Connected.",
    roomId: snapshot.room_id,
    playerId: "player-1",
    sessionRole: "PLAYER",
    snapshot,
    resultRounds: [],
    resultsPublicRevision: null,
    resultsNextCursor: null,
    resultsSyncComplete: true,
    pendingMutationRequestIds: [],
    leavePending: false,
    sourceUnavailableMessage: null,
    errorMessage: null,
    ...state,
  });
  return renderToStaticMarkup(<EventRoomPage onReturnToLobby={() => undefined} />);
}

test("CASUAL selected chart warns an eligible unready client before Host starts", () => {
  const markup = render({ ...baseSnapshot, participants: [participant(1, { ready: false })] });
  assert.match(markup, /未準備のままHostが開始すると、この曲のプレー対象外になります。/);
  assert.match(markup, /準備完了/);
});

test("Host LOBBY with zero participants shows invite and keeps start disabled", () => {
  const markup = render({ ...baseSnapshot, phase: "LOBBY", event_id: null, selected_chart: null, current_round_id: null }, { playerId: "host", sessionRole: "HOST" });
  assert.match(markup, /Room ID/);
  assert.match(markup, /VISUAL01/);
  assert.match(markup, /参加者はいません。Hostは待機または終了できます。/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>開催開始<\/button>/);
});

test("20-player ACTIVE view preserves responsive layout and source failure skip guidance", () => {
  const participants = Array.from({ length: 20 }, (_, index) => participant(index + 1, {
    round_status: index === 0 ? "PENDING" : index === 19 ? "ABSENT" : "SUBMITTED",
  }));
  const markup = render({
    ...baseSnapshot,
    phase: "PLAYING",
    round_phase: "ACTIVE",
    participants,
    current_playing_player_ids: participants.map((entry) => entry.player_id),
  }, { sourceUnavailableMessage: "監視ファイルを読み取れません" });
  assert.match(markup, /PLAYER_01/);
  assert.match(markup, /PLAYER_20/);
  assert.match(markup, /結果取得元を利用できません：監視ファイルを読み取れません。復旧を待つか、必要ならスキップしてください。/);
  assert.match(markup, /スキップ/);
  assert.match(markup, /lg:flex-row/);
  assert.match(markup, /lg:w-\[min\(34vw,380px\)\]/);
});

test("disconnected Host and tournament result expose wait, tie, absence, and end reason", () => {
  const results = [
    { player_id: "player-1", display_name: "PLAYER_01", status: "SUBMITTED", metric_value: 2500, absence_reason: null, rank: 1, tournament_points: 3, confirmed_at: "2026-09-11T00:03:00.000Z" },
    { player_id: "player-2", display_name: "PLAYER_02", status: "SUBMITTED", metric_value: 2500, absence_reason: null, rank: 1, tournament_points: 3, confirmed_at: "2026-09-11T00:03:00.000Z" },
    { player_id: "player-3", display_name: "PLAYER_03", status: "ABSENT", metric_value: 0, absence_reason: "DEADLINE", rank: null, tournament_points: 0, confirmed_at: "2026-09-11T00:03:00.000Z" },
  ] satisfies EventRoundResult["results"];
  const round: EventRoundResult = { round_id: "round-1", chart, playing_player_ids: results.map((entry) => entry.player_id), started_at: "2026-09-11T00:01:00.000Z", confirmed_at: "2026-09-11T00:03:00.000Z", invalidated_at: null, public_revision: 1, results };
  const playingMarkup = render({ ...baseSnapshot, settings: { ...baseSnapshot.settings, event_type: "TOURNAMENT", host_plays: true }, phase: "PLAYING", round_phase: "RESULT", host: { ...baseSnapshot.host, connected: false, plays: true }, participants: [participant(1), participant(2), participant(3)], fixed_roster_player_ids: ["player-1", "player-2", "player-3"], scoring_size_n: 3, latest_result: round, host_disconnect_deadline: new Date(Date.now() + 60_000).toISOString() }, { resultRounds: [round] });
  assert.match(playingMarkup, /Host再接続待ち/);
  assert.equal((playingMarkup.match(/1位/g) ?? []).length, 2);
  assert.match(playingMarkup, /欠場/);

  const finalMarkup = render({ ...baseSnapshot, settings: { ...baseSnapshot.settings, event_type: "TOURNAMENT", host_plays: true }, phase: "RESULT", round_phase: null, participants: [participant(1), participant(2), participant(3)], fixed_roster_player_ids: ["player-1", "player-2", "player-3"], scoring_size_n: 3, latest_result: round, overall_results: [{ player_id: "player-1", display_name: "PLAYER_01", total_points: 3, rank: 1 }], ended_at: "2026-09-11T00:04:00.000Z", end_reason: "HOST_ENDED" }, { resultRounds: [round] });
  assert.match(finalMarkup, /最終結果/);
  assert.match(finalMarkup, /終了理由：HOST_ENDED/);
});
