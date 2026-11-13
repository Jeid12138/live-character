import {mkdirSync, writeFileSync, renameSync} from 'node:fs';
import path from 'node:path';

const operations = new Set(['diagnostics','read','click','value','file','point','chat','stop','navigation','history','launch','launch-cancel','dependencies','stream','stream-close','stream-status','models','modelChoices','links']);
const localPeers = new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
const recentErrors=[];
function record(id, reason, error) {
  if (!process.env.LOCALAPPDATA) return;
  const dir = path.join(process.env.LOCALAPPDATA, 'LiveCharacter', 'logs');
  try {
    mkdirSync(dir, {recursive:true});
    const dest = path.join(dir, 'panel-last-error.json');
    recentErrors.push({time:new Date().toISOString(),id,reason,code:error?.code,message:String(error?.message||'').slice(0,1500),stack:String(error?.stack||'').slice(0,5000)});
    if(recentErrors.length>40)recentErrors.shift();
    writeFileSync(dest+'.tmp', JSON.stringify({version:'0.12.36',recentErrors}));
    renameSync(dest+'.tmp',dest);
  } catch { /* The response still carries the diagnostic. */ }
}
export function installPanel(ctx, request) {
  ctx.inject(['webServer','connection'], scope => {
    const connection = scope.connection;
    const prefix = '/live-character/';
    scope.effect(() => scope.webServer.register({kind:'prefix',path:'/live-character',handler:async(req,res) => {
      const method = (req.url || '').split('?')[0].slice(prefix.length);
      const match = /^settings\/([a-f0-9-]{36})$/.exec(method);
      const id = match?.[1] || 'unknown';
      function finish(code, value) {
        res.writeHead(code, {'content-type':'application/json','cache-control':'no-store'});
        res.end(JSON.stringify(value));
      }
      function reject(code, reason) {
        if(match && localPeers.has(req.socket.remoteAddress)) record(id,reason);
        finish(code, {error:reason});
      }
      if (!match) return finish(404,{error:'route'});
      if (!localPeers.has(req.socket.remoteAddress)) return reject(403,'peer');
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host || '')) return reject(403,'host');
      if (req.method !== 'POST') return reject(405,'method');
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return reject(415,'content-type');
      const denied = connection.requestRejection(req);
      if (denied) return reject(denied, 'dsh-'+denied);
      let msg;
      try {
        const chunks=[];let size=0;
        for await (const chunk of req) {
          size += chunk.length;
          if(size>100000) return reject(413,'body-size');
          chunks.push(chunk);
        }
        msg=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch { return reject(400,'body'); }
      if(msg?.type!=='client-request'||msg.method!==method||typeof msg.rpcId!=='string'||
         msg.rpcId.length>128||!operations.has(msg.payload?.op)) return reject(400,'rpc-envelope');
      let result;
      try { result={ok:true,value:await request({...msg.payload,requestId:id})}; }
      catch(e) {
        record(id,'desktop',e);
        result={ok:false,error:{code:e.code||'desktop',message:String(e.message).slice(0,500),details:{}}};
      }
      finish(200,{type:'server-response',rpcId:msg.rpcId,result});
    }}),'live-character: settings');
  });
}
export function installHooks(ctx,request){
 const providers=new Map(),listeners=new Set();
 const subs=new Map(),links=new Map(),events=['online','state','emotion','focus','chat','touch','model','experience'];
 let revision=0,line=Promise.resolve(),recent=[];
 function emit(kind,data){if(!events.includes(kind))return;const event={...data,type:kind,revision:++revision};for(const k of new Set([kind,'state']))for(const fn of subs.get(k)||[])Promise.resolve().then(()=>fn(event)).catch(()=>{});}
 const api={version:3,experience:{query:options=>request({op:'experienceQuery',input:options||{}}),subscribe:fn=>api.on('experience',fn)},
  capabilities:()=>({events:[...events],perform:['expression','motion','gaze','bubble'],settingsLinks:true,memoryScope:true,experience:{query:true,subscribe:true,append:false}}),
  async state(){try{return {...await request({op:'externalState'}),revision};}catch{return {online:false,revision,model:'',emotion:'',activity:0,focus:'off',busy:false};}},
  on(kind,fn){if(!events.includes(kind)||typeof fn!=='function')throw Error('无效事件');if(!subs.has(kind))subs.set(kind,new Set());subs.get(kind).add(fn);return ()=>subs.get(kind)?.delete(fn);},
  perform(input){
   if(!input||typeof input!=='object'||!Object.keys(input).length||Object.keys(input).some(k=>!['expression','motion','bubble','gaze'].includes(k)))throw Error('INVALID_COMMAND');
   const cmd=structuredClone(input);
   for(const item of [cmd.expression,cmd.motion].filter(Boolean))if(typeof item.name!=='string'||item.name.length>200||(item.seconds!==undefined&&!(item.seconds>0&&item.seconds<=60)))throw Error('INVALID_ACTION');
   if(cmd.bubble&&(typeof cmd.bubble.text!=='string'||!cmd.bubble.text.trim()||cmd.bubble.text.length>600||(cmd.bubble.ttlMs!==undefined&&!(cmd.bubble.ttlMs>0&&cmd.bubble.ttlMs<=60000))))throw Error('INVALID_BUBBLE');
   if(cmd.gaze&&![cmd.gaze.x,cmd.gaze.y].every(x=>Number.isFinite(x)&&Math.abs(x)<=1))throw Error('INVALID_GAZE');
   recent=recent.filter(t=>Date.now()-t<1000);if(recent.length>=10)throw Error('RATE_LIMITED');recent.push(Date.now());
   const next=line.then(()=>request({op:'perform',input:cmd}));line=next.catch(()=>{});return next;
  },
  registerSettingsLink(def){if(!def||!['id','title','panelKey'].every(k=>typeof def[k]==='string'&&def[k].trim()&&def[k].length<200)||links.has(def.id))throw Error('无效设置入口');links.set(def.id,{id:def.id,title:def.title,panelKey:def.panelKey,order:Number(def.order)||0});return ()=>links.delete(def.id);},
  registerContext(id,callback,options={}){if(typeof callback!=='function'||providers.has(id))throw Error('上下文提供方无效或重复');const entry={callback,options,cache:null};providers.set(id,entry);return ()=>{if(providers.get(id)===entry)providers.delete(id);};},
  onReply(callback){if(typeof callback!=='function')throw Error('监听函数无效');listeners.add(callback);return ()=>listeners.delete(callback);},
  showBubble(text){if(typeof text!=='string'||!text.trim())throw Error('请提供台词');return request({op:'cue',text:text.slice(0,600)});}
 };
 ctx.provide('liveCharacter',api);
 // Deprecated compatibility alias for the previous public service name.
 ctx.provide('writingPet',api);
 return {
  links:()=>[...links.values()].sort((a,b)=>a.order-b.order),emit,
  async context(event,signal,profile,characterId){
   if(!event||!providers.size)return [];
   const rows=await Promise.all([...providers].filter(([,p])=>event.type==='chat'||p.options.scope==='always').sort((a,b)=>(b[1].options.priority||0)-(a[1].options.priority||0)).slice(0,8).map(async([id,entry])=>{
    const {callback:fn,options,cache}=entry;const key=JSON.stringify([characterId,profile,event]);if(cache?.key===key&&Date.now()<cache.until)return cache.row;
    const timeout=AbortSignal.any([signal,AbortSignal.timeout(1200)]);
    try{const result=await Promise.race([Promise.resolve().then(()=>fn({characterId,profile,event:structuredClone(event),eventId:event.id,eventType:event.type,at:event.at,text:String(event.text||'').slice(0,2000),signal:timeout})),new Promise((_,reject)=>timeout.addEventListener('abort',()=>reject(Error('timeout')),{once:true}))]);if(typeof result==='string'&&result.trim()){const row={source:String(id).slice(0,80),text:result.slice(0,Math.max(1,Math.min(1500,options.maxChars||1500)))};if(options.cacheMs>0)entry.cache={key,until:Date.now()+Math.min(options.cacheMs,60000),row};return row;}}catch{}return null;
   }));return rows.filter(Boolean);
  },
  reply(event,result,identity={}){if(!['chat','touch','observe','model_change'].includes(event?.type)||result.duplicate||typeof result.plan?.text!=='string')return;
   for(const fn of listeners)Promise.resolve().then(()=>fn({type:event.type,eventId:event.id,at:event.at,event:structuredClone(event),text:result.plan.text.slice(0,2000),sessionId:result.sessionId,seq:result.sessionSeq,characterId:identity.characterId,profile:identity.profile,emotion:result.plan.emotion,speech:structuredClone(result.plan.speech||{})})).catch(()=>{});}
 };
}
