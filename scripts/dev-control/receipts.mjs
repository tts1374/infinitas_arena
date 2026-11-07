import { canonicalJson } from './protocol.mjs';

const resultAction=action=>['result.send','result.delay'].includes(action);
function sameMatch(a,b){return !!a&&!!b&&['sessionId','targetClientId','roomId','roomGeneration','matchId','eventId'].every(key=>canonicalJson(a[key])===canonicalJson(b[key]));}
function sameRoom(a,b){return !!a&&!!b&&['sessionId','targetClientId','roomId'].every(key=>canonicalJson(a[key])===canonicalJson(b[key]));}
function sameRound(a,b) {
  return !!a&&!!b&&['sessionId','targetClientId','roomId','roomGeneration','matchId','eventId','roundIndex','roundId','expectedKey','selectionRevision'].every(key=>canonicalJson(a[key])===canonicalJson(b[key]));
}
function scopedMessage(message,context) {return message.room_id===context.roomId;}
function sameScope(a,b){return sameRoom(a,b)&&a.roomGeneration===b.roomGeneration;}
function validSequence(sequence){return Number.isSafeInteger(sequence)&&sequence>0;}
function afterSend(item,sent){return validSequence(item.sequence)&&item.sequence>sent.sequence;}
function requestSend(entry,item){const requestId=item.message.payload?.request_id;return requestId&&entry.sent.find(sent=>afterSend(item,sent)&&[sent.message.client_msg_id,sent.message.payload?.request_id].includes(requestId));}
function matchingSnapshot(item,sent,context){
  return item.authoritative&&afterSend(item,sent)&&sameScope(context,item.context)&&
    (!item.normal||item.normal.room_id===context.roomId&&item.normal.generation===context.roomGeneration)&&
    (!item.event||item.event.room_id===context.roomId&&item.event.generation===context.roomGeneration);
}

