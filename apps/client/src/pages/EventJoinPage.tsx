import { useState } from "react";
import { JOIN_CODE_CHARSET, JOIN_CODE_LENGTH } from "@infinitas/shared";
export interface EventJoinDraft { roomId: string; joinCode: string }
export function EventJoinPage({ draft, onChange, identityReady, available, error, onJoin, onBack }: { draft: EventJoinDraft; onChange: (draft: EventJoinDraft) => void; identityReady: boolean; available: boolean; error: string | null; onJoin: () => void; onBack: () => void }) {
  const [showCode, setShowCode] = useState(false);
  const validCode = draft.joinCode.length === JOIN_CODE_LENGTH && [...draft.joinCode].every((c) => JOIN_CODE_CHARSET.includes(c));
  return <div className="event-form"><button type="button" onClick={onBack}>← 開催の入口へ</button><h1>開催へ参加</h1><label>開催ID<input value={draft.roomId} onChange={(e) => onChange({ ...draft, roomId: e.currentTarget.value })} /></label><label>参加コード<input type={showCode ? "text" : "password"} maxLength={JOIN_CODE_LENGTH} value={draft.joinCode} onChange={(e) => onChange({ ...draft, joinCode: e.currentTarget.value.toUpperCase().replace(/\s+/g, "") })} /></label><button type="button" onClick={() => setShowCode((value) => !value)}>{showCode ? "参加コードを隠す" : "参加コードを表示"}</button><p className="event-form-note">Hostから共有されたIDとコードを入力してください。参加後はHostの進行に合わせてプレーし、結果は自動提出します。</p>{!identityReady ? <p>Player IDとDJ NAMEを設定してください。</p> : null}{error ? <p role="alert">{error}</p> : null}<button type="button" className="event-primary" disabled={!identityReady || !available || !draft.roomId.trim() || !validCode} onClick={onJoin}>開催へ参加</button></div>;
}
