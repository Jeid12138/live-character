'use strict';
(()=>{
 const stageFields=['idle','physics','amp','cap','quality','colors','autoRules','autoIdle','idleAfter','focusMode',...focusFields,'showZones'];
 const companionFields={
  persona:'persona',model:'petModel',reasonMode:'reasonMode',reasonCap:'reasonCap',auto:'autonomy',
  touchAI:'touchAI',touchDebounceMs:'touchDebounceMs',interval:'decisionInterval',quiet:'quietFactor',budget:'autoBudget',speakChance:'speechChance',
  tts:'ttsEndpoint',voice:'voiceId',referenceText:'referenceText',autoVoice:'autoVoice',lipGain:'lipGain',lipOffset:'lipOffset'
 };
 function check(ok,label){if(!ok)throw Error('配置无效：'+label);}
 function ranged(v,min,max){return Number.isFinite(v)&&v>=min&&v<=max;}
 function read(id){const e=$(id);if(e.type==='checkbox')return e.checked;if(['range','number'].includes(e.type))return e.valueAsNumber;return e.value;}
 function validate(id,v){
  const e=$(id);
  if(id==='touchDebounceMs')check(Number.isInteger(v),'触摸合并间隔须为整数');
  if(e.type==='checkbox')check(typeof v==='boolean',id);
  else if(['range','number'].includes(e.type))check(ranged(v,+e.min,+e.max),id);
  else if(e.tagName==='SELECT')check([...e.options].some(o=>o.value===v),id);
  else check(typeof v==='string'&&v.length<=(e.maxLength>0?e.maxLength:50000),id);
 }
 function ensureReady(){if(!ready||window.zoneEditor.editing)throw Error('请先加载皮套，并保存或退出触摸校准');}
 const persistentControls=['idle','physics','amp','cap','quality','colors','autoRules','autoIdle','idleAfter'];
 function saveControls(){
  petStore.setItem('pet-stage-settings',JSON.stringify(Object.fromEntries(persistentControls.map(id=>[id,read(id)]))));
 }
 try{
  const saved=JSON.parse(petStore.getItem('pet-stage-settings'));
  if(saved){for(const id of persistentControls)validate(id,saved[id]);
   for(const id of persistentControls){const field=$(id);if(field.type==='checkbox')field.checked=saved[id];else field.value=saved[id];}}
  $('amp').oninput();updateIdleControls();
 }catch{}
 for(const id of persistentControls)$(id).addEventListener('change',saveControls);
 async function capture(){
  ensureReady();
  const companion=Object.fromEntries(Object.entries(companionFields).map(([k,id])=>[k,read(id)]));
  for(const [k,id] of Object.entries(companionFields))validate(id,companion[k]);
  for(const id of stageFields)validate(id,read(id));
  companion.swapButtons=read('mouseButtons')==='swap';
  const owner=await window.petDesktop?.asset?.('library');return {mouth:window.mouthProfile?.capture(),characterId:owner?.current||null,speechPlayback:await window.petDesktop?.asset?.('voicePlayback')??{volume:.8,muted:false},speechApi:{voiceStyle:window.companion.config.voiceStyle||'normal',managedVoiceModel:window.companion.config.managedVoiceModel||'',localVoiceProfile:window.companion.config.localVoiceProfile,voiceGuidance:window.companion.config.voiceGuidance??2.5,voiceNetwork:window.companion.config.voiceNetwork||'direct',voiceProfiles:structuredClone(window.companion.config.voiceProfiles||{}),voiceProvider:window.companion.config.voiceProvider||'openai',voiceMode:window.companion.config.voiceMode||'local',voiceApiUrl:window.companion.config.voiceApiUrl||'',voiceApiModel:window.companion.config.voiceApiModel||'',breezeEndpoint:window.companion.config.breezeEndpoint||'',breezeInstruction:window.companion.config.breezeInstruction||''},memory:{...window.companion.exportMemory(),history:(await window.companion.fullHistory()).rows},breathing:breathSettings(),studio:window.studioSettings?.capture(),top:$('alwaysTop')?.checked,tracking:window.petTracking||{},profile:catalog.profile,scope:'character-lab',version:4,model:catalog.model,controls:Object.fromEntries(stageFields.map(id=>[id,read(id)])),companion,
   rules,calibration:window.zoneEditor.exportSettings(),parameters:Object.fromEntries(locks),mode:character.mode,
   expressions:[...character.expressions].filter(([,e])=>e.to>0&&e.expires===null).map(([n])=>n),
   gestures:[...character.gestures.values()].filter(g=>g.targetOn&&g.expires===null).map(g=>g.pair.name),
   placement:{...placement},view,window:await window.petDesktop?.windowConfig?.()??null,
   sidebar:!$('modelSidebar').hidden,search:read('search'),group:read('paramGroup'),tab:document.querySelector('[data-tab].active').dataset.tab,
   pane:document.querySelector('[data-pane].active').dataset.pane};
 }
 async function restore(data){
  ensureReady();check(data?.scope==='character-lab'&&[3,4].includes(data.version),'文件类型或版本');
  if(data.version===3){
   const old=data;data=await capture();Object.assign(data,{model:old.model,rules:old.rules,parameters:old.parameters,expressions:old.activeExpressions,placement:old.placement,view:old.view});
   Object.assign(data.controls,{idle:old.settings.idle,physics:old.settings.physics,focusMode:old.settings.focusMode?'on':'off',amp:Math.round(old.amplitude*100),cap:String(old.fps),quality:String(old.quality),colors:old.colors,autoIdle:old.autoIdle,idleAfter:old.idleAfter});
  }
  const s=data.controls,c={touchDebounceMs:250,...data.companion},z=data.calibration,p=data.placement;
  for(const id of stageFields)validate(id,s[id]);
  for(const [k,id] of Object.entries(companionFields))validate(id,c[k]);
  check(typeof c.swapButtons==='boolean','鼠标操作');
  const prefs=Object.fromEntries([...Object.keys(companionFields),'swapButtons'].map(k=>[k,c[k]]));
  if(data.speechApi){if(data.speechApi.voiceStyle!==undefined){check(['normal','clone'].includes(data.speechApi.voiceStyle),'声音方式');prefs.voiceStyle=data.speechApi.voiceStyle;}if(data.speechApi.managedVoiceModel!==undefined){check(typeof data.speechApi.managedVoiceModel==='string'&&data.speechApi.managedVoiceModel.length<=200,'后台语音模型');prefs.managedVoiceModel=data.speechApi.managedVoiceModel;}if(data.speechApi.localVoiceProfile){
   const {voice,instruction}=data.speechApi.localVoiceProfile;
   check(typeof voice==='string'&&voice.length<=200&&typeof instruction==='string'&&instruction.length<=2000,'本地音色配置');prefs.localVoiceProfile={voice,instruction};
  }if(data.speechApi.voiceGuidance!==undefined){check(ranged(data.speechApi.voiceGuidance,1,10),'演绎指令强度');prefs.voiceGuidance=data.speechApi.voiceGuidance;}if(data.speechApi.voiceNetwork!==undefined){check(['direct','system'].includes(data.speechApi.voiceNetwork),'语音网络');prefs.voiceNetwork=data.speechApi.voiceNetwork;}if(data.speechApi.voiceProfiles!==undefined){check(data.speechApi.voiceProfiles&&typeof data.speechApi.voiceProfiles==='object'&&!Array.isArray(data.speechApi.voiceProfiles),'语音服务配置');const profiles={};for(const [id,item] of Object.entries(data.speechApi.voiceProfiles)){check(Object.keys(window.LCVoiceCatalog).includes(id)&&item&&typeof item==='object','语音服务配置');const profile={};for(const key of ['endpoint','model','voice','instruction']){check(typeof item[key]==='string'&&item[key].length<=2000,'语音服务配置');profile[key]=item[key];}profile.guidance=Number.isFinite(item.guidance)?Math.max(1,Math.min(10,item.guidance)):2.5;profile.network=item.network==='system'?'system':'direct';profiles[id]=profile;}prefs.voiceProfiles=profiles;}if(data.speechApi.voiceProvider!==undefined){check(Object.keys(window.LCVoiceCatalog).includes(data.speechApi.voiceProvider),'语音服务商');prefs.voiceProvider=data.speechApi.voiceProvider;}else prefs.voiceProvider='openai';for(const field of ['voiceMode','voiceApiUrl','voiceApiModel']){if(field==='voiceApiModel')check(typeof data.speechApi[field]==='string'&&data.speechApi[field].length<=150,field);else if(field==='voiceMode')check(['api','local','breeze','breeze-managed','managed'].includes(data.speechApi[field]),'语音来源');else validate(field,data.speechApi[field]);prefs[field]=data.speechApi[field];}for(const field of ['breezeEndpoint','breezeInstruction']){if(data.speechApi[field]!==undefined){validate(field,data.speechApi[field]);prefs[field]=data.speechApi[field];}}}
  if(data.speechPlayback)check(ranged(data.speechPlayback.volume,0,1)&&typeof data.speechPlayback.muted==='boolean','音量与静音');
  if(data.breathing)validateBreath(data.breathing);
  if(data.studio)window.studioSettings?.validate(data.studio);
  if(data.top!==undefined)check(typeof data.top==='boolean','置顶');
  const importedRules=LabRules.validate(data.rules);
  ZoneGeometry.validate(z.zones);check(typeof z.signature==='string'&&ranged(z.padding,0,120),'触摸区域');
  const same=(!data.profile||data.profile===catalog.profile)&&data.model===catalog.model&&z.signature===window.zoneEditor.exportSettings().signature;
  if(data.mouth&&same)window.mouthProfile.validate(data.mouth);
  if(data.memory){
   const m=data.memory,h=m.history,t=m.state;
   if(m.appearance){const a=m.appearance;check(a.current&&typeof a.current.characterId==='string'&&typeof a.current.profile==='string'&&typeof a.current.summary==='string'&&a.current.summary.length<=800&&Array.isArray(a.events)&&a.events.length<=8&&a.events.every(e=>e&&typeof e.id==='string'&&typeof e.at==='string'&&(!e.reply||typeof e.reply==='string'&&e.reply.length<=2000)),'形象记忆');}
   check(Array.isArray(h)&&h.every(x=>x&&['user','assistant'].includes(x.role)&&typeof x.text==='string'&&x.text.length<=2000&&(!x.at||Number.isFinite(Date.parse(x.at)))),'对话记录');
   check(t&&typeof t.emotion==='string'&&Number.isFinite(t.activity)&&Array.isArray(t.events)&&Array.isArray(t.calls)&&t.calls.every(Number.isFinite),'情绪记忆');
  }
  check(['full','portrait'].includes(data.view)&&ranged(p.zoom,.4,3)&&ranged(p.x,-100000,100000)&&ranged(p.y,-100000,100000),'视图');
  check(['tracking','detached'].includes(data.mode)&&typeof data.sidebar==='boolean','角色模式');
  for(const arr of [data.expressions,data.gestures])check(Array.isArray(arr)&&arr.length<=1000&&arr.every(n=>typeof n==='string'),'表情或手势');
  check(data.parameters&&typeof data.parameters==='object'&&!Array.isArray(data.parameters),'参数');
  const pins=Object.entries(data.parameters);
  for(const [id,value] of pins){check(Number.isFinite(value),id);if(same){const i=params.ids.indexOf(id);check(i>=0&&ranged(value,params.minimumValues[i],params.maximumValues[i]),id);}}
  const b=data.window;
  if(b!==null)check(b&&ranged(b.x,0,1)&&ranged(b.y,0,1)&&ranged(b.width,1,50000)&&ranged(b.height,1,50000),'桌面窗口');
  validate('search',data.search);
  if(same)validate('paramGroup',data.group);
  const tab=[...document.querySelectorAll('[data-tab]')].find(t=>t.dataset.tab===data.tab);
  const pane=[...document.querySelectorAll('[data-pane]')].find(t=>t.dataset.pane===data.pane);
  check(tab&&pane,'设置分页');
  if(s.focusMode!==focusChoice && !await setFocus(s.focusMode))throw Error('系统按键计数暂不可用，请重新导入');
  if(b)await window.petDesktop?.windowConfig?.(b);
  window.companion.stop();if(data.speechPlayback)await window.companion.setPlayback(data.speechPlayback);
  for(const id of stageFields){
   if(id==='focusMode')continue;const e=$(id);
   if(e.type==='checkbox')e.checked=s[id];else e.value=s[id];
   e.oninput?.();e.onchange?.();
  }
  saveControls();window.companion.applySettings(prefs);
  if(data.studio)window.studioSettings?.apply(data.studio);
  if(data.breathing){applyBreath({...data.breathing,target:same?data.breathing.target:''});saveBreath();}
  if(data.top!==undefined&&window.petDesktop?.asset){await window.petDesktop.asset('top',data.top);$('alwaysTop').checked=data.top;}
  if(same&&data.tracking){window.petTracking=Object.fromEntries(Object.entries(data.tracking).filter(([k,v])=>['AngleX','AngleY','AngleZ','PositionX','PositionY','ParamEyeBallX','ParamEyeBallY'].includes(k)&&params.ids.includes(v)&&!catalog.physicsIO?.Output?.includes(v)));petStore.setItem('tracking-map',JSON.stringify(window.petTracking));refreshPerformanceRig();}
  if(same){
   if(data.mouth)window.mouthProfile.apply(data.mouth);rules=importedRules;renderRules();rebuildRules();
   if(z.signature)window.zoneEditor.importSettings(z);
   locks.clear();for(const [id,v] of pins)locks.set(id,v);
   const now=performance.now()/1000;
   workExpressions.clear();character.expressions.clear();character.gestures.clear();character.temporary=null;
   requestMode(data.mode);
   for(const n of data.expressions)character.setExpression(n,true,now);
   for(const n of data.gestures)character.gesture(n,true,now);
   $('paramGroup').value=data.group;
  }
  view=data.view;placement={x:p.x,y:p.y,zoom:p.zoom};resize();
  $('search').value=data.search;renderParams();sidebar(data.sidebar);petStore.setItem('pet-model-sidebar',data.sidebar?'open':'closed');tab.click();pane.click();
  if(same&&data.memory){const owner=await window.petDesktop?.asset?.('library');if(data.characterId&&owner?.current===data.characterId)window.companion.importMemory(data.memory);else return '配置已导入；记忆归属未匹配，已保留当前角色记录';}
  return same?'配置已导入':'通用设置已导入；当前皮套不同，已保留它的触摸区域、参数、演出状态和规则';
 }
 $('save').onclick=async()=>{try{
  const data=await capture();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='live-character-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('configResult').textContent='配置已导出';
 }catch(err){$('configResult').textContent=err.message;}};
 $('restore').onclick=()=>$('configFile').click();
 $('configFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;
  $('restore').disabled=true;try{check(file.size<=64*1024*1024,'文件过大');const message=await restore(JSON.parse(await file.text()));$('configResult').textContent=message;notice(message);}
  catch(err){$('configResult').textContent='导入失败：'+err.message;notice($('configResult').textContent);}
  finally{e.target.value='';$('restore').disabled=false;}
 };
})();
