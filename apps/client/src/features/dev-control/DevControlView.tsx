import { useEffect, useId, useRef, useState } from "react";
import type { DevControlAction, DevControlClientState, DevControlIdentity, DevControlRestartOptions, DevControlRestartReceipt, DevControlState, SendPolicy } from "../../dev-control/protocol";
import { LocalJoinDetails, SaveStatus, StopStatus } from "./RecoveryStatus";
import { devControlConfirmationToken } from "../../dev-control/protocol";
import { actionAvailability, actionNames, currentProgress, hostAction, modeNames, operationStatusNames, parseDraftValue, participantStatus, personName, phaseName, policyNames, resultMessage, resultPayload } from "./presentation";

export interface DevControlViewProps {
  state: DevControlState;
  identity: DevControlIdentity;
  busy: boolean;
  error: string | null;
  onCommand: (target: DevControlClientState, action: DevControlAction, payload: Record<string, unknown>) => Promise<void>;
  onSave: () => Promise<void>;
  onRestart: (options: DevControlRestartOptions) => Promise<void>;
  onRefresh: () => Promise<void>;
  restartReceipt?: DevControlRestartReceipt | null;
}
type Confirmation = { target: DevControlClientState; action: DevControlAction | "restart"; payload: Record<string, unknown>; token: string; text: string };

function ActionButton({ client, action, busy, blockedReason, primary, label, onClick }: { client: DevControlClientState | undefined; action: DevControlAction; busy: boolean; blockedReason?: string | undefined; primary?: boolean; label?: string; onClick: () => void }) {
  const id = useId();
  const availability = actionAvailability(client, action);
  const reason = busy ? "前の操作の返答を待っています。" : blockedReason ?? availability.reason ?? (!availability.enabled ? "現在の状態では操作できません。" : null);
  return <div className="action"><button type="button" className={primary ? "primary" : undefined} disabled={busy || !!blockedReason || !availability.enabled} aria-describedby={reason ? id : undefined} onClick={onClick}>{label ?? actionNames[action] ?? action}</button>{reason ? <small id={id}>{reason}</small> : null}</div>;
}

function ValueFields({ values, disabled, onChange }: { values: { exScore: string; missCount: string }; disabled: boolean; onChange: (field: "exScore" | "missCount", value: string) => void }) {
  return <div className="input-row">{([['exScore', 'EXスコア'], ['missCount', 'ミスカウント']] as const).map(([field, label]) => <label key={field}>{label}<input type="number" min="0" step="1" inputMode="numeric" value={values[field]} disabled={disabled} onChange={event => onChange(field, event.target.value)} /></label>)}</div>;
}

