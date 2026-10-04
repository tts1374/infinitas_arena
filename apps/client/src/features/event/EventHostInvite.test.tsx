import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EventHostInvite, shouldShowEventHostInvite } from "./EventHostInvite";

test("Host invite is available in LOBBY and PICKING but hidden from participants", () => {
  assert.equal(shouldShowEventHostInvite(true, "LOBBY"), true);
  assert.equal(shouldShowEventHostInvite(true, "PICKING"), true);
  assert.equal(shouldShowEventHostInvite(false, "LOBBY"), false);
  const markup = renderToStaticMarkup(<EventHostInvite eventName="大会 DP" roomId="room-1" joinCode="ABCDEFGH" />);
  assert.match(markup, /Room ID/);
  assert.match(markup, /room-1/);
  assert.match(markup, /参加コード/);
  assert.match(markup, /ABCDEFGH/);
  assert.match(markup, /招待情報をコピー/);
});
