// Public synthesis settings for the character's configuration layer. Never accepts credentials/URLs.
const short=(v,n)=>typeof v==='string'?v.slice(0,n):'';
export function voiceConfiguration(settings={}){
 const mode=['api','breeze','breeze-managed','managed','local'].includes(settings.mode)?settings.mode:'local';
 const breeze=mode==='breeze'||mode==='breeze-managed';
 const provider=breeze?'breeze-local':mode==='local'?'local-adapter':mode==='managed'?'local-worker':short(settings.provider,40);
 const model=breeze?'Breeze TTS2':mode==='local'?'由已连接本地服务决定':short(settings.model,150);
 const guidance=Number.isFinite(settings.guidance)?Math.min(10,Math.max(1,settings.guidance)):2.5;
 const value={mode,provider,model,voice:breeze?'本地参考音频或音色设计':short(settings.voice,200),...(mode!=='api'?{referenceConfigured:settings.referenceConfigured===true}:{}),fixedDirection:short(settings.fixedDirection,2000),reply:{textField:'text',directionField:'speech.instructions',directionType:'string',maxDirectionChars:900,effectiveDirectionLimit:1000,executor:'LC adapter; return the performance JSON, do not issue an HTTP request'}};
 if(mode==='managed')value.adapter={format:'local worker',acceptsDirection:model==='breeze-bf16',maxTextChars:2000};
 else if(mode==='breeze-managed')value.adapter={format:'local worker',acceptsDirection:true,maxTextChars:2000,fields:{text:'$text',instruction:'$speech.instructions + $fixedDirection',reference:'local reference audio if configured'}};
 else if(mode==='breeze')value.adapter={format:'multipart/form-data',acceptsDirection:true,maxTextChars:2000,fields:{text:'$text',instruction:'$speech.instructions + $fixedDirection',cfg_scale:'4 with instruction; otherwise 1',ref_audio:'local reference WAV if configured',ref_text:'saved reference transcript if configured'}};
 else if(mode==='local')value.adapter={format:'JSON local adapter',acceptsDirection:false,maxTextChars:2000,body:{text:'$text',voice:'$voice',reference:'local reference audio if configured',reference_text:'saved reference transcript if configured'},note:'当前通用本地协议只转发这些字段，未转发演绎指令；具体引擎及音色由本地服务确定'};
 else if(provider==='breeze')value.adapter={format:'JSON',acceptsDirection:true,maxTextChars:1000,voiceSelection:'configured voice ID in route',body:{text:'$text',model_id:model,instructions:'$speech.instructions + $fixedDirection',voice_settings:{guidance_scale:guidance}}};
 else if(provider==='fish')value.adapter={format:'JSON',acceptsDirection:false,maxTextChars:2000,modelSelection:'configured model in request header',body:{text:'$text',reference_id:value.voice,format:'wav',latency:'normal'},note:'当前适配器不转发独立 instructions；不得把该字段当作已送入合成器'};
 else if(provider==='qwen')value.adapter={format:'JSON',acceptsDirection:false,maxTextChars:600,body:{model,input:{text:'$text',voice:value.voice,language_type:'Auto'}},note:'当前已接入的 HTTP 模型不转发独立演绎指令'};
 else if(provider==='openai')value.adapter={format:'JSON OpenAI-compatible',acceptsDirection:false,maxTextChars:2000,body:{model,input:'$text',voice:value.voice,response_format:'wav'},note:'仅描述当前适配器实际字段，不假定所填服务支持额外 instructions'};
 else value.adapter={format:'unavailable',acceptsDirection:false,note:'所选服务尚无已接入的调用格式，不编造可用协议'};
 return value;
}
export function modelConfiguration(settings={},profile){
 const value={profile,...(short(settings.label,100)?{label:short(settings.label,100)}:{})};
 if(settings.mouth){const rows=settings.mouth.bindings;if(!Array.isArray(rows)||rows.length>128)throw Object.assign(Error('口型配置须为最多 128 项'),{code:'LC_CONFIG_INVALID',submitted:false});
  const bindings=rows.map(row=>{if(!row||typeof row.id!=='string'||!row.id||row.id.length>200||typeof row.input!=='string'||!row.input||row.input.length>80||!['linear','centered'].includes(row.mode)||typeof row.enabled!=='boolean')throw Object.assign(Error('口型配置格式无效'),{code:'LC_CONFIG_INVALID',submitted:false});
   const nums=['inputMin','inputMax','outputMin','outputMax','neutral'];if(!nums.every(k=>Number.isFinite(row[k])))throw Object.assign(Error('口型配置范围无效'),{code:'LC_CONFIG_INVALID',submitted:false});
   return {id:short(row.id,200),input:short(row.input,80),mode:row.mode,enabled:row.enabled,...Object.fromEntries(nums.map(k=>[k,row[k]]))};});
  value.mouth={driver:'actual audio and model-owned mapping; not LLM keyframes',bindings};
 }
 return value;
}
