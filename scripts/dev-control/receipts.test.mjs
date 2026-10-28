import test from 'node:test';
import assert from 'node:assert/strict';
import { ReceiptLedger } from './receipts.mjs';
import { emptyContext } from './protocol.mjs';

function fixture(event=false,action='result.send'){
  const key={play_style:'SP',difficulty:'ANOTHER',title_search_key:'song',chart_id:1};
  const context={...emptyContext('session','B'),transportEpoch:1,roomId:'room',roomGeneration:1,matchId:event?null:'match',eventId:event?'event':null,roundIndex:event?null:0,roundId:event?'round':null,expectedKey:key,selectionRevision:event?1:null};
  const client={manifest:{clientId:'B',playerId:'b'},context:structuredClone(context),connection:'CONNECTED',normalSnapshot:null,eventSnapshot:null};
  const operation={command:{operationId:'op',targetClientId:'B',context,action,payload:{ready:true}},result:{status:'sent',evidenceSequences:[]},claimed:true};
  const ledger=new ReceiptLedger({commands:new Map([['op',operation]])});
  const sent={room_id:'room',player_id:'b',client_msg_id:'message-id',type:event?'EVENT_ACTION':action==='ready.set'?'READY_SET':'RESULT_SUBMIT',payload:{request_id:'actual-request',...(event?{action:'SUBMIT'}:{}),metric_value:1000}};
  const confirm={room_id:'room',type:'PLAYER_ROUND_CONFIRMED',payload:{player_id:'b',round_index:0,status:'PLAYED',metric_value:1000}};
  const ack={room_id:'room',type:'EVENT_ACTION_ACK',payload:{request_id:'actual-request',applied_revision:4}};
  const normal={room_id:'room',generation:1,current_match_id:'match',room_state:'PLAYING',frozen_rounds:[{round_index:0,expected_key:key}],current_round:{round_index:0,confirmed:[confirm.payload]}};
  const eventSnapshot={room_id:'room',generation:1,event_id:'event',revision:4,current_round_id:'round',participants:[{player_id:'b',round_status:'SUBMITTED'}]};
  return {ledger,client,operation,context,sent,confirm,ack,normal,eventSnapshot};
}

test('normal receipt requires actual send, matching confirmation and snapshot in either order',()=>{
  for(const snapshotFirst of [false,true]){
    const f=fixture();f.client.normalSnapshot=f.normal;
    f.ledger.sent(f.client,f.sent,'op',f.context,1);
    if(snapshotFirst)f.ledger.snapshot(f.client,2);else f.ledger.received(f.client,f.confirm,f.context,2);
    assert.equal(f.operation.result.status,'sent');
    if(snapshotFirst)f.ledger.received(f.client,f.confirm,f.context,3);else f.ledger.snapshot(f.client,3);
    assert.equal(f.operation.result.status,'confirmed');
    f.ledger.received(f.client,f.confirm,f.context,4);assert.equal(f.operation.result.status,'confirmed');
    assert.ok(f.operation.result.evidenceSequences.includes(1));
  }
});

test('normal last-player and final-round transitions remain confirmable without an old current_round snapshot',()=>{
  for(const final of [false,true]){
    const f=fixture();f.ledger.sent(f.client,f.sent,'op',f.context,1);
    f.ledger.received(f.client,f.confirm,f.context,2);
    f.ledger.received(f.client,{room_id:'room',type:'ROUND_ENDED',payload:{round_index:0}},f.context,3);
    if(final)f.ledger.received(f.client,{room_id:'room',type:'RESULT_READY',payload:{summary:{match_id:'match'},per_round:{rounds:[{round_index:0,results:[f.confirm.payload]}]}}},f.context,4);
    f.client.context={...f.context,roundIndex:final?null:1};
    f.client.normalSnapshot={...f.normal,room_state:final?'RESULT':'PLAYING',result_ready:final,current_round:final?null:{round_index:1,confirmed:[]}};
    f.ledger.snapshot(f.client,5);assert.equal(f.operation.result.status,'confirmed');
  }
});

test('event ACK and same-round status resolve timeout uncertainty in either order without another send',()=>{
  for(const snapshotFirst of [false,true]){
    const f=fixture(true);f.client.eventSnapshot=f.eventSnapshot;
    f.ledger.sent(f.client,f.sent,'op',f.context,1);f.operation.result.status='unknown';
    if(snapshotFirst)f.ledger.snapshot(f.client,2);else f.ledger.received(f.client,f.ack,f.context,2);
    assert.equal(f.operation.result.status,'unknown');
    if(snapshotFirst)f.ledger.received(f.client,f.ack,f.context,3);else f.ledger.snapshot(f.client,3);
    assert.equal(f.operation.result.status,'confirmed');assert.equal(f.ledger.entry(f.operation).sent.length,1);
  }
});

