import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(process.argv[2] ?? path.join(repoRoot, "testdata/runtime/e2e/host-event-visual-final"));
const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const appUrl = process.env.INF_ARENA_VISUAL_URL ?? "http://127.0.0.1:1420/";

const cases = [
  { id: "event-zero-host", role: "HOST", phase: "LOBBY", participants: 0, required: ["準備完了 0/0人", "参加者はいません"] },
  { id: "event-twenty-source", role: "PLAYER", phase: "PLAYING", participants: 20, required: ["準備完了 20/20人", "PLAYER 20", "結果取得元を利用できません"] },
  { id: "event-disconnected-round-result", role: "HOST", phase: "PLAYING", participants: 3, required: ["Host再接続待ち", "1位", "欠場", "次の曲を選ぶ"] },
  { id: "event-tie-absence-final", role: "HOST", phase: "RESULT", participants: 3, required: ["最終結果", "1位", "欠場", "終了理由：HOST_ENDED"] },
  { id: "event-casual-final-mobile", role: "HOST", phase: "RESULT", participants: 1, required: ["最終結果", "第1曲", "第2曲", "SCORE 2456"] },
];
const viewports = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

await mkdir(outputRoot, { recursive: true });

const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${path.join(outputRoot, "chrome-profile")}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const browserEndpoint = await new Promise((resolve, reject) => {
  let stderr = "";
  const timeout = setTimeout(() => reject(new Error(`Chrome DevTools startup timeout: ${stderr}`)), 15_000);
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk;
    const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[1]);
    }
  });
  chrome.once("exit", (code) => reject(new Error(`Chrome exited before DevTools startup (${code}): ${stderr}`)));
});
const browserPort = new URL(browserEndpoint).port;

async function createPage(url) {
  const response = await fetch(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to create Chrome target: ${response.status}`);
  return response.json();
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() { socket.close(); },
  };
}

const manifest = [];
try {
  for (const scenario of cases) {
    for (const viewport of viewports) {
      const url = new URL(appUrl);
      url.searchParams.set("scenario", scenario.id);
      const page = await createPage(url.href);
      const cdp = connectCdp(page.webSocketDebuggerUrl);
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.name === "mobile" });
      await cdp.send("Page.navigate", { url: url.href });
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      const evaluation = await cdp.send("Runtime.evaluate", {
        expression: `(() => { const root = document.getElementById("visual-capture-root"); return { scenario: document.body.dataset.visualScenario, role: document.body.dataset.visualRole, phase: document.body.dataset.visualPhase, participants: Number(document.body.dataset.visualParticipantCount), ready: document.body.dataset.visualReady, viewportWidth: document.documentElement.clientWidth, clientWidth: root?.clientWidth ?? null, scrollWidth: root?.scrollWidth ?? null, text: root?.innerText ?? "" }; })()`,
        returnByValue: true,
      });
      const state = evaluation.result.value;
      assert.equal(state.scenario, scenario.id);
      assert.equal(state.role, scenario.role);
      assert.equal(state.phase, scenario.phase);
      assert.equal(state.participants, scenario.participants);
      assert.equal(state.ready, "true");
      assert.equal(state.viewportWidth, viewport.width);
      assert.ok(state.clientWidth > 0);
      assert.ok(state.scrollWidth <= state.clientWidth, `${scenario.id}/${viewport.name} overflow: ${state.scrollWidth} > ${state.clientWidth}`);
      for (const expected of scenario.required) assert.ok(state.text.includes(expected), `${scenario.id}/${viewport.name} missing: ${expected}`);
      if (scenario.id === "event-disconnected-round-result") {
        const countdown = state.text.match(/Host再接続待ち・残り (\d+)秒/);
        assert.ok(countdown && Number(countdown[1]) <= 300, "Host disconnect countdown exceeded 300 seconds");
      }
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const file = path.join(outputRoot, `${scenario.id}-${viewport.name}.png`);
      await writeFile(file, Buffer.from(screenshot.data, "base64"));
      manifest.push({ scenario: scenario.id, viewport, roleAndStateAsserted: true, clientWidth: state.clientWidth, scrollWidth: state.scrollWidth, horizontalOverflow: false, file });
      cdp.close();
      await fetch(`http://127.0.0.1:${browserPort}/json/close/${page.id}`);
    }
  }
  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "PASS", outputRoot, captures: manifest.length }, null, 2));
} finally {
  chrome.kill();
}
