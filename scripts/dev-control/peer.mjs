import { randomUUID } from 'node:crypto';

/** A headless peer proves product WS acceptance; it never claims source monitoring. */
export class DevControlPeer {
  constructor({manifest,client,roomId,joinCode,onMessage,onConnection,onSent}){
    Object.assign(this,{manifest,client,roomId,joinCode,onMessage,onConnection,onSent});this.socket=null;this.heartbeat=null;
  }
  connect(){
    if(this.socket)return;
    const url=new URL(`/api/rooms/${encodeURIComponent(this.roomId)}/ws`,this.manifest.apiBaseUrl);url.protocol='ws:';
    if(url.hostname!=='127.0.0.1')throw new Error('Only owned local Worker is allowed');
    const socket=new WebSocket(url);this.socket=socket;this.onConnection('CONNECTING');
    socket.addEventListener('open',()=>{
      if(this.socket!==socket)return;
      const event=['CASUAL','TOURNAMENT'].includes(this.manifest.mode);
      this.send(event?'EVENT_JOIN':'ROOM_JOIN',event?{host_event_protocol:2,client_version:'1.4.0',join_code:this.joinCode,display_name:`DEV ${this.client.clientId}`,source:'reflux',song_unlocks:{bit_unlocked:true,djp_unlocked:true,allow_leggendaria:true,owned_pack_ids:[]}}:{display_name:`DEV ${this.client.clientId}`,source:'reflux',client_version:'1.4.0',join_code:this.joinCode,client_capabilities:{song_unlocks:{bit_unlocked:true,djp_unlocked:true,allow_leggendaria:true,owned_pack_ids:[]}}});
      this.heartbeat=setInterval(()=>{if(this.socket===socket&&socket.readyState===1)this.send('PING',{});},20000);
    });
    socket.addEventListener('message',({data})=>{
      if(this.socket!==socket||typeof data!=='string')return;
      let message;try{message=JSON.parse(data);}catch{return;}
      if(message.room_id!==this.roomId)return;
      if(['ROOM_JOIN_ACCEPTED','EVENT_JOIN_ACCEPTED'].includes(message.type))this.onConnection('CONNECTED');
      this.onMessage(message);
    });
    socket.addEventListener('close',()=>{if(this.socket!==socket)return;this.socket=null;clearInterval(this.heartbeat);this.onConnection('DISCONNECTED');});
    socket.addEventListener('error',()=>{if(this.socket===socket)this.onConnection('DISCONNECTED');});
  }
  disconnect(){const socket=this.socket;this.socket=null;clearInterval(this.heartbeat);socket?.close(4001,'Manual dev disconnect');this.onConnection('DISCONNECTED');}
  send(type,payload,id=randomUUID()){
    if(this.socket?.readyState!==1)throw new Error('Peer is disconnected');
    const message={type,client_msg_id:id,room_id:this.roomId,player_id:this.client.playerId,payload};
    this.socket.send(JSON.stringify(message));this.onSent(message);return message;
  }
  dispatch(command,draft,snapshot){
    const event=['CASUAL','TOURNAMENT'].includes(this.manifest.mode),id=command.operationId,c=command.context,p=command.payload;
    if(command.action==='participant.disconnect'){this.disconnect();return null;}
    if(command.action==='participant.reconnect'){this.connect();return null;}
    if(event){
      const names={'event.start':'START_EVENT','event.confirmPick':'CONFIRM_PICK','event.cancelPick':'CANCEL_PICK','event.startRound':'START_ROUND','event.closeRound':'CLOSE_ROUND','event.nextPick':'NEXT_PICK','event.end':'END_EVENT','participant.leave':'LEAVE','state.refresh':'STATE_GET','result.send':'SUBMIT','result.delay':'SUBMIT'};
      const action=names[command.action];if(!action)throw new Error('Unsupported event action');
      const payload={action,request_id:id,generation:c.roomGeneration};
      if(c.eventId!==null)payload.event_id=c.eventId;
      if(['CANCEL_PICK','START_ROUND','CLOSE_ROUND','NEXT_PICK','SUBMIT'].includes(action))payload.round_id=c.roundId;
      if(['CONFIRM_PICK','CANCEL_PICK','START_ROUND'].includes(action))payload.selection_revision=c.selectionRevision;
      if(action==='CONFIRM_PICK')payload.chart_key=p.chartKey;
      if(action==='SUBMIT'){payload.observed_key=c.expectedKey;payload.metric_value=snapshot.settings.win_metric==='MISSCOUNT'?draft.missCount:draft.exScore;}
      return this.send('EVENT_ACTION',payload,id);
    }
    const names={'ready.set':'READY_SET','pick.submit':'PICK_SUBMIT','match.start':'START_MATCH','match.forceAdvance':'FORCE_ADVANCE','match.returnToLobby':'RETURN_TO_LOBBY','participant.leave':'ROOM_LEAVE','state.refresh':'STATE_GET','result.send':'RESULT_SUBMIT','result.delay':'RESULT_SUBMIT'};
    const type=names[command.action];if(!type)throw new Error('Unsupported normal action');
    let payload={};
    if(['READY_SET','START_MATCH','RETURN_TO_LOBBY','ROOM_LEAVE','RESULT_SUBMIT'].includes(type))payload.generation=c.roomGeneration;
    if(['PICK_SUBMIT','START_MATCH','RETURN_TO_LOBBY','FORCE_ADVANCE','RESULT_SUBMIT'].includes(type))payload.request_id=id;
    if(type==='READY_SET')payload.ready=p.ready;
    if(type==='PICK_SUBMIT')payload.pick_chart_key=p.chartKey;
    if(type==='RESULT_SUBMIT'){payload.round_index=c.roundIndex;payload.observed_key=c.expectedKey;payload.metric_value=snapshot.settings.win_metric==='MISSCOUNT'?draft.missCount:draft.exScore;}
    return this.send(type,payload,id);
  }
}
