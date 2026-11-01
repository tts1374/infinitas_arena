import type { SongUnlockSettings, SourceType } from "@infinitas/shared";
import type { ClientSettings } from "../stores/settings-store";

type EventJoinSettings = Pick<
  ClientSettings,
  | "playerId"
  | "displayName"
  | "source"
  | "bitUnlockEnabled"
  | "djpUnlockEnabled"
  | "allowLeggendaria"
  | "ownedPackIds"
>;

export interface EventJoinParticipantEquipment {
  source: SourceType;
  songUnlocks: SongUnlockSettings;
}

export function isEventJoinIdentityReady(settings: Pick<EventJoinSettings, "playerId" | "displayName">): boolean {
  return settings.playerId.trim().length > 0 && settings.displayName.trim().length > 0;
}

export function isEventCreateIdentityReady(
  settings: Pick<EventJoinSettings, "playerId" | "displayName">,
  hostPlays: boolean,
  participantSourceReady: boolean,
): boolean {
  return isEventJoinIdentityReady(settings) && (!hostPlays || participantSourceReady);
}

export function resolveEventJoinParticipantEquipment(
  settings: EventJoinSettings,
  participantSourceReady: boolean,
): EventJoinParticipantEquipment | null {
  if (!participantSourceReady) return null;
  return {
    source: settings.source,
    songUnlocks: {
      bit_unlocked: settings.bitUnlockEnabled,
      djp_unlocked: settings.djpUnlockEnabled,
      allow_leggendaria: settings.allowLeggendaria,
      owned_pack_ids: settings.ownedPackIds,
    },
  };
}
