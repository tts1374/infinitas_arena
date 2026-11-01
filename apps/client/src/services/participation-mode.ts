export type ParticipationMode = "NORMAL" | "HOST_EVENT";

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
