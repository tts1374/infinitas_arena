import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { SOURCES, ensureOwnedDirectory, canonicalWritePath, readManifest } from './guards.mjs';
import { applyRestartOptions, readRestartOptions } from './restart.mjs';
import { inventory, descendants, identifiedDescendants, stopOwned, listeners, shutdownProcessState } from './processes.mjs';
import { createEvidenceWriter, evidenceManifest, writeSessionFile } from './evidence.mjs';
import { validateClientBuild, copyClientBinary, probeClientReadiness } from './build-client.mjs';
import { prepareWorkerRuntime } from './build-worker.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = Object.fromEntries(Array.from({ length: Math.floor((process.argv.length - 2) / 2) }, (_, i) => [process.argv[i * 2 + 2], process.argv[i * 2 + 3]]));
if(cli['--reopen']){
  const {reopenController}=await import('./reopen.mjs');
  await reopenController(resolve(cli['--reopen']));process.exit(0);
}
let launch;
if (cli['--restart']) {
  const priorPath=resolve(cli['--restart']),prior=readManifest(priorPath);
  launch=prior.launch;
  if(cli['--restart-options'])launch=applyRestartOptions(launch,readRestartOptions(priorPath,resolve(cli['--restart-options']),prior.sessionId));
}
else launch = {
  mode: cli['--mode'] ?? 'ARENA', hostClient: cli['--host'] ?? 'B', selfSource: cli['--self-source'] ?? 'daken_counter_v3',
  selfDirectory: cli['--self-directory'] ?? '', selfPort: Number(cli['--self-port'] ?? 8767),
  opponentSource: cli['--opponent-source'] ?? 'inf-notebook', visibleOpponents: Number(cli['--visible'] ?? 1), playerCount: Number(cli['--players'] ?? 4),
};
if (!['ARENA','BPL','BPL4','CASUAL','TOURNAMENT'].includes(launch.mode) || !['A','B'].includes(launch.hostClient)) throw new Error('Invalid mode/host');
if (!SOURCES.includes(launch.selfSource) || !SOURCES.includes(launch.opponentSource)) throw new Error('Unsupported/legacy source');
if (launch.selfSource !== 'daken_counter_v3' && !launch.selfDirectory) throw new Error('Explicit real source directory required');
if (!Number.isInteger(launch.selfPort) || launch.selfPort < 1 || launch.selfPort > 65535) throw new Error('Invalid self port');
launch.playerCount = ['BPL','BPL4'].includes(launch.mode) ? 2 : launch.mode === 'ARENA' ? 4 : launch.playerCount;
if (!Number.isInteger(launch.playerCount) || launch.playerCount < 2 || launch.playerCount > 20 || launch.visibleOpponents < 1 || launch.visibleOpponents >= launch.playerCount) throw new Error('Invalid participant count');
const sessionId = `s${new Date().toISOString().replace(/[^0-9]/g, '').slice(0,14)}-${randomUUID().slice(0,8)}`;
const root = join(repo, 'testdata/runtime/dev-control', sessionId);
const protectedRoots=launch.selfDirectory?[resolve(launch.selfDirectory)]:[];
// Validate existing ancestors, reparse points and real-source overlap BEFORE mkdir.
canonicalWritePath(repo,root,protectedRoots);
mkdirSync(root, { recursive: true });
const canonicalRoot=realpathSync(root);
function safeFile(path){
  if(realpathSync(root)!==canonicalRoot)throw new Error('Session root identity changed');
  canonicalWritePath(repo,root,protectedRoots);
  return canonicalWritePath(root,path,protectedRoots);
}
const evidence=createEvidenceWriter(root);
const write = (path, value) => evidence.write(safeFile(path),value);
// Authority/config files contain only explicit launch references, never copied settings/history.
// They are not evidence and are never exported; applying evidence projection here would break source ownership.
const writeAuthority = (path,value) => {
  const target=safeFile(path),data=JSON.stringify(value)+'\n';
  if(existsSync(target)&&readFileSync(target,'utf8')===data)return;
  writeSessionFile(root,target,data);
};
const ports = new Set([launch.selfPort]);
async function freePort() {
  for (;;) {
    const server = net.createServer();
    await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
    const port = server.address().port;
    await new Promise(res => server.close(res));
    if (!ports.has(port)) { ports.add(port); return port; }
  }
}
const workerPort = await freePort(), frontendPort = await freePort(), brokerPort = await freePort(), inspectorPort = await freePort();
const apiBaseUrl = `http://127.0.0.1:${workerPort}`;
const keys = {};
function client(id, role, transport, source, sourcePort) {
  const storageRoot = ensureOwnedDirectory(root, join(root, 'clients', id));
  const spoolRoot = ensureOwnedDirectory(root, join(storageRoot, 'spool'));
  const fixtureRoot = role === 'participant' && transport === 'real-client' ? ensureOwnedDirectory(root, join(storageRoot, 'fixture'), launch.selfDirectory ? [launch.selfDirectory] : []) : null;
  keys[id] = randomBytes(32).toString('hex');
  evidence.redact({token:keys[id]});
  return { clientId:id, playerId:role === 'controller' ? null : `dev-${sessionId}-${id}`, identifier:`com.infinitas.arena.dev.${sessionId}.${id.toLowerCase()}`, role, transport,
    windowLabel:role === 'controller' ? 'dev-control' : 'main', source, readOnlySource:role === 'self' ? { paths:launch.selfDirectory ? [resolve(launch.selfDirectory)] : [], port:source === 'daken_counter_v3' ? launch.selfPort : null } : null,
    fixtureRoot, sourcePort, sourceControlFile:source==='daken_counter_v3'&&role==='participant'?join(fixtureRoot,'today-updates.json'):null, storageRoot, spoolRoot };
}
const clients = [client('controller', 'controller', null, null, null), client('A', 'self', 'real-client', launch.selfSource, launch.selfSource === 'daken_counter_v3' ? launch.selfPort : null)];
for (let i = 1; i < (['CASUAL','TOURNAMENT'].includes(launch.mode)?20:launch.playerCount); i++) {
  const spec=client(String.fromCharCode(65+i), 'participant', i <= launch.visibleOpponents ? 'real-client' : 'headless', i <= launch.visibleOpponents ? launch.opponentSource : null, i <= launch.visibleOpponents && launch.opponentSource === 'daken_counter_v3' ? await freePort() : null);
  spec.initial=i<launch.playerCount;clients.push(spec);
}
const headResult = spawnSync('git', ['rev-parse','HEAD'], { cwd:repo, encoding:'utf8', windowsHide:true });
if (headResult.status !== 0) throw new Error('Cannot identify source HEAD');
const manifest = { protocolVersion:1, sessionId, sourceHead:headResult.stdout.trim(), createdAt:new Date().toISOString(), runtimeRoot:root, repoRoot:repo,
  launcherPath:join(repo,'scripts/start-dev-control.ps1'), broker:{host:'127.0.0.1',port:brokerPort}, apiBaseUrl, mode:launch.mode, hostClientId:launch.hostClient, launch,
  clients, ownedProcesses:[] };
