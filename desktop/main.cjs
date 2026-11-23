const {app,BrowserWindow,dialog,Menu,screen,session,ipcMain,shell,safeStorage} = require('electron');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const geometry=require('./bounds.cjs');
const {randomBytes} = require('node:crypto');
const data = path.join(process.env.LOCALAPPDATA,'LiveCharacter');
app.setAppUserModelId('LiveCharacter.Desktop');
app.setPath('userData',path.join(data,'preferences'));
const lab = path.resolve(__dirname,'../lab');
let url;
const webToken = randomBytes(32).toString('hex');
let rendererDiagnostics,bubbleWindow;
let win, service, compact = false, quitting = false, focusedMode = false;
const prefs = path.join(data,'assets.json');
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(start).catch(fail);

function fail(error) {
  rendererDiagnostics?.record("startup",{message:error.message,stack:error.stack});
  if (quitting) return;
  quitting = true;
  const choice=dialog.showMessageBoxSync({type:'error',title:'Live Character · 启动失败',message:String(error.message || error),
    buttons:['关闭','保留角色资料，下次重新选择资源'],defaultId:0,cancelId:0});
  if(choice===1){for(const key of ['active','model','entry','profile','variant','core'])delete assets[key];persist();}
  app.quit();
}
let assets={};
try{assets=JSON.parse(fs.readFileSync(prefs,'utf8'));}catch{}
const nativeToken=randomBytes(32).toString('hex');
let locked=false,pendingFile='',pendingEntries=[];
function persist(){fs.writeFileSync(prefs+'.tmp',JSON.stringify(assets));fs.renameSync(prefs+'.tmp',prefs);}
async function nativeRequest(op,body){
 const r=await fetch(url+'/native/'+op,{method:'POST',headers:{Origin:url,'X-Pet-Native':nativeToken,'X-Pet-Window':webToken,'X-Lab-Request':'companion','Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await r.json();if(!r.ok)throw Error(result.error||'无法读取运行时模型');return result;
}
const library=require('./library.cjs')(data,assets,persist);
const screenObservation=require('./screen-observation.cjs')({eligible:request=>
 !quitting&&!locked&&win&&!win.isDestroyed()&&assets.ai!==false&&
 assets.processContext===true&&assets.screenObservation===true&&
 assets.active?.characterId===request.characterId&&assets.profile===request.profile&&
 !!assets.profile&&library.route().id===request.sessionId
});
const voiceSecrets=require('./voice-secrets.cjs')(path.join(data,'preferences'),safeStorage);
const voiceDiagnostics=require('./voice-diagnostics.cjs')(data);
let breezeRelease=Promise.resolve();
function idleVramOptimization(){
 try{return JSON.parse(library.store('get','companion-config-v4'))?.idleVramOptimization===true;}
 catch{return false;}
}
async function voiceTransport(body,cancellation){
 const controller=new AbortController();
 const abort=()=>controller.abort(cancellation.reason);
 if(cancellation?.aborted)abort();else cancellation?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(()=>controller.abort(new DOMException('语音请求超时','TimeoutError')),110000);
 try{
 const response=await fetch(url+(body.operation==='check'?'/api/voice-check':'/api/synthesize'),{method:'POST',headers:{Origin:url,'X-Pet-Window':webToken,'X-Lab-Request':'companion','Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
 const result=await response.json();if(!response.ok){const error=Error(result.error||'语音请求失败');error.voice=result.voice;throw error;}return result;
 }finally{clearTimeout(timeout);cancellation?.removeEventListener('abort',abort);}
}
let cloudVoiceStream=null;
function closeCloudVoiceStream(stream=cloudVoiceStream){
 if(!stream||stream!==cloudVoiceStream)return false;
 cloudVoiceStream=null;
 clearTimeout(stream.timeout);
 stream.abort.abort();
 return true;
}
function armCloudVoiceStream(stream){
 clearTimeout(stream.timeout);
 stream.timeout=setTimeout(()=>{
  if(cloudVoiceStream!==stream)return;
  stream.expired=true;
  stream.abort.abort();
 },110000);
}
async function openCloudVoiceStream(sender,value){
 if(cloudVoiceStream||synthesizeVoice.isBusy()||saveVoiceSettings.isBusy())throw Error('语音操作进行中，请等待完成');
 if(assets.ai===false||assets.voicePlayback?.muted||assets.voicePlayback?.volume===0)throw Error('语音调用已关闭');
 const {clientRequestId,provider,endpoint,model,text,instruction,guidance,voice,network}=value||{};
 if(!require('../lab/voice-catalog.js').capabilities('api',model,provider).streaming)throw Error('当前语音模型不支持流式响应');
 if(typeof clientRequestId!=='string'||clientRequestId.length>64||!clientRequestId)throw Error('语音流标识无效');
 const stream={sender,clientRequestId,abort:new AbortController(),owner:assets.active?.characterId,profile:assets.profile};
 cloudVoiceStream=stream;
 let stage='key';
 const diagnostic=voiceDiagnostics.begin({provider,endpoint,model,voice,network,streaming:true,cudaGraph:false});
 try{
  const key=voiceSecrets.get(provider,endpoint);
  stage='request';
  voiceDiagnostics.update({stage,...require('./voice-key.cjs').describe(key,'stored')});
  armCloudVoiceStream(stream);
  const response=await fetch(url+'/api/synthesize-stream',{
   method:'POST',headers:{Origin:url,'X-Pet-Native':nativeToken,'X-Pet-Window':webToken,'X-Lab-Request':'companion','Content-Type':'application/json'},
   body:JSON.stringify({mode:'api',provider,endpoint,model,text,instruction,guidance,voice,network,key}),
   signal:stream.abort.signal
  });
  if(!response.ok){
   const error=await response.json();
   throw Object.assign(Error(error.error||'语音流请求失败'),{code:error.code});
  }
  const sampleRate=response.headers.get('X-Sample-Rate'),format=response.headers.get('X-Sample-Format'),channels=response.headers.get('X-Channels');
  if(!response.body||!sampleRate||format!=='s16le'||channels!=='1')throw Error('流式语音格式无效');
  stream.reader=response.body.getReader();
  stream.requestId=diagnostic.requestId;
  return {sampleRate,format,channels,requestId:stream.requestId};
 }catch(error){
  const cancelled=cloudVoiceStream!==stream;
  if(!cancelled)voiceDiagnostics.fail({stage,errorCode:stream.expired||error.code==='read_timeout'?'read_timeout':stage==='key'?'key_error':'synthesis_failed',errorType:error.name});
  closeCloudVoiceStream(stream);
  if(cancelled)return {cancelled:true};
  throw Error(stream.expired?'语音请求读取超时':error.message);
 }
}
async function readCloudVoiceStream(sender,id){
 const stream=cloudVoiceStream;
 if(!stream||stream.sender!==sender||id!==stream.clientRequestId)return {cancelled:true};
 if(stream.owner!==assets.active?.characterId||stream.profile!==assets.profile||assets.ai===false||assets.voicePlayback?.muted||assets.voicePlayback?.volume===0){
  closeCloudVoiceStream(stream);return {cancelled:true};
 }
 if(!stream.reader||stream.reading)throw Error('语音流读取状态无效');
 stream.reading=true;
 if(!stream.expired)armCloudVoiceStream(stream);
 try{
  const {value,done}=await stream.reader.read();
  if(cloudVoiceStream!==stream)return {cancelled:true};
  if(done){closeCloudVoiceStream(stream);return {done:true};}
  return {bytes:value,done:false};
 }catch(error){
  if(cloudVoiceStream!==stream)return {cancelled:true};
  voiceDiagnostics.report({requestId:stream.requestId,stage:'request',errorCode:stream.expired?'read_timeout':'synthesis_failed',errorType:error.name});
  closeCloudVoiceStream(stream);
  throw Error(stream.expired?'语音请求读取超时':'语音流中断');
 }finally{stream.reading=false;}
}
const synthesizeVoice=require('./voice-request.cjs')({vault:voiceSecrets,diagnostics:voiceDiagnostics,isEnabled:()=>assets.ai!==false,isMuted:()=>assets.voicePlayback?.muted===true||assets.voicePlayback?.volume===0,fetchSynthesis:voiceTransport});
const saveVoiceSettings=require('./voice-settings.cjs')({vault:voiceSecrets,diagnostics:voiceDiagnostics,isEnabled:()=>assets.ai!==false,verify:voiceTransport,owner:()=>assets.active?assets.active.characterId+':'+assets.active.profile:null,commit:(prefs,key)=>library.commitVoice(prefs,key)});
async function selectModel(characterId,profile){
 screenObservation.invalidate();
 const previous=structuredClone(assets);
 const selected=library.activate(characterId,profile);
 try{await nativeRequest('select',selected);watchSession();}
 catch(error){for(const key of Object.keys(assets))delete assets[key];Object.assign(assets,previous);persist();throw error;}
 return {profile,characterId,isNew:false,modelChange:require('./model-transition.cjs')(previous,assets)};
}
let archiving=false;
async function archivePending(){
 if(archiving)return;archiving=true;const attempted=new Set();
 try{
  let id;
  while((id=(assets.sessionArchiveQueue||[]).find(id=>!attempted.has(id)))){
   attempted.add(id);
   try{await hostAction('session-archive',{id});assets.sessionArchiveQueue=assets.sessionArchiveQueue.filter(value=>value!==id);persist();}
   catch(e){console.warn('旧会话归档待重试',e.message);}
  }
 }finally{archiving=false;}
}
let ignoringPointer=false;
function passPointer(value){if(!win||win.isDestroyed()||ignoringPointer===value)return;
 win.setIgnoreMouseEvents(value,value?{forward:true}:{});ignoringPointer=value;
}
async function hostAction(op,body){
 const res=await fetch(new URL('/'+op,process.env.PET_BRIDGE),{method:'POST',headers:{authorization:'Bearer '+process.env.PET_SECRET},body:JSON.stringify(body),signal:AbortSignal.timeout(16000)});
 const data=await res.json();if(!res.ok)throw Error(data.error||'会话服务不可用');return data;
}
function watchSession(){const r=assets.profile&&library.route();hostAction('session-watch',{id:r?.connected?r.id:null}).catch(()=>{});}
function registerAssets(){
 ipcMain.on('lc-pointer-pass',(e,v)=>{if(e.sender===win?.webContents)passPointer(!!assets.pointerLock&&compact&&!adjusting&&!locked&&v===true);});
 library.setup();
 ipcMain.on('lc-event',(e,kind,payload)=>{
  if(e.sender!==win?.webContents||!['touch','chat','focus','emotion','model','state','experience'].includes(kind))return;
  fetch(new URL('/pet-event',process.env.PET_BRIDGE),{method:'POST',headers:{authorization:'Bearer '+process.env.PET_SECRET},body:JSON.stringify({kind,payload}),signal:AbortSignal.timeout(2200)}).catch(()=>{});
 });
 ipcMain.on('lc-store',(e,profile,op,key,value)=>{
  try{
   if(e.sender!==win?.webContents||profile!==(assets.active&&assets.profile?assets.active.characterId+':'+assets.profile:'setup'))throw Error('角色已切换');
   if(!['recall','legacyAllowed','get','set','seed','append','history','replaceHistory'].includes(op)||typeof key!=='string'||key.length>200||['__proto__','constructor','prototype'].includes(key))throw Error('无效数据');
   if(key==='lcVoiceDownloadSource'&&(op==='get'||op==='set')){
    if(op==='set'){
     if(!['official','china'].includes(value))throw Error('无效下载来源');
     assets.voiceDownloadSource=value;persist();
    }
    e.returnValue={ok:true,value:assets.voiceDownloadSource??null};return;
   }
   e.returnValue={ok:true,value:library.store(op,key,value)??null};
  }catch(err){e.returnValue={ok:false,error:String(err.message)};}
 });
 ipcMain.handle('pet-asset',async(e,op,value)=>{
  if(e.sender!==win.webContents)throw Error('窗口无权操作');
  if(op==='lock'){locked=value===true;if(locked){screenObservation.invalidate();passPointer(false);bubbleWindow?.hide();}return;}
  if(op==='pointerLock'){if(typeof value==='boolean'){assets.pointerLock=value;persist();passPointer(false);}return assets.pointerLock===true;}
  if(locked&&!['experienceRecord','experienceQuery','experiencePerformance'].includes(op))throw Error('模型适配中');
  if(op==='voiceCredential'){
   if(value?.action==='status')return voiceSecrets.status(value.provider,value.endpoint);
   if(value?.action!=='status'&&(cloudVoiceStream||saveVoiceSettings.isBusy()||synthesizeVoice.isBusy()))throw Error('语音操作进行中，请等待完成');
   if(value?.action==='set')return voiceSecrets.set(value.provider,value.endpoint,value.key);
   if(value?.action==='clear')return voiceSecrets.clear(value.provider,value.endpoint);
   throw Error('无效密钥操作');
  }
  if(op==='transcribeReference'){
   if(assets.ai===false)throw Error('AI 调用已关闭');
   return hostAction('transcribe-reference',{model:value?.model});
  }
  if(op==='saveVoiceReference'){
   const audio=value;
   if(typeof audio?.base64!=='string'||audio.base64.length>12*1024*1024)throw Error('参考音频大小无效');
   const bytes=Buffer.from(audio.base64,'base64');
   if(!bytes.length||bytes.length>8*1024*1024)throw Error('参考音频须小于 8 MB');
   const types={'audio/wav':'.wav','audio/x-wav':'.wav','audio/mpeg':'.mp3','audio/flac':'.flac','audio/ogg':'.ogg','audio/mp4':'.m4a'};
   const ext=types[audio.mime]||path.extname(audio.name||'').toLowerCase();
   if(!Object.values(types).includes(ext))throw Error('参考音频格式无效');
   const name='reference-'+require('node:crypto').createHash('sha256').update(bytes).digest('hex').slice(0,24)+ext;
   const file=path.join(library.dir('voice-references'),name);
   if(!fs.existsSync(file))fs.writeFileSync(file,bytes);
   return {name,mime:audio.mime};
  }
  if(op==='voiceStartLocal'){const state=voiceDiagnostics.begin({...value,provider:'local'});voiceDiagnostics.update({stage:'request'});return state;}
  if(op==='voiceStatus')return voiceDiagnostics.snapshot();
  if(op==='voiceClearError')return voiceDiagnostics.clear();
  if(op==='voiceReport'){
   if(!value?.requestId&&['save_failed','ai_disabled'].includes(value?.errorCode)){voiceDiagnostics.begin(value);voiceDiagnostics.fail({stage:value.stage||'save',errorCode:value.errorCode});return;}
   voiceDiagnostics.report(value||{});return;
  }
  if(op==='voicePlayback'){if(value!==undefined){if(!value||!Number.isFinite(value.volume)||value.volume<0||value.volume>1||typeof value.muted!=='boolean')throw Error('音量设置无效');assets.voicePlayback={volume:value.volume,muted:value.muted};if(value.muted||value.volume===0)closeCloudVoiceStream();persist();}return assets.voicePlayback||{volume:.8,muted:false};}
  if(op==='toolLayout'){
   if(value!==undefined){
    if(!value||!['horizontal','vertical'].includes(value.layout)||![0,1,2].includes(value.row)||![0,1,2].includes(value.column))throw Error('小按钮布局无效');
    assets.toolLayout={layout:value.layout,row:value.row,column:value.column};
    persist();
   }
   return assets.toolLayout;
  }
  if(op==='voiceSave'){if(cloudVoiceStream||synthesizeVoice.isBusy())throw Error('语音请求进行中，请等待完成');return saveVoiceSettings(value);}
  if(op==='voiceCheck'){if(cloudVoiceStream||synthesizeVoice.isBusy())throw Error('语音请求进行中，请等待完成');return saveVoiceSettings.check(value);}
  if(op==='voiceSynthesize'){if(cloudVoiceStream||saveVoiceSettings.isBusy())throw Error('语音设置或测试进行中，请等待完成');return synthesizeVoice(value);}
  if(op==='voiceStreamOpen')return openCloudVoiceStream(e.sender,value);
  if(op==='voiceStreamRead')return readCloudVoiceStream(e.sender,value?.clientRequestId);
  if(op==='voiceCancel'){
   if(cloudVoiceStream?.sender===e.sender&&cloudVoiceStream.clientRequestId===value?.clientRequestId)return closeCloudVoiceStream();
   return synthesizeVoice.cancel(value?.clientRequestId);
  }
  if(op==='publishContext'){if(value?.context?.characterId!==assets.active?.characterId||value?.context?.profile!==assets.active?.profile)throw Error('角色已切换，配置未发布');return hostAction('character-context',value);}
  if(op==='preferences')return {autoStart:assets.autoStart===true,ai:assets.ai!==false,processContext:assets.processContext===true,screenObservation:assets.screenObservation===true};
  if(op==='preference'){
   const {key,enabled}=value||{};
   if(!['autoStart','ai','processContext','screenObservation'].includes(key)||typeof enabled!=='boolean')throw Error('设置无效');
   if(key==='screenObservation'&&enabled&&assets.processContext!==true)throw Error('请先开启感知前台应用');
   if(key==='ai'&&enabled){
    let pending;
    do{pending=breezeRelease;await pending;}while(pending!==breezeRelease);
   }
   if(key!=='autoStart'&&assets[key]!==enabled)screenObservation.invalidate();
   assets[key]=enabled;
   if(key==='processContext'&&!enabled)assets.screenObservation=false;
   persist();
   if(key==='ai'&&!enabled){
    closeCloudVoiceStream();
    const releaseOptions={idleVramOptimization:idleVramOptimization()};
    const release=breezeRelease.then(()=>nativeRequest('voice-release',releaseOptions));
    breezeRelease=release.catch(error=>console.warn('本地 Breeze 资源释放未确认',error.message));
    await Promise.all([release,hostAction('ai-stop',{id:assets.profile?library.route().id:''})]);
   }
   return;
  }
  if(op==='screenObservationCapture')return screenObservation.capture(value);
  if(op==='screenObservationValidate')return screenObservation.valid(value,value?.stamp);
  if(op==='experienceRecord')return library.experiences.record(value);
  if(op==='experienceQuery')return library.experiences.query(value);
  if(op==='experiencePerformance')return library.experiences.performance(value);
  if(op==='library')return library.info();
  if(op==='appearanceSnapshot')return library.appearanceSnapshot(value?.profile,value?.image);
  if(op==='renameCharacter'){library.rename(value.characterId,value.name);return library.info();}
  if(op==='route'){if(!assets.profile)return null;const r=library.route();return r;}
  if(op==='sessionHistory'||op==='sessionCancel'||op==='sessionState'){
   if(!assets.profile)return null;const r=library.route();
   if(value?.sessionId&&value.sessionId!==r.id)throw Error('角色会话已切换，未取消其他会话');
   if(op==='sessionCancel')return hostAction('session-cancel',{id:r.id,eventId:value?.eventId});
   if(op==='sessionState')return hostAction('session-state',{id:r.id});
   return r.connected?hostAction('session-history',{id:r.id,limit:value}):null;
  }
  if(op==='resetSession'){screenObservation.invalidate();library.reset();watchSession();void archivePending();return;}
  if(op==='markSession'){library.mark(value);await hostAction('session-watch',{id:value}).catch(()=>{});return;}
  if(op==='deleteModel'||op==='deleteCharacter'){
   if(value?.confirmed!==true)throw Error('请确认删除操作');
   if(await rendererDiagnostics.execute('window.companion?.chatState().busy','busy-check'))throw Error('请等待当前回复结束');
   const previous=assets.active&&{...assets.active};
   screenObservation.invalidate();
   await nativeRequest('clear',{});
   try{
    if(op==='deleteModel')library.deleteModel(value.characterId,value.profile);
    else{library.deleteCharacter(value.characterId);await hostAction('character-context-delete',{characterId:value.characterId}).catch(error=>console.warn('角色预设清理待重试',error.message));}
   }catch(error){if(assets.model)await nativeRequest('select',{path:assets.model,entry:assets.entry});throw error;}
   if(assets.model)await nativeRequest('select',{path:assets.model,entry:assets.entry});
   watchSession();void archivePending();return {changed:JSON.stringify(previous)!==JSON.stringify(assets.active)};
  }
  if(op==='pickVoiceEnvironment'){
   const result=await dialog.showOpenDialog(win,{title:'选择已配置的本地语音环境目录',properties:['openDirectory']});
   if(result.canceled||!result.filePaths[0])return {cancelled:true};
   return nativeRequest('voice-environment',{model:value?.model,directory:result.filePaths[0]});
  }
  if(op==='voiceReferences'||op==='readVoiceReference'||op==='pickVoiceReference'){
   const folder=library.dir('voice-references');
   const types={'.wav':'audio/wav','.mp3':'audio/mpeg','.flac':'audio/flac','.ogg':'audio/ogg','.m4a':'audio/mp4'};
   const entries=fs.readdirSync(folder,{withFileTypes:true}).filter(entry=>entry.isFile()&&Object.hasOwn(types,path.extname(entry.name).toLowerCase()));
   if(op==='voiceReferences')return entries.map(entry=>entry.name).sort((a,b)=>a.localeCompare(b));
   let file;
   if(op==='pickVoiceReference'){
    const pick=await dialog.showOpenDialog(win,{title:'选择参考音频',properties:['openFile'],filters:[{name:'音频',extensions:Object.keys(types).map(ext=>ext.slice(1))}]});
    if(pick.canceled)return null;
    file=pick.filePaths[0];
   }else{
    if(!entries.some(entry=>entry.name===value))throw Error('参考音频已移动或不在参考音频目录');
    file=path.join(folder,value);
   }
   const metadata=fs.statSync(file);
   if(!metadata.isFile()||metadata.size>8*1024*1024)throw Error('参考音频须为 8MB 以内的文件');
   return {name:path.basename(file),mime:types[path.extname(file).toLowerCase()],base64:fs.readFileSync(file).toString('base64')};
  }
  if(op==='openFolder'){const error=await shell.openPath(library.dir(value));if(error)throw Error(error);return;}
  if(op==='relocate'){
   const pick=await dialog.showOpenDialog(win,{title:'选择新资产库的父目录',properties:['openDirectory','createDirectory']});
   if(pick.canceled)return false;
   library.relocate(pick.filePaths[0]);
   if(assets.model)await nativeRequest('select',{path:assets.model,entry:assets.entry});
   return true;
  }
  if(op==='scope'||op==='groupPersona'||op==='moveModel')throw Error('模型归属在导入后不可更改，记忆由角色身份管理');
  if(op==='status')return {...library.info(),core:!!assets.core&&fs.existsSync(assets.core),top:assets.top!==false};
  if(op==='top'){assets.top=!!value;persist();applyTop();win.webContents.send('pet-top',assets.top);return;}
  if(op==='core')throw Error('Cubism Core 由依赖管理器维护，请在 DSH 中重新检测依赖');
  if(op==='browse'){
   const ext='模型压缩包';
   const pick=await dialog.showOpenDialog(win,{title:'导入 Live2D 运行时压缩包',properties:['openFile'],filters:[{name:ext,extensions:['zip','rar','7z']}]});
   if(pick.canceled)return null;
   const file=pick.filePaths[0];
   const entries=await nativeRequest('list',{path:file});pendingFile=file;pendingEntries=entries;return entries;
  }
  if(op==='importModels'){
   if(value?.confirmed!==true||!pendingFile)throw Error('请先选择压缩包并确认模型归属');
   if(!Array.isArray(value.entries)||value.entries.some(item=>!pendingEntries.includes(item.entry)))throw Error('模型入口已变化');
   if(await rendererDiagnostics.execute('window.companion?.chatState().busy','busy-check'))throw Error('请等待当前回复结束');
   locked=true;
   try{
    const previous=structuredClone(assets);
    const result=await library.importModels(pendingFile,value.entries,{characterId:value.characterId,name:value.name},nativeRequest);
    await nativeRequest('select',{path:assets.model,entry:assets.entry});pendingFile='';pendingEntries=[];watchSession();return {...result,modelChange:require('./model-transition.cjs')(previous,assets,result)};
   }finally{locked=false;}
  }
  if(op==='selectModel')return selectModel(value.characterId,value.profile);

 });
}
function applyTop(){
 if(!win||win.isDestroyed())return;
 const enabled=compact&&assets.top!==false;
 win.setAlwaysOnTop(enabled,enabled?'screen-saver':'normal');if(enabled&&win.isVisible())win.moveTop();bubbleWindow?.top();
}
function showCharacter(){
  compact=true;
  const area=screen.getDisplayMatching(win.getBounds()).workArea;
  const width=Math.min(area.width,350),height=Math.min(area.height,570);
  applyTop();
  win.setBounds(petBounds||{x:area.x+area.width-width,y:area.y+area.height-height,width,height});
  win.webContents.send('pet-layout',true,true);
}
async function openSettings(){
 try {
  const reply=await fetch(new URL('/open-settings',process.env.PET_BRIDGE),{method:'POST',headers:{authorization:'Bearer '+process.env.PET_SECRET},signal:AbortSignal.timeout(5000)});
  if(!reply.ok)throw Error();
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'focus-dsh.ps1')],{windowsHide:true,stdio:'ignore'});
  child.on('error',()=>{});
 }catch{dialog.showMessageBox(win,{type:'warning',message:'请先打开 DSH，然后在左侧选择 Live Character。'});}
}
let petBounds,adjusting=false,adjustDrag=null,choice='off';
const boundsFile=path.join(data,'pet-window.json');
function remember(){
 if(!petBounds)return;
 const display=screen.getDisplayMatching(petBounds);
 const data={display:display.id,bounds:geometry.relative(petBounds,display.workArea)};
 fs.writeFileSync(boundsFile+'.tmp',JSON.stringify(data));fs.renameSync(boundsFile+'.tmp',boundsFile);
}
function adjust(enabled){
 adjusting=compact&&enabled;adjustDrag=null;if(adjusting)bubbleWindow?.hide();
 if(!adjusting&&compact){petBounds=win.getBounds();remember();}
 win.webContents.send('pet-adjust',adjusting);
}
function menu() {
 if(locked)return;
  if(locked||assets.pointerLock)return;
  Menu.buildFromTemplate([
    {label:'打开设置',click:openSettings},
    {label:adjusting?'完成窗口调整':'窗口调整模式',enabled:compact,click:()=>adjust(!adjusting)},
    {label:'退出桌宠',click:()=>app.quit()}
  ]).popup({window:win});
}
async function start() {
  assets.core=require('./core-runtime.cjs')(data);persist();
  registerAssets();
  const python=path.join(data,'python-3.13.9','python.exe');
  const cmd="import sys,runpy;sys.path.insert(0,sys.argv.pop(1));runpy.run_module('server',run_name='__main__')";
  service=spawn(python,['-B','-u','-X','utf8','-c',cmd,lab,'--no-browser','--port','61951','--fallback-port'],{
    windowsHide:true,env:{...process.env,PET_ASSETS:prefs,PET_NATIVE:nativeToken,PET_WEB_TOKEN:webToken},stdio:['pipe','pipe','pipe']});
  service.on('error',fail);
  let log='';
  service.stderr.on('data',chunk=>log=(log+chunk).slice(-2400));
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('模型服务启动超时，请检查模型压缩包。')),45000);
    let banner='';
    service.stdout.setEncoding('utf8');
    const onBanner=chunk=>{
      banner=(banner+chunk).slice(-2000);
      const match=banner.match(/^角色调试台：(http:\/\/127\.0\.0\.1:[1-9]\d{0,4})\/\r?\n/m);
      if(!match)return;
      url=match[1];
      service.stdout.removeListener('data',onBanner);
      service.stdout.resume();
      clearTimeout(timer);
      resolve();
    };
    service.stdout.on('data',onBanner);
    service.once('exit',()=>{clearTimeout(timer);const error=Error('模型服务退出，请检查模型压缩包。\n'+log);reject(error);if(win&&!quitting)fail(error);});
  });
  session.defaultSession.webRequest.onBeforeSendHeaders({urls:[url+'/*']},(d,cb)=>{
    d.requestHeaders['X-Pet-Window']=webToken;cb({requestHeaders:d.requestHeaders});
  });
  win=new BrowserWindow({icon:path.join(__dirname,'lc.ico'),title:'Live Character',show:false,frame:false,transparent:true,backgroundColor:'#00000000',width:350,height:570,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
  rendererDiagnostics=require('./renderer-diagnostics.cjs')(win.webContents,data);
  const pageSnapshot=rendererDiagnostics.snapshot;rendererDiagnostics.snapshot=()=>({...pageSnapshot(),voice:voiceDiagnostics.snapshot()});
  bubbleWindow=require('./bubble-window.cjs').create({BrowserWindow,screen,ipcMain,parent:win,isEnabled:()=>compact&&!locked&&!adjusting&&!quitting,isTop:()=>compact&&assets.top!==false,onError:error=>rendererDiagnostics.record('bubble',{message:error.message})});
  ipcMain.on('lc-bubble',(event,payload)=>{if(event.sender===win.webContents)bubbleWindow.update(payload);});
  ipcMain.on('lc-renderer-error',(event,detail)=>{if(event.sender!==win.webContents||!detail||typeof detail!=='object')return;
    const kind=['error','rejection','resource','model'].includes(detail.kind)?detail.kind:'error';
    rendererDiagnostics.record(kind,{message:detail.message,stack:detail.stack,source:detail.source,line:detail.line});
  });
  win.setAppDetails({appId:'LiveCharacter.Desktop',appIconPath:path.join(__dirname,'lc.ico'),appIconIndex:0,relaunchDisplayName:'Live Character'});
  win.webContents.on('will-navigate',(e,target)=>{if(target!==url+'/')e.preventDefault();});
  win.webContents.setWindowOpenHandler(({url:target})=>({action:'deny'}));
  ipcMain.on('pet-focus-state',(event,value,mode)=>{if(event.sender===win.webContents){focusedMode=value===true;choice=mode;}});
  ipcMain.handle('pet-window-config',(event,value)=>{
   if(event.sender!==win.webContents)return null;
   const b=compact?win.getBounds():petBounds;
   const area=screen.getDisplayMatching(b||win.getBounds()).workArea;
   if(value===undefined)return b?geometry.relative(b,area):null;
   if(!value||!['x','y','width','height'].every(k=>Number.isFinite(value[k])))throw Error('无效窗口配置');
   petBounds=geometry.restore(value,area);if(compact)win.setBounds(petBounds);remember();
  });
  ipcMain.on('pet-adjust-input',(event,phase,edge)=>{
   if(event.sender!==win.webContents||locked)return;
   if(phase==='toggle'){adjust(!adjusting);return;}
   if(!adjusting)return;
   if(phase==='done'){adjust(false);return;}
   if(phase==='end'){adjustDrag=null;return;}
   const cursor=screen.getCursorScreenPoint();
   if(phase==='start' && ['move','n','e','s','w','ne','nw','se','sw'].includes(edge)){
    adjustDrag={edge,cursor,bounds:win.getBounds()};return;
   }
   if(phase==='move'&&adjustDrag){
    const {edge,bounds,cursor:start}=adjustDrag;
    const display=edge==='move'?screen.getDisplayNearestPoint(cursor):screen.getDisplayMatching(bounds);
    win.setBounds(geometry.adjusted(bounds,edge,cursor.x-start.x,cursor.y-start.y,display.workArea));
   }
  });
  ipcMain.on('pet-menu',e=>{if(e.sender===win.webContents)menu();});
  win.webContents.on('did-finish-load',()=>win.webContents.send('pet-layout',true,true));
  await nativeRequest('clear',{});
  if(assets.model){try{await nativeRequest('select',{path:assets.model,entry:assets.entry});}catch(error){console.warn('当前模型无法加载，角色资料保留',error.message);delete assets.active;for(const key of ['model','entry','profile','variant'])delete assets[key];persist();}}
  win.webContents.on('did-start-navigation',(_event,_url,isInPlace,isMainFrame)=>{if(!isInPlace&&isMainFrame)closeCloudVoiceStream();});
  win.webContents.on('render-process-gone',()=>closeCloudVoiceStream());
  await win.loadURL(url);
  void archivePending();
  try{const saved=JSON.parse(fs.readFileSync(boundsFile,'utf8'));
   const display=screen.getAllDisplays().find(d=>d.id===saved.display)||screen.getPrimaryDisplay();
   petBounds=geometry.restore(saved.bounds,display.workArea);
  }catch{}
  win.on('show',applyTop);win.on('restore',applyTop);showCharacter();win.show();applyTop();
  if(!assets.model||!assets.core)void openSettings();
  require('./panel.cjs')(win,()=>assets.profile?library.route().id:null,rendererDiagnostics).then(()=>{
    if(!win.isDestroyed())watchSession();
  }).catch(error=>{
    rendererDiagnostics.record('startup',{message:error.message,stack:error.stack});
    console.warn(error.message);
    service?.kill();
    app.exit(1);
  });
  win.webContents.on('did-start-loading',()=>{passPointer(false);bubbleWindow.hide();});
  win.on('closed',()=>bubbleWindow.destroy());
  setInterval(()=>{if(!assets.pointerLock||!compact||adjusting||locked||win.isDestroyed())return;
   const pt=screen.getCursorScreenPoint(),b=win.getContentBounds();
   win.webContents.send('lc-lock-probe',pt.x-b.x,pt.y-b.y);
  },40).unref();
  let previous='';
  setInterval(()=>{
    if(win.isDestroyed() || !focusedMode || adjusting)return;
    const p=screen.getCursorScreenPoint(), b=win.getBounds();
    const point=[p.x-b.x,p.y-b.y];const area=screen.getDisplayMatching(b).workArea;
    if(previous!==point.join(',')){win.webContents.send('pet-gaze',...point,{x:area.x-b.x,y:area.y-b.y,width:area.width,height:area.height});previous=point.join(',');}
  },80).unref();
  setInterval(()=>{try{process.kill(Number(process.env.PET_HOST),0);}catch{app.quit();}},2500).unref();
}
app.on('before-quit',()=>{quitting=true;service?.stdin.end();});
app.on('will-quit',()=>{closeCloudVoiceStream();service?.kill();});
app.on('window-all-closed',()=>app.quit());
