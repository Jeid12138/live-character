'use strict';
const petStore={
   getItem(k){if(window.petDesktop?.store){const saved=window.petDesktop.store(window.petStorageKey||window.petProfile,'get',k);if(saved!==null)return saved;if(!window.petDesktop.store(window.petStorageKey||window.petProfile,'legacyAllowed',k))return null;}
    const v=localStorage.getItem('pet7:'+(window.petProfile||'')+':'+k);const legacy=v??((window.petLegacy||!window.petProfile)?localStorage.getItem(k):null);
    if(legacy!==null&&window.petDesktop?.store)window.petDesktop.store(window.petStorageKey||window.petProfile,'set',k,legacy);return legacy;},
   setItem(k,v){if(window.petDesktop?.store){window.petDesktop.store(window.petStorageKey||window.petProfile,'set',k,v);return;}localStorage.setItem('pet7:'+(window.petProfile||'')+':'+k,v);}
  };
  const $=id=>document.getElementById(id);
let catalog,model,app,core,params,physics,ready=false,loading=false,expression=null,motionUntil=0,view='full';
let placement={x:0,y:0,zoom:1},drag=null,lastInput=performance.now(),typingSerial=0,clickSerial=0,mouseSpeed=0,prevMouse=null,manualUntil=0,autoExpression=null,actionEpoch=0;
let rules=LabRules.validate(LabRules.defaults),ruleEngine,ruleLog=[];
try{const saved=petStore.getItem('character-lab-rules-v3');if(saved)rules=LabRules.validate(JSON.parse(saved));}catch{}
// Migrate only the untouched built-in work rule; preserve customized rules.
try{if(!petStore.getItem('character-lab-work-exit-v1')){const start=rules.find(r=>r.name==='开始工作'&&r.event==='typing'&&r.expression==='黑框眼镜'&&r.expressionMode==='on'&&r.cooldown===12);if(start){start.cooldown=.2;if(rules.length<50&&!rules.some(r=>r.event==='typingIdle'))rules.push(...LabRules.validate([LabRules.defaults.find(r=>r.id==='work-end')]));}petStore.setItem('character-lab-rules-v3',JSON.stringify(rules));petStore.setItem('character-lab-work-exit-v1','1');}}catch{}
function metrics(){const now=performance.now();return {count:keyCount,rate:keyTimes.filter(k=>now-k<10000).length*6,idle:(now-lastInput)/1000,typingIdle:(now-lastKey)/1000,speed:prevMouse&&now-prevMouse.t<200?mouseSpeed:0,typingSerial,clickSerial};}
function rebuildRules(){ruleEngine=new LabRules.Engine(rules,performance.now(),metrics());try{petStore.setItem('character-lab-rules-v3',JSON.stringify(rules));$('ruleNotice').textContent='规则已保存在此浏览器。';}catch{$('ruleNotice').textContent='浏览器无法保存，请导出配置。';}}
let character,lastModeRequest=0;
const locks=new Map(),smooth=new Map();let pointer={x:0,y:0},keyTimes=[],keyCount=0,lastKey=-Infinity,lastTick=performance.now(),frames=0,fpsAt=lastTick;
let detachedByFocus=false;
function feedback(el,t,level){if(!el)return;el.textContent=t;el.dataset.level=level||(/错误|失败|无效|无法|缺少|过旧|超时|inactive context/i.test(t)?'error':/请先|暂不|尚未|上限|超出|未连接|未加载|忽略/.test(t)?'warning':'normal');}
let noticeTimer;
function clearFeedback(){
 clearTimeout(noticeTimer);
 for(const id of ['status','connectionStatus','companionBrief','galStatus']){
  const node=$(id);if(node){node.textContent='';delete node.dataset.level;}
 }
}
function notice(t,level){
 clearTimeout(noticeTimer);feedback($('status'),t,level);
 if(t&&$('status')?.dataset.level==='normal'&&!/正在|适配中/.test(t))noticeTimer=setTimeout(clearFeedback,5000);
}
function diagnostic(e){window.petRendererHealth?.report('model',e);$('diagnostics').textContent=String(e?.stack||e);notice('加载未完成，请查看诊断信息');$('loadMessage').textContent=String(e.message||e);$('loading').hidden=false;}
async function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('无法加载 '+src));document.head.append(s);});}
function put(id,value){const i=params.ids.indexOf(id);if(i>=0)core.setParameterValueByIndex(i,Math.max(params.minimumValues[i],Math.min(params.maximumValues[i],value)));}
function defaults(){if(!core)return;for(let i=0;i<params.ids.length;i++)core.setParameterValueByIndex(i,params.defaultValues[i]);core.saveParameters();}
function stop(){actionEpoch++;if(!model)return;model.internalModel.motionManager.stopAllMotions();motionUntil=0;}
function reset(){window.companion?.stop();manualUntil=performance.now()+1500;autoExpression=null;stop();locks.clear();smooth.clear();expression=null;character?.reset(performance.now()/1000);if(ready)renderParams();$('activity').textContent='已恢复跟踪，正在平滑关闭表情和手势';}
function resize(){if(!model)return;const el=$('stage'),w=el.clientWidth,h=el.clientHeight;app.renderer.resize(w,h);const margin=Math.min(76,Math.round(h*.14));const k=Math.min(w*.92/model.internalModel.originalWidth,(h-margin)*.92/model.internalModel.originalHeight);model.scale.set(k*(view==='portrait'?1.65:1)*placement.zoom);model.anchor.set(.5,0);model.position.set(w/2+placement.x,Math.max(margin,(view==='portrait'?-h*.03:h*.035)+margin)+placement.y);}
let breathPhase=0,breathLast,breathRows=[];
const breathFields=['breathOn','breathTarget','breathPeriod','breathDepth'];
function bindBreath(){
 if(!params)return;
 const pick=$('breathTarget');
 const custom=pick.value;
 pick.replaceChildren(new Option('跟随模型设置',''));
 for(const id of params.ids)pick.add(new Option(id,id));
 pick.value=params.ids.includes(custom)?custom:'';
 const authored=(catalog.vts?.tracking||[]).filter(r=>r.UseBreathing===true&&params.ids.includes(r.OutputLive2D));
 const targets=pick.value?[{OutputLive2D:pick.value}]:authored.length?authored:['ParamBreath','PARAM_BREATH'].filter(id=>params.ids.includes(id)).slice(0,1).map(OutputLive2D=>({OutputLive2D}));
 breathRows=targets.map(r=>{
  const i=params.ids.indexOf(r.OutputLive2D);
  return {id:r.OutputLive2D,low:Number.isFinite(r.OutputRangeLower)?r.OutputRangeLower:params.minimumValues[i],high:Number.isFinite(r.OutputRangeUpper)?r.OutputRangeUpper:params.maximumValues[i]};
 });
}
function breathSettings(){
 return {enabled:$('breathOn').checked,target:$('breathTarget').value,period:Number($('breathPeriod').value),depth:Number($('breathDepth').value)};
}
function validateBreath(b){
 if(!b||typeof b.enabled!=='boolean'||typeof b.target!=='string'||!Number.isFinite(b.period)||b.period<1||b.period>20||!Number.isFinite(b.depth)||b.depth<0||b.depth>100)throw Error('呼吸设置超出范围');
}
function applyBreath(b){
 validateBreath(b);
 $('breathOn').checked=b.enabled;$('breathPeriod').value=b.period;$('breathDepth').value=b.depth;
 if(params){$('breathTarget').value=params.ids.includes(b.target)?b.target:'';bindBreath();}
}
function saveBreath(){petStore.setItem('breathing',JSON.stringify(breathSettings()));}
for(const id of breathFields)$(id).addEventListener('change',()=>{
 if(id==='breathTarget')bindBreath();
 for(const k of ['breathPeriod','breathDepth']){const e=$(k);e.value=Math.max(+e.min,Math.min(+e.max,e.valueAsNumber||+e.min));}
 saveBreath();
});
function breathing(sec){
 const dt=breathLast===undefined?0:Math.max(0,Math.min(.25,sec-breathLast));breathLast=sec;
 if(!$('breathOn').checked||!breathRows.length){$('breathStatus').textContent=$('breathOn').checked?'没有识别到呼吸参数，可在上方选择。':'呼吸已关闭';return {};}
 breathPhase=(breathPhase+dt/Math.max(1,+$('breathPeriod').value))%1;
 const wave=(1-Math.cos(2*Math.PI*breathPhase))*.5*(+$('breathDepth').value/100);
 const values={};for(const {id,low,high} of breathRows)values[id]=low+(high-low)*wave;
 $('breathStatus').textContent=breathRows.map(({id})=>id+'  '+(locks.get(id)??values[id]).toFixed(2)+(locks.has(id)?'（手动锁定）':'')).join(' · ');
 return values;
}
function refreshPerformanceRig(){
 catalog.controlRig=CompanionCore.rig(catalog,params,window.petTracking||{},JSON.parse(petStore.getItem('ai-parameter-meanings')||'{}'));
 petStore.setItem('performance-rig-v1',JSON.stringify(catalog.controlRig));
}
function tick(){
 const now=performance.now(),sec=now/1000,dt=Math.min(.1,(now-lastTick)/1000);lastTick=now;
 const active=focusActive&&now-lastKey<1800,amp=+$('amp').value/100;
 const elapsed=(now-lastInput)/1000;
 if(focusActive && now-lastModeRequest>1000){
  if(lastInput>lastModeRequest&&character.mode==='detached'&&elapsed<1)character.modeTo('tracking',sec);
  else if(character.detached && $('autoIdle').checked&&elapsed>=+$('idleAfter').value&&character.mode==='tracking'&&!character.busy(sec)){character.modeTo('detached',sec);detachedByFocus=true;}
 }
 const targets={};
 if(focusActive){targets.AngleX=pointer.x*18*amp;targets.PositionX=pointer.x*12*amp;targets.AngleY=pointer.y*12*amp;targets.PositionY=pointer.y*8*amp;targets.ParamEyeBallX=pointer.x*.65;targets.ParamEyeBallY=pointer.y*.5;}
 targets.LeanInput=active?-8*amp:0;
 if(active)targets.AngleY=(targets.AngleY||0)+Math.sin(sec*(2+Math.min(keyTimes.length,30)/12))*2*amp;
 const mapping=window.petTracking||{};
 for(const [from,standard] of [['AngleX','ParamAngleX'],['AngleY','ParamAngleY'],['AngleZ','ParamAngleZ'],['PositionX','ParamBodyAngleX'],['PositionY','ParamBodyAngleY'],['ParamEyeBallX','ParamEyeBallX'],['ParamEyeBallY','ParamEyeBallY']]){
  const id=mapping[from]||(params.ids.includes(from)?from:standard);
  if(id!==from&&from in targets){targets[id]=targets[from];delete targets[from];}
 }
 if(focusActive){const inputs={FaceAngleX:pointer.x*18*amp,FaceAngleY:pointer.y*12*amp,EyeLeftX:pointer.x*.65,EyeRightX:pointer.x*.65,EyeLeftY:pointer.y*.5,EyeRightY:pointer.y*.5};
  for(const row of catalog.vts?.tracking||[]){const input=inputs[row.Input],id=row.OutputLive2D;if(input===undefined||!params.ids.includes(id)||catalog.physicsIO?.Output?.includes(id)||Object.values(mapping).includes(id))continue;
   const {InputRangeLower:l,InputRangeUpper:r,OutputRangeLower:a,OutputRangeUpper:b}=row;
   if([l,r,a,b].every(Number.isFinite)&&r!==l)targets[id]=a+(b-a)*Math.max(0,Math.min(1,(input-l)/(r-l)));
  }
 }
 const eyes={};if(focusActive){
  for(const row of catalog.controlRig||[]){if(!row.role.startsWith('视线'))continue;
   const axis=row.role.endsWith('横向')?'X':'Y',mapped=mapping['ParamEyeBall'+axis];
   const id=mapped&&params.ids.includes(mapped)?mapped:row.id;
   const i=params.ids.indexOf(id),amount=axis==='X'?pointer.x:pointer.y,neutral=params.defaultValues[i];
   // Cursor coordinates already refer to the screen, unlike mirrored camera input.
   targets[id]=neutral+amount*(amount<0?neutral-params.minimumValues[i]:params.maximumValues[i]-neutral);
   eyes[id]=true;
  }
 }
 const track={};for(const [id,value] of Object.entries(targets)){const v=(smooth.get(id)||0)+(value-(smooth.get(id)||0))*(1-Math.exp(-dt*5));smooth.set(id,v);track[id]=v;}
 for(const [id,v] of smooth)if(!(id in targets)){if(Math.abs(v)<.001){smooth.delete(id);continue;}const next=v*Math.exp(-dt*7);smooth.set(id,next);track[id]=next;}
 // Tracking blink only. The tracking-lost clip owns its authored eyelid curves.
 const phase=sec%4.7;let blink=1;if(phase>3.8&&phase<4.12)blink=phase<3.91?1-(phase-3.8)/.11:Math.max(0,(phase-3.96)/.16);
 track.ParamEyeLOpen=Math.max(0,blink);track.ParamEyeROpen=Math.max(0,blink);
 window.companion?.advance(sec);
 const clip=character.temporary;
 const baseMotion=character.mode==='detached'?character.detached:character.tracking;
 for(const [motion,t] of [[$('idle').checked&&baseMotion,sec-character.modeStart],[clip?.m,clip?sec-clip.start:0]]){
  if(!motion)continue;const duration=motion.data.Meta.Duration;
  const time=motion===baseMotion&&duration?t%duration:Math.min(t,duration);
  for(const curve of motion.data.Curves)if(curve.Target==='PartOpacity'){
   const i=core._model.parts?.ids.indexOf(curve.Id)??-1;if(i>=0)core.setPartOpacityByIndex(i,LabState.sampleCurve(curve.Segments,time));
  }
 }
 let values=character.frame(sec,track,$('idle').checked,breathing(sec));if(window.companion)values=window.companion.frame(sec,values);if(focusActive&&character.mode==='tracking')for(const id of Object.keys(eyes))values[id]=track[id];for(const [id,val] of Object.entries(values))put(id,val);
 for(const [id,val] of locks)put(id,val);
 $('state').textContent=character.mode==='detached'?'脱捕待机 · 持续循环':active?'默认跟踪 · 工作中':'默认跟踪 · IDLE';
 $('activity').textContent=character.busy(sec)?'手势过渡中；其余配饰和跟踪保持':character.mode==='detached'?'播放原作者脱捕循环；检测到键鼠活动后恢复跟踪':'IDLE 基础循环 + 原模型物理；表情和手势独立保持';
 for(const b of document.querySelectorAll('[data-expression]'))b.classList.toggle('active',character.expressions.get(b.dataset.expression)?.to>0);
 for(const b of document.querySelectorAll('[data-gesture]')){const p=LabState.pairs.find(p=>p.name===b.dataset.gesture),g=character.gestures.get(p.group);b.classList.toggle('active',g?.pair.name===p.name&&g.targetOn);}
 $('modeTrack')?.classList.toggle('active',character.mode==='tracking');$('modeLost')?.classList.toggle('active',character.mode==='detached');
 frames++;if(now-fpsAt>1000){$('fps').textContent=Math.round(frames*1000/(now-fpsAt))+' FPS';frames=0;fpsAt=now;}
}
function renderParams(){
 const holder=$('parameters');holder.replaceChildren();if(!ready){holder.textContent='模型加载后显示实际参数范围。';return;}
 const names=new Map(catalog.parameters.map(p=>[p.Id,p]));const query=$('search').value.toLowerCase();
 params.ids.forEach((id,i)=>{const entry=names.get(id),name=entry?.Name||id;if($('paramGroup').value && $('paramGroup').value!==(entry?.GroupId||'ungrouped'))return;if(!`${id} ${name}`.toLowerCase().includes(query))return;
 const row=document.createElement('div');row.className='param-row';const label=document.createElement('label');label.textContent=name;const code=document.createElement('code');code.textContent=id;const input=document.createElement('input');input.type='range';input.min=params.minimumValues[i];input.max=params.maximumValues[i];input.step=(+input.max-+input.min)/500||.001;input.value=locks.get(id)??params.defaultValues[i];input.disabled=input.max===input.min;const out=document.createElement('output');out.textContent=Number(input.value).toFixed(2);const release=document.createElement('button');release.textContent='释放';input.oninput=()=>{locks.set(id,+input.value);out.textContent=(+input.value).toFixed(2)};release.onclick=()=>{locks.delete(id);input.value=params.defaultValues[i];out.textContent=(+input.value).toFixed(2)};row.append(label,code,input,release,out);holder.append(row);});
}
function requestMode(mode){detachedByFocus=false;if(!ready)return notice('请先加载模型');lastModeRequest=performance.now();lastInput=lastModeRequest;character.modeTo(mode,lastModeRequest/1000);}
function renderCatalog(){
 if(catalog.profile&&!window.petLegacy&&!petStore.getItem('rules-initialized')){
  rules=rules.filter(r=>(!r.expression||catalog.expressions.some(e=>e.name===r.expression))&&(!r.motion||catalog.motions.some(m=>m.name===r.motion)));
  petStore.setItem('rules-initialized','1');
 }
 catalog.expressions.filter(e=>!['竖食指开','竖食指关'].includes(e.name)).forEach(e=>{const b=document.createElement('button');b.textContent=e.name;b.dataset.expression=e.name;b.title='持续开关 · 淡入淡出 '+e.behavior.fade.toFixed(1)+' 秒';b.onclick=()=>{if(!ready)return notice('请先加载模型');manualUntil=performance.now()+1000;character.toggleExpression(e.name,performance.now()/1000);notice('表情开关：'+e.name+'（独立保持）');};$('expressions').append(b);});
 const holder=$('motions');
 const available=new Set(catalog.motions.map(m=>m.name));
 const pairs=LabState.pairs.filter(p=>available.has(p.open)&&available.has(p.close));
 const bar=document.createElement('div');bar.className='grid';for(const [id,name,mode] of [['modeTrack','默认跟踪 / IDLE','tracking'],['modeLost','脱捕待机 / 循环','detached']]){if(!catalog.motions.some(m=>m.behavior.kind===mode))continue;const b=document.createElement('button');b.id=id;b.textContent=name;b.onclick=()=>requestMode(mode);bar.append(b);}holder.append(bar);
 const note=document.createElement('p');note.className='note';note.textContent='下列为手势开关：打开时播放进入动画并保持，再次点击播放返回动画。';if(pairs.length)holder.append(note);
 for(const pair of pairs){const b=document.createElement('button');b.className='wide';b.style.marginBottom='8px';b.dataset.gesture=pair.name;b.textContent=pair.name+' · 开 / 关';b.onclick=()=>{if(!ready)return notice('请先加载模型');manualUntil=performance.now()+2000;character.toggleGesture(pair.name,performance.now()/1000);};holder.append(b);}
 const d=document.createElement('details'),summary=document.createElement('summary');summary.textContent='动作文件（'+catalog.motions.length+'）';d.append(summary);
 for(const m of catalog.motions){const row=document.createElement('p');row.className='muted';row.textContent=m.name+'：'+({tracking:'默认基础循环',detached:'脱捕基础循环',hold:'进入过渡 → 保持末帧',once:'返回过渡 → 恢复基础状态'}[m.behavior.kind])+' / '+m.data.Meta.Duration.toFixed(2)+' 秒';d.append(row);}holder.append(d);
 for(const m of catalog.motions){
  if(pairs.some(p=>p.open===m.name||p.close===m.name)||['tracking','detached'].includes(m.behavior.kind))continue;
  const b=document.createElement('button');b.textContent=m.name;b.onclick=()=>{if(ready)character.motion(m.name,performance.now()/1000);};holder.append(b);
 }
 const modelName=decodeURIComponent(catalog.model.split('/').pop()).replace(/\.model3\.json$/i,'');
 $('modelCredit').textContent=modelName==='大肥鱼'?'大肥鱼 · 原画及拆分：神宫凉子 / Live2D 建模：霓虹猫_NeonNeko':modelName;
 notice('模型已读取 · '+catalog.expressions.length+' 个表情 / '+catalog.motions.length+' 个动作');
}
function rendererCompatible(internal){
 const native=internal.coreModel._model;
 // A Core version number alone does not establish renderer API/feature compatibility.
 if(native.offscreens?.count>0)throw Error('RENDERER_FEATURE_UNSUPPORTED: 当前模型使用离屏绘制，需要后续渲染器升级');
 const blends=native.drawables.blendModes;
 for(let i=0;blends&&i<native.drawables.count;i++){
  if((blends[i]&255)>2||((blends[i]>>>8)&255)!==0)throw Error('RENDERER_FEATURE_UNSUPPORTED: 当前模型使用尚未支持的高级混合模式');
 }
 const orders=internal.coreModel.getDrawableRenderOrders();
 if(!orders||orders.length!==native.drawables.count)throw Error('CORE_API_MISMATCH: drawable 排序与网格数量不匹配');
 return {orders: native.drawables.renderOrders?'Drawables.renderOrders':'Model.renderOrders',offscreen:0};
}
window.petRenderFailure=error=>{
 if(window.petRendererHealth?.renderFailed)return;
 if(window.petRendererHealth)window.petRendererHealth.renderFailed=true;
 app?.ticker?.stop();ready=false;diagnostic(error);
};
async function load(){
 if(ready||loading)return;loading=true;
 try{
  if(!window.Live2DCubismCore)throw new Error('Cubism Core 依赖未加载，请退出角色并重新检测依赖');
  const {version:coreVersion,maxMoc}=await window.petRendererHealth.waitCore();
  if(maxMoc&&catalog.mocVersion>maxMoc)throw Error('模型要求的 MOC3 版本（'+catalog.mocVersion+'）超过当前 Core 支持范围（'+maxMoc+'）。请等待插件更新运行库。');
  if(!PIXI.live2d)await script('vendor/cubism4.js');
  PIXI.live2d.CubismConfig.supportMoreMaskDivisions=true;
  $('loadMessage').textContent='正在加载模型与大尺寸贴图，请稍候…';
  app=new PIXI.Application({view:$('canvas'),width:800,height:600,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true});app.ticker.maxFPS=+$('cap').value;
  PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker);
  model=await PIXI.live2d.Live2DModel.from(catalog.model,{autoInteract:false,motionPreload:'NONE'});
  const internal=model.internalModel;core=internal.coreModel;params=core._model.parameters;physics=internal.physics;
  const rendererAPI=rendererCompatible(internal);app.stage.addChild(model);
  if(!$('physics').checked)internal.physics=undefined;
  internal.renderer._labColorsEnabled=$('colors').checked;
  if(internal.renderer._clippingManager)internal.renderer.setClippingMaskBufferSize(Math.min(+$('quality').value,app.renderer.gl.getParameter(app.renderer.gl.MAX_TEXTURE_SIZE)));
  internal.renderer._clippingManager?.setGL(app.renderer.gl);
  character=new LabState.Character(catalog,Object.fromEntries(params.ids.map((id,i)=>[id,params.defaultValues[i]])),performance.now()/1000);
  internal.motionManager.stopAllMotions();internal.motionManager.update=()=>false;internal.eyeBlink=undefined;
  const updateModel=internal.update.bind(internal);internal.update=(...args)=>{if(!window.zoneEditor?.editing&&!window.petAdapting)updateModel(...args)};
  internal.updateFocus=()=>{};internal.updateNaturalMovements=tick;
  // Discard saved motion poses after a motion completes; the next frame begins at defaults.
  internal.on('beforeMotionUpdate',()=>{defaults();});
  refreshPerformanceRig();
  ready=true;window.petDesktop?.notify?.('model',{characterId:window.petCharacterId,model:catalog.model,profile:catalog.profile});bindBreath();try{const b=JSON.parse(petStore.getItem('breathing'));if(b)applyBreath(b);}catch{}updateIdleControls();
  const labels=new Map(catalog.groups.map(g=>[g.Id,g.Name]));
  const metadata=new Map(catalog.parameters.map(p=>[p.Id,p.GroupId]));
  for(const group of new Set(params.ids.map(id=>metadata.get(id)||'ungrouped'))){
   const opt=document.createElement('option');opt.value=group;opt.textContent=labels.get(group)|| (group==='ungrouped'?'未分组':group);$('paramGroup').append(opt);
  }
  window.lab={get model(){return model},get locks(){return locks},get character(){return character},get rules(){return rules},get placement(){return placement},metrics,reset};$('loading').hidden=true;resize();new ResizeObserver(resize).observe($('stage'));renderParams();
  $('diagnostics').textContent=JSON.stringify({coreVersion,maxMoc,rendererAPI,runtimeParameters:params.ids.length,expressions:catalog.expressions.length,motions:catalog.motions.length,renderer:app.renderer.type,maskSize:internal.renderer._clippingManager?internal.renderer.getClippingMaskBufferSize():0,maskCount:internal.renderer._clippingManager?._clippingContextListForMask?.length||0,multiplyScreenAvailable:!!core._model.drawables.multiplyColors,scope:'DSH 桌宠'},null,2);notice('模型已加载 · 可开始试演');window.dispatchEvent(new Event('pet-ready'));
 }catch(e){ready=false;diagnostic(e);if(model){model.destroy();model=null;}if(app){app.destroy(false);app=null;}}finally{loading=false;}
}

