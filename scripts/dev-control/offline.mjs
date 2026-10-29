import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readManifest } from './guards.mjs';
import { createEvidenceWriter } from './evidence.mjs';
import { inventory, listeners, stopOwned } from './processes.mjs';
import { canonicalJson, sameContext, validateCommand } from './protocol.mjs';

export function verifyStopped(manifest,state,processes,ports){
  if(!manifest.runtimeOwner?.pid||!manifest.runtimeOwner?.createdAt||!manifest.runtimeOwner?.executablePath)throw new Error('Immutable runtime owner is missing');
  const ledger=[manifest.runtimeOwner,...(manifest.ownedProcesses??[]).filter(p=>p.kind!=='controller')];
  const assigned=new Set([manifest.broker.port,...ledger.flatMap(p=>p.ports??[])]);
  const errors=[];
  const remains=(owner,actual)=>actual.pid===owner.pid&&(owner===manifest.runtimeOwner||!actual.createdAt||!actual.executablePath||actual.createdAt===owner.createdAt&&actual.executablePath===owner.executablePath);
  for(const owner of ledger){
    const actual=processes.find(p=>p.pid===owner.pid);
    if(actual&&remains(owner,actual))errors.push(actual.createdAt!==owner.createdAt||actual.executablePath!==owner.executablePath?`PID identity is unverified: ${owner.pid}`:`Runtime process remains: ${owner.pid}`);
  }
  const occupied=ports.filter(p=>assigned.has(p.port));
  for(const port of occupied)errors.push(`Session port remains: ${port.port}`);
  const processesVerified=!ledger.some(owner=>processes.some(p=>remains(owner,p))),portsVerified=occupied.length===0;
  const complete=processesVerified&&portsVerified;
  const brokerPresent=processes.some(p=>p.pid===manifest.runtimeOwner.pid);
  if(!complete&&brokerPresent&&['starting','running'].includes(state.lifecycle)&&state.stop?.phase==='idle')throw new Error('Runtime is still present and shutdown was not requested. Retry the broker state read.');
  const controllerId=manifest.clients?.find(client=>client.role==='controller')?.clientId;
  const operations=state.operations?.map(operation=>operation.operationId===state.stop?.operationId&&controllerId&&operation.sessionId===manifest.sessionId&&operation.context?.sessionId===manifest.sessionId&&operation.context?.targetClientId===controllerId&&['pending','sent','unknown'].includes(operation.status)?{...operation,status:complete?'confirmed':'unknown',reason:complete?'所有runtimeとポートの停止をnative経路で確認しました。製品WS受付ではありません。':'所有runtimeまたはポートの停止を確認できません。最新の状態を再確認してください。'}:operation);
  return {...state,...(operations?{operations}:{}),lifecycle:complete?'stopped':'failed',recoveryRequired:!complete&&!brokerPresent,stop:{...state.stop,phase:complete?'complete':'failed',completedAt:complete?new Date().toISOString():null,errors:[...new Set([...(state.stop?.errors??[]),...errors])],processesVerified,portsVerified}};
}

/** Explicit orphan recovery only; never kill a live or reused broker identity. */
export function stopOfflineRuntime(manifest,state,command,{readProcesses=inventory,readPorts=listeners,stopProcesses=stopOwned,persist=()=>{}}={}) {
  validateCommand(command);
  const controller=state.clients.find(client=>client.manifest.role==='controller');
  if(!controller||command.action!=='session.stop'||command.sessionId!==manifest.sessionId||state.sessionId!==manifest.sessionId||command.actorClientId!==controller.manifest.clientId||command.targetClientId!==controller.manifest.clientId||!sameContext(command.context,controller.context)||command.payload.confirmationToken!==canonicalJson({context:controller.context,draft:controller.draft,action:'session.stop'}))throw new Error('Offline stop identity/confirmation mismatch');
  if(!manifest.runtimeOwner?.pid||!manifest.runtimeOwner.createdAt||!manifest.runtimeOwner.executablePath||readProcesses().some(p=>p.pid===manifest.runtimeOwner.pid))throw new Error('Broker identity is still present or unverified; retry normal stop');
  const next={...state,lifecycle:'stopping',recoveryRequired:true,stop:{...state.stop,phase:'terminating',requestedAt:new Date().toISOString(),completedAt:null,processesVerified:false,portsVerified:false}};
  next.operations=(state.operations??[]).map(operation=>operation.status==='reserved'?{...operation,status:'cancelled',reason:'制御の終了により未投入予約を取り消しました。'}:['pending','input-written','parsed','sent'].includes(operation.status)?{...operation,status:'unknown',reason:'制御の異常終了により受付結果を確認できません。'}:operation);
  persist(next);
  // Stop uses held handles and refuses PID reuse. The controller stays available
  // for readback/export/retry; original source processes are never in this ledger.
  const results=stopProcesses(manifest.ownedProcesses.filter(p=>p.kind!=='controller'));
  next.stop.errors=[...(next.stop.errors??[]),...results.filter(p=>!['stopped','already-exited'].includes(p.status)).map(p=>`Offline stop ${p.pid}: ${p.status}`)];
  const verified=verifyStopped(manifest,next,readProcesses(),readPorts());
  const result={protocolVersion:1,operationId:command.operationId,sessionId:manifest.sessionId,context:command.context,status:verified.lifecycle==='stopped'?'confirmed':'failed',reason:verified.lifecycle==='stopped'?'所有runtimeとポートの停止をnative経路で確認しました。':'停止の確認が完了していません。記録を保存し、最新状態を再確認してください。',evidenceSequences:[]};
  verified.operations=[...(verified.operations??[]).filter(operation=>operation.operationId!==command.operationId),result].slice(-200);
  persist(verified);
  return {state:verified,result};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const manifest=readManifest(process.argv[2]),spool=join(manifest.runtimeRoot,'controller-spool');
  const state=JSON.parse(readFileSync(join(spool,'state.json'),'utf8'));
  if(state.sessionId!==manifest.sessionId)throw new Error('Offline session identity mismatch');
  const writer=createEvidenceWriter(manifest.runtimeRoot);
  if(process.argv[3]==='--stop'){
    const input=readFileSync(0,'utf8');if(input.length>1048576)throw new Error('Stop request too large');
    const {result}=stopOfflineRuntime(manifest,state,JSON.parse(input),{persist:value=>writer.write(join(spool,'state.json'),value)});
    writer.write(join(spool,'operations.jsonl'),{...result,action:'session.stop',origin:'offline-native'},true);
    process.stdout.write(JSON.stringify(result));
  }else{
  let next;
  try{
    for(let attempt=0;attempt<3;attempt++){
      next=verifyStopped(manifest,state,inventory(),listeners());
      if(next.lifecycle==='stopped')break;
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,200));
    }
  }
  catch(error){
    // A transport/read failure is not a terminal stop. Preserve the live spool so
    // a later native read can reconnect to the same running session.
    if(['starting','running'].includes(state.lifecycle)&&state.stop?.phase==='idle')throw error;
    next={...state,lifecycle:'failed',stop:{...state.stop,phase:'failed',errors:[String(error.message)],processesVerified:false,portsVerified:false}};
  }
  writer.write(join(spool,'state.json'),next);
  process.stdout.write(JSON.stringify(next));
  }
}
