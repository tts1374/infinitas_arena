import { useRef, useState } from "react";
import type { EventRoomPhase } from "@infinitas/shared";
import { buildEventInviteText } from "./event-presentation";

export function shouldShowEventHostInvite(isHost: boolean, phase: EventRoomPhase): boolean {
  return isHost && (phase === "LOBBY" || phase === "PICKING");
}

export function EventHostInvite({ eventName, roomId, joinCode }: { eventName: string; roomId: string; joinCode: string }) {
  const [feedback, setFeedback] = useState<{ kind: "SUCCESS" | "ERROR"; message: string } | null>(null);
  const copyPendingRef = useRef(false);

  async function copy(label: string, value: string): Promise<void> {
    if (copyPendingRef.current) return;
    copyPendingRef.current = true;
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) throw new Error("Clipboard API is unavailable.");
      await navigator.clipboard.writeText(value);
      setFeedback({ kind: "SUCCESS", message: `${label}をコピーしました。` });
    } catch {
      setFeedback({ kind: "ERROR", message: `${label}をコピーできませんでした。` });
    } finally {
      copyPendingRef.current = false;
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-cyan-500/15 bg-cyan-500/[0.06] px-4 py-2 text-xs sm:px-6">
      <span className="text-gray-400">Room ID <b className="ml-1 font-mono text-white">{roomId}</b></span>
      <button type="button" onClick={() => void copy("Room ID", roomId)} className="rounded border border-white/15 px-2 py-1 font-bold text-cyan-300">IDをコピー</button>
      <span className="text-gray-400">参加コード <b className="ml-1 font-mono text-white">{joinCode}</b></span>
      <button type="button" onClick={() => void copy("参加コード", joinCode)} className="rounded border border-white/15 px-2 py-1 font-bold text-cyan-300">コードをコピー</button>
      <button type="button" onClick={() => void copy("招待情報", buildEventInviteText(eventName, roomId, joinCode))} className="rounded border border-cyan-500/30 px-2 py-1 font-bold text-cyan-200">招待情報をコピー</button>
      {feedback ? <span role={feedback.kind === "ERROR" ? "alert" : "status"} className={feedback.kind === "ERROR" ? "text-red-300" : "text-emerald-300"}>{feedback.message}</span> : null}
    </div>
  );
}