/** Post-send evidence is independent of notification/snapshot order; it never creates a product acknowledgement. */
export class ReceiptLedger {
  constructor({commands,onTransition=()=>{}}){this.commands=commands;this.onTransition=onTransition;this.entries=new Map();}
  entry(operation){let entry=this.entries.get(operation.command.operationId);if(!entry){entry={sent:[],received:[],snapshots:[]};this.entries.set(operation.command.operationId,entry);}return entry;}
  sent(client,message,operationId,context,sequence){
    const operation=this.commands.get(operationId);
    if(!validSequence(sequence)||!operation||operation.command.targetClientId!==client.manifest.clientId||!sameRound(operation.command.context,context)||!scopedMessage(message,context)||message.player_id!==client.manifest.playerId||!message.client_msg_id)return;
    const entry=this.entry(operation);
    if(!entry.sent.length){entry.snapshots=[];entry.received=[];}
    entry.sent.push({message,sequence});if(entry.sent.length>8)entry.sent.shift();this.evaluate(operation,client);
  }
  received(client,message,context,sequence){
    for(const operation of this.commands.values()){
      if(operation.command.targetClientId!==client.manifest.clientId||!sameScope(operation.command.context,context)||!scopedMessage(message,context))continue;
      const entry=this.entry(operation);
      if(!entry.sent.some(sent=>afterSend({sequence},sent)))continue;
      const addressed=['EVENT_ACTION_ACK','EVENT_ERROR'].includes(message.type)&&context.roomGeneration===operation.command.context.roomGeneration&&requestSend(entry,{message,sequence});
      const normalRound=sameMatch(operation.command.context,context)&&(['PLAYER_ROUND_CONFIRMED','ROUND_ENDED'].includes(message.type)&&message.payload?.round_index===operation.command.context.roundIndex||message.type==='RESULT_READY'&&message.payload?.summary?.match_id===operation.command.context.matchId);
      if(sameRound(operation.command.context,context)||addressed||normalRound){entry.received.push({message,sequence});if(entry.received.length>60)entry.received.shift();}
      const normal=message.payload?.room_state_snapshot,event=message.payload?.event_room_snapshot;
      if(normal||event){
        const snapshotContext={...context,roomId:event?.room_id??normal?.room_id??null,roomGeneration:event?.generation??normal?.generation??null,matchId:normal?.current_match_id??null,eventId:event?.event_id??null,roundIndex:normal?.current_round?.round_index??null,roundId:event?.current_round_id??null,expectedKey:event?.selected_chart?.expected_key??normal?.current_round?.expected_key??null,selectionRevision:event?.selection_revision??null};
        entry.snapshots.push({normal,event,context:snapshotContext,connection:client.connection,sequence,authoritative:true});if(entry.snapshots.length>8)entry.snapshots.shift();
      }
      this.evaluate(operation,client);
    }
  }
  snapshot(client,sequence=null,authoritative=true){
    for(const operation of this.commands.values()){
      if(operation.command.targetClientId!==client.manifest.clientId||!sameScope(operation.command.context,client.context))continue;
      const entry=this.entry(operation);entry.snapshots.push({normal:client.normalSnapshot,event:client.eventSnapshot,context:structuredClone(client.context),connection:client.connection,sequence,authoritative});if(entry.snapshots.length>8)entry.snapshots.shift();
      this.evaluate(operation,client);
    }
  }
  evaluate(operation,client){
    if(!['pending','sent','input-written','parsed','unknown'].includes(operation.result.status))return;
    const entry=this.entry(operation),c=operation.command.context;
    if(!entry.sent.length){
      const action=operation.command.action;
      if(sameScope(c,client.context)&&(operation.claimed||operation.localDispatched)&&['participant.disconnect','participant.reconnect'].includes(action)&&client.context.transportEpoch>c.transportEpoch&&client.connection===(action==='participant.disconnect'?'DISCONNECTED':'CONNECTED'))this.settle(operation,'confirmed','transportのepochと接続観測を照合しました。製品受付ACKではありません。',[]);
      return;
    }
    const error=entry.received.find(item=>item.message.type==='EVENT_ERROR'&&requestSend(entry,item));
    if(error){this.settle(operation,'rejected',error.message.payload.code,[error.sequence,...entry.sent.map(x=>x.sequence)]);return;}
    // Normal ERROR has no request id: retain uncertainty instead of inventing an acknowledgement.
    if(entry.received.some(({message})=>message.type==='ERROR')){
      operation.result.status='unknown';operation.result.reason='通常ERRORを観測しました。再同期で状態を確認してください。';
    }
    if(!resultAction(operation.command.action)){
      const action=operation.command.action,p=operation.command.payload;
      const eventSent=entry.sent.some(({message})=>message.type==='EVENT_ACTION');
      const ack=entry.received.find(item=>item.message.type==='EVENT_ACTION_ACK'&&requestSend(entry,item)&&Number.isSafeInteger(item.message.payload?.applied_revision));
      const snapshot=entry.snapshots.find(item=>{
        if(!matchingSnapshot(item,ack?requestSend(entry,ack):entry.sent[0],c))return false;
        const {normal:n,event:e,context,connection}=item;
        const event=e&&(!c.eventId||e.event_id===c.eventId)&&e.generation===c.roomGeneration&&(!eventSent||action==='state.refresh'||ack&&e.revision>=ack.message.payload.applied_revision);
        const normal=n&&n.generation===c.roomGeneration&&(!c.matchId||n.current_match_id===c.matchId);
        switch(action){
          case 'ready.set':return normal&&n.players?.some(player=>player.player_id===client.manifest.playerId&&player.ready===p.ready);
          case 'pick.submit':return normal&&n.picks?.some(pick=>pick.player_id===client.manifest.playerId&&pick.pick_chart_key===p.chartKey);
          case 'match.start':return n&&n.generation===c.roomGeneration&&n.room_state==='PICKING'&&n.current_match_id!==c.matchId;
          case 'match.returnToLobby':return n&&n.generation===c.roomGeneration&&n.room_state==='LOBBY'&&(!n.current_match_id||n.current_match_id===c.roomId)&&!n.current_round&&n.result_ready===false;
          case 'match.forceAdvance':return normal&&(n.current_round?.round_index>c.roundIndex||n.room_state==='RESULT');
          case 'event.start':return event&&['PICKING','PLAYING'].includes(e.phase);
          case 'event.confirmPick':return event&&e.phase==='PICKING'&&e.selected_chart?.chart_key===p.chartKey&&e.selection_revision>c.selectionRevision;
          case 'event.cancelPick':return event&&e.phase==='PICKING'&&!e.selected_chart&&e.selection_revision>c.selectionRevision;
          case 'event.startRound':return event&&e.phase==='PLAYING'&&e.round_phase==='ACTIVE'&&e.current_round_id===c.roundId;
          case 'event.closeRound':return event&&e.round_phase==='RESULT'&&e.current_round_id===c.roundId;
          case 'event.nextPick':return event&&e.phase==='PICKING'&&e.current_round_id!==c.roundId;
          case 'event.end':return event&&['RESULT','CLOSED'].includes(e.phase);
          case 'participant.disconnect':return connection==='DISCONNECTED'&&context.transportEpoch>c.transportEpoch;
          case 'participant.reconnect':return connection==='CONNECTED'&&context.transportEpoch>c.transportEpoch;
          case 'participant.leave':return event?e.participants?.some(player=>player.player_id===client.manifest.playerId&&player.connection_state==='LEFT'):normal&&!n.players?.some(player=>player.player_id===client.manifest.playerId);
          case 'state.refresh':return event||normal;
          default:return false;
        }
      });
      if(snapshot)this.settle(operation,'confirmed','正規送信後のsnapshot/接続観測で操作後状態を照合しました。',[...entry.sent.map(item=>item.sequence),snapshot.sequence,...(ack?[ack.sequence]:[])]);
      return;
    }
    let sent=entry.sent.find(({message})=>c.eventId?message.type==='EVENT_ACTION'&&message.payload?.action==='SUBMIT':message.type==='RESULT_SUBMIT');
    if(!sent)return;
    let receipts=[];
    if(c.eventId){
      const ack=entry.received.find(item=>item.message.type==='EVENT_ACTION_ACK'&&requestSend(entry,item)?.message.payload?.action==='SUBMIT'&&Number.isSafeInteger(item.message.payload?.applied_revision));
      if(!ack)return;
      sent=requestSend(entry,ack);
      const snapshot=entry.snapshots.find(item=>matchingSnapshot(item,sent,c)&&sameMatch(c,item.context)&&item.event?.revision>=ack.message.payload.applied_revision&&item.event.current_round_id===c.roundId&&item.event.participants?.some(p=>p.player_id===client.manifest.playerId&&p.round_status==='SUBMITTED'));
      if(!snapshot)return;receipts=[ack.sequence,snapshot.sequence];
    }else{
      const confirmed=entry.received.find(({message,sequence})=>afterSend({sequence},sent)&&message.type==='PLAYER_ROUND_CONFIRMED'&&message.payload?.player_id===client.manifest.playerId&&message.payload.round_index===c.roundIndex&&message.payload.status==='PLAYED'&&message.payload.metric_value===sent.message.payload.metric_value);
      if(!confirmed)return;
      const ended=entry.received.find(({message,sequence})=>afterSend({sequence},sent)&&message.type==='ROUND_ENDED'&&message.payload?.round_index===c.roundIndex);
      const final=entry.received.find(({message,sequence})=>afterSend({sequence},sent)&&message.type==='RESULT_READY'&&message.payload?.summary?.match_id===c.matchId&&message.payload.per_round?.rounds?.some(round=>round.round_index===c.roundIndex&&round.results?.some(p=>p.player_id===client.manifest.playerId&&p.status==='PLAYED'&&p.metric_value===sent.message.payload.metric_value)));
      const snapshot=entry.snapshots.find(item=>{const {normal,context}=item;return matchingSnapshot(item,sent,c)&&sameMatch(c,context)&&normal?.current_match_id===c.matchId&&canonicalJson(normal.frozen_rounds?.find(r=>r.round_index===c.roundIndex)?.expected_key)===canonicalJson(c.expectedKey)&&(
        normal.current_round?.round_index===c.roundIndex&&normal.current_round.confirmed?.some(p=>p.player_id===client.manifest.playerId&&p.status==='PLAYED'&&p.metric_value===sent.message.payload.metric_value)||
        ended&&normal.current_round?.round_index>c.roundIndex||final&&['RESULT','CLOSED'].includes(normal.room_state)&&normal.result_ready===true);});
      if(!snapshot)return;receipts=[confirmed.sequence,snapshot.sequence];
    }
    this.settle(operation,'confirmed','正規送信・受付通知・同一曲snapshotを照合しました。',[sent.sequence,...receipts]);
  }
  settle(operation,status,reason,sequences){operation.result.status=status;operation.result.reason=reason;operation.result.evidenceSequences=[...new Set([...operation.result.evidenceSequences,...sequences.filter(Number.isSafeInteger)])];this.onTransition(operation);}
}
