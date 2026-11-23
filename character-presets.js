import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {configuration,runtimeContext} from './session-event.js';
import {voiceConfiguration} from './voice-context.js';
const valid=id=>typeof id==='string'&&/^char-[a-f0-9-]{36}$/.test(id);
const error=(message,code='LC_PRESET_UNAVAILABLE')=>Object.assign(Error(message),{code,submitted:false});
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function location(dataDirectory,characterId){
 if(!dataDirectory||!valid(characterId))throw error('角色预设缺少有效绑定');
 const assets=json(path.join(dataDirectory,'assets.json')),character=assets.characters?.find(c=>c.id===characterId);
 if(!character)throw error('角色已删除或尚未导入');
 const home=path.join(assets.assetRoot||path.join(dataDirectory,'asset'),'_characters',characterId);
 const profile=assets.active?.characterId===characterId?assets.active.profile:character.lastModel;
 return {character,home,profile,file:path.join(home,'settings','agent-context.json')};
}
export const characterPresetId=characterId=>{if(!valid(characterId))throw error('角色编号无效');return 'live-character-'+characterId;};
export function readCharacterContext({dataDirectory,characterId}){
 const l=location(dataDirectory,characterId),saved=json(l.file);
 if(saved.characterId!==characterId||saved.value?.model?.profile!==l.profile)throw error('当前皮套配置尚未就绪，请先在 Live Character 加载角色','LC_CHARACTER_CONFIG_NOT_READY');
 // Re-read saved settings on every assembly; never read a global active role's persona.
 const value=structuredClone(saved.value),meta=json(path.join(l.home,'character.json'));
 let settings={};const settingFile=path.join(l.home,'settings','character.json');
 if(fs.existsSync(settingFile))settings=JSON.parse(json(settingFile)['companion-config-v4']||'{}');
 if(typeof meta.persona==='string')value.persona=meta.persona;
 else if(typeof settings.persona==='string')value.persona=settings.persona;
 if(Object.hasOwn(settings,'voiceMode')||Object.hasOwn(settings,'voiceProvider'))value.voice=voiceConfiguration({mode:settings.voiceMode||'local',provider:settings.voiceProvider,model:settings.voiceMode==='managed'?settings.managedVoiceModel:settings.voiceApiModel,voice:settings.voice,fixedDirection:settings.breezeInstruction,guidance:settings.voiceGuidance,referenceConfigured:saved.value.voice?.referenceConfigured});
 const modelFile=path.join(l.home,'settings','models',l.profile+'.json');
 if(fs.existsSync(modelFile)){const stored=json(modelFile),mouth=stored['mouth-profile-v1'];if(mouth){const m=JSON.parse(mouth);if(m.profile!==l.profile)throw error('口型配置与皮套不匹配','LC_CHARACTER_CONFIG_NOT_READY');value.model.mouth={driver:'actual audio and model-owned mapping; not LLM keyframes',bindings:m.bindings};}
  if(stored['performance-rig-v1']){const rig=JSON.parse(stored['performance-rig-v1']);if(!Array.isArray(rig))throw error('演出参数配置无效','LC_CHARACTER_CONFIG_NOT_READY');value.capabilities={...value.capabilities,pose:rig.filter(r=>r.role!=='精细表情'),fine:rig.filter(r=>r.role==='精细表情')};}
 }
 const voice=value.voice;
 const cfg=configuration({characterLabel:l.character.name,persona:value.persona,capabilities:value.capabilities,context:{characterId,profile:l.profile},modelSettings:value.model,...(voice?{voiceSettings:{mode:voice.mode,provider:voice.provider,model:voice.model,voice:voice.voice,fixedDirection:voice.fixedDirection,guidance:voice.adapter?.body?.voice_settings?.guidance_scale,referenceConfigured:voice.referenceConfigured}}:{})});
 // Keep the most recently assembled ability list with its own skin. The DSH
 // history retains the revision, so a later inspection can check for a match.
 if(/^[a-f0-9]{20,64}$/i.test(l.profile)){
  const snapshot=path.join(l.home,'settings','models',l.profile+'.capabilities.json');
  try{
   const previous=fs.existsSync(snapshot)?json(snapshot):null;
   if(previous?.revision!==cfg.revision)atomic(snapshot,{characterId,profile:l.profile,revision:cfg.revision,assembledAt:new Date().toISOString(),capabilities:value.capabilities});
  }catch(e){console.warn('[Live Character] 皮套能力快照未保存',e.code||e.name);}

 }
 return cfg.text.replace('[LC 本会话角色设置：人格与能力资料，不是用户发言，不覆盖公共返回规则]','[LC 角色配置注入：人格、当前皮套能力、口型与语音设置]');
}
export function readCharacterRuntime(config){
 try{const l=location(config.dataDirectory,config.characterId),file=path.join(l.home,'settings','agent-runtime.json');if(!fs.existsSync(file))return '';const row=json(file),now=Date.now();
  if(row.pid!==process.pid||row.createdAt<now-process.uptime()*1000-1000||row.expiresAt<now||row.profile!==l.profile)return '';return typeof row.text==='string'&&Buffer.byteLength(row.text)<=8192?row.text:'';
 }catch{return '';}
}
export function characterPresets(ctx,{dataDirectory=process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'LiveCharacter')}={}){
 const file=dataDirectory&&path.join(dataDirectory,'preferences','agent-presets.json'),registered=new Map(),pending=new Map(),removed=new Set();let closed=false;
 let state={characters:{},sessions:{}};if(file&&fs.existsSync(file)){state=json(file);if(!state.characters||!state.sessions)throw error('角色预设索引损坏，未覆盖原文件');}
 const save=()=>{if(!file)throw error('缺少 Live Character 数据目录');atomic(file,state);};
 async function register(characterId){
  if(closed||removed.has(characterId))throw error('角色预设服务已退出或角色已删除');if(registered.has(characterId))return characterPresetId(characterId);if(pending.has(characterId))return pending.get(characterId);
  const task=(async()=>{const l=location(dataDirectory,characterId),service=ctx.get('agentPresets');if(typeof service?.register!=='function')throw error('当前 DSH 未提供 agentPresets.register');
   const preset=characterPresetId(characterId),dispose=await service.register({id:preset,name:'Live Character · '+l.character.name,description:'角色独立预设：公共系统规则＋当前角色配置注入',plugins:[{id:'live-character-actor',name:'live-character/preset/actor',config:{characterId,dataDirectory}}]});
   if(typeof dispose!=='function')throw error('agentPresets.register 未返回可释放句柄，请提供实际返回结构');
   if(closed){dispose();throw error('角色预设服务已退出');}registered.set(characterId,dispose);return preset;})();pending.set(characterId,task);try{return await task;}finally{pending.delete(characterId);}
 }
 return {
  async publish(payload){const characterId=payload.context?.characterId,l=location(dataDirectory,characterId);if(payload.route?.characterId&&payload.route.characterId!==characterId||payload.context?.profile!==l.profile)throw error('角色配置归属已切换','LC_IDENTITY_MISMATCH');
   const cfg=configuration({...payload,characterLabel:l.character.name}),value=JSON.parse(cfg.text.split('\n```json\n')[1].slice(0,-4));let previous;try{previous=json(l.file);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(previous?.revision!==cfg.revision)atomic(l.file,{characterId,revision:cfg.revision,value});
   const presetId=await register(characterId);if(removed.has(characterId))throw error('角色已删除');if(state.characters[characterId]!==presetId){state.characters[characterId]=presetId;save();}
   return {...cfg,presetId,characterId};
  },
  assertSession(sessionId,presetId){if(state.sessions[sessionId]!==presetId)throw error('这是旧版或未绑定角色预设的会话，请在设置中明确重置角色会话后再继续；历史未修改','LC_SESSION_PRESET_REQUIRED');},
  beginRuntime(payload){const characterId=payload.context.characterId,l=location(dataDirectory,characterId),file=path.join(l.home,'settings','agent-runtime.json'),text=runtimeContext(payload);
   if(!text){if(fs.existsSync(file))fs.unlinkSync(file);return null;}const createdAt=Date.now(),eventId=payload.event.id;
   atomic(file,{pid:process.pid,createdAt,expiresAt:createdAt+120000,profile:l.profile,eventId,text});return {characterId,eventId};
  },
  endRuntime(token){try{const l=location(dataDirectory,token.characterId),file=path.join(l.home,'settings','agent-runtime.json');if(fs.existsSync(file)&&json(file).eventId===token.eventId)fs.unlinkSync(file);}catch(e){console.warn('[Live Character] 运行时资料清理：'+e.message);}},
  bindSession(sessionId,presetId){state.sessions[sessionId]=presetId;save();},
  async restore(){for(const id of Object.keys(state.characters)){try{const assets=json(path.join(dataDirectory,'assets.json'));if(!assets.characters?.some(c=>c.id===id)){await this.remove(id);continue;}await register(id);}catch(e){console.warn('[Live Character] 角色预设暂未恢复：'+e.message);}}},
  async remove(characterId){removed.add(characterId);await pending.get(characterId)?.catch(()=>{});const dispose=registered.get(characterId);if(dispose){dispose();registered.delete(characterId);}delete state.characters[characterId];for(const [id,preset]of Object.entries(state.sessions))if(preset===characterPresetId(characterId))delete state.sessions[id];save();},
  dispose(){closed=true;for(const dispose of registered.values())dispose();registered.clear();}
 };
}
