import { ACTIONS, canonicalJson } from './protocol.mjs';

export function roundSignature(context) {
  const { sessionId, targetClientId, roomId, roomGeneration, matchId, eventId, roundIndex, roundId, expectedKey, selectionRevision } = context;
  return canonicalJson({ sessionId, targetClientId, roomId, roomGeneration, matchId, eventId, roundIndex, roundId, expectedKey, selectionRevision });
}

/** Conservative tool availability; product stores/server remain authoritative. */
export function deriveActions(client, { lifecycle, eventMode, availableParticipants, operations, now = Date.now() }) {
  const normal = client.normalSnapshot, event = client.eventSnapshot, snapshot = event ?? normal;
  const connected = client.connection === 'CONNECTED';
  const playerId = client.manifest.playerId;
  const host = event ? event.host.player_id === playerId : normal?.host_player_id === playerId;
  const member = event?.participants.find(p => p.player_id === playerId);
  const left = client.connection === 'LEFT' || ['LEFT', 'KICKED'].includes(member?.connection_state);
  const phase = event?.phase ?? normal?.room_state;
  const terminal = event ? ['RESULT', 'CLOSED'].includes(phase) : phase === 'CLOSED';
  const submitted = normal?.current_round?.confirmed.some(p => p.player_id === playerId);
  const started = normal?.current_round && now >= Date.parse(normal.current_round.round_started_at) + 55000;
  const interRoundResult = normal?.room_state === 'PLAYING' && normal.current_round?.round_index > 0 && now < Date.parse(normal.current_round.round_started_at);
  const pending = event
    ? event.phase === 'PLAYING' && event.round_phase === 'ACTIVE' && event.current_playing_player_ids.includes(playerId) && member?.round_status === 'PENDING'
    : normal?.room_state === 'PLAYING' && normal.current_round && !submitted && started;
  const displayPhase = event
    ? ({ LOBBY:'E0', PICKING:event.selected_chart ? 'E2' : 'E1', PLAYING:event.round_phase === 'RESULT' ? 'E4' : 'E3', RESULT:'E5', CLOSED:'E6' })[phase]
    : normal ? ({ LOBBY:'N0', PICKING:'N1', PLAYING:interRoundResult ? 'N4' : started ? 'N3' : 'N2', RESULT:'N5', CLOSED:'N6' })[phase] : null;
  const allowed = new Set(['draft.update', 'policy.apply', 'reservation.cancel', 'state.refresh', 'client.focus']);
  if (client.manifest.transport !== 'real-client') allowed.delete('client.focus');
  if (connected && !terminal && !left) {
    allowed.add('participant.disconnect');
    if (!event || !host && event.host.connected) allowed.add('participant.leave');
  } else if (snapshot && !terminal && !left && client.connection === 'DISCONNECTED') allowed.add('participant.reconnect');
  if (connected && normal?.room_state === 'LOBBY') allowed.add('ready.set');
  if (connected && normal?.room_state === 'PICKING') {
    const player = normal.players.find(p => p.player_id === playerId);
    if (player && normal.picks.filter(p => p.player_id === playerId).length < (normal.settings.mode === 'BPL4' ? 2 : 1)) allowed.add('pick.submit');
  }
  if (connected && host) {
    if (normal?.room_state === 'LOBBY' && normal.settings.auto_match !== true && normal.players.length >= 2 && normal.players.every(p => p.ready)) allowed.add('match.start');
    if (normal?.room_state === 'PLAYING' && !interRoundResult && normal.current_round && normal.current_round.confirmed.length < normal.players.length) allowed.add('match.forceAdvance');
    if (normal?.room_state === 'RESULT') allowed.add('match.returnToLobby');
    if (event?.host.connected) {
      if (phase === 'LOBBY' && event.participants.some(p => !['LEFT','KICKED'].includes(p.connection_state))) allowed.add('event.start');
      if (phase === 'PICKING') {
        allowed.add(event.selected_chart ? 'event.cancelPick' : 'event.confirmPick');
        if (event.selected_chart && event.current_eligible_player_ids.length) allowed.add('event.startRound');
      }
      if (phase === 'PLAYING') allowed.add(event.round_phase === 'RESULT' ? 'event.nextPick' : 'event.closeRound');
      if (!terminal) allowed.add('event.end');
    }
  }
  const entries = [...operations].filter(op => op.command.targetClientId === client.manifest.clientId);
  const resultBusy = entries.some(op => ['result.send','result.delay'].includes(op.command.action) &&
    ['pending','reserved','input-written','parsed','sent','unknown'].includes(op.result.status) && roundSignature(op.command.context) === roundSignature(client.context));
  const busy = entries.some(op => !['draft.update','policy.apply','reservation.cancel','state.refresh','client.focus'].includes(op.command.action) && ['pending','input-written','parsed','sent'].includes(op.result.status));
  if (connected && pending && !resultBusy && client.draft.exScore !== null && client.draft.missCount !== null) {
    allowed.add('result.send'); allowed.add('result.delay');
  }
  if (busy) for (const action of [...allowed]) if (!['draft.update','policy.apply','reservation.cancel','state.refresh','client.focus'].includes(action)) allowed.delete(action);
  if (phase === 'RESULT' || phase === 'CLOSED') { allowed.delete('draft.update'); allowed.delete('policy.apply'); }
  return { displayPhase, actions: ACTIONS.map(action => {
    const selfRead = client.manifest.role === 'self' && ['client.focus','state.refresh'].includes(action);
    const controller = client.manifest.role === 'controller' && ['session.stop','state.refresh','evidence.save',...(eventMode && availableParticipants.length ? ['participant.add'] : [])].includes(action);
    const enabled = lifecycle === 'running' && (selfRead || controller || client.manifest.role === 'participant' && allowed.has(action));
    return { action, enabled, reason: enabled ? null : client.manifest.role === 'self' ? '本人Aは実アプリから操作してください。' : busy ? '前の操作の返答を待っています。' : '現在の正規状態・権限・接続・提出条件では操作できません。' };
  }) };
}
