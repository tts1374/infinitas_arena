// Installed at .tmp/comparison. Public-result checks, not implementation matching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SyntheticLobbyDirectoryDO as LobbyDirectoryDO } from './lobby-directory.ts';
import { handleGetLobby } from '../../../apps/worker/src/routes/lobby.ts';

function state(initial={}) {
  const records=structuredClone(initial);
  return { records, storage:{ async get(key){return structuredClone(records[key]);}, async put(key,value){records[key]=structuredClone(value);} }, async blockConcurrencyWhile(callback){return callback();} };
}
const summary=id=>({roomId:id,roomName:'Synthetic',ownerUserId:'fixture',ownerDisplayName:'Fixture',mode:'ARENA',playStyle:'SP',levelFilter:'ANY',winMetric:'SCORE',hasJoinCode:false,isPublic:true,currentPlayers:1,maxPlayers:2,isFull:false,status:'LOBBY',ttlStartedAt:1000,createdAt:1000,updatedAt:1000});
const request=(path,body)=>new Request('http://fixture.invalid/internal/'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
async function list(directory){return (await (await directory.fetch(request('list'))).json()).rooms;}
async function upsert(directory,id='r'){assert.equal((await directory.fetch(request('upsert',summary(id)))).status,200);}
function barrier(){let resolve,entered;const started=new Promise(r=>entered=r);const wait=new Promise(r=>resolve=r);return {started,resolve,async fetch(){entered();return wait;}};}
function environment(directory,probe){return {LOBBY_DIRECTORY_DO:{idFromName:x=>x,get:()=>directory},ROOM_DO:{idFromName:x=>x,get:()=>({fetch:()=>probe.fetch()})}};}

for (const kind of ['ineligible','lost']) for (const recreate of [false,true]) {
  test(`actual lobby route barrier keeps newer summary: ${kind}, recreate=${recreate}`,async()=>{
    const original=Date.now;Date.now=()=>1000;
    try {
      const s=state();const directory=new LobbyDirectoryDO(s);await upsert(directory);
      const first=(await list(directory))[0].updatedAt;
      const older=barrier(),newer=barrier();
      const oldRequest=handleGetLobby(new Request('http://fixture.invalid/api/lobby'),environment(directory,older));await older.started;
      const reverseRequest=handleGetLobby(new Request('http://fixture.invalid/api/lobby'),environment(directory,newer));await newer.started;
      if(recreate)await directory.fetch(request('remove',{roomId:'r'}));
      await upsert(directory);
      const fresh=(await list(directory))[0].updatedAt;assert.ok(fresh>first);
      newer.resolve(json({eligible:false}));await reverseRequest;
      assert.equal((await list(directory))[0].updatedAt,fresh);
      older.resolve(kind==='lost'?json({error:'ROOM_STATE_LOST'},404):json({eligible:false}));await oldRequest;
      const after=await list(directory);assert.equal(after.length,1);assert.equal(after[0].updatedAt,fresh);
      assert.deepEqual(Object.keys(after[0]).sort(),Object.keys(summary('r')).sort());
    } finally {Date.now=original;}
  });
}

for(const failure of ['5xx','network'])test(`actual route fails open on ${failure}`,async()=>{
  const original=Date.now;Date.now=()=>1000;
  try {
    const directory=new LobbyDirectoryDO(state());await upsert(directory);
    const probe={async fetch(){if(failure==='network')throw new Error('synthetic network failure');return json({error:'synthetic'},503);}};
    const response=await handleGetLobby(new Request('http://fixture.invalid/api/lobby'),environment(directory,probe));
    assert.equal((await response.json()).rooms.length,1);assert.equal((await list(directory)).length,1);
  }finally{Date.now=original;}
});

test('legacy counter -> scalar -> cold instance and bounded helper state (unit, not actual hibernation)',async()=>{
  const original=Date.now;Date.now=()=>2000;
  try {
    const s=state({rooms:{},lastUpdatedAtByRoomId:{deleted:2500}});
    const first=new LobbyDirectoryDO(s);await upsert(first);const token=(await list(first))[0].updatedAt;assert.ok(token>2500);
    const restored=new LobbyDirectoryDO(s);await upsert(restored);assert.ok((await list(restored))[0].updatedAt>token);
    for(let i=0;i<200;i++){await upsert(restored,'r'+i);await restored.fetch(request('remove',{roomId:'r'+i}));}
    assert.equal(typeof s.records.lastUpdatedAtByRoomId,'number');assert.equal(Object.keys(s.records).length,2);
  }finally{Date.now=original;}
});
