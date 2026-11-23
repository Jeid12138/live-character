// Keep offline saving separate from optional cloud authentication.
const {createHash}=require('node:crypto'),secrets=require('./voice-secrets.cjs');
const {capabilities}=require('../lab/voice-catalog.js');
function failure(code,message,stage='save',cause){const e=Error(message);e.voice={stage,errorCode:code,errorType:cause?.name||'Error',causeCode:cause?.code};return e}
const strings={voiceApiUrl:2000,voiceApiModel:150,breezeEndpoint:2000,breezeInstruction:2000,tts:2000,voice:200,referenceText:2000};
function fields(input){
 if(!input||typeof input!=='object')throw failure('invalid_voice_settings','缺少语音设置','validate');
 const prefs={};
 if(input.referenceName!==undefined){
  const name=input.referenceName;
  if(typeof name!=='string'||name.length>255||name!==''&&(!/\.(wav|mp3|flac|ogg|m4a)$/i.test(name)||/[<>:"/\\|?*\x00-\x1f]/.test(name)))
   throw failure('invalid_voice_settings','参考录音文件名无效，请重新选择','validate');
  prefs.referenceName=name;
 }
 for(const [field,max] of Object.entries(strings)){if(typeof input[field]!=='string'||input[field].length>max)throw Object.assign(failure('invalid_voice_settings','语音设置字段格式或长度不正确：'+field,'validate'),{voice:{stage:'validate',errorCode:'invalid_voice_settings',errorType:'Error',field}});prefs[field]=input[field]}
 prefs.voiceMode=input.voiceMode;prefs.voiceProvider=input.voiceProvider;prefs.voiceNetwork=input.voiceNetwork;
 prefs.voiceStreaming=capabilities(prefs.voiceMode,prefs.voiceApiModel,prefs.voiceProvider).streaming&&input.voiceStreaming===true;
 prefs.voiceCudaGraph=false;
 prefs.idleVramOptimization=input.idleVramOptimization===true;
 if(!['api','local','breeze'].includes(prefs.voiceMode)||!['breeze','fish','qwen','openai','index','auk'].includes(prefs.voiceProvider)||!['direct','system'].includes(prefs.voiceNetwork))throw failure('invalid_voice_settings','语音来源、服务商或网络设置无效','validate');
 if(typeof input.autoVoice!=='boolean'||!Number.isFinite(input.lipGain)||input.lipGain<0||input.lipGain>1.5||!Number.isFinite(input.lipOffset)||Math.abs(input.lipOffset)>2)throw failure('invalid_voice_settings','朗读或口型设置无效','validate');
 prefs.voiceGuidance=Number.isFinite(input.voiceGuidance)?input.voiceGuidance:2.5;if(prefs.voiceGuidance<1||prefs.voiceGuidance>10)throw failure('invalid_voice_settings','演绎指令强度须为 1–10','validate');
 Object.assign(prefs,{autoVoice:input.autoVoice,lipGain:input.lipGain,lipOffset:input.lipOffset,voiceProfiles:{}});
 if(['normal','clone'].includes(input.voiceStyle))prefs.voiceStyle=input.voiceStyle;
 if(typeof input.managedVoiceModel==='string'&&input.managedVoiceModel.length<=200)prefs.managedVoiceModel=input.managedVoiceModel;
 if(input.localVoiceProfile){
  const {voice,instruction}=input.localVoiceProfile;
  if(typeof voice!=='string'||voice.length>200||typeof instruction!=='string'||instruction.length>2000)throw failure('invalid_voice_settings','本地音色配置无效','validate');
  prefs.localVoiceProfile={voice,instruction};
 }
 for(const [provider,p] of Object.entries(input.voiceProfiles||{})){
  if(!['breeze','fish','qwen','openai','index','auk'].includes(provider)||!p||typeof p!=='object')throw failure('invalid_voice_settings','服务商预设格式不正确','validate');
  const entry={guidance:Number.isFinite(p.guidance)?Math.max(1,Math.min(10,p.guidance)):2.5,network:p.network==='system'?'system':'direct'};for(const key of ['endpoint','model','voice','instruction']){if(typeof p[key]!=='string'||p[key].length>2000)throw failure('invalid_voice_settings','服务商预设字段无效','validate');entry[key]=p[key]}prefs.voiceProfiles[provider]=entry;
 }
 if(prefs.voiceMode==='api'){
  if(['index','auk'].includes(prefs.voiceProvider))throw failure('provider_unavailable','此模型暂无已接入的云语音协议','validate');
  try{secrets.scope(prefs.voiceProvider,prefs.voiceApiUrl)}catch{throw failure('invalid_voice_settings','语音接口地址无效','validate')}
  if(prefs.voiceProvider==='breeze'){
   const u=new URL(prefs.voiceApiUrl);if(u.origin!=='https://api.breeze.blue'||!['','/v1'].includes(u.pathname.replace(/\/$/,'')))throw failure('invalid_voice_settings','Breeze 请使用 https://api.breeze.blue','validate');
   if(!['breeze-tts-2','breeze-tts-2-multilingual'].includes(prefs.voiceApiModel))throw failure('invalid_voice_settings','Breeze 模型无效','validate');prefs.voiceApiUrl='https://api.breeze.blue';
  }
 }
 return prefs;
}
// Save is entirely offline. Check authenticates a draft and never commits it.
module.exports=function voiceSettings({vault,diagnostics,verify,owner,commit,isEnabled}){
 let busy=false;
 async function execute(value,checking){
  if(busy)throw failure('busy','语音设置或测试进行中，请等待完成');
  busy=true;let phase='validate',candidateKey,initialFingerprint,keyInfo={keySource:value?.key?'candidate':'stored',inputKeyEmpty:!value?.key};
  try{
   diagnostics.begin({...value?.settings,provider:value?.settings?.voiceProvider,endpoint:value?.settings?.voiceApiUrl,model:value?.settings?.voiceApiModel,network:value?.settings?.voiceNetwork,operation:checking?'check':'save'});diagnostics.update({stage:'validate'});
   const prefs=fields(value?.settings),provider=prefs.voiceProvider,endpoint=prefs.voiceApiUrl,identity=owner();
   if(!identity)throw failure('owner_changed','请先导入并启动角色');
   if(checking&&(prefs.voiceMode!=='api'||provider!=='breeze'))throw failure('provider_unavailable','此服务暂无已接入的只读认证测试；可保存后试播','validate');
   if(value?.scope){let matches=false;try{matches=secrets.scope(value.scope.provider,value.scope.endpoint)===secrets.scope(provider,endpoint)}catch{}if(!matches)throw failure('credential_scope_changed','接口已变化，请重新输入密钥','validate');}
   let info={};if(prefs.voiceMode==='api'){
    if(value.key)keyInfo={...secrets.describe(value.key,'candidate'),inputKeyEmpty:false};diagnostics.update({stage:'key',...keyInfo});
    info=vault.status(provider,endpoint);initialFingerprint=info.fingerprint;
    if(!info.encrypted)throw failure('encryption_unavailable','系统加密存储不可用','key');
    candidateKey=value.key?secrets.normalize(provider,value.key):vault.get(provider,endpoint);
    keyInfo={...(value.key?secrets.describe(value.key,'candidate'):info.keyInfo||secrets.describe(candidateKey,'stored')),inputKeyEmpty:!value.key};
    diagnostics.update({stage:'key',...keyInfo,credentialScope:info.scopeFingerprint,keyFingerprint:'sha256:'+createHash('sha256').update(candidateKey).digest('hex').slice(0,12),keySavedAt:value.key?null:info.savedAt});
   }
   if(checking){
    if(!isEnabled())throw failure('ai_disabled','AI 调用已关闭，尚未发起测试','key');
    phase='request';diagnostics.update({stage:'request'});
    const result=await verify({operation:'check',provider,endpoint,network:prefs.voiceNetwork,key:candidateKey});
    if(!result.validated)throw failure('verification_failed','服务未确认此密钥有效','http');
    if(!isEnabled())throw failure('ai_disabled','AI 调用已关闭，忽略晚到的认证结果');
    if(owner()!==identity)throw failure('owner_changed','角色已切换，忽略晚到的认证结果');
    if(vault.status(provider,endpoint).fingerprint!==initialFingerprint)throw failure('credential_changed','测试期间密钥已变化，请重新测试');
    // Only update authentication metadata for the exact already-saved credential.
    const fingerprint='sha256:'+createHash('sha256').update(candidateKey).digest('hex').slice(0,12);
    const stored=fingerprint===initialFingerprint;
    if(stored)vault.verified(provider,endpoint,fingerprint,true);
    diagnostics.succeed({stage:'validated',httpStatus:result.httpStatus||200,errorCode:null});
    return {validated:true,stored,credential:stored?vault.status(provider,endpoint):null};
   }
   if(prefs.voiceMode==='api'&&vault.status(provider,endpoint).fingerprint!==initialFingerprint)throw failure('credential_changed','保存期间密钥已变化，未提交设置');
   if(owner()!==identity)throw failure('owner_changed','角色已切换，未提交密钥或设置');
   phase='save';diagnostics.update({stage:'save'});
   let prepared;try{if(prefs.voiceMode==='api')prepared=vault.prepare(provider,endpoint,value.key?candidateKey:null)}catch(error){throw error.voice?error:failure(error.code?'credential_store_read_failed':'encryption_failed','无法准备加密密钥，旧密钥未修改','save',error)}
   const meta=prepared?.value.metadata[secrets.scope(provider,endpoint)],credential=prepared?{saved:true,encrypted:true,fingerprint:'sha256:'+createHash('sha256').update(candidateKey).digest('hex').slice(0,12),hint:'Key…'+candidateKey.slice(-4).replace(/[^A-Za-z0-9_-]/g,''),savedAt:meta.savedAt||null,verifiedAt:meta.verifiedAt||null,authState:meta.authState}:null;
   try{prepared?.assertCurrent();commit(prefs,prepared)}catch(error){throw error.voice?error:failure('settings_write_failed','无法写入语音设置或密钥；已尝试回滚原配置','save',error)}
   diagnostics.succeed({stage:'saved',errorCode:null,keySavedAt:credential?.savedAt||null});
   return {settings:prefs,credential,validated:credential?.authState==='accepted'};
  }catch(error){
   const d=error.voice||{};keyInfo={...keyInfo,...Object.fromEntries(Object.keys(secrets.describe('')).filter(k=>d[k]!==undefined).map(k=>[k,d[k]]))};
   if(checking&&d.httpStatus===401&&initialFingerprint&&candidateKey&&'sha256:'+createHash('sha256').update(candidateKey).digest('hex').slice(0,12)===initialFingerprint){try{vault.verified(value.settings.voiceProvider,value.settings.voiceApiUrl,initialFingerprint,false)}catch{}}
   diagnostics.fail({...keyInfo,stage:d.stage||phase,errorCode:d.errorCode||(checking?'verification_failed':'save_failed'),errorType:d.errorType||error.name,causeCode:d.causeCode||error.code,field:d.field,httpStatus:d.httpStatus,upstreamCode:d.errorCode,proxyUsed:d.proxyUsed});
   if(!error.voice)throw failure(checking?'verification_failed':'save_failed',checking?'连接测试未完成，请查看具体错误记录':'语音保存失败，请查看具体错误记录',phase,error);throw error;
  }finally{candidateKey=null;if(value)delete value.key;busy=false}
 }
 const save=value=>execute(value,false);return Object.assign(save,{check:value=>execute(value,true),isBusy:()=>busy});
};
module.exports.fields=fields;
module.exports.failure=failure;
