import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Database,
  FolderOpen,
  MessageSquare,
  Save,
  Package,
  CheckSquare,
  CheckCircle2,
  Square,
  Check,
  Loader2,
  Settings as SettingsIcon,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import { pickDirectory, validateSourceDirectory } from "../services/tauri-bridge";
import { matchHistoryOverlayService } from "../services/match-history-overlay";
import type { SongPack, SourceType } from "@infinitas/shared";
import { listSongPacks, sendFeedback, type FeedbackRequest } from "../services/worker-api-client";
import {
  getActiveSourceDirectory,
  getVoicePlaybackVolume,
  isValidPortNumber,
  isVoicePlaybackEnabled,
  SOURCE_PORT_MAX,
  SOURCE_PORT_MIN,
  settingsStore,
  type ClientSettings,
  useSettingsStore,
} from "../stores/settings-store";
import clientPackageJson from "../../package.json";

interface SettingsPageProps {
  roomJoined: boolean;
  onNavigateToLobby: () => void;
}

const DJ_NAME_PATTERN = /^[a-zA-Z0-9.\-*&!?#$]*$/;
const DJ_NAME_MAX_LENGTH = 6;
const DAKEN_COUNTER_V3_CONNECTION_WARNING =
  "打鍵カウンタv3 に接続できませんでした。ポート設定と起動状態を確認してください。";

const SOURCE_OPTIONS = [
  {
    id: "inf_daken_counter" as const,
    name: "打鍵カウンタ",
    description: "today_update.xml を監視",
    usesDirectory: true,
    directoryLabel: "Daken Counter Directory",
    directoryPlaceholder: "C:\\Games\\beatmania IIDX INFINITAS\\data",
  },
  {
    id: "inf-notebook" as const,
    name: "リザルト手帳",
    description: "summary.json を監視",
    usesDirectory: true,
    directoryLabel: "Result Notebook Directory",
    directoryPlaceholder: "C:\\Users\\you\\Documents\\inf-notebook",
  },
  {
    id: "reflux" as const,
    name: "Reflux",
    description: "latest.json を監視",
    usesDirectory: true,
    directoryLabel: "Reflux Directory (contains Reflux.exe)",
    directoryPlaceholder: "C:\\Users\\you\\Documents\\Reflux",
  },
  {
    id: "daken_counter_v3" as const,
    name: "打鍵カウンタv3",
    description: "ローカルWebSocket (today_updates) を監視",
    usesDirectory: false,
    portLabel: "Daken Counter v3 WebSocket Port",
  },
];

const HIDDEN_SOURCE_IDS = new Set<(typeof SOURCE_OPTIONS)[number]["id"]>(["inf_daken_counter"]);
const VISIBLE_SOURCE_OPTIONS = SOURCE_OPTIONS.filter((option) => !HIDDEN_SOURCE_IDS.has(option.id));
const VOLUME_PREVIEW_SE_URL = "/se/count_beep.mp3";
const FEEDBACK_TITLE_MAX_LENGTH = 100;
const FEEDBACK_SUMMARY_MAX_LENGTH = 2000;
const FEEDBACK_STEPS_MAX_LENGTH = 2000;
const FEEDBACK_SUPPLEMENT_MAX_LENGTH = 2000;
const FEEDBACK_PROBLEM_MAX_LENGTH = 2000;
const FEEDBACK_PROPOSAL_MAX_LENGTH = 2000;
const FEEDBACK_CONTENT_MAX_LENGTH = 3000;
const FEEDBACK_SCREEN = "SettingsScreen";
const APP_VERSION = typeof clientPackageJson.version === "string" ? clientPackageJson.version : "unknown";

type FeedbackCategory = "bug" | "feature" | "other";
type SettingsErrorField = "display_name" | "source_directory" | "source_port";

interface FeedbackDraft {
  category: FeedbackCategory;
  title: string;
  summary: string;
  steps: string;
  supplement: string;
  problem: string;
  proposal: string;
  content: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "save_error" | "validation_error";
type SettingsSectionKey = "basic" | "advanced" | "other";

const AUTOSAVE_DEBOUNCE_MS = 500;
const AUTOSAVE_SAVED_MESSAGE_DURATION_MS = 2_000;

interface CollapsibleSettingsSectionProps {
  sectionKey: SettingsSectionKey;
  title: string;
  description: string;
  icon: ReactNode;
  isOpen: boolean;
  onToggle: (sectionKey: SettingsSectionKey) => void;
  children: ReactNode;
}

function CollapsibleSettingsSection({
  sectionKey,
  title,
  description,
  icon,
  isOpen,
  onToggle,
  children,
}: CollapsibleSettingsSectionProps) {
  const contentId = `settings-section-${sectionKey}`;
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#1b1b1f]">
      <button
        type="button"
        onClick={() => {
          onToggle(sectionKey);
        }}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-cyan-400">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-200">{title}</h2>
            <p className="mt-1 text-xs font-semibold text-gray-500">{description}</p>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180 text-cyan-300" : ""}`}
        />
      </button>
      {isOpen ? (
        <div id={contentId} className="border-t border-white/10 px-6 py-8">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function SettingsPage({ roomJoined, onNavigateToLobby }: SettingsPageProps) {
  const draft = useSettingsStore((state) => state.draft);
  const saved = useSettingsStore((state) => state.saved);
  const statusMessage = useSettingsStore((state) => state.statusMessage);
  const savedApiBaseUrl = saved.apiBaseUrl;
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const autosaveDebounceTimerRef = useRef<number | null>(null);
  const autosaveSavedTimerRef = useRef<number | null>(null);
  const latestAutosaveRequestIdRef = useRef(0);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [focusedErrorField, setFocusedErrorField] = useState<SettingsErrorField | null>(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>(() => createInitialFeedbackDraft());
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [feedbackValidationError, setFeedbackValidationError] = useState<string | null>(null);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const [songPacks, setSongPacks] = useState<SongPack[]>([]);
  const [songPackDialogMessage, setSongPackDialogMessage] = useState<string | null>(null);
  const [isSongPackLoading, setIsSongPackLoading] = useState(false);
  const [isResettingMatchHistory, setIsResettingMatchHistory] = useState(false);
  const [matchHistoryResetMessage, setMatchHistoryResetMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const activeOption = getSourceOption(draft.source);
  const activeDirectory = activeOption.usesDirectory ? getActiveSourceDirectory(draft) : "";

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveStatusLabel =
    saveStatus === "saving"
      ? "セーブ中"
      : saveStatus === "saved"
        ? "セーブ完了"
        : saveStatus === "save_error"
          ? "セーブ時エラー"
          : saveStatus === "validation_error"
            ? "未保存（入力エラー）"
            : null;
  const saveStatusToneClass =
    saveStatus === "saving"
      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
      : saveStatus === "saved"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        : saveStatus === "save_error"
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : saveStatus === "validation_error"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
            : "border-white/15 bg-black/35 text-gray-400";
  const [openSections, setOpenSections] = useState<Record<SettingsSectionKey, boolean>>({
    basic: true,
    advanced: false,
    other: false,
  });

  const togglePack = (packId: number) => {
    const currentOwnedPackIds = draft.ownedPackIds;
    const nextOwnedPackIds = currentOwnedPackIds.includes(packId)
      ? currentOwnedPackIds.filter((currentPackId) => currentPackId !== packId)
      : [...currentOwnedPackIds, packId].sort((left, right) => left - right);
    settingsStore.update("ownedPackIds", nextOwnedPackIds);
  };

  const toggleSection = (sectionKey: SettingsSectionKey) => {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };
  
  useEffect(() => {
    settingsStore.restoreDraftFromSaved();
    setDisplayNameError(null);
    setValidationMessage(null);
  }, []);

  useEffect(() => {
    return () => {
      if (autosaveDebounceTimerRef.current !== null) {
        window.clearTimeout(autosaveDebounceTimerRef.current);
        autosaveDebounceTimerRef.current = null;
      }
      if (autosaveSavedTimerRef.current !== null) {
        window.clearTimeout(autosaveSavedTimerRef.current);
        autosaveSavedTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsSongPackLoading(true);

    void listSongPacks(draft.apiBaseUrl)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const sortedPacks = [...response.song_packs].sort((left, right) => {
          if (left.display_order !== right.display_order) {
            return right.display_order - left.display_order;
          }
          return left.inf_pack_id - right.inf_pack_id;
        });
        setSongPacks(sortedPacks);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setSongPacks([]);
        setSongPackDialogMessage(
          formatUnknownError(error, "楽曲パック一覧の取得に失敗しました。APIの状態を確認してください。"),
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setIsSongPackLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [draft.apiBaseUrl]);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current !== null) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        previewAudioRef.current = null;
      }
    };
  }, []);

  function stopVolumePreviewAudio(): void {
    if (previewAudioRef.current === null) {
      return;
    }

    previewAudioRef.current.pause();
    previewAudioRef.current.currentTime = 0;
    previewAudioRef.current = null;
  }

  function playVolumePreviewOnRelease(): void {
    const currentDraft = settingsStore.getState().draft;
    if (!isVoicePlaybackEnabled(currentDraft)) {
      stopVolumePreviewAudio();
      return;
    }

    stopVolumePreviewAudio();
    const audio = new Audio(VOLUME_PREVIEW_SE_URL);
    audio.volume = getVoicePlaybackVolume(currentDraft);
    previewAudioRef.current = audio;

    const cleanup = () => {
      if (previewAudioRef.current === audio) {
        previewAudioRef.current = null;
      }
    };

    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("pause", cleanup, { once: true });
    void audio.play().catch(() => {
      cleanup();
    });
  }

  async function handleBrowseDirectory(): Promise<void> {
    if (!activeOption.usesDirectory) {
      return;
    }

    try {
      const selectedDirectory = await pickDirectory();
      if (selectedDirectory !== null) {
        settingsStore.updateSourceDirectory(draft.source, selectedDirectory);
        setValidationMessage(null);
      }
    } catch (error) {
      settingsStore.setStatusMessage(formatUnknownError(error, "Failed to open the directory picker."));
    }
  }

  function isLatestAutosaveRequest(requestId: number): boolean {
    return latestAutosaveRequestIdRef.current === requestId;
  }

  function clearAutosaveSavedTimer(): void {
    if (autosaveSavedTimerRef.current === null) {
      return;
    }
    window.clearTimeout(autosaveSavedTimerRef.current);
    autosaveSavedTimerRef.current = null;
  }

  function setSaveStatusForRequest(requestId: number, nextStatus: Exclude<SaveStatus, "saved">): void {
    if (!isLatestAutosaveRequest(requestId)) {
      return;
    }
    clearAutosaveSavedTimer();
    setSaveStatus(nextStatus);
  }

  function markSavedForRequest(requestId: number): void {
    if (!isLatestAutosaveRequest(requestId)) {
      return;
    }
    clearAutosaveSavedTimer();
    setSaveStatus("saved");
    autosaveSavedTimerRef.current = window.setTimeout(() => {
      if (!isLatestAutosaveRequest(requestId)) {
        return;
      }
      setSaveStatus("idle");
      autosaveSavedTimerRef.current = null;
    }, AUTOSAVE_SAVED_MESSAGE_DURATION_MS);
  }

  async function performAutosave(requestId: number, draftSnapshot: ClientSettings): Promise<void> {
    if (!isLatestAutosaveRequest(requestId)) {
      return;
    }

    settingsStore.setStatusMessage(null);
    setFocusedErrorField(null);

    const nextDisplayNameError = validateDisplayName(draftSnapshot.displayName);
    if (nextDisplayNameError !== null) {
      setDisplayNameError(nextDisplayNameError);
      setValidationMessage(null);
      focusErrorField("display_name");
      setSaveStatusForRequest(requestId, "validation_error");
      return;
    }

    setDisplayNameError(null);

    if (draftSnapshot.source === "daken_counter_v3") {
      if (!isValidPortNumber(draftSnapshot.dakenCounterV3Port)) {
        setValidationMessage(`WebSocketポートは ${SOURCE_PORT_MIN} - ${SOURCE_PORT_MAX} の整数で入力してください。`);
        focusErrorField("source_port");
        setSaveStatusForRequest(requestId, "validation_error");
        return;
      }
      setValidationMessage(null);
    } else {
      const activeDirectoryForSave = getActiveSourceDirectory(draftSnapshot);
      if (activeDirectoryForSave.trim().length === 0) {
        setValidationMessage("先に監視元フォルダを指定してください。");
        focusErrorField("source_directory");
        setSaveStatusForRequest(requestId, "validation_error");
        return;
      }

      try {
        const validation = await validateSourceDirectory({
          source: draftSnapshot.source,
          directoryPath: activeDirectoryForSave,
        });
        if (!isLatestAutosaveRequest(requestId)) {
          return;
        }

        if (validation.missingPaths.length > 0) {
          setValidationMessage(`必須ファイルが見つかりません: ${validation.missingPaths.join(" / ")}`);
          focusErrorField("source_directory");
          setSaveStatusForRequest(requestId, "validation_error");
          return;
        }

        setValidationMessage(null);
      } catch (error) {
        if (!isLatestAutosaveRequest(requestId)) {
          return;
        }
        setValidationMessage(formatUnknownError(error, "監視元フォルダの検証に失敗しました。"));
        focusErrorField("source_directory");
        setSaveStatusForRequest(requestId, "validation_error");
        return;
      }
    }

    if (!isLatestAutosaveRequest(requestId)) {
      return;
    }

    setSaveStatusForRequest(requestId, "saving");
    try {
      settingsStore.save(draftSnapshot);
    } catch (error) {
      if (!isLatestAutosaveRequest(requestId)) {
        return;
      }
      settingsStore.setStatusMessage(formatUnknownError(error, "設定の保存に失敗しました。"));
      setSaveStatusForRequest(requestId, "save_error");
      return;
    }

    settingsStore.setStatusMessage(null);
    markSavedForRequest(requestId);
  }

  useEffect(() => {
    if (draft === saved) {
      return;
    }

    setSaveStatus((current) => (current === "saved" ? "idle" : current));
    clearAutosaveSavedTimer();

    const requestId = latestAutosaveRequestIdRef.current + 1;
    latestAutosaveRequestIdRef.current = requestId;

    if (autosaveDebounceTimerRef.current !== null) {
      window.clearTimeout(autosaveDebounceTimerRef.current);
      autosaveDebounceTimerRef.current = null;
    }

    autosaveDebounceTimerRef.current = window.setTimeout(() => {
      autosaveDebounceTimerRef.current = null;
      void performAutosave(requestId, draft);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveDebounceTimerRef.current !== null) {
        window.clearTimeout(autosaveDebounceTimerRef.current);
        autosaveDebounceTimerRef.current = null;
      }
    };
  }, [draft, saved]);

  function focusErrorField(field: SettingsErrorField): void {
    setFocusedErrorField(field);
  }

  async function handleSubmitFeedback(): Promise<void> {
    const validationError = validateFeedbackDraft(feedbackDraft);
    if (validationError !== null) {
      setFeedbackValidationError(validationError);
      return;
    }

    setFeedbackValidationError(null);
    setFeedbackMessage(null);
    setIsFeedbackSubmitting(true);
    try {
      await sendFeedback(savedApiBaseUrl, buildFeedbackRequest(feedbackDraft));
      setFeedbackDraft(createInitialFeedbackDraft());
      setIsFeedbackModalOpen(false);
      setFeedbackMessage({ type: "success", text: "送信しました" });
    } catch {
      setFeedbackMessage({ type: "error", text: "送信に失敗しました" });
      setFeedbackValidationError("送信に失敗しました");
    } finally {
      setIsFeedbackSubmitting(false);
    }
  }

  async function handleResetMatchHistory(): Promise<void> {
    setIsResettingMatchHistory(true);
    setMatchHistoryResetMessage(null);
    try {
      await matchHistoryOverlayService.resetHistory();
      setMatchHistoryResetMessage({
        type: "success",
        text: "試合履歴をリセットしました。",
      });
    } catch (error) {
      setMatchHistoryResetMessage({
        type: "error",
        text: formatUnknownError(error, "試合履歴のリセットに失敗しました。"),
      });
    } finally {
      setIsResettingMatchHistory(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12">
      <header className="mb-2">
        <button
          type="button"
          onClick={onNavigateToLobby}
          className="group mb-4 flex items-center gap-2 text-sm font-bold text-gray-500 transition-colors hover:text-white"
        >
          <ChevronLeft size={18} className="transition-transform group-hover:-translate-x-1" />
          戻る
        </button>
        <h1 className="flex items-center gap-3 text-4xl font-black italic uppercase tracking-tighter text-white">
          <SettingsIcon className="h-8 w-8 text-cyan-500" />
          System Settings
        </h1>
          {/* 自動保存ステータスインジケーター */}
          <div className="pointer-events-none fixed right-6 top-6 z-50" aria-live="polite" aria-atomic="true">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold backdrop-blur-md transition-colors ${saveStatusToneClass}`}
            >
              {saveStatus === "saving" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : saveStatus === "saved" ? (
                <CheckCircle2 size={15} />
              ) : saveStatus === "save_error" || saveStatus === "validation_error" ? (
                <AlertTriangle size={15} />
              ) : (
                <Save size={15} />
              )}
              {saveStatusLabel !== null ? <span>{saveStatusLabel}</span> : null}
            </div>
          </div>
      </header>

      <div className="space-y-6">
        <CollapsibleSettingsSection
          sectionKey="basic"
          title="基本設定"
          description="DJ NAME と DATA SOURCE を設定します。"
          icon={<User size={18} />}
          isOpen={openSections.basic}
          onToggle={toggleSection}
        >
          <div className="space-y-12">
            <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <User size={20} className="text-cyan-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">User Profile</h2>
          </div>

          <div className="max-w-md space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500">DJ NAME</label>
            <input
              type="text"
              value={draft.displayName}
              maxLength={DJ_NAME_MAX_LENGTH}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                settingsStore.update("displayName", nextValue);
                if (focusedErrorField === "display_name") {
                  setFocusedErrorField(null);
                }
                setDisplayNameError(validateDisplayName(nextValue));
              }}
              aria-invalid={displayNameError !== null}
              placeholder="DJNAME"
              className={`w-full scroll-mt-20 rounded-xl border bg-[#252526] p-4 font-bold text-white outline-none transition-all placeholder:text-gray-600 ${
                displayNameError
                  ? focusedErrorField === "display_name"
                    ? "border-red-500 ring-2 ring-red-500/30"
                    : "border-red-500"
                  : "border-white/10 focus:border-cyan-500"
              }`}
            />
            {displayNameError ? <p className="text-sm font-semibold text-red-400">{displayNameError}</p> : null}
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <Database size={20} className="text-cyan-400" />
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Data Source</h2>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${
                  roomJoined ? "bg-amber-500/20 text-amber-300" : "bg-cyan-500/10 text-cyan-300"
                }`}
              >
                {roomJoined ? "Locked In Room" : "Ready"}
              </span>
            </div>
          </div>

          <div className="grid max-w-2xl gap-4 md:grid-cols-2">
            {VISIBLE_SOURCE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={roomJoined}
                onClick={() => {
                  settingsStore.update("source", option.id);
                  setValidationMessage(null);
                }}
                className={`flex flex-col gap-2 rounded-2xl border p-6 text-left transition-all ${
                  draft.source === option.id
                    ? "border-cyan-500 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
                    : "border-white/5 bg-[#252526] hover:border-white/20"
                } ${roomJoined ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <span className={`text-lg font-bold ${draft.source === option.id ? "text-cyan-400" : "text-white"}`}>
                  {option.name}
                </span>
                <span className="text-xs text-gray-500">{option.description}</span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase italic tracking-wider text-gray-500">
              {activeOption.usesDirectory ? activeOption.directoryLabel : activeOption.portLabel}
            </label>
            {activeOption.usesDirectory ? (
              <div className="flex max-w-3xl flex-col gap-3 md:flex-row">
                <input
                  type="text"
                  value={activeDirectory}
                  disabled={roomJoined}
                  onChange={(event) => {
                    settingsStore.updateSourceDirectory(draft.source, event.currentTarget.value);
                    if (focusedErrorField === "source_directory") {
                      setFocusedErrorField(null);
                    }
                    setValidationMessage(null);
                  }}
                  aria-invalid={validationMessage !== null}
                  placeholder={activeOption.directoryPlaceholder}
                  className={`flex-1 scroll-mt-20 rounded-xl border bg-[#151515] px-4 py-3 text-sm font-mono text-gray-300 outline-none placeholder:text-gray-600 disabled:cursor-not-allowed disabled:opacity-70 ${
                    validationMessage
                      ? focusedErrorField === "source_directory"
                        ? "border-red-500 ring-2 ring-red-500/30"
                        : "border-red-500"
                      : "border-white/5 focus:border-cyan-500"
                  }`}
                />
                <button
                  type="button"
                  disabled={roomJoined}
                  onClick={() => {
                    void handleBrowseDirectory();
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#2d2d30] px-6 py-3 text-sm font-bold text-white transition-all active:scale-95 hover:bg-[#353538] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FolderOpen size={18} />
                  参照
                </button>
              </div>
            ) : (
              <div className="max-w-md">
                <input
                  type="number"
                  inputMode="numeric"
                  min={SOURCE_PORT_MIN}
                  max={SOURCE_PORT_MAX}
                  step={1}
                  value={draft.dakenCounterV3Port}
                  disabled={roomJoined}
                  onChange={(event) => {
                    const parsed = Number.isFinite(event.currentTarget.valueAsNumber)
                      ? Math.trunc(event.currentTarget.valueAsNumber)
                      : 0;
                    settingsStore.update("dakenCounterV3Port", parsed);
                    if (focusedErrorField === "source_port") {
                      setFocusedErrorField(null);
                    }
                    setValidationMessage(null);
                  }}
                  aria-invalid={validationMessage !== null}
                  placeholder="8767"
                  className={`w-full scroll-mt-20 rounded-xl border bg-[#151515] px-4 py-3 text-sm font-mono text-gray-300 outline-none placeholder:text-gray-600 disabled:cursor-not-allowed disabled:opacity-70 ${
                    validationMessage
                      ? focusedErrorField === "source_port"
                        ? "border-red-500 ring-2 ring-red-500/30"
                        : "border-red-500"
                      : "border-white/5 focus:border-cyan-500"
                  }`}
                />
              </div>
            )}
            <p className="text-xs text-gray-500">
              {draft.source === "daken_counter_v3"
                ? `LOBBY入場時に ws://localhost:${draft.dakenCounterV3Port} へ接続します。PLAYING開始時に接続確認し、失敗時は「${DAKEN_COUNTER_V3_CONNECTION_WARNING}」を表示します。`
                : draft.source === "inf_daken_counter"
                ? "選択したフォルダ配下の today_update.xml を自動で監視します。"
                : draft.source === "reflux"
                ? "選択したフォルダ配下の latest.json を監視し、tracker.tsv からベスト値を補完します。"
                : "選択したフォルダ配下の records/summary.json を監視し、export/recent.json から score/misscount を補完します。"}
            </p>
            {validationMessage ? <p className="text-sm font-semibold text-red-400">{validationMessage}</p> : null}
          </div>

            </section>
          </div>
        </CollapsibleSettingsSection>

        <CollapsibleSettingsSection
          sectionKey="advanced"
          title="詳細設定"
          description="楽曲解禁、音声通知、試合履歴データを設定します。"
          icon={<Package size={18} />}
          isOpen={openSections.advanced}
          onToggle={toggleSection}
        >
          <div className="space-y-12">
            {/* --- 所持パック・解禁状況設定 --- */}
            <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <Package size={20} className="text-cyan-400" />
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Song Packs & Unlocks</h2>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${
                  roomJoined ? "bg-amber-500/20 text-amber-300" : "bg-cyan-500/10 text-cyan-300"
                }`}
              >
                {roomJoined ? "Locked In Room" : "Ready"}
              </span>
            </div>
          </div>

          <div className="space-y-6 rounded-2xl border border-white/5 bg-[#252526] p-6">
            <div className="grid gap-4 border-b border-white/5 pb-6 md:grid-cols-3">
              <button
                type="button"
                disabled={roomJoined}
                onClick={() => {
                  settingsStore.update("bitUnlockEnabled", !draft.bitUnlockEnabled);
                }}
                className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
                  draft.bitUnlockEnabled
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "border-white/5 bg-[#1e1e1e] text-gray-400 hover:border-white/20"
                } ${roomJoined ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <span className="font-bold">BIT解禁曲</span>
                {draft.bitUnlockEnabled ? <CheckSquare size={20} /> : <Square size={20} />}
              </button>
              <button
                type="button"
                disabled={roomJoined}
                onClick={() => {
                  settingsStore.update("djpUnlockEnabled", !draft.djpUnlockEnabled);
                }}
                className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
                  draft.djpUnlockEnabled
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "border-white/5 bg-[#1e1e1e] text-gray-400 hover:border-white/20"
                } ${roomJoined ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <span className="font-bold">DJP解禁曲</span>
                {draft.djpUnlockEnabled ? <CheckSquare size={20} /> : <Square size={20} />}
              </button>
              <button
                type="button"
                disabled={roomJoined}
                onClick={() => {
                  settingsStore.update("allowLeggendaria", !draft.allowLeggendaria);
                }}
                className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
                  draft.allowLeggendaria
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "border-white/5 bg-[#1e1e1e] text-gray-400 hover:border-white/20"
                } ${roomJoined ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <span className="font-bold">LEGGENDARIA譜面</span>
                {draft.allowLeggendaria ? <CheckSquare size={20} /> : <Square size={20} />}
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <label className="text-[10px] font-black uppercase text-gray-500">Owned Song Packs</label>
                <div className="space-x-4">
                  <button
                    type="button"
                    disabled={roomJoined || songPacks.length === 0}
                    onClick={() => {
                      const allPackIds = Array.from(new Set(songPacks.map((pack) => pack.inf_pack_id))).sort(
                        (left, right) => left - right,
                      );
                      settingsStore.update("ownedPackIds", allPackIds);
                    }}
                    className="text-xs font-bold text-cyan-400 hover:underline disabled:cursor-not-allowed disabled:text-gray-600 disabled:no-underline"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    disabled={roomJoined || draft.ownedPackIds.length === 0}
                    onClick={() => {
                      settingsStore.update("ownedPackIds", []);
                    }}
                    className="text-xs font-bold text-gray-500 hover:underline disabled:cursor-not-allowed disabled:text-gray-600 disabled:no-underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {isSongPackLoading ? (
                <p className="text-xs font-semibold text-cyan-300">楽曲パック一覧を取得中です...</p>
              ) : null}

              <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-2 custom-scrollbar lg:grid-cols-2">
                {songPacks.map((pack) => {
                  const isOwned = draft.ownedPackIds.includes(pack.inf_pack_id);
                  return (
                    <button
                      key={pack.inf_pack_id}
                      type="button"
                      disabled={roomJoined}
                      onClick={() => {
                        togglePack(pack.inf_pack_id);
                      }}
                      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                        isOwned
                          ? "border-cyan-500/50 bg-cyan-500/10 text-white"
                          : "border-white/5 bg-[#1e1e1e] text-gray-400 hover:border-white/20"
                      } ${roomJoined ? "cursor-not-allowed opacity-70" : ""}`}
                    >
                      <div
                        className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                          isOwned
                            ? "border-cyan-500 bg-cyan-500 text-black"
                            : "border-white/20 bg-black/50"
                        }`}
                      >
                        {isOwned ? <Check size={14} strokeWidth={4} /> : null}
                      </div>
                      <span className="truncate text-sm font-bold leading-relaxed">{pack.pack_name}</span>
                    </button>
                  );
                })}
              </div>
              {!isSongPackLoading && songPacks.length === 0 ? (
                <p className="text-xs font-semibold text-gray-500">楽曲パック一覧を取得できませんでした。</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <Volume2 size={20} className="text-cyan-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Audio Notice</h2>
          </div>

          <div className="max-w-md space-y-6 rounded-2xl border border-white/5 bg-[#252526] p-8">
            <div className="flex items-end justify-between gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400">Master Volume</label>
                <div className="text-3xl font-black italic text-white">
                  {draft.voiceMuted ? "MUTE" : draft.voiceVolume}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  settingsStore.updateVoiceMuted(!draft.voiceMuted);
                }}
                className={`rounded-xl p-3 transition-all ${
                  draft.voiceMuted
                    ? "border border-red-500/30 bg-red-500/20 text-red-400"
                    : "bg-white/5 text-gray-400 hover:text-white"
                }`}
              >
                {draft.voiceMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={draft.voiceVolume}
              disabled={draft.voiceMuted}
              onChange={(event) => {
                settingsStore.updateVoiceVolume(Number(event.currentTarget.value));
              }}
              onPointerUp={playVolumePreviewOnRelease}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#1e1e1e] accent-cyan-500 disabled:cursor-not-allowed"
            />

            <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter text-gray-600">
              <span>Min</span>
              <span>Max</span>
            </div>

            <button
              type="button"
              onClick={() => {
                settingsStore.update("enablePresentationSe", !draft.enablePresentationSe);
              }}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                draft.enablePresentationSe
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                  : "border-white/5 bg-[#1e1e1e] text-gray-400 hover:border-white/20"
              }`}
            >
              <div className="space-y-1">
                <p className="text-sm font-bold">演出SEを再生する</p>
                <p className="text-[11px] font-semibold text-gray-500">
                  ルーム入室時の初期値として使われます。
                </p>
              </div>
              {draft.enablePresentationSe ? <CheckSquare size={20} /> : <Square size={20} />}
            </button>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <Database size={20} className="text-cyan-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Match History Data</h2>
          </div>

          <div className="max-w-md space-y-4 rounded-2xl border border-white/5 bg-[#252526] p-8">
            <p className="text-sm font-semibold leading-relaxed text-gray-300">
              起動中セッションの試合履歴をリセットします。試合履歴ウィンドウは左サイドバーから開けます。
            </p>
            <button
              type="button"
              disabled={isResettingMatchHistory}
              onClick={() => {
                void handleResetMatchHistory();
              }}
              className={`w-full rounded-xl px-4 py-3 text-sm font-black transition-all ${
                isResettingMatchHistory
                  ? "cursor-not-allowed bg-gray-700 text-gray-400"
                  : "bg-red-500/90 text-white hover:bg-red-400"
              }`}
            >
              {isResettingMatchHistory ? "リセット中..." : "試合履歴をリセット"}
            </button>
            {matchHistoryResetMessage ? (
              <p
                className={`text-sm font-semibold ${
                  matchHistoryResetMessage.type === "success" ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {matchHistoryResetMessage.text}
              </p>
            ) : null}
          </div>
            </section>
          </div>
        </CollapsibleSettingsSection>

        <CollapsibleSettingsSection
          sectionKey="other"
          title="その他"
          description="Support からフィードバックを送信できます。"
          icon={<MessageSquare size={18} />}
          isOpen={openSections.other}
          onToggle={toggleSection}
        >
          <aside className="w-full rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Support</p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-gray-300">
              不具合報告・改善要望・その他の相談を送信できます。
            </p>
            <button
              type="button"
              onClick={() => {
                setFeedbackValidationError(null);
                setFeedbackMessage(null);
                setIsFeedbackModalOpen(true);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-sm font-black text-cyan-200 transition-all hover:bg-cyan-500/30"
            >
              <MessageSquare size={16} />
              フィードバックを送信
            </button>
            {feedbackMessage ? (
              <p className={`mt-3 text-xs font-bold ${feedbackMessage.type === "success" ? "text-emerald-300" : "text-red-300"}`}>
                {feedbackMessage.text}
              </p>
            ) : null}
          </aside>
        </CollapsibleSettingsSection>

        {statusMessage ? (
          <footer className="pt-4">
            <p className="text-sm text-gray-400">{statusMessage}</p>
          </footer>
        ) : null}
      </div>

      {isFeedbackModalOpen ? (
        <div className="fixed inset-0 z-[1200]">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-[2px]" />
          <div className="relative flex min-h-full items-center justify-center p-4">
            <div className="flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#252526] shadow-[0_25px_70px_rgba(0,0,0,0.8)]">
              <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-8 py-6">
                <h2 className="text-xl font-black text-white">フィードバック送信</h2>
              </div>
              <div className="flex flex-col gap-5 overflow-y-auto p-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">種別</label>
                  <select
                    value={feedbackDraft.category}
                    onChange={(event) => {
                      const nextCategory = event.currentTarget.value as FeedbackCategory;
                      setFeedbackDraft((current) => ({ ...current, category: nextCategory }));
                      setFeedbackValidationError(null);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 text-sm font-bold text-white outline-none transition-all focus:border-cyan-500"
                  >
                    <option value="bug">不具合報告</option>
                    <option value="feature">改善要望</option>
                    <option value="other">その他</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">件名</label>
                  <input
                    type="text"
                    value={feedbackDraft.title}
                    maxLength={FEEDBACK_TITLE_MAX_LENGTH}
                    onChange={(event) => {
                      const nextTitle = event.currentTarget.value;
                      setFeedbackDraft((current) => ({ ...current, title: nextTitle }));
                      setFeedbackValidationError(null);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-4 text-sm font-bold text-white outline-none transition-all placeholder:text-gray-600 focus:border-cyan-500"
                  />
                </div>

                {feedbackDraft.category === "bug" ? (
                  <>
                    <FeedbackTextarea
                      label="何が起きましたか？"
                      value={feedbackDraft.summary}
                      maxLength={FEEDBACK_SUMMARY_MAX_LENGTH}
                      onChange={(value) => {
                        setFeedbackDraft((current) => ({ ...current, summary: value }));
                        setFeedbackValidationError(null);
                      }}
                    />
                    <FeedbackTextarea
                      label="その前に何をしていましたか？（任意）"
                      value={feedbackDraft.steps}
                      maxLength={FEEDBACK_STEPS_MAX_LENGTH}
                      onChange={(value) => {
                        setFeedbackDraft((current) => ({ ...current, steps: value }));
                        setFeedbackValidationError(null);
                      }}
                    />
                    <FeedbackTextarea
                      label="補足（任意）"
                      value={feedbackDraft.supplement}
                      maxLength={FEEDBACK_SUPPLEMENT_MAX_LENGTH}
                      onChange={(value) => {
                        setFeedbackDraft((current) => ({ ...current, supplement: value }));
                        setFeedbackValidationError(null);
                      }}
                    />
                  </>
                ) : null}

                {feedbackDraft.category === "feature" ? (
                  <>
                    <FeedbackTextarea
                      label="困っていること"
                      value={feedbackDraft.problem}
                      maxLength={FEEDBACK_PROBLEM_MAX_LENGTH}
                      onChange={(value) => {
                        setFeedbackDraft((current) => ({ ...current, problem: value }));
                        setFeedbackValidationError(null);
                      }}
                    />
                    <FeedbackTextarea
                      label="こうしてほしい"
                      value={feedbackDraft.proposal}
                      maxLength={FEEDBACK_PROPOSAL_MAX_LENGTH}
                      onChange={(value) => {
                        setFeedbackDraft((current) => ({ ...current, proposal: value }));
                        setFeedbackValidationError(null);
                      }}
                    />
                  </>
                ) : null}

                {feedbackDraft.category === "other" ? (
                  <FeedbackTextarea
                    label="内容"
                    value={feedbackDraft.content}
                    maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
                    onChange={(value) => {
                      setFeedbackDraft((current) => ({ ...current, content: value }));
                      setFeedbackValidationError(null);
                    }}
                  />
                ) : null}

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-100">
                  <p>送信内容は不具合管理や改善検討に利用されます。</p>
                  <p>不具合報告・改善要望は公開 Issue として登録される場合があります。</p>
                  <p>個人情報、join code、表示名、ローカルファイルパスは入力しないでください。</p>
                </div>
              </div>

              <div className="shrink-0 border-t border-white/5 bg-[#252526] px-8 py-5">
                {feedbackValidationError ? <p className="text-sm font-semibold text-red-400">{feedbackValidationError}</p> : null}

                <div className={`flex gap-3 ${feedbackValidationError ? "pt-3" : ""}`}>
                  <button
                    type="button"
                    disabled={isFeedbackSubmitting}
                    onClick={() => {
                      setIsFeedbackModalOpen(false);
                    }}
                    className="flex-1 rounded-xl bg-white/5 py-4 font-bold text-white transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    disabled={isFeedbackSubmitting}
                    onClick={() => {
                      void handleSubmitFeedback();
                    }}
                    className={`flex-1 rounded-xl py-4 font-black transition-all ${
                      isFeedbackSubmitting
                        ? "cursor-not-allowed bg-gray-700 text-gray-400"
                        : "bg-cyan-500 text-black shadow-[0_10px_20px_rgba(6,182,212,0.2)] hover:bg-cyan-400"
                    }`}
                  >
                    {isFeedbackSubmitting ? "送信中..." : "送信"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {songPackDialogMessage ? (
        <div className="fixed inset-0 z-[1250]">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" />
          <div className="relative flex min-h-full items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-amber-500/25 bg-[#252526] p-7 shadow-[0_25px_70px_rgba(0,0,0,0.8)]">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Song Packs</p>
              <h2 className="mt-2 text-xl font-black text-white">楽曲パック一覧の取得に失敗しました</h2>
              <p className="mt-4 text-sm font-semibold leading-relaxed text-gray-300">{songPackDialogMessage}</p>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSongPackDialogMessage(null);
                  }}
                  className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-black text-black transition-all hover:bg-cyan-400"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function getSourceOption(source: SourceType) {
  return SOURCE_OPTIONS.find((option) => option.id === source) ?? SOURCE_OPTIONS[0]!;
}

function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "DJ NAME は必須です。";
  }

  if (Array.from(trimmed).length > DJ_NAME_MAX_LENGTH) {
    return "DJ NAME は6文字以内で入力してください。";
  }

  if (!DJ_NAME_PATTERN.test(trimmed)) {
    return "使用可能文字はa-z A-Z 0-9 .- *&!?#$です";
  }

  return null;
}

function createInitialFeedbackDraft(): FeedbackDraft {
  return {
    category: "bug",
    title: "",
    summary: "",
    steps: "",
    supplement: "",
    problem: "",
    proposal: "",
    content: "",
  };
}

function validateFeedbackDraft(draft: FeedbackDraft): string | null {
  const title = draft.title.trim();
  if (title.length === 0) {
    return "件名は必須です。";
  }
  if (Array.from(title).length > FEEDBACK_TITLE_MAX_LENGTH) {
    return "件名は100文字以内で入力してください。";
  }

  if (draft.category === "bug") {
    if (draft.summary.trim().length === 0) {
      return "何が起きましたか？は必須です。";
    }
    if (Array.from(draft.summary.trim()).length > FEEDBACK_SUMMARY_MAX_LENGTH) {
      return "何が起きましたか？は2000文字以内で入力してください。";
    }
    if (Array.from(draft.steps.trim()).length > FEEDBACK_STEPS_MAX_LENGTH) {
      return "その前に何をしていましたか？は2000文字以内で入力してください。";
    }
    if (Array.from(draft.supplement.trim()).length > FEEDBACK_SUPPLEMENT_MAX_LENGTH) {
      return "補足は2000文字以内で入力してください。";
    }
    return null;
  }

  if (draft.category === "feature") {
    if (draft.problem.trim().length === 0) {
      return "困っていることは必須です。";
    }
    if (draft.proposal.trim().length === 0) {
      return "こうしてほしいは必須です。";
    }
    if (Array.from(draft.problem.trim()).length > FEEDBACK_PROBLEM_MAX_LENGTH) {
      return "困っていることは2000文字以内で入力してください。";
    }
    if (Array.from(draft.proposal.trim()).length > FEEDBACK_PROPOSAL_MAX_LENGTH) {
      return "こうしてほしいは2000文字以内で入力してください。";
    }
    return null;
  }

  if (draft.content.trim().length === 0) {
    return "内容は必須です。";
  }
  if (Array.from(draft.content.trim()).length > FEEDBACK_CONTENT_MAX_LENGTH) {
    return "内容は3000文字以内で入力してください。";
  }

  return null;
}

function buildFeedbackRequest(draft: FeedbackDraft): FeedbackRequest {
  const client = {
    appVersion: APP_VERSION,
    platform: detectClientPlatform(),
    screen: FEEDBACK_SCREEN,
    sentAt: new Date().toISOString(),
  };

  if (draft.category === "bug") {
    const steps = draft.steps.trim();
    const supplement = draft.supplement.trim();
    return {
      category: "bug",
      title: draft.title.trim(),
      body: {
        summary: draft.summary.trim(),
        ...(steps.length > 0 ? { steps } : {}),
        ...(supplement.length > 0 ? { supplement } : {}),
      },
      client,
    };
  }

  if (draft.category === "feature") {
    return {
      category: "feature",
      title: draft.title.trim(),
      body: {
        problem: draft.problem.trim(),
        proposal: draft.proposal.trim(),
      },
      client,
    };
  }

  return {
    category: "other",
    title: draft.title.trim(),
    body: {
      content: draft.content.trim(),
    },
    client,
  };
}

function detectClientPlatform(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("windows")) {
    return "windows";
  }
  if (userAgent.includes("mac")) {
    return "macos";
  }
  if (userAgent.includes("linux")) {
    return "linux";
  }

  return "unknown";
}

function FeedbackTextarea({
  label,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">{label}</label>
      <textarea
        value={value}
        maxLength={maxLength}
        rows={4}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-4 text-sm text-white outline-none transition-all placeholder:text-gray-600 focus:border-cyan-500"
      />
    </div>
  );
}
