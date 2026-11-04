import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,renameSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { createEvidenceWriter, evidenceManifest, writeSessionFile } from './evidence.mjs';
import { verifyStopped, stopOfflineRuntime } from './offline.mjs';
import { emptyContext, canonicalJson } from './protocol.mjs';

test('interrupted state or authority replacement retains the last readable file, and retry succeeds',()=>{
  const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/atomic-'));
  for(const name of ['state.json','manifest.json']) {
    const path=join(root,name),before=JSON.stringify({revision:1}),after=JSON.stringify({revision:2});
    writeSessionFile(root,path,before);
    assert.throws(()=>writeSessionFile(root,path,after,()=>{throw new Error('injected replacement failure');}),/replacement failure/);
    assert.equal(readFileSync(path,'utf8'),before);
    writeSessionFile(root,path,after);assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),{revision:2});
    let attempts=0;
    writeSessionFile(root,path,before,(source,target)=>{if(attempts++<2)throw Object.assign(new Error('temporary reader'),{code:'EPERM'});renameSync(source,target);});
    assert.equal(attempts,3);assert.equal(readFileSync(path,'utf8'),before);
  }
});

test('every structured persistence boundary removes authentication values while preserving exact correlation IDs',async()=>{
  const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/redaction-'));
  const writer=createEvidenceWriter(root,['known-secret']),file=join(root,'observations.jsonl');
  const value={operationId:'op',client_msg_id:'msg',request_id:'req',context:{roomGeneration:4,roundId:'round'},nested:{host_token:'host-secret',resumeToken:'resume-secret',rejoin_token:'rejoin-secret',authorization:'Bearer auth-secret'},diagnostic:'known-secret'};
  writer.write(file,value,true);
  const stream=new PassThrough();writer.pipe(stream,file);
  stream.write('{"request_id":"req2","token":"split-');stream.end('secret"}\nplain unknown-token-value\n');
  await new Promise(resolve=>stream.once('end',resolve));
  const text=readFileSync(file,'utf8');
  for(const secret of ['known-secret','host-secret','resume-secret','rejoin-secret','auth-secret','split-secret','unknown-token-value'])assert.equal(text.includes(secret),false,secret);
  for(const id of ['op','msg','req','req2','round'])assert.ok(text.includes(id));
});

test('evidence manifest never copies original source/config/history, writer read-back and write failures stay observable',()=>{
  const root=mkdtempSync(join(process.cwd(),'testdata/runtime/dev-control/evidence-'));
  const writer=createEvidenceWriter(root);const manifest={sessionId:'session',sourceHead:'h',mode:'ARENA',hostClientId:'A',launch:{selfDirectory:'private-source'},clients:[{clientId:'A',role:'self',transport:'real-client',source:'reflux',readOnlySource:{paths:['private-source']},settings:{secret:'private-settings'}}]};
  const projected=evidenceManifest(manifest);writer.write(join(root,'manifest.json'),projected);
  const text=readFileSync(join(root,'manifest.json'),'utf8');assert.equal(text.includes('private-source'),false);assert.equal(text.includes('private-settings'),false);
  writeFileSync(join(root,'not-directory'),'x');assert.throws(()=>writer.write(join(root,'not-directory','failure.json'),{}));
});

test('stopped requires immutable broker plus every owned runtime process and all session ports to be gone',()=>{
  const owner={pid:100,createdAt:'created',executablePath:'node.exe',ports:[19000]};
  const participant={pid:200,createdAt:'created',executablePath:'client.exe',kind:'client',ports:[]};
  const controller={pid:300,createdAt:'created',executablePath:'controller.exe',kind:'controller',ports:[]};
  const manifest={broker:{port:19000},runtimeOwner:owner,ownedProcesses:[participant,controller]};const state={lifecycle:'stopping',stop:{errors:[]}};
  for(const [processes,ports] of [[[owner],[]],[[participant],[]],[[],[{port:19000,pid:999}]],[[{...owner,createdAt:'reused'}],[]]])assert.equal(verifyStopped(manifest,state,processes,ports).lifecycle,'failed');
  const safe=verifyStopped(manifest,state,[controller],[]);assert.equal(safe.lifecycle,'stopped');assert.equal(safe.stop.processesVerified,true);assert.equal(safe.stop.portsVerified,true);
  assert.equal(verifyStopped(manifest,state,[controller,{...participant,createdAt:'foreign-reuse'}],[]).lifecycle,'stopped');
  for(const unknown of [{...participant,executablePath:null},{...participant,createdAt:null},{...participant,executablePath:''}])assert.equal(verifyStopped(manifest,state,[unknown],[]).lifecycle,'failed');
  assert.throws(()=>verifyStopped({...manifest,runtimeOwner:null},state,[],[]));
  const running={lifecycle:'running',stop:{phase:'idle',requestedAt:null,errors:[]}};
  assert.throws(()=>verifyStopped(manifest,running,[owner,participant],[]),/shutdown was not requested/);
  assert.equal(running.lifecycle,'running');
  assert.equal(verifyStopped(manifest,running,[controller],[]).lifecycle,'stopped');
  assert.equal(verifyStopped(manifest,running,[participant,controller],[]).recoveryRequired,true);
});

