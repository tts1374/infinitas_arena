export interface CapturePrivacyInput {
  hasEditableFields: boolean;
  visibleText: string;
  joinCode: string | null;
  sourcePaths: string[];
  hostInviteVisible: boolean;
}
export function capturePrivacyReason(input: CapturePrivacyInput): string | null {
  if (input.hasEditableFields) return "設定・入力フォームの実画像は機密保全のため収集しません。";
  if (input.hostInviteVisible || input.joinCode && input.visibleText.includes(input.joinCode)) return "参加コード表示中の実画像は収集しません。";
  if (input.sourcePaths.some(path => path.length > 0 && input.visibleText.includes(path))) return "本人source参照先が表示されているため実画像を収集しません。";
  return null;
}

/** A transient unsafe screen also invalidates a capture; returning to safety cannot revive it. */
export async function guardCapturePrivacy<T>(options: {
  privacy: () => string | null;
  watch: (check: () => void) => () => void;
  capture: () => Promise<T>;
  commit: (captured: T, accept: boolean) => Promise<T>;
}): Promise<T> {
  let unsafe = options.privacy() !== null;
  const check = () => { unsafe ||= options.privacy() !== null; };
  const stop = options.watch(check);
  try {
    check();
    if (unsafe) throw new Error("機密情報が表示されているため画像を取得しません。");
    const captured = await options.capture();
    check();
    return await options.commit(captured, !unsafe);
  } finally { stop(); }
}
