import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalWritePath, readManifest } from './guards.mjs';
import { inventory } from './processes.mjs';
import { verifyStopped } from './offline.mjs';
import { listeners } from './processes.mjs';
import { writeSessionFile } from './evidence.mjs';

export async function reopenController(manifestPath){
  const manifest=readManifest(manifestPath),spec=manifest.clients.find(c=>c.role==='controller');
  const controllerBinary=canonicalWritePath(manifest.runtimeRoot,join(spec.storageRoot,'controller.exe'));
  const all=inventory(),owner=manifest.ownedProcesses.find(p=>p.kind==='controller'&&p.executablePath.toLowerCase()===controllerBinary.toLowerCase()&&all.some(actual=>actual.pid===p.pid&&actual.createdAt===p.createdAt&&actual.executablePath===p.executablePath));
  if(owner){
    const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(manifest.repoRoot,'scripts/dev-control/window.ps1'),'-Action','Focus','-ExpectedPid',String(owner.pid),'-CreatedAt',owner.createdAt,'-ExecutablePath',owner.executablePath,'-WindowTitle',`DEV controller / ${manifest.sessionId}`],{windowsHide:true,encoding:'utf8'});
    if(result.status!==0)throw new Error('Existing controller focus was not confirmed');
    return;
  }
  const state=JSON.parse(readFileSync(join(manifest.runtimeRoot,'controller-spool/state.json'),'utf8'));
  if(verifyStopped(manifest,state,all,listeners()).lifecycle!=='stopped')throw new Error('Cannot reopen records while runtime shutdown is unverified');
  const binary=canonicalWritePath(manifest.runtimeRoot,join(spec.storageRoot,'controller.exe'));
  const child=spawn(binary,[],{cwd:spec.storageRoot,windowsHide:true,detached:true,stdio:'ignore',env:{...process.env,INF_ARENA_DEV_CONTROL_MANIFEST:manifestPath,INF_ARENA_DEV_CONTROL_ROOT:manifest.runtimeRoot,INF_ARENA_DEV_CONTROL_SESSION:manifest.sessionId,INF_ARENA_DEV_CONTROL_CLIENT:spec.clientId,INF_ARENA_DEV_CONTROL_TOKEN:randomBytes(32).toString('hex'),INF_ARENA_DEV_CONTROL_READ_ONLY:'1',INF_ARENA_DISABLE_DEEP_LINK_REGISTER:'1'}});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  const identity=inventory().find(p=>p.pid===child.pid);
  if(!identity?.createdAt||!identity.executablePath||identity.executablePath.toLowerCase()!==binary.toLowerCase()){child.kill();throw new Error('Reopened controller identity not established');}
  manifest.ownedProcesses.push({...identity,kind:'controller',clientId:spec.clientId,ports:[]});
  // The private launch manifest contains launch references only, never collected original settings.
  const destination=canonicalWritePath(manifest.runtimeRoot,manifestPath),data=JSON.stringify(manifest)+'\n';
  writeSessionFile(manifest.runtimeRoot,destination,data);
  child.unref();
}