test('only the correlated local stop operation completes after both process and port read-back',()=>{
  const owner={pid:100,createdAt:'created',executablePath:'node.exe',ports:[19000]};
  const manifest={sessionId:'session',clients:[{clientId:'controller',role:'controller'}],broker:{port:19000},runtimeOwner:owner,ownedProcesses:[]};
  const operation={operationId:'stop-op',sessionId:'session',context:emptyContext('session','controller'),status:'pending'};
  const state={lifecycle:'stopping',stop:{phase:'verifying',operationId:'stop-op',errors:[]},operations:[operation]};
  for(const [processes,ports] of [[[owner],[]],[[],[{port:19000,pid:100}]]])assert.equal(verifyStopped(manifest,state,processes,ports).operations[0].status,'unknown');
  assert.equal(verifyStopped(manifest,state,[],[]).operations[0].status,'confirmed');assert.equal(state.operations[0].status,'pending');
  for(const patch of [{operationId:'other'},{sessionId:'other'},{context:emptyContext('session','B')},{context:emptyContext('other','controller')},{status:'rejected'}]){
    const altered={...operation,...patch};assert.deepEqual(verifyStopped(manifest,{...state,operations:[altered]},[],[]).operations[0],altered);
  }
});

test('explicit offline stop recovers orphaned owned runtime, refuses a live/reused broker and preserves controllers',()=>{
  const owner={pid:100,createdAt:'created',executablePath:'node.exe',ports:[19000]};
  const participant={pid:200,createdAt:'created',executablePath:'client.exe',kind:'client',ports:[]};
  const windowOwner={pid:300,createdAt:'created',executablePath:'controller.exe',kind:'controller',ports:[]};
  const controller={manifest:{clientId:'controller',role:'controller'},context:emptyContext('session','controller'),draft:{exScore:null,missCount:null}};
  const state={sessionId:'session',lifecycle:'running',clients:[controller],stop:{phase:'idle',errors:[]},operations:['reserved','pending','input-written','parsed','sent','confirmed','rejected'].map(status=>({operationId:status,status}))};
  const manifest={sessionId:'session',broker:{port:19000},runtimeOwner:owner,ownedProcesses:[participant,windowOwner]};
  const command={protocolVersion:1,operationId:'offline-stop',sessionId:'session',actorClientId:'controller',targetClientId:'controller',context:controller.context,action:'session.stop',payload:{confirmationToken:canonicalJson({context:controller.context,draft:controller.draft,action:'session.stop'})}};
  let reads=0,stops=0;const persisted=[];
  const options={readProcesses:()=>reads++===0?[participant,windowOwner]:[windowOwner],readPorts:()=>[],stopProcesses:owners=>{stops++;assert.deepEqual(owners,[participant]);return [{pid:200,status:'stopped'}];},persist:value=>persisted.push(structuredClone(value))};
  const recovered=stopOfflineRuntime(manifest,state,command,options);
  assert.equal(recovered.result.status,'confirmed');assert.equal(recovered.state.lifecycle,'stopped');assert.equal(stops,1);assert.equal(persisted[0].lifecycle,'stopping');assert.equal(persisted.at(-1).stop.portsVerified,true);
  assert.deepEqual(recovered.state.operations.slice(0,-1).map(o=>o.status),['cancelled','unknown','unknown','unknown','unknown','confirmed','rejected']);
  for(const present of [owner,{...owner,createdAt:'reused'}])assert.throws(()=>stopOfflineRuntime(manifest,state,command,{...options,readProcesses:()=>[present,participant]}),/Broker identity/);
  assert.equal(stops,1);
  assert.throws(()=>stopOfflineRuntime(manifest,state,{...command,payload:{confirmationToken:'stale'}},options),/confirmation mismatch/);
  const incomplete=stopOfflineRuntime(manifest,state,command,{readProcesses:()=>[participant,windowOwner],readPorts:()=>[{port:19000,pid:999}],stopProcesses:()=>[{pid:200,status:'identity-mismatch'}]});
  assert.equal(incomplete.result.status,'failed');assert.equal(incomplete.state.recoveryRequired,true);
});
