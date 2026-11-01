import type { EventRoundResult, ServerMessagePayloadMap } from "@infinitas/shared";

export interface EventResultsSyncState {
  rounds: EventRoundResult[];
  publicRevision: number | null;
  nextCursor: string | null;
  complete: boolean;
}

export interface EventResultsSyncUpdate {
  state: EventResultsSyncState;
  restartRequired: boolean;
}

export function createEventResultsSyncState(): EventResultsSyncState {
  return { rounds: [], publicRevision: null, nextCursor: null, complete: false };
}

export function applyEventResultsPage(
  current: EventResultsSyncState,
  page: ServerMessagePayloadMap["EVENT_RESULTS"],
): EventResultsSyncUpdate {
  if (
    page.resync_required ||
    (current.publicRevision !== null && page.public_revision !== current.publicRevision)
  ) {
    return { state: createEventResultsSyncState(), restartRequired: true };
  }

  const byId = new Map(current.rounds.map((round) => [round.round_id, round]));
  for (const round of page.rounds) {
    const previous = byId.get(round.round_id);
    if (!previous || round.public_revision >= previous.public_revision) byId.set(round.round_id, round);
  }

  return {
    state: {
      rounds: [...byId.values()].sort((left, right) => left.started_at.localeCompare(right.started_at)),
      publicRevision: page.public_revision,
      nextCursor: page.next_cursor,
      complete: page.next_cursor === null,
    },
    restartRequired: false,
  };
}
