import { useEffect, useRef, useState } from "react";
import type { DevControlClientState, DevControlIdentity, DevControlRestartReceipt, DevControlState } from "../dev-control/protocol";
import { getDevControlState, restartDevControlSession, saveDevControlEvidence, sendDevControlCommand } from "../dev-control/transport";
import { DevControlView, type DevControlViewProps } from "../features/dev-control/DevControlView";
import "../features/dev-control/dev-control.css";

export const nativeDevControlApi = { getState: getDevControlState, sendCommand: sendDevControlCommand, saveEvidence: saveDevControlEvidence, restartSession: restartDevControlSession };

/** Injection is only a component test seam. No product route or query enables a mock transport. */
export function DevControlWindow({ identity, api = nativeDevControlApi }: { identity: DevControlIdentity; api?: typeof nativeDevControlApi }) {
  const [state, setState] = useState<DevControlState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [restartReceipt, setRestartReceipt] = useState<DevControlRestartReceipt | null>(null);
  const latest = useRef<DevControlState | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resumePolling = useRef<() => void>(() => {});

  function accept(next: DevControlState) {
    if (next.sessionId !== identity.sessionId) throw new Error("別のsessionの応答を拒否しました。");
    if (["stopped", "failed"].includes(latest.current?.lifecycle ?? "") && !["stopped", "failed"].includes(next.lifecycle)) return;
    latest.current = next;
    if (next.lifecycle === "stopped" || next.lifecycle === "failed") clearTimeout(pollTimer.current);
    if (mounted.current) setState(next);
  }
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    function schedulePoll() {
      clearTimeout(pollTimer.current);
      if (!cancelled && ["starting", "running", "stopping"].includes(latest.current?.lifecycle ?? "")) pollTimer.current = setTimeout(() => void poll(), 750);
    }
    resumePolling.current = schedulePoll;
    async function poll() {
      try {
        const next = await api.getState();
        if (cancelled) return;
        if (next.sessionId !== identity.sessionId) throw new Error("別のsessionの応答を拒否しました。");
        if (["stopped", "failed"].includes(latest.current?.lifecycle ?? "") && !["stopped", "failed"].includes(next.lifecycle)) return;
        latest.current = next; setState(next);
        // The stopped controller shell must not retain a broker poll or progress timer.
        schedulePoll();
      } catch (cause) {
        if (cancelled) return;
        setError(`最新状態を取得できません。操作結果は不明です。${String(cause)}`);
        // A failed connection is not evidence that the runtime is safe to resume.
      }
    }
    void poll();
    return () => { cancelled = true; mounted.current = false; resumePolling.current = () => {}; clearTimeout(pollTimer.current); };
  }, [api, identity.sessionId]);

  function schedule(work: () => Promise<void>) {
    setPending(value => value + 1);
    const next = queue.current.then(async () => { try { await work(); if (mounted.current) setError(null); } catch (cause) { if (mounted.current) setError(String(cause)); } finally { if (mounted.current) setPending(value => value - 1); } });
    queue.current = next;
    return next;
  }
  const onCommand: DevControlViewProps["onCommand"] = (target, action, payload) => schedule(async () => {
    if (latest.current?.lifecycle !== "running" && !(latest.current?.recoveryRequired && action === "session.stop")) throw new Error("停止中・停止後は新しい操作を送信できません。");
    let commandTarget: DevControlClientState = target;
    // Keystrokes share a serial draft queue; each edit cancels the previous reservation
    // using the latest broker revision. Confirmed product actions retain their exact token.
    if (action === "draft.update") {
      const current = await api.getState(); accept(current);
      const next = current.clients.find(client => client.manifest.clientId === target.manifest.clientId);
      if (!next) throw new Error("対象が変わりました。");
      commandTarget = next;
    }
    const result = await api.sendCommand({ protocolVersion: 1, operationId: crypto.randomUUID(), sessionId: identity.sessionId, actorClientId: identity.clientId, targetClientId: commandTarget.manifest.clientId, context: structuredClone(commandTarget.context), action, payload });
    accept(await api.getState());
    if (result.status === "failed" || result.status === "rejected") throw new Error(result.reason ?? "操作を受け付けられませんでした。");
  });
  const onSave = () => schedule(async () => {
    const save = await api.saveEvidence();
    if (latest.current) accept({ ...latest.current, save });
  });
  const onRestart: DevControlViewProps["onRestart"] = options => schedule(async () => {
    const receipt = await api.restartSession({ protocolVersion: 1, sessionId: identity.sessionId, options });
    if (receipt.oldSessionId !== identity.sessionId || receipt.status !== "launch-requested") throw new Error("再起動の受付応答を確認できませんでした。");
    // A launch request is not evidence of a stopped runtime or a ready new session.
    if (mounted.current) setRestartReceipt(receipt);
  });
  const onRefresh = () => schedule(async () => {
    // An explicit native readback may verify shutdown after a transient failure.
    // Terminal sessions stay terminal. Live sessions can resume after a read error.
    accept(await api.getState());
    resumePolling.current();
  });
  if (!state) return <main id="dev-control"><h1>動作確認</h1><p role={error ? "alert" : "status"}>{error ?? "専用sessionの状態を確認しています…"}</p>{error ? <button type="button" disabled={pending > 0} onClick={() => void onRefresh()}>最新の状態を確認</button> : null}</main>;
  return <DevControlView state={state} identity={identity} busy={pending > 0} error={error} restartReceipt={restartReceipt} onCommand={onCommand} onSave={onSave} onRestart={onRestart} onRefresh={onRefresh} />;
}
