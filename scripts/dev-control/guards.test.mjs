import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { canonicalWritePath, readManifest, secretMatches } from './guards.mjs';
import { emptyContext, validateCommand, sameContext } from './protocol.mjs';

mkdirSync(join(process.cwd(),'testdata/runtime/dev-control'),{recursive:true});
const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/guard-'));
test('writer rejects relative/traversal/UNC/protected self/junction paths',()=>{
  const allowed=join(root,'participant');mkdirSync(allowed);
  const outside=join(root,'self');mkdirSync(outside);
  assert.equal(canonicalWritePath(allowed,join(allowed,'new.json')),join(allowed,'new.json'));
  assert.throws(()=>canonicalWritePath(allowed,'relative.json'));
  assert.throws(()=>canonicalWritePath(allowed,join(allowed,'..','self','result.json')));
  assert.throws(()=>canonicalWritePath(allowed,'\\\\host\\share\\file'));
  assert.throws(()=>canonicalWritePath(allowed,join(allowed,'new.json'),[allowed]));
  symlinkSync(outside,join(allowed,'linked'),'junction');
  assert.throws(()=>canonicalWritePath(allowed,join(allowed,'linked','new.json')));
});
test('secret authentication is bounded and exact',()=>{
  assert.equal(secretMatches('a'.repeat(64),'a'.repeat(64)),true);
  assert.equal(secretMatches('a'.repeat(64),'b'.repeat(64)),false);
  assert.equal(secretMatches('short','short'),false);
  assert.equal(secretMatches('a'.repeat(64),undefined),false);
});
test('private commands reject unknown versions/actions/fields and stale identities',()=>{
  const context=emptyContext('s1','B');
  const command={protocolVersion:1,operationId:'op1',sessionId:'s1',actorClientId:'controller',targetClientId:'B',context,action:'draft.update',payload:{exScore:1234,missCount:0}};
  assert.equal(validateCommand(command),command);
  assert.throws(()=>validateCommand({...command,protocolVersion:2}));
  assert.throws(()=>validateCommand({...command,action:'raw.ws'}));
  assert.throws(()=>validateCommand({...command,payload:{...command.payload,path:'C:/work/self'}}));
  assert.throws(()=>validateCommand({...command,context:{...context,roomId:undefined}}));
  assert.throws(()=>validateCommand({...command,context:{...context,targetClientId:'A'}}));
  assert.throws(()=>validateCommand({...command,payload:{exScore:-1,missCount:null}}));
  assert.equal(sameContext(context,{...context,transportEpoch:1}),false);
});
test('manifest rejects legacy and self fixture ownership',()=>{
  const sessionId=`s20261024010000-${randomBytes(4).toString('hex')}`;
  const sessionRoot=join(process.cwd(),'testdata/runtime/dev-control',sessionId);mkdirSync(sessionRoot);
  const controller=join(sessionRoot,'controller'),self=join(sessionRoot,'self-profile');mkdirSync(controller);mkdirSync(self);
  const manifest={protocolVersion:1,sessionId,runtimeRoot:sessionRoot,repoRoot:process.cwd(),sourceHead:'0'.repeat(40),broker:{host:'127.0.0.1',port:19001},launch:{selfPort:8767},clients:[
    {clientId:'controller',identifier:`com.infinitas.arena.dev.${sessionId}.controller`,windowLabel:'dev-control',transport:null,playerId:null,role:'controller',source:null,storageRoot:controller,spoolRoot:controller,fixtureRoot:null,sourcePort:null},
    {clientId:'A',identifier:`com.infinitas.arena.dev.${sessionId}.a`,windowLabel:'main',transport:'real-client',playerId:'a',role:'self',source:'daken_counter_v3',storageRoot:self,spoolRoot:self,fixtureRoot:null,sourcePort:8767},
  ]};
  const path=join(sessionRoot,'manifest.json');writeFileSync(path,JSON.stringify(manifest));assert.equal(readManifest(path).sessionId,sessionId);
  manifest.clients[0].identifier='com.infinitas.arena.client';writeFileSync(path,JSON.stringify(manifest));assert.throws(()=>readManifest(path));
  manifest.clients[0].identifier=`com.infinitas.arena.dev.${sessionId}.controller`;
  manifest.clients[1].fixtureRoot=self;writeFileSync(path,JSON.stringify(manifest));assert.throws(()=>readManifest(path));
  manifest.clients[1].fixtureRoot=null;manifest.clients[1].source='inf_daken_counter';writeFileSync(path,JSON.stringify(manifest));assert.throws(()=>readManifest(path));
});
