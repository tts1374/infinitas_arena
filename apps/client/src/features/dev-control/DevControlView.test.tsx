import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DevControlView, type DevControlViewProps } from "./DevControlView";
import { identity, makeUiState } from "./ui.test-fixtures";
import { resultPayload } from "./presentation";
import type { DevControlClientState, DevControlCommand, DevControlState } from "../../dev-control/protocol";

function render(state = makeUiState(), overrides: Partial<DevControlViewProps> = {}) {
  const props = { state, identity, busy: false, error: null, onCommand: async () => {}, onSave: async () => {}, onRestart: async () => {}, onRefresh: async () => {}, ...overrides } satisfies DevControlViewProps;
  return renderToStaticMarkup(<DevControlView {...props} />);
}
test("all event and normal display cases keep named disclosures without prototype FSM controls", () => {
  for (const mode of ["ARENA", "BPL", "BPL4", "CASUAL", "TOURNAMENT"] as const) for (let index = 0; index < 7; index++) {
    const phase = `${mode === "CASUAL" || mode === "TOURNAMENT" ? "E" : "N"}${index}`;
    const markup = render(makeUiState(phase, mode));
    assert.match(markup, /主催者の進行/);
    assert.match(markup, /入力元と確認できる範囲/);
    assert.match(markup, /操作記録/);
    assert.doesNotMatch(markup, /data-action="phase|FSMジャンプ/);
  }
});

test("stop observations distinguish progress, failure and verified completion", () => {
  const state = makeUiState("E3");
  state.lifecycle = "stopping";
  state.stop = { phase: "verifying", requestedAt: "2026-10-25T00:00:00Z", completedAt: null, errors: [], processesVerified: true, portsVerified: false };
  const progress = render(state);
  assert.match(progress, /プロセスとポートの停止を確認しています/);
  assert.match(progress, /ポート停止：未確認/);
  assert.doesNotMatch(progress, /停止確認が完了しました/);
  state.lifecycle = "failed";
  state.stop.phase = "failed";
  state.stop.errors = ["port 19999 remains open"];
  assert.match(render(state), /停止確認に失敗しました/);
  assert.match(render(state), /port 19999 remains open/);
  state.lifecycle = "stopped";
  state.stop.phase = "complete";
  state.stop.errors = [];
  state.stop.portsVerified = true;
  assert.match(render(state), /停止確認が完了しました/);
});

test("terminal sessions permit explicit shutdown readback while product actions stay disabled", () => {
  for (const lifecycle of ["failed", "stopped"] as const) {
    const state = makeUiState("E3");
    state.lifecycle = lifecycle;
    state.stop = { phase: "failed", requestedAt: null, completedAt: null, errors: [], processesVerified: false, portsVerified: false };
    assert.match(render(state), /<button type="button">最新の状態を確認<\/button>/);
    assert.match(render(state), /<button[^>]*disabled=""[^>]*>最初からやり直す…<\/button>/);
    assert.match(render(state, { busy: true }), /<button type="button" disabled="">最新の状態を確認<\/button>/);
  }
});

test("orphan recovery enables only explicit runtime stop and keeps restart gated", () => {
  const state = makeUiState("E3");
  state.lifecycle = "failed"; state.recoveryRequired = true;
  assert.match(render(state), /残った検証用プロセスの停止を再試行できます/);
  assert.match(render(state), /<button[^>]*>動作確認を終了する…<\/button>/);
  assert.doesNotMatch(render(state), /<button[^>]*disabled=""[^>]*>動作確認を終了する…<\/button>/);
  assert.match(render(state), /<button[^>]*disabled=""[^>]*>最初からやり直す…<\/button>/);
});

test("local join information exposes only the live code and hides it after stopping or redaction", () => {
  const state = makeUiState("E2");
  state.joinCode = "MOCK-LOCAL-CODE";
  assert.match(render(state), /本人Aは実アプリから入室してください/);
  assert.match(render(state), /ローカルAPI：http:\/\/127\.0\.0\.1:19998/);
  assert.match(render(state), /部屋：LOCAL01/);
  assert.match(render(state), /ローカル入室コード：<strong>MOCK-LOCAL-CODE<\/strong>/);
  for (const lifecycle of ["starting", "stopping", "stopped", "failed"] as const) {
    state.lifecycle = lifecycle;
    assert.doesNotMatch(render(state), /MOCK-LOCAL-CODE/);
  }
  state.lifecycle = "running";
  for (const code of [null, "", " ", "[REDACTED]"]) {
    state.joinCode = code;
    assert.doesNotMatch(render(state), /ローカル入室コード：|\[REDACTED\]/);
  }
});

test("partial exports expose missing captures and retry while launch receipts never claim new readiness", () => {
  const state = makeUiState("E6");
  state.lifecycle = "stopped";
  state.save = { status: "partial", path: "runtime/export", error: "image unavailable", missing: ["B image"], bundleId: "bundle-1", attempt: 2 };
  state.evidence = { captures: [{ captureId: "image-B", clientId: "B", status: "missing", relativePath: null, error: "window closed" }] };
  const markup = render(state, { restartReceipt: { status: "launch-requested", requestId: "launch-1", oldSessionId: state.sessionId } });
  assert.match(markup, /一部を保存しました/);
  assert.match(markup, /再試行できます/);
  assert.match(markup, /window closed/);
  assert.match(markup, /B image/);
  assert.match(markup, /新sessionの起動完了は未確認です/);
  assert.doesNotMatch(markup, /保存内容の読み戻しを確認しました/);
  for (const status of ["collecting", "exporting"] as const) {
    state.save.status = status;
    assert.match(render(state), /保存完了は未確認です/);
  }
});
test("preparation, automatic, hold and submitted states retain the next-value editing disclosure", () => {
  for (const phase of ["E0", "E1", "E2", "E3", "E4", "N0", "N1", "N2", "N3", "N4"]) for (const policy of ["manual", "auto", "hold"] as const) {
    const state = makeUiState(phase); state.clients[1]!.policy = policy;
    assert.match(render(state), /次の(?:提出|曲)で使う値/);
  }
  const state = makeUiState("E3");
  state.clients[1]!.eventSnapshot!.participants[1]!.round_status = "SUBMITTED";
  const markup = render(state);
  assert.match(markup, /現在曲の確定値は公開後/);
  assert.match(markup, /確定済みの現在曲は変わりません/);
});
test("self host is directed to the real app without proxy host mutation", () => {
  const state = makeUiState("E2"); state.hostClientId = "A";
  const markup = render(state);
  assert.match(markup, /自分のアプリを表示/);
  assert.doesNotMatch(markup, />この曲を開始<\/button>/);
});
test("saved and failed evidence states expose readback, missing entries and retry without claiming input acceptance", () => {
  const state = makeUiState("E6"); state.lifecycle = "stopped";
  state.save = { status: "failed", path: "runtime/evidence", error: "write failed", missing: ["終了済み窓の画像"] };
  assert.match(render(state), /保存に失敗しました/);
  assert.match(render(state), /終了済み窓の画像/);
  state.save.status = "saved";
  assert.match(render(state), /保存内容の読み戻しを確認しました/);
  assert.match(render(state), /入力値や送り方の保存を製品受付として表示しません/);
});

test("broker-derived unavailable send actions keep an incomplete current-round draft editable", async () => {
  // Consume the actual broker policy so null-draft availability changes cannot
  // silently drift away from a fixed component mock.
  const { deriveActions } = await import(new URL("../../../../../scripts/dev-control/action-policy.mjs", import.meta.url).href) as {
    deriveActions: (client: DevControlClientState, options: { lifecycle: DevControlState["lifecycle"]; eventMode: boolean; availableParticipants: string[]; operations: []; now: number }) => Pick<DevControlClientState, "displayPhase" | "actions">;
  };
  for (const phase of ["N3", "E3"]) for (const policy of ["manual", "delay"] as const) for (const field of ["exScore", "missCount"] as const) {
    const state = makeUiState(phase, phase === "N3" ? "ARENA" : "CASUAL");
    const client = state.clients[1]!;
    client.policy = policy;
    const refresh = () => Object.assign(client, deriveActions(client, { lifecycle: "running", eventMode: phase === "E3", availableParticipants: [], operations: [], now: Date.parse("2026-10-25T00:01:00.000Z") }));
    refresh();
    assert.equal(client.actions.find(action => action.action === "result.send")?.enabled, true);
    client.draft[field] = null;
    refresh();
    assert.equal(client.actions.find(action => action.action === "result.send")?.enabled, false);
    const markup = render(state);
    assert.match(markup, /class="submission-form"/);
    assert.match(markup, /<button[^>]*disabled=""[^>]*>この人の結果を(?:10秒後に)?送る<\/button>/);
    assert.equal((markup.match(/<input type="number"/g) ?? []).length, 6, `${phase}/${policy}/${field}: current + settings fields and restart options`);
    client.draft[field] = 0;
    refresh();
    assert.equal(client.actions.find(action => action.action === "result.send")?.enabled, true);
    assert.match(render(state), /class="submission-form"/);
  }
});

test("manual and ten-second result payloads satisfy the actual private command validator", async () => {
  const { validateCommand } = await import(new URL("../../../../../scripts/dev-control/protocol.mjs", import.meta.url).href) as { validateCommand: (command: unknown) => unknown };
  for (const phase of ["N3", "E3"]) for (const policy of ["manual", "delay"] as const) {
    const client = makeUiState(phase, phase === "N3" ? "ARENA" : "CASUAL").clients[1]!;
    client.policy = policy;
    const command = { protocolVersion: 1, operationId: "ui-result", sessionId: identity.sessionId, actorClientId: identity.clientId, targetClientId: client.manifest.clientId, context: client.context, action: policy === "delay" ? "result.delay" : "result.send", payload: resultPayload(client) } satisfies DevControlCommand;
    assert.doesNotThrow(() => validateCommand(command));
    assert.deepEqual(command.payload, policy === "delay" ? { valueRevision: 1, delayMs: 10000 } : { valueRevision: 1 });
    if (policy === "delay") assert.throws(() => validateCommand({ ...command, payload: { valueRevision: 1 } }), /ten seconds/);
  }
});
