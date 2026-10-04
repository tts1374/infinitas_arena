import {
  HOST_EVENT_NAME_MAX_LENGTH,
  HOST_EVENT_TYPES,
  JOIN_CODE_CHARSET,
  JOIN_CODE_LENGTH,
  PLAY_STYLES,
  WIN_METRICS,
  type EventRoomSettings,
} from "@infinitas/shared";
import { Eye, EyeOff, Lock, RefreshCcw, Trophy, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { validateEventName } from "./event-name";

const INITIAL_SETTINGS: EventRoomSettings = {
  event_name: "",
  event_type: "CASUAL",
  host_plays: false,
  play_style: "SP",
  win_metric: "SCORE",
  visibility: "PRIVATE",
  join_code: "",
};

function normalizeJoinCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

function validateJoinCode(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length !== JOIN_CODE_LENGTH) return `${JOIN_CODE_LENGTH}文字で入力してください。`;
  return [...value].every((character) => JOIN_CODE_CHARSET.includes(character))
    ? null
    : "A-Z / 2-9を使用してください（I/O/0/1を除く）。";
}

export interface EventCreateModalProps {
  busy: boolean;
  errorMessage: string | null;
  identityReady: boolean;
  participantSourceReady: boolean;
  onClose: () => void;
  onSubmit: (settings: EventRoomSettings) => void;
}

export function EventCreateModal({
  busy,
  errorMessage,
  identityReady,
  participantSourceReady,
  onClose,
  onSubmit,
}: EventCreateModalProps) {
  const [settings, setSettings] = useState<EventRoomSettings>(INITIAL_SETTINGS);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const eventNameError = validateEventName(settings.event_name);
  const joinCodeError = validateJoinCode(settings.join_code);
  const sourceBlocked = settings.host_plays && !participantSourceReady;
  const canSubmit = identityReady && !sourceBlocked && !busy;

  function submit(): void {
    const message = eventNameError ?? joinCodeError;
    if (message !== null) {
      setValidationMessage(message);
      return;
    }
    if (!identityReady) {
      setValidationMessage("Player IDとDJ NAMEを設定してください。");
      return;
    }
    if (sourceBlocked) {
      setValidationMessage("プレー兼任HostにはDATA SOURCE設定が必要です。");
      return;
    }
    setValidationMessage(null);
    onSubmit(settings);
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-[2px]" />
      <div className="relative flex min-h-full items-center justify-center p-4">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-amber-400/20 bg-[#252526] shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
          <header className="flex items-center justify-between border-b border-white/5 px-8 py-5">
            <h2 className="flex items-center gap-3 text-xl font-black"><Trophy className="text-amber-300" /> 開催を作成</h2>
            <button type="button" onClick={onClose} disabled={busy} aria-label="閉じる" className="rounded-full p-1 text-gray-500 hover:bg-white/5 hover:text-white disabled:opacity-40"><X /></button>
          </header>
          <div className="custom-scrollbar space-y-6 overflow-y-auto p-8">
            <section className="space-y-2">
              <label htmlFor="event-name" className="text-xs font-bold text-gray-300">開催名（空欄可）</label>
              <input
                id="event-name"
                value={settings.event_name}
                maxLength={HOST_EVENT_NAME_MAX_LENGTH}
                placeholder="空欄時は『合同プレー SP』などを表示"
                onChange={(event) => {
                  const eventName = event.currentTarget.value;
                  setValidationMessage(null);
                  setSettings((current) => ({ ...current, event_name: eventName }));
                }}
                className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 text-white outline-none focus:border-amber-400"
              />
              <p className="text-right text-[11px] text-gray-500">{settings.event_name.length}/{HOST_EVENT_NAME_MAX_LENGTH}</p>
            </section>

            <section className="grid gap-5 sm:grid-cols-2">
              <label htmlFor="event-type" className="space-y-2 text-xs font-bold text-gray-300">
                <span>開催タイプ</span>
                <select id="event-type" value={settings.event_type} onChange={(event) => {
                  const eventType = event.currentTarget.value as EventRoomSettings["event_type"];
                  setSettings((current) => ({ ...current, event_type: eventType }));
                }} className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 text-white">
                  {HOST_EVENT_TYPES.map((type) => <option key={type} value={type}>{type === "CASUAL" ? "合同プレー" : "大会"}</option>)}
                </select>
              </label>
              <label htmlFor="event-win-metric" className="space-y-2 text-xs font-bold text-gray-300">
                <span>勝敗指標</span>
                <select id="event-win-metric" value={settings.win_metric} onChange={(event) => {
                  const winMetric = event.currentTarget.value as EventRoomSettings["win_metric"];
                  setSettings((current) => ({ ...current, win_metric: winMetric }));
                }} className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 text-white">
                  {WIN_METRICS.map((metric) => <option key={metric} value={metric}>{metric}</option>)}
                </select>
              </label>
              <label htmlFor="event-play-style" className="space-y-2 text-xs font-bold text-gray-300">
                <span>プレースタイル</span>
                <select id="event-play-style" value={settings.play_style} onChange={(event) => {
                  const playStyle = event.currentTarget.value as EventRoomSettings["play_style"];
                  setSettings((current) => ({ ...current, play_style: playStyle }));
                }} className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 text-white">
                  {PLAY_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
                </select>
              </label>
              <div className="space-y-2 text-xs font-bold text-gray-300">
                <span>Hostの参加</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.host_plays}
                  onClick={() => setSettings((current) => ({ ...current, host_plays: !current.host_plays }))}
                  className={`w-full rounded-xl border p-3 text-left ${settings.host_plays ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-[#1e1e1e] text-gray-300"}`}
                >
                  {settings.host_plays ? "プレー兼任Host" : "専任Host（プレーしない）"}
                </button>
                {sourceBlocked ? <p className="text-[11px] text-red-300">プレー兼任にはDATA SOURCE設定が必要です。</p> : null}
              </div>
            </section>

            <section className="space-y-2">
              <label htmlFor="event-join-code" className="flex items-center gap-2 text-xs font-bold text-gray-300"><Lock size={14} /> PRIVATE参加コード</label>
              <div className="relative">
                <input
                  id="event-join-code"
                  type={showJoinCode ? "text" : "password"}
                  value={settings.join_code}
                  maxLength={JOIN_CODE_LENGTH}
                  placeholder="空欄なら自動生成"
                  onChange={(event) => {
                    const joinCode = normalizeJoinCode(event.currentTarget.value);
                    setValidationMessage(null);
                    setSettings((current) => ({ ...current, join_code: joinCode }));
                  }}
                  className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 pr-12 font-mono uppercase text-white outline-none focus:border-amber-400"
                />
                <button type="button" onClick={() => setShowJoinCode((current) => !current)} aria-label={showJoinCode ? "参加コードを隠す" : "参加コードを表示"} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  {showJoinCode ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {joinCodeError ? <p className="text-[11px] font-bold text-red-300">{joinCodeError}</p> : null}
            </section>
          </div>
          <footer className="border-t border-white/5 px-8 py-5">
            {validationMessage ?? errorMessage ? <p role="alert" className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">{validationMessage ?? errorMessage}</p> : null}
            <div className="flex gap-4">
              <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl bg-white/5 py-4 font-bold hover:bg-white/10 disabled:opacity-40">キャンセル</button>
              <button type="button" onClick={submit} disabled={!canSubmit} className="flex-1 rounded-xl bg-amber-400 py-4 font-black text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500">
                <span className="flex items-center justify-center gap-2">{busy ? <RefreshCcw size={16} className="animate-spin" /> : <Trophy size={16} />}開催を作成</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
