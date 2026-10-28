import assert from "node:assert/strict";
import test from "node:test";
import type { ChartSearchEntry, EventRoomSnapshot, RoomStateSnapshot } from "@infinitas/shared";
import { sourceStore } from "./source-store";
import { roomStore } from "./room-store";
import { eventRoomStore } from "./event-room-store";
import { settingsStore } from "./settings-store";
import { getVisualScenario } from "../dev/visual-scenarios";
import { getEventVisualScenario } from "../dev/event-visual-scenarios";

class SourceSocket {
  static readonly OPEN=1; static readonly CONNECTING=0; static latest:SourceSocket;
  readyState=1; onopen:(()=>void)|null=null; onmessage:((event:{data:string})=>void)|null=null;
  onclose:null=null; onerror:null=null;
  constructor(_endpoint:string){SourceSocket.latest=this;}
  close():void{this.readyState=3;}
  receive(items:unknown[]):void{this.onmessage?.({data:JSON.stringify({type:"today_updates",data:{items}})});}
}

for (const mode of ["NORMAL", "CASUAL", "TOURNAMENT"] as const) {
  test(`v3 ${mode}: opaque source IDs require unique catalog evidence and retain receipt context`, async (t) => {
    t.mock.method(console, "info", () => {}); t.mock.method(console, "warn", () => {});
    const oldSocket = globalThis.WebSocket, oldFetch = globalThis.fetch;
    const oldNormal = roomStore.getState(), oldEvent = eventRoomStore.getState();
    const oldNormalSubmit = roomStore.submitResult, oldEventSubmit = eventRoomStore.submitResult;
    const submitted: { key: unknown; meta: unknown }[] = [];
    globalThis.WebSocket = SourceSocket as unknown as typeof WebSocket;
    roomStore.submitResult = input => { submitted.push({ key: input.observed_key, meta: input.source_meta }); return true; };
    eventRoomStore.submitResult = (key, _metric, meta) => { submitted.push({ key, meta }); return true; };
    const chart = { chart_key: "song", chart_id: 42, play_style: "SP", difficulty: "ANOTHER", level: 12,
      title: "Song", title_search_key: "Song", title_qualifier: "", artist: "", genre: "" } satisfies ChartSearchEntry;
    const base = getVisualScenario("arena-playing")!.room.snapshot;
    const normal = { ...base, current_round: { ...base.current_round!, confirmed: [], expected_key: {
      play_style: "SP", difficulty: "ANOTHER", title_search_key: "Song", chart_id: 42,
    } }, frozen_rounds: base.frozen_rounds.map(round => ({ ...round, display: { ...round.display, title: "Song" } })) } satisfies RoomStateSnapshot;
    const eventBase = getEventVisualScenario("event-playing-host-casual")!.state;
    const event = { ...eventBase.snapshot!, settings: { ...eventBase.snapshot!.settings, event_type: mode === "TOURNAMENT" ? "TOURNAMENT" : "CASUAL" },
      phase: "PLAYING", round_phase: "ACTIVE", event_id: "event", current_round_id: "round", selected_chart: {
        chart_key: "song", expected_key: normal.current_round.expected_key, display: { title: "Song", level: 12 },
      }, current_playing_player_ids: ["player"], participants: [{ player_id: "player", display_name: "PLAYER", connection_state: "CONNECTED", pending_next: false, round_status: "PENDING" }] } satisfies EventRoomSnapshot;
    const response = (charts: ChartSearchEntry[], next_cursor: string | null = null) => new Response(JSON.stringify({ charts, next_cursor }), { headers: { "Content-Type": "application/json" } });
    let sequence = 0;
    const receive = async () => { SourceSocket.latest.receive([{ ...item, chart_id: "external-hash-id", playspeed: `opaque-${++sequence}` }]); await flush(); };
    try {
      if (mode === "NORMAL") { eventRoomStore.setState({ ...oldEvent, snapshot: null }); roomStore.setState({ ...oldNormal, connectionStatus: "CONNECTED", snapshot: { ...normal, room_state: "LOBBY" } }); }
      else { roomStore.setState({ ...oldNormal, snapshot: null }); eventRoomStore.setState({ ...eventBase, connectionStatus: "CONNECTED", playerId: "player", snapshot: { ...event, phase: "LOBBY" } }); sourceStore.syncEventRoomSnapshot(eventRoomStore.getState().snapshot); }
      await sourceStore.start({ ...settingsStore.getState().saved, source: "daken_counter_v3" });
      SourceSocket.latest.onopen?.(); SourceSocket.latest.receive([]); await flush();
      if (mode === "NORMAL") { roomStore.setState({ ...roomStore.getState(), snapshot: normal }); sourceStore.syncRoomSnapshot(normal); }
      else { eventRoomStore.setState({ ...eventRoomStore.getState(), snapshot: event }); sourceStore.syncEventRoomSnapshot(event); }
      globalThis.fetch = async input => {
        const url = new URL(String(input)); assert.equal(url.pathname, "/api/charts");
        assert.equal(url.searchParams.get("keyword"), "Song"); assert.equal(url.searchParams.get("play_style"), "SP"); assert.equal(url.searchParams.get("difficulty"), "ANOTHER");
        return response([chart]);
      };
      await receive(); assert.equal(submitted.length, 1);
      assert.deepEqual(submitted[0]?.key, normal.current_round.expected_key);
      assert.equal((submitted[0]?.meta as Record<string, unknown>).external_chart_id, "external-hash-id");
      for (const charts of [[], [chart, { ...chart, chart_id: 43 }], [{ ...chart, chart_id: 43 }], [{ ...chart, play_style: "DP" as const }], [{ ...chart, difficulty: "HYPER" as const }], [{ ...chart, title: "Song Remix" }], [{ ...chart, chart_id: null }]]) {
        globalThis.fetch = async () => response(charts); await receive(); assert.equal(submitted.length, 1, "ambiguous/mismatched evidence cannot submit");
      }
      globalThis.fetch = async () => response([chart], "more"); await receive(); assert.equal(submitted.length, 1);
      globalThis.fetch = async () => { throw Error("offline"); }; await receive(); assert.equal(submitted.length, 1);
      let resolve: ((value: Response) => void) | undefined;
      globalThis.fetch = () => new Promise<Response>(done => { resolve = done; });
      await receive(); assert.ok(resolve);
      if (mode === "NORMAL") roomStore.setState({ ...roomStore.getState(), snapshot: { ...normal, generation: (normal.generation ?? 0) + 1 } });
      else eventRoomStore.setState({ ...eventRoomStore.getState(), snapshot: { ...event, selection_revision: event.selection_revision + 1 } });
      resolve(response([chart])); await flush(); assert.equal(submitted.length, 1, "catalog completion cannot revive stale input");
    } finally {
      sourceStore.detach(); globalThis.WebSocket = oldSocket; globalThis.fetch = oldFetch;
      roomStore.submitResult = oldNormalSubmit; eventRoomStore.submitResult = oldEventSubmit;
      roomStore.setState(oldNormal); eventRoomStore.setState(oldEvent);
    }
  });
}
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
const item={battle:0,title:"Song",difficulty:"SPA",chart_id:42,score:2000,bp:10,pre_score:1900,pre_bp:11,lamp:"CLEAR",opt:"OFF",playspeed:"2.50"};

