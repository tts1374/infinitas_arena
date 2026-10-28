import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const helper = fileURLToPath(new URL('./processes.ps1', import.meta.url));
function run(action, input) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action], { input, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Process inventory failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
export function inventory() { return run('List'); }
export function listeners() { return run('Listeners'); }
export function descendants(all, rootPid) {
  const found = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of all) if (found.has(process.parentPid) && !found.has(process.pid)) { found.add(process.pid); changed = true; }
  }
  return all.filter(process => found.has(process.pid));
}
export function identifiedDescendants(all,rootPid,recheck=inventory) {
  let refreshed;
  return descendants(all,rootPid).flatMap(candidate=>{
    if(candidate.executablePath&&candidate.createdAt)return [candidate];
    // CIM can observe a process while it is exiting, after its path disappears.
    // Only absence in a second inventory proves that this entry may be skipped.
    refreshed??=recheck();
    const current=refreshed.find(process=>process.pid===candidate.pid);
    if(!current)return [];
    if(!current.executablePath||!current.createdAt||current.createdAt!==candidate.createdAt)throw new Error('Cannot establish live process ownership');
    return [current];
  });
}
export function stopOwned(processes) {
  // Descendants are passed before their launch parent, with held-handle identity checks.
  return run('Stop', JSON.stringify([...processes].reverse()));
}

/** Read-back after held-handle stop: a proven reused PID is not our process. */
export function shutdownProcessState(owners,results,live) {
  const present=owner=>live.some(actual=>actual.pid===owner.pid&&(!actual.createdAt||!actual.executablePath||
    actual.createdAt===owner.createdAt&&actual.executablePath===owner.executablePath));
  const remaining=owners.filter(present);
  const incomplete=results.filter(result=>!['stopped','already-exited'].includes(result.status)&&
    !(result.status==='identity-mismatch'&&owners.some(owner=>owner.pid===result.pid&&!present(owner))));
  return {remaining,incomplete};
}
