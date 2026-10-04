import {
  BPL4_ROUNDS,
  BPL_ROUNDS,
  JOIN_CODE_CHARSET,
  JOIN_CODE_LENGTH,
  LEVEL_FILTERS,
  MAX_PLAYERS_OPTIONS,
  MODES,
  PLAY_STYLES,
  ROOM_COMMENT_MAX_LENGTH,
  VISIBILITIES,
  WIN_METRICS,
  type EventRoomSettings,
  type LobbyRoomSummary,
  type RoomSettings,
} from "@infinitas/shared";
import { AlertCircle, Eye, EyeOff, Key, Lock, MessageSquare, Plus, RefreshCcw, Search, Trophy, Users, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EventCreateModal } from "../features/event/EventCreateModal";
import { createEventRoom, createRoom } from "../services/worker-api-client";
import { isEventCreateIdentityReady, isEventJoinIdentityReady } from "../services/event-join-policy";
import { lobbyStore, useLobbyStore } from "../stores/lobby-store";
import { roomStore, useRoomStore } from "../stores/room-store";
import { isRoomEntryReady, useSettingsStore } from "../stores/settings-store";

const defaultCreateDraft: RoomSettings = {
  visibility: "PUBLIC",
  join_code: null,
  auto_rematch: false,
  mode: "ARENA",
  win_metric: "SCORE",
  play_style: "SP",
  level_filter: "ANY",
  room_comment: "",
  max_players: 2,
};

const levelLabels: Record<RoomSettings["level_filter"], string> = {
  ANY: "制限なし",
  LV8_10: "Lv8～10",
  LV10: "Lv10",
  LV11: "Lv11",
  LV12: "Lv12",
};

const modeLabels: Record<RoomSettings["mode"], string> = {
  ARENA: "ARENA",
  BPL: `BPL (${BPL_ROUNDS} STAGE)`,
  BPL4: `BPL(${BPL4_ROUNDS} STAGE)`,
};

function isBplMode(mode: RoomSettings["mode"]): boolean {
  return mode === "BPL" || mode === "BPL4";
}

const winMetricLabels: Record<RoomSettings["win_metric"], string> = {
  SCORE: "SCORE (EX SCORE)",
  MISSCOUNT: "MISSCOUNT (BP)",
};