for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{for(const other of document.querySelectorAll('[data-tab]')){other.classList.toggle('active',other===b);$(other.dataset.tab).hidden=other!==b;}};
$('full').onclick=()=>{view='full';placement={x:0,y:0,zoom:1};resize()};$('portrait').onclick=()=>{view='portrait';placement={x:0,y:0,zoom:1};resize()};$('reset').onclick=reset;
$('search').oninput=renderParams;$('paramGroup').onchange=renderParams;
function sidebar(open){
 $('modelSidebar').hidden=!open;
 document.querySelector('main').classList.toggle('sidebar-open',open);
 $('sidebarToggle').setAttribute('aria-expanded',String(open));
 if(open && ready)renderParams();
}
sidebar(petStore.getItem('pet-model-sidebar')==='open');
$('sidebarToggle').onclick=()=>{sidebar($('modelSidebar').hidden);petStore.setItem('pet-model-sidebar',$('modelSidebar').hidden?'closed':'open');};
$('physics').onchange=()=>{if(model)model.internalModel.physics=$('physics').checked?physics:undefined};
$('amp').oninput=()=>{$('ampValue').textContent=$('amp').value+'%'};$('cap').onchange=()=>{if(app)app.ticker.maxFPS=+$('cap').value;};
function trackCursor(x,y,area){
 if(!focusActive || window.zoneEditor?.editing || !$('windowEditor').hidden)return;
 const now=performance.now(),r=$('stage').getBoundingClientRect();
 if(prevMouse && (x!==prevMouse.x || y!==prevMouse.y)){
  lastInput=now;mouseSpeed=Math.hypot(x-prevMouse.x,y-prevMouse.y)*1000/Math.max(8,now-prevMouse.t);
 }
 prevMouse={x,y,t:now};
 pointer.x=Math.max(-1,Math.min(1,(x-r.left-r.width/2)/(r.width/2)));
 if(area){const cx=r.left+r.width/2,cy=r.top+r.height*.25;
  pointer.x=Math.max(-1,Math.min(1,(x-cx)/Math.max(1,x<cx?cx-area.x:area.x+area.width-cx)));
  pointer.y=Math.max(-1,Math.min(1,(cy-y)/Math.max(1,y<cy?cy-area.y:area.y+area.height-cy)));return;}
 pointer.y=Math.max(-1,Math.min(1,-(y-r.top-r.height*.25)/(r.height/2)));
}
document.addEventListener('pointermove',e=>{if(!window.petDesktop)trackCursor(e.clientX,e.clientY)});
window.addEventListener('blur',()=>{pointer={x:0,y:0};lastKey=-Infinity;prevMouse=null;mouseSpeed=0;cancelGesture();$('canvas').classList.remove('dragging');});
const focusBox = $('focusMode');
let focusActive = false, focusGeneration = 0, nativeCount = 0, sampling = false;
const workExpressions = new Map();
function recordKeys(count) {
 if (!focusActive || window.zoneEditor?.editing || count <= 0) return;
 const t = performance.now();
 if (t-lastKey > 1800) typingSerial++;
 for (let i=0;i<Math.min(count,200);i++) keyTimes.push(t);
 lastKey = t; lastInput = t; keyCount += count;
}
let focusChoice='off', samples=[],lastTyping=0;
const focusFields=['focusWindow','focusKeys','focusExit'];
for(const id of focusFields){
 const field=$(id);field.value=petStore.getItem('pet-'+id)||field.defaultValue;
 field.onchange=()=>{field.value=Math.round(Math.max(+field.min,Math.min(+field.max,Number(field.value)||+field.defaultValue)));petStore.setItem('pet-'+id,field.value);};
}
function focusIcon(){
 const b=$('focusPet');if(!b)return;
 const labels={off:'关',on:'开',auto:'自适应'},next={off:'开启',on:'自适应',auto:'关闭'};
 b.title='专注模式：'+labels[focusChoice]+' · 点击'+next[focusChoice];
 b.setAttribute('aria-label',b.title);b.dataset.mode=focusChoice;b.setAttribute('aria-pressed',String(focusActive));
}
$('focusPet').onclick=()=>{if(!window.petAdapting&&!window.zoneEditor?.editing)setFocus({off:'on',on:'auto',auto:'off'}[focusChoice]);};
function applyFocus(active){
 const changed=focusActive!==active;
 focusActive=active;focusIcon();
 window.petDesktop?.focusState(active,focusChoice);window.petDesktop?.notify?.('focus',{focus:focusChoice,active});
 $('focusStatus').textContent=(focusChoice==='auto'?'自适应 · ':'')+(active?'专注中':focusChoice==='auto'?'等待持续输入':'自由陪伴');
 updateIdleControls();
 if(!changed)return;
 if(!active && character)for(const [name,state] of workExpressions){
  if(character.expressions.get(name)===state&&state.to>0)character.setExpression(name,false,performance.now()/1000);
 }
 if(active){lastInput=performance.now();}
 if(!active&&detachedByFocus&&character?.mode==='detached')character.modeTo('tracking',performance.now()/1000);
 detachedByFocus=false;pointer={x:0,y:0};prevMouse=null;mouseSpeed=0;
 workExpressions.clear();keyTimes=[];keyCount=0;lastKey=-Infinity;
 rebuildRules();window.companion?.schedule();
}
async function setFocus(choice){
 if(typeof choice==='boolean')choice=choice?'on':'off';
 if(!['on','off','auto'].includes(choice)||focusBox.disabled)return false;
 focusBox.disabled=true;focusGeneration++;
 try{
  const res=await fetch('/api/focus',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'companion'},body:JSON.stringify({enabled:choice!=='off'})});
  if(!res.ok)throw Error('无法切换系统按键计数');
  nativeCount=(await res.json()).total;focusChoice=choice;samples=[];lastTyping=0;
  petStore.setItem('pet-focus-choice',choice);applyFocus(choice==='on');return true;
 }catch(e){notice(e.message);return false;}
 finally{focusBox.disabled=false;focusBox.value=focusChoice;}
}
function observeKeys(count,now){
 if(focusChoice==='auto'){
  samples=samples.filter(v=>now-v.t<+$('focusWindow').value*1000);
  if(count>0){samples.push({t:now,n:count});lastTyping=now;}
  if(!focusActive && samples.reduce((n,v)=>n+v.n,0)>=+$('focusKeys').value)applyFocus(true);
  else if(focusActive && now-lastTyping>=+$('focusExit').value*1000){samples=[];applyFocus(false);}
 }
 if(count>0)recordKeys(count);
}
focusBox.onchange=()=>setFocus(focusBox.value);
const startupFocus=petStore.getItem('pet-focus-choice')||(petStore.getItem('pet-focus')==='true'?'on':'off');
if(startupFocus!=='off')setFocus(startupFocus);else applyFocus(false);
setInterval(async()=>{
 if(window.petAdapting||focusChoice==='off'||sampling||focusBox.disabled)return;
 sampling=true;const generation=focusGeneration;
 try{const res=await fetch('/api/focus-count');if(!res.ok)return;
  const {total}=await res.json();
  if(generation===focusGeneration&&Number.isSafeInteger(total)){observeKeys(Math.max(0,total-nativeCount),performance.now());nativeCount=total;}
 }catch{}finally{sampling=false;}
},120);
window.petDesktop?.onFocusToggle(choice=>setFocus(choice));
window.petDesktop?.onLayout((small,fromSidebar)=>{
 cancelGesture();
 if(small&&!fromSidebar){
  window.zoneEditor?.end(false);
  if($('showZones'))$('showZones').checked=false;
  document.querySelectorAll('.companion-dialog').forEach(panel=>panel.hidden=true);
  document.querySelectorAll('.companion-dialog details[open]').forEach(details=>details.open=false);
  window.companion?.closeChat();
 }
 document.documentElement.classList.toggle('pet-only',small);
});

