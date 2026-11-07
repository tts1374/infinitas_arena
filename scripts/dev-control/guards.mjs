import { realpathSync, existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export const SOURCES = ['inf-notebook', 'reflux', 'daken_counter_v3'];
export function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
export function canonicalWritePath(root, candidate, forbiddenRoots = []) {
  if (typeof candidate !== 'string' || /^[/\\]{2}/.test(candidate) || !isAbsolute(candidate)) throw new Error('Absolute local path required');
  const base = realpathSync(root);
  const path = resolve(candidate);
  if (!inside(base, path)) throw new Error('Path outside allowed root');
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actualAncestor = realpathSync(ancestor);
  if (!inside(base, actualAncestor)) throw new Error('Link escaped allowed root');
  // A link inside the allowed root is also rejected, avoiding mutable aliases.
  let cursor = path;
  while (inside(base, cursor) && cursor !== base) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Links are not write targets');
    cursor = dirname(cursor);
  }
  const actual = existsSync(path) ? realpathSync(path) : resolve(actualAncestor, relative(ancestor, path));
  for (const forbidden of forbiddenRoots) {
    const protectedPath = existsSync(forbidden) ? realpathSync(forbidden) : resolve(forbidden);
    if (inside(protectedPath, actual) || inside(actual, protectedPath)) throw new Error('Protected source overlap');
  }
  return path;
}
export function ensureOwnedDirectory(root, path, forbiddenRoots = []) {
  const checked = canonicalWritePath(root, path, forbiddenRoots);
  mkdirSync(checked, { recursive: true });
  return canonicalWritePath(root, checked, forbiddenRoots);
}
export function secretMatches(expected, supplied) {
  if (typeof expected !== 'string' || typeof supplied !== 'string' || expected.length < 32) return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function readManifest(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.protocolVersion !== 1 || !/^s\d{14}-[0-9a-f]{8}$/.test(manifest.sessionId) || manifest.broker?.host !== '127.0.0.1') throw new Error('Invalid manifest');
  if (!Number.isInteger(manifest.broker.port) || manifest.broker.port < 1024 || manifest.broker.port > 65535) throw new Error('Invalid broker port');
  const root = realpathSync(manifest.runtimeRoot);
  if (realpathSync(dirname(path)) !== root || !Array.isArray(manifest.clients)) throw new Error('Manifest outside session');
  if(basename(root)!==manifest.sessionId||root!==joinRuntime(realpathSync(manifest.repoRoot),manifest.sessionId)||!manifest.sourceHead?.match(/^[a-f0-9]{40}$/))throw new Error('Dedicated runtime namespace required');
  const ids = new Set(), players = new Set();
  for (const client of manifest.clients) {
    if (ids.has(client.clientId) || !['controller', 'self', 'participant'].includes(client.role)) throw new Error('Invalid client identity');
    ids.add(client.clientId);
    if(client.identifier!==`com.infinitas.arena.dev.${manifest.sessionId}.${client.clientId.toLowerCase()}`)throw new Error('Dedicated client identifier required');
    if(client.role==='controller'&&(client.clientId!=='controller'||client.windowLabel!=='dev-control'||client.transport!==null||client.playerId!==null||client.fixtureRoot!==null||client.source!==null))throw new Error('Invalid controller role/window');
    if(client.role==='self'&&(client.clientId!=='A'||client.windowLabel!=='main'||client.transport!=='real-client'))throw new Error('Invalid self role/window');
    if(client.role==='participant'&&(!/^[B-T]$/.test(client.clientId)||client.windowLabel!=='main'||!['real-client','headless'].includes(client.transport)))throw new Error('Invalid participant role/window');
    if (client.playerId) { if (players.has(client.playerId)) throw new Error('Duplicate player transport'); players.add(client.playerId); }
    if (client.source !== null && !SOURCES.includes(client.source)) throw new Error('Unsupported source');
    if (client.role === 'self' && client.fixtureRoot !== null) throw new Error('Self cannot own a fixture');
    if (!inside(root, realpathSync(client.storageRoot)) || !inside(root, realpathSync(client.spoolRoot))) throw new Error('Storage outside session');
    if (client.fixtureRoot !== null) canonicalWritePath(root, client.fixtureRoot);
    if (client.role === 'participant' && client.sourcePort !== null && client.sourcePort === manifest.launch.selfPort) throw new Error('Mock overlaps self port');
  }
  if (manifest.clients.filter(c => c.role === 'controller').length !== 1 || manifest.clients.filter(c => c.role === 'self').length !== 1) throw new Error('Controller/self must be unique');
  return manifest;
}
function joinRuntime(repoRoot,sessionId){return resolve(repoRoot,'testdata/runtime/dev-control',sessionId);}
