import {characterPresets} from './character-presets.js';
import {checkedResponse} from './performance-contract.js';
import {randomUUID} from 'node:crypto';
import {sessionWorkspace} from './session-workspace.js';
import {eventEnvelope,readEnvelope,eventLabel,configuration,runtimeContext,byteSize} from './session-event.js';

export function sessionRow(record){
 const e=record?.event;if(!e||!['user/message','assistant/message'].includes(e.type)||e.surfaceOp&&e.surfaceOp!=='append')return null;
 const assistant=e.type==='assistant/message',msg=assistant?e.data?.message:e.data;let text=(msg?.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();if(!text)return null;
 const envelope=!assistant&&msg.content.filter(b=>b.type==='text').map(b=>readEnvelope(b.text)).find(Boolean);
 let extra={};if(assistant)try{const plan=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''));if(plan&&typeof plan==='object'&&!Array.isArray(plan)&&typeof plan.text==='string'){text=plan.text;extra={emotion:plan.emotion,speech:plan.speech,plan};}}catch{}
 else{const input=envelope||readEnvelope(text);if(input){text=eventLabel(input.event);extra={kind:input.userTyped?'chat':'character_event',eventId:input.event.id,eventType:input.event.type,userTyped:input.userTyped,profile:input.character?.profile};}}
 const time=Date.parse(e.time);return text||extra.plan?{role:assistant?'assistant':'user',text,seq:e.seq,at:new Date(Number.isFinite(time)?time:Date.now()).toISOString(),...extra}:null;
}
const row=sessionRow;
export function sessionBridge(ctx,config,options={}){
 const presets=options.presets||characterPresets(ctx,config);ctx.effect?.(()=>()=>presets.dispose());
 const active=new Map(),ready=new Set(),titles=new Map(),grouping=new Map(),results=new Map(),uncertain=new Set(),finalErrors=new Map(),cancelTasks=new Map(),cancelledEvents=new Set();
 const workspace=sessionWorkspace(ctx);
 const service=()=>ctx.get('sessionController');
 const address=sessionId=>({kind:'session',sessionId});
 const valid=id=>/^session-[a-f0-9-]{36}$/.test(id);
 async function state(id,signal=AbortSignal.timeout(12000)){if(!valid(id))throw Error('会话编号无效');const value=await service().state({sessionId:id},signal);const input=value.pendingInput;return {running:value.running===true,pending:!!value.queue?.length||(Array.isArray(input)?input.length>0:!!input),...(Number.isSafeInteger(value.cursor)?{cursor:value.cursor}:{})};}
 async function cancel(id,eventId){
  if(!id)return {running:false,pending:false};if(!valid(id))throw Error('会话编号无效');
  if(eventId){if(!/^[a-f0-9-]{36}$/i.test(eventId))throw Error('取消事件编号无效');cancelledEvents.add(id+':'+eventId);while(cancelledEvents.size>256)cancelledEvents.delete(cancelledEvents.values().next().value);}
  if(cancelTasks.has(id))return cancelTasks.get(id);const sc=service();if(typeof sc?.cancel!=='function')throw Object.assign(Error('DSH 会话取消服务不可用，未声称已停止'),{code:'LC_CANCEL_UNAVAILABLE'});
  const task=(async()=>{const signal=AbortSignal.timeout(12000);await sc.cancel({sessionId:id},signal);const result=await state(id,signal);if(eventId&&!result.running&&!result.pending)uncertain.delete(id+':'+eventId);return result;})();cancelTasks.set(id,task);try{return await task;}finally{cancelTasks.delete(id);}
 }
 async function history(id,limit,signal){
  if(!valid(id))throw Error('会话编号无效');
  let rows=[],beforeSeq,hasMore=false;
  do{const page=await service().events({address:address(id),beforeSeq,maxMessages:Math.min(100,limit-rows.length)},signal);
   const first=page.records[0]?.event?.seq;rows=page.records.map(row).filter(Boolean).map(r=>({...r,sessionId:id})).concat(rows);hasMore=page.hasMore;
   if(first==null||first===beforeSeq)break;beforeSeq=first;
  }while(hasMore&&rows.length<limit);
  return {rows:rows.slice(-limit),more:hasMore};
 }
 async function chat(payload,signal,selection,attachments=[],screenConsent){
  let step='route',heldId,runtimeToken;
  try{
  const r=payload.route,id=r?.id;if(!valid(id))throw Error('角色会话无效');
  step='controller';const sc=service();if(!sc?.wait||!sc?.events||!sc?.state||!sc?.prompt)throw Error('DSH 会话服务不可用');
  if(active.has(id))throw Object.assign(Error('会话正在回复'),{code:'SESSION_BUSY',submitted:false});
  active.set(id,null);heldId=id;
  const eventId=payload.event?.id||randomUUID();payload={...payload,event:{...payload.event,id:eventId,at:payload.event?.at||new Date().toISOString()}};const key=id+':'+eventId;
  if(finalErrors.has(key))throw Object.assign(Error(finalErrors.get(key).message),finalErrors.get(key));
  if(results.has(key))return {...results.get(key),duplicate:true};if(cancelledEvents.has(key))throw Object.assign(Error('本次事件已取消，不会重新提交'),{code:'LC_CANCELLED',submitted:true});if(uncertain.has(key))throw Object.assign(Error('该事件的提交结果尚不确定，请先查看 DSH 历史，未自动重新生成'),{code:'SESSION_SUBMISSION_UNKNOWN',submitted:true});

  step='character-preset';const cfg=await presets.publish(payload);
  if(!ready.has(id)){
   {step='events';let exists=true;try{await sc.events({address:address(id),maxMessages:1},signal);}catch(e){if(e.code!=='session/not-found'&&!/not.found|不存在|unknown session|找不到/i.test(String(e.code)+' '+e.message))throw e;exists=false;}
    if(!exists){step='workspace';const location=await workspace.ensure();if(signal?.aborted)throw signal.reason||Error('请求已取消');
     step='create';const created=await sc.create({sessionId:id,agentPreset:cfg.presetId,...location});if(created.sessionId!==id)throw Error('DSH 未复用指定会话');presets.bindSession(id,cfg.presetId);
     grouping.set(id,location.workspaceId?{status:'grouped',workspaceId:location.workspaceId}:{status:'unavailable',message:workspace.snapshot().message});
    }else{presets.assertSession(id,cfg.presetId);grouping.set(id,{status:'existing',message:'保留原有会话及归属，未迁移历史记录'});}
    step='rename';await sc.rename({sessionId:id,title:r.title});titles.set(id,r.title);
   }
   ready.add(id);
  }
  presets.assertSession(id,cfg.presetId);
  if(titles.get(id)!==r.title){step='rename';await sc.rename({sessionId:id,title:r.title});titles.set(id,r.title);}
  step='state';let before;try{before=await sc.state({sessionId:id},signal);}catch(e){if(e.code==='session/not-found')ready.delete(id);throw e;}if(before.running||before.queue?.length)throw Object.assign(Error('DSH 会话正在回复，自动事件等待空闲后提交'),{code:'SESSION_BUSY',submitted:false});
  step='selectModel';if(selection)await sc.selectModel({sessionId:id,...selection});
  if(payload.screenAttached&&screenConsent&&!screenConsent()){attachments=[];payload={...payload,screenAttached:false,appearanceEvidence:'metadata'};}
  let eventText=eventEnvelope(payload,cfg.revision);const runtime=runtimeContext(payload);
  let content=[...attachments,{type:'text',text:eventText}];
  if(cancelledEvents.has(key))throw Object.assign(Error('本次事件已取消，未提交生成'),{code:'LC_CANCELLED',submitted:false});
  if(signal?.aborted)throw signal.reason||Error('请求已取消');
  runtimeToken=presets.beginRuntime(payload);
  active.set(id,sc);
  try{
   // After submission, a transport error must never duplicate the turn via direct inference.
   step='prompt';uncertain.add(key);let deliveredEvidence=payload.appearanceEvidence,appearanceNote;
   try{await sc.prompt({sessionId:id,mode:'queue',requestId:eventId,content},signal);}catch(error){
    const knownPreAdmission=error.code==='session/attachment-invalid'&&(error.details?.reason==='MODEL_DOES_NOT_SUPPORT_IMAGES'||error.data?.reason==='MODEL_DOES_NOT_SUPPORT_IMAGES'||error.message==='Model does not support image input');
    if(!attachments.length||!knownPreAdmission)throw error;
    payload={...payload,screenAttached:false,appearanceEvidence:'metadata'};eventText=eventEnvelope(payload,cfg.revision);content=content.filter(c=>c.type!=='image').map(c=>c.type==='text'&&readEnvelope(c.text)?{type:'text',text:eventText}:c);deliveredEvidence='metadata';appearanceNote='当前会话模型不支持图片，本轮使用已有资料回应，没有新增视觉认知';
    await sc.prompt({sessionId:id,mode:'queue',requestId:eventId,content},signal);
   }
   if(cancelledEvents.has(key)){const stopped=await cancel(id);throw Object.assign(Error(stopped.running||stopped.pending?'DSH 仍在结束中':'本次事件已取消'),{code:stopped.running||stopped.pending?'LC_CANCEL_PENDING':'LC_CANCELLED'});}
   step='wait';const done=await sc.wait({sessionId:id,afterSeq:before.cursor,timeoutMs:70000,maxMessages:4},signal);
   const responses=done.output?.records?.filter(x=>x.event?.type==='assistant/message')||[];if(responses.length>1)throw Object.assign(Error('同一等待区间收到多轮回复，未自动选取或演出，请查看 DSH 历史'),{code:'SESSION_RESULT_AMBIGUOUS'});const rec=responses[0];
   if(done.reason!=='idle'||!rec)throw Error('会话尚未返回完整回复，可在对话记录中查看');
   const raw=rec.event.data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('');
   let plan;try{plan=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw Object.assign(Error('会话未返回有效演出 JSON，已保留原生回复，未再次生成'),{code:'LC_RESPONSE_INVALID'});}
   const checked=checkedResponse(plan,payload.event);plan=checked.plan;
   const result={transport:{schema:'lc.event.v3',userContentKinds:content.map(c=>c.type==='image'?'image':readEnvelope(c.text)?.schema||'text'),configurationPlacement:'agent-preset.context',eventBytes:byteSize(eventText),configurationBytes:0,injectedConfigurationBytes:byteSize(cfg.text),runtimeBytes:0,injectedRuntimeBytes:runtime?byteSize(runtime):0,attachmentCount:content.filter(c=>c.type==='image').length},appearanceSource:deliveredEvidence,appearanceNote,configurationRevision:cfg.revision,configurationSent:false,configurationInjected:true,plan,captionWarning:checked.captionWarning,model:selection?.model,effort:selection?.reasoningEffort,sessionId:id,eventId,sessionSeq:rec.event.seq,sessionAt:rec.event.time,workspaceGrouping:grouping.get(id)};uncertain.delete(key);results.set(key,result);while(results.size>256)results.delete(results.keys().next().value);return result;
  }catch(e){e.submitted=true;if(['LC_RESPONSE_INVALID','LC_EMPTY_AUTONOMY','LC_CANCELLED','LC_CANCEL_PENDING'].includes(e.code)){uncertain.delete(key);finalErrors.set(key,{code:e.code,message:e.message,submitted:true});while(finalErrors.size>256)finalErrors.delete(finalErrors.keys().next().value);}throw e;}
  }catch(e){e.lcStage=step;throw e;}finally{if(runtimeToken)presets.endRuntime(runtimeToken);if(heldId)active.delete(heldId);}
 }
 return {chat,history,state,cancel,publishConfiguration:payload=>presets.publish(payload),restorePresets:()=>presets.restore(),removePreset:id=>presets.remove(id),workspaceStatus:workspace.snapshot,async watch(id,signal,onRow){
  if(!valid(id))return;
  for await(const event of service().observeEvent({address:address(id)},signal)){
   const m=row(event);if(m&&!active.has(id))await onRow({...m,sessionId:id});
  }
 }};
}