window.petDesktop?.onGaze(trackCursor);
setInterval(()=>{const t=performance.now();keyTimes=keyTimes.filter(k=>t-k<10000);},300);
function renderRules(){
 const list=$('ruleList');list.replaceChildren();
 for(const r of rules){
  const card=document.createElement('div');card.className='rule-card';
  function field(title,key,type,choices){const label=document.createElement('label');label.textContent=title;const input=document.createElement(choices?'select':'input');if(choices){for(const [value,text] of choices){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}input.value=r[key];}else{input.type=type;if(type==='checkbox')input.checked=r[key];else input.value=r[key];if(type==='number'){input.min=key==='hold'?0:.2;input.max=key==='duration'?60:key==='hold'?300:100000;input.step='.1';}}
   input.onchange=()=>{const old=r[key];r[key]=type==='checkbox'?input.checked:type==='number'?+input.value:input.value;try{LabRules.validate(rules);rebuildRules();}catch(e){r[key]=old;input.value=old;notice(e.message);}};label.append(input);card.append(label);return input;
  }
  field('启用','enabled','checkbox');field('规则名称','name','text');field('触发条件','event',null,Object.entries(LabRules.events));field('阈值（开始打字 / 点击时忽略）','threshold','number');field('条件保持秒数（频率 / 空闲 / 鼠速）','hold','number');
  field('触发表情','expression',null,[['','不改变表情'],...catalog.expressions.map(e=>[e.name,e.name])]);
  field('触发动作','motion',null,[['','不播放动作'],...catalog.motions.map(e=>[e.name,e.name])]);
  field('表情操作','expressionMode',null,[['pulse','临时显示 → 淡出'],['on','开启并保持'],['off','关闭'],['toggle','切换开 / 关']]);field('手势操作','motionMode',null,[['hold','按 VTS 语义保持'],['temporary','临时保持后播放返回动画']]);field('临时保持秒数（持续开关时忽略）','duration','number');field('触发冷却秒数','cooldown','number');
 const bar=document.createElement('div');bar.className='actions';const test=document.createElement('button');test.textContent='试播';test.onclick=()=>fireRule(r,true);const del=document.createElement('button');del.textContent='删除';del.onclick=()=>{rules=rules.filter(x=>x!==r);rebuildRules();renderRules();};bar.append(test,del);card.append(bar);list.append(card);
 }
}
async function fireRule(r,manual=false){
 if(!ready)return notice('请先加载模型');
 const now=performance.now()/1000;
 if(manual)manualUntil=performance.now()+1000;
 let did=false;
 const workRule=!manual && ['typing','typingIdle','count','rate'].includes(r.event);
 const before=character.expressions.get(r.expression);
 const skipOwned=workRule && ((r.expressionMode==='off' && workExpressions.get(r.expression)!==before) || (r.expressionMode==='on' && before?.to>0));
 if(r.expression && !skipOwned){const item=catalog.expressions.find(e=>e.name===r.expression);if(item){const op=r.expressionMode||'pulse';if(op==='toggle')character.toggleExpression(r.expression,now);else character.setExpression(r.expression,op!=='off',now,op==='pulse'?r.duration:null);did=true;}}
 if(workRule && !skipOwned && r.expression && character.expressions.get(r.expression)?.to>0)
  workExpressions.set(r.expression,character.expressions.get(r.expression));
 if(r.motion){const m=catalog.motions.find(m=>m.name===r.motion);if(m){if(m.behavior.kind==='detached'&&!manual&&!focusActive)return;if(['tracking','detached'].includes(m.behavior.kind)){requestMode(m.behavior.kind);detachedByFocus=!manual&&m.behavior.kind==='detached';}else character.motion(r.motion,now,r.motionMode==='temporary'?r.duration:null);did=true;}}
 if(!did)return notice('此规则未选择有效表情或动作');
 ruleLog.unshift(new Date().toLocaleTimeString()+' · '+r.name+(manual?'（试用）':''));ruleLog=ruleLog.slice(0,15);$('ruleLog').textContent=ruleLog.join('\n');$('ruleLog').style.whiteSpace='pre-line';
}
$('addRule').onclick=()=>{if(rules.length>=50)return notice('最多 50 条规则');rules.push({...LabRules.defaults[0],id:'custom-'+Date.now(),name:'自定义规则',enabled:false});renderRules();rebuildRules();};
$('autoRules').onchange=()=>{if(!$('autoRules').checked){notice('自动触发已暂停；已开启的持久状态保留，可手动关闭。');}rebuildRules();};
$('importRules').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>200000)throw Error('配置文件过大');const obj=JSON.parse(await file.text());const parsed=LabRules.validate(Array.isArray(obj)?obj:obj.rules);rules=parsed;renderRules();rebuildRules();notice('规则已导入');}catch(err){notice('导入失败：'+err.message);}e.target.value='';};
setInterval(()=>{if(window.petAdapting||window.zoneEditor?.editing||!ready||!ruleEngine||!$('autoRules').checked||document.hidden)return;const now=performance.now();const free=now>=manualUntil&&!character.busy(now/1000)&&!window.companion?.performing;const rule=ruleEngine.step(metrics(),now,free);if(rule)fireRule(rule);},100);
$('clearExpressions').onclick=()=>character?.clearExpressions(performance.now()/1000);
$('clearGestures').onclick=()=>character?.clearGestures(performance.now()/1000);
$('idleAfter').onchange=()=>{$('idleAfter').value=Math.min(600,Math.max(2,Number($('idleAfter').value)||20));};
function updateIdleControls(){
 $('autoIdle').disabled=!focusActive || !character?.detached;
 $('idleAfter').disabled=$('autoIdle').disabled || !$('autoIdle').checked;
}
$('autoIdle').onchange=()=>{
 if(!$('autoIdle').checked && detachedByFocus)requestMode('tracking');
 updateIdleControls();
};
updateIdleControls();
$('colors').onchange=()=>{if(model)model.internalModel.renderer._labColorsEnabled=$('colors').checked;};
$('quality').onchange=()=>{if(!model)return;const gl=app.renderer.gl,renderer=model.internalModel.renderer;const size=Math.min(+$('quality').value,gl.getParameter(gl.MAX_TEXTURE_SIZE));if(!renderer._clippingManager)return;renderer.setClippingMaskBufferSize(size);renderer._clippingManager?.setGL(gl);notice('裁剪蒙版 '+size+' × '+size);};
function positionHome(){placement={x:0,y:0,zoom:1};resize();}
$('home').onclick=positionHome;
const canvas=$('canvas');
function cancelGesture(){
 const changed=drag?.moveCharacter&&drag.moved;
 if(drag&&!drag.moveCharacter)window.companion?.endTouch();
 drag=null;canvas.classList.remove('dragging');
 if(changed)window.dispatchEvent(new Event('pet-placement-changed'));
}
let pointerLocked=false;
function lockUI(on){pointerLocked=on===true;cancelGesture();const b=$('lockPet');
 b.textContent='';b.title=pointerLocked?'解锁角色':'锁定角色 · 透明区域允许点击穿透';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(pointerLocked));}
