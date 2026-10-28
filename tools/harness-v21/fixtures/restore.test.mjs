import test from 'node:test';
import assert from 'node:assert/strict';
import { SyntheticLobbyDirectoryDO } from './lobby-directory.ts';
import { LobbyDirectoryDO as BaselineDirectory } from '../../../apps/worker/src/durable/lobby-directory-object.ts';

const valid = () => ({roomId:'r',roomName:'Synthetic',ownerUserId:'fixture',ownerDisplayName:'Fixture',mode:'ARENA',playStyle:'SP',levelFilter:'ANY',winMetric:'SCORE',hasJoinCode:false,isPublic:true,currentPlayers:1,maxPlayers:2,isFull:false,status:'LOBBY',ttlStartedAt:1000,createdAt:1000,updatedAt:1000});
function state(initial = {}) {
  const records = structuredClone(initial), writes = [];
  return {records,writes,storage:{async get(key){return structuredClone(records[key]);},async put(key,value){writes.push(key);records[key]=structuredClone(value);}},async blockConcurrencyWhile(callback){return callback();}};
}
const request = (path, body) => new Request('https://fixture.invalid/internal/'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
async function withClock(callback) {
  const before = Date.now;
  Date.now = () => 2000;
  try { await callback(); } finally { Date.now = before; }
}
const mutations = [
  ...['mode','playStyle','levelFilter','winMetric','status'].flatMap(key => [
    [key+' unknown', room => {room[key]='invalid';}],
    [key+' absent', room => {delete room[key];}],
  ]),
  ...['hasJoinCode','isPublic','isFull'].flatMap(key => [
    [key+' string', room => {room[key]='false';}],
    [key+' missing', room => {delete room[key];}],
  ]),
  ...['currentPlayers','ttlStartedAt','createdAt','updatedAt'].flatMap(key => [
    [key+' NaN', room => {room[key]=NaN;}],
    [key+' infinite', room => {room[key]=Infinity;}],
    [key+' negative', room => {room[key]=-1;}],
    [key+' unsafe', room => {room[key]=Number.MAX_SAFE_INTEGER+1;}],
    [key+' fractional', room => {room[key]=0.5;}],
    [key+' absent', room => {delete room[key];}],
  ]),
  ['maxPlayers invalid', room => {room.maxPlayers=8;}],
  ['currentPlayers exceeds capacity', room => {room.currentPlayers=3;}],
  ['isFull contradiction', room => {room.isFull=true;}],
  ['room id mismatch', room => {room.roomId='other';}],
  ['room id whitespace', room => {room.roomId=' r ';}],
  ['roomName number', room => {room.roomName=7;}],
];
for (const [label, mutate] of mutations) test('corrupt restore: '+label, async () => withClock(async () => {
  const room=valid();mutate(room);
  const storage=state({rooms:{r:room},lastUpdatedAtByRoomId:1000});
  const before=structuredClone(storage.records);
  const directory=new SyntheticLobbyDirectoryDO(storage);
  for (const [path,body] of [['list',undefined],['upsert',valid()],['remove',{roomId:'r'}]]) {
    const result=await directory.fetch(request(path,body));
    assert.equal(result.status,503);
    assert.deepEqual(await result.json(),{error:'CORRUPT_STATE'});
  }
  assert.equal(storage.writes.length,0);
  assert.deepEqual(storage.records,before);
}));
const badContainers = [
  ['rooms array',{rooms:[]}],['rooms null',{rooms:null}],['rooms scalar',{rooms:4}],
  ['room array',{rooms:{r:[]}}],['room null',{rooms:{r:null}}],
  ...[null,[],NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1,{old:NaN},{old:-1},{old:'1000'}].map((value,index)=>['counter '+index,{lastUpdatedAtByRoomId:value}]),
  ['future version',{schemaVersion:2}],['null version',{schemaVersion:null}],['string version',{schemaVersion:'1'}],
];
for (const [label,initial] of badContainers) test('container rejection: '+label,async()=>withClock(async()=>{
  const storage=state(initial),before=structuredClone(storage.records);
  const directory=new SyntheticLobbyDirectoryDO(storage);
  for (const [path,body] of [['list',undefined],['upsert',valid()],['remove',{roomId:'r'}]]) assert.equal((await directory.fetch(request(path,body))).status,503);
  assert.equal(storage.writes.length,0);assert.deepEqual(storage.records,before);
}));
for (const initial of [{},{rooms:{}},{rooms:{r:valid()},lastUpdatedAtByRoomId:1000},{rooms:{},lastUpdatedAtByRoomId:{deleted:2500}},{rooms:{},lastUpdatedAtByRoomId:{},schemaVersion:1}]) {
  test('known legacy storage accepted '+JSON.stringify(Object.keys(initial)),async()=>withClock(async()=>{
    const storage=state(initial),directory=new SyntheticLobbyDirectoryDO(storage);
    assert.equal((await directory.fetch(request('list'))).status,200);
    assert.equal(storage.writes.length,0);
    assert.equal((await directory.fetch(request('upsert',valid()))).status,200);
    const rooms=(await (await directory.fetch(request('list'))).json()).rooms;
    assert.ok(rooms[0].updatedAt>Math.max(1000,...Object.values(initial.lastUpdatedAtByRoomId??{})));
    assert.equal(typeof storage.records.lastUpdatedAtByRoomId,'number');
  }));
}
test('counter exhaustion refuses before modifying storage',async()=>withClock(async()=>{
  const storage=state({rooms:{r:valid()},lastUpdatedAtByRoomId:Number.MAX_SAFE_INTEGER});
  const before=structuredClone(storage.records),directory=new SyntheticLobbyDirectoryDO(storage);
  assert.equal((await directory.fetch(request('upsert',valid()))).status,503);
  assert.equal(storage.writes.length,0);assert.deepEqual(storage.records,before);
}));
test('empty remove persists a valid bounded counter for cold restore',async()=>withClock(async()=>{
  const storage=state(),directory=new SyntheticLobbyDirectoryDO(storage);
  assert.equal((await directory.fetch(request('remove',{roomId:'missing'}))).status,200);
  assert.equal(storage.records.lastUpdatedAtByRoomId,0);
  assert.equal((await new SyntheticLobbyDirectoryDO(storage).fetch(request('list'))).status,200);
}));
test('invalid incoming summary refuses without changing valid storage',async()=>withClock(async()=>{
  const storage=state({rooms:{r:valid()},lastUpdatedAtByRoomId:1000}),directory=new SyntheticLobbyDirectoryDO(storage);
  const before=structuredClone(storage.records),room=valid();room.mode='invalid';
  assert.equal((await directory.fetch(request('upsert',room))).status,400);
  assert.equal(storage.writes.length,0);assert.deepEqual(storage.records,before);
}));
test('storage read error is fixed unavailable response without exception text',async()=>{
  const storage=state();storage.storage.get=async()=>{throw new Error('synthetic-private-value');};
  const result=await new SyntheticLobbyDirectoryDO(storage).fetch(request('list'));
  assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:'CORRUPT_STATE'});assert.equal(storage.writes.length,0);
});
test('baseline negative control actually reproduces enum and boolean normalization',async()=>withClock(async()=>{
  const room=valid();room.mode='invalid';room.hasJoinCode='false';
  const storage=state({rooms:{r:room},lastUpdatedAtByRoomId:1000});
  const rooms=(await (await new BaselineDirectory(storage).fetch(request('list'))).json()).rooms;
  assert.equal(rooms[0].mode,'ARENA');assert.equal(rooms[0].hasJoinCode,false);
  assert.equal(storage.writes.length,0);
  // This is synthetic invocation of the baseline reader, not observed production
  // corruption, user impact, or a retroactive reclassification of an old run.
}));
