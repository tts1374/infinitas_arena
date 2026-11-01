import { HOST_EVENT_NAME_MAX_LENGTH, type EventRoomSettings } from "@infinitas/shared";

export function validateEventName(value: string): string | null {
  if (value.length > HOST_EVENT_NAME_MAX_LENGTH) return `開催名は${HOST_EVENT_NAME_MAX_LENGTH}文字以内で入力してください。`;
  if (/\r|\n/.test(value)) return "開催名に改行は使用できません。";
  return null;
}

export function displayEventName(settings: Pick<EventRoomSettings, "event_name" | "event_type" | "play_style">): string {
  if (settings.event_name.trim().length > 0) return settings.event_name;
  return `${settings.event_type === "TOURNAMENT" ? "大会" : "合同プレー"} ${settings.play_style}`;
}
