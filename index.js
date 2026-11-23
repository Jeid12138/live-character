import {installPanel,installHooks,pluginVersion} from './host-panel.js';
import {responseObject} from './model-response.js';
import {sessionBridge} from './pet-sessions.js';
import {diagnoseDependencies,dependencyAssistanceAvailability} from './dependency-assist.js';
import {createRuntimeLauncher,preparationExitError} from './runtime-launcher.js';
import http from 'node:http';
import fs from 'node:fs';
import VoiceDiagnostics from './desktop/voice-diagnostics.cjs';
function preferences(){try{return JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'LiveCharacter','assets.json'),'utf8'));}catch{return {};}}
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';

export const name = 'live-character';
export const inject = ['agentPresets'];
const root = path.dirname(fileURLToPath(import.meta.url));

function currentScreenConsent(payload){
 const p=preferences(),owner=p.active;
 if(p.ai===false||p.processContext!==true||p.screenObservation!==true||payload.event?.type!=='observe'||payload.event.automatic!==true)return false;
 if(!owner||!/^char-[a-f0-9-]{36}$/i.test(owner.characterId)||owner.characterId!==payload.context?.characterId||owner.profile!==payload.context?.profile)return false;
 try{
  const assetRoot=p.assetRoot||path.join(process.env.LOCALAPPDATA,'LiveCharacter','asset');
  const session=JSON.parse(fs.readFileSync(path.join(assetRoot,'_characters',owner.characterId,'memory','session.json'),'utf8'));
  return typeof session.id==='string'&&session.id===payload.route?.id;
 }catch{return false;}
}

function recordSession(route, error, workspaceGrouping,transport) {
  if (!process.env.LOCALAPPDATA) return;
  const dir = path.join(process.env.LOCALAPPDATA, 'LiveCharacter', 'logs');
  const code = typeof error?.code === 'string' && /^[a-z0-9_/-]{1,80}$/i.test(error.code) ? error.code : undefined;
  try {
    fs.mkdirSync(dir, {recursive:true});
    const dest = path.join(dir, 'session-last.json');
    fs.writeFileSync(dest + '.tmp', JSON.stringify({version:pluginVersion, at:new Date().toISOString(),route,code,stage:error?.lcStage,workspaceGrouping,...(transport?{transport}:{})}));
    fs.renameSync(dest + '.tmp', dest);
  } catch { /* A diagnostic write must not interrupt the turn. */ }
}