test('foreign context, missing sent ID and rejected event never become confirmed',()=>{
  for(const invalid of ['room','generation','key','id']){
    const f=fixture(true);f.client.eventSnapshot=f.eventSnapshot;
    const context={...f.context,...(invalid==='room'?{roomId:'other'}:invalid==='generation'?{roomGeneration:2}:invalid==='key'?{expectedKey:{...f.context.expectedKey,chart_id:2}}:{})};
    f.ledger.sent(f.client,{...f.sent,...(invalid==='id'?{client_msg_id:null}:{})},'op',context,1);
    f.ledger.received(f.client,f.ack,f.context,2);f.ledger.snapshot(f.client,3);assert.equal(f.operation.result.status,'sent',invalid);
  }
  const f=fixture(true);f.client.eventSnapshot=f.eventSnapshot;f.ledger.sent(f.client,f.sent,'op',f.context,1);
  f.ledger.received(f.client,{room_id:'room',type:'EVENT_ERROR',payload:{request_id:'actual-request',code:'BAD_STATE'}},f.context,2);
  f.ledger.received(f.client,f.ack,f.context,3);f.ledger.snapshot(f.client,4);assert.equal(f.operation.result.status,'rejected');
});

test('normal ERROR stays unknown; Ready snapshot and local connection evidence release general operation waits',()=>{
  const f=fixture();f.ledger.sent(f.client,f.sent,'op',f.context,1);
  f.ledger.received(f.client,{room_id:'room',type:'ERROR',payload:{code:'BAD_STATE'}},f.context,2);assert.equal(f.operation.result.status,'unknown');
  const ready=fixture(false,'ready.set');ready.client.normalSnapshot={...ready.normal,room_state:'LOBBY',players:[{player_id:'b',ready:true}]};
  ready.ledger.sent(ready.client,ready.sent,'op',ready.context,1);ready.ledger.snapshot(ready.client,2);assert.equal(ready.operation.result.status,'confirmed');
  const disconnected=fixture(false,'participant.disconnect');disconnected.client.context.transportEpoch=2;disconnected.client.connection='DISCONNECTED';
  disconnected.ledger.snapshot(disconnected.client,1);assert.equal(disconnected.operation.result.status,'confirmed');
});

const receiptKinds=['normal result','event result','normal ready','event start'];
function receiptFixture(kind){
  const f=fixture(kind.startsWith('event'),kind==='normal ready'?'ready.set':kind==='event start'?'event.start':'result.send');
  f.client.normalSnapshot={...f.normal,players:[{player_id:'b',ready:true}]};
  f.client.eventSnapshot={...f.eventSnapshot,phase:'PLAYING'};
  return f;
}
function notify(f,kind,sequence=11){
  if(kind.startsWith('event'))f.ledger.received(f.client,f.ack,f.context,sequence);
  else if(kind==='normal result')f.ledger.received(f.client,f.confirm,f.context,sequence);
}
function rawSnapshot(f,kind,sequence){
  f.ledger.received(f.client,{room_id:'room',type:'STATE_SNAPSHOT',payload:kind.startsWith('event')?{event_room_snapshot:f.client.eventSnapshot}:{room_state_snapshot:f.client.normalSnapshot}},f.context,sequence);
}

test('snapshot evidence must have a positive safe sequence strictly after its send',async t=>{
  for(const kind of receiptKinds)await t.test(kind,()=>{
    for(const sequence of [null,undefined,NaN,Infinity,1.5,0,-1,9,10]){
      const f=receiptFixture(kind);f.ledger.sent(f.client,f.sent,'op',f.context,10);notify(f,kind);
      f.ledger.snapshot(f.client,sequence);
      assert.equal(f.operation.result.status,'sent',String(sequence));
    }
  });
});

test('raw snapshots before the send sequence cannot confirm',async t=>{
  for(const kind of receiptKinds)await t.test(kind,()=>{
    for(const sequence of [9,10]){
      const f=receiptFixture(kind);f.ledger.sent(f.client,f.sent,'op',f.context,10);notify(f,kind);
      rawSnapshot(f,kind,sequence);assert.equal(f.operation.result.status,'sent',String(sequence));
    }
  });
});

test('confirmation and ACK evidence must follow their own send sequence',async t=>{
  for(const kind of ['normal result','event result','event start'])await t.test(kind,()=>{
    for(const sequence of [null,0,9,10]){
      const f=receiptFixture(kind);f.ledger.sent(f.client,f.sent,'op',f.context,10);
      f.ledger.snapshot(f.client,12);notify(f,kind,sequence);
      assert.equal(f.operation.result.status,'sent',String(sequence));
    }
  });
});

