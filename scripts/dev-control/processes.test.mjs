import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { inventory, stopOwned, identifiedDescendants, shutdownProcessState } from './processes.mjs';

test('shutdown read-back distinguishes a proven reused PID from remaining or unverified ownership',()=>{
  const owner={pid:1,createdAt:'old',executablePath:'owned.exe'};
  const results=[{pid:1,status:'identity-mismatch'}];
  for(const live of [[],[{...owner,createdAt:'new',executablePath:'foreign.exe'}]])assert.deepEqual(shutdownProcessState([owner],results,live),{remaining:[],incomplete:[]});
  for(const actual of [owner,{...owner,createdAt:null},{...owner,executablePath:null}])assert.deepEqual(shutdownProcessState([owner],results,[actual]),{remaining:[owner],incomplete:results});
  assert.deepEqual(shutdownProcessState([owner],[{pid:1,status:'stop-timeout'}],[]).incomplete,[{pid:1,status:'stop-timeout'}]);
});

test('a disappearing CIM entry is skipped only after absence is proven, while live unknown/reused identities fail closed',()=>{
  const parent={pid:1,parentPid:0,createdAt:'parent',executablePath:'parent.exe'};
  const exiting={pid:2,parentPid:1,createdAt:'child',executablePath:null};
  assert.deepEqual(identifiedDescendants([parent,exiting],1,()=>[parent]),[parent]);
  assert.deepEqual(identifiedDescendants([parent,exiting],1,()=>[parent,{...exiting,executablePath:'child.exe'}]),[parent,{...exiting,executablePath:'child.exe'}]);
  assert.throws(()=>identifiedDescendants([parent,exiting],1,()=>[parent,exiting]),/live process ownership/);
  assert.throws(()=>identifiedDescendants([parent,exiting],1,()=>[parent,{...exiting,createdAt:'reused',executablePath:'foreign.exe'}]),/live process ownership/);
});

test('Windows shutdown checks held-handle path/start time and never kills a foreign identity',async()=>{
  const child=spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{windowsHide:true,stdio:'ignore'});
  await new Promise((res,rej)=>{child.once('spawn',res);child.once('error',rej);});
  const exited=new Promise(res=>child.once('exit',res));
  try{
    const own=inventory().find(process=>process.pid===child.pid);
    assert.ok(own?.createdAt);assert.ok(own?.executablePath);
    const refused=stopOwned([{...own,executablePath:`${own.executablePath}.foreign`}]);
    assert.equal(refused[0].status,'identity-mismatch');
    assert.ok(inventory().some(process=>process.pid===child.pid));
    const stopped=stopOwned([own]);assert.equal(stopped[0].status,'stopped');
    await exited;
    assert.equal(inventory().some(process=>process.pid===child.pid&&process.createdAt===own.createdAt),false);
  }finally{child.kill();}
});