export async function decide(llm, config, payload, signal, sessions, attachments, screenConsent) {
  const {instruction, inference={},visuals, ...context} = payload;
  const nativeEvent=['chat','touch','observe','model_change'].includes(context.event?.type),following=nativeEvent&&inference.followSessionModel===true;
  if(!nativeEvent&&typeof instruction!=='string')throw Error('适配作业缺少说明');
  const routes = following?[]:llm.listProviders().map(provider => provider.id);
  let provider = inference.provider || config.provider || ['deepseek-account', 'deepseek-official'].find(id => routes.includes(id)) || routes[0];
  if(!following&&inference.model&&llm.listModels&&!inference.provider&&!config.provider){for(const candidate of [...new Set([provider,...routes])]){try{const models=await llm.listModels(candidate);if(models.some(m=>(typeof m==='string'?m:m.id)===inference.model)){provider=candidate;break;}}catch{}}}
  if(!following&&!provider)throw Error('请先在 DSH 配置模型服务');
  const levels=['off','low','high','max'];
  const model=inference.model || config.model || 'deepseek-flash';
  if(typeof model!=='string' || model.length>180)throw Error('模型名称无效');
  const mode=inference.mode??'auto', cap=inference.cap??'high';
  if(![...levels,'auto'].includes(mode)||!levels.includes(cap))throw Error('推理档位无效');
  const text=String(context.event?.text||'');
  const adapting=context.event?.type==='adapt';
  let wanted=adapting?'high':mode;
  if(!adapting&&mode==='auto'){
    wanted='off';
    if(context.event?.type==='adapt')wanted='high';
    if(context.event?.type==='chat'){
      wanted='low';
      if(text.length>=160 || /分析|比较|权衡|分镜|排查|规划|推理|多步骤/.test(text))wanted='high';
      if(/深入推演|最高推理|穷举验证|详尽论证/.test(text))wanted='max';
    }
    wanted=levels[Math.min(levels.indexOf(wanted),levels.indexOf(cap))];
  }
  const info=following?{}:await llm.resolveModelInfo(provider,model,signal);
  const supported=new Set((info.reasoning?.efforts||[]).map(e=>e.id));
  const allowed=adapting?['high']:levels.slice(0,mode==='auto'?levels.indexOf(cap)+1:levels.length);
  const effort=adapting?(supported.has('high')?'high':undefined):levels.slice(0,levels.indexOf(wanted)+1).reverse().find(e=>supported.has(e))||allowed.find(e=>supported.has(e));
  if(adapting&&!effort)throw Error('当前模型未声明 high 推理档位，请选择支持 high 的模型进行适配');
  if(!effort&&supported.size)throw Error('模型声明的推理档位全部超过自适应上限，请选择其他模型或调整上限');
  let sessionNote;
  if(nativeEvent&&(!sessions||!context.route?.id))throw Object.assign(Error('角色互动需要有效 DSH 会话，未改用直连生成'),{code:'SESSION_UNAVAILABLE',submitted:false});
  const modelChange=context.event?.type==='model_change',screenObservation=context.event?.type==='observe'&&context.event.automatic===true;let appearanceSource='metadata',appearanceNote;
  const images=[];
  if(visuals!==undefined){
   if(!Array.isArray(visuals)||visuals.length!==(adapting?2:1)||(!adapting&&!modelChange&&!screenObservation))throw Error('角色图像请求无效');
   for(const image of visuals)if(typeof image!=='string'||image.length>850000||!image.startsWith('data:image/jpeg;base64,'))throw Error('角色图像格式或大小无效');
   if(!following&&!info.inputModalities?.includes('image')||!attachments?.saveImage){
    if(adapting)throw Error('当前模型未声明图片输入或缺少图片附件服务，请选择支持图片的模型后再适配触摸区域');
    appearanceNote='当前模型或附件服务不支持图片；本次仍通过角色会话使用名称和已有记录，未建立新的视觉认知';
   }else{
    for(const image of visuals){
     const data=Buffer.from(image.slice(23),'base64');if(data[0]!==255||data[1]!==216)throw Error('角色图片解码失败');
     signal?.throwIfAborted();
     if(screenObservation&&screenConsent&&!screenConsent())break;
     try{const attachment=await attachments.saveImage({data,mediaType:'image/jpeg'});images.push({type:'image',attachment});}
     catch(error){if(!screenObservation||signal?.aborted)throw error;}
    }
    if(images.length)appearanceSource='image';
   }
  }
  if(nativeEvent){
   try{const result=await sessions.chat({...context,instruction,inference,screenAttached:screenObservation&&images.length===1,appearanceEvidence:appearanceSource},signal,following?undefined:{provider,model,...(effort?{reasoningEffort:effort}:{})},images,screenObservation?screenConsent:undefined);
    recordSession('session',null,result.workspaceGrouping,result.transport);
    let imageNote='';
    if(screenObservation&&visuals){
     const count=result.transport?.attachmentCount??images.length;
     imageNote=count>0?' · 已附当前屏幕截图':' · 本次观察使用文字';
    }
    return {...result,...(modelChange?{appearanceSource:result.appearanceSource||appearanceSource,appearanceNote:result.appearanceNote||appearanceNote}:{}),sessionNote:'DSH 角色会话'+(following?' · 跟随会话选模':'')+(result.workspaceGrouping?.status==='unavailable'?' · '+result.workspaceGrouping.message:'')+imageNote};}
   catch(e){recordSession('session-error',e);throw e;}
  }
  delete context.route;
  const content=[{type:'text',text:JSON.stringify(context)},...images];
  const blocks = new Map();
  let usage,finish,reasoningChars=0;
  const maxTokens=adapting?null:({off:1600,low:2400,high:4800,max:8000})[effort||wanted];
  for await (const chunk of llm.stream({
    provider, model, ...(effort?{reasoningEffort:effort}:{}), system: instruction,
    messages: [{role:'user',content}],
    ...(maxTokens===null?{}:{maxTokens}), tools:[], signal
  })) {
    if (chunk.type === 'text-delta') blocks.set(chunk.index, (blocks.get(chunk.index) || '') + chunk.text);
    if (chunk.type === 'block-end' && chunk.block.type === 'text') blocks.set(chunk.index, chunk.block.text);
    if (chunk.type === 'usage') usage = chunk.usage;
    if (chunk.type === 'finish') finish=chunk.reason;
    if (chunk.type === 'reasoning-delta') reasoningChars+=chunk.text?.length||0;
  }
  const reply=[...blocks.entries()].sort(([a],[b])=>a-b).map(([,text])=>text).join('').trim();
  const diagnostics={provider,model,effort,maxTokens,usage,finishKind:finish?.kind||'not-reported',replyChars:reply.length,reasoningChars,failureCode:typeof finish?.failure?.code==='string'&&/^[a-z0-9_/-]{1,80}$/i.test(finish.failure.code)?finish.failure.code:null};
  try{
   signal.throwIfAborted();
   if(finish?.kind==='error'||finish?.kind==='aborted')throw Object.assign(Error('模型流结束时报告错误，请查看适配报告'),{code:'MODEL_STREAM_ERROR'});
   if(finish?.kind==='max-tokens'){
    const reasoningOnly=!reply&&reasoningChars>0;
    throw Object.assign(Error(reasoningOnly?'推理耗尽模型输出预算，尚未生成适配结果':'模型输出达到上限，未获得完整结果'),{code:reasoningOnly?'MODEL_REASONING_EXHAUSTED':'MODEL_MAX_TOKENS'});
   }
   const plan=responseObject(reply);
   return {plan,usage,model,effort,sessionNote,diagnostics,...(modelChange?{appearanceSource,appearanceNote}:{}),effortNote:!effort?'模型未声明推理档位，已使用服务默认设置':effort!==wanted?'已使用可用推理档位 '+effort:''};
  }catch(error){
   error.code||='MODEL_INTERRUPTED';error.diagnostics=diagnostics;throw error;
  }
}

