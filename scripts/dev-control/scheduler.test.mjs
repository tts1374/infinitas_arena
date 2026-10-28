import test from 'node:test';
import assert from 'node:assert/strict';
import { ReservationScheduler } from './scheduler.mjs';
import { emptyContext } from './protocol.mjs';

test('ten-second dispatch is single-owner; every context field invalidates old work',async()=>{
  for(const field of ['transportEpoch','roomGeneration','matchId','eventId','roundIndex','roundId','expectedKey','selectionRevision','policyRevision','valueRevision']){
    let context=emptyContext('session','B'),callback;const sent=[],cancelled=[];
    const clock={setTimeout:(fn,delay)=>{assert.equal(delay,10000);callback=fn;return 1;},clearTimeout:()=>{}};
    const scheduler=new ReservationScheduler({clock,readContext:()=>context,onDispatch:c=>sent.push(c),onCancel:c=>cancelled.push(c)});
    const command={operationId:'op',targetClientId:'B',context:structuredClone(context)};
    scheduler.reserve(command,10000);scheduler.reserve(command,10000);
    context={...context,[field]:field.endsWith('Id')?'changed':field==='expectedKey'?{play_style:'SP',difficulty:'ANOTHER',title_search_key:'changed'}:1};
    await callback();assert.equal(sent.length,0);assert.equal(cancelled.length,1);
  }
});
test('cancel and stop never revive a reservation',async()=>{
  const context=emptyContext('s','B');let callback;let sent=0;
  const scheduler=new ReservationScheduler({clock:{setTimeout:fn=>{callback=fn;return 1;},clearTimeout:()=>{}},readContext:()=>context,onDispatch:()=>sent++,onCancel:()=>{}});
  scheduler.reserve({operationId:'op',targetClientId:'B',context},10000);assert.equal(scheduler.cancel('op'),true);assert.equal(scheduler.cancel('op'),false);
  scheduler.stop();await callback();assert.equal(sent,0);assert.throws(()=>scheduler.reserve({operationId:'next'},10000));
});
