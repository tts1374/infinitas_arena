import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { createSourceSupplier } from './supplier.mjs';

// This is a real local-WS transport check, not native parser/server acceptance.
test('owned Windows v3 mock: empty baseline, exact input, latest replay and invalidation', { skip: process.platform !== 'win32', timeout: 45000 }, async () => {
  const root=mkdtempSync(join(tmpdir(),'dev-control-v3-runtime-'));
  const fixtureRoot=join(root,'B');mkdirSync(fixtureRoot);
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const manifest={runtimeRoot:root,clients:[{clientId:'B',role:'participant',transport:'real-client',source:'daken_counter_v3',fixtureRoot,sourcePort:port,storageRoot:fixtureRoot,spoolRoot:fixtureRoot}]};
  const supplier=await createSourceSupplier({manifest,clientId:'B',verifyContext:()=>true});
  await supplier.initializeBaseline();
  const child=spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',[
    '-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/start-daken-counter-v3-mock.ps1'),
    '-Port',String(port),'-ControlFile',join(fixtureRoot,'today-updates.json'),'-LogPath',join(root,'mock.log'),
  ],{windowsHide:true,stdio:'ignore',env:{...process.env,INF_ARENA_DEV_CONTROL_SOURCE_NONCE:'runtime-readiness-proof'}});
  const sockets=[];
  async function connect(){
    const socket=new WebSocket(`ws://127.0.0.1:${port}`,'infinitas-arena-daken-v3');sockets.push(socket);
    const messages=[];socket.addEventListener('message',event=>messages.push(JSON.parse(event.data)));
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Owned mock handshake timed out')),7000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      socket.addEventListener('error',error=>{clearTimeout(timer);reject(error);},{once:true});
    });
    return {socket,messages};
  }
  async function until(predicate){const end=Date.now()+7000;while(!predicate()){if(Date.now()>end)throw new Error('Timed out waiting for owned mock evidence');await new Promise(resolve=>setTimeout(resolve,40));}}
  try{
    await until(()=>{try{return readFileSync(join(root,'mock.log'),'utf8').includes('mock started');}catch{return false;}});
    const healthUrl=`http://127.0.0.1:${port}/__dev_control_ready`;
    assert.equal((await fetch(healthUrl,{headers:{'X-Dev-Control-Source':'wrong'}})).status,400);
    const proof=await fetch(healthUrl,{headers:{'X-Dev-Control-Source':'runtime-readiness-proof'}});
    assert.deepEqual(await proof.json(),{pid:child.pid,port,token:'runtime-readiness-proof'});
    const first=await connect();await until(()=>first.messages.length>0);
    assert.deepEqual(first.messages.at(-1).data.items,[]);
    const request={context:{round:1},expectedKey:{play_style:'SP',difficulty:'ANOTHER',title_search_key:'Song',chart_id:42},title:'Song',exScore:2000,missCount:10};
    const a=await supplier.prepareInput(request);await supplier.supply(a);
    await until(()=>first.messages.some(message=>message.data.items[0]?.playspeed===a.playSpeed));
    const raw=first.messages.at(-1);assert.match(raw.data.items[0].chart_id,/^[0-9a-f]{64}$/);assert.equal(raw.data.items[0].score,2000);assert.equal(raw.data.items[0].bp,10);
    const replay=await connect();await until(()=>replay.messages.length>0);assert.deepEqual(replay.messages[0],raw);
    const b=await supplier.prepareInput(request);await supplier.supply(b);
    await until(()=>replay.messages.some(message=>message.data.items[0]?.playspeed===b.playSpeed));
    assert.notEqual(a.sourceFingerprint,b.sourceFingerprint);
    await supplier.invalidate();await until(()=>replay.messages.at(-1)?.data.items.length===0);
    const fresh=await connect();await until(()=>fresh.messages.length>0);assert.deepEqual(fresh.messages[0].data.items,[]);
    assert.ok(readFileSync(join(root,'mock.log'),'utf8').includes('latest payload replayed'));
  }finally{
    for(const socket of sockets)socket.close();
    await supplier.stop();
    // Only the directly spawned owned child is terminated; no name/PID discovery.
    if(child.exitCode===null){child.kill();await once(child,'exit');}
    const probe=createServer();probe.listen(port,'127.0.0.1');await once(probe,'listening');await new Promise(resolve=>probe.close(resolve));
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));
    assert.ok(basename(root).startsWith('dev-control-v3-runtime-'));
    rmSync(root,{recursive:true,force:true});
  }
});
