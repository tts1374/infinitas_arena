import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { createBroker } from './broker.mjs';
import { deriveActions } from './action-policy.mjs';
import { canonicalJson, emptyContext } from './protocol.mjs';

const key = { play_style:'SP', difficulty:'ANOTHER', title_search_key:'song', chart_id:123 };
const normal = {
  room_id:'room', generation:1, current_match_id:'match', room_state:'PLAYING', host_player_id:'b',
  settings:{mode:'ARENA',win_metric:'SCORE',play_style:'SP'}, players:[{player_id:'b',ready:true},{player_id:'a',ready:true}],
  picks:[], frozen_rounds:[{round_index:0,expected_key:key,display:{title:'Song',level:12}}],
  current_round:{round_index:0,expected_key:key,round_started_at:'2026-01-01T00:00:00.000Z',confirmed:[]},
};

async function fixture(options = {}) {
  mkdirSync('testdata/runtime/dev-control',{recursive:true});
  const runtimeRoot=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/delivery-'));
  const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const manifest={runtimeRoot,sessionId:'test-session',sourceHead:'0'.repeat(40),broker:{port},mode:'ARENA',hostClientId:'B',apiBaseUrl:'http://127.0.0.1:19999',clients:[
    {clientId:'controller',playerId:null,role:'controller',transport:null},
    {clientId:'A',playerId:'a',role:'self',transport:'real-client'},
    {clientId:'B',playerId:'b',role:'participant',transport:'real-client'},
  ]};
  const keys={controller:'c'.repeat(64),A:'a'.repeat(64),B:'b'.repeat(64)};
  const callbacks=new Map();let timerId=0;
  const clock={setTimeout:(callback,ms)=>{const id=++timerId;callbacks.set(id,{callback,ms});return id;},clearTimeout:id=>callbacks.delete(id)};
  const broker=await createBroker({manifest,keys,clock,...options});await broker.listen();
  const request=async(route,payload,clientId='controller')=>{
    const response=await fetch(`http://127.0.0.1:${port}/${route}`,{method:payload===undefined?'GET':'POST',headers:{Authorization:`Bearer ${keys[clientId]}`,'X-Dev-Control-Client':clientId},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    return {status:response.status,body:await response.json()};
  };
  const report=(overrides={})=>request('report',{normalSnapshot:normal,eventSnapshot:null,connection:'CONNECTED',transportEpoch:1,events:[],...overrides},'B');
  const client=()=>broker.state.clients.find(c=>c.manifest.clientId==='B');
  let operationId=0;
  const command=(action,payload={})=>({protocolVersion:1,operationId:`op-${++operationId}`,sessionId:manifest.sessionId,actorClientId:'controller',targetClientId:'B',context:structuredClone(client().context),action,payload});
  return {broker,request,report,client,command,callbacks,runtimeRoot,close:async()=>{await broker.stop();await broker.close();}};
}

test('native focus confirms A/B local window actions after claim and survives the receipt timeout without WS traffic',async()=>{
  const f=await fixture();
  try{
    await f.report();
    for(const clientId of ['A','B']){
      const client=f.broker.state.clients.find(c=>c.manifest.clientId===clientId);
      const command={...f.command('client.focus'),targetClientId:clientId,context:structuredClone(client.context)};
      await f.request('command',command);
      const proof={protocolVersion:1,operationId:command.operationId,sessionId:command.sessionId,clientId,focused:true};
      const finish={operationId:command.operationId,status:'confirmed',nativeFocus:proof};
      assert.equal((await f.request('finish',finish,clientId)).status,400);
      assert.equal((await f.request('poll',undefined,clientId)).body.length,1);
      assert.equal((await f.request('finish',finish,clientId)).status,200);
      const operation=f.broker.state.operations.find(op=>op.operationId===command.operationId);
      assert.equal(operation.status,'confirmed');assert.match(operation.reason,/製品WS受付ではありません/);
      for(const timer of f.callbacks.values())if(timer.ms===15000)timer.callback();
      assert.equal(operation.status,'confirmed');
    }
    assert.equal(f.broker.state.observations.some(o=>o.stage==='sent'),false);
  }finally{await f.close();}
});

test('native focus rejects failed/foreign/stale proofs and cannot confirm a product action',async()=>{
  const f=await fixture();
  try{
    await f.report();
    for(const patch of [{focused:false},{clientId:'A'},{sessionId:'foreign'},{operationId:'foreign'},null]){
      const command=f.command('client.focus');await f.request('command',command);await f.request('poll',undefined,'B');
      const nativeFocus=patch&&{protocolVersion:1,operationId:command.operationId,sessionId:command.sessionId,clientId:'B',focused:true,...patch};
      await f.request('finish',{operationId:command.operationId,status:'confirmed',nativeFocus},'B');
      assert.equal(f.broker.state.operations.find(op=>op.operationId===command.operationId).status,'failed');
    }
    const refresh=f.command('state.refresh');await f.request('command',refresh);await f.request('poll',undefined,'B');
    await f.request('finish',{operationId:refresh.operationId,status:'confirmed',nativeFocus:{protocolVersion:1,operationId:refresh.operationId,sessionId:refresh.sessionId,clientId:'B',focused:true}},'B');
    assert.equal(f.broker.state.operations.find(op=>op.operationId===refresh.operationId).status,'failed');
    const command=f.command('client.focus');await f.request('command',command);await f.request('poll',undefined,'B');
    assert.equal((await f.request('finish',{operationId:command.operationId,status:'confirmed'},'A')).status,400);
    await f.report({transportEpoch:2});
    assert.equal((await f.request('finish',{operationId:command.operationId,status:'confirmed'},'B')).status,200);
    assert.equal(f.broker.state.operations.find(op=>op.operationId===command.operationId).status,'cancelled');
  }finally{await f.close();}
});

test('stop shares one promise and still terminates runtime when spool persistence fails',async()=>{
  let stops=0,releaseStop;
  const f=await fixture({onStop:async()=>{stops++;await new Promise(resolve=>releaseStop=resolve);}});
  try{
    await f.report();await f.request('command',f.command('draft.update',{exScore:100,missCount:1}));
    await f.request('command',f.command('result.delay',{valueRevision:f.client().context.valueRevision,delayMs:10000}));
    const stateFile=join(f.runtimeRoot,'controller-spool/state.json');unlinkSync(stateFile);mkdirSync(stateFile);
    const first=f.broker.stop(),second=f.broker.stop();assert.equal(first,second);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(stops,1);assert.notEqual(f.broker.state.lifecycle,'stopped');assert.ok(f.broker.state.stop.errors.length);
    releaseStop();await first;assert.equal(f.broker.state.lifecycle,'stopping');assert.equal(f.broker.state.stop.phase,'verifying');
    assert.equal(f.broker.state.operations.some(op=>op.status==='reserved'),false);
  }finally{await f.close();}
});

test('the accepted local stop request is not cancelled or confirmed before native shutdown verification',async()=>{
  const f=await fixture();
  try{
    const controller=f.broker.state.clients.find(client=>client.manifest.role==='controller');
    const command={...f.command('session.stop'),targetClientId:'controller',context:structuredClone(controller.context),payload:{confirmationToken:canonicalJson({context:controller.context,draft:controller.draft,action:'session.stop'})}};
    assert.equal((await f.request('command',command)).status,200);
    await new Promise(resolve=>setImmediate(resolve));await f.broker.stop();
    assert.equal(f.broker.state.stop.operationId,command.operationId);
    assert.equal(f.broker.state.operations.find(operation=>operation.operationId===command.operationId).status,'pending');
    assert.equal(f.broker.state.stop.processesVerified,false);
  }finally{await f.close();}
});

test('stop exports a new correlated native bundle before runtime termination and preserves every export outcome',async t=>{
  for(const status of ['saved','partial','failed'])await t.test(status,async()=>{
    let stopped=0;
    const f=await fixture({requireStopExport:true,onStop:async()=>{stopped++;}});
    try{
      const spool=join(f.runtimeRoot,'controller-spool');
      const original=readFileSync(join(spool,'observations.jsonl'),'utf8');
      const first=f.broker.stop();assert.equal(first,f.broker.stop());
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(f.broker.state.stop.phase,'flushing');assert.equal(f.broker.state.save.status,'exporting');assert.equal(stopped,0);
      const exportId=f.broker.state.stop.exportRequestId;
      assert.equal(JSON.parse(readFileSync(join(spool,'state.json'),'utf8')).stop.exportRequestId,exportId);
      const captures=f.broker.state.evidence.captures.length;
      assert.equal((await f.request('collect',{})).status,400,'external collection cannot resume during stop');
      assert.equal(f.broker.state.evidence.captures.length,captures);assert.equal(f.broker.state.save.status,'exporting');
      const saved={status,path:status==='failed'?null:join(f.runtimeRoot,'exports','bundle-123'),bundleId:status==='failed'?null:'bundle-123',attempt:2,error:status==='failed'?'injected export failure':null,missing:status==='partial'?['A: unavailable']:[]};
      for(const stopExportRequestId of [undefined,'previous-stop']){
        assert.equal((await f.request('export-result',{...saved,...(stopExportRequestId?{stopExportRequestId}:{})})).status,400);
        assert.equal(stopped,0);assert.equal(f.broker.state.save.status,'exporting');
      }
      assert.equal((await f.request('export-result',{...saved,stopExportRequestId:exportId})).status,200);
      await first;assert.equal(stopped,1);assert.equal(f.broker.state.stop.phase,'verifying');assert.equal(f.broker.state.save.status,status);
      assert.equal((await f.request('collect',{})).status,400);assert.equal(f.broker.state.save.status,status);
      assert.equal(readFileSync(join(spool,'observations.jsonl'),'utf8'),original);
      assert.equal((await f.request('export-result',{...saved,stopExportRequestId:exportId})).status,400,'a late acknowledgement cannot rewrite the outcome');
    }finally{await f.close();}
  });
});

test('missing native stop export times out, retains prior evidence and still terminates the runtime',async()=>{
  let stopped=0;
  const f=await fixture({requireStopExport:true,stopExportTimeoutMs:1234,onStop:async()=>{stopped++;}});
  try{
    const oldBundle=join(f.runtimeRoot,'exports','bundle-100');mkdirSync(oldBundle,{recursive:true});
    const prior={status:'saved',path:oldBundle,bundleId:'bundle-100',attempt:1,error:null,missing:[]};
    assert.equal((await f.request('export-result',prior)).status,200);
    const stopping=f.broker.stop();await new Promise(resolve=>setImmediate(resolve));
    const marker=f.broker.state.stop.exportRequestId;
    assert.equal(stopped,0);
    const timeout=[...f.callbacks.values()].find(timer=>timer.ms===1234);assert.ok(timeout);timeout.callback();
    await stopping;assert.equal(stopped,1);assert.equal(f.broker.state.save.status,'failed');assert.equal(f.broker.state.save.bundleId,'bundle-100');
    assert.ok(f.broker.state.stop.errors.includes('Native stop export timed out'));
    assert.ok(readFileSync(join(f.runtimeRoot,'controller-spool/state.json'),'utf8').includes('Native stop export timed out'));
    assert.equal((await f.request('export-result',{...prior,stopExportRequestId:marker})).status,400);
  }finally{await f.close();}
});

test('collection reports missing images and a later attempt can retry without reviving product work',async()=>{
  const f=await fixture();
  try{
    await f.broker.collectEvidence();assert.equal(f.broker.state.save.status,'partial');assert.equal(f.broker.state.save.missing.length,2);
    const first=f.broker.state.save.attempt;
    await f.broker.collectEvidence();assert.equal(f.broker.state.save.attempt,first+1);
    assert.equal(f.broker.state.operations.length,0);
    const spool=JSON.parse(readFileSync(join(f.runtimeRoot,'controller-spool/state.json'),'utf8'));assert.equal(spool.save.missing.length,2);
  }finally{await f.close();}
});

test('runtime stop failure remains failed phase and cannot be mistaken for stopped',async()=>{
  const f=await fixture({onStop:async()=>{throw new Error('runtime still alive');}});
  try{
    await f.broker.stop();assert.equal(f.broker.state.lifecycle,'stopping');assert.equal(f.broker.state.stop.phase,'failed');
    assert.ok(f.broker.state.stop.errors.includes('runtime still alive'));
    await f.broker.collectEvidence();assert.equal(f.broker.state.save.status,'partial');
  }finally{await f.close();}
});

test('delay dispatch becomes claimable once, then injection requires a current armed claim',async()=>{
  let writes=0;
  const supplier={prepareInput:async input=>({...input,inputId:'input',source:'reflux',timestamp:'2026-01-01T00:01:00Z'}),supply:async()=>writes++,invalidate:async()=>{},stop:async()=>{}};
  const f=await fixture({createSupplier:async()=>supplier});
  try {
    await f.report();
    await f.request('command',f.command('draft.update',{exScore:0,missCount:0}));
    const delayed=f.command('result.delay',{valueRevision:f.client().context.valueRevision,delayMs:10000});
    assert.equal((await f.request('command',delayed)).body.status,'reserved');
    assert.equal((await f.request('poll',undefined,'B')).body.length,0);
    const entry=[...f.callbacks.values()].find(timer=>timer.ms===10000);assert.ok(entry);
    await entry.callback();
    const first=(await f.request('poll',undefined,'B')).body;
    assert.equal(first.length,1);assert.equal(first[0].kind,'source-arm');
    assert.equal((await f.request('poll',undefined,'B')).body.length,0);
    assert.equal((await f.request('command',f.command('reservation.cancel',{operationId:delayed.operationId}))).status,400);
    assert.equal((await f.report({armedInputId:'input'})).status,200);assert.equal(writes,1);
    assert.equal(f.broker.state.operations.find(op=>op.operationId===delayed.operationId).status,'input-written');
    assert.equal((await f.report({armedInputId:'input'})).status,400);assert.equal(writes,1);
  } finally { await f.close(); }
});

test('delay policy, draft edits and next-round reports never schedule without an explicit delay action',async()=>{
  let prepared=0;
  const supplier={prepareInput:async input=>({...input,inputId:`delay-${++prepared}`,source:'reflux',timestamp:'x'}),supply:async()=>{},invalidate:async()=>{},stop:async()=>{}};
  const f=await fixture({createSupplier:async()=>supplier});
  try {
    await f.report();
    await f.request('command',f.command('draft.update',{exScore:1800,missCount:20}));
    assert.equal((await f.request('command',f.command('policy.apply',{policy:'delay'}))).status,200);
    await f.report();
    await f.request('command',f.command('draft.update',{exScore:1900,missCount:10}));
    const nextRound={...normal,frozen_rounds:[{...normal.frozen_rounds[0],round_index:1}],current_round:{...normal.current_round,round_index:1}};
    await f.report({normalSnapshot:nextRound});
    await f.report({normalSnapshot:nextRound});
    assert.equal(f.broker.state.operations.filter(op=>op.status==='reserved').length,0);
    assert.equal([...f.callbacks.values()].filter(timer=>timer.ms===10000).length,0);
    assert.equal((await f.request('poll',undefined,'B')).body.length,0);
    assert.equal(prepared,0);
    const delayed=f.command('result.delay',{valueRevision:f.client().context.valueRevision,delayMs:10000});
    assert.equal((await f.request('command',delayed)).body.status,'reserved');
    const reservations=[...f.callbacks.values()].filter(timer=>timer.ms===10000);
    assert.equal(reservations.length,1);
    assert.equal(prepared,0);
    await reservations[0].callback();
    assert.equal(prepared,1);
    assert.equal((await f.request('poll',undefined,'B')).body.length,1);
    assert.equal((await f.request('poll',undefined,'B')).body.length,0);
  } finally { await f.close(); }
});

test('auto still sends once per round and applying auto now requires confirmation',async()=>{
  let prepared=0;
  const supplier={prepareInput:async input=>({...input,inputId:`auto-${++prepared}`,source:'reflux',timestamp:'x'}),supply:async()=>{},invalidate:async()=>{},stop:async()=>{}};
  const f=await fixture({createSupplier:async()=>supplier});
  try {
    await f.report();
    await f.request('command',f.command('draft.update',{exScore:1800,missCount:20}));
    assert.equal((await f.request('command',f.command('policy.apply',{policy:'auto'}))).status,400);
    assert.equal(f.client().policy,'manual');assert.equal(prepared,0);
    const confirmationToken=canonicalJson({context:f.client().context,draft:f.client().draft,action:'policy.auto'});
    assert.equal((await f.request('command',f.command('policy.apply',{policy:'auto',confirmationToken}))).status,200);
    assert.equal(prepared,1);
    await f.report();assert.equal(prepared,1);
    const nextRound={...normal,frozen_rounds:[{...normal.frozen_rounds[0],round_index:1}],current_round:{...normal.current_round,round_index:1}};
    await f.report({normalSnapshot:nextRound});
    await f.report({normalSnapshot:nextRound});
    assert.equal(prepared,2);
    assert.equal([...f.callbacks.values()].filter(timer=>timer.ms===10000).length,0);
  } finally { await f.close(); }
});

test('competing operations cannot claim twice or overwrite timeout; next draft stays editable',async()=>{
  const f=await fixture();
  try {
    await f.report({normalSnapshot:{...normal,room_state:'LOBBY',current_round:null}});
    const ready=f.command('ready.set',{ready:true});
    assert.equal((await f.request('command',ready)).body.status,'pending');
    assert.equal((await f.request('command',ready)).body.operationId,ready.operationId);
    assert.equal((await f.request('command',f.command('ready.set',{ready:false}))).status,400);
    assert.equal((await f.request('poll',undefined,'B')).body.length,1);
    assert.equal((await f.request('poll',undefined,'B')).body.length,0);
    assert.equal((await f.request('command',f.command('reservation.cancel',{operationId:ready.operationId}))).status,400);
    const timeout=[...f.callbacks.values()].find(timer=>timer.ms===15000);await timeout.callback();
    assert.equal((await f.request('finish',{operationId:ready.operationId,status:'sent'},'B')).status,400);
    assert.equal(f.broker.state.operations.find(op=>op.operationId===ready.operationId).status,'unknown');
    assert.equal((await f.request('command',f.command('draft.update',{exScore:123,missCount:4}))).body.status,'confirmed');
  } finally { await f.close(); }
});

test('epoch changes during asynchronous prepare never enqueue or supply stale input',async()=>{
  let resolvePrepare,preparedStarted;const started=new Promise(resolve=>preparedStarted=resolve);let writes=0;
  const supplier={prepareInput:async input=>{preparedStarted();return new Promise(resolve=>{resolvePrepare=()=>resolve({...input,inputId:'stale',source:'reflux',timestamp:'x'});});},supply:async()=>writes++,invalidate:async()=>{},stop:async()=>{}};
  const f=await fixture({createSupplier:async()=>supplier});
  try {
    await f.report();await f.request('command',f.command('draft.update',{exScore:200,missCount:1}));
    const send=f.request('command',f.command('result.send',{valueRevision:f.client().context.valueRevision}));
    await started;await f.report({transportEpoch:2});resolvePrepare();
    assert.equal((await send).body.status,'failed');
    assert.equal((await f.request('poll',undefined,'B')).body.length,0);assert.equal(writes,0);
  } finally { await f.close(); }
});

test('a supply already awaiting completion stays unknown after stop and cannot become cancelled or successful',async()=>{
  let finishSupply,supplyStarted;
  const started=new Promise(resolve=>supplyStarted=resolve);
  const supplier={prepareInput:async input=>({...input,inputId:'in-flight',source:'reflux',timestamp:'x'}),supply:async()=>{supplyStarted();await new Promise(resolve=>finishSupply=resolve);},invalidate:async()=>{},stop:async()=>{}};
  const f=await fixture({createSupplier:async()=>supplier});
  try {
    await f.report();await f.request('command',f.command('draft.update',{exScore:0,missCount:0}));
    const send=f.command('result.send',{valueRevision:f.client().context.valueRevision});
    await f.request('command',send);await f.request('poll',undefined,'B');
    const injection=f.report({armedInputId:'in-flight'});await started;
    await f.broker.stop();
    assert.equal(f.broker.state.operations.find(op=>op.operationId===send.operationId).status,'unknown');
    finishSupply();await injection;
    assert.equal(f.broker.state.operations.find(op=>op.operationId===send.operationId).status,'unknown');
    assert.equal((await f.request('poll',undefined,'B')).body.length,0);
  } finally { await f.close(); }
});

test('v3 source arms require and carry the exact parser fingerprint',async()=>{
  for(const sourceFingerprint of [undefined,'1234abcd']){
    const supplier={prepareInput:async input=>({...input,inputId:'v3',source:'daken_counter_v3',timestamp:'x',sourceFingerprint}),supply:async()=>{},invalidate:async()=>{},stop:async()=>{}};
    const f=await fixture({createSupplier:async()=>supplier});
    try {
      await f.report();await f.request('command',f.command('draft.update',{exScore:100,missCount:1}));
      const response=await f.request('command',f.command('result.send',{valueRevision:f.client().context.valueRevision}));
      const polled=(await f.request('poll',undefined,'B')).body;
      if(sourceFingerprint){assert.equal(response.body.status,'pending');assert.equal(polled[0].input.sourceFingerprint,sourceFingerprint);}
      else {assert.equal(response.body.status,'failed');assert.equal(polled.length,0);}
    } finally { await f.close(); }
  }
});

test('normal RESULT permits connection tests; event host leave and host-disconnected guest leave stay forbidden',()=>{
  const client={manifest:{clientId:'B',playerId:'b',role:'participant'},context:emptyContext('s','B'),connection:'CONNECTED',draft:{exScore:0,missCount:0},normalSnapshot:{...normal,room_state:'RESULT'},eventSnapshot:null};
  const options={lifecycle:'running',eventMode:false,availableParticipants:[],operations:[]};
  const enabled=action=>deriveActions(client,options).actions.find(item=>item.action===action).enabled;
  client.manifest.transport='headless';assert.equal(enabled('client.focus'),false);
  client.manifest.transport='real-client';assert.equal(enabled('client.focus'),true);
  assert.equal(enabled('participant.leave'),true);client.connection='DISCONNECTED';assert.equal(enabled('participant.reconnect'),true);
  client.connection='LEFT';assert.equal(enabled('participant.reconnect'),false);
  client.connection='CONNECTED';client.normalSnapshot=null;
  client.eventSnapshot={phase:'PLAYING',round_phase:'ACTIVE',host:{player_id:'b',connected:true},participants:[{player_id:'b',connection_state:'CONNECTED',round_status:'PENDING'}],current_playing_player_ids:['b']};
  assert.equal(enabled('participant.leave'),false);assert.equal(enabled('result.send'),true);
  client.eventSnapshot.host={player_id:'a',connected:false};assert.equal(enabled('participant.leave'),false);assert.equal(enabled('result.send'),true);
});