for(const mode of ["NORMAL","CASUAL","TOURNAMENT"] as const){
  test(`v3 ${mode}: active context, strict observed ID, duplicate and connection baseline`,async(t)=>{
    t.mock.method(console, "info", () => {}); t.mock.method(console, "warn", () => {});
    const oldSocket=globalThis.WebSocket,oldFetch=globalThis.fetch,oldNormal=roomStore.getState(),oldEvent=eventRoomStore.getState();
    const oldNormalSubmit=roomStore.submitResult,oldEventSubmit=eventRoomStore.submitResult;
    const settings={...settingsStore.getState().saved,source:"daken_counter_v3" as const};let submissions=0;
    globalThis.WebSocket=SourceSocket as unknown as typeof WebSocket;
    roomStore.submitResult=()=>{submissions++;return true;};eventRoomStore.submitResult=()=>{submissions++;return true;};
    const scenario=getVisualScenario("arena-playing")!;
    const normal={...scenario.room.snapshot,current_round:{...scenario.room.snapshot.current_round!,confirmed:[],expected_key:{play_style:"SP",difficulty:"ANOTHER",title_search_key:"Song",chart_id:42}},frozen_rounds:scenario.room.snapshot.frozen_rounds.map(round=>({...round,display:{...round.display,title:"Song"}}))} satisfies RoomStateSnapshot;
    const base=getEventVisualScenario("event-playing-host-casual")!.state;
    const event={...base.snapshot!,settings:{...base.snapshot!.settings,event_type:mode==="TOURNAMENT"?"TOURNAMENT":"CASUAL"},phase:"PLAYING",round_phase:"ACTIVE",event_id:"event",current_round_id:"round-1",selected_chart:{chart_key:"song",expected_key:normal.current_round.expected_key,display:{title:"Song",level:12}},current_playing_player_ids:["player"],participants:[{player_id:"player",display_name:"PLAYER",connection_state:"CONNECTED",pending_next:false,round_status:"PENDING"}]} satisfies EventRoomSnapshot;
    try{
      if(mode==="NORMAL"){
        eventRoomStore.setState({...oldEvent,snapshot:null});roomStore.setState({...oldNormal,connectionStatus:"CONNECTED",snapshot:{...normal,room_state:"LOBBY"}});
      }else{
        roomStore.setState({...oldNormal,snapshot:null});eventRoomStore.setState({...base,connectionStatus:"CONNECTED",playerId:"player",snapshot:{...event,phase:"LOBBY"}});
        sourceStore.syncEventRoomSnapshot(eventRoomStore.getState().snapshot);
      }
      await sourceStore.start(settings);const socket=SourceSocket.latest;socket.onopen?.();socket.receive([]);await flush();
      if(mode==="NORMAL"){roomStore.setState({...roomStore.getState(),snapshot:normal});sourceStore.syncRoomSnapshot(normal);}
      else{eventRoomStore.setState({...eventRoomStore.getState(),snapshot:event});sourceStore.syncEventRoomSnapshot(event);}
      socket.receive([{...item,chart_id:null}]);await flush();assert.equal(submissions,0,"title must not fill absent chart ID");
      socket.receive([{...item,chart_id:43,opt:"RANDOM"}]);await flush();assert.equal(submissions,0,"title must not overwrite mismatched chart ID");
      socket.receive([{...item,chart_id:42.9,playspeed:"2.501"}]);await flush();assert.equal(submissions,0,"fractional IDs must not be truncated into a matching chart");
      socket.receive([{...item,chart_id:"42.9",playspeed:"2.502"}]);await flush();assert.equal(submissions,0,"numeric malformed strings are not opaque source IDs");
      socket.receive([{...item,battle:1}]);await flush();assert.equal(submissions,0,"battle results are unsupported");
      socket.receive([{...item,difficulty:"INVALID"}]);await flush();assert.equal(submissions,0,"invalid chart codes are rejected");
      socket.receive([{...item,playspeed:"2.51"}]);await flush();assert.equal(submissions,1);
      socket.receive([{...item,playspeed:"2.51"}]);await flush();assert.equal(submissions,1,"latest replay is not a new play");
      socket.receive([{...item,playspeed:"2.52"}]);await flush();assert.equal(submissions,2,"same EX/MISS with a real tuple difference is new");
      let resolveAlias:((value:Response)=>void)|null=null;
      globalThis.fetch=()=>new Promise<Response>(resolve=>{resolveAlias=resolve;});
      socket.receive([{...item,title:"Unknown Alias",chart_id:null,playspeed:"2.54"}]);await flush();assert.ok(resolveAlias,"alias request is suspended");
      if(mode==="NORMAL")roomStore.setState({...roomStore.getState(),snapshot:{...normal,generation:(normal.generation??0)+1}});
      else eventRoomStore.setState({...eventRoomStore.getState(),snapshot:{...event,generation:event.generation+1}});
      (resolveAlias as (value:Response)=>void)(new Response(JSON.stringify({title_search_keys:["Song"]}),{headers:{"Content-Type":"application/json"}}));
      await flush();assert.equal(submissions,2);assert.equal(sourceStore.getState().activeUnresolvedDialog,null,"old async parse must not create a new-context dialog");
      sourceStore.detach();
      if(mode==="NORMAL")roomStore.setState({...roomStore.getState(),snapshot:{...normal,room_state:"LOBBY"}});
      else{eventRoomStore.setState({...eventRoomStore.getState(),snapshot:{...event,phase:"LOBBY"}});sourceStore.syncEventRoomSnapshot(eventRoomStore.getState().snapshot);}
      await sourceStore.start(settings);const reconnect=SourceSocket.latest;assert.notEqual(reconnect,socket);reconnect.onopen?.();
      if(mode==="NORMAL"){roomStore.setState({...roomStore.getState(),snapshot:normal});sourceStore.syncRoomSnapshot(normal);}
      else{eventRoomStore.setState({...eventRoomStore.getState(),snapshot:event});sourceStore.syncEventRoomSnapshot(event);}
      reconnect.receive([{...item,playspeed:"2.53"}]);await flush();assert.equal(submissions,2,"first reconnect snapshot is baseline");
      resolveAlias=null;reconnect.receive([{...item,title:"Reconnect Alias",chart_id:null,playspeed:"2.55"}]);await flush();assert.ok(resolveAlias);
      if(mode==="NORMAL"){
        roomStore.setState({...roomStore.getState(),connectionStatus:"DISCONNECTED"});roomStore.setState({...roomStore.getState(),connectionStatus:"CONNECTED"});
      }else{
        eventRoomStore.setState({...eventRoomStore.getState(),connectionStatus:"DISCONNECTED"});eventRoomStore.setState({...eventRoomStore.getState(),connectionStatus:"CONNECTED"});
      }
      (resolveAlias as (value:Response)=>void)(new Response(JSON.stringify({title_search_keys:["Song"]}),{headers:{"Content-Type":"application/json"}}));
      await flush();assert.equal(submissions,2);assert.equal(sourceStore.getState().activeUnresolvedDialog,null,"an epoch change cannot revive an old alias request");
      for(const change of ["round","expected-key",...(mode==="NORMAL"?[]:["selection-revision","eligibility","completed"])] as const){
        resolveAlias=null;
        reconnect.receive([{...item,title:`Stale ${mode} ${change}`,chart_id:null,playspeed:"2.56"}]);await flush();assert.ok(resolveAlias);
        if(mode==="NORMAL"){
          roomStore.setState({...roomStore.getState(),snapshot:{...normal,current_round:{...normal.current_round,
            ...(change==="round"?{round_index:normal.current_round.round_index+1}:{expected_key:{...normal.current_round.expected_key,chart_id:43}})}}});
        }else{
          eventRoomStore.setState({...eventRoomStore.getState(),snapshot:{...event,
            ...(change==="round"?{current_round_id:"round-2"}:change==="expected-key"?{selected_chart:{...event.selected_chart,expected_key:{...event.selected_chart.expected_key,chart_id:43}}}:
              change==="selection-revision"?{selection_revision:event.selection_revision+1}:change==="eligibility"?{current_playing_player_ids:[]}:
                {participants:event.participants.map(player=>({...player,round_status:"SUBMITTED" as const}))})}});
        }
        (resolveAlias as (value:Response)=>void)(new Response(JSON.stringify({title_search_keys:["Song"]}),{headers:{"Content-Type":"application/json"}}));
        await flush();assert.equal(submissions,2,`${change} invalidates an awaiting alias`);
        assert.equal(sourceStore.getState().activeUnresolvedDialog,null,`${change} must not open a stale dialog`);
        if(mode==="NORMAL")roomStore.setState({...roomStore.getState(),snapshot:normal});
        else eventRoomStore.setState({...eventRoomStore.getState(),snapshot:event});
      }
      // A raw ID that was wrong in the old round can match the next round.
      // Dropping the awaiting alias must consume the observation, not just its send.
      if(mode==="NORMAL")roomStore.setState({...roomStore.getState(),snapshot:{...normal,current_round:{...normal.current_round,expected_key:{...normal.current_round.expected_key,chart_id:43}}}});
      else eventRoomStore.setState({...eventRoomStore.getState(),snapshot:{...event,selected_chart:{...event.selected_chart,expected_key:{...event.selected_chart.expected_key,chart_id:43}}}});
      const staleReplay={...item,title:`Old round ${mode}`,playspeed:"3.00"};
      resolveAlias=null;reconnect.receive([staleReplay]);await flush();assert.ok(resolveAlias);
      if(mode==="NORMAL")roomStore.setState({...roomStore.getState(),snapshot:{...normal,current_round:{...normal.current_round,round_index:normal.current_round.round_index+1}}});
      else eventRoomStore.setState({...eventRoomStore.getState(),snapshot:{...event,current_round_id:"next-round",selection_revision:event.selection_revision+1}});
      (resolveAlias as (value:Response)=>void)(new Response(JSON.stringify({title_search_keys:["Song"]}),{headers:{"Content-Type":"application/json"}}));
      await flush();assert.equal(submissions,2,"old async parse is dropped");
      reconnect.receive([staleReplay]);await flush();assert.equal(submissions,2,"old latest snapshot cannot revive in the next round");
      reconnect.receive([]);await flush();reconnect.receive([staleReplay]);await flush();
      assert.equal(submissions,2,"removing and replaying the stale tuple is still not a new play");
      reconnect.receive([{...staleReplay,playspeed:"3.01"}]);await flush();
      assert.equal(submissions,3,"a legitimate new same-chart same-value play remains accepted");
      if(mode==="NORMAL")roomStore.setState({...roomStore.getState(),snapshot:{...normal,current_round:{...normal.current_round,expected_key:{...normal.current_round.expected_key,chart_id:43}}}});
      else eventRoomStore.setState({...eventRoomStore.getState(),snapshot:{...event,selected_chart:{...event.selected_chart,expected_key:{...event.selected_chart.expected_key,chart_id:43}}}});
      const oldConnectionItem={...item,title:`Old connection ${mode}`,playspeed:"4.00"};
      resolveAlias=null;reconnect.receive([oldConnectionItem]);await flush();assert.ok(resolveAlias);
      sourceStore.detach();
      if(mode==="NORMAL")roomStore.setState({...roomStore.getState(),snapshot:{...normal,room_state:"LOBBY"}});
      else{eventRoomStore.setState({...eventRoomStore.getState(),snapshot:{...event,phase:"LOBBY"}});sourceStore.syncEventRoomSnapshot(eventRoomStore.getState().snapshot);}
      await sourceStore.start(settings);const fresh=SourceSocket.latest;fresh.onopen?.();fresh.receive([]);await flush();
      if(mode==="NORMAL"){roomStore.setState({...roomStore.getState(),snapshot:normal});sourceStore.syncRoomSnapshot(normal);}
      else{eventRoomStore.setState({...eventRoomStore.getState(),snapshot:event});sourceStore.syncEventRoomSnapshot(event);}
      (resolveAlias as (value:Response)=>void)(new Response(JSON.stringify({title_search_keys:["Song"]}),{headers:{"Content-Type":"application/json"}}));await flush();
      fresh.receive([oldConnectionItem]);await flush();
      assert.equal(submissions,4,"old connection completion must not poison the new connection baseline or dedupe");
      resolveAlias=null;fresh.receive([{...item,title:`Queue blocker ${mode}`,chart_id:null,playspeed:"5.00"}]);await flush();assert.ok(resolveAlias);
      const queuedOldPlay={...item,playspeed:"5.01"};
      fresh.receive([queuedOldPlay]);
      if(mode==="NORMAL")roomStore.setState({...roomStore.getState(),snapshot:{...normal,current_round:{...normal.current_round,round_index:normal.current_round.round_index+1}}});
      else eventRoomStore.setState({...eventRoomStore.getState(),snapshot:{...event,current_round_id:"queued-next-round",selection_revision:event.selection_revision+1}});
      (resolveAlias as (value:Response)=>void)(new Response(JSON.stringify({title_search_keys:["Song"]}),{headers:{"Content-Type":"application/json"}}));await flush();
      assert.equal(submissions,4,"queued old input must retain its receipt context when alias resolution unblocks");
      fresh.receive([queuedOldPlay]);await flush();assert.equal(submissions,4,"stale queued input is consumed before replay");
      fresh.receive([{...queuedOldPlay,playspeed:"5.02"}]);await flush();assert.equal(submissions,5,"current-round same-value new input remains accepted");
      resolveAlias=null;fresh.receive([{...item,title:`Queue epoch blocker ${mode}`,chart_id:null,playspeed:"6.00"}]);await flush();assert.ok(resolveAlias);
      const queuedOldEpoch={...item,playspeed:"6.01"};fresh.receive([queuedOldEpoch]);
      if(mode==="NORMAL"){
        roomStore.setState({...roomStore.getState(),connectionStatus:"DISCONNECTED"});roomStore.setState({...roomStore.getState(),connectionStatus:"CONNECTED"});
      }else{
        eventRoomStore.setState({...eventRoomStore.getState(),connectionStatus:"DISCONNECTED"});eventRoomStore.setState({...eventRoomStore.getState(),connectionStatus:"CONNECTED"});
      }
      (resolveAlias as (value:Response)=>void)(new Response(JSON.stringify({title_search_keys:["Song"]}),{headers:{"Content-Type":"application/json"}}));await flush();
      assert.equal(submissions,5,"restoring the same snapshot must not revive queued input across an epoch change");
      fresh.receive([queuedOldEpoch]);await flush();assert.equal(submissions,5);
      fresh.receive([{...queuedOldEpoch,playspeed:"6.02"}]);await flush();assert.equal(submissions,6);
    }finally{sourceStore.detach();roomStore.submitResult=oldNormalSubmit;eventRoomStore.submitResult=oldEventSubmit;roomStore.setState(oldNormal);eventRoomStore.setState(oldEvent);globalThis.WebSocket=oldSocket;globalThis.fetch=oldFetch;}
  });
}
