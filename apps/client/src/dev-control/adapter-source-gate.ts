import { canonicalDevControlJson, type ContextToken, type DevControlSourceInput } from "./protocol";

let currentContext: (() => ContextToken | null) | null = null;
let armed: DevControlSourceInput | null = null;
export function setDevControlSourceContext(reader: (() => ContextToken | null) | null): void {
  currentContext = reader;
  if (reader === null) armed = null;
}
export function armDevControlSource(input: DevControlSourceInput): void {
  armed = structuredClone(input);
}
export function invalidateDevControlSource(): void { armed = null; }
export function isDevControlObservationCurrent(input: { source: string; timestamp: string; sourceFingerprint?: string }): boolean {
  // No effect on ordinary application launches. This gate supplements product guards.
  if (currentContext === null) return true;
  const context = currentContext();
  if (!armed || !context || armed.source !== input.source || canonicalDevControlJson(armed.context) !== canonicalDevControlJson(context)) return false;
  return input.source === "daken_counter_v3"
    ? typeof armed.sourceFingerprint === "string" && armed.sourceFingerprint === input.sourceFingerprint
    : armed.timestamp === input.timestamp;
}
