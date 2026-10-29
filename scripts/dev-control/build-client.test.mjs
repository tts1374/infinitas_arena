import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateClientBuild,copyClientBinary,probeClientReadiness } from './build-client.mjs';

test('owned HTTP readiness retries startup timeouts and server warmup without accepting incorrect content',async()=>{
  for(const kind of ['worker','frontend']) {
    let calls=0;
    const request=async(_url,options)=>{
      assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
      if(++calls===1)throw new DOMException('cold server timeout','TimeoutError');
      if(calls===2)return new Response('warming up',{status:503});
      return kind==='worker'?Response.json({host_event_protocol:2}):new Response('WebSocket client');
    };
    assert.equal(await probeClientReadiness('http://127.0.0.1:1',kind,request),false);
    assert.equal(await probeClientReadiness('http://127.0.0.1:1',kind,request),false);
    assert.equal(await probeClientReadiness('http://127.0.0.1:1',kind,request),true);
  }
  await assert.rejects(probeClientReadiness('http://127.0.0.1:1','worker',async()=>Response.json({host_event_protocol:1})),/capability mismatch/);
  await assert.rejects(probeClientReadiness('http://127.0.0.1:1','frontend',async()=>new Response('unrelated server')),/content mismatch/);
  await assert.rejects(probeClientReadiness('http://127.0.0.1:1','worker',async()=>new Response('not JSON')),SyntaxError);
  await assert.rejects(probeClientReadiness('http://127.0.0.1:1','worker',async()=>new Response('',{status:401})),/HTTP failed/);
  assert.equal(await probeClientReadiness('http://127.0.0.1:1','worker',async()=>{await new Promise(resolve=>setTimeout(resolve,10));return Response.json({host_event_protocol:2});},1),false,'a valid response after the remaining deadline is not ready');
});

test('shared build cache never changes the session/client identifier, profile, route or copied executable',()=>{
  mkdirSync('testdata/runtime/dev-control',{recursive:true});
  const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/build-profile-'));
  mkdirSync(join(root,'controller-assets'));
  const manifest={runtimeRoot:root,repoRoot:root,sessionId:'session'};
  const configs=[];
  for(const clientId of ['controller','A','B']){
    const role=clientId==='controller'?'controller':clientId==='A'?'self':'participant';
    const spec={clientId,role,identifier:`com.infinitas.arena.dev.session.${clientId.toLowerCase()}`,storageRoot:join(root,clientId),windowLabel:role==='controller'?'dev-control':'main',playerId:role==='controller'?null:clientId};
    mkdirSync(spec.storageRoot);
    const config={identifier:spec.identifier,build:{frontendDist:relative(join(root,'apps/client/src-tauri'),join(root,'controller-assets')),devUrl:null},app:{windows:[{label:spec.windowLabel,dataDirectory:`dev-control-session-${clientId}`,url:`index.html?instance=session-${clientId}&playerId=${spec.playerId??''}${role==='controller'?'&view=dev-control':''}`}]}};
    assert.equal(validateClientBuild(manifest,spec,config),true);configs.push({spec,config});
    const built=join(root,'shared-cache.exe');writeFileSync(built,`${clientId}-compiled-identity`);
    writeFileSync(join(root,'WebView2Loader.dll'),'loader');
    const executable=copyClientBinary(manifest,spec,built);writeFileSync(built,'next-client-build');
    assert.equal(readFileSync(executable,'utf8'),`${clientId}-compiled-identity`);
    assert.equal(readFileSync(join(spec.storageRoot,'WebView2Loader.dll'),'utf8'),'loader');
    assert.throws(()=>validateClientBuild(manifest,spec,{...config,identifier:'com.infinitas.arena.client'}));
  }
  assert.throws(()=>validateClientBuild(manifest,configs[1].spec,configs[2].config));
  assert.throws(()=>validateClientBuild(manifest,configs[1].spec,{...configs[1].config,build:{...configs[1].config.build,devUrl:'http://127.0.0.1:1420'}}));
  assert.throws(()=>validateClientBuild(manifest,configs[1].spec,{...configs[1].config,build:{frontendDist:join(root,'controller-assets'),devUrl:null}}));
});
