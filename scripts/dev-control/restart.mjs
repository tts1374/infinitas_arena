import { readFileSync, realpathSync } from 'node:fs';
import { dirname, basename } from 'node:path';

/** Only these launch choices may change; real self source references remain inherited. */
export function validateRestartOptions(options) {
  const fields=['mode','hostClientId','opponentSource','visibleOpponents','playerCount'];
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).length!==fields.length||Object.keys(options).some(key=>!fields.includes(key)))throw new Error('Invalid restart option fields');
  if(!['ARENA','BPL','BPL4','CASUAL','TOURNAMENT'].includes(options.mode)||!['A','B'].includes(options.hostClientId)||!['inf-notebook','reflux','daken_counter_v3'].includes(options.opponentSource))throw new Error('Invalid restart option');
  const count=options.playerCount,visible=options.visibleOpponents;
  if(!Number.isSafeInteger(count)||!Number.isSafeInteger(visible)||count<2||count>20||visible<1||visible>=count)throw new Error('Invalid restart participant count');
  if(options.mode==='ARENA'&&count!==4||['BPL','BPL4'].includes(options.mode)&&count!==2)throw new Error('Normal mode has a fixed initial participant count');
  return options;
}

export function readRestartOptions(manifestPath,optionsPath,sessionId) {
  const canonical=realpathSync(optionsPath);
  if(dirname(canonical)!==dirname(realpathSync(manifestPath))||!/^restart-options-[0-9]+\.json$/.test(basename(canonical)))throw new Error('Restart options must belong to the stopped session');
  const bytes=readFileSync(canonical);if(bytes.length>1048576)throw new Error('Restart options too large');
  const request=JSON.parse(bytes.toString('utf8'));
  if(Object.keys(request).length!==3||Object.keys(request).some(key=>!['protocolVersion','sessionId','options'].includes(key))||request.protocolVersion!==1||request.sessionId!==sessionId)throw new Error('Restart request identity mismatch');
  return validateRestartOptions(request.options);
}

export function applyRestartOptions(launch,options) {
  validateRestartOptions(options);
  return {...launch,mode:options.mode,hostClient:options.hostClientId,opponentSource:options.opponentSource,visibleOpponents:options.visibleOpponents,playerCount:options.playerCount};
}
