const NOTEBOOK_TIMESTAMP_PATTERN = /^\d{8}-\d{6}$/;
const NOTEBOOK_TIMESTAMP_CACHE_LIMIT = 64;
export interface EventNotebookObservationToken {
  eventId: string;
  playerId: string;
  timestamp: string;
  fingerprint: string;
}

const acceptedByEventPlayer = new Map<string, { timestamp: string; fingerprint: string }>();
const pendingByRequestId = new Map<string, EventNotebookObservationToken>();

function normalizedTimestamp(raw: string): string | null {
  const value = raw.trim();
  return NOTEBOOK_TIMESTAMP_PATTERN.test(value) ? value : null;
}

function key(eventId: string, playerId: string): string {
  return `${eventId}:${playerId}`;
}

export const eventNotebookReplayGuard = {
  rejection(eventId: string, playerId: string, rawTimestamp: string, fingerprint: string): { current: string; previous: string } | null {
    const current = normalizedTimestamp(rawTimestamp);
    if (current === null) return null;
    const previous = acceptedByEventPlayer.get(key(eventId, playerId));
    if (previous !== undefined && (current <= previous.timestamp || fingerprint === previous.fingerprint)) {
      return { current, previous: previous.timestamp };
    }
    const pending = [...pendingByRequestId.values()].find((entry) =>
      entry.eventId === eventId && entry.playerId === playerId && entry.timestamp === current && entry.fingerprint === fingerprint,
    );
    return pending ? { current, previous: pending.timestamp } : null;
  },
  track(requestId: string, token: EventNotebookObservationToken): boolean {
    const timestamp = normalizedTimestamp(token.timestamp);
    if (timestamp === null || pendingByRequestId.has(requestId)) return false;
    pendingByRequestId.set(requestId, { ...token, timestamp });
    return true;
  },
  acknowledge(requestId: string): boolean {
    const token = pendingByRequestId.get(requestId);
    if (!token) return false;
    pendingByRequestId.delete(requestId);
    const cacheKey = key(token.eventId, token.playerId);
    const previous = acceptedByEventPlayer.get(cacheKey);
    if (previous === undefined || token.timestamp > previous.timestamp) {
      acceptedByEventPlayer.delete(cacheKey);
      acceptedByEventPlayer.set(cacheKey, { timestamp: token.timestamp, fingerprint: token.fingerprint });
    }
    while (acceptedByEventPlayer.size > NOTEBOOK_TIMESTAMP_CACHE_LIMIT) {
      const oldest = acceptedByEventPlayer.keys().next().value;
      if (typeof oldest !== "string") break;
      acceptedByEventPlayer.delete(oldest);
    }
    return true;
  },
  reject(requestId: string): boolean {
    return pendingByRequestId.delete(requestId);
  },
  releasePending(): string[] {
    const requestIds = [...pendingByRequestId.keys()];
    pendingByRequestId.clear();
    return requestIds;
  },
  clearForTests(): void {
    acceptedByEventPlayer.clear();
    pendingByRequestId.clear();
  },
};

export function buildEventNotebookFingerprint(input: {
  titleSearchKey: string;
  difficulty: string;
  score: number;
  misscount: number;
}): string {
  return JSON.stringify([input.titleSearchKey, input.difficulty, input.score, input.misscount]);
}
