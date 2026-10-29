import { existsSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalWritePath, ensureOwnedDirectory, SOURCES } from '../guards.mjs';

const difficulties = { BEGINNER:'B', NORMAL:'N', HYPER:'H', ANOTHER:'A', LEGGENDARIA:'L' };
const emptyV3 = {type:'today_updates',data:{items:[]}};
function v3Fingerprint(input) {
  const seed=[input.title,`${input.expectedKey.play_style}${difficulties[input.expectedKey.difficulty]}`,input.exScore,input.missCount,
    input.exScore,input.missCount,'CLEAR',input.option,input.playSpeed].join('|');
  let hash=2166136261;
  for(let index=0;index<seed.length;index++){hash^=seed.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16).padStart(8,'0');
}
function timestamp(ms) {
  const date = new Date(ms), part = value => String(value).padStart(2,'0');
  return `${date.getFullYear()}${part(date.getMonth()+1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
}

/** File supplier only. Process creation/ownership belongs to the dedicated launcher. */
export async function createSourceSupplier({manifest,clientId,verifyContext}) {
  const client = manifest.clients.find(entry => entry.clientId === clientId);
  if (!client || client.role !== 'participant' || client.transport !== 'real-client' ||
    !SOURCES.includes(client.source) || !client.fixtureRoot || typeof verifyContext !== 'function') throw new Error('Unsupported source participant');
  const forbidden = manifest.clients.flatMap(entry => entry.clientId === clientId ? [] :
    [entry.fixtureRoot,...(entry.readOnlySource?.paths ?? []),entry.storageRoot,entry.spoolRoot].filter(Boolean));
  const root = canonicalWritePath(manifest.runtimeRoot,client.fixtureRoot,forbidden);
  const controlFile = join(root,'today-updates.json');
  if (client.sourceControlFile && resolve(client.sourceControlFile) !== controlFile) throw new Error('Source control file mismatch');
  if (client.source === 'daken_counter_v3' && (!Number.isInteger(client.sourcePort) || client.sourcePort < 1024 || client.sourcePort > 65535 ||
    manifest.clients.some(entry => entry.clientId !== clientId && (entry.sourcePort === client.sourcePort || entry.readOnlySource?.port === client.sourcePort)))) throw new Error('Source port overlap or invalid port');
  let stopped = false, revision = 0, pending = null;
  const stateFile = join(root,'supplier-state.json');
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(canonicalWritePath(root,stateFile,forbidden),'utf8')) : {lastTimestampMs:0,playSequence:0};
  function write(relativePath,value) {
    const path = canonicalWritePath(root,join(root,relativePath),forbidden);
    ensureOwnedDirectory(root,resolve(path,'..'),forbidden);
    const temporary = canonicalWritePath(root,`${path}.tmp`,forbidden);
    writeFileSync(temporary,typeof value === 'string' ? value : `${JSON.stringify(value)}\n`,'utf8');
    const fd = openSync(temporary,'r+');try { fsyncSync(fd); } finally { closeSync(fd); }
    // Revalidate immediately before replacing a watched file.
    canonicalWritePath(root,path,forbidden);
    renameSync(temporary,path);
  }
  function baseline() {
    if (client.source === 'inf-notebook') {
      write('export/recent.json',{list:[]});write('records/summary.json',{musics:{}});
    } else if (client.source === 'reflux') {
      write('tracker.tsv','title\tSPA Lamp\tSPA EX Score\tSPA Miss Count\n');
      // No play is present. The product parser ignores this incomplete record;
      // a synthetic song would instead produce an unresolved-alias dialog.
      write('latest.json',{});
    } else write('today-updates.json',emptyV3);
  }
  function check(input) {
    if (stopped || pending !== input || input.revision !== revision || !verifyContext(input.context)) throw new Error('Source input context expired');
  }
  return {
    async initializeBaseline() {
      if(stopped)throw new Error('Supplier stopped');
      revision++;pending=null;baseline();write('supplier-state.json',state);
    },
    async prepareInput({context,expectedKey,title,exScore,missCount}) {
      if(stopped || !verifyContext(context))throw new Error('Source context expired');
      if(!expectedKey || !['SP','DP'].includes(expectedKey.play_style) || !difficulties[expectedKey.difficulty] ||
        typeof title !== 'string' || !title.trim() || /[\r\n\t]/.test(title) ||
        ![exScore,missCount].every(value=>Number.isInteger(value)&&value>=0)) throw new Error('Invalid source input');
      if(client.source === 'daken_counter_v3' && (!Number.isInteger(expectedKey.chart_id)||expectedKey.chart_id<=0))throw new Error('v3 requires the observed chart ID');
      revision++;pending=null;
      const preparedRevision=revision;
      // Notebook has one-second precision: wait for a real later second, never future-date a play.
      const minimum = Math.floor(state.lastTimestampMs/1000)*1000+1000;
      const delay = minimum-Date.now();
      if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
      if(stopped || revision!==preparedRevision || !verifyContext(context))throw new Error('Source context expired while waiting for timestamp');
      state.lastTimestampMs=Date.now();state.playSequence++;
      // A second valid play may have the same EX/MISS but different legal speed/options.
      // No timestamp-only escape and no duplicate-fingerprint acceptance is introduced.
      if(state.playSequence>1902)throw new Error('Mock play variants exhausted; start a new session');
      const input={inputId:randomUUID(),source:client.source,timestamp:timestamp(state.lastTimestampMs),context:structuredClone(context),revision,
        expectedKey:structuredClone(expectedKey),title:title.trim(),exScore,missCount,
        playSpeed:(0.50+((state.playSequence-1)%951)*0.01).toFixed(2),option:state.playSequence>951?'RANDOM':'OFF'};
      if(client.source==='daken_counter_v3')input.sourceFingerprint=v3Fingerprint(input);
      write('supplier-state.json',state);pending=input;return input;
    },
    async supply(input) {
      check(input);
      const {expectedKey:key,title,exScore,missCount,timestamp:at}=input;
      const diff=`${key.play_style}${difficulties[key.difficulty]}`;
      if(client.source==='inf-notebook') {
        write('export/recent.json',{list:[{timestamp:at,difficulty:key.difficulty,music:title,score:exScore,misscount:missCount}]});
        check(input);
        write('records/summary.json',{musics:{[title]:{[key.play_style]:{[key.difficulty]:{latest:{timestamp:at,score:exScore,misscount:missCount}}}}}});
      } else if(client.source==='reflux') {
        write('tracker.tsv',`title\t${diff} Lamp\t${diff} EX Score\t${diff} Miss Count\n${title}\tAC\t${exScore}\t${missCount}\n`);
        check(input);
        const bad=Math.floor(missCount/2);
        write('latest.json',{timestamp:at,title,title2:title,diff,exscore:String(exScore),bad:String(bad),poor:String(missCount-bad),assist:'OFF',lamp:'AC',playtype:key.play_style});
      } else {
        // Use an opaque ID as the real v3 does; this is not the arena catalog ID.
        const externalId=createHash('sha256').update(`${title}|${diff}`).digest('hex');
        write('today-updates.json',{type:'today_updates',data:{items:[{battle:0,title,difficulty:diff,chart_id:externalId,score:exScore,bp:missCount,
          pre_score:exScore,pre_bp:missCount,lamp:'CLEAR',pre_lamp:'CLEAR',opt:input.option,playspeed:input.playSpeed}]}});
      }
      pending=null;
      return {inputId:input.inputId,status:'input-written'};
    },
    async invalidate() { revision++;pending=null;if(!stopped)baseline(); },
    async stop() { revision++;pending=null;if(!stopped)baseline();stopped=true; },
  };
}