if(window.petDesktop?.onLockProbe){
 window.petDesktop.asset('pointerLock').then(lockUI).catch(e=>notice(e.message,'error'));
 $('lockPet').onclick=async()=>{try{lockUI(await window.petDesktop.asset('pointerLock',!pointerLocked));}catch(e){notice(e.message,'error');}};
 function hitProbe(x,y){
  if(!pointerLocked)return;
  const ui=document.elementFromPoint(x,y)?.closest('#lockPet,#openChat,#focusPet,#topPet,#volumePet,#adjustPet,#aiPet,#switchModelPet,#volumePopover,#galForm,#windowEditor,dialog[open],#zoneEditPanel');
  const r=canvas.getBoundingClientRect();const pass=!ui&&!drag&&!window.zoneEditor?.editing&&!window.zoneEditor?.hit(x-r.left,y-r.top);
  // Main can independently switch to pass-through when the cursor leaves the window.
  window.petDesktop.pointerPass(pass);
 }
 window.petDesktop.onLockProbe(hitProbe);window.addEventListener('mousemove',e=>hitProbe(e.clientX,e.clientY));
}
document.addEventListener('contextmenu',e=>{
 e.preventDefault();
 if(!window.zoneEditor?.editing&&!window.petAdapting&&!pointerLocked&&e.target!==canvas)window.petDesktop?.menu();
});
canvas.addEventListener('pointerdown',e=>{
 if(drag || ![0,2].includes(e.button) || window.zoneEditor?.editing||window.petAdapting||!$('windowEditor').hidden)return;
 const moveCharacter=e.button===(window.companion?.swapButtons?0:2);
 if(pointerLocked&&(moveCharacter||!window.zoneEditor?.hit(...gesturePoint(e))))return;
 drag={id:e.pointerId,button:e.button,x:e.clientX,y:e.clientY,placement:{...placement},moveCharacter,moved:false};
 canvas.setPointerCapture(e.pointerId);e.preventDefault();
 if(!moveCharacter&&ready)window.companion?.beginTouch(...gesturePoint(e));

});
function gesturePoint(e){
 const box=canvas.getBoundingClientRect();return [e.clientX-box.left,e.clientY-box.top];
}
canvas.addEventListener('pointermove',e=>{
 if(!drag || e.pointerId!==drag.id)return;
 if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;
 if(!drag.moved)return;
 if(drag.moveCharacter&&ready){
  canvas.classList.add('dragging');placement.x=drag.placement.x+e.clientX-drag.x;placement.y=drag.placement.y+e.clientY-drag.y;resize();
  const b=model.getBounds(),w=app.screen.width,h=app.screen.height,edge=Math.min(32,w/4,h/4);
  const dx=b.x+b.width<edge?edge-b.x-b.width:b.x>w-edge?w-edge-b.x:0;
  const dy=b.y+b.height<edge?edge-b.y-b.height:b.y>h-edge?h-edge-b.y:0;
  if(dx||dy){placement.x+=dx;placement.y+=dy;resize();}
 }
 else if(ready)window.companion?.stroke(...gesturePoint(e));
});
canvas.addEventListener('pointerup',e=>{
 if(!drag || e.pointerId!==drag.id || e.button!==drag.button)return;
 const {moveCharacter,moved}=drag;cancelGesture();
 if(moved)return;
 if(moveCharacter)window.petDesktop?.menu();
 else if(ready){clickSerial++;}
});
canvas.addEventListener('lostpointercapture',cancelGesture);
canvas.addEventListener('pointercancel',cancelGesture);
$('canvas').addEventListener('wheel',e=>{if(pointerLocked||!ready||window.zoneEditor?.editing)return;e.preventDefault();placement.zoom=Math.max(.4,Math.min(3,placement.zoom*Math.exp(-e.deltaY*.001)));resize();},{passive:false});
(async()=>{try{const r=await fetch('/api/catalog');if(!r.ok)throw new Error('无法读取模型目录');catalog=await r.json();if(!catalog){$('loadMessage').textContent='选择包含运行时模型的 ZIP';notice('等待导入角色');return;}renderCatalog();renderRules();rebuildRules();const check=await fetch('vendor/live2dcubismcore.min.js',{method:'GET'});if(check.ok){await script('vendor/live2dcubismcore.min.js');await load();}else{throw Error('Cubism Core 依赖文件无法读取，请退出角色并重新检测依赖');}}catch(e){diagnostic(e)}})();

