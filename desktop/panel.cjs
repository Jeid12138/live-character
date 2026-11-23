const http=require('node:http');
const {setTimeout:pause}=require('node:timers/promises');
module.exports=async function startPanel(win,activeSession,diagnostics){
 const secret=process.env.PET_SECRET;
 const url=new URL('/desktop-online',process.env.PET_BRIDGE);
 const tickets=new Map(),clients=new Set(),streams=new Map(),leaseStates=new Map();
 function closeStream(client){
  const entry=streams.get(client),state=entry&&leaseStates.get(entry.lease);
  if(state&&['waiting','streaming'].includes(state.reason))state.reason='closed';
  clients.delete(client);streams.delete(client);client.destroy();
 }
 function closeLease(id,lease){
  for(const [key,entry] of tickets)if(entry.clientId===id&&(!lease||key===lease))tickets.delete(key);
  for(const [client,entry] of streams)if(entry.clientId===id&&(!lease||entry.lease===lease))closeStream(client);
 }
 function sweep(){
  const now=Date.now();
  for(const [key,entry] of tickets)if(entry.expires<=now){tickets.delete(key);const state=leaseStates.get(key);if(state)state.reason='expired-ticket';}
  for(const [key,state] of leaseStates)if(now-state.at>180000&&!tickets.has(key)&&![...streams.values()].some(v=>v.lease===key))leaseStates.delete(key);
  for(const [client,entry] of streams)if(client.destroyed||client.writableEnded||now-entry.lastWrite>15000)closeStream(client);
 }
 let cursorDown=false,revision=0,previous='',producing=false;
 async function produce(){
  if(producing)return;producing=true;
  try{while(clients.size&&!win.isDestroyed()){
   const at=Date.now();sweep();
   if([...clients].some(c=>c.writableLength===0)){
    const data=await diagnostics.execute('window.petPanel?.frame(true)','preview');
    if(data){const buf=Buffer.from(data.split(',')[1],'base64');
     for(const client of clients){if(client.writableLength)continue;
      client.write('--character\r\nContent-Type: image/jpeg\r\nContent-Length: '+buf.length+'\r\n\r\n');client.write(buf);client.write('\r\n');streams.get(client).lastWrite=Date.now();
     }
    }
   }
   await new Promise(ok=>setTimeout(ok,Math.max(1,83-(Date.now()-at))));
  }}catch{for(const c of clients)c.destroy();}finally{producing=false;}
 }

 const reaper=setInterval(sweep,5000);reaper.unref();
 const server=http.createServer(async(req,res)=>{
  const send=(code,v)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(v));};
  if(req.method==='GET'){
   sweep();
   const key=(req.url||'').slice('/preview/'.length),entry=tickets.get(key);
   if(!req.url.startsWith('/preview/')||req.headers.host!=='127.0.0.1:'+server.address().port){const state=leaseStates.get(key);if(state)state.reason='host-or-path';return send(403,{reason:'host-or-path'});}
   tickets.delete(key);
   if(!entry){const state=leaseStates.get(key);if(state&&state.reason!=='expired-ticket')state.reason='invalid-ticket';return send(403,{reason:state?.reason||'invalid-ticket'});}
   closeLease(entry.clientId);
   while(clients.size>=4)closeStream(clients.values().next().value);
   res.writeHead(200,{'content-type':'multipart/x-mixed-replace; boundary=character','cache-control':'no-store','referrer-policy':'no-referrer'});res.flushHeaders();
   if(leaseStates.has(key))leaseStates.get(key).reason='streaming';
   clients.add(res);streams.set(res,{clientId:entry.clientId,lease:key,lastWrite:Date.now()});
   res.on('close',()=>{const state=leaseStates.get(key);if(state?.reason==='streaming')state.reason='closed';clients.delete(res);streams.delete(res);});res.on('error',()=>closeStream(res));void produce();return;
  }
  if(req.method!=='POST'||req.headers.authorization!=='Bearer '+secret||req.headers.origin)return send(403,{});
  try{
   let body='';for await(const c of req){body+=c;if(body.length>100000)throw Error('请求过大');}
   const cmd=JSON.parse(body),wc=win.webContents;
   if(cmd.op==='diagnostics')return send(200,diagnostics.snapshot());
   const execute=(js,userGesture=false)=>diagnostics.execute(js,cmd.op,cmd.requestId,userGesture);
   if(cmd.op==='sessionEvent'){if(activeSession?.()===cmd.id)await execute('window.companion?.receiveSession('+JSON.stringify(cmd.row)+')');return send(200,{});}
   if(cmd.op==='experienceQuery')return send(200,await execute('window.companion.experiencesQuery('+JSON.stringify(cmd.input||{})+')'));
   if(cmd.op==='externalState'||cmd.op==='perform'){
    const js=cmd.op==='externalState'?'window.companion.externalState()':'window.companion.perform('+JSON.stringify(cmd.input)+')';
    return send(200,(await execute(js))??{});
   }
   if(cmd.op==='modelChoices'){
    const models=(cmd.models||[]).filter(x=>typeof x==='string'&&x.length<=180).slice(0,200);
    await execute('window.companion?.modelChoices('+JSON.stringify(models)+')');return send(200,{});
   }
   if(cmd.op==='stream-status'){
    sweep();const state=leaseStates.get(cmd.lease);
    return send(200,{reason:state?.clientId===cmd.clientId?state.reason:'unknown-lease',clients:clients.size});
   }
   if(cmd.op==='stream-close'){
    if(typeof cmd.clientId!=='string'||typeof cmd.lease!=='string')throw Error('无效预览连接');
    closeLease(cmd.clientId,cmd.lease);return send(200,{clients:clients.size});
   }
   if(cmd.op==='stream'){
    const id=cmd.clientId;
    if(typeof id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(id))throw Error('无效预览客户端');
    sweep();closeLease(id);
    const key=require('node:crypto').randomBytes(24).toString('hex');
    tickets.set(key,{clientId:id,expires:Date.now()+60000});
    leaseStates.set(key,{clientId:id,at:Date.now(),reason:'waiting'});
    return send(200,{url:'http://127.0.0.1:'+server.address().port+'/preview/'+key,lease:key,clients:clients.size});
   }
   if(cmd.op==='history'){
    const page=await execute('window.companion.fullHistory('+JSON.stringify(Math.max(1,Number(cmd.limit)||100))+')');
    return send(200,page);
   }
   if(cmd.op==='read'){
    const options={pane:cmd.pane,tab:cmd.tab,drawer:!!cmd.drawer,preview:!!cmd.preview};
    const state=await execute('window.petPanel?.read('+JSON.stringify(options)+')');
    if(!state){
     const detail=await execute('window.petRendererHealth?.lastError');
     return send(503,{error:detail?'角色界面初始化失败：'+String(detail.message).slice(0,350):'角色界面正在启动',code:detail?'RENDERER_INIT_FAILED':'RENDERER_NOT_READY'});
    }
    const snapshot=JSON.stringify({...state,preview:undefined,fps:undefined});if(snapshot!==previous){previous=snapshot;revision++;}
    if(!cmd.preview&&cmd.revision===revision)return send(200,{unchanged:true,revision});
    return send(200,{...state,revision});
   }
   if(cmd.op==='point'){
    const s=await execute('({allowed:!!window.zoneEditor?.editing&&!document.querySelector("dialog[open]"),r:document.querySelector("#canvas").getBoundingClientRect().toJSON()})');
    if(!s.allowed||![cmd.x,cmd.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('请先进入触摸区域调整');
    const type={down:'mouseDown',move:'mouseMove',up:'mouseUp'}[cmd.phase];if(!type)throw Error('无效指针操作');
    if(type==='mouseDown')cursorDown=true;
    wc.sendInputEvent({type,x:Math.round(s.r.x+cmd.x*(s.r.width-1)),y:Math.round(s.r.y+cmd.y*(s.r.height-1)),button:'left',clickCount:1,modifiers:cursorDown?['leftButtonDown']:[]});
    if(type==='mouseUp')cursorDown=false;return send(200,{});
   }
   if(cmd.op==='cue'){await execute('window.companion?.bubble('+JSON.stringify(String(cmd.text).slice(0,600))+')');return send(200,{});}
   await execute('window.petPanel.act('+JSON.stringify(cmd)+')',true);send(200,{});
  }catch(e){send(400,{error:String(e.message).slice(0,500),code:e.code||'DESKTOP_OPERATION_FAILED'});}
 });
 const lifetime=new AbortController();
 const close=()=>{
  lifetime.abort();clearInterval(reaper);
  for(const c of [...clients])closeStream(c);
  tickets.clear();leaseStates.clear();server.close();
 };
 win.once('closed',close);
 try{
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  if(lifetime.signal.aborted)return close();
  const body=String(server.address().port);
  const retryDelays=[0,150,400,900,1800];
  let failure;
  for(const delay of retryDelays){
   if(delay)await pause(delay,null,{signal:lifetime.signal});
   let response;
   try{
    response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+secret},body,
     signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(2000)])});
   }catch(error){failure=error;continue;}
   await response.body?.cancel().catch(()=>{});
   if(response.ok)return;
   failure=Error('HTTP '+response.status);
   if(response.status<500)break;
  }
  throw Error('桌宠侧栏连接失败 · '+failure?.message,{cause:failure});
 }catch(error){
  const closed=lifetime.signal.aborted;close();
  if(!closed)throw error;
 }
};
