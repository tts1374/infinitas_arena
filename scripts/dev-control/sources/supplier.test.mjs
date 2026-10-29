import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSourceSupplier } from './supplier.mjs';

function fixture(source) {
  const root=mkdtempSync(join(tmpdir(),'dev-control-source-'));
  const a=join(root,'A'), b=join(root,'B'), c=join(root,'C');
  for(const path of [a,b,c])mkdirSync(path);
  const clients=[{clientId:'A',role:'self',transport:'real-client',source,fixtureRoot:null,readOnlySource:{paths:[a],port:8767},storageRoot:a,spoolRoot:a},
    {clientId:'B',role:'participant',transport:'real-client',source,fixtureRoot:b,storageRoot:b,spoolRoot:b,sourcePort:18767,sourceControlFile:join(b,'today-updates.json')},
    {clientId:'C',role:'participant',transport:'real-client',source,fixtureRoot:c,storageRoot:c,spoolRoot:c,sourcePort:18768}];
  const manifest={runtimeRoot:root,clients};
  return {root,a,b,c,manifest,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
const expectedKey={play_style:'SP',difficulty:'ANOTHER',title_search_key:'Song',chart_id:42};
const request=context=>({context,expectedKey,title:'Song',exScore:2000,missCount:10});
for(const source of ['inf-notebook','reflux','daken_counter_v3']) {
  test(`${source}: baseline, exact input, invalidation, stop and self isolation`,async()=>{
    const f=fixture(source);let context={round:1};
    try {
      const supplier=await createSourceSupplier({manifest:f.manifest,clientId:'B',verifyContext:value=>value.round===context.round});
      assert.equal(existsSync(join(f.b,'supplier-state.json')),false,'constructor must not reset a running source');
      await supplier.initializeBaseline();
      if(source==='reflux')assert.deepEqual(JSON.parse(readFileSync(join(f.b,'latest.json'),'utf8')),{},'baseline is not a fabricated play');
      const input=await supplier.prepareInput(request(context));
      assert.equal((await supplier.supply(input)).status,'input-written');
      const file=source==='inf-notebook'?'records/summary.json':source==='reflux'?'latest.json':'today-updates.json';
      const payload=JSON.parse(readFileSync(join(f.b,file),'utf8'));
      if(source==='inf-notebook')assert.equal(payload.musics.Song.SP.ANOTHER.latest.score,2000);
      else if(source==='reflux')assert.equal(payload.exscore,'2000');
      else {assert.match(payload.data.items[0].chart_id,/^[0-9a-f]{64}$/);assert.equal(payload.data.items[0].score,2000);}
      await assert.rejects(supplier.supply(input),/expired/,'one arm must not supply twice');
      context={round:2};await supplier.invalidate(context);
      if(source==='reflux')assert.deepEqual(JSON.parse(readFileSync(join(f.b,'latest.json'),'utf8')),{},'round invalidation must not emit a fake alias');
      await assert.rejects(supplier.supply(input),/expired/);
      await supplier.stop();await assert.rejects(supplier.prepareInput(request(context)),/expired/);
      assert.equal(existsSync(join(f.a,file)),false);assert.equal(existsSync(join(f.c,file)),false);
    } finally { f.cleanup(); }
  });
}
test('v3: same chart and EX/MISS creates legitimate different play tuple, not timestamp-only change',async()=>{
  const f=fixture('daken_counter_v3');const context={round:1};
  try {
    const supplier=await createSourceSupplier({manifest:f.manifest,clientId:'B',verifyContext:()=>true});await supplier.initializeBaseline();
    const first=await supplier.prepareInput(request(context));await supplier.supply(first);
    const a=JSON.parse(readFileSync(join(f.b,'today-updates.json'),'utf8')).data.items[0];
    const second=await supplier.prepareInput(request(context));await supplier.supply(second);
    const b=JSON.parse(readFileSync(join(f.b,'today-updates.json'),'utf8')).data.items[0];
    assert.equal(a.score,b.score);assert.equal(a.bp,b.bp);assert.notEqual(a.playspeed,b.playspeed);
    await supplier.invalidate();assert.deepEqual(JSON.parse(readFileSync(join(f.b,'today-updates.json'),'utf8')).data.items,[]);
  } finally {f.cleanup();}
});
test('reject self, legacy, foreign path, overlapping port and control-file aliases',async()=>{
  const f=fixture('daken_counter_v3');const options={manifest:f.manifest,clientId:'B',verifyContext:()=>true};
  try {
    await assert.rejects(createSourceSupplier({...options,clientId:'A'}),/Unsupported/);
    f.manifest.clients[1].source='inf_daken_counter';await assert.rejects(createSourceSupplier(options),/Unsupported/);
    f.manifest.clients[1].source='daken_counter_v3';
    f.manifest.clients[1].fixtureRoot=f.c;await assert.rejects(createSourceSupplier(options),/Protected/);
    f.manifest.clients[1].fixtureRoot=f.b;f.manifest.clients[1].sourcePort=8767;await assert.rejects(createSourceSupplier(options),/port/);
    f.manifest.clients[1].sourcePort=18767;f.manifest.clients[1].sourceControlFile=join(f.b,'other.json');await assert.rejects(createSourceSupplier(options),/mismatch/);
  } finally {f.cleanup();}
});
test('context invalidation while waiting for the next second cancels without source input',async()=>{
  const f=fixture('inf-notebook');let current=true;
  try {
    writeFileSync(join(f.b,'supplier-state.json'),JSON.stringify({lastTimestampMs:Date.now(),playSequence:0}));
    const supplier=await createSourceSupplier({manifest:f.manifest,clientId:'B',verifyContext:()=>current});await supplier.initializeBaseline();
    const pending=supplier.prepareInput(request({round:1}));current=false;await supplier.invalidate();
    await assert.rejects(pending,/expired/);
    assert.deepEqual(JSON.parse(readFileSync(join(f.b,'records/summary.json'),'utf8')),{musics:{}});
  } finally {f.cleanup();}
});

test('a broker supplier instance preserves launcher baseline and already supplied input',async()=>{
  const f=fixture('daken_counter_v3');
  try {
    const options={manifest:f.manifest,clientId:'B',verifyContext:()=>true};
    const launcher=await createSourceSupplier(options);await launcher.initializeBaseline();
    const broker=await createSourceSupplier(options);
    const first=await broker.prepareInput(request({round:1}));await broker.supply(first);
    const supplied=readFileSync(join(f.b,'today-updates.json'),'utf8');
    const resumed=await createSourceSupplier(options);
    assert.equal(readFileSync(join(f.b,'today-updates.json'),'utf8'),supplied,'constructing a supplier must not roll back a watched file');
    const second=await resumed.prepareInput(request({round:2}));
    assert.notEqual(second.sourceFingerprint,first.sourceFingerprint,'resumed instance retains consumed play variants');
    await resumed.supply(second);
  } finally {f.cleanup();}
});
