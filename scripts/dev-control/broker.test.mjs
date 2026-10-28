import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { createBroker } from './broker.mjs';

test('all five modes request a product-generated join code and keep the returned live code',async t=>{
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    const payload=JSON.parse(options.body);
    assert.equal((payload.settings??payload).join_code,null);
    return Response.json(payload.settings?{room_id:'event-room',join_code:'ABCD2345'}:{room_id:'normal-room',settings:{join_code:'ABCD2345'}});
  });
  for(const mode of ['ARENA','BPL','BPL4','CASUAL','TOURNAMENT']) {
    const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/broker-create-'));
    const manifest={sessionId:'create-test',sourceHead:'0'.repeat(40),runtimeRoot:root,broker:{port:19001},mode,hostClientId:'B',launch:{playerCount:mode==='ARENA'?4:2},apiBaseUrl:'http://127.0.0.1:19999',clients:[{clientId:'B',playerId:'b',role:'participant',transport:'real-client'}]};
    const broker=await createBroker({manifest,keys:{B:'b'.repeat(64)}});
    await broker.startSession();
    assert.equal(broker.state.joinCode,'ABCD2345');
    assert.equal(readFileSync(join(root,'controller-spool/state.json'),'utf8').includes('ABCD2345'),false);
  }
});

test('native/broker authority: role/token/context and protected self are enforced',async()=>{
  mkdirSync('testdata/runtime/dev-control',{recursive:true});
  const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/broker-'));
  const socket=net.createServer();await new Promise(res=>socket.listen(0,'127.0.0.1',res));const port=socket.address().port;await new Promise(res=>socket.close(res));
  const keys={controller:'c'.repeat(64),A:'a'.repeat(64),B:'b'.repeat(64)};
  const manifest={protocolVersion:1,sessionId:'test-session',sourceHead:'0'.repeat(40),runtimeRoot:root,broker:{host:'127.0.0.1',port},mode:'ARENA',hostClientId:'B',apiBaseUrl:'http://127.0.0.1:19999',clients:[
    {clientId:'controller',playerId:null,role:'controller',transport:null},
    {clientId:'A',playerId:'a',role:'self',transport:'real-client'},
    {clientId:'B',playerId:'b',role:'participant',transport:'real-client'},
  ]};
  const broker=await createBroker({manifest,keys});await broker.listen();
  async function request(route,clientId='controller',payload,token=keys[clientId]){
    const response=await fetch(`http://127.0.0.1:${port}/${route}`,{method:payload===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'X-Dev-Control-Client':clientId},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    return {status:response.status,body:await response.json()};
  }
  try{
    assert.equal((await request('state','controller',undefined,'wrong')).status,401);
    assert.equal((await request('state','A')).status,400);
    const state=(await request('state')).body;
    const refresh={protocolVersion:1,operationId:'refresh-controller',sessionId:'test-session',actorClientId:'controller',targetClientId:'controller',context:state.clients[0].context,action:'state.refresh',payload:{}};
    assert.equal((await request('command','controller',refresh)).body.status,'confirmed');
    const command={protocolVersion:1,operationId:'op1',sessionId:'test-session',actorClientId:'controller',targetClientId:'A',context:state.clients[1].context,action:'draft.update',payload:{exScore:123,missCount:0}};
    assert.equal((await request('command','controller',command)).status,400);
    const other={...command,targetClientId:'B',context:state.clients[2].context};
    assert.equal((await request('command','controller',{...other,context:{...other.context,transportEpoch:1}})).status,400);
    assert.equal((await request('command','controller',{...other,payload:{...other.payload,path:'C:/work/self'}})).status,400);
    assert.equal((await request('command','controller',other)).body.status,'confirmed');
    assert.equal((await request('command','controller',{...other,operationId:'op2'})).status,400);
    assert.deepEqual((await request('poll','A')).body,[]); // Only focus/read commands can ever target A.
    const serialized=JSON.stringify((await request('state')).body)+readFileSync(join(root,'controller-spool/state.json'),'utf8');
    for(const secret of Object.values(keys))assert.equal(serialized.includes(secret),false);
    const beforeEpoch=broker.state.clients.find(client=>client.manifest.clientId==='B').context.transportEpoch;
    broker.clientExited('B');
    const ended=(await request('state')).body.clients.find(client=>client.manifest.clientId==='B');
    assert.equal(ended.connection,'DISCONNECTED');assert.equal(ended.context.transportEpoch,beforeEpoch+1);
    assert.match(ended.lastError,/アプリが終了/);
    assert.ok(ended.actions.every(action=>!action.enabled));
    assert.equal((await request('report','B',{connection:'CONNECTED',transportEpoch:beforeEpoch})).status,400);
    assert.equal((await request('command','controller',{...other,operationId:'focus-exited',context:ended.context,action:'client.focus',payload:{}})).status,400);
  }finally{await broker.stop();await broker.close();}
});

// Exercise receipts through the existing adapter HTTP routes, including batched raw events.
async function receiptBroker(event=false){
  mkdirSync('testdata/runtime/dev-control',{recursive:true});
  const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/broker-receipt-'));
  const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const keys={controller:'c'.repeat(64),B:'b'.repeat(64)};
  const manifest={sessionId:'receipt-session',sourceHead:'0'.repeat(40),runtimeRoot:root,broker:{port},mode:event?'CASUAL':'ARENA',hostClientId:'B',apiBaseUrl:'http://127.0.0.1:19999',clients:[
    {clientId:'controller',playerId:null,role:'controller',transport:null},
    {clientId:'B',playerId:'b',role:'participant',transport:'real-client'},
  ]};
  const broker=await createBroker({manifest,keys});await broker.listen();
  const request=async(route,payload,clientId='controller')=>{
    const response=await fetch(`http://127.0.0.1:${port}/${route}`,{method:payload===undefined?'GET':'POST',headers:{Authorization:`Bearer ${keys[clientId]}`,'X-Dev-Control-Client':clientId},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
  };
  const before=event?{room_id:'room',generation:1,event_id:'event',revision:3,phase:'LOBBY',host:{player_id:'b',connected:true},participants:[{player_id:'b',connection_state:'CONNECTED',round_status:null}],current_playing_player_ids:[],current_round_id:null,selected_chart:null,selection_revision:0}
    :{room_id:'room',generation:1,current_match_id:null,room_state:'LOBBY',host_player_id:'b',settings:{mode:'ARENA'},players:[{player_id:'b',ready:false}],picks:[]};
  const after=event?{...before,revision:4,phase:'PLAYING',round_phase:'ACTIVE',current_round_id:'round-1',current_playing_player_ids:['b']}
    :{...before,players:[{player_id:'b',ready:true}]};
  const report=(events=[],snapshot=after)=>request('report',{normalSnapshot:event?null:snapshot,eventSnapshot:event?snapshot:null,connection:'CONNECTED',transportEpoch:1,events},'B');
  await report([],before);
  const client=broker.state.clients.find(c=>c.manifest.clientId==='B');
  const context=structuredClone(client.context);
  const command={protocolVersion:1,operationId:'receipt-op',sessionId:manifest.sessionId,actorClientId:'controller',targetClientId:'B',context,action:event?'event.start':'ready.set',payload:event?{}:{ready:true}};
  const message={room_id:'room',player_id:'b',client_msg_id:command.operationId,type:event?'EVENT_ACTION':'READY_SET',payload:event?{request_id:'request-1',action:'START_EVENT',generation:1}:{ready:true,generation:1}};
  const raw=(message,observedContext=context,stage='received')=>({stage,detail:{message,context:structuredClone(observedContext),...(stage==='sent'?{operationId:command.operationId}:{})}});
  const snapshot=(body=after,observedContext=context,envelopeRoom='room')=>raw({room_id:envelopeRoom,type:event?'EVENT_STATE':'ROOM_UPDATED',payload:event?{event_room_snapshot:body}:{room_state_snapshot:body}},observedContext);
  const ack=(requestId='request-1')=>raw({room_id:'room',type:'EVENT_ACTION_ACK',payload:{request_id:requestId,applied_revision:4}});
  await request('command',command);assert.equal((await request('poll',undefined,'B'))[0].operationId,command.operationId);
  await request('finish',{operationId:command.operationId,status:'sent'},'B');
  return {broker,root,context,after,report,raw,snapshot,ack,sent:raw(message,context,'sent'),status:()=>broker.state.operations.find(op=>op.operationId===command.operationId),close:async()=>{await broker.stop();await broker.close();}};
}

test('broker receipts reject pre-send raw and derived snapshots, then accept post-send evidence in either order',async t=>{
  for(const event of [false,true])for(const snapshotFirst of [false,true])await t.test(`${event?'event':'normal'} / snapshotFirst=${snapshotFirst}`,async()=>{
    const f=await receiptBroker(event);
    try{
      await f.report([f.snapshot(),...(event?[f.ack()]:[]),f.sent]);
      assert.notEqual(f.status().status,'confirmed');
      await f.report();assert.notEqual(f.status().status,'confirmed');
      if(event){
        await f.report(snapshotFirst?[f.snapshot()]:[f.ack()]);
        assert.notEqual(f.status().status,'confirmed');
        await f.report(snapshotFirst?[f.ack()]:[f.snapshot()]);
      }else await f.report([f.snapshot()]);
      assert.equal(f.status().status,'confirmed');
      const observations=readFileSync(join(f.root,'controller-spool/observations.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line)).filter(entry=>entry.sequence);
      assert.ok(observations.every((entry,i)=>Number.isSafeInteger(entry.sequence)&&entry.sequence>0&&(!i||entry.sequence>observations[i-1].sequence)));
      const send=observations.find(entry=>entry.stage==='sent');
      assert.ok(f.status().evidenceSequences.includes(send.sequence));
      const receiptSequences=f.status().evidenceSequences.filter(sequence=>observations.some(entry=>entry.sequence===sequence&&entry.stage==='received'));
      assert.ok(receiptSequences.length>0&&receiptSequences.every(sequence=>sequence>send.sequence));
      assert.ok(observations.filter(entry=>entry.stage==='received').every(entry=>entry.origin==='raw'));
      if(event){
        assert.equal(f.broker.state.clients.find(c=>c.manifest.clientId==='B').context.roundId,'round-1');
        assert.equal(observations.at(-1).context.roundId,null); // Raw context was captured before applying the new round.
      }
    }finally{await f.close();}
  });
});

test('broker receipts reject foreign raw context, envelope and snapshot scope',async t=>{
  const cases=[['session',{sessionId:'other'}],['target',{targetClientId:'other'}],['room',{roomId:'other'}],['generation',{roomGeneration:2}],['body room',{}, {room_id:'other'}],['body generation',{}, {generation:2}],['envelope',{}, {},'other']];
  for(const event of [false,true])for(const [label,context,body={},envelope='room'] of cases)await t.test(`${event?'event':'normal'} / ${label}`,async()=>{
    const f=await receiptBroker(event);
    try{
      await f.report([f.sent,...(event?[f.ack()]:[])]);
      await f.report([f.snapshot({...f.after,...body},{...f.context,...context},envelope)]);
      assert.notEqual(f.status().status,'confirmed');
      await f.report([f.snapshot()]);assert.equal(f.status().status,'confirmed');
    }finally{await f.close();}
  });
});

test('broker event ACK and ERROR belong to the actual post-send request',async t=>{
  for(const reject of [false,true])await t.test(reject?'matching ERROR rejects':'matching ACK confirms',async()=>{
    const f=await receiptBroker(true);
    const error=requestId=>f.raw({room_id:'room',type:'EVENT_ERROR',payload:{request_id:requestId,code:'BAD_STATE'}});
    try{
      await f.report([error('request-1'),f.ack(),f.sent]);
      await f.report([f.snapshot(),f.ack('other-request'),error('other-request'),f.ack(null),error(null)]);
      assert.notEqual(f.status().status,'confirmed');assert.notEqual(f.status().status,'rejected');
      for(const change of [{sessionId:'other'},{targetClientId:'other'},{roomId:'other'},{roomGeneration:2}]){
        const context={...f.context,...change};
        await f.report([{...f.ack(),detail:{...f.ack().detail,context}},{...error('request-1'),detail:{...error('request-1').detail,context}}]);
        assert.notEqual(f.status().status,'confirmed');assert.notEqual(f.status().status,'rejected');
      }
      await f.report([reject?error('request-1'):f.ack()]);
      assert.equal(f.status().status,reject?'rejected':'confirmed');
      await f.report([f.ack(),f.snapshot()]);assert.equal(f.status().status,reject?'rejected':'confirmed');
    }finally{await f.close();}
  });
});
