import type { EventRoomSnapshot, ExpectedKey, RoomStateSnapshot } from "@infinitas/shared";

/** Private development-tool protocol. Never sent as a product WS message. */
export const DEV_CONTROL_PROTOCOL_VERSION = 1 as const;
export type DevControlRole = "controller" | "self" | "participant";
export type DevControlSource = "inf-notebook" | "reflux" | "daken_counter_v3";
export type SendPolicy = "manual" | "auto" | "delay" | "hold";
export type DevControlAction =
  | "ready.set" | "pick.submit" | "match.start" | "match.forceAdvance" | "match.returnToLobby"
  | "event.start" | "event.confirmPick" | "event.cancelPick" | "event.startRound" | "event.closeRound"
  | "event.nextPick" | "event.end" | "participant.add" | "participant.disconnect" | "participant.reconnect"
  | "participant.leave" | "draft.update" | "policy.apply" | "result.send" | "result.delay"
  | "reservation.cancel" | "client.focus" | "state.refresh" | "evidence.save" | "session.stop" | "session.restart";
export interface ContextToken {
  sessionId: string;
  targetClientId: string;
  transportEpoch: number;
  roomId: string | null;
  roomGeneration: number | null;
  matchId: string | null;
  eventId: string | null;
  roundIndex: number | null;
  roundId: string | null;
  expectedKey: ExpectedKey | null;
  selectionRevision: number | null;
  policyRevision: number;
  valueRevision: number;
}
export interface DevControlCommand {
  protocolVersion: 1;
  operationId: string;
  sessionId: string;
  actorClientId: string;
  targetClientId: string;
  context: ContextToken;
  action: DevControlAction;
  payload: Record<string, unknown>;
}
export type DevControlResultStatus = "pending" | "reserved" | "input-written" | "parsed" | "sent" |
  "confirmed" | "rejected" | "unknown" | "cancelled" | "failed";
export interface DevControlResult {
  protocolVersion: 1;
  operationId: string;
  sessionId: string;
  context: ContextToken;
  status: DevControlResultStatus;
  reason: string | null;
  evidenceSequences: number[];
  nativeFocus?: { protocolVersion: 1; operationId: string; sessionId: string; clientId: string; focused: boolean };
}
export interface DevControlClientManifest {
  clientId: string;
  playerId: string | null;
  identifier: string;
  role: DevControlRole;
  transport: "real-client" | "headless" | null;
  windowLabel: string;
  source: DevControlSource | null;
  readOnlySource: { paths: string[]; port: number | null } | null;
  fixtureRoot: string | null;
  sourcePort: number | null;
  sourceControlFile?: string | null;
  initial?: boolean;
  storageRoot: string;
  spoolRoot: string;
}
export interface DevControlIdentity {
  protocolVersion: 1;
  sessionId: string;
  clientId: string;
  role: DevControlRole;
}
export interface DevControlClientState {
  manifest: DevControlClientManifest;
  context: ContextToken;
  connection: string;
  normalSnapshot: RoomStateSnapshot | null;
  eventSnapshot: EventRoomSnapshot | null;
  displayPhase: string | null;
  draft: { exScore: number | null; missCount: number | null };
  policy: SendPolicy;
  actions: Array<{ action: DevControlAction; enabled: boolean; reason: string | null }>;
  lastError: string | null;
}
export interface DevControlObservation {
  protocolVersion: 1;
  sequence: number;
  operationId: string | null;
  sessionId: string;
  clientId: string;
  playerId: string | null;
  context: ContextToken;
  stage: "operation" | "reserved" | "input" | "parsed" | "sent" | "received" | "failed";
  origin: "raw" | "derived" | "native";
  at: string;
  clientMsgId: string | null;
  requestId: string | null;
  snapshotRevision: number | null;
  receiveSequence: number | null;
  detail: Record<string, unknown>;
}
export interface DevControlState {
  protocolVersion: 1;
  sessionId: string;
  sourceHead: string;
  lifecycle: "starting" | "running" | "stopping" | "stopped" | "failed";
  recoveryRequired?: boolean;
  mode: "ARENA" | "BPL" | "BPL4" | "CASUAL" | "TOURNAMENT";
  hostClientId: string;
  restartOptions: DevControlRestartOptions;
  apiBaseUrl: string;
  roomId: string | null;
  joinCode: string | null;
  clients: DevControlClientState[];
  chartCandidates: Array<{ chartKey: string; title: string; expectedKey: ExpectedKey }>;
  availableParticipants?: string[];
  operations: DevControlResult[];
  observations: DevControlObservation[];
  stop?: { phase: "idle" | "quiescing" | "collecting" | "flushing" | "terminating" | "verifying" | "complete" | "failed"; requestedAt: string | null; completedAt: string | null; errors: string[]; processesVerified: boolean; portsVerified: boolean; exportRequestId?: string; exportDeadlineAt?: string; exportDeadlineMs?: number };
  evidence?: { captures: DevControlCaptureReceipt[] };
  save: { status: "idle" | "collecting" | "exporting" | "saved" | "partial" | "failed"; path: string | null; error: string | null; missing: string[]; bundleId?: string | null; attempt?: number };
}
export interface DevControlCaptureReceipt {
  captureId: string;
  clientId: string;
  status: "pending" | "saved" | "missing" | "failed";
  relativePath: string | null;
  error: string | null;
}
export interface DevControlCaptureRequest {
  kind: "evidence-capture";
  captureId: string;
  context: ContextToken;
  deadlineAt: string;
}
export interface DevControlRestartReceipt {
  status: "launch-requested";
  requestId: string;
  oldSessionId: string;
}
export interface DevControlRestartOptions {
  mode: DevControlState["mode"];
  hostClientId: "A" | "B";
  opponentSource: DevControlSource;
  visibleOpponents: number;
  playerCount: number;
}
export interface DevControlRestartRequest {
  protocolVersion: 1;
  sessionId: string;
  options: DevControlRestartOptions;
}
export interface DevControlAdapterReport {
  normalSnapshot: RoomStateSnapshot | null;
  eventSnapshot: EventRoomSnapshot | null;
  connection: string;
  transportEpoch: number;
  events: Array<{ stage: DevControlObservation["stage"]; detail: Record<string, unknown> }>;
  displayPhase?: string | null;
  armedInputId?: string;
  captures?: DevControlCaptureReceipt[];
}
export interface DevControlAdapterState {
  hostClientId: string;
  hostReady: boolean;
  sessionId: string;
  client: Pick<DevControlClientState, "manifest" | "context">;
  mode: DevControlState["mode"];
  apiBaseUrl: string;
  roomId: string | null;
  joinCode: string | null;
  lifecycle: DevControlState["lifecycle"];
}
export function devControlConfirmationToken(context: ContextToken, draft: DevControlClientState["draft"], action: string): string {
  return canonicalDevControlJson({ context, draft, action });
}
export function canonicalDevControlJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalDevControlJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalDevControlJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export interface DevControlSourceArm {
  kind: "source-arm";
  operationId: string;
  context: ContextToken;
  input: DevControlSourceInput;
}
export interface DevControlSourceInput {
  context: ContextToken;
  source: DevControlSource;
  timestamp: string;
  inputId: string;
  sourceFingerprint?: string;
}
