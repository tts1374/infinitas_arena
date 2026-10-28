import { sameContext } from './protocol.mjs';

/** One owner for reservations. A supplied clock makes the ten-second rule testable. */
export class ReservationScheduler {
  constructor({clock={setTimeout,clearTimeout},readContext,onDispatch,onCancel}){
    this.clock=clock;this.readContext=readContext;this.onDispatch=onDispatch;this.onCancel=onCancel;this.entries=new Map();this.stopped=false;
  }
  reserve(command,delayMs){
    if(this.stopped)throw new Error('Scheduler stopped');
    if(this.entries.has(command.operationId))return;
    const frozen=structuredClone(command);
    const timer=this.clock.setTimeout(async()=>{
      if(!this.entries.has(command.operationId))return;
      this.entries.delete(command.operationId);
      if(this.stopped||!sameContext(frozen.context,this.readContext(frozen.targetClientId))){this.onCancel(frozen,'context changed');return;}
      await this.onDispatch(frozen);
    },delayMs);
    this.entries.set(command.operationId,{command:frozen,timer});
  }
  cancel(operationId,reason='cancelled'){
    const entry=this.entries.get(operationId);if(!entry)return false;
    this.clock.clearTimeout(entry.timer);this.entries.delete(operationId);this.onCancel(entry.command,reason);return true;
  }
  invalidate(targetClientId){for(const [id,entry] of this.entries)if(entry.command.targetClientId===targetClientId&&!sameContext(entry.command.context,this.readContext(targetClientId)))this.cancel(id,'context changed');}
  stop(){this.stopped=true;for(const id of [...this.entries.keys()])this.cancel(id,'session stopped');}
}
