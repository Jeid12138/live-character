// A bounded allowlist, not an exception/body logger. Never accept arbitrary messages.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const version=require('./package.json').version;
const stages=new Set(['idle','validate','saved','save','key','request','connect','read','http','audio','play','playing','validated','cancelled']);
const messages={voice_muted:'已静音，语音合成调用已暂停',invalid_check_response:'只读连接测试返回结构无法识别；不代表 TTS 合成失败，可直接试播',key_masked:'实际读取的输入包含遮蔽字符，尚未发起认证；请在本机检查完整密钥',verification_required:'旧版要求预先认证；当前版本可保存后直接试播',key_missing:'未输入密钥，且没有可读取的已存密钥',key_format_error:'API Key 为空、过长或包含不可安全发送的请求头字符；未按前缀判断有效性',credential_scope_changed:'输入密钥后接口已变化，请重新输入密钥',encryption_unavailable:'系统加密存储不可用，未保存密钥',encryption_failed:'无法加密候选密钥，旧密钥未修改',decrypt_failed:'无法解密已有密钥，请重新输入密钥',credential_store_corrupt:'密钥文件格式损坏，原文件未覆盖',credential_store_read_failed:'无法读取密钥文件',credential_changed:'验证期间密钥库已变化，未提交新设置',settings_read_failed:'无法读取角色语音设置',settings_write_failed:'无法写入语音设置或密钥，已尝试回滚原配置',owner_changed:'角色已切换，未提交密钥或设置',invalid_voice_settings:'语音设置字段或接口地址不正确',provider_unavailable:'此模型暂无已接入的云语音协议',verification_failed:'服务未确认密钥认证成功；连接测试不修改已保存设置',save_failed:'语音设置未保存，未发起试播',key_error:'无法读取或解密语音密钥',proxy_tls_eof:'代理路径的 TLS 连接提前断开；可切换直连检查',tls_eof:'直连 TLS 连接提前断开',ssl_certificate_error:'TLS 证书验证失败；请检查系统时间、证书或代理证书',tls_error:'TLS 握手失败',dns_error:'域名解析失败',connect_timeout:'连接语音服务超时',read_timeout:'读取音频超时',connect_refused:'连接被拒绝；请检查服务或代理是否启动',connection_reset:'连接被远端或代理中断',network_error:'语音网络请求失败',invalid_audio:'未获得有效音频或音频已损坏',invalid_request:'语音请求设置无效',invalid_network:'语音网络设置无效',bridge_error:'无法完成本机语音请求',play_failed:'音频无法播放；请检查音频格式和系统播放设备',play_blocked:'音频播放被阻止；请手动试播并检查播放权限',ai_disabled:'AI 调用已关闭',busy:'语音正在生成；未重复提交'};
const upstreamCodes=new Set(['AUTH_REQUIRED','AUTH_INVALID_SESSION','AUTH_SESSION_EXPIRED','AUTH_USER_UNAVAILABLE','FORBIDDEN','RESOURCE_NOT_FOUND','VALIDATION_ERROR','BAD_REQUEST','BILLING_INSUFFICIENT_CREDITS','API_KEY_CREDIT_LIMIT_EXCEEDED','GENERATION_CAPACITY_EXCEEDED','GENERATION_CONCURRENCY_EXCEEDED','RATE_LIMITED','GENERATION_FAILED','INTERNAL_ERROR','InvalidApiKey','InvalidParameter']);
const providers=new Set(['breeze','fish','qwen','openai','index','auk','local']);
function read(data){
 try{const saved=JSON.parse(fs.readFileSync(path.join(data,'logs','voice-last-status.json'),'utf8'));return sanitizeSnapshot(saved)}catch{return {version,status:null,lastError:null,events:[]}}
}
function clean(value={}){
 const out={at:typeof value.at==='string'&&/^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(value.at)?value.at:new Date().toISOString()};
 out.requestId=typeof value.requestId==='string'&&/^[a-f0-9-]{36}$/.test(value.requestId)?value.requestId:null;
 out.stage=stages.has(value.stage)?value.stage:'idle';out.provider=providers.has(value.provider)?value.provider:'local';
 out.operation=['save_verify','save','check','synthesize'].includes(value.operation)?value.operation:'synthesize';
 out.field=['voiceMode','voiceProvider','voiceNetwork','voiceApiUrl','voiceApiModel','breezeEndpoint','breezeInstruction','tts','voice','referenceText','autoVoice','voiceGuidance','lipGain','lipOffset','voiceProfiles'].includes(value.field)?value.field:null;
 out.causeCode=['EACCES','EPERM','ENOSPC','EROFS','EIO','ENOENT','ENOTDIR','EBUSY','ENAMETOOLONG'].includes(value.causeCode)?value.causeCode:null;
 out.keySource=['candidate','stored'].includes(value.keySource)?value.keySource:null;out.keyPrefix=['brz_','key_','voc_','other','empty'].includes(value.keyPrefix)?value.keyPrefix:null;
 for(const name of ['keyLength','rawKeyLength'])out[name]=Number.isInteger(value[name])&&value[name]>=0&&value[name]<=4097?value[name]:null;
 for(const name of ['inputKeyEmpty','hasWhitespace','hasInvisible','hasControl','hasMaskingChar','hasNonAscii','hasDot','hasPlus','hasSlash','hasEquals','normalizationChanged'])out[name]=typeof value[name]==='boolean'?value[name]:null;
 out.credentialScope=typeof value.credentialScope==='string'&&/^[0-9a-f]{12}$/.test(value.credentialScope)?value.credentialScope:null;
 out.keyFingerprint=typeof value.keyFingerprint==='string'&&/^sha256:[0-9a-f]{12}$/.test(value.keyFingerprint)?value.keyFingerprint:null;
 out.keySavedAt=typeof value.keySavedAt==='string'&&/^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(value.keySavedAt)?value.keySavedAt:null;
 out.network=value.network==='system'?'system':'direct';
 try{const u=new URL(value.endpoint);out.endpoint=u.protocol==='https:'||u.protocol==='http:'?u.origin:'';}catch{out.endpoint=''}
 out.model=typeof value.model==='string'&&/^[a-zA-Z0-9_./:-]{1,150}$/.test(value.model)?value.model:'';
 out.voice=typeof value.voice==='string'&&value.voice?value.voice.slice(0,6).replace(/[^a-zA-Z0-9_-]/g,'')+'…':'';
 out.proxyUsed=typeof value.proxyUsed==='boolean'?value.proxyUsed:null;
 out.httpStatus=Number.isInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599?value.httpStatus:null;
 out.errorType=typeof value.errorType==='string'&&['TypeError','SyntaxError','RangeError','SecurityError','SSLEOFError','SSLCertVerificationError','SSLError','gaierror','TimeoutError','ConnectionRefusedError','ConnectionResetError','RemoteDisconnected','HTTPError','ValueError','URLError','AbortError','TimeoutError','NetworkError','NotAllowedError','NotSupportedError','Error'].includes(value.errorType)?value.errorType:null;
 out.errorCode=Object.hasOwn(messages,value.errorCode)?value.errorCode:value.httpStatus>=400?'http_error':null;
 out.message=out.errorCode==='http_error'?(out.provider==='breeze'&&out.httpStatus===401?'Breeze 未接受此 API Key；请确认使用创建时显示的完整密钥，而非公开密钥 ID':'语音服务返回 HTTP '+out.httpStatus):out.errorCode?messages[out.errorCode]:({validate:'正在校验语音设置',saved:'语音设置已保存',save:'正在提交语音设置',key:'正在读取并解密密钥',request:'正在请求语音服务',audio:'音频已收到，等待播放',play:'正在启动音频播放',playing:'正在播放语音',validated:'Breeze 音色列表查询认证通过；尚未验证合成权限及语音额度',cancelled:'本次朗读已停止，晚到音频不会播放'}[out.stage]||'尚无语音请求');
 
 if(out.keySource==='stored'&&['key_format_error','key_masked'].includes(out.errorCode))out.message='本次输入框为空，读取的是已存密钥。'+out.message;
 if(out.field)out.message+='（字段：'+out.field+'）';
 if(out.causeCode)out.message+='（'+out.causeCode+'）';
 // A stable upstream error code is useful, but never accept arbitrary server text.
 const upstream=String(value.upstreamCode||'');out.upstreamCode=upstreamCodes.has(upstream)?upstream:null;
 return out;
}
function sanitizeSnapshot(saved){return {version:typeof saved.version==='string'&&/^\d+\.\d+\.\d+$/.test(saved.version)?saved.version:version,status:saved.status?clean(saved.status):null,lastError:saved.lastError?clean(saved.lastError):null,events:Array.isArray(saved.events)?saved.events.slice(-20).map(clean):[]}}
module.exports=function diagnostics(data){
 let state=read(data);
 function persist(){
  state.version=version;const dir=path.join(data,'logs');
  try{fs.mkdirSync(dir,{recursive:true});for(const [name,value] of [['voice-last-status.json',state],['voice-last-error.json',{version,error:state.lastError}]]){const f=path.join(dir,name);fs.writeFileSync(f+'.tmp',JSON.stringify(value,null,2));fs.renameSync(f+'.tmp',f)}}catch{}
 }
 function update(value){const next=clean({...state.status,...value,at:new Date().toISOString()});state.status=next;state.events.push(next);state.events=state.events.slice(-20);persist();return next}
 function fail(value){const next=clean({...state.status,...value,at:new Date().toISOString()});state.status=next;state.lastError=next;state.events.push(next);state.events=state.events.slice(-20);persist();return next}
 return {
  begin(body){const keyInfo=Object.fromEntries(['keySource','keyPrefix','keyLength','rawKeyLength','inputKeyEmpty','hasWhitespace','hasInvisible','hasControl','hasMaskingChar','hasNonAscii','hasDot','hasPlus','hasSlash','hasEquals','normalizationChanged'].map(k=>[k,null]));return update({...keyInfo,requestId:randomUUID(),stage:body.operation==='save_verify'?'validate':'key',provider:body.provider,endpoint:body.endpoint,model:body.model,voice:body.voice,network:body.network,operation:body.operation,credentialScope:body.credentialScope,keyFingerprint:body.keyFingerprint,keySavedAt:body.keySavedAt,httpStatus:null,errorType:null,errorCode:null,causeCode:null,field:null,proxyUsed:null,upstreamCode:null})},
  update,fail,succeed(value){if(state.lastError?.operation===state.status?.operation)state.lastError=null;return update(value)},
  report(value){if(value.requestId!==state.status?.requestId)return;const stage=value.stage;if(!['play','playing','cancelled','request','audio'].includes(stage))return;
   if(value.errorCode)return fail({stage,errorCode:['play_blocked','play_failed','invalid_audio','bridge_error'].includes(value.errorCode)?value.errorCode:'bridge_error',errorType:value.errorType});
   if(stage==='playing')state.lastError=null;return update({stage,errorCode:null,errorType:null});},
  clear(){state.lastError=null;state.events=[];if(state.status?.errorCode)state.status=null;persist();return this.snapshot()},
  snapshot(){return sanitizeSnapshot(state)}
 };
};
module.exports.read=read;