export function DevControlView({ state, identity, busy, error, onCommand, onSave, onRestart, onRefresh, restartReceipt }: DevControlViewProps) {
  const clients = state.lifecycle === "running" ? state.clients : state.clients.map(client => ({ ...client, actions: client.actions.map(action => ({ ...action, enabled: state.recoveryRequired === true && client.manifest.role === "controller" && action.action === "session.stop", reason: state.recoveryRequired && client.manifest.role === "controller" && action.action === "session.stop" ? null : "動作確認中だけ操作できます。記録の保存と新しい起動は確認全体の操作から行えます。" })) }));
  const people = clients.filter(client => client.manifest.role !== "controller");
  const [selectedId, setSelectedId] = useState(people.find(client => client.manifest.role === "participant")?.manifest.clientId ?? people[0]?.manifest.clientId ?? "");
  const target = people.find(client => client.manifest.clientId === selectedId) ?? people[0];
  const host = people.find(client => client.manifest.clientId === state.hostClientId);
  const controller = clients.find(client => client.manifest.clientId === identity.clientId);
  const [drafts, setDrafts] = useState<Record<string, { exScore: string; missCount: string }>>({});
  const [policies, setPolicies] = useState<Record<string, SendPolicy>>({});
  const [chartKey, setChartKey] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [restartOptions, setRestartOptions] = useState<DevControlRestartOptions>(state.restartOptions);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const phase = host?.displayPhase ?? people.find(client => client.displayPhase)?.displayPhase;
  const event = host?.eventSnapshot ?? people.find(client => client.eventSnapshot)?.eventSnapshot;
  const normal = host?.normalSnapshot ?? people.find(client => client.normalSnapshot)?.normalSnapshot;
  const progress = event ? currentProgress(event) : null;
  const hostMain = hostAction(host);
  const hostMainEnabled = !!hostMain && actionAvailability(host, host?.manifest.role === "self" ? "client.focus" : hostMain).enabled && !busy;
  const own = target?.manifest.role === "self";
  const values = target ? drafts[target.manifest.clientId] ?? { exScore: target.draft.exScore?.toString() ?? "", missCount: target.draft.missCount?.toString() ?? "" } : { exScore: "", missCount: "" };
  const desiredPolicy = target ? policies[target.manifest.clientId] ?? target.policy : "manual";
  const canSend = !!target && actionAvailability(target, "result.send").enabled;
  const editingEnabled = !!target && actionAvailability(target, "draft.update").enabled;
  const hasValidValues = parseDraftValue(values.exScore) !== null && parseDraftValue(values.missCount) !== null;
  // An incomplete draft disables sending, not editing. Keep this form mounted while
  // the snapshot still identifies an unconfirmed member of the current round.
  const awaitingResult = target?.eventSnapshot
    ? target.eventSnapshot.current_playing_player_ids.includes(target.manifest.playerId ?? "") && target.eventSnapshot.participants.some(member => member.player_id === target.manifest.playerId && member.round_status === "PENDING")
    : !!target?.normalSnapshot?.current_round && target.normalSnapshot.players.some(member => member.player_id === target.manifest.playerId) && !target.normalSnapshot.current_round.confirmed.some(member => member.player_id === target.manifest.playerId);
  const showForm = target && !own && editingEnabled && /[NE]3/.test(target.displayPhase ?? "") && awaitingResult && (target.policy === "manual" || target.policy === "delay");
  const invalidConfirmation = confirmation && (state.lifecycle !== "running" && confirmation.action !== "restart" && !(state.recoveryRequired && confirmation.action === "session.stop") ||
    !state.clients.some(client => client.manifest.clientId === confirmation.target.manifest.clientId &&
      devControlConfirmationToken(client.context, client.draft, confirmation.action) === confirmation.token));

  useEffect(() => {
    if (!confirmation || invalidConfirmation) {
      dialog.current?.close();
      if (confirmation && invalidConfirmation) setConfirmation(null);
      returnFocus.current?.focus();
      return;
    }
    dialog.current?.showModal();
  }, [confirmation, invalidConfirmation]);

  function closeConfirmation() { setConfirmation(null); }
  function openConfirmation(client: DevControlClientState, action: Confirmation["action"], payload: Record<string, unknown>, text: string) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmation({ target: structuredClone(client), action, payload, token: devControlConfirmationToken(client.context, client.draft, action), text });
  }
  function command(client: DevControlClientState | undefined, action: DevControlAction, payload: Record<string, unknown> = {}) {
    if (!client) return;
    const needsConfirmation = ["event.cancelPick", "event.closeRound", "match.forceAdvance", "event.end", "participant.leave", "session.stop"].includes(action) || action === "event.start" && state.mode === "TOURNAMENT";
    if (needsConfirmation) {
      const outstanding = event ? progress!.total - progress!.done : Math.max(0, (normal?.players.length ?? 0) - (normal?.current_round?.confirmed.length ?? 0));
      const text = action === "session.stop" ? "テスト用のアプリと送信予約を終了します。操作記録は保持します。本人のIIDXと普段の連携ソフトは停止しません。"
        : action === "participant.leave" ? `${personName(client, state)}を部屋から退出させます。接続を切る操作とは異なります。${client.manifest.clientId === state.hostClientId ? "主催者の退出により部屋全体が終了します。" : ""}`
          : action === "event.start" ? `大会を開始し、名簿と配点人数を固定します。在室 ${event?.participants.filter(p => p.connection_state !== "LEFT" && p.connection_state !== "KICKED").length ?? "未確認"}人。`
            : action === "event.cancelPick" ? "確定した譜面を取り消します。新しい譜面を参加者へ共有し直してください。"
              : action === "event.end" ? "開催を終了します。開始済みで未確定の曲は無効になり、確定済みの曲だけ残ります。"
                : `未提出の${outstanding}人を${event ? "欠場" : "時間切れ"}で確定します。今の曲へは結果を送れなくなります。`;
      openConfirmation(client, action, payload, text);
    } else void onCommand(client, action, payload);
  }
  function updateValue(field: "exScore" | "missCount", value: string) {
    if (!target) return;
    closeConfirmation();
    const next = { ...values, [field]: value };
    setDrafts(previous => ({ ...previous, [target.manifest.clientId]: next }));
    void onCommand(target, "draft.update", { exScore: parseDraftValue(next.exScore), missCount: parseDraftValue(next.missCount) });
  }
  function applyPolicy() {
    if (!target) return;
    if (desiredPolicy === "auto" && canSend) {
      openConfirmation(target, "policy.apply", { policy: desiredPolicy, confirmationToken: devControlConfirmationToken(target.context, target.draft, "policy.auto") }, `${personName(target, state)}の現在曲（${target.context.expectedKey?.title_search_key ?? "曲名未取得"}／${target.context.roundId ?? `ROUND ${(target.context.roundIndex ?? 0) + 1}`}）へ EX ${target.draft.exScore}・ミス ${target.draft.missCount} を今すぐ送信し、以後は毎曲自動にします。送信後はこの曲の結果を変更できません。やめると送り方は変更せず、編集した値と選択案は残ります。`);
    } else void onCommand(target, "policy.apply", { policy: desiredPolicy });
  }
  function selectPerson(client: DevControlClientState) {
    if (target && target.manifest.clientId !== client.manifest.clientId) {
      for (const reservation of state.operations.filter(op => op.context.targetClientId === target.manifest.clientId && op.status === "reserved")) void onCommand(target, "reservation.cancel", { operationId: reservation.operationId });
    }
    closeConfirmation(); setSelectedId(client.manifest.clientId);
  }
  function renderChartPicker(client: DevControlClientState, action: "pick.submit" | "event.confirmPick") {
    return <div className="chart-picker"><label>共通候補から曲を選ぶ<select value={chartKey} onChange={event => setChartKey(event.target.value)}><option value="">曲を選択</option>{state.chartCandidates.map(chart => <option key={chart.chartKey} value={chart.chartKey}>{chart.title} · {chart.expectedKey.play_style} {chart.expectedKey.difficulty}</option>)}</select></label><ActionButton client={client} action={action} busy={busy} blockedReason={!state.chartCandidates.some(chart => chart.chartKey === chartKey) ? "共通候補から曲を選んでください。" : undefined} primary={!confirmation && (action === "event.confirmPick" || !hostMainEnabled)} onClick={() => command(client, action, { chartKey })} />{state.chartCandidates.length === 0 ? <small>共通候補の取得を待っています。</small> : null}</div>;
  }
  const visibleAdjustments: DevControlAction[] = event ? [...(phase === "E2" ? ["event.cancelPick" as const] : []), ...(phase === "E3" ? ["event.closeRound" as const] : []), ...(!/[56]$/.test(phase ?? "") ? ["event.end" as const] : [])] : ["N2", "N3"].includes(phase ?? "") ? ["match.forceAdvance"] : [];
  const inFlight = target ? state.operations.filter(op => op.context.targetClientId === target.manifest.clientId && ["pending", "reserved", "input-written", "parsed", "sent", "unknown"].includes(op.status)).at(-1) : undefined;
  const publicRound = target?.eventSnapshot?.latest_result;
  const publishedEventResult = publicRound?.round_id === target?.eventSnapshot?.current_round_id ? publicRound?.results.find(entry => entry.player_id === target?.manifest.playerId) : undefined;
  const confirmedNormalResult = target?.normalSnapshot?.current_round?.confirmed.find(entry => entry.player_id === target.manifest.playerId);
  const lastOperation = state.operations.at(-1);
  const canRestart = state.lifecycle === "stopped" && state.stop?.phase === "complete" && state.stop.processesVerified && state.stop.portsVerified && !restartReceipt;
  return <main id="dev-control"><section className="product" aria-label="動作確認の操作ウィンドウ">
    <header className="titlebar"><b>動作確認</b><span className="window-caption">操作用ウィンドウ</span></header>
    <div className="environment"><div><b>ローカル</b><span className="session-mode">{modeNames[state.mode]}</span><span className="endpoint">{state.apiBaseUrl}</span><span className="session-identifiers">session: {state.sessionId} · room: {state.roomId ?? "接続待ち"}</span></div><details className="popover session-menu"><summary>確認全体の操作 <span aria-hidden="true">⌄</span></summary><div className="popover-body">
      <details><summary>起動条件を変更・最初からやり直す</summary><div className="restart-settings"><label>モード<select value={restartOptions.mode} onChange={event => { const mode = event.target.value as DevControlRestartOptions["mode"]; setRestartOptions(previous => ({ ...previous, mode, playerCount: mode === "ARENA" ? 4 : mode === "BPL" || mode === "BPL4" ? 2 : 4, visibleOpponents: 1 })); }}>{Object.entries(modeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label>主催者<select value={restartOptions.hostClientId} onChange={event => setRestartOptions(previous => ({ ...previous, hostClientId: event.target.value as "A" | "B" }))}><option value="A">自分</option><option value="B">相手1</option></select></label><label>相手の入力元<select value={restartOptions.opponentSource} onChange={event => setRestartOptions(previous => ({ ...previous, opponentSource: event.target.value as DevControlRestartOptions["opponentSource"] }))}><option value="inf-notebook">inf-notebook</option><option value="reflux">reflux</option><option value="daken_counter_v3">打鍵カウンタv3</option></select></label><small>廃止済みの入力元は選べません。本人の連携参照先は継承します。</small><label>参加人数<input type="number" min="2" max="20" disabled={!['CASUAL', 'TOURNAMENT'].includes(restartOptions.mode)} value={restartOptions.playerCount} onChange={event => setRestartOptions(previous => ({ ...previous, playerCount: Number(event.target.value) }))} /></label><label>画面ありの相手人数<input type="number" min="1" max={restartOptions.playerCount - 1} value={restartOptions.visibleOpponents} onChange={event => setRestartOptions(previous => ({ ...previous, visibleOpponents: Number(event.target.value) }))} /></label><button type="button" disabled={busy || !canRestart || !controller || !Number.isInteger(restartOptions.playerCount) || restartOptions.playerCount < 2 || restartOptions.playerCount > 20 || !Number.isInteger(restartOptions.visibleOpponents) || restartOptions.visibleOpponents < 1 || restartOptions.visibleOpponents >= restartOptions.playerCount} onClick={() => controller && openConfirmation(controller, "restart", { options: restartOptions }, "記録を残して、新しい起動条件でテスト参加者と部屋を作り直します。既存の部屋設定は上書きしません。")}>最初からやり直す…</button>{!canRestart && !restartReceipt ? <small>動作確認を終了し、プロセスとポートの停止確認が完了すると起動できます。</small> : null}{restartReceipt ? <p role="status">新しい起動要求を受け付けました（{restartReceipt.requestId}）。新sessionの起動完了は未確認です。新しい操作窓で確認してください。元の操作記録は保持します。</p> : null}</div></details>
      <LocalJoinDetails state={state} /><ActionButton client={controller} action="session.stop" busy={busy} onClick={() => command(controller, "session.stop")} /><StopStatus state={state} /><button type="button" onClick={() => void onRefresh()} disabled={busy}>最新の状態を確認</button>
    </div></details></div>
    <section className="progress-area" aria-label="主催者の進行"><div><h1>{phaseName(host ?? people[0])}</h1><div className="host-name secondary">{progress && phase === "E3" ? `提出・欠場確定 ${progress.done} / ${progress.total}人 · ` : ""}主催者：{host ? personName(host, state) : "未確認"}</div>{state.mode === "TOURNAMENT" && event?.scoring_size_n !== null ? <div className="host-guide secondary">固定配点人数 N={event?.scoring_size_n ?? "開始前"} · 名簿 {event?.fixed_roster_player_ids.length ?? 0}人</div> : null}<div className="host-guide secondary">{event && !event.host.connected ? `主催者の再接続を待っています。期限：${event.host_disconnect_deadline ?? "最新情報を待っています"}。開始済み曲の有効な提出は続けられます。` : host?.manifest.role === "self" ? "主催者の進行は自分のアプリで操作します。" : ""}</div><div className="host-guide secondary">{event?.selected_chart?.display.title ?? normal?.current_round?.expected_key.title_search_key ?? ""}</div></div><div className="progress-actions">
      {hostMain && host ? host.manifest.role === "self" ? <ActionButton client={host} action="client.focus" label="自分のアプリを表示" busy={busy} primary={!confirmation} onClick={() => command(host, "client.focus")} /> : hostMain === "event.confirmPick" ? renderChartPicker(host, hostMain) : <ActionButton client={host} action={hostMain} primary={!confirmation} busy={busy} onClick={() => command(host, hostMain)} /> : null}
      {visibleAdjustments.length ? <details className="popover flow-menu"><summary>進行の調整 <span aria-hidden="true">⌄</span></summary><div className="popover-body">{visibleAdjustments.map(action => <ActionButton key={action} client={host} action={action} busy={busy} onClick={() => command(host, action)} />)}</div></details> : null}
    </div></section>
    <div className="workarea"><aside className="roster" aria-label="操作する人を選ぶ"><div className="rail-title"><b>参加者</b><span className="people-count">{people.filter(client => participantStatus(client) !== "退出済み").length}人</span></div><div className="roster-buttons">{people.map(client => <button key={client.manifest.clientId} type="button" aria-pressed={target?.manifest.clientId === client.manifest.clientId} onClick={() => selectPerson(client)}>{personName(client, state)}<span>{client.manifest.clientId === state.hostClientId ? "主催者 · " : ""}{participantStatus(client)}</span></button>)}</div>{event ? <><ActionButton client={controller} action="participant.add" busy={busy} blockedReason={!state.availableParticipants?.length ? "追加できる参加者はいません。" : undefined} label="参加者を追加" onClick={() => command(controller, "participant.add", { clientId: state.availableParticipants?.[0] })} />{state.mode === "TOURNAMENT" && event.phase !== "LOBBY" ? <small>大会開始後は新しい人を追加できません</small> : null}</> : null}</aside>
      {target ? <section className="target" aria-label="選択した人"><div className="target-top"><div><h2>{personName(target, state)}</h2><div className="target-kind secondary">{target.manifest.transport === "real-client" ? "アプリ画面あり" : "画面なし"} · {participantStatus(target)}</div><small>client: {target.manifest.clientId} · player: {target.manifest.playerId ?? "接続待ち"}</small></div><details className="popover connection-menu"><summary>接続のテスト <span aria-hidden="true">⌄</span></summary><div className="popover-body">{!own ? (["participant.disconnect", "participant.reconnect", "participant.leave"] as const).map(action => <ActionButton key={action} client={target} action={action} busy={busy} onClick={() => command(target, action)} />) : <small>自分はアプリで操作します。</small>}<ActionButton client={target} action="client.focus" busy={busy} onClick={() => command(target, "client.focus")} /></div></details></div>
        <div className="target-body">{own ? <div className="own-source"><b>自分はアプリで操作します</b><span>結果は普段の連携ソフトから読み取ります。</span><ActionButton client={target} action="client.focus" busy={busy} onClick={() => command(target, "client.focus")} /></div> : <>
          {phase === "N0" ? <ActionButton client={target} action="ready.set" busy={busy} primary={!confirmation && !hostMainEnabled} label={target.normalSnapshot?.players.find(player => player.player_id === target.manifest.playerId)?.ready ? "準備を取り消す" : "準備完了にする"} onClick={() => command(target, "ready.set", { ready: !target.normalSnapshot?.players.find(player => player.player_id === target.manifest.playerId)?.ready })} /> : null}
          {phase === "N1" ? renderChartPicker(target, "pick.submit") : null}
          {showForm ? <div className="submission-form"><ValueFields values={values} disabled={!editingEnabled} onChange={updateValue} /><ActionButton client={target} action={target.policy === "delay" ? "result.delay" : "result.send"} label={target.policy === "delay" ? "この人の結果を10秒後に送る" : "この人の結果を送る"} primary={!confirmation && !hostMainEnabled} busy={busy} blockedReason={!hasValidValues ? "EXスコア・ミスカウントは0以上の整数を入力してください。" : undefined} onClick={() => command(target, target.policy === "delay" ? "result.delay" : "result.send", resultPayload(target))} /></div> : <div className="waiting"><p className="waiting-message">{resultMessage(target, state.lifecycle)}</p>{editingEnabled && !["提出済み", "欠場確定", "スキップ確定", "時間切れ確定"].includes(participantStatus(target)) ? <div className="preview-values"><span>EXスコア <b>{values.exScore || "未入力"}</b></span><span>ミスカウント <b>{values.missCount || "未入力"}</b></span></div> : null}</div>}
          {publishedEventResult?.status === "ABSENT" ? <p className="confirmed-value">現在曲は欠場で確定しました。理由：{publishedEventResult.absence_reason ?? "公開結果を確認してください"}</p> : publishedEventResult || confirmedNormalResult ? <p className="confirmed-value">現在曲の確定値：{publishedEventResult?.metric_value ?? confirmedNormalResult?.metric_value}（{event?.settings.win_metric ?? normal?.settings.win_metric}）。次の提出値の編集では変わりません。</p> : participantStatus(target) === "提出済み" ? <small>現在曲の確定値は公開後の結果で確認します。</small> : null}
          <div className="send-preferences"><span className="secondary policy-status">送り方：{policyNames[target.policy]}</span>{!/[56]$/.test(phase ?? "") ? <details className="send-settings"><summary>送信設定 <span aria-hidden="true">⌄</span></summary><div className="settings-body"><b>{["提出済み", "欠場確定", "スキップ確定", "時間切れ確定", "次曲から参加", "当該曲の対象外"].includes(participantStatus(target)) || /[NE]4/.test(phase ?? "") ? "次の曲で使う値" : "次の提出で使う値"}</b><ValueFields values={values} disabled={!editingEnabled} onChange={updateValue} /><p className="secondary value-note">値の変更は保存され、未投入予約を取り消します。結果を送る操作とは別です。上の入力欄と同じ値です。確定済みの現在曲は変わりません。</p><label>結果の送り方<select value={desiredPolicy} onChange={event => { closeConfirmation(); setPolicies(previous => ({ ...previous, [target.manifest.clientId]: event.target.value as SendPolicy })); }}><option value="manual">ボタンを押したときだけ</option><option value="auto">毎曲、プレー開始後に自動で送る</option><option value="delay">ボタンを押して10秒後に送る</option><option value="hold">結果を送らずに待つ</option></select></label><button type="button" className="secondary-button" disabled={busy || !actionAvailability(target, "policy.apply").enabled || desiredPolicy === "auto" && !hasValidValues} onClick={applyPolicy}>{desiredPolicy === "auto" && canSend ? "この曲にも送って、毎曲自動にする…" : "送り方を適用"}</button>{!editingEnabled ? <small>{actionAvailability(target, "draft.update").reason}</small> : null}{!hasValidValues ? <small>EXスコア・ミスカウントは0以上の整数を入力してください。譜面の上限は正規入力経路で検証します。</small> : null}</div></details> : null}</div>
        </>}{inFlight ? <div className="operation-state" role="status">{operationStatusNames[inFlight.status]}{inFlight.reason ? `：${inFlight.reason}` : ""}{inFlight.status === "reserved" && !own ? <button type="button" disabled={busy} onClick={() => command(target, "reservation.cancel", { operationId: inFlight.operationId })}>未投入予約を取り消す</button> : null}</div> : null}{target.lastError ? <p role="alert">{target.lastError}</p> : null}</div>
        <details className="input-details"><summary>入力元と確認できる範囲 <span aria-hidden="true">⌄</span></summary><div className="input-route">{own ? <>本人：普段の連携ソフトから読み取ります。テスト結果は書き込みません。入力元：{target.manifest.source}。参照先：{target.manifest.readOnlySource?.paths.join("、") || `ローカルWebSocket port ${target.manifest.readOnlySource?.port ?? "未確認"}`}。</> : target.manifest.transport === "headless" ? <>相手：画面を開かず、正規通信と結果の受付を確認します。アプリの表示・連携ソフトの監視と解析は別の確認です。</> : <>相手：{target.manifest.source} に対応するテスト専用の{target.manifest.source === "daken_counter_v3" ? "ローカルWebSocket" : "ファイル"}入力から、アプリの監視・解析・自動提出・表示を確認します。投入、解析、送信、製品受付は操作記録で別々に確認します。入力先：{target.manifest.fixtureRoot} {target.manifest.sourcePort ? `port ${target.manifest.sourcePort}` : ""}。</>}</div></details>
      </section> : <p>参加者の接続を待っています。</p>}
    </div>
    <footer className="record"><div className="record-heading"><details className="record-details"><summary>操作記録 <span aria-hidden="true">⌄</span></summary><div className="record-info">操作受付・入力元への投入・解析・送信・製品受付・不明を区別します。入力値や送り方の保存を製品受付として表示しません。<ol>{state.operations.map(operation => <li key={operation.operationId}>{operation.operationId} · {operation.context.targetClientId} · {operationStatusNames[operation.status]} {operation.reason}</li>)}</ol><details><summary>詳細ログと識別情報</summary><pre>{JSON.stringify(state.observations, null, 2)}</pre></details></div></details><button type="button" className="quiet" onClick={() => void onSave()} disabled={busy}>保存</button></div><div className="log" role="status">{lastOperation ? <p>直近の操作：{people.find(client => client.manifest.clientId === lastOperation.context.targetClientId) ? personName(people.find(client => client.manifest.clientId === lastOperation.context.targetClientId)!, state) : lastOperation.context.targetClientId} · {operationStatusNames[lastOperation.status]} {lastOperation.reason}</p> : null}<SaveStatus state={state} /></div></footer>
    {error ? <div className="error" role="alert">{error}</div> : null}
    <dialog ref={dialog} className="confirmation" aria-label="操作の確認" onCancel={closeConfirmation}><b>{confirmation?.text}</b><div className="confirmation-actions"><button type="button" className="secondary-button" autoFocus onClick={closeConfirmation}>やめる</button><button type="button" className="primary" disabled={busy || !!invalidConfirmation} onClick={() => { const held = confirmation; closeConfirmation(); if (!held || invalidConfirmation) return; if (held.action === "restart") void onRestart(held.payload.options as DevControlRestartOptions); else void onCommand(held.target, held.action, { ...held.payload, confirmationToken: held.payload.confirmationToken ?? devControlConfirmationToken(held.target.context, held.target.draft, held.action) }); }}>実行する</button></div></dialog>
  </section></main>;
}
