import type { ReactNode } from "react";
import { BarChart2, CalendarClock, Gamepad2, History, Home, Loader2, Settings } from "lucide-react";

export type AppView = "lobby" | "settings" | "room" | "stats" | "automatch" | "spectate" | "event-room" | "event-history";

interface AppSidebarProps {
  activeView: AppView;
  hasRoom: boolean;
  hasEventRoom: boolean;
  isOpeningMatchHistory: boolean;
  onNavigate: (view: AppView) => void;
  onOpenMatchHistory: () => void;
}

export function AppSidebar({
  activeView,
  hasRoom,
  hasEventRoom,
  isOpeningMatchHistory,
  onNavigate,
  onOpenMatchHistory,
}: AppSidebarProps) {
  return (
    <nav className="flex w-[70px] shrink-0 flex-col items-center border-r border-white/5 bg-[#252526] py-6">
      <div className="flex flex-1 flex-col gap-8">
        <SidebarButton
          active={activeView === "lobby"}
          label="Lobby"
          onClick={() => onNavigate("lobby")}
        >
          <Home size={24} />
        </SidebarButton>
        <SidebarButton
          active={activeView === "stats"}
          label="Stats"
          onClick={() => onNavigate("stats")}
        >
          <BarChart2 size={24} />
        </SidebarButton>
        <SidebarButton
          active={activeView === "event-history"}
          label="Event History"
          onClick={() => onNavigate("event-history")}
        >
          <CalendarClock size={24} />
        </SidebarButton>
        <SidebarButton
          active={false}
          disabled={isOpeningMatchHistory}
          label="Match History"
          onClick={onOpenMatchHistory}
        >
          {isOpeningMatchHistory ? <Loader2 size={24} className="animate-spin" /> : <History size={24} />}
        </SidebarButton>
        {hasRoom ? (
          <SidebarButton
            active={activeView === "room"}
            label="Room"
            onClick={() => onNavigate("room")}
          >
            <Gamepad2 size={24} />
          </SidebarButton>
        ) : null}
        {hasEventRoom ? (
          <SidebarButton
            active={activeView === "event-room"}
            label="Event Room"
            onClick={() => onNavigate("event-room")}
          >
            <Gamepad2 size={24} />
          </SidebarButton>
        ) : null}
      </div>

      <SidebarButton
        active={activeView === "settings"}
        label="Settings"
        onClick={() => onNavigate("settings")}
      >
        <Settings size={24} />
      </SidebarButton>
    </nav>
  );
}

interface SidebarButtonProps {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}

function SidebarButton({ active, disabled = false, label, onClick, children }: SidebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-xl p-3 transition-all ${
        active
          ? "border border-cyan-500/30 bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
          : "text-gray-500 hover:bg-white/5"
      } disabled:cursor-not-allowed disabled:text-gray-700 disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  );
}
