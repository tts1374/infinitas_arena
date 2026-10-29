import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalWritePath, ensureOwnedDirectory } from './guards.mjs';
import { writeSessionFile } from './evidence.mjs';

/** Freeze source and configuration before any product connection is opened. */
export function prepareWorkerRuntime(manifest, run = spawnSync) {
  const { runtimeRoot, repoRoot } = manifest;
  const directory = canonicalWritePath(runtimeRoot, join(runtimeRoot, 'worker-bundle'));
  const config = canonicalWritePath(runtimeRoot, join(runtimeRoot, 'worker.toml'));
  if (existsSync(directory) || existsSync(config)) throw new Error('Session Worker build already exists');
  ensureOwnedDirectory(runtimeRoot, directory);
  writeSessionFile(runtimeRoot, config, readFileSync(join(repoRoot, 'apps/worker/wrangler.toml'), 'utf8'));
  const cli = join(repoRoot, 'node_modules/wrangler/bin/wrangler.js');
  const built = run(process.execPath, [cli, 'deploy', '--dry-run', '--outdir', directory], { cwd: join(repoRoot, 'apps/worker'), encoding: 'utf8', windowsHide: true });
  if (built.status !== 0) throw new Error('Session Worker bundle build failed');
  const entry = canonicalWritePath(runtimeRoot, join(directory, 'index.js'));
  if (!statSync(entry).isFile() || statSync(entry).size === 0) throw new Error('Session Worker bundle is missing');
  const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  return { args: [cli, 'dev', entry, '--config', config, '--no-bundle', '--local'], bundleSha256: hash(entry), configSha256: hash(config) };
}
