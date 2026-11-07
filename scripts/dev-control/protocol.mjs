export const ACTIONS = ['ready.set', 'pick.submit', 'match.start', 'match.forceAdvance', 'match.returnToLobby',
  'event.start', 'event.confirmPick', 'event.cancelPick', 'event.startRound', 'event.closeRound', 'event.nextPick', 'event.end',
  'participant.add', 'participant.disconnect', 'participant.reconnect', 'participant.leave', 'draft.update', 'policy.apply',
  'result.send', 'result.delay', 'reservation.cancel', 'client.focus', 'state.refresh', 'evidence.save', 'session.stop', 'session.restart'];
const contextFields = ['sessionId', 'targetClientId', 'transportEpoch', 'roomId', 'roomGeneration', 'matchId', 'eventId', 'roundIndex', 'roundId', 'expectedKey', 'selectionRevision', 'policyRevision', 'valueRevision'];
const payloadFields = {
  'ready.set': ['ready'], 'pick.submit': ['chartKey'], 'event.confirmPick': ['chartKey'],
  'draft.update': ['exScore', 'missCount'], 'policy.apply': ['policy', 'confirmationToken'],
  'result.send': ['valueRevision'], 'result.delay': ['valueRevision', 'delayMs'],
  'reservation.cancel': ['operationId'], 'participant.add': ['clientId'], 'evidence.save': ['destinationId'],
  'session.restart': ['confirmationToken'], 'session.stop': ['confirmationToken'],
  'event.start': ['confirmationToken'], 'event.cancelPick': ['confirmationToken'], 'event.end': ['confirmationToken'],
  'event.closeRound': ['confirmationToken'], 'match.forceAdvance': ['confirmationToken'], 'participant.leave': ['confirmationToken'],
};
function strictKeys(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(key => !keys.includes(key))) throw new Error('Unknown or invalid field');
}
export function validateContext(context) {
  strictKeys(context, contextFields);
  if (contextFields.some(key => !(key in context))) throw new Error('Missing context field');
  if (typeof context.sessionId !== 'string' || typeof context.targetClientId !== 'string') throw new Error('Invalid context identity');
  for (const key of ['transportEpoch', 'policyRevision', 'valueRevision']) if (!Number.isSafeInteger(context[key]) || context[key] < 0) throw new Error('Invalid context revision');
  for (const key of ['roomGeneration', 'roundIndex', 'selectionRevision']) if (context[key] !== null && (!Number.isSafeInteger(context[key]) || context[key] < 0)) throw new Error('Invalid nullable revision');
  for (const key of ['roomId', 'matchId', 'eventId', 'roundId']) if (context[key] !== null && typeof context[key] !== 'string') throw new Error('Invalid nullable identity');
  if (context.expectedKey !== null) {
    strictKeys(context.expectedKey, ['play_style', 'difficulty', 'title_search_key', 'chart_id']);
    if (!['SP', 'DP'].includes(context.expectedKey.play_style) || typeof context.expectedKey.difficulty !== 'string' || typeof context.expectedKey.title_search_key !== 'string') throw new Error('Invalid expected key');
  }
  return context;
}
export function canonicalJson(value){if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;if(value!==null&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;return JSON.stringify(value);}
export function sameContext(a, b) { return !!a&&!!b&&contextFields.every(field => canonicalJson(a[field]) === canonicalJson(b[field])); }
export function emptyContext(sessionId, targetClientId) {
  return { sessionId, targetClientId, transportEpoch: 0, roomId: null, roomGeneration: null, matchId: null, eventId: null, roundIndex: null, roundId: null, expectedKey: null, selectionRevision: null, policyRevision: 0, valueRevision: 0 };
}
export function validateCommand(command) {
  strictKeys(command, ['protocolVersion', 'operationId', 'sessionId', 'actorClientId', 'targetClientId', 'context', 'action', 'payload']);
  if (command.protocolVersion !== 1 || !ACTIONS.includes(command.action)) throw new Error('Unknown version/action');
  for (const key of ['operationId', 'sessionId', 'actorClientId', 'targetClientId']) if (typeof command[key] !== 'string' || command[key].length < 1 || command[key].length > 128) throw new Error('Invalid command identity');
  validateContext(command.context);
  if (command.context.sessionId !== command.sessionId || command.context.targetClientId !== command.targetClientId) throw new Error('Context identity mismatch');
  strictKeys(command.payload, payloadFields[command.action] ?? []);
  if (command.action === 'draft.update') {
    for (const key of ['exScore', 'missCount']) if (!(key in command.payload) || (command.payload[key] !== null && (!Number.isSafeInteger(command.payload[key]) || command.payload[key] < 0))) throw new Error('Invalid draft value');
  }
  if (command.action === 'ready.set' && typeof command.payload.ready !== 'boolean') throw new Error('Ready boolean required');
  if (command.action === 'policy.apply' && !['manual', 'auto', 'delay', 'hold'].includes(command.payload.policy)) throw new Error('Invalid policy');
  if (['pick.submit', 'event.confirmPick'].includes(command.action) && typeof command.payload.chartKey !== 'string') throw new Error('Chart required');
  if (command.action === 'result.delay' && command.payload.delayMs !== 10000) throw new Error('Delay must be ten seconds');
  return command;
}