const manifestPath = join(root,'manifest.json');
const spool = ensureOwnedDirectory(root, join(root,'controller-spool'));
ensureOwnedDirectory(root, join(root,'logs'));
writeAuthority(manifestPath, manifest);
write(join(root,'launch-state.json'), { status:'prepared', sessionId, manifestPath });
if (cli['--prepare-only']?.toLowerCase() === 'true') { console.log(JSON.stringify({status:'prepared',sessionId,manifestPath})); process.exit(0); }
const roots = [], owned = new Map();
let stopPromise=null,broker=null;
const runtimeOwner=inventory().find(item=>item.pid===process.pid);
if(!runtimeOwner?.createdAt||!runtimeOwner.executablePath)throw new Error('Cannot establish runtime owner');
manifest.runtimeOwner={...runtimeOwner,kind:'broker',ports:[brokerPort]};
writeAuthority(manifestPath,manifest);
function refreshOwnership() {
  const all = inventory();
  for (const launched of roots) {
    if (launched.child.exitCode !== null || launched.child.signalCode !== null) continue;
    const actualRoot=all.find(process=>process.pid===launched.identity.pid);
    if(!actualRoot)continue;
    if(actualRoot.createdAt!==launched.identity.createdAt||actualRoot.executablePath!==launched.identity.executablePath)throw new Error('Launch-root identity mismatch');
    for (const process of identifiedDescendants(all, launched.child.pid)) {
      const prior = owned.get(process.pid);
      if (prior && (prior.createdAt !== process.createdAt || prior.executablePath !== process.executablePath)) throw new Error('Owned process identity changed');
      owned.set(process.pid, {...process,kind:launched.kind,clientId:launched.clientId,ports:launched.ports});
    }
  }
  manifest.ownedProcesses = [...owned.values()];
  writeAuthority(manifestPath,manifest);
}
function start(kind, args, cwd, environment={}, clientId=null, executable=process.execPath, assignedPorts=[]) {
  const beforeSpawn=Date.now();
  const independent=kind==='controller';
  const child = spawn(executable,args,{cwd,windowsHide:true,detached:independent,env:{...process.env,...environment},stdio:independent?'ignore':['ignore','pipe','pipe']});
  const log=safeFile(join(root,'logs',`${kind}-${clientId??'runtime'}.log`));
  const logFailure=()=>{void (broker?broker.stop():stopRuntime()).catch(()=>{});};
  if(independent)evidence.write(log,{status:'detached-controller',clientId});
  else {evidence.pipe(child.stdout,log,logFailure);evidence.pipe(child.stderr,log,logFailure);}
  // ChildProcess retains its native process handle while the event loop is blocked.
  // Freeze the identity immediately, rather than adopting whichever PID appears later.
  const identity=inventory().find(process=>process.pid===child.pid);
  if(!identity||!identity.executablePath||realpathSync(identity.executablePath).toLowerCase()!==realpathSync(executable).toLowerCase()||Date.parse(identity.createdAt)<beforeSpawn-1||Date.parse(identity.createdAt)>Date.now()){
    child.kill();
    throw new Error('Cannot establish immutable launch-root identity');
  }
  roots.push({child,identity:Object.freeze({...identity}),kind,clientId,ports:assignedPorts});
  owned.set(identity.pid,{...identity,kind,clientId,ports:assignedPorts});
  if(independent)child.unref();
  child.once('error', error => { write(join(root,'launch-error.json'),{kind,clientId,error:error.message}); void (broker?broker.stop():stopRuntime()); });
  return child;
}
async function waitPort(port, child, readiness, timeout=60000) {
  const until = Date.now()+timeout;
  while (Date.now()<until) {
    if (child.exitCode !== null) throw new Error(`Owned process exited before readiness (${port})`);
    const ready = await new Promise(res => { const socket=net.connect(port,'127.0.0.1'); socket.once('connect',()=>{socket.destroy();res(true);});socket.once('error',()=>res(false));socket.setTimeout(Math.min(500,Math.max(1,until-Date.now())),()=>{socket.destroy();res(false);}); });
    if (ready) {
      refreshOwnership();
      const expected=descendants(inventory(),child.pid);
      const bound=listeners().filter(listener=>listener.port===port);
      if(bound.length===0||bound.some(listener=>!expected.some(process=>process.pid===listener.pid&&owned.get(process.pid)?.createdAt===process.createdAt&&owned.get(process.pid)?.executablePath===process.executablePath)))throw new Error(`Port ${port} is not owned by the launched process`);
      const remainingMs=until-Date.now();if(remainingMs<=0)break;
      if(await probeClientReadiness(`http://127.0.0.1:${port}${readiness==='worker'?'/api/capabilities':'/@vite/client'}`,readiness,fetch,Math.min(5000,remainingMs))&&Date.now()<until)return;
    }
    await new Promise(res=>setTimeout(res,300));
  }
  throw new Error(`Owned ${readiness} HTTP readiness timeout (${port})`);
}
function stopRuntime() {
  if(stopPromise)return stopPromise;
  stopPromise=(async()=>{
  clearInterval(ownershipTimer);
  let inventoryError=null;
  try{refreshOwnership();}catch(error){inventoryError=error.message;}
  {
    const runtime = [...owned.values()].filter(p=>p.kind!=='controller');
    const results=stopOwned(runtime);
    const live=inventory(),bound=listeners();
    const {incomplete,remaining}=shutdownProcessState(runtime,results,live);
    const assigned=new Set(runtime.flatMap(p=>p.ports??[]));
    const remainingPorts=bound.filter(p=>assigned.has(p.port));
    write(join(spool,'shutdown.json'),{results,inventoryError,incomplete,remaining,remainingPorts,runtimeOwner:manifest.runtimeOwner});
    if(inventoryError||incomplete.length||remaining.length||remainingPorts.length)throw new Error('Runtime shutdown requires verification/retry');
  }
  })();return stopPromise;
}
const ownershipTimer=setInterval(()=>{try{refreshOwnership();}catch(error){write(join(root,'ownership-error.json'),{error:error.message});void (broker?broker.stop():stopRuntime());}},1500);
try {
  const workerBuild=prepareWorkerRuntime(manifest);
  write(join(root,'logs','worker-build.log'),{sourceHead:manifest.sourceHead,bundleSha256:workerBuild.bundleSha256,configSha256:workerBuild.configSha256});
  // SQLite also creates -journal/-wal sidecars; keep paths below Windows MAX_PATH.
  const worker=start('worker',[...workerBuild.args,'--ip','127.0.0.1','--port',String(workerPort),'--inspector-port',String(inspectorPort),'--persist-to',join(root,'w'),'--var','HOST_EVENT_ACCEPT_NEW:true'],root,{},null,process.execPath,[workerPort,inspectorPort]);
  await waitPort(workerPort,worker,'worker');
  const frontend=start('frontend',[join(repo,'node_modules/vite/bin/vite.js'),'--mode','dev-control','--host','127.0.0.1','--port',String(frontendPort),'--strictPort'],join(repo,'apps/client'),{},null,process.execPath,[frontendPort]);
  await waitPort(frontendPort,frontend,'frontend');
  // The controller embeds dedicated assets and never depends on this dev server.
  const assetRoot=join(root,'controller-assets');
  const buildAssets=spawnSync(process.execPath,[join(repo,'node_modules/vite/bin/vite.js'),'build','--mode','dev-control','--outDir',assetRoot],{cwd:join(repo,'apps/client'),encoding:'utf8',windowsHide:true});
  write(join(root,'logs','controller-assets.log'),{status:buildAssets.status,diagnostic:'Unstructured build output omitted before persistence'});
  if(buildAssets.status!==0)throw new Error('Controller asset build failed');
  const {createSourceSupplier}=await import('./sources/supplier.mjs');
  for(const spec of clients.filter(client=>client.role==='participant'&&client.transport==='real-client')){
    const supplier=await createSourceSupplier({manifest,clientId:spec.clientId,verifyContext:()=>false});
    await supplier.initializeBaseline();
    if(spec.source==='daken_counter_v3'){
      const nonce=randomBytes(32).toString('hex');evidence.redact({token:nonce});
      const mock=start('source',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(repo,'scripts/start-daken-counter-v3-mock.ps1'),'-Port',String(spec.sourcePort),'-ControlFile',spec.sourceControlFile,'-LogPath',join(spec.spoolRoot,'v3-mock.log')],repo,{INF_ARENA_DEV_CONTROL_SOURCE_NONCE:nonce},spec.clientId,'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',[spec.sourcePort]);
      // HTTP.sys owns the TCP socket; require the child-only nonce plus ledger.
      const until=Date.now()+15000;let ready=false;
      while(Date.now()<until&&mock.exitCode===null){
        refreshOwnership();const bound=listeners().filter(listener=>listener.port===spec.sourcePort);
        if(bound.length&&bound.every(listener=>listener.pid===4||owned.get(listener.pid)?.clientId===spec.clientId&&owned.get(listener.pid)?.kind==='source')){
          try{const response=await fetch(`http://127.0.0.1:${spec.sourcePort}/__dev_control_ready`,{headers:{'X-Dev-Control-Source':nonce},redirect:'error',signal:AbortSignal.timeout(1500)});const proof=await response.json();if(response.ok&&proof.pid===mock.pid&&proof.port===spec.sourcePort&&proof.token===nonce){ready=true;break;}}catch{}
        }
        await new Promise(res=>setTimeout(res,300));
      }
      if(!ready)throw new Error('Owned source mock did not become ready');
    }
  }
  const readyClients=[];
  for (const spec of clients.filter(c=>c.transport==='real-client'||c.role==='controller')) {
    const query=new URLSearchParams({instance:`${sessionId}-${spec.clientId}`,label:`DEV ${spec.clientId}`,name:`DEV${spec.clientId}`,playerId:spec.playerId??'',api:apiBaseUrl,devControl:'1'});
    if(spec.role==='controller')query.set('view','dev-control');
    if(spec.source)query.set('source',spec.source);
    if(spec.sourcePort)query.set('dakenCounterV3Port',String(spec.sourcePort));
    const directory=spec.role==='self'?launch.selfDirectory:spec.fixtureRoot;
    if(directory&&spec.source==='inf-notebook'){query.set('notebookPath',join(directory,'export/recent.json'));query.set('recordsPath',join(directory,'records/summary.json'));}
    if(directory&&spec.source==='reflux'){query.set('refluxLatestPath',join(directory,'latest.json'));query.set('refluxTrackerPath',join(directory,'tracker.tsv'));}
    // A drive-letter absolute path is parsed as a URL by Tauri's untagged config.
    const frontendDist=relative(join(repo,'apps/client/src-tauri'),assetRoot).replaceAll('\\','/');
    const config={identifier:spec.identifier,build:{beforeDevCommand:null,beforeBuildCommand:null,frontendDist,devUrl:null},app:{windows:[{label:spec.windowLabel,title:`DEV ${spec.clientId} / ${sessionId}`,url:`index.html?${query}`,width:spec.role==='controller'?1024:1280,height:800,minWidth:320,minHeight:500,dataDirectory:`dev-control-${sessionId}-${spec.clientId}`}]}};
    validateClientBuild(manifest,spec,config);
    const configPath=join(spec.storageRoot,'tauri.json');writeAuthority(configPath,config);
    const environment={INF_ARENA_DEV_CONTROL_MANIFEST:manifestPath,INF_ARENA_DEV_CONTROL_ROOT:root,INF_ARENA_DEV_CONTROL_SESSION:sessionId,INF_ARENA_DEV_CONTROL_CLIENT:spec.clientId,INF_ARENA_DEV_CONTROL_TOKEN:keys[spec.clientId],INF_ARENA_DISABLE_DEEP_LINK_REGISTER:'1',CARGO_TARGET_DIR:join(repo,'apps/client/src-tauri/target')};
    {
      const started=Date.now();
      // Builds are synchronous and sequential; only immutable copied executables are started.
      const built=spawnSync(process.execPath,[join(repo,'node_modules/@tauri-apps/cli/tauri.js'),'build','--debug','--no-bundle','--config',configPath],{cwd:join(repo,'apps/client'),encoding:'utf8',windowsHide:true,env:{...process.env,...environment}});
      write(join(root,'logs',`build-${spec.clientId}.log`),{status:built.status,durationMs:Date.now()-started,clientId:spec.clientId,identifier:config.identifier,dataDirectory:config.app.windows[0].dataDirectory,sourceHead:manifest.sourceHead,diagnostic:'Unstructured build output omitted before persistence'});
      if(built.status!==0)throw new Error(`Dedicated native build failed: ${spec.clientId}`);
      const binary=copyClientBinary(manifest,spec,join(repo,'apps/client/src-tauri/target/debug/infinitas-arena-client.exe'));
      readyClients.push({spec,binary,environment});
    }
  }
  // A synchronous build blocks the broker event loop. Open windows only once every
  // binary is ready, so their first native request cannot time out during a build.
  const { createBroker }=await import('./broker.mjs');
  broker=await createBroker({manifest,keys,requireStopExport:true,onStop:async()=>{try{await stopRuntime();}finally{await broker.close();setTimeout(()=>process.exit(0),100);}}});
  await broker.listen();
  await broker.startSession();
  // Adapter ticks can retry startup reads; show the controller after all product
  // windows are registered so synchronous ownership checks cannot stall its UI.
  for(const {spec,binary,environment} of readyClients.sort((a,b)=>Number(a.spec.role==='controller')-Number(b.spec.role==='controller'))){
    const child=start(spec.role==='controller'?'controller':'client',[],spec.storageRoot,environment,spec.clientId,binary);
    if(spec.role==='controller')child.once('exit',async()=>{await broker.stop();await stopRuntime();await broker.close();process.exit();});
    else child.once('exit',()=>{try{broker.clientExited(spec.clientId);}catch{void broker.stop();}});
    refreshOwnership();
  }
  refreshOwnership();
  write(join(spool,'manifest.json'),evidenceManifest(manifest));
  write(join(root,'launch-state.json'),{status:'running',sessionId,manifestPath});
  console.log(JSON.stringify({status:'running',sessionId,manifestPath}));
  process.on('SIGINT',async()=>{await broker.stop();await stopRuntime();await broker.close();process.exit();});
  process.on('SIGTERM',async()=>{await broker.stop();await stopRuntime();await broker.close();process.exit();});
}catch(error){
  write(join(root,'launch-state.json'),{status:'failed',sessionId,error:error.message});
  await stopRuntime();
  throw error;
}