test('snapshot context must retain room, generation, session and target identity',async t=>{
  for(const kind of receiptKinds)await t.test(kind,()=>{
    for(const changed of [{roomId:'other'},{roomGeneration:2},{sessionId:'other'},{targetClientId:'other'}]){
      const f=receiptFixture(kind);f.ledger.sent(f.client,f.sent,'op',f.context,10);notify(f,kind);
      f.client.context={...f.context,...changed};f.ledger.snapshot(f.client,12);
      assert.equal(f.operation.result.status,'sent',JSON.stringify(changed));
    }
  });
});

test('snapshot bodies must retain the command room and generation',async t=>{
  for(const kind of receiptKinds)await t.test(kind,()=>{
    for(const changed of [{room_id:'other'},{generation:2}]){
      for(const raw of [false,true]){
        const f=receiptFixture(kind);f.ledger.sent(f.client,f.sent,'op',f.context,10);notify(f,kind);
        const field=kind.startsWith('event')?'eventSnapshot':'normalSnapshot';
        f.client[field]={...f.client[field],...changed};
        if(raw)rawSnapshot(f,kind,12);else f.ledger.snapshot(f.client,12);
        assert.equal(f.operation.result.status,'sent',JSON.stringify({changed,raw}));
      }
    }
  });
});

test('derived non-authoritative snapshots never confirm',async t=>{
  for(const kind of receiptKinds)await t.test(kind,()=>{
    const f=receiptFixture(kind);f.ledger.sent(f.client,f.sent,'op',f.context,10);notify(f,kind);
    f.ledger.snapshot(f.client,12,false);assert.equal(f.operation.result.status,'sent');
  });
});

test('post-send raw snapshot and notification remain order independent',async t=>{
  for(const kind of receiptKinds)await t.test(kind,()=>{
    for(const snapshotFirst of [false,true]){
      const f=receiptFixture(kind);f.ledger.sent(f.client,f.sent,'op',f.context,10);
      if(snapshotFirst){rawSnapshot(f,kind,11);notify(f,kind,12);}
      else{notify(f,kind,11);rawSnapshot(f,kind,12);}
      assert.equal(f.operation.result.status,'confirmed');
    }
  });
});

test('ACK cannot borrow an earlier snapshot from before the matching retry send',()=>{
  const f=receiptFixture('event result');f.ledger.sent(f.client,f.sent,'op',f.context,10);
  f.ledger.snapshot(f.client,11);
  f.ledger.sent(f.client,{...f.sent,client_msg_id:'retry-id',payload:{...f.sent.payload,request_id:'retry-request'}},'op',f.context,12);
  f.ledger.received(f.client,{...f.ack,payload:{...f.ack.payload,request_id:'retry-request'}},f.context,13);
  assert.equal(f.operation.result.status,'sent');
  f.ledger.snapshot(f.client,14);assert.equal(f.operation.result.status,'confirmed');
});

test('local disconnect and reconnect require matching scope and a newer transport epoch',async t=>{
  for(const action of ['participant.disconnect','participant.reconnect'])await t.test(action,()=>{
    const connection=action==='participant.disconnect'?'DISCONNECTED':'CONNECTED';
    for(const changed of [{roomGeneration:2},{sessionId:'other'},{targetClientId:'other'},{roomId:'other'}]){
      const f=fixture(false,action);f.client.connection=connection;
      f.client.context={...f.context,transportEpoch:2,...changed};f.ledger.snapshot(f.client,1,false);
      assert.equal(f.operation.result.status,'sent',JSON.stringify(changed));
    }
    const f=fixture(false,action);f.client.connection=connection;
    f.ledger.snapshot(f.client,1,false);assert.equal(f.operation.result.status,'sent');
    f.client.context.transportEpoch=2;f.ledger.snapshot(f.client,2,false);
    assert.equal(f.operation.result.status,'confirmed');
  });
});

test('event ACK needs an actual request ID, including the client message ID fallback',()=>{
  const f=receiptFixture('event result');delete f.sent.payload.request_id;
  f.ledger.sent(f.client,f.sent,'op',f.context,10);f.ledger.snapshot(f.client,11);
  f.ledger.received(f.client,{...f.ack,payload:{applied_revision:4}},f.context,12);
  assert.equal(f.operation.result.status,'sent');
  f.ledger.received(f.client,{...f.ack,payload:{request_id:f.sent.client_msg_id,applied_revision:4}},f.context,13);
  assert.equal(f.operation.result.status,'confirmed');
});
