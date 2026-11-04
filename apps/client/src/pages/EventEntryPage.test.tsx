import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EventEntryPage } from "./EventEntryPage";
import { EventCreatePage, INITIAL_EVENT_DRAFT } from "./EventCreatePage";
import { EventJoinPage } from "./EventJoinPage";

const entry = { available: true, creationAvailable: true, hasEvent: false, normalActive: false, onJoin: () => undefined, onCreate: () => undefined, onReturn: () => undefined, onHistory: () => undefined } satisfies Parameters<typeof EventEntryPage>[0];
test("dedicated entry separates create and join, and an existing event exposes the return path", () => {
  const markup = renderToStaticMarkup(<EventEntryPage {...entry} />);
  assert.match(markup, /開催へ参加/);
  assert.match(markup, /待機室を作成/);
  assert.match(markup, /開催IDと参加コード/);
  const inRoom = renderToStaticMarkup(<EventEntryPage {...entry} hasEvent />);
  assert.match(inRoom, /現在の開催へ戻る/);
  assert.doesNotMatch(inRoom, /待機室を作成/);
});
test("dedicated Host requires identity; playing Host additionally requires a source", () => {
  const props = { draft: INITIAL_EVENT_DRAFT, onChange: () => undefined, busy: false, error: null, identityReady: true, sourceReady: false, onSubmit: () => undefined, onBack: () => undefined } satisfies Parameters<typeof EventCreatePage>[0];
  const dedicated = renderToStaticMarkup(<EventCreatePage {...props} />);
  assert.doesNotMatch(dedicated, /disabled=""/);
  const playing = renderToStaticMarkup(<EventCreatePage {...props} draft={{ ...INITIAL_EVENT_DRAFT, host_plays: true }} />);
  assert.match(playing, /設定画面で結果の取得元を設定/);
  assert.match(playing, /disabled=""/);
});

test("event creation explains participation, automatic codes, and tournament roster in plain language", () => {
  const props = { draft: { ...INITIAL_EVENT_DRAFT, event_type: "TOURNAMENT" as const }, onChange: () => undefined, busy: false, error: null, identityReady: true, sourceReady: true, onSubmit: () => undefined, onBack: () => undefined } satisfies Parameters<typeof EventCreatePage>[0];
  const markup = renderToStaticMarkup(<EventCreatePage {...props} />);
  assert.match(markup, /進行だけ担当する（プレーしない）/);
  assert.match(markup, /参加コード（空欄なら自動生成）/);
  assert.match(markup, /開始時の参加人数で順位の配点/);
  assert.match(markup, /開始後は新しい参加者を追加できません/);
  assert.doesNotMatch(markup, /固定N|PRIVATE|専任Host/);
});
test("join displays caller-owned draft and rejects incomplete ID/code", () => {
  const props = { draft: { roomId: "room", joinCode: "ABCDEFGH" }, onChange: () => undefined, identityReady: true, available: true, error: null, onJoin: () => undefined, onBack: () => undefined } satisfies Parameters<typeof EventJoinPage>[0];
  const valid = renderToStaticMarkup(<EventJoinPage {...props} />);
  assert.match(valid, /開催ID/);
  assert.match(valid, /value="room"/);
  assert.match(valid, /value="ABCDEFGH"/);
  assert.doesNotMatch(valid, /disabled=""/);
  assert.match(renderToStaticMarkup(<EventJoinPage {...props} draft={{ roomId: "room", joinCode: "ABC" }} />), /disabled=""/);
});