function normalizeJoinCodeInput(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

function validateJoinCode(value: string): string | null {
  if (value.length === 0) {
    return null;
  }
  if (value.length !== JOIN_CODE_LENGTH) {
    return `${JOIN_CODE_LENGTH} 文字で入力してください`;
  }
  for (const character of value) {
    if (!JOIN_CODE_CHARSET.includes(character)) {
      return "A-Z / 2-9 を使用してください（I/O/0/1 を除く）";
    }
  }
  return null;
}

type CreateRoomErrorField = "join_code";
type CreateRoomValidationError = {
  field: CreateRoomErrorField;
  message: string;
};

function scrollFieldIntoContainer(container: HTMLElement, target: HTMLElement): void {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const topOffset = 16;
  const nextTop = container.scrollTop + (targetRect.top - containerRect.top) - topOffset;
  container.scrollTo({
    top: Math.max(0, nextTop),
    behavior: "smooth",
  });
}

function roomTitle(room: LobbyRoomSummary): string {
  const name = room.roomName.trim();
  return name.length > 0 ? name : `${modeLabels[room.mode]} ${room.playStyle}`;
}

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

interface LobbyPageProps {
  pendingJoinRoomId?: string | null;
  pendingRecoveryJoin?: { roomId: string; joinCode: string } | null;
  onConsumePendingJoinRoomId?: () => void;
  onConsumePendingRecoveryJoin?: () => void;
  onNavigateToAutoMatch?: () => void;
  onSpectateRoom: (input: { roomId: string; joinCode: string | null }) => void;
  hostEventsAvailable?: boolean;
  hostEventCreationAvailable?: boolean;
  onJoinHostEvent?: (input: { roomId: string; joinCode: string }) => void;
}

export function LobbyPage({
  pendingJoinRoomId = null,
  pendingRecoveryJoin = null,
  onConsumePendingJoinRoomId,
  onConsumePendingRecoveryJoin,
  onNavigateToAutoMatch,
  onSpectateRoom,
  hostEventsAvailable = false,
  hostEventCreationAvailable = false,
  onJoinHostEvent,
}: LobbyPageProps) {
  const savedSettings = useSettingsStore((state) => state.saved);
  const rooms = useLobbyStore((state) => state.rooms);
  const loading = useLobbyStore((state) => state.loading);
  const errorMessage = useLobbyStore((state) => state.errorMessage);
  const roomConnectionStatus = useRoomStore((state) => state.connectionStatus);

  const [createDraft, setCreateDraft] = useState<RoomSettings>(defaultCreateDraft);
  const [manualRoomId, setManualRoomId] = useState("");
  const [manualJoinCode, setManualJoinCode] = useState("");
  const [busyAction, setBusyAction] = useState<"create" | "create-event" | "join" | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [showManualJoin, setShowManualJoin] = useState(false);
  const [manualJoinKind, setManualJoinKind] = useState<"NORMAL" | "HOST_EVENT">("NORMAL");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [eventCreateError, setEventCreateError] = useState<string | null>(null);
  const [showManualJoinCode, setShowManualJoinCode] = useState(false);
  const [showCreateJoinCode, setShowCreateJoinCode] = useState(false);
  const [createValidationSummary, setCreateValidationSummary] = useState<string | null>(null);
  const [createValidationFocusField, setCreateValidationFocusField] = useState<CreateRoomErrorField | null>(null);
  const [selectedRoomForJoin, setSelectedRoomForJoin] = useState<LobbyRoomSummary | null>(null);
  const [selectedRoomAction, setSelectedRoomAction] = useState<"join" | "spectate">("join");
  const [showRoomJoinCode, setShowRoomJoinCode] = useState(false);
  const [joinModalCode, setJoinModalCode] = useState("");
  const [joinModalError, setJoinModalError] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<(typeof MODES)[number] | "">("");
  const [playStyleFilter, setPlayStyleFilter] = useState<(typeof PLAY_STYLES)[number] | "">("");
  const [levelFilter, setLevelFilter] = useState<(typeof LEVEL_FILTERS)[number] | "">("");
  const [searchDraft, setSearchDraft] = useState("");
  const createRoomInFlightRef = useRef(false);
  const createEventInFlightRef = useRef(false);
  const createFormBodyRef = useRef<HTMLDivElement | null>(null);
  const createJoinCodeInputRef = useRef<HTMLInputElement | null>(null);
  const roomEntryReady = isRoomEntryReady(savedSettings);
  const eventJoinIdentityReady = isEventJoinIdentityReady(savedSettings);
  const normalParticipationActive = roomConnectionStatus !== "DISCONNECTED";
  const roomEntryRequiredMessage = "DJ NAME と DATA SOURCE を設定してからルーム作成・参加を行ってください。";

  const manualJoinCodeError = validateJoinCode(manualJoinCode);
  const createJoinCodeError = validateJoinCode(createDraft.join_code ?? "");
  const createBusy = busyAction === "create";

  useEffect(() => {
    const trimmedRoomId = pendingJoinRoomId?.trim() ?? "";
    if (trimmedRoomId.length === 0) {
      return;
    }

    setShowManualJoinCode(false);
    setShowManualJoin(true);
    setManualRoomId(trimmedRoomId);
    setManualJoinCode("");
    setLocalMessage(null);
    onConsumePendingJoinRoomId?.();
  }, [onConsumePendingJoinRoomId, pendingJoinRoomId]);

  useEffect(() => {
    const roomId = pendingRecoveryJoin?.roomId.trim() ?? "";
    const joinCode = pendingRecoveryJoin?.joinCode.trim() ?? "";
    if (roomId.length === 0 || joinCode.length === 0) {
      return;
    }

    setShowManualJoinCode(false);
    setShowManualJoin(true);
    setManualRoomId(roomId);
    setManualJoinCode(normalizeJoinCodeInput(joinCode));
    setLocalMessage(null);
    onConsumePendingRecoveryJoin?.();
  }, [onConsumePendingRecoveryJoin, pendingRecoveryJoin]);

  function closeManualJoinModal(): void {
    setShowManualJoinCode(false);
    setShowManualJoin(false);
    setManualRoomId("");
    setManualJoinCode("");
    setManualJoinKind("NORMAL");
  }

  function closeCreateRoomModal(): void {
    setShowCreateJoinCode(false);
    setShowCreateRoom(false);
    setCreateDraft({ ...defaultCreateDraft });
    setCreateValidationSummary(null);
    setCreateValidationFocusField(null);
    setLocalMessage(null);
  }

  function createHostEvent(settings: EventRoomSettings): void {
    if (createEventInFlightRef.current || normalParticipationActive) return;
    if (!hostEventCreationAvailable) {
      setEventCreateError("接続先serverは新しい開催の作成を受け付けていません。");
      return;
    }
    if (!isEventCreateIdentityReady(savedSettings, settings.host_plays, roomEntryReady)) {
      setEventCreateError(settings.host_plays ? "プレー兼任HostにはDATA SOURCE設定が必要です。" : "Player IDとDJ NAMEを設定してください。");
      return;
    }
    createEventInFlightRef.current = true;
    setBusyAction("create-event");
    setEventCreateError(null);
    void createEventRoom(savedSettings.apiBaseUrl, {
      host_player_id: savedSettings.playerId,
      host_display_name: savedSettings.displayName,
      settings,
    }).then((response) => {
      onJoinHostEvent?.({ roomId: response.room_id, joinCode: response.join_code });
      setShowCreateEvent(false);
    }).catch((error) => {
      setEventCreateError(error instanceof Error ? error.message : "開催を作成できませんでした。");
    }).finally(() => {
      createEventInFlightRef.current = false;
      setBusyAction(null);
    });
  }

  async function enterRoom(roomId: string, joinCode?: string | null): Promise<void> {
    roomStore.connect(
      joinCode === undefined ? { roomId } : { roomId, joinCode },
      {
        apiBaseUrl: savedSettings.apiBaseUrl,
        playerId: savedSettings.playerId,
        displayName: savedSettings.displayName,
        source: savedSettings.source,
        bitUnlockEnabled: savedSettings.bitUnlockEnabled,
        djpUnlockEnabled: savedSettings.djpUnlockEnabled,
        allowLeggendaria: savedSettings.allowLeggendaria,
        ownedPackIds: savedSettings.ownedPackIds,
      },
    );
  }

  const visibleRooms = useMemo(() => {
    const keyword = searchDraft.trim().toLowerCase();
    return rooms.filter((room) => {
      if (modeFilter !== "" && room.mode !== modeFilter) {
        return false;
      }
      if (playStyleFilter !== "" && room.playStyle !== playStyleFilter) {
        return false;
      }
      if (levelFilter !== "" && room.levelFilter !== levelFilter) {
        return false;
      }
      if (keyword.length === 0) {
        return true;
      }

      const title = roomTitle(room).toLowerCase();
      const owner = room.ownerDisplayName.toLowerCase();
      const roomId = room.roomId.toLowerCase();
      return title.includes(keyword) || owner.includes(keyword) || roomId.includes(keyword);
    });
  }, [rooms, modeFilter, playStyleFilter, levelFilter, searchDraft]);

  async function joinRoomFromList(room: LobbyRoomSummary, joinCode?: string | null): Promise<void> {
    setBusyAction("join");
    try {
      await enterRoom(room.roomId, joinCode);
    } finally {
      setBusyAction(null);
    }
  }

  function updateSelectFilter(key: "mode" | "playStyle" | "levelFilter", value: string): void {
    switch (key) {
      case "mode":
        setModeFilter(value as (typeof MODES)[number] | "");
        break;
      case "playStyle":
        setPlayStyleFilter(value as (typeof PLAY_STYLES)[number] | "");
        break;
      case "levelFilter":
        setLevelFilter(value as (typeof LEVEL_FILTERS)[number] | "");
        break;
    }
  }

  function requestJoin(room: LobbyRoomSummary): void {
    if (!roomEntryReady) {
      return;
    }

    if (room.hasJoinCode) {
      setSelectedRoomAction("join");
      setSelectedRoomForJoin(room);
      setJoinModalCode("");
      setJoinModalError(null);
      setShowRoomJoinCode(false);
      return;
    }

    void joinRoomFromList(room);
  }

  function requestSpectate(room: LobbyRoomSummary): void {
    if (room.hasJoinCode) {
      setSelectedRoomAction("spectate");
      setSelectedRoomForJoin(room);
      setJoinModalCode("");
      setJoinModalError(null);
      setShowRoomJoinCode(false);
      return;
    }

    onSpectateRoom({ roomId: room.roomId, joinCode: null });
  }

  function collectCreateRoomValidationErrors(): CreateRoomValidationError[] {
    const errors: CreateRoomValidationError[] = [];
    if (createJoinCodeError !== null) {
      errors.push({
        field: "join_code",
        message: createJoinCodeError,
      });
    }
    return errors;
  }

  function focusFirstCreateRoomError(errors: CreateRoomValidationError[]): void {
    const firstError = errors[0];
    if (!firstError) {
      return;
    }

    setCreateValidationFocusField(firstError.field);
    if (firstError.field === "join_code" && createJoinCodeInputRef.current) {
      const targetInput = createJoinCodeInputRef.current;
      targetInput.focus({ preventScroll: true });
      if (createFormBodyRef.current) {
        scrollFieldIntoContainer(createFormBodyRef.current, targetInput);
      } else {
        targetInput.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  return (
    <section className="relative flex min-h-full flex-col text-white">
      <header className="mb-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <h1 className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            対戦ロビーを探す
          </h1>
          <p className="mt-1 font-medium text-gray-500">{visibleRooms.length} 個のロビーがアクティブです</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            disabled={!roomEntryReady}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black rounded-lg flex items-center gap-2 transition-all active:scale-95 border border-indigo-400/30 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
            onClick={onNavigateToAutoMatch}
          >
            <Zap className="text-yellow-400" size={20} />
            <span>自動・Auto Match</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setManualJoinKind("NORMAL");
              setShowManualJoinCode(false);
              setShowManualJoin(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#2d2d30] px-5 py-2.5 text-sm font-bold transition-all hover:bg-[#353538] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Key size={18} className="text-gray-400" /> IDを手動入力
          </button>
          <button
            type="button"
            disabled={!eventJoinIdentityReady || !hostEventsAvailable || normalParticipationActive}
            title={hostEventsAvailable ? "開催へ参加" : "接続先serverは開催モードに対応していません"}
            onClick={() => {
              setManualJoinKind("HOST_EVENT");
              setShowManualJoinCode(false);
              setShowManualJoin(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-5 py-2.5 text-sm font-bold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trophy size={18} /> 開催へ参加
          </button>
          <button
            type="button"
            disabled={!eventJoinIdentityReady || !hostEventCreationAvailable || normalParticipationActive}
            title={hostEventCreationAvailable ? "開催を作成" : "接続先serverは新しい開催の作成を受け付けていません"}
            onClick={() => {
              setEventCreateError(null);
              setShowCreateEvent(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-black text-black shadow-[0_0_20px_rgba(251,191,36,0.25)] transition-all hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400 disabled:shadow-none"
          >
            <Plus size={18} /> 開催を作成
          </button>
          <button
            type="button"
            disabled={!roomEntryReady}
            onClick={() => setShowCreateRoom(true)}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-6 py-2.5 font-black text-black shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all hover:bg-cyan-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400 disabled:shadow-none"
          >
            <Plus size={22} /> ルーム作成
          </button>
        </div>
      </header>

      <section className="mb-8 flex flex-col gap-4 rounded-xl border border-white/5 bg-[#252526] p-4 shadow-2xl xl:flex-row xl:items-center xl:gap-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Filters</span>
          <select
            value={modeFilter}
            className="lobby-native-select cursor-pointer rounded-md border border-white/10 bg-[#1e1e1e] px-3 py-1.5 text-xs font-bold text-white outline-none transition-colors focus:border-cyan-500/50"
            onChange={(event) => updateSelectFilter("mode", event.currentTarget.value)}
          >
            <option value="">モード: すべて</option>
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabels[mode]}
              </option>
            ))}
          </select>
          <select
            value={playStyleFilter}
            className="lobby-native-select cursor-pointer rounded-md border border-white/10 bg-[#1e1e1e] px-3 py-1.5 text-xs font-bold text-white outline-none transition-colors focus:border-cyan-500/50"
            onChange={(event) => updateSelectFilter("playStyle", event.currentTarget.value)}
          >
            <option value="">プレイスタイル: すべて</option>
            {PLAY_STYLES.map((playStyle) => (
              <option key={playStyle} value={playStyle}>
                {playStyle}
              </option>
            ))}
          </select>
          <select
            value={levelFilter}
            className="lobby-native-select cursor-pointer rounded-md border border-white/10 bg-[#1e1e1e] px-3 py-1.5 text-xs font-bold text-white outline-none transition-colors focus:border-cyan-500/50"
            onChange={(event) => updateSelectFilter("levelFilter", event.currentTarget.value)}
          >
            <option value="">難易度: すべて</option>
            {LEVEL_FILTERS.map((levelFilter) => (
              <option key={levelFilter} value={levelFilter}>
                {levelLabels[levelFilter]}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            value={searchDraft}
            placeholder="部屋コメントで検索..."
            className="w-full rounded-lg border border-white/10 bg-[#1e1e1e] py-2 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-gray-700 focus:border-cyan-500/50"
            onChange={(event) => setSearchDraft(event.currentTarget.value)}
          />
        </div>
        <button
          type="button"
          disabled={loading}
          title={`ロビー一覧を更新 (${roomConnectionStatus})`}
          onClick={() => {
            void lobbyStore.refresh(savedSettings.apiBaseUrl);
          }}
          className="group/refresh shrink-0 rounded-lg border border-white/10 bg-[#1e1e1e] px-4 py-2 text-[10px] font-black tracking-widest text-gray-400 transition-all hover:bg-[#2d2d30] hover:text-cyan-400 active:scale-95 disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <RefreshCcw
              size={14}
              className={`text-cyan-500/50 transition-colors group-hover/refresh:text-cyan-400 ${loading ? "animate-spin text-cyan-400" : ""}`}
            />
            RELOAD
          </span>
        </button>
      </section>

      {errorMessage ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      ) : null}
      {!roomEntryReady ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200">
          <AlertCircle size={16} />
          <span>通常ルームへの参加、または開催でプレーするにはDJ NAMEとDATA SOURCEを設定してください。</span>
        </div>
      ) : null}

      <div className="flex-1">
        <div className="mb-8 grid gap-4">
          {visibleRooms.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-[#2d2d30] p-8 text-center text-sm font-medium text-gray-500">
              {loading ? "ロビー一覧を更新中..." : "公開中のロビーがありません。"}
            </div>
          ) : (
            visibleRooms.map((room) => (
              <div
                key={room.roomId}
                className="group relative flex items-center justify-between overflow-hidden rounded-xl border border-white/5 bg-[#2d2d30] p-5 transition-all hover:translate-x-1 hover:border-cyan-500/40 hover:bg-[#353538]"
              >
                <div className="absolute -bottom-4 right-24 select-none text-7xl font-black italic uppercase tracking-tighter text-white/[0.02]">
                  {room.mode}
                </div>
                <div className="relative z-10 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold transition-colors group-hover:text-cyan-400">{roomTitle(room)}</h3>
                    <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black text-cyan-400">
                      {room.mode === "ARENA" ? "ARENA" : room.mode === "BPL4" ? "BPL(4 STAGE)" : "BPL(3)"}
                    </span>
                    {room.hasJoinCode ? <Lock size={14} className="text-amber-500/70" /> : null}
                  </div>
                  <div className="flex flex-wrap gap-5 font-mono text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-cyan-500" />
                      {room.playStyle}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-cyan-500" />
                      {levelLabels[room.levelFilter]}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-cyan-500" />
                      {room.winMetric}
                    </span>
                  </div>
                </div>
                <div className="relative z-10 flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-2xl font-black italic tracking-tighter text-white">
                      {room.currentPlayers}{" "}
                      <span className="text-sm not-italic text-gray-500">/ {room.maxPlayers}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyAction !== null || !roomEntryReady}
                      onClick={() => requestJoin(room)}
                      className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 font-bold transition-all hover:border-cyan-400 hover:bg-cyan-500 hover:text-black disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-transparent disabled:text-gray-600"
                    >
                      参加
                    </button>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => requestSpectate(room)}
                      className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-6 py-2.5 font-bold text-emerald-100 transition-all hover:bg-emerald-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      観戦
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showCreateEvent ? (
        <EventCreateModal
          busy={busyAction === "create-event"}
          errorMessage={eventCreateError}
          identityReady={eventJoinIdentityReady}
          participantSourceReady={roomEntryReady}
          onClose={() => {
            if (busyAction !== "create-event") setShowCreateEvent(false);
          }}
          onSubmit={createHostEvent}
        />
      ) : null}

      {showManualJoin ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[1000]">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-[2px]" />
            <div className="relative flex min-h-full items-center justify-center p-4">
              <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-white/10 bg-[#252526] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-8 py-6">
                  <h2 className="flex items-center gap-3 text-xl font-bold text-white">
                    <Key size={22} className="text-cyan-400" />
                    {manualJoinKind === "HOST_EVENT" ? "開催へ参加" : "Room ID を手動入力"}
                  </h2>
                  <button
                    type="button"
                    onClick={closeManualJoinModal}
                    className="rounded-full p-1 text-gray-500 transition-all hover:bg-white/5 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="flex flex-col gap-8 bg-[#252526] p-10">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black tracking-[0.2em] text-gray-300">Room ID (UUID)</label>
                    <input
                      type="text"
                      value={manualRoomId}
                      placeholder="00000000-0000-0000-0000-000000000000"
                      className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-4 font-mono text-sm text-white outline-none transition-all placeholder:text-gray-600 focus:border-cyan-500"
                      onChange={(event) => {
                        setManualRoomId(event.currentTarget.value);
                      }}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-end justify-between">
                      <label className="text-[10px] font-black tracking-[0.2em] text-gray-300">合言葉</label>
                      {manualJoinCodeError ? <span className="text-[10px] font-bold text-red-500">{manualJoinCodeError}</span> : null}
                    </div>
                    <div className="relative">
                      <input
                        type={showManualJoinCode ? "text" : "password"}
                        value={manualJoinCode}
                        maxLength={JOIN_CODE_LENGTH}
                        placeholder="例: A1B2C3D4"
                        className={`w-full rounded-xl border bg-[#1e1e1e] p-4 pr-12 text-center font-mono text-lg tracking-[0.3em] uppercase text-white outline-none transition-all placeholder:text-gray-700 ${
                          manualJoinCodeError ? "border-red-500" : "border-white/10 focus:border-cyan-500"
                        }`}
                        onChange={(event) => {
                          setManualJoinCode(normalizeJoinCodeInput(event.currentTarget.value));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowManualJoinCode((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-white"
                        aria-label={showManualJoinCode ? "合言葉を隠す" : "合言葉を表示"}
                      >
                        {showManualJoinCode ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={closeManualJoinModal}
                      className="flex-1 rounded-xl bg-white/5 py-4 font-bold text-white transition-all hover:bg-white/10"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      disabled={(manualJoinKind === "HOST_EVENT" ? !eventJoinIdentityReady : !roomEntryReady) || busyAction !== null || manualRoomId.trim().length === 0 || manualJoinCodeError !== null || (manualJoinKind === "HOST_EVENT" && manualJoinCode.length === 0)}
                      className={`flex-1 rounded-xl py-4 font-black transition-all shadow-[0_10px_20px_rgba(6,182,212,0.2)] ${
                        (manualJoinKind === "HOST_EVENT" ? !eventJoinIdentityReady : !roomEntryReady) || busyAction !== null || manualRoomId.trim().length === 0 || manualJoinCodeError !== null || (manualJoinKind === "HOST_EVENT" && manualJoinCode.length === 0)
                          ? "cursor-not-allowed bg-gray-800 text-gray-600"
                          : "bg-cyan-500 text-white hover:bg-cyan-400"
                      }`}
                      onClick={() => {
                        if (manualJoinKind === "HOST_EVENT") {
                          if (manualJoinCode.trim().length > 0) {
                            onJoinHostEvent?.({ roomId: manualRoomId.trim(), joinCode: manualJoinCode.trim() });
                            closeManualJoinModal();
                          }
                          return;
                        }
                        setBusyAction("join");
                        void enterRoom(manualRoomId.trim(), manualJoinCode.trim() || null).finally(() => {
                          setBusyAction(null);
                        });
                      }}
                    >
                      参加を確定
                    </button>
                    {manualJoinKind === "NORMAL" ? <button
                      type="button"
                      disabled={busyAction !== null || manualRoomId.trim().length === 0 || manualJoinCodeError !== null}
                      className="rounded-xl border border-emerald-400/25 bg-emerald-500/15 py-4 font-black text-emerald-100 transition-all hover:bg-emerald-400 hover:text-black disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-gray-800 disabled:text-gray-600"
                      onClick={() => {
                        onSpectateRoom({
                          roomId: manualRoomId.trim(),
                          joinCode: manualJoinCode.trim() || null,
                        });
                        closeManualJoinModal();
                      }}
                    >
                      観戦する
                    </button> : <div />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {showCreateRoom ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[1001]">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-[2px]" />
            <div className="relative flex min-h-full items-center justify-center p-4">
              <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#252526] shadow-[0_25px_70px_rgba(0,0,0,0.8)]">
            <div className="flex items-center justify-between border-b border-white/5 bg-cyan-500/5 px-8 py-6">
              <h2 className="flex items-center gap-3 text-xl font-bold text-cyan-400">
                <Plus size={24} />
                新規ルーム作成
              </h2>
              <button
                type="button"
                onClick={closeCreateRoomModal}
                className="rounded-full p-1 text-gray-500 transition-all hover:bg-white/5 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            <div ref={createFormBodyRef} className="custom-scrollbar flex-1 space-y-8 overflow-y-auto bg-[#252526] px-8 py-6">
              <section className="space-y-4">
                <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  <Trophy size={14} />
                  Rule Settings
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400">対戦モード</label>
                    <select
                      value={createDraft.mode}
                      className="lobby-native-select w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 text-sm text-white outline-none transition-all focus:border-cyan-500"
                      onChange={(event) => {
                        const nextMode = event.currentTarget.value as (typeof MODES)[number];
                        setCreateDraft((current) => ({
                          ...current,
                          mode: nextMode,
                          max_players: isBplMode(nextMode) ? 2 : current.max_players,
                        }));
                      }}
                    >
                      {MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {modeLabels[mode]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400">勝敗基準</label>
                    <select
                      value={createDraft.win_metric}
                      className="lobby-native-select w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 text-sm text-white outline-none transition-all focus:border-cyan-500"
                      onChange={(event) => {
                        const nextWinMetric = event.currentTarget.value as (typeof WIN_METRICS)[number];
                        setCreateDraft((current) => ({
                          ...current,
                          win_metric: nextWinMetric,
                        }));
                      }}
                    >
                      {WIN_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {winMetricLabels[metric]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400">プレイスタイル</label>
                  <div className="flex gap-2">
                    {PLAY_STYLES.map((playStyle) => (
                      <button
                        key={playStyle}
                        type="button"
                        onClick={() => {
                          setCreateDraft((current) => ({
                            ...current,
                            play_style: playStyle,
                          }));
                        }}
                        className={`flex-1 rounded-lg border py-2 text-xs font-bold transition-all ${
                          createDraft.play_style === playStyle
                            ? "border-cyan-500 bg-cyan-500/20 text-cyan-400"
                            : "border-white/5 bg-[#1e1e1e] text-gray-500 hover:border-white/20"
                        }`}
                      >
                        {playStyle}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400">難易度帯 (目安)</label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {LEVEL_FILTERS.map((levelFilter) => (
                      <button
                        key={levelFilter}
                        type="button"
                        onClick={() => {
                          setCreateDraft((current) => ({
                            ...current,
                            level_filter: levelFilter,
                          }));
                        }}
                        className={`rounded-lg border px-2 py-2 text-xs font-bold transition-all ${
                          createDraft.level_filter === levelFilter
                            ? "border-cyan-500 bg-cyan-500/20 text-cyan-400"
                            : "border-white/5 bg-[#1e1e1e] text-gray-500 hover:border-white/20"
                        }`}
                      >
                        {levelLabels[levelFilter]}
                      </button>
                    ))}
                  </div>
                </div>
                {isBplMode(createDraft.mode) ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-400">
                      <Users size={14} />
                      最大人数
                    </label>
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs font-bold text-cyan-400">
                      BPL は 2P 固定です
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-400">
                      <Users size={14} />
                      最大人数
                    </label>
                    <div className="flex gap-2">
                      {MAX_PLAYERS_OPTIONS.map((maxPlayers) => (
                        <button
                          key={maxPlayers}
                          type="button"
                          onClick={() => {
                            setCreateDraft((current) => ({
                              ...current,
                              max_players: maxPlayers,
                            }));
                          }}
                          className={`flex-1 rounded-lg border py-2 text-xs font-bold transition-all ${
                            createDraft.max_players === maxPlayers
                              ? "border-cyan-500 bg-cyan-500/20 text-cyan-400"
                              : "border-white/5 bg-[#1e1e1e] text-gray-500 hover:border-white/20"
                          }`}
                        >
                          {maxPlayers}P
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              <section className="space-y-4">
                <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  <Eye size={14} />
                  Visibility
                </h3>
                <div className="flex gap-1 rounded-xl bg-[#1e1e1e] p-1">
                  {VISIBILITIES.map((visibility) => (
                    <button
                      key={visibility}
                      type="button"
                      onClick={() => {
                        setCreateDraft((current) => ({
                          ...current,
                          visibility,
                          auto_rematch: visibility === "PRIVATE" ? current.auto_rematch === true : false,
                        }));
                      }}
                      className={`flex-1 rounded-lg py-2 text-[10px] font-black transition-all ${
                        createDraft.visibility === visibility
                          ? "border border-cyan-500/20 bg-[#2d2d30] text-cyan-400 shadow-lg"
                          : "text-gray-600 hover:text-gray-400"
                      }`}
                    >
                      {visibility}
                    </button>
                  ))}
                </div>
                {createDraft.visibility === "PRIVATE" ? (
                  <div className="space-y-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-bold text-cyan-100">
                      <span>Auto Rematch (RESULT 20秒後に次戦へ)</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={createDraft.auto_rematch === true}
                        onClick={() => {
                          setCreateDraft((current) => ({
                            ...current,
                            auto_rematch: current.auto_rematch !== true,
                          }));
                        }}
                        className={`rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                          createDraft.auto_rematch === true
                            ? "border-cyan-400 bg-cyan-400/20 text-cyan-100"
                            : "border-white/10 bg-black/20 text-gray-400 hover:border-white/25"
                        }`}
                      >
                        {createDraft.auto_rematch === true ? "ON" : "OFF"}
                      </button>
                    </label>
                    <p className="text-[11px] font-medium text-cyan-200/80">
                      PRIVATE ルームのみ有効です。公開ルームでは常に OFF になります。
                    </p>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <label htmlFor="create-room-join-code" className="text-xs font-bold text-gray-400">
                    合言葉 (Join Code)
                  </label>
                  <div className="relative">
                    <input
                      id="create-room-join-code"
                      ref={createJoinCodeInputRef}
                      type={showCreateJoinCode ? "text" : "password"}
                      value={createDraft.join_code ?? ""}
                      maxLength={JOIN_CODE_LENGTH}
                      aria-invalid={createJoinCodeError !== null}
                      aria-describedby={createJoinCodeError ? "create-room-join-code-error" : undefined}
                      placeholder={createDraft.visibility === "PUBLIC" ? "任意（未入力でパスワードなし）" : "空欄なら自動生成"}
                      className={`w-full rounded-xl border bg-[#1e1e1e] p-3 pr-12 font-mono text-sm uppercase text-white outline-none transition-all placeholder:text-gray-700 ${
                        createJoinCodeError
                          ? createValidationFocusField === "join_code"
                            ? "border-red-500 ring-2 ring-red-500/50"
                            : "border-red-500"
                          : "border-white/10 focus:border-cyan-500"
                      }`}
                      onChange={(event) => {
                        const nextJoinCode = normalizeJoinCodeInput(event.currentTarget.value);
                        setCreateValidationSummary(null);
                        if (createValidationFocusField === "join_code") {
                          setCreateValidationFocusField(null);
                        }
                        setCreateDraft((current) => ({
                          ...current,
                          join_code: nextJoinCode.length > 0 ? nextJoinCode : null,
                        }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreateJoinCode((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-white"
                      aria-label={showCreateJoinCode ? "合言葉を隠す" : "合言葉を表示"}
                    >
                      {showCreateJoinCode ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {createJoinCodeError ? (
                    <p id="create-room-join-code-error" className="text-[11px] font-bold text-red-400">
                      {createJoinCodeError}
                    </p>
                  ) : null}
                </div>
              </section>
              <section className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  <MessageSquare size={14} />
                  Room Comment
                </label>
                  <input
                    type="text"
                    maxLength={ROOM_COMMENT_MAX_LENGTH}
                    value={createDraft.room_comment}
                    placeholder="例：☆12地力S+ 練習中 / 武器曲投げ合い"
                    className="w-full rounded-xl border border-white/10 bg-[#1e1e1e] p-3 text-sm text-white outline-none transition-all placeholder:text-gray-700 focus:border-cyan-500"
                    onChange={(event) => {
                      const nextRoomComment = event.currentTarget.value;
                      setCreateDraft((current) => ({
                      ...current,
                      room_comment: nextRoomComment,
                    }));
                  }}
                />
              </section>
            </div>
            <div className="shrink-0 border-t border-white/5 bg-[#252526] px-8 py-6">
              {createValidationSummary ? (
                <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300" role="alert">
                  {createValidationSummary}
                </p>
              ) : null}
              {localMessage ? <p className="text-sm font-medium text-red-400">{localMessage}</p> : null}
              <div className="mt-3 flex gap-4">
                <button
                  type="button"
                  onClick={closeCreateRoomModal}
                  className="flex-1 rounded-xl bg-white/5 py-4 font-bold text-white transition-all hover:bg-white/10"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={!roomEntryReady || busyAction !== null}
                  className={`flex-1 rounded-xl py-4 font-black transition-all shadow-[0_10px_30px_rgba(6,182,212,0.3)] ${
                    !roomEntryReady || busyAction !== null
                      ? "cursor-not-allowed bg-gray-800 text-gray-600"
                      : "bg-cyan-500 text-black hover:bg-cyan-400"
                  }`}
                  onClick={() => {
                    if (createRoomInFlightRef.current) {
                      return;
                    }
                    if (!roomEntryReady) {
                      setLocalMessage(roomEntryRequiredMessage);
                      return;
                    }
                    const validationErrors = collectCreateRoomValidationErrors();
                    if (validationErrors.length > 0) {
                      const summaryPrefix = "入力内容に不備があります。赤枠の項目を確認してください。";
                      const summaryWithCount =
                        validationErrors.length > 1 ? `${summaryPrefix} (${validationErrors.length}件)` : summaryPrefix;
                      setCreateValidationSummary(summaryWithCount);
                      setLocalMessage(null);
                      focusFirstCreateRoomError(validationErrors);
                      return;
                    }

                    createRoomInFlightRef.current = true;
                    setBusyAction("create");
                    setCreateValidationSummary(null);
                    setCreateValidationFocusField(null);
                    setLocalMessage(null);
                    void createRoom(savedSettings.apiBaseUrl, createDraft)
                      .then(async (response) => {
                        await enterRoom(
                          response.room_id,
                          response.settings.visibility === "PRIVATE" ? response.settings.join_code : null,
                        );
                      })
                      .catch((error) => {
                        setLocalMessage(error instanceof Error ? error.message : "Failed to create room.");
                      })
                      .finally(() => {
                        createRoomInFlightRef.current = false;
                        setBusyAction(null);
                      });
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
                    {createBusy ? (
                      <RefreshCcw size={16} className="animate-spin" />
                    ) : (
                      <Plus size={18} />
                    )}
                    {createBusy ? "作成中..." : "ルームを作成する"}
                  </span>
                </button>
              </div>
            </div>
          </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {selectedRoomForJoin ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[2000]">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <div className="relative flex min-h-full items-center justify-center p-4">
              <div className="w-full max-w-[440px] overflow-hidden rounded-3xl border border-white/10 bg-[#1a1a1c] shadow-[0_30px_90px_rgba(0,0,0,0.9)]">
            <div className="relative p-8 pb-4 text-center">
              <div className="absolute right-6 top-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowRoomJoinCode(false);
                    setSelectedRoomForJoin(null);
                  }}
                  className="rounded-full p-2 text-gray-500 transition-all hover:bg-white/5 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mb-6 inline-flex rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-500">
                <Lock size={32} strokeWidth={2.5} />
              </div>
              <h2 className="mb-2 text-2xl font-black tracking-tight text-white">合言葉が必要です</h2>
              <p className="px-8 text-sm text-gray-500">
                「<span className="font-bold text-gray-300">{roomTitle(selectedRoomForJoin)}</span>」を
                {selectedRoomAction === "join" ? "参加" : "観戦"}するには、ホストが設定した合言葉を入力してください。
              </p>
            </div>
            <div className="flex flex-col gap-8 p-8 pt-4">
              <div className="space-y-4">
                <div className="flex items-end justify-between px-1">
                  <label className="text-[10px] font-black tracking-[0.2em] text-gray-500">合言葉を入力</label>
                  {joinModalError ? <span className="text-[10px] font-bold text-red-500">{joinModalError}</span> : null}
                </div>
                <div className="group relative">
                  <input
                    type={showRoomJoinCode ? "text" : "password"}
                    value={joinModalCode}
                    maxLength={JOIN_CODE_LENGTH}
                    autoFocus
                    placeholder="••••••••"
                    className={`w-full rounded-2xl border-2 bg-white/[0.03] p-6 pr-14 text-center font-mono text-3xl tracking-[0.5em] text-white outline-none transition-all placeholder:text-white/5 ${
                      joinModalError ? "border-red-500/50" : "border-white/5 group-hover:border-white/10 focus:border-cyan-500/50"
                    }`}
                    onChange={(event) => {
                      const nextJoinCode = normalizeJoinCodeInput(event.currentTarget.value);
                      setJoinModalCode(nextJoinCode);
                      setJoinModalError(validateJoinCode(nextJoinCode));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRoomJoinCode((current) => !current)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-white"
                    aria-label={showRoomJoinCode ? "合言葉を隠す" : "合言葉を表示"}
                  >
                    {showRoomJoinCode ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                  <div
                    className={`absolute -bottom-1 left-1/2 h-1 w-[60%] -translate-x-1/2 rounded-full bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.8)] transition-all duration-500 ${
                      joinModalCode.length === JOIN_CODE_LENGTH && joinModalError === null ? "opacity-100" : "scale-x-0 opacity-0"
                    }`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowRoomJoinCode(false);
                    setSelectedRoomForJoin(null);
                  }}
                  className="rounded-2xl bg-white/5 py-4 font-bold text-gray-400 transition-all hover:bg-white/10"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={
                    (selectedRoomAction === "join" && !roomEntryReady) ||
                    busyAction !== null ||
                    joinModalError !== null ||
                    joinModalCode.length !== JOIN_CODE_LENGTH
                  }
                  onClick={() => {
                    if (selectedRoomAction === "join" && !roomEntryReady) {
                      setJoinModalError(roomEntryRequiredMessage);
                      return;
                    }

                    const normalizedCode = normalizeJoinCodeInput(joinModalCode);
                    const validationError = validateJoinCode(normalizedCode);
                    setJoinModalCode(normalizedCode);
                    setJoinModalError(validationError);
                    if (validationError !== null) {
                      return;
                    }
                    if (selectedRoomAction === "spectate") {
                      onSpectateRoom({
                        roomId: selectedRoomForJoin.roomId,
                        joinCode: normalizedCode,
                      });
                      setShowRoomJoinCode(false);
                      setSelectedRoomForJoin(null);
                      return;
                    }
                    void joinRoomFromList(selectedRoomForJoin, normalizedCode).then(() => {
                      setShowRoomJoinCode(false);
                      setSelectedRoomForJoin(null);
                    });
                  }}
                  className={`rounded-2xl py-4 font-black transition-all ${
                    (selectedRoomAction === "join" && !roomEntryReady) ||
                    busyAction !== null ||
                    joinModalError !== null ||
                    joinModalCode.length !== JOIN_CODE_LENGTH
                      ? "cursor-not-allowed bg-gray-800 text-gray-600 opacity-50"
                      : selectedRoomAction === "join"
                        ? "bg-cyan-500 text-black shadow-[0_10px_30px_rgba(6,182,212,0.3)] hover:bg-cyan-400"
                        : "bg-emerald-400 text-black shadow-[0_10px_30px_rgba(52,211,153,0.25)] hover:bg-emerald-300"
                  }`}
                >
                  {selectedRoomAction === "join" ? "参加する" : "観戦する"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 border-t border-white/5 bg-white/[0.02] px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-600">
              <Search size={12} />
              合言葉の確認
            </div>
          </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </section>
  );
}
