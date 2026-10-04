import type { SkipReason, SourceType } from "../enums";
import type { JsonObject } from "../models/common";
import type { ExpectedKey } from "../models/expected-key";
import type { QuickChatPhraseId } from "../constants/quick-chat";
import type { WsEmptyPayload } from "./common";
import type { ClientEnvelope } from "./envelope";
import type { ClientMessageType } from "./message-types";
import type { EventJoinPayload, EventRoomAction } from "./host-event";

export interface RequestIdPayload {
  request_id: string;
}

export interface GenerationPayload {
  generation: number;
}

export interface RequestIdWithGenerationPayload extends RequestIdPayload, GenerationPayload {}

export type RoomJoinSessionKind = "PLAYER" | "SPECTATOR";

interface BaseRoomJoinPayload {
  join_code?: string;
  client_version?: string;
  client_capabilities?: JsonObject;
}

export interface PlayerRoomJoinPayload extends BaseRoomJoinPayload {
  session_kind?: "PLAYER";
  display_name: string;
  source: SourceType;
}

export interface SpectatorRoomJoinPayload extends BaseRoomJoinPayload {
  session_kind: "SPECTATOR";
}

export type RoomJoinPayload = PlayerRoomJoinPayload | SpectatorRoomJoinPayload;

export interface ReadySetPayload extends GenerationPayload {
  ready: boolean;
}

export interface PickSubmitPayload extends RequestIdPayload {
  pick_chart_key: string;
}

export interface ResultSubmitPayload extends RequestIdWithGenerationPayload {
  round_index: number;
  observed_key: ExpectedKey;
  metric_value: number;
  source_meta?: JsonObject;
}

export interface SkipPayload extends RequestIdPayload {
  round_index: number;
  reason: SkipReason;
}

export interface SkipHostAssignPayload extends SkipPayload {
  target_player_id: string;
}

export interface SourceStatusSetPayload extends RequestIdPayload {
  available: boolean;
}

export interface QuickChatPostPayload extends RequestIdPayload {
  phrase_ids: QuickChatPhraseId[];
}

export interface ClientMessagePayloadMap {
  ROOM_JOIN: RoomJoinPayload;
  ROOM_LEAVE: GenerationPayload;
  READY_SET: ReadySetPayload;
  START_MATCH: RequestIdWithGenerationPayload;
  RETURN_TO_LOBBY: RequestIdWithGenerationPayload;
  AUTO_REMATCH_STOP: RequestIdPayload;
  AUTO_REMATCH_OPT_OUT: RequestIdPayload;
  SOURCE_STATUS_SET: SourceStatusSetPayload;
  QUICK_CHAT_POST: QuickChatPostPayload;
  PICK_SUBMIT: PickSubmitPayload;
  RESULT_SUBMIT: ResultSubmitPayload;
  SKIP_SELF: SkipPayload;
  SKIP_HOST_ASSIGN: SkipHostAssignPayload;
  FORCE_ADVANCE: RequestIdPayload;
  STATE_GET: WsEmptyPayload;
  PING: WsEmptyPayload;
  EVENT_JOIN: EventJoinPayload;
  EVENT_ACTION: EventRoomAction;
}

export type ClientMessage<
  TType extends ClientMessageType = ClientMessageType,
> = ClientEnvelope<TType, ClientMessagePayloadMap[TType]>;
