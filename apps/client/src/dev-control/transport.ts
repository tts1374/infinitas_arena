import type { DevControlAdapterReport, DevControlAdapterState, DevControlCaptureReceipt, DevControlCaptureRequest, DevControlCommand, DevControlIdentity, DevControlRestartReceipt, DevControlRestartRequest, DevControlResult, DevControlSourceArm, DevControlState } from "./protocol";

async function invoke<T>(command: string, request?: unknown): Promise<T> {
  if (import.meta.env.MODE !== "dev-control" || typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    throw new Error("専用の開発起動でのみ利用できます。");
  }
  const api = await import("@tauri-apps/api/core");
  return api.invoke<T>(command, request === undefined ? undefined : { request });
}
export const getDevControlIdentity = (): Promise<DevControlIdentity> => invoke("dev_control_identity");
export const getDevControlAdapterState = (): Promise<DevControlAdapterState> => invoke("dev_control_adapter_state");
export const getDevControlState = (): Promise<DevControlState> => invoke("dev_control_state");
export const sendDevControlCommand = (command: DevControlCommand): Promise<DevControlResult> => invoke("dev_control_command", command);
export const pollDevControlCommands = (): Promise<Array<DevControlCommand | DevControlSourceArm | DevControlCaptureRequest>> => invoke("dev_control_poll");
export const captureDevControlEvidence = (request: DevControlCaptureRequest): Promise<DevControlCaptureReceipt> => invoke("dev_control_capture", request);
export const commitDevControlCapture = (captureId: string, accept: boolean): Promise<DevControlCaptureReceipt> => invoke("dev_control_commit_capture", { captureId, accept });
export const reportDevControlObservation = (report: DevControlAdapterReport): Promise<void> => invoke("dev_control_report", report);
export const finishDevControlCommand = (result: DevControlResult): Promise<void> => invoke("dev_control_finish", result);
export const focusDevControlWindow = (command: DevControlCommand): Promise<NonNullable<DevControlResult["nativeFocus"]>> => invoke("dev_control_focus", command);
export const saveDevControlEvidence = (): Promise<DevControlState["save"]> => invoke("dev_control_export");
export const restartDevControlSession = (request: DevControlRestartRequest): Promise<DevControlRestartReceipt> => invoke("dev_control_restart", request);
