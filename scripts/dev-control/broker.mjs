import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { secretMatches, canonicalWritePath, ensureOwnedDirectory } from './guards.mjs';
import { canonicalJson, emptyContext, sameContext, validateCommand } from './protocol.mjs';
import { ReservationScheduler } from './scheduler.mjs';
import { DevControlPeer } from './peer.mjs';
import { deriveActions, roundSignature } from './action-policy.mjs';
import { createEvidenceWriter, evidenceManifest } from './evidence.mjs';
import { ReceiptLedger } from './receipts.mjs';

export async function createBroker({ manifest, keys, onStop = async () => {}, createSupplier = async options => (await import('./sources/supplier.mjs')).createSourceSupplier(options), clock = { setTimeout, clearTimeout }, captureTimeoutMs=15000, requireStopExport=false, stopExportTimeoutMs=15000 }) {
  const spool = ensureOwnedDirectory(manifest.runtimeRoot, join(manifest.runtimeRoot, 'controller-spool'));
  const evidence=createEvidenceWriter(manifest.runtimeRoot,Object.values(keys));
  const clients = manifest.clients.map(spec => ({manifest:spec,context:emptyContext(manifest.sessionId,spec.clientId),connection:'DISCONNECTED',normalSnapshot:null,eventSnapshot:null,displayPhase:null,draft:{exScore:null,missCount:null},policy:'manual',actions:[],lastError:null}));
  const state = {protocolVersion:1,sessionId:manifest.sessionId,sourceHead:manifest.sourceHead,lifecycle:'starting',mode:manifest.mode,hostClientId:manifest.hostClientId,apiBaseUrl:manifest.apiBaseUrl,roomId:null,joinCode:null,clients:clients.filter(client=>client.manifest.initial!==false),availableParticipants:clients.filter(client=>client.manifest.initial===false).map(client=>client.manifest.clientId),chartCandidates:[],operations:[],observations:[],save:{status:'idle',path:null,error:null,missing:['実画面画像はまだ取得していません。']}};
  state.restartOptions={mode:manifest.mode,hostClientId:manifest.hostClientId,opponentSource:manifest.launch?.opponentSource??'inf-notebook',visibleOpponents:manifest.launch?.visibleOpponents??1,playerCount:manifest.launch?.playerCount??(manifest.mode==='ARENA'?4:['BPL','BPL4'].includes(manifest.mode)?2:4)};
  state.stop={phase:'idle',requestedAt:null,completedAt:null,errors:[],processesVerified:false,portsVerified:false};
  state.evidence={captures:[]};
  const commands = new Map(), queues = new Map(), timers = new Map();
  const exitedClients=new Set();
  const captureQueues=new Map(),capturePending=new Map();
  let stopPromise=null,collectionPromise=null,stopExport=null;
  const peers=new Map(), suppliers=new Map(), armedInputs=new Map(), autoRounds=new Map();
  const eventMode=['CASUAL','TOURNAMENT'].includes(manifest.mode);
  const scheduler=new ReservationScheduler({clock,readContext:id=>clients.find(client=>client.manifest.clientId===id)?.context,onDispatch:dispatch,onCancel:(command,reason)=>{const operation=commands.get(command.operationId);if(operation&&operation.result.status==='reserved'){operation.result.status='cancelled';operation.result.reason=reason;try{flush();}catch(error){if(state.lifecycle!=='stopping')throw error;state.stop.errors.push(error.message);}}}});
  let sequence = 0;
  const receipts=new ReceiptLedger({commands,onTransition:operation=>log('operations.jsonl',{...operation.result,action:operation.command.action})});
  function flush() {
    evidence.write(join(spool,'state.json'),state);
  }
  function log(file,value){
    evidence.write(canonicalWritePath(spool,join(spool,file)),value,true);
  }
  function observe(client,stage,detail,operationId=null,origin='derived',context=client.context){
    const entry={protocolVersion:1,sequence:++sequence,operationId,sessionId:manifest.sessionId,clientId:client.manifest.clientId,playerId:client.manifest.playerId,context:structuredClone(context),stage,origin,at:new Date().toISOString(),clientMsgId:detail.clientMsgId??null,requestId:detail.requestId??null,snapshotRevision:client.eventSnapshot?.revision??null,receiveSequence:stage==='received'?sequence:null,detail};
    // Full raw evidence stays in JSONL; the bounded state is only a UI preview.
    const preview=detail.message?{...entry,detail:{messageType:detail.message.type,requestId:entry.requestId,clientMsgId:entry.clientMsgId}}:entry;
    state.observations.push(evidence.redact(preview)); if(state.observations.length>150)state.observations.shift();
    log('observations.jsonl',entry);return entry.sequence;
  }
  function sent(client,message,operationId,context=client.context){
    const sequence=observe(client,'sent',{message,clientMsgId:message.client_msg_id,requestId:message.payload?.request_id??null},operationId,'raw',context);
    receipts.sent(client,message,operationId,context,sequence);
  }
  function result(command,status,reason=null){
    const entry={protocolVersion:1,operationId:command.operationId,sessionId:manifest.sessionId,context:structuredClone(command.context),status,reason,evidenceSequences:[]};
    state.operations.push(entry);if(state.operations.length>200)state.operations.shift();
    log('operations.jsonl',{...entry,action:command.action});return entry;
  }
  function recalculateActions(client){
    Object.assign(client,deriveActions(client,{lifecycle:state.lifecycle,eventMode,availableParticipants:state.availableParticipants,operations:commands.values()}));
    if(exitedClients.has(client.manifest.clientId))client.actions=client.actions.map(action=>({...action,enabled:false,reason:client.lastError}));
  }
  function considerAuto(client){
    if(client.policy!=='auto'||!client.actions.some(action=>action.action==='result.send'&&action.enabled))return;
    const signature=roundSignature(client.context);if(autoRounds.get(client.manifest.clientId)===signature)return;
    autoRounds.set(client.manifest.clientId,signature);
    const command={protocolVersion:1,operationId:crypto.randomUUID(),sessionId:manifest.sessionId,actorClientId:'controller',targetClientId:client.manifest.clientId,context:structuredClone(client.context),action:'result.send',payload:{valueRevision:client.context.valueRevision}};
    const entry=result(command,'pending');commands.set(command.operationId,{command,result:entry,claimed:false});
    void dispatch(command);
  }
  async function productRequest(path,body){
    const response=await fetch(new URL(path,manifest.apiBaseUrl),{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(5000)});
    const value=await response.json();if(!response.ok)throw new Error(`Local product API refused request: ${value.error?.code??response.status} ${evidence.redact(value.error?.message??'')}`);return value;
  }
  function applySnapshot(client,normal,event){
    const previous=structuredClone(client.context);
    client.normalSnapshot=normal??null;client.eventSnapshot=event??null;
    client.context={...client.context,roomId:event?.room_id??normal?.room_id??null,roomGeneration:event?.generation??normal?.generation??null,matchId:normal?.current_match_id??null,eventId:event?.event_id??null,roundIndex:normal?.current_round?.round_index??null,roundId:event?.current_round_id??null,expectedKey:event?.selected_chart?.expected_key??normal?.current_round?.expected_key??null,selectionRevision:event?.selection_revision??null};
    if(!sameContext(previous,client.context)){
      scheduler.invalidate(client.manifest.clientId);
      for(const operation of commands.values())if(operation.command.targetClientId===client.manifest.clientId&&!sameContext(operation.command.context,client.context)&&['pending','reserved','input-written','parsed','sent'].includes(operation.result.status))operation.result.status=operation.claimed||['input-written','parsed','sent'].includes(operation.result.status)?'unknown':'cancelled';
      const supplier=suppliers.get(client.manifest.clientId);if(supplier)void supplier.invalidate(client.context);
    }
    recalculateActions(client);
    receipts.snapshot(client,sequence,false);
  }
  function receive(client,message,apply=true,context=client.context){
    const receiptSequence=observe(client,'received',{message,requestId:message.payload?.request_id??null},null,'raw',context);
    const normal=message.payload?.room_state_snapshot,event=message.payload?.event_room_snapshot;
    if(apply&&(normal||event))applySnapshot(client,normal,event);
    receipts.received(client,message,context,receiptSequence);
    const joined=message.payload?.event_room_snapshot??message.payload?.room_state_snapshot;
    if(joined&&client.connection==='CONNECTED')for(const operation of commands.values()){
      const expected=operation.joinContext;
      if(operation.command.action==='participant.add'&&operation.command.payload.clientId===client.manifest.clientId&&['sent','unknown'].includes(operation.result.status)&&expected&&joined.room_id===expected.roomId&&joined.generation===expected.generation&&joined.event_id===expected.eventId&&joined.participants?.some(p=>p.player_id===client.manifest.playerId)){
        operation.result.status='confirmed';operation.result.reason='追加対象の正規JOIN snapshotと接続を照合しました。';operation.result.evidenceSequences.push(receiptSequence);log('operations.jsonl',{...operation.result,action:operation.command.action});
      }
    }
    if(apply){recalculateActions(client);considerAuto(client);beginPeers();}flush();
  }
  function beginPeers(){
    const expectedHost=clients.find(client=>client.manifest.clientId===state.hostClientId)?.manifest.playerId;
    if(state.lifecycle!=='running'||!state.roomId)return;
    const hostReady=clients.some(client=>(client.normalSnapshot?.host_player_id??client.eventSnapshot?.host.player_id)===expectedHost);
    for(const client of state.clients.filter(client=>client.manifest.transport==='headless')){
      if(peers.has(client.manifest.clientId)||!hostReady&&client.manifest.clientId!==state.hostClientId)continue;
      const peer=new DevControlPeer({manifest,client:client.manifest,roomId:state.roomId,joinCode:state.joinCode,onMessage:message=>receive(client,message),onConnection:connection=>{if(connection!==client.connection){client.context.transportEpoch++;scheduler.invalidate(client.manifest.clientId);}client.connection=connection;receipts.snapshot(client,sequence,false);recalculateActions(client);flush();},onSent:message=>sent(client,message,commands.has(message.client_msg_id)?message.client_msg_id:null)});
      peers.set(client.manifest.clientId,peer);peer.connect();
    }
  }
  async function dispatch(command){
    const operation=commands.get(command.operationId),target=clients.find(client=>client.manifest.clientId===command.targetClientId);
    if(!operation||!target)return;
    if(state.lifecycle!=='running'||!sameContext(command.context,target.context)||!['pending','reserved'].includes(operation.result.status)){operation.result.status='cancelled';operation.result.reason='context changed before dispatch';flush();return;}
    operation.result.status='pending';
    try{
      if(['result.send','result.delay'].includes(command.action)&&target.manifest.transport==='real-client'){
        let supplier=suppliers.get(target.manifest.clientId);
        if(!supplier){supplier=await createSupplier({manifest,clientId:target.manifest.clientId,verifyContext:context=>state.lifecycle==='running'&&sameContext(context,target.context)});suppliers.set(target.manifest.clientId,supplier);}
        if(state.lifecycle!=='running'||!sameContext(command.context,target.context)||operation.result.status!=='pending')throw new Error('Context changed during source initialization');
        const title=target.eventSnapshot?.selected_chart?.display.title??target.normalSnapshot?.frozen_rounds.find(round=>round.round_index===target.context.roundIndex)?.display.title;
        const prepared=await supplier.prepareInput({context:command.context,expectedKey:command.context.expectedKey,title,exScore:target.draft.exScore,missCount:target.draft.missCount});
        if(state.lifecycle!=='running'||!sameContext(command.context,target.context)||operation.result.status!=='pending')throw new Error('Context changed during source preparation');
        if(prepared.source==='daken_counter_v3'&&!/^[0-9a-f]{8}$/i.test(prepared.sourceFingerprint??''))throw new Error('A v3 input requires the exact product fingerprint');
        armedInputs.set(prepared.inputId,{command,prepared,supplier});
        queues.set(target.manifest.clientId,[...(queues.get(target.manifest.clientId)??[]),{kind:'source-arm',operationId:command.operationId,context:command.context,input:{context:command.context,source:prepared.source,timestamp:prepared.timestamp,inputId:prepared.inputId,...(prepared.sourceFingerprint?{sourceFingerprint:prepared.sourceFingerprint}:{})}}]);
      }else if(target.manifest.transport==='headless'){
        const peer=peers.get(target.manifest.clientId);if(!peer)throw new Error('Headless transport is not joined');
        operation.localDispatched=true;peer.dispatch(command,target.draft,target.eventSnapshot??target.normalSnapshot);if(operation.result.status==='pending')operation.result.status='sent';
        if(command.action==='participant.leave')target.connection='LEFT';
      }else queues.set(target.manifest.clientId,[...(queues.get(target.manifest.clientId)??[]),command]);
      const timeout=clock.setTimeout(()=>{if(['pending','sent','input-written','parsed'].includes(operation.result.status)){operation.result.status='unknown';operation.result.reason='返答待ちが上限を超えました。再同期で確認してください。';flush();}},15000);timers.set(command.operationId,timeout);
    }catch(error){operation.result.status='failed';operation.result.reason=error.message;observe(target,'failed',{error:error.message},command.operationId);}
    flush();
  }
  async function startSession(){
    if(manifest.hostClientId==='A')return;
    const host=clients.find(client=>client.manifest.clientId===manifest.hostClientId);
    const response=await productRequest(eventMode?'/api/event-rooms':'/api/rooms',eventMode?{host_event_protocol:2,client_version:'1.4.0',host_player_id:host.manifest.playerId,host_display_name:`DEV ${host.manifest.clientId}`,settings:{event_name:`DEV ${manifest.sessionId}`,event_type:manifest.mode,host_plays:true,play_style:'SP',win_metric:'SCORE',visibility:'PRIVATE',join_code:null}}:{visibility:'PRIVATE',join_code:null,auto_rematch:false,auto_match:false,mode:manifest.mode,win_metric:'SCORE',play_style:'SP',level_filter:'ANY',room_comment:'DEV CONTROL LOCAL',max_players:manifest.launch.playerCount});
    if(state.lifecycle!=='running')return;
    state.roomId=response.room_id;state.joinCode=response.join_code??response.settings?.join_code;beginPeers();flush();
  }
  function clientExited(clientId){
    const client=clients.find(client=>client.manifest.clientId===clientId);
    if(state.lifecycle!=='running'||!client||client.manifest.transport!=='real-client')return;
    exitedClients.add(clientId);client.connection='DISCONNECTED';client.context.transportEpoch++;
    client.lastError='検証用アプリが終了しました。記録を保存し、確認全体の操作から最初からやり直してください。';
    scheduler.invalidate(clientId);queues.delete(clientId);
    for(const [id,arm] of armedInputs)if(arm.command.targetClientId===clientId)armedInputs.delete(id);
    for(const operation of commands.values())if(operation.command.targetClientId===clientId&&['pending','reserved','input-written','parsed','sent'].includes(operation.result.status)){
      operation.result.status=operation.claimed||['input-written','parsed','sent'].includes(operation.result.status)?'unknown':'cancelled';
      operation.result.reason='検証用アプリが終了したため、新しい操作は配送しません。';
    }
    observe(client,'operation',{event:'client_process_exited'});recalculateActions(client);flush();
  }
  function authenticate(request){
    const id=request.headers['x-dev-control-client'];
    const client=clients.find(c=>c.manifest.clientId===id);
    const token=request.headers.authorization?.replace(/^Bearer /,'');
    if(!client||!secretMatches(keys[id],token))throw new Error('Unauthorized');
    if(exitedClients.has(id))throw new Error('The owned application has exited');
    if(request.headers.origin)throw new Error('Browser/CORS access is not allowed');
    return client;
  }
  async function body(request){let bytes=0,parts=[];for await(const part of request){bytes+=part.length;if(bytes>1048576)throw new Error('Body too large');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
  function requireController(client){if(client.manifest.role!=='controller')throw new Error('Controller role required');}
  function collectEvidence(){
    if(collectionPromise)return collectionPromise;
    collectionPromise=(async()=>{
      state.save.status='collecting';state.save.attempt=(state.save.attempt??0)+1;
      const waiting=[];
      for(const client of state.clients.filter(c=>c.manifest.transport==='real-client')){
        const captureId=crypto.randomUUID(),receipt={captureId,clientId:client.manifest.clientId,status:'pending',relativePath:null,error:null};
        state.evidence.captures.push(receipt);
        if(!client.manifest.spoolRoot){receipt.status='missing';receipt.error='実窓の保存領域がありません。';continue;}
        const request={kind:'evidence-capture',captureId,context:structuredClone(client.context),deadlineAt:new Date(Date.now()+captureTimeoutMs).toISOString()};
        waiting.push(new Promise(resolve=>{
          const timer=setTimeout(()=>{receipt.status='missing';receipt.error='実窓画像の取得応答がありません。';capturePending.delete(captureId);resolve();},captureTimeoutMs);
          capturePending.set(captureId,{client,request,receipt,finish:()=>{clearTimeout(timer);capturePending.delete(captureId);resolve();}});
        }));
        captureQueues.set(client.manifest.clientId,[...(captureQueues.get(client.manifest.clientId)??[]),request]);
      }
      await Promise.all(waiting);captureQueues.clear();
      const latest=new Map(state.evidence.captures.map(c=>[c.clientId,c]));
      state.save.missing=[...latest.values()].filter(c=>c.status!=='saved').map(c=>`${c.clientId}: ${c.error??'画像欠損'}`);
      state.save.status=state.save.missing.length?'partial':'idle';
      evidence.write(join(spool,'manifest.json'),evidenceManifest(manifest));flush();
    })().finally(()=>{collectionPromise=null;});
    return collectionPromise;
  }
  function stop(){
    if(stopPromise)return stopPromise;
    stopPromise=(async()=>{
    state.lifecycle='stopping';state.stop.phase='quiescing';state.stop.requestedAt=new Date().toISOString();
    const safeFlush=()=>{try{flush();}catch(error){state.stop.errors.push(error.message);}};
    try{scheduler.stop();}catch(error){state.stop.errors.push(error.message);}
    for(const timer of timers.values())clock.clearTimeout(timer);timers.clear();
    for(const {result:operation,claimed} of commands.values()){
      if(operation.status==='reserved'||operation.status==='pending'&&!claimed)operation.status='cancelled';
      else if(['pending','sent','input-written','parsed'].includes(operation.status))operation.status='unknown';
    }
    for(const client of clients)recalculateActions(client);
    queues.clear();armedInputs.clear();safeFlush();
    state.stop.phase='collecting';
    try{await collectEvidence();}catch(error){state.stop.errors.push(error.message);state.save={...state.save,status:'failed',error:error.message};}
    for(const peer of peers.values())try{peer.disconnect();}catch(error){state.stop.errors.push(error.message);}
    for(const supplier of suppliers.values())try{await supplier.stop();}catch(error){state.stop.errors.push(error.message);}
    state.stop.phase='flushing';
    if(requireStopExport){
      state.stop.exportRequestId=crypto.randomUUID();
      state.stop.exportDeadlineMs=Date.now()+stopExportTimeoutMs;
      state.stop.exportDeadlineAt=new Date(state.stop.exportDeadlineMs).toISOString();
      state.save={...state.save,status:'exporting'};
      const completed=new Promise(resolve=>{
        const timer=clock.setTimeout(()=>{
          state.save={...state.save,status:'failed',error:'停止前のnative保存を確認できませんでした。停止後に保存を再試行してください。'};
          state.stop.errors.push('Native stop export timed out');
          stopExport=null;resolve();
        },stopExportTimeoutMs);
        stopExport={finish:()=>{clock.clearTimeout(timer);stopExport=null;resolve();}};
      });
      safeFlush();
      await completed;
    }
    safeFlush();
    state.stop.phase='terminating';
    safeFlush();
    try{await onStop();state.stop.phase='verifying';safeFlush();}
    catch(error){state.stop.phase='failed';state.stop.errors.push(error.message);safeFlush();}
    // Only the surviving controller's native process/port read-back may mark stopped.
    })();return stopPromise;
  }
  async function handleCommand(actor,command){
    requireController(actor);validateCommand(command);
    if(command.sessionId!==manifest.sessionId||command.actorClientId!==actor.manifest.clientId)throw new Error('Identity mismatch');
    const target=clients.find(c=>c.manifest.clientId===command.targetClientId);if(!target)throw new Error('Unknown target');
    if(exitedClients.has(target.manifest.clientId))throw new Error('The owned application has exited; restart the session');
    if(target.manifest.role==='self'&&!['client.focus','state.refresh'].includes(command.action))throw new Error('Proxy mutation of self is forbidden');
    if(target.manifest.role==='controller'&&!['session.stop','session.restart','evidence.save','state.refresh','participant.add'].includes(command.action))throw new Error('Controller has no product transport');
    const previous=commands.get(command.operationId);
    if(previous){if(canonicalJson(previous.command)!==canonicalJson(command))throw new Error('Conflicting operation id');return previous.result;}
    if(!sameContext(command.context,target.context))throw new Error('Stale context');
    if(state.lifecycle!=='running'&&!['evidence.save','state.refresh'].includes(command.action))throw new Error('Session stopped');
    recalculateActions(target);
    if(target.manifest.role==='participant'&&!target.actions.some(action=>action.action===command.action&&action.enabled))throw new Error('Action unavailable in current product state');
    const needsConfirmation=['match.forceAdvance','event.cancelPick','event.closeRound','event.end','participant.leave','session.stop'].includes(command.action)||(command.action==='event.start'&&manifest.mode==='TOURNAMENT');
    if(needsConfirmation&&command.payload.confirmationToken!==canonicalJson({context:target.context,draft:target.draft,action:command.action}))throw new Error('Confirmation changed or missing');
    if(['pick.submit','event.confirmPick'].includes(command.action)&&!state.chartCandidates.some(chart=>chart.chartKey===command.payload.chartKey))throw new Error('Choose a current common chart candidate');
    if(['result.send','result.delay'].includes(command.action)&&command.payload.valueRevision!==target.context.valueRevision)throw new Error('Draft revision changed');
    const autoNow=command.action==='policy.apply'&&command.payload.policy==='auto'&&target.actions.some(action=>action.action==='result.send'&&action.enabled);
    if(autoNow&&command.payload.confirmationToken!==canonicalJson({context:target.context,draft:target.draft,action:'policy.auto'}))throw new Error('Immediate auto submission requires unchanged confirmation');
    const entry=result(command,'pending');commands.set(command.operationId,{command:structuredClone(command),result:entry,claimed:false});
    entry.evidenceSequences.push(observe(target,'operation',{action:command.action},command.operationId));
    if(command.action==='state.refresh'&&target.manifest.role==='controller'){entry.status='confirmed';entry.reason='制御記録を読み直しました。製品状態の受付を示すものではありません。';}
    else if(command.action==='session.stop'){entry.status='pending';entry.reason='検証runtime停止要求を受け付けました。停止完了は未確認です。';setImmediate(()=>void stop());}
    else if(command.action==='draft.update'){
      target.draft={exScore:command.payload.exScore,missCount:command.payload.missCount};target.context.valueRevision++;
      scheduler.invalidate(target.manifest.clientId);recalculateActions(target);
      entry.status='confirmed';entry.reason='次の提出値を保存しました。server提出は行っていません。';
    }else if(command.action==='policy.apply'){
      target.policy=command.payload.policy;target.context.policyRevision++;scheduler.invalidate(target.manifest.clientId);entry.status='confirmed';entry.reason='送信方針を変更しました。';
      if(autoNow){autoRounds.set(target.manifest.clientId,roundSignature(target.context));const immediate={...command,operationId:`${command.operationId}:send`,context:structuredClone(target.context),action:'result.send',payload:{valueRevision:target.context.valueRevision}};const sent=result(immediate,'pending');commands.set(immediate.operationId,{command:immediate,result:sent,claimed:false});await dispatch(immediate);}
    }else if(command.action==='reservation.cancel'){
      const pending=commands.get(command.payload.operationId);
      if(!pending||pending.command.targetClientId!==target.manifest.clientId)throw new Error('Foreign reservation');
      const cancelled=scheduler.cancel(command.payload.operationId,'target/confirmation cancelled');
      if(!cancelled&&(pending.result.status!=='pending'||pending.claimed))throw new Error('Already claimed, injected or sent; cancellation is not confirmed');
      pending.result.status='cancelled';entry.status='confirmed';entry.reason='未投入予約を失効しました。';
    }else if(command.action==='result.delay'){
      entry.status='reserved';scheduler.reserve(command,10000);
    }else if(command.action==='participant.add'){
      const additional=clients.find(client=>client.manifest.clientId===command.payload.clientId&&client.manifest.initial===false);
      const event=state.clients.find(client=>client.eventSnapshot)?.eventSnapshot;
      if(!additional||!eventMode||!event||['RESULT','CLOSED'].includes(event.phase)||(manifest.mode==='TOURNAMENT'&&event.phase!=='LOBBY'))throw new Error('New participant is unavailable in this phase');
      commands.get(command.operationId).joinContext={roomId:event.room_id,generation:event.generation,eventId:event.event_id};
      additional.manifest.initial=true;state.clients.push(additional);state.availableParticipants=state.availableParticipants.filter(id=>id!==additional.manifest.clientId);beginPeers();entry.status='sent';entry.reason='正規JOINを要求しました。受付は実接続通知で確認します。';
    }else if(command.action==='evidence.save'){
      entry.status='failed';entry.reason='保存はcontrollerの限定native writerを使用してください。';
    }else{
      await dispatch(command);
    }
    recalculateActions(target);flush();return entry;
  }
  const server=http.createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
    try{
      const client=authenticate(request);let value;
      if(request.method==='GET'&&request.url==='/state'){requireController(client);value={...evidence.redact(state),joinCode:state.joinCode};}
      else if(request.method==='POST'&&request.url==='/collect'){requireController(client);if(state.lifecycle!=='running')throw new Error('Collection is only allowed while running');await collectEvidence();value=state.save;}
      else if(request.method==='POST'&&request.url==='/export-result'){
        requireController(client);const saved=await body(request);
        if(state.lifecycle==='stopping'){
          if(state.stop.phase!=='flushing'||!stopExport||saved.stopExportRequestId!==state.stop.exportRequestId||!Number.isFinite(state.stop.exportDeadlineMs)||Date.now()>=state.stop.exportDeadlineMs)throw new Error('Stale or missing stop export identity');
        }else if(saved.stopExportRequestId!==undefined)throw new Error('Unexpected stop export identity');
        if(!['saved','partial','failed'].includes(saved.status)||!Array.isArray(saved.missing))throw new Error('Invalid export result');
        if(saved.status!=='failed'||saved.bundleId!==null){
          if(typeof saved.bundleId!=='string'||!/^bundle-\d+$/.test(saved.bundleId)||typeof saved.path!=='string')throw new Error('Invalid export bundle');
          const expected=canonicalWritePath(manifest.runtimeRoot,join(manifest.runtimeRoot,'exports',saved.bundleId));
          const supplied=canonicalWritePath(manifest.runtimeRoot,saved.path.replace(/^\\\\\?\\/,''));
          if(supplied.toLowerCase()!==expected.toLowerCase())throw new Error('Export destination mismatch');
        }
        state.save={status:saved.status,path:saved.path,bundleId:saved.bundleId,attempt:saved.attempt,error:saved.error??null,missing:saved.missing};flush();
        if(stopExport){if(saved.status==='failed')state.stop.errors.push('Native stop export failed');stopExport.finish();}
        value={};
      }
      else if(request.method==='GET'&&request.url==='/adapter-state'){
        if(client.manifest.role==='controller')throw new Error('Product adapter required');
        value={hostClientId:state.hostClientId,hostReady:clients.some(c=>(c.normalSnapshot?.host_player_id??c.eventSnapshot?.host.player_id)===clients.find(c=>c.manifest.clientId===state.hostClientId)?.manifest.playerId),sessionId:state.sessionId,client:{manifest:client.manifest,context:client.context},mode:state.mode,apiBaseUrl:state.apiBaseUrl,roomId:state.roomId,joinCode:state.joinCode,lifecycle:state.lifecycle};
      }
      else if(request.method==='POST'&&request.url==='/command')value=await handleCommand(client,await body(request));
      else if(request.method==='GET'&&request.url==='/poll'){
        if(!['participant','self'].includes(client.manifest.role)||client.manifest.transport!=='real-client')throw new Error('Participant adapter required');
        value=captureQueues.get(client.manifest.clientId)??[];captureQueues.delete(client.manifest.clientId);
        for(const command of queues.get(client.manifest.clientId)??[]){
          const operation=commands.get(command.operationId);
          if(!operation||operation.claimed||operation.result.status!=='pending')continue;
          if(client.manifest.role==='self'&&!['client.focus','state.refresh'].includes(command.action))throw new Error('Protected self command');
          if(!sameContext(command.context,client.context)){operation.result.status='cancelled';continue;}
          operation.claimed=true;value.push(command);
        }
      }else if(request.method==='POST'&&request.url==='/report'){
        if(client.manifest.role==='controller')throw new Error('Controller has no product observations');
        const report=await body(request);
        for(const capture of report.captures??[]){
          const pending=capturePending.get(capture.captureId);
          if(!pending){if(state.evidence.captures.some(c=>c.captureId===capture.captureId&&c.clientId===client.manifest.clientId&&c.status!=='pending'))continue;throw new Error('Foreign capture receipt');}
          if(pending.client!==client||capture.clientId!==client.manifest.clientId)throw new Error('Foreign capture receipt');
          const {receipt}=pending;
          if(capture.status==='saved'&&sameContext(pending.request.context,client.context)){
            try{
              const input=canonicalWritePath(client.manifest.spoolRoot,join(client.manifest.spoolRoot,'captures',`${capture.captureId}.png`));
              const bytes=readFileSync(input);if(bytes.length>16*1024*1024||bytes.length<32||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid capture PNG');
              // Native already fsyncs/read-backs the fixed client spool; this receipt never accepts a caller path.
              receipt.status='saved';receipt.relativePath=`clients/${client.manifest.clientId}/spool/captures/${capture.captureId}.png`;
            }catch(error){receipt.status='failed';receipt.error=error.message;}
          }else{receipt.status='missing';receipt.error=String(capture.error??'実画像を取得できません。');}
          pending.finish();
        }
        client.connection=client.connection==='LEFT'?'LEFT':String(report.connection);
        client.displayPhase=report.displayPhase??client.displayPhase;
        const previousContext=structuredClone(client.context);
        client.context.transportEpoch=report.transportEpoch;
        for(const event of report.events??[]) {
          if(event.detail?.message&&event.stage==='received')receive(client,event.detail.message,false,event.detail.context??client.context);
          else {
            const message=event.detail?.message;
            if(event.stage==='sent'&&message)sent(client,message,event.detail?.operationId??null,event.detail.context??client.context);
            else observe(client,event.stage,event.detail,event.detail?.operationId??null,'derived',event.detail.context??client.context);
          }
        }
        // Events are the adapter's actual send/receive order. The accompanying snapshot is
        // captured afterwards; applying it first would let pre-send state prove an operation.
        applySnapshot(client,report.normalSnapshot,report.eventSnapshot);
        if(!sameContext(previousContext,client.context))scheduler.invalidate(client.manifest.clientId);
        if(manifest.hostClientId==='A'&&client.manifest.role==='self'&&!state.roomId){const snapshot=client.eventSnapshot??client.normalSnapshot;if(snapshot){state.roomId=snapshot.room_id;state.joinCode=snapshot.settings.join_code;}}
        if(report.armedInputId){
          const arm=armedInputs.get(report.armedInputId);
          if(!arm||arm.command.targetClientId!==client.manifest.clientId)throw new Error('Unknown source arm');
          armedInputs.delete(report.armedInputId);
          const operation=commands.get(arm.command.operationId);
          if(!sameContext(arm.command.context,client.context)||state.lifecycle!=='running'||operation.result.status!=='pending'||!operation.claimed)throw new Error('Context changed before injection');
          await arm.supplier.supply(arm.prepared);
          operation.result.status=state.lifecycle==='running'&&sameContext(arm.command.context,client.context)&&operation.result.status==='pending'?'input-written':'unknown';
          operation.result.evidenceSequences.push(observe(client,'input',{inputId:report.armedInputId,source:arm.prepared.source,timestamp:arm.prepared.timestamp},arm.command.operationId));
          if(client.manifest.role==='participant'&&client.manifest.fixtureRoot){
            const names=arm.prepared.source==='inf-notebook'?['export/recent.json','records/summary.json']:arm.prepared.source==='reflux'?['latest.json','tracker.tsv']:['today-updates.json'];
            const files=names.map(name=>{const path=canonicalWritePath(client.manifest.fixtureRoot,join(client.manifest.fixtureRoot,name));return {name,content:readFileSync(path,'utf8')};});
            log('inputs.jsonl',{operationId:arm.command.operationId,inputId:arm.prepared.inputId,context:arm.command.context,source:arm.prepared.source,files});
          }
        }
        beginPeers();
        if(state.roomId&&(client.normalSnapshot?.room_state==='PICKING'||client.eventSnapshot?.phase==='PICKING')){
          const token=structuredClone(client.context);const candidates=await productRequest(`/api/rooms/${encodeURIComponent(state.roomId)}/charts?play_style=SP&level_filter=ANY&limit=100`);
          if(sameContext(token,client.context))state.chartCandidates=(candidates.charts??[]).map(chart=>({chartKey:chart.chart_key,title:chart.title,expectedKey:{play_style:chart.play_style,difficulty:chart.difficulty,title_search_key:chart.title_search_key,...(chart.chart_id?{chart_id:chart.chart_id}:{})}}));
        }
        recalculateActions(client);considerAuto(client);flush();value={};
      }else if(request.method==='POST'&&request.url==='/finish'){
        if(!['participant','self'].includes(client.manifest.role))throw new Error('Product adapter required');
        const report=await body(request),operation=commands.get(report.operationId);
        if(!operation||operation.command.targetClientId!==client.manifest.clientId||!operation.claimed)throw new Error('Foreign or unclaimed operation');
        if(!['pending','sent'].includes(operation.result.status))throw new Error('Operation already settled; late finish cannot replay it');
        const focus=report.nativeFocus;
        const focusConfirmed=operation.command.action==='client.focus'&&report.status==='confirmed'&&focus?.protocolVersion===1&&focus.focused===true&&focus.operationId===operation.command.operationId&&focus.sessionId===manifest.sessionId&&focus.clientId===client.manifest.clientId;
        if(!sameContext(operation.command.context,client.context)){operation.result.status=report.status==='sent'||focusConfirmed?'unknown':'cancelled';operation.result.reason='context changed during adapter operation';}
        else if(operation.command.action==='client.focus'){
          operation.result.status=focusConfirmed?'confirmed':'failed';operation.result.reason=focusConfirmed?'この端末の実窓の表示・フォーカスを確認しました。製品WS受付ではありません。':'実窓のフォーカスを確認できませんでした。';
          operation.result.evidenceSequences.push(observe(client,'operation',{event:'native_focus',focused:focusConfirmed},operation.command.operationId,'native'));
        }
        else {operation.result.status=report.status==='sent'?'sent':'failed';operation.result.reason=report.reason??null;}
        if(operation.command.action==='participant.leave'&&report.status==='sent')client.connection='LEFT';
        receipts.snapshot(client,sequence,false);
        recalculateActions(client);flush();
        value={};
      }else throw new Error('Unsupported private route');
      response.end(JSON.stringify(value));
    }catch(error){response.statusCode=error.message==='Unauthorized'?401:400;response.end(JSON.stringify({error:error.message}));}
  });
  state.lifecycle='running';for(const client of clients)recalculateActions(client);flush();
  evidence.write(join(spool,'manifest.json'),evidenceManifest(manifest));
  for(const name of ['operations.jsonl','observations.jsonl','inputs.jsonl'])if(!existsSync(join(spool,name)))evidence.write(join(spool,name),{kind:'stream-start',sessionId:manifest.sessionId});
  return {state,stop,observe,startSession,collectEvidence,clientExited,listen:()=>new Promise((res,rej)=>{server.once('error',rej);server.listen(manifest.broker.port,'127.0.0.1',res);}),close:()=>new Promise(res=>server.close(res))};
}
