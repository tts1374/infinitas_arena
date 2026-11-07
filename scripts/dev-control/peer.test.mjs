import test from 'node:test';
import assert from 'node:assert/strict';
import { DevControlPeer } from './peer.mjs';
import { emptyContext } from './protocol.mjs';

test('headless normal/event adapters send the existing product envelopes with frozen round identity',()=>{
  for(const mode of ['ARENA','BPL','BPL4','CASUAL','TOURNAMENT']){
    const sent=[];
    const peer=new DevControlPeer({manifest:{mode,apiBaseUrl:'http://127.0.0.1:19999'},client:{clientId:'B',playerId:'b'},roomId:'room',joinCode:'CODE1234',onSent:message=>sent.push(message),onConnection:()=>{}});
    peer.socket={readyState:1,send:()=>{}};
    const context={...emptyContext('s','B'),roomId:'room',roomGeneration:3,matchId:'match',eventId:'event',roundIndex:2,roundId:'round',selectionRevision:4,expectedKey:{play_style:'SP',difficulty:'ANOTHER',title_search_key:'song'}};
    const dispatch=(action,payload={})=>peer.dispatch({action,operationId:'operation',context,payload},{exScore:0,missCount:7},{settings:{win_metric:'SCORE'}});
    dispatch('result.send');
    const message=sent.at(-1);
    assert.equal(message.room_id,'room');assert.equal(message.player_id,'b');assert.equal(message.client_msg_id,'operation');
    assert.equal(message.payload.generation,3);assert.equal(message.payload.request_id,'operation');assert.equal(message.payload.metric_value,0);
    assert.deepEqual(message.payload.observed_key,context.expectedKey);
    if(['CASUAL','TOURNAMENT'].includes(mode)){
      assert.equal(message.type,'EVENT_ACTION');assert.equal(message.payload.action,'SUBMIT');assert.equal(message.payload.round_id,'round');assert.equal(message.payload.event_id,'event');
      dispatch('event.confirmPick',{chartKey:'chart'});assert.equal(sent.at(-1).payload.selection_revision,4);
      assert.equal(sent.at(-1).payload.chart_key,'chart');assert.equal('ready' in sent.at(-1).payload,false);
      assert.throws(()=>dispatch('ready.set',{ready:true}));
    }else{
      assert.equal(message.type,'RESULT_SUBMIT');assert.equal(message.payload.round_index,2);
      dispatch('ready.set',{ready:true});assert.equal(sent.at(-1).type,'READY_SET');assert.equal(sent.at(-1).payload.ready,true);
      dispatch('pick.submit',{chartKey:'chart'});assert.equal(sent.at(-1).payload.pick_chart_key,'chart');
    }
  }
});
