/** C1 common rendered fixture. No product/package/config writes; owns its Vite/browser only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const posix = value => value.replaceAll('\\', '/');

async function playwrightPath(explicit) {
  if (explicit) return path.resolve(explicit);
  try { return createRequire(import.meta.url).resolve('playwright'); } catch { /* existing cache fallback */ }
  const cache = path.join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx');
  if (existsSync(cache)) {
    for (const entry of (await readdir(cache)).sort()) {
      const candidate = path.join(cache, entry, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('Playwright missing; supply --playwright existing/path/index.mjs. No install attempted.');
}

export async function prepare(root) {
  root = path.resolve(root);
  const directory = path.join(root, '.tmp', 'comparison-visual');
  await mkdir(directory, { recursive: true });
  const source = await readFile(path.join(here, 'visual-fixture.tsx'));
  await writeFile(path.join(directory, 'visual-fixture.tsx'), source);
  const html = '<!doctype html>\n<html><head><link rel="icon" href="data:,"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>I198 C1 visual fixture</title></head><body><div id="root"></div><script type="module" src="/.tmp/comparison-visual/visual-fixture.tsx"></script></body></html>\n';
  await writeFile(path.join(directory, 'index.html'), html, 'utf8');
  return { root, directory, fixture_sha256: hash(source), html_sha256: hash(html), browser_path: 'regular Playwright; Browser plugin not available', controller_limit: 'open/close controls are a synthetic controller for isOpen; selection invokes the actual product onSelect callback' };
}

export async function run({ root, output, playwright, browserExecutable, reference = false }) {
  const prepared = await prepare(root);
  root = prepared.root;
  output = path.resolve(output);
  if (existsSync(path.join(output, 'visual.json'))) throw new Error('Evidence exists; use a new output directory');
  await mkdir(output, { recursive: true });
  const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
  const req = createRequire(path.join(root, 'package.json'));
  const tailwind = req('tailwindcss');
  const autoprefixer = req('autoprefixer');
  const pw = await playwrightPath(playwright);
  const { chromium } = await import(pathToFileURL(pw).href);
  const probe = createNetServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const server = await createServer({
    configFile: false, root, cacheDir: path.join(root, '.tmp', 'comparison-vite-cache'),
    esbuild: { jsx: 'automatic' },
    css: { postcss: { plugins: [tailwind({ content: [posix(path.join(root, 'apps/client/src/**/*.{ts,tsx}')), posix(path.join(prepared.directory, '*.tsx'))] }), autoprefixer()] } },
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root] } },
    optimizeDeps: { entries: ['.tmp/comparison-visual/index.html'] },
  });
  let browser;
  const result = { ...prepared, started_at: new Date().toISOString(), reference, playwright_path: pw, rows: [], errors: [], status: 'unproven' };
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.equal(typeof address, 'object');
    result.url = `http://127.0.0.1:${address.port}/.tmp/comparison-visual/index.html`;
    const executable = browserExecutable ?? (existsSync(chromium.executablePath()) ? chromium.executablePath() : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
    if (!existsSync(executable)) throw new Error('Browser executable missing; supply --browser-executable. No browser installation attempted.');
    result.browser_executable = executable;
    browser = await chromium.launch({ headless: true, executablePath: executable });
    result.browser_version = browser.version();
    for (const width of [320, 1024]) {
      for (const role of ['host', 'guest']) {
        for (const time of ['null', '0', '65']) {
          const page = await browser.newPage({ viewport: { width, height: 800 } });
          const row = { width, role, time, errors: [] };
          page.on('pageerror', error => row.errors.push(error.message));
          page.on('console', msg => { if (msg.type() === 'error') row.errors.push(msg.text()); });
          try {
            await page.goto(`${result.url}?time=${time}&role=${role}`, { waitUntil: 'networkidle' });
            assert.equal(await page.title(), 'I198 C1 visual fixture');
            await page.getByText('Time Left', { exact: true }).waitFor();
            row.modal = await page.getByText('Time Left', { exact: true }).locator('..').evaluate(el => {
              const value = el.querySelector('span:last-child');
              const rect = value.getBoundingClientRect();
              return { text: value.textContent.trim(), class_name: value.className, color: getComputedStyle(value).color, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
            });
            row.expected_text = time === 'null' ? '--:--' : time === '0' ? '00:00' : '01:05';
            row.countdown_matches_plan = row.modal.text === row.expected_text;
            row.expected_color_class = time === '0' ? 'text-red-500' : 'text-cyan-400';
            row.color_class_preserved = row.modal.class_name.split(/\s+/).includes(row.expected_color_class);
            row.baseline_gap = reference && !row.countdown_matches_plan ? { expected: row.expected_text, actual: row.modal.text, disposition: 'fixed before experiment as baseline/AC discrepancy; common Goal still requires plan expectation' } : null;
            row.modal_countdown_visible = row.modal.rect.x >= 0 && row.modal.rect.x + row.modal.rect.width <= width;
            row.overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
            row.screenshot = `${width}-${role}-${time}.png`;
            await page.screenshot({ path: path.join(output, row.screenshot), fullPage: false });
            row.screenshot_sha256 = hash(await readFile(path.join(output, row.screenshot)));
            await page.getByTestId('fixture-close').click();
            await page.getByText('Time Left', { exact: true }).waitFor({ state: 'hidden' });
            row.room_countdown = await page.getByText('Time Remaining', { exact: true }).locator('..').innerText();
            row.room_null_preserved = time !== 'null' || row.room_countdown.includes('--:--');
            row.room_screenshot = `${width}-${role}-${time}-room.png`;
            await page.screenshot({ path: path.join(output, row.room_screenshot), fullPage: false });
            row.room_screenshot_sha256 = hash(await readFile(path.join(output, row.room_screenshot)));
            await page.getByTestId('fixture-open').click();
            await page.getByText('Time Left', { exact: true }).waitFor();
            row.close_reopen = true;
            const search = page.getByPlaceholder('Search by Title or Artist...');
            await search.fill('Fixture');
            assert.equal(await search.inputValue(), 'Fixture');
            await page.getByRole('button', { name: /Fixture Track/ }).click();
            await page.getByText('Time Left', { exact: true }).waitFor({ state: 'hidden' });
            assert.equal(await page.getByTestId('fixture-selected').innerText(), 'fixture-song');
            row.search_and_select = true;
            await page.getByTestId('fixture-open').click();
            await search.focus();
            await page.keyboard.press('Tab');
            row.keyboard_tab_moves_focus = !(await search.evaluate(el => el === document.activeElement));
            row.no_error_overlay = await page.locator('vite-error-overlay').count() === 0;
            row.status = row.errors.length === 0 && row.no_error_overlay && row.modal_countdown_visible && row.room_null_preserved && row.color_class_preserved && row.search_and_select && row.close_reopen && row.keyboard_tab_moves_focus && (reference || row.countdown_matches_plan) ? 'pass' : 'fail';
          } catch (error) {
            row.status = 'fail'; row.errors.push(error.message);
          } finally {
            result.rows.push(row); await page.close();
          }
        }
      }
    }
    result.status = result.rows.every(row => row.status === 'pass') ? 'pass' : 'fail';
    result.note = reference ? 'Baseline reference records actual product values; countdown_matches_plan is still reported and may be false. A reference capture is not AC acceptance.' : 'Plan expectations are strict; baseline reference differences do not relax the AC.';
  } catch (error) {
    result.errors.push(error.message);
    result.status = 'unproven';
  } finally {
    if (browser) await browser.close();
    await server.close();
    result.ended_at = new Date().toISOString();
    await writeFile(path.join(output, 'visual.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const n = args.indexOf(flag); return n < 0 ? undefined : args[n + 1]; };
  const root = value('--root');
  if (!root) throw new Error('--root required');
  const result = args.includes('--prepare-only') ? await prepare(root) : await run({ root, output: value('--output') ?? path.join(root, '.tmp/visual-evidence'), playwright: value('--playwright'), browserExecutable: value('--browser-executable'), reference: args.includes('--baseline') || args.includes('--reference') });
  console.log(JSON.stringify(result, null, 2));
  if (result.status && result.status !== 'pass') process.exitCode = 1;
}
