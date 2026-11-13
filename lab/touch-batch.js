/* Trailing debounce measured between gestures. An active hold never flushes early. */
(function(root){
 class TouchBatch{
  constructor({delay=250,now=()=>Date.now(),setTimer=(...args)=>root.setTimeout(...args),clearTimer=(...args)=>root.clearTimeout(...args),id=()=>crypto.randomUUID(),onBatch=()=>{},onError=error=>{throw error;}}={}){this.setTimer=(...args)=>Reflect.apply(setTimer,root,args);this.clearTimer=(...args)=>Reflect.apply(clearTimer,root,args);Object.assign(this,{now,id,onBatch,onError});this.setDelay(delay);this.reset();}
  reset(){if(this.timer!=null)this.clearTimer(this.timer);this.timer=null;this.pending=null;this.active=false;this.segment=null;}
  setDelay(value){if(!Number.isInteger(value)||value<50||value>5000)throw Error('触摸合并间隔须为 50–5000ms');this.delay=value;if(this.pending&&!this.active)this.schedule();}
  ensure(time){if(!this.pending)this.pending={id:this.id(),at:new Date(time).toISOString(),first:time,last:time,presses:0,zones:new Map(),segments:[],truncated:false};return this.pending;}
  closeSegment(time){if(!this.segment||!this.pending)return;const s=this.segment,p=this.pending,ms=Math.max(0,time-s.start);const z=p.zones.get(s.zone);z.durationMs+=ms;z.lastAt=new Date(time).toISOString();if(p.segments.length<64)p.segments.push({zone:s.zone,at:new Date(s.start).toISOString(),durationMs:ms,kind:s.kind});else p.truncated=true;this.segment=null;}
  begin(zone){if(this.active)this.end();const time=this.now();if(this.pending&&!this.active&&time-this.pending.last>this.delay)this.flush();if(this.timer!=null)this.clearTimer(this.timer);this.timer=null;this.active=true;this.pressCounted=false;this.sample(zone,'press');}
  sample(zone,kind='stroke'){if(!this.active)return;const time=this.now();if(this.pending)this.pending.last=time;if(this.segment?.zone===zone)return;if(this.segment)this.closeSegment(time);if(typeof zone!=='string'||!zone.trim())return;zone=zone.slice(0,40);const p=this.ensure(time);if(!this.pressCounted){p.presses++;this.pressCounted=true;}p.last=time;let z=p.zones.get(zone);if(!z){if(p.zones.size>=20){p.truncated=true;return;}z={zone,count:0,durationMs:0,firstAt:new Date(time).toISOString(),lastAt:new Date(time).toISOString()};p.zones.set(zone,z);}z.count++;this.segment={zone,start:time,kind};}
  end(zone){if(!this.active)return;if(zone!==undefined)this.sample(zone,'stroke');const time=this.now();this.closeSegment(time);this.active=false;if(this.pending){this.pending.last=time;this.schedule();}}
  pulse(zone){this.begin(zone);this.end();}
  fail(error){this.timer=null;this.pending=null;this.active=false;this.segment=null;this.onError(error);}
  schedule(){try{if(this.timer!=null)this.clearTimer(this.timer);if(this.active||!this.pending)return;const remaining=this.delay-(this.now()-this.pending.last);this.timer=this.setTimer(()=>{try{this.timer=null;if(this.active||!this.pending)return;if(this.now()-this.pending.last<=this.delay)return this.schedule();this.flush();}catch(error){this.fail(error);}},Math.max(1,remaining+1));}catch(error){this.fail(error);}}
  flush(){if(this.active||!this.pending)return;const p=this.pending;this.pending=null;if(this.timer!=null)this.clearTimer(this.timer);this.timer=null;this.onBatch({id:p.id,type:'touch',at:p.at,endedAt:new Date(p.last).toISOString(),durationMs:Math.max(0,p.last-p.first),presses:p.presses,touches:[...p.zones.values()],segments:p.segments,truncated:p.truncated});}
 }
 if(typeof module!=='undefined')module.exports=TouchBatch;else root.LCTouchBatch=TouchBatch;
})(globalThis);
