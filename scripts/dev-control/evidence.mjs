import { appendFileSync, closeSync, fsyncSync, openSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { canonicalWritePath } from './guards.mjs';

const privateKey = /token|authorization|password|cookie|secret|joincode|hostkey|rejoin|resume|readonlysource|selfdirectory|sourcepaths|watchedpaths/i;
const normalized = key => key.replace(/[_-]/g,'');

/** Keep the last valid state/authority if a write is interrupted before replacement. */
export function writeSessionFile(root,path,data,replace=renameSync) {
  const target=canonicalWritePath(root,path),temporary=canonicalWritePath(root,`${target}.${randomUUID()}.tmp`);
  const fd=openSync(temporary,'wx');
  try {
    writeFileSync(fd,data,'utf8');fsyncSync(fd);
  } catch(error) { closeSync(fd);try{unlinkSync(temporary);}catch{}throw error; }
  closeSync(fd);
  try {
    if(readFileSync(temporary,'utf8')!==data)throw new Error('Evidence read-back mismatch');
    for(let attempt=0;;attempt++){
      try{replace(temporary,target);break;}
      catch(error){
        if(attempt>=7||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;
        // Windows readers/antivirus can briefly deny an atomic replacement.
        // Never fall back to truncating the last valid file.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20*(attempt+1));
      }
    }
    if(readFileSync(target,'utf8')!==data)throw new Error('Evidence read-back mismatch');
  } finally { try{unlinkSync(temporary);}catch{} }
}

/** A single boundary for every tool-owned evidence write. Never modifies live authority. */
export function createEvidenceWriter(root, initialSecrets=[]) {
  const secrets=new Set(initialSecrets.filter(value=>typeof value==='string'&&value.length));
  function learn(value) {
    if(Array.isArray(value)){for(const item of value)learn(item);}
    else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
      if(privateKey.test(normalized(key))&&typeof item==='string'&&item.length)secrets.add(item);
      else learn(item);
    }
  }
  function text(value) {
    let result=value;
    for(const secret of [...secrets].sort((a,b)=>b.length-a.length))result=result.split(secret).join('[REDACTED]');
    return result.replace(/Bearer\s+[^\s"',}]+/gi,'Bearer [REDACTED]');
  }
  function redact(value) {
    learn(value);
    function visit(item) {
      if(typeof item==='string')return text(item);
      if(Array.isArray(item))return item.map(visit);
      if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,child])=>[key,normalized(key).toLowerCase()==='readonlysource'?null:privateKey.test(normalized(key))?'[REDACTED]':visit(child)]));
      return item;
    }
    return visit(value);
  }
  function write(path,value,append=false) {
    const target=canonicalWritePath(root,path),data=JSON.stringify(redact(value))+'\n';
    if(!append){writeSessionFile(root,target,data);return;}
    appendFileSync(target,data,'utf8');
    const fd=openSync(target,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
    const written=readFileSync(target,'utf8');
    if(append?!written.endsWith(data):written!==data)throw new Error('Evidence read-back mismatch');
  }
  function pipe(stream,path,onError=()=>{}) {
    const decoder=new StringDecoder('utf8');let pending='',dropping=false;
    function line(value) {
      try{
        const parsed=JSON.parse(value);
        // Child stdout is diagnostic, never a second collector for original settings or source payloads.
        const allowed=['level','status','code','event','clientId','timestamp','operationId','request_id','client_msg_id'];
        const projection=parsed&&typeof parsed==='object'?Object.fromEntries(allowed.filter(key=>typeof parsed[key]==='string'||typeof parsed[key]==='number').map(key=>[key,parsed[key]])):{};
        learn(parsed);write(path,projection,true);
      }catch(error){
        if(error instanceof SyntaxError)write(path,{diagnostic:'Unstructured process output omitted before persistence'},true);
        else throw error;
      }
    }
    stream.on('data',chunk=>{try{
      pending+=decoder.write(chunk);
      let end;
      while((end=pending.indexOf('\n'))!==-1){const value=pending.slice(0,end);pending=pending.slice(end+1);if(!dropping)line(value);dropping=false;}
      if(pending.length>65536){pending='';dropping=true;}
    }catch(error){pending='';dropping=true;onError(error);}});
    stream.on('end',()=>{try{pending+=decoder.end();if(pending&&!dropping)line(pending);}catch(error){onError(error);}});
    stream.on('error',onError);
  }
  return {redact,write,pipe};
}

/** Runtime manifest remains private; the export contains no original-source configuration. */
export function evidenceManifest(manifest) {
  return {protocolVersion:1,sessionId:manifest.sessionId,sourceHead:manifest.sourceHead,mode:manifest.mode,hostClientId:manifest.hostClientId,
    clients:manifest.clients.map(({clientId,playerId,role,transport,source})=>({clientId,playerId,role,transport,source})),
    collectedAt:new Date().toISOString(),excluded:['original settings/history','self source files','whole-day source input','authentication material']};
}