window.companionHost={get catalog(){return catalog},get params(){return params},get character(){return character},get ready(){return ready},get bounds(){return model?.getBounds()},get focused(){return focusActive},get metrics(){return metrics()},get manual(){return performance.now()<manualUntil},activate(){lastInput=performance.now();},get typingIdle(){return (performance.now()-lastKey)/1000}};

let calibrationStarted=0;
Object.assign(window.companionHost,{
 stageToModel(x,y){return model.toModelPosition(new PIXI.Point(x,y));},
 modelToStage(x,y){const p=model.internalModel.localTransform.apply(new PIXI.Point(x,y));return model.toGlobal(p);},
 meshIds(){return model?.internalModel.getDrawableIDs?.()||[]},
 meshPart(id){const raw=core?._model,i=model?.internalModel.getDrawableIndex(id);return raw?.parts?.ids[raw?.drawables?.parentPartIndices?.[i]]||'';},
 mesh(id){const im=model?.internalModel;if(!im?.getDrawableIndex)return null;const i=im.getDrawableIndex(id);if(i<0)return null;return {id,vertices:im.getDrawableVertices(i),indices:im.coreModel.getDrawableVertexIndices(i),opacity:im.coreModel.getDrawableOpacity(i),order:im.coreModel.getDrawableRenderOrders()[i]};},
 freeze(on){if(on){calibrationStarted=performance.now()/1000;drag=null;}else if(character){const dt=performance.now()/1000-calibrationStarted;character.modeStart+=dt;character.modeChanged+=dt;for(const e of character.expressions.values()){e.changed+=dt;if(e.expires!==null)e.expires+=dt;}for(const g of character.gestures.values()){g.start+=dt;if(g.expires!==null)g.expires+=dt;}if(character.temporary)character.temporary.start+=dt;lastInput=performance.now();manualUntil=lastInput+700;}},
});

