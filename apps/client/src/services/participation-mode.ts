import type { AppView } from "../components/AppSidebar";

export type ParticipationMode = "NORMAL" | "HOST_EVENT";

export function resolveParticipationView(view: AppView, mode: ParticipationMode | null): AppView {
  if (mode === "HOST_EVENT" && ["lobby", "room", "automatch", "spectate"].includes(view)) return "event-room";
  if (mode === "NORMAL" && ["event-entry", "event-create", "event-join", "event-room"].includes(view)) return "room";
  return view;
}

let activeMode: ParticipationMode | null = null;

export function getActiveParticipationMode(): ParticipationMode | null {
  return activeMode;
}

export function activateParticipationMode(mode: ParticipationMode): boolean {
  if (activeMode !== null && activeMode !== mode) {
    return false;
  }
  activeMode = mode;
  return true;
}

export function clearParticipationMode(mode: ParticipationMode): void {
  if (activeMode === mode) {
    activeMode = null;
  }
}
