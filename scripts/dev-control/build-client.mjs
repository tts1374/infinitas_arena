import { copyFileSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { canonicalWritePath } from './guards.mjs';

/** A listening dev server may still be compiling; only verified content is ready. */
export async function probeClientReadiness(url,kind,request=fetch,timeoutMs=5000) {
  const deadline=Date.now()+timeoutMs;
  let response,content;
  try {
    response=await request(url,{redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    if(response.status>=500)return false;
    if(!response.ok)throw new Error(`Owned ${kind} readiness HTTP failed`);
    content=kind==='worker'?await response.json():await response.text();
  } catch(error) {
    if(['TimeoutError','AbortError'].includes(error.name)||['ECONNREFUSED','ECONNRESET'].includes(error.cause?.code))return false;
    throw error;
  }
  if(Date.now()>=deadline)return false;
  if(kind==='worker') { if(content.host_event_protocol!==2)throw new Error('Worker capability mismatch'); }
  else if(!content.includes('WebSocket'))throw new Error('Frontend readiness content mismatch');
  return true;
}

export function validateClientBuild(manifest,spec,config){
  if(config.identifier!==`com.infinitas.arena.dev.${manifest.sessionId}.${spec.clientId.toLowerCase()}`||config.identifier!==spec.identifier)throw new Error('Build identifier mismatch');
  const windows=config.app?.windows;
  if(!Array.isArray(windows)||windows.length!==1||windows[0].label!==spec.windowLabel||windows[0].dataDirectory!==`dev-control-${manifest.sessionId}-${spec.clientId}`)throw new Error('Build profile/window mismatch');
  const query=new URL(windows[0].url,'http://127.0.0.1/').searchParams;
  if(query.get('instance')!==`${manifest.sessionId}-${spec.clientId}`||query.get('playerId')!==(spec.playerId??'')||(spec.role==='controller')!==(query.get('view')==='dev-control'))throw new Error('Build session/client routing mismatch');
  const assets=canonicalWritePath(manifest.runtimeRoot,join(manifest.runtimeRoot,'controller-assets'));
  if(typeof config.build?.frontendDist!=='string'||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(config.build.frontendDist)||resolve(manifest.repoRoot,'apps/client/src-tauri',config.build.frontendDist)!==assets||config.build?.devUrl!==null)throw new Error('Dedicated offline assets required');
  return true;
}
export function copyClientBinary(manifest,spec,source){
  const target=canonicalWritePath(manifest.runtimeRoot,join(spec.storageRoot,spec.role==='controller'?'controller.exe':'client.exe'));
  copyFileSync(source,target);
  if(!readFileSync(source).equals(readFileSync(target)))throw new Error('Client executable read-back mismatch');
  // Tauri's Windows build emits a loader DLL beside the executable.
  // Each isolated copy must remain runnable without the shared build directory.
  const loader=join(dirname(source),'WebView2Loader.dll');
  const copiedLoader=canonicalWritePath(manifest.runtimeRoot,join(spec.storageRoot,'WebView2Loader.dll'));
  copyFileSync(loader,copiedLoader);
  if(!readFileSync(loader).equals(readFileSync(copiedLoader)))throw new Error('WebView loader read-back mismatch');
  return target;
}