export async function balance(ctx){
  let key=process.env.DEEPSEEK_API_KEY;
  try{key=(await ctx.get?.('credentials')?.resolve('DEEPSEEK_API_KEY'))?.value||key;}catch{/* A signed-in account can have no API key. */}
  if(key){
    const r=await fetch('https://api.deepseek.com/user/balance',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('余额查询失败 HTTP '+r.status);
    const data=await r.json();
    const rows=(data.balance_infos||[]).filter(w=>typeof w.total_balance==='string'&&w.total_balance.trim()&&Number.isFinite(Number(w.total_balance)));
    if(!rows.length)throw Error('接口未返回有效余额');
    return {source:'DSH API Key',wallets:rows.map(w=>({currency:w.currency,total:Number(w.total_balance)}))};
  }
  const account=ctx.get?.('deepseekAccount');if(!account)throw Error('请先在 DSH 登录账号或配置 DeepSeek API Key');
  const result=await account.getBalance({version:process.env.DSH_CLIENT_VERSION||process.env.DSH_VERSION||'unknown',locale:'zh_CN',timezoneOffsetSeconds:-new Date().getTimezoneOffset()*60});
  if(result?.status!=='ready')throw Error('账号余额暂不可用，请检查 DSH 登录状态');
  const totals=new Map();
  for(const w of [...(result.value||[]),...(result.bonusWallets||[])]){
    if(w.balance==null||w.balance===''||!Number.isFinite(+w.balance))continue;
    const unit=w.currency||'CNY';totals.set(unit,(totals.get(unit)||0)+Number(w.balance));
  }
  if(!totals.size)throw Error('账号没有可读取的钱包');
  return {source:'DSH 登录账号',wallets:[...totals].map(([currency,total])=>({currency,total}))};
}

export function apply(ctx, config={}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    console.warn('[live-character] 需要 x64 Windows 桌面'); return;
  }
  const sessions=sessionBridge(ctx,config);void sessions.restorePresets?.().catch(error=>console.warn('[Live Character]',error.message));let pendingAI,pendingDependencyAI,watchController,watchId;
  let port=0;
  const request=async command=>{
    if(command.op==='diagnostics'){
      const voice=VoiceDiagnostics.read(path.join(process.env.LOCALAPPDATA,'LiveCharacter'));
      const file=path.join(process.env.LOCALAPPDATA,'LiveCharacter','logs','renderer-last-error.json');
      try{
        const saved=JSON.parse(fs.readFileSync(file,'utf8')),historical=saved.version!==pluginVersion;
        return {...saved,voice,currentVersion:pluginVersion,workspaceGrouping:sessions.workspaceStatus?.(),historical,online:!!port,file,message:historical?'旧版本保存的页面日志，不代表本次启动进入了渲染阶段':!port?'当前版本保存的页面日志，角色此时未连接':'当前版本页面日志'};
      }catch{return {voice,currentVersion:pluginVersion,workspaceGrouping:sessions.workspaceStatus?.(),events:[],file,message:'尚无角色页面错误记录'};}
    }
    if(!port||life.signal.aborted){
      const status=runtimeStatus();
      throw Error(startError||(status.phase==='failed'?status.message:'桌宠尚未就绪，请确认桌面角色已启动'));
    }
    const r=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify(command),signal:AbortSignal.any([life.signal,AbortSignal.timeout(20000)])});
    const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'角色暂时无法响应'),{code:d.code});return d;
  };
  const token = randomBytes(32).toString('hex');
  const life = new AbortController();
  let startError='',navigation=0,launcher,currentRunId;
  let characterProcess,installerProcess,busy=false;
  let resolveBridge;
  const bridgeReady=new Promise(resolve=>{resolveBridge=resolve;});
  const launchRuntime=async cmd=>{
    if(!await bridgeReady||life.signal.aborted)throw Error(startError||'DSH 插件已停止');
    return launcher.launch({runId:cmd?.runId});
  };
  const cancelRuntime=async id=>await bridgeReady?launcher.cancel(id):{cancelled:false};
  const runtimeStatus=()=>{
    const state={...launcher?.state(),online:!!port,starting:!!characterProcess&&!port};
    try{
      const status=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'LiveCharacter','install-status.json'),'utf8'));
      const active=state.preparing||state.starting||state.online;
      const terminal=['failed','cancelled','missing'].includes(status.phase)||(status.phase==='ready'&&status.manualStart);
      if(currentRunId&&status.version===pluginVersion&&status.runId===currentRunId&&(active||terminal))return {...status,...state,message:startError||status.message,phase:startError&&status.phase!=='cancelled'?'failed':status.phase};
    }catch{}
    return {...state,phase:startError?'failed':'idle',message:startError||'角色未启动'};
  };
  installPanel(ctx,cmd=>cmd.op==='navigation'?{sequence:navigation}:cmd.op==='launch'?launchRuntime(cmd):cmd.op==='launch-cancel'?cancelRuntime(cmd.runId):cmd.op==='dependencies'?runtimeStatus():cmd.op==='models'?availableModels():cmd.op==='links'?hooks.links():request(cmd));const hooks=installHooks(ctx,request);
  async function availableModels(){const llm=ctx.get('llm');if(!llm)return [];const providers=llm.listProviders().map(p=>p.id);const results=await Promise.allSettled(providers.map(id=>llm.listModels(id)));return [...new Set(results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value).map(m=>typeof m==='string'?m:m.id).filter(Boolean))];}
  const server = http.createServer(async (req,res) => {
    const send = (code,body) => { res.writeHead(code,{'content-type':'application/json'}); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== 'Bearer '+token || req.headers.origin) return send(403,{});
    if(req.method==='POST'&&['/character-context','/character-context-delete'].includes(req.url)){
     try{let raw='';for await(const c of req){raw+=c;if(raw.length>200000)throw Error('角色配置过大');}const payload=JSON.parse(raw);
      if(req.url==='/character-context-delete'){await sessions.removePreset(payload.characterId);return send(200,{});}
      const result=await sessions.publishConfiguration(payload);return send(200,{revision:result.revision,presetId:result.presetId});
     }catch(error){return send(400,{error:error.message,code:error.code,submitted:false});}
    }
    if(req.method==='POST'&&req.url==='/session-watch'){
     try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>200)throw Error('会话参数无效');}const {id}=JSON.parse(raw);
      if(watchId!==id){watchController?.abort();watchId=id;
       if(id){watchController=new AbortController();const sig=AbortSignal.any([life.signal,watchController.signal]);
        sessions.watch(id,sig,e=>request({op:'sessionEvent',id,row:e})).catch(()=>{if(!sig.aborted)watchId=null;});}
      }return send(200,{});
     }catch(e){return send(400,{error:e.message});}
    }
    if(req.method==='POST'&&['/session-archive','/session-history','/session-cancel','/session-state','/ai-stop'].includes(req.url)){
     try{let raw='';for await(const c of req){raw+=c;if(raw.length>2048)throw Error('请求太长');}const b=JSON.parse(raw);
      if(req.url==='/session-archive'){await ctx.get('workspaceRegistry').archiveSession(b.id);return send(200,{});}
      if(req.url==='/session-history')return send(200,await sessions.history(b.id,Math.max(1,Math.min(100000,Number(b.limit)||100)),AbortSignal.timeout(12000)));
      if(req.url==='/session-state')return send(200,await sessions.state(b.id));
      const stopping=sessions.cancel(b.id,b.eventId);if(req.url==='/ai-stop'||req.url==='/session-cancel')pendingAI?.abort();return send(200,await stopping);
     }catch(e){return send(400,{error:e.message});}
    }
    if(req.method==='POST'&&req.url==='/pet-event'){let raw='';for await(const c of req){raw+=c;if(raw.length>16000)return send(413,{});}try{const e=JSON.parse(raw);hooks.emit(e.kind,e.payload);return send(200,{});}catch{return send(400,{});}}
    if(req.method==='POST'&&req.url==='/open-settings'){navigation=Date.now();return send(200,{});}
    if(req.method==='POST'&&req.url==='/desktop-online'){
      const announcing=characterProcess;
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>5)return send(400,{});}const candidate=Number(raw);
      if(!Number.isInteger(candidate)||candidate<1024||candidate>65535)return send(400,{});
      if(!announcing||characterProcess!==announcing||life.signal.aborted)return send(409,{});
      if(port!==candidate){port=candidate;hooks.emit('online',{online:true});}
      return send(200,{});
    }
    if(req.method==='GET'&&req.url==='/dependency-assist-status'){
      try{
        const flags={ai:preferences().ai,busy};
        const llm=flags.ai===false||busy?null:ctx.get('llm');
        return send(200,dependencyAssistanceAvailability(llm,config,flags));
      }catch{return send(200,{enabled:false,reason:'DSH 模型服务尚未就绪'});}
    }
    if(req.method==='POST'&&req.url==='/dependency-assist'){
      if(preferences().ai===false)return send(409,{error:'AI 调用已关闭，可使用无需 AI 的一键安装'});
      if(busy)return send(409,{error:'模型正在处理其他请求，请稍后再试或使用一键安装'});
      busy=true;let releaseDisconnect=()=>{};
      try{
        let body='';req.setEncoding('utf8');for await(const chunk of req){body+=chunk;if(body.length>16000)throw Error('依赖诊断数据过长');}
        const llm=ctx.get('llm');if(!llm)throw Error('DSH 模型服务尚未就绪，可使用无需 AI 的一键安装');
        pendingDependencyAI=new AbortController();pendingAI=pendingDependencyAI;
        const controller=pendingDependencyAI,onClose=()=>{if(!res.writableEnded)controller.abort();};
        res.once('close',onClose);releaseDisconnect=()=>res.removeListener('close',onClose);
        const signal=AbortSignal.any([pendingAI.signal,life.signal,AbortSignal.timeout(45000)]);
        const result=await diagnoseDependencies(llm,config,JSON.parse(body).issues,signal);
        return send(200,result);
      }catch(error){return send(400,{error:String(error.message).slice(0,400)});}
      finally{releaseDisconnect();busy=false;pendingAI=null;pendingDependencyAI=null;}
    }
    if(req.method==='POST'&&req.url==='/transcribe-reference'){
      return send(400,{error:'当前 DSH 模型接口仅支持文字和图片输入，无法识别录音'});
    }
    if(req.method==='POST'&&req.url==='/balance'){try{return send(200,await balance(ctx));}catch(err){return send(400,{error:err.message});}}
    if (req.method !== 'POST' || req.url !== '/decide') return send(404,{});
    if(preferences().ai===false)return send(409,{error:'AI 调用已关闭'});
    if (busy) return send(409,{error:'角色正在思考',code:'SESSION_BUSY',submitted:false});
    busy = true;
    try {
      let body = ''; req.setEncoding('utf8');
      for await (const chunk of req) { body += chunk; if (body.length > 1900000) throw Error('输入太长'); }
      const payload=JSON.parse(body),following=payload.inference?.followSessionModel===true&&['chat','touch','observe','model_change'].includes(payload.event?.type);const llm=following?null:ctx.get('llm');if(!following&&!llm)throw Error('DSH 模型服务尚未就绪，请检查模型服务后重试');
      pendingAI=new AbortController();const signal=AbortSignal.any([pendingAI.signal,life.signal,AbortSignal.timeout(payload.event?.type==='adapt'?240000:80000)]);
      const extra=await hooks.context(payload.event,signal,payload.context?.profile,payload.context?.characterId);if(extra.length)payload.pluginContext=extra;
      const screenConsent=payload.event?.type==='observe'&&payload.visuals?()=>currentScreenConsent(payload):undefined;
      if(screenConsent&&!screenConsent())delete payload.visuals;
      let attachmentService;if(payload.visuals){try{attachmentService=ctx.get('attachments');}catch(error){if(!['model_change','observe'].includes(payload.event?.type))throw error;}}
      const result=await decide(llm,config,payload,signal,sessions,attachmentService,screenConsent);hooks.reply(payload.event,result,payload.context);send(200,result);
    } catch (error) { send(400,{error:String(error.message).slice(0,300),code:error.code,submitted:error.submitted===true,diagnostics:error.diagnostics}); }
    finally { busy = false; pendingAI=null; }
  });
  ctx.effect(()=>()=>{port=0;life.abort();resolveBridge(false);server.close();server.closeAllConnections();void launcher?.dispose();characterProcess?.kill();},'live-character: runtime');
  server.on('error',error=>{startError='角色连接服务不可用 · '+error.message;resolveBridge(false);console.error('[live-character]',error.message);});
  server.listen(0,'127.0.0.1',()=>{
    if (life.signal.aborted) return server.close();
    const env = {...process.env,PET_HOST:String(process.pid),PET_BRIDGE:'http://127.0.0.1:'+server.address().port+'/decide',PET_SECRET:token};
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = (exe,args,cwd=root,extraEnv={}) => {
      const child = spawn(exe,args,{cwd,env:{...env,...extraEnv},windowsHide:true,stdio:'ignore'});
      child.on('error',error=>{startError='角色启动失败 · '+error.message;console.error('[live-character]',error.message);});
      return child;
    };
    const statusFile=path.join(env.LOCALAPPDATA,'LiveCharacter','install-status.json');
    const readStatus=()=>{try{return JSON.parse(fs.readFileSync(statusFile,'utf8'));}catch{return {};}};
    const writeStatus=patch=>{
      if(patch.phase==='checking')currentRunId=patch.runId;
      try{
        fs.mkdirSync(path.dirname(statusFile),{recursive:true});
        const previous=readStatus();
        const status={...(previous.runId===patch.runId?previous:{}),...patch,version:pluginVersion,at:new Date().toISOString()};
        fs.writeFileSync(statusFile+'.node.tmp',JSON.stringify(status));fs.renameSync(statusFile+'.node.tmp',statusFile);
      }catch{}
    };
    const prepare=runId=>{
      startError='';
      return new Promise((resolve,reject)=>{
        const installer=launch('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'runtime.ps1')],root,{PET_PREPARE_ID:runId});
        installerProcess=installer;installer.runId=runId;
        installer.once('error',reject);
        installer.once('exit',code=>{
          if(installerProcess===installer)installerProcess=null;
          if(code===0){
            const status=readStatus();
            if(status.version===pluginVersion&&status.runId===runId&&status.phase==='ready'&&typeof status.installed==='boolean')resolve(status);
            else reject(Error('运行环境未返回有效完成状态，请重新检测依赖。'));
          }else{
            reject(preparationExitError(code,readStatus(),pluginVersion,runId));
          }
        });
      });
    };
    const cancelPreparation=async runId=>{
      const installer=installerProcess;if(!installer||installer.runId!==runId||installer.exitCode!==null)return;
      pendingDependencyAI?.abort();
      await new Promise(resolve=>{
        const killer=spawn('taskkill.exe',['/PID',String(installer.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        killer.once('error',()=>{installer.kill();resolve();});
        killer.once('exit',()=>{if(installer.exitCode===null)installer.kill();resolve();});
      });
    };
    const launchElectron=()=>{
      if(life.signal.aborted)return;
      const release=path.join(env.LOCALAPPDATA,'LiveCharacter','app-'+pluginVersion);
      const child=launch(path.join(env.LOCALAPPDATA,'LiveCharacter','electron-45.2.3','Live Character.exe'),[path.join(release,'desktop')],release);
      characterProcess=child;
      const stopped=()=>{
        if(characterProcess!==child)return;
        characterProcess=null;
        port=0;hooks.emit('online',{online:false});
      };
      child.once('error',stopped);
      child.once('exit',code=>{
        if(!port&&code!==0)startError='角色启动失败 · 桌面进程退出（'+code+'）';
        stopped();
      });
    };
    launcher=createRuntimeLauncher({prepare,launchCharacter:launchElectron,cancelPreparation,
      isRunning:()=>!!port||!!(characterProcess&&characterProcess.exitCode===null&&!characterProcess.killed),writeStatus});
    resolveBridge(true);
    // Explicit opt-in is the only path that may prepare/launch without a button click.
    if(preferences().autoStart===true)launcher.launch();
  });
}
