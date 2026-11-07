import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareWorkerRuntime } from './build-worker.mjs';

test('session Worker runs only its frozen bundle and configuration after source edits', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'dev-worker-'));
  const runtimeRoot = join(repoRoot, 'runtime'); mkdirSync(runtimeRoot);
  mkdirSync(join(repoRoot, 'apps/worker/src'), { recursive: true });
  const source = join(repoRoot, 'apps/worker/src/index.ts');
  const config = join(repoRoot, 'apps/worker/wrangler.toml');
  writeFileSync(source, 'export default { version: 1 };'); writeFileSync(config, 'main = "src/index.ts"\n');
  const built = prepareWorkerRuntime({ runtimeRoot, repoRoot }, (executable, args, options) => {
    assert.equal(executable, process.execPath); assert.deepEqual(args.slice(1, 4), ['deploy', '--dry-run', '--outdir']);
    assert.equal(options.cwd, join(repoRoot, 'apps/worker')); assert.equal(options.windowsHide, true);
    writeFileSync(join(args[4], 'index.js'), readFileSync(source)); return { status: 0 };
  });
  assert.deepEqual(built.args.slice(-2), ['--no-bundle', '--local']);
  assert.equal(built.args[2], join(runtimeRoot, 'worker-bundle/index.js'));
  assert.equal(built.args[4], join(runtimeRoot, 'worker.toml'));
  writeFileSync(source, 'export default { version: 2 };'); writeFileSync(config, 'main = "changed.ts"\n');
  assert.equal(readFileSync(built.args[2], 'utf8'), 'export default { version: 1 };');
  assert.equal(readFileSync(built.args[4], 'utf8'), 'main = "src/index.ts"\n');
  assert.match(built.bundleSha256, /^[a-f0-9]{64}$/); assert.match(built.configSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => prepareWorkerRuntime({ runtimeRoot, repoRoot }), /already exists/);
  const failedRoot = join(repoRoot, 'failed-runtime'); mkdirSync(failedRoot);
  assert.throws(() => prepareWorkerRuntime({ runtimeRoot: failedRoot, repoRoot }, () => ({ status: 1 })), /build failed/);
});
