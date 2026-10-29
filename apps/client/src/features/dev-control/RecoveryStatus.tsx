import type { DevControlState } from "../../dev-control/protocol";

export function LocalJoinDetails({ state }: { state: DevControlState }) {
  const code = state.lifecycle === "running" && state.joinCode?.trim() && state.joinCode.trim() !== "[REDACTED]" ? state.joinCode : null;
  return <details><summary>本人Aの入室情報</summary>{code && state.roomId ? <div className="input-route"><p>本人Aは実アプリから入室してください。</p><p>ローカルAPI：{state.apiBaseUrl}</p><p>部屋：{state.roomId}</p><p>ローカル入室コード：<strong>{code}</strong></p></div> : <p>入室コードは動作確認中のlive情報が取得できるときだけ表示します。</p>}</details>;
}

export function StopStatus({ state }: { state: DevControlState }) {
  const stop = state.stop;
  const lifecycleNames: Record<DevControlState["lifecycle"], string> = { starting: "起動中", running: "動作確認中", stopping: "終了処理中", stopped: "動作確認は終了しています", failed: "失敗が発生しました。停止状況を確認してください" };
  const phaseNames = { idle: "停止は要求されていません", quiescing: "新しい操作と予約を停止しています", collecting: "終了前の証拠を収集しています", flushing: "操作記録を書き出しています", terminating: "テスト用のプロセスを終了しています", verifying: "プロセスとポートの停止を確認しています", complete: "停止確認が完了しました", failed: "停止確認に失敗しました" };
  return <div className="recovery-status" role="status"><span>{lifecycleNames[state.lifecycle]}</span>{state.recoveryRequired ? <p>制御との接続が失われました。「動作確認を終了」から、残った検証用プロセスの停止を再試行できます。</p> : null}{stop && stop.phase !== "idle" ? <><p>{phaseNames[stop.phase]}</p><p>プロセス停止：{stop.processesVerified ? "確認済み" : "未確認"} · ポート停止：{stop.portsVerified ? "確認済み" : "未確認"}</p>{stop.errors.map((message, index) => <p role="alert" key={index}>{message}</p>)}</> : null}</div>;
}

export function SaveStatus({ state }: { state: DevControlState }) {
  const save = state.save;
  const messages: Record<DevControlState["save"]["status"], string> = {
    idle: "操作記録と取得できる画面を保存できます。",
    collecting: "操作記録と画面の証拠を収集しています。保存完了は未確認です。",
    exporting: "証拠を書き出しています。保存完了は未確認です。",
    saved: `保存内容の読み戻しを確認しました：${save.path ?? "保存先未確認"}`,
    partial: `一部を保存しました。欠落・失敗があります：${save.path ?? "保存先未確認"}。「保存」から再試行できます。`,
    failed: `保存に失敗しました：${save.path ?? "保存先未確認"}。「保存」から再試行できます。`,
  };
  return <><p>{messages[save.status]}</p>{save.error ? <p role="alert">{save.error}</p> : null}{save.bundleId ? <p>記録：{save.bundleId} · 保存試行：{save.attempt ?? "未確認"}</p> : null}{save.missing.length ? <p>欠落：{save.missing.join("、")}</p> : null}{state.evidence?.captures.length ? <details><summary>画面の取得状況</summary><ul>{state.evidence.captures.map(capture => <li key={capture.captureId}>{capture.clientId}：{{ pending: "取得待ち", saved: "保存済み", missing: "取得なし", failed: "取得失敗" }[capture.status]}{capture.relativePath ? ` · ${capture.relativePath}` : ""}{capture.error ? ` · ${capture.error}` : ""}</li>)}</ul></details> : null}</>;
}
