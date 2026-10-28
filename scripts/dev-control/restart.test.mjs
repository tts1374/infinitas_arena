import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyRestartOptions, readRestartOptions, validateRestartOptions } from './restart.mjs';

const options={mode:'ARENA',hostClientId:'B',opponentSource:'reflux',visibleOpponents:1,playerCount:4};
test('restart changes only closed launch choices and preserves self references',()=>{
  const launch={selfSource:'daken_counter_v3',selfPort:8767,selfDirectory:'readonly-source',mode:'BPL',hostClient:'A',opponentSource:'inf-notebook',visibleOpponents:1,playerCount:2};
  const original=structuredClone(launch);
  const result=applyRestartOptions(launch,options);
  assert.equal(result.mode,'ARENA');assert.equal(result.hostClient,'B');assert.equal(result.opponentSource,'reflux');
  for(const field of ['selfSource','selfPort','selfDirectory'])assert.equal(result[field],launch[field]);
  assert.deepEqual(launch,original);
  for(const extra of [{selfDirectory:'C:/private'},{apiBaseUrl:'https://example.com'},{extraArgs:['-Command','exit']}])assert.throws(()=>validateRestartOptions({...options,...extra}));
  for(const invalid of [{visibleOpponents:0},{visibleOpponents:4},{visibleOpponents:1.5},{playerCount:20},{mode:'BPL'},{hostClientId:'C'},{opponentSource:'inf_daken_counter'}])assert.throws(()=>validateRestartOptions({...options,...invalid}));
});

test('restart request file must be in the original session and bind its session identity',()=>{
  mkdirSync('testdata/runtime/dev-control',{recursive:true});
  const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/restart-'));
  const manifest=join(root,'manifest.json');writeFileSync(manifest,'{}');
  const file=join(root,'restart-options-1.json');
  const request={protocolVersion:1,sessionId:'session',options};writeFileSync(file,JSON.stringify(request));
  assert.deepEqual(readRestartOptions(manifest,file,'session'),options);
  assert.throws(()=>readRestartOptions(manifest,file,'other'));
  const child=join(root,'child');mkdirSync(child);const foreign=join(child,'restart-options-1.json');writeFileSync(foreign,JSON.stringify(request));
  assert.throws(()=>readRestartOptions(manifest,foreign,'session'));
  writeFileSync(file,JSON.stringify({...request,launcher:'C:/other.ps1'}));assert.throws(()=>readRestartOptions(manifest,file,'session'));
});