const windowEditor=$('windowEditor');
for(const edge of ['n','s','w','e','nw','ne','sw','se']){
 const grip=document.createElement('i');grip.dataset.edge=edge;grip.style.cursor=edge+'-resize';windowEditor.append(grip);
}
window.petDesktop?.onAdjust?.(enabled=>{cancelGesture();windowEditor.hidden=!enabled;$('adjustPet').setAttribute('aria-pressed',String(enabled));$('adjustPet').title=enabled?'完成窗口调整':'窗口调整模式';$('adjustPet').setAttribute('aria-label',$('adjustPet').title);});
windowEditor.onpointerdown=e=>{
 if(e.button!==0||e.target.closest('button'))return;
 e.preventDefault();windowEditor.setPointerCapture(e.pointerId);
 window.petDesktop?.adjust('start',e.target.dataset.edge||'move');
};
windowEditor.onpointermove=e=>{if(windowEditor.hasPointerCapture(e.pointerId))window.petDesktop?.adjust('move');};
windowEditor.onpointerup=windowEditor.onpointercancel=()=>window.petDesktop?.adjust('end');
$('adjustPet').onclick=()=>{if(!window.petAdapting&&!window.zoneEditor?.editing)window.petDesktop?.adjust('toggle');};
$('finishWindow').onclick=()=>window.petDesktop?.adjust('done');
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!windowEditor.hidden)window.petDesktop?.adjust('done');});
