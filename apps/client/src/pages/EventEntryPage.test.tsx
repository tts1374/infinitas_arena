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
  assert.match(playing, /DATA SOURCE設定が必要/);
  assert.match(playing, /disabled=""/);
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
