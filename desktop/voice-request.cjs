module.exports=function voiceRequest({vault,diagnostics,fetchSynthesis,isEnabled,isMuted=()=>false}){
 let active=null;
 async function synthesize(value){
  if(active)throw Error('语音正在生成，请稍后再试；未重复提交');
  const abort=new AbortController();
  const {clientRequestId,...settings}=value||{};
  active={clientRequestId,abort};let request;let stage='key';let fingerprint;
  try{const info=vault.status(value?.provider,value?.endpoint);fingerprint=info.fingerprint;request=diagnostics.begin({...value,credentialScope:info.scopeFingerprint,keySource:'stored',keyFingerprint:fingerprint,keySavedAt:info.savedAt});}catch{request=diagnostics.begin(value||{});}
  try{
   if(!isEnabled()){const e=Error('AI 调用已关闭');e.voice={errorCode:'ai_disabled',stage:'key'};throw e;}
   if(isMuted()){const e=Error('已静音，语音调用已暂停');e.voice={errorCode:'voice_muted',stage:'key'};throw e;}
   const body={...settings,mode:'api',key:vault.get(value?.provider,value?.endpoint)};
   stage='request';diagnostics.update({stage,keySource:'stored',...require('./voice-key.cjs').describe(body.key,'stored')});
   const result=await fetchSynthesis(body,abort.signal);
   if(abort.signal.aborted)throw abort.signal.reason;
   if(isMuted()||!isEnabled()){const e=Error('语音已关闭，忽略晚到音频');e.voice={errorCode:isMuted()?'voice_muted':'ai_disabled',stage:'cancelled'};throw e;}
   if(value?.operation==='check'&&result.validated){const accepted=vault.verified(value.provider,value.endpoint,fingerprint,true);diagnostics.update({stage:'validated',httpStatus:200});return {...result,validated:accepted,stale:!accepted,requestId:request.requestId};}
   if(!result.audio){const e=Error(result.error||'语音合成失败');e.voice=result.voice||{stage:'audio',errorCode:'invalid_audio'};throw e;}
   try{vault.verified(value.provider,value.endpoint,fingerprint,true)}catch{} // Metadata must not discard successfully generated audio.
   diagnostics.update({stage:'audio'});return {...result,requestId:request.requestId};
  }catch(error){
   if(abort.signal.aborted){diagnostics.update({stage:'cancelled'});return {cancelled:true,requestId:request.requestId};}
   const detail=error.voice||{};if(value?.operation==='check'&&detail.httpStatus===401)vault.verified(value.provider,value.endpoint,fingerprint,false);const timeout=error.name==='TimeoutError';
   diagnostics.fail({stage:detail.stage||stage,httpStatus:detail.httpStatus,errorCode:detail.errorCode|| (stage==='key'?'key_error':timeout?'read_timeout':'bridge_error'),upstreamCode:detail.errorCode,errorType:detail.errorType||error.name,proxyUsed:detail.proxyUsed});
   if(timeout)throw Error('本机语音请求超时；未自动重试，避免重复计费');throw error;
  }finally{active=null;}
 }
 return Object.assign(synthesize,{isBusy:()=>!!active,cancel(id){
  if(typeof id!=='string'||id!==active?.clientRequestId)return false;
  active.abort.abort();return true;
 }});
};
