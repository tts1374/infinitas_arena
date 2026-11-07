import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppSidebar } from "../components/AppSidebar";
import { activateParticipationMode, clearParticipationMode, getActiveParticipationMode, resolveParticipationView } from "./participation-mode";

test("normal and host-event participation are mutually exclusive", () => {
  clearParticipationMode("NORMAL");
  clearParticipationMode("HOST_EVENT");
  assert.equal(activateParticipationMode("NORMAL"), true);
  assert.equal(activateParticipationMode("HOST_EVENT"), false);
  assert.equal(getActiveParticipationMode(), "NORMAL");
  clearParticipationMode("NORMAL");
  assert.equal(activateParticipationMode("HOST_EVENT"), true);
  clearParticipationMode("HOST_EVENT");
  assert.equal(getActiveParticipationMode(), null);
});

test("active participation keeps normal and event navigation separate, including settings return paths", () => {
  assert.equal(resolveParticipationView("lobby", "HOST_EVENT"), "event-room");
  assert.equal(resolveParticipationView("automatch", "HOST_EVENT"), "event-room");
  assert.equal(resolveParticipationView("event-create", "NORMAL"), "room");
  assert.equal(resolveParticipationView("event-join", "NORMAL"), "room");
  assert.equal(resolveParticipationView("settings", "HOST_EVENT"), "settings");
  assert.equal(resolveParticipationView("event-entry", null), "event-entry");
  assert.equal(resolveParticipationView("lobby", null), "lobby");
  const props = { activeView: "settings", hasRoom: false, hasEventRoom: false, isOpeningMatchHistory: false, onNavigate: () => undefined, onOpenMatchHistory: () => undefined } satisfies Parameters<typeof AppSidebar>[0];
  const event = renderToStaticMarkup(createElement(AppSidebar, { ...props, hasEventRoom: true }));
  assert.doesNotMatch(event, /aria-label="通常対戦"/);
  assert.doesNotMatch(event, /aria-label="合同・大会"/);
  assert.match(event, /aria-label="開催へ戻る"/);
  const inEvent = renderToStaticMarkup(createElement(AppSidebar, { ...props, activeView: "event-room", hasEventRoom: true }));
  assert.match(inEvent, /aria-label="開催へ戻る" aria-current="page"/);
  const normal = renderToStaticMarkup(createElement(AppSidebar, { ...props, hasRoom: true }));
  assert.doesNotMatch(normal, /aria-label="合同・大会"/);
  assert.match(normal, /aria-label="対戦へ戻る"/);
  const idle = renderToStaticMarkup(createElement(AppSidebar, props));
  assert.match(idle, /aria-label="通常対戦"/);
  assert.match(idle, /aria-label="合同・大会"/);
});
