import assert from "node:assert/strict";
import test from "node:test";
import { currentProgress, parseDraftValue, participantStatus, resultMessage } from "./presentation";
import { makeUiState } from "./ui.test-fixtures";

test("current-round counts preserve frozen playing members and distinguish absence from submission", () => {
  const state = makeUiState("E3", "TOURNAMENT");
  const snapshot = state.clients[1]!.eventSnapshot!;
  snapshot.participants[1]!.round_status = "SUBMITTED";
  snapshot.participants[2]!.connection_state = "LEFT";
  snapshot.participants[2]!.round_status = "ABSENT";
  snapshot.participants[3]!.round_status = "SKIPPED";
  snapshot.participants.push({ player_id: "next", display_name: "次曲", connection_state: "CONNECTED", pending_next: true, round_status: null });
  assert.deepEqual(currentProgress(snapshot), { done: 3, total: 4 });
  assert.equal(snapshot.scoring_size_n, 4);
  assert.equal(participantStatus(state.clients[1]!), "提出済み");
  state.clients[3]!.eventSnapshot!.participants[3]!.round_status = "ABSENT";
  assert.equal(resultMessage(state.clients[3]!, "running"), "この曲は欠場で確定しました");
});
test("terminal guidance wins over disconnected recovery and policies", () => {
  const client = makeUiState("E5").clients[1]!;
  client.connection = "DISCONNECTED";
  assert.doesNotMatch(resultMessage(client, "running"), /つなぎ直せます/);
  assert.match(resultMessage(client, "stopped"), /記録を保存/);
  assert.match(resultMessage(client, "starting"), /起動しています/);
  assert.match(resultMessage(client, "stopping"), /終了処理中/);
  assert.doesNotMatch(resultMessage(client, "stopping"), /終了しています/);
  assert.match(resultMessage(client, "failed"), /失敗/);
});
test("draft accepts zero and nonnegative safe integers without a prototype score ceiling", () => {
  for (const value of ["", " ", "-1", "1.5", "NaN", "Infinity", "9007199254740992"]) assert.equal(parseDraftValue(value), null, value);
  assert.equal(parseDraftValue("0"), 0);
  assert.equal(parseDraftValue("5000"), 5000);
});
