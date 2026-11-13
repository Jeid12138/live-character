/* Transport-independent decision validation, viseme timeline and smooth layers. */
(function(root){
 const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
 const finite=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
 const fineIds=['CheeckPuff','CheeckPuff2','CheeckPuffR','CheeckPuffL','TongueOut','MouthX','MouthSmile_L','MouthSmile_R','Mouthpucker','MouthFunnel','MouthPuckerWiden','MouthPressLipOpen','MouthRollUpper','MouthRollLower','PoutOffsetXL','PoutOffsetXR'];
 const poseIds=['ParamAngleX','ParamAngleY','ParamAngleZ','ParamBodyAngleX','ParamBodyAngleY','AngleX','AngleY','AngleZ','LeanInput','ParamEyeBallX','ParamEyeBallY'];
 const vowels=['A','I','U','E','O'];
 // Resolve writable controls from this model. The physics solver owns its destinations.
 function rig(catalog,params,mapping={},annotations={}){
  const outputs=new Set(catalog.physicsIO?.Output||[]),inputs=new Set(catalog.physicsIO?.Input||[]);
  const names=new Map((catalog.parameters||[]).map(p=>[p.Id,p.Name]));
  const definitions=new Map((catalog.parameters||[]).map(p=>[p.Id,p]));
  const groups=new Map((catalog.groups||[]).map(g=>[g.Id,g]));
  const reserved=new Set((catalog.parameterGroups||[]).filter(g=>/^(LipSync|EyeBlink)$/i.test(g.Name)).flatMap(g=>g.Ids||[]));
  const vts=new Map((catalog.vts?.tracking||[]).map(r=>[r.OutputLive2D,r.Input]));
  const rows=[];
  for(const [i,id] of params.ids.entries()){
   if(outputs.has(id)||params.minimumValues[i]>=params.maximumValues[i])continue;
   const input=vts.get(id)||'',name=names.get(id)||'';
   const groupId=definitions.get(id)?.GroupId||'';
   const group=[groupId,groups.get(groupId)?.Name||''].join(' ');
   if(reserved.has(id)||/phy|lip.?sync|viseme|物理|口型同步/i.test(group)||/^(Param)?(MouthOpenY?|JawOpen|Eye[LR]Open|Breath|Silence|[AIUEO])$/i.test(id)||/^(MouthOpen|Eye(Left|Right)Open|Voice.*)$/i.test(input))continue;
   let role;
   if(/^(Eye(Left|Right)X|EyeX)$/i.test(input)||/^(Param)?Eye(Ball)?[LR]?X$/i.test(id)||/^(眼球|眼珠|視線|目玉)\s*X$/i.test(name))role='视线横向';
   else if(/^(Eye(Left|Right)Y|EyeY)$/i.test(input)||/^(Param)?Eye(Ball)?[LR]?Y$/i.test(id)||/^(眼球|眼珠|視線|目玉)\s*Y$/i.test(name))role='视线纵向';
   else if(/^(Param)?(BodyAngle|Position)[XYZ]$/i.test(id)||/^BodyAngle[XYZ]$/.test(input)||id==='LeanInput')role='身体姿态';
   else if(/^FaceAngle[XYZ]$/.test(input)||/^(Param)?Angle[XYZ]$/i.test(id))role='头部姿态';
   else if(/^(TongueOut|MouthX|CheekPuff(Left|Right)?)$/i.test(input)||fineIds.includes(id)||/^(Param)?(TongueOut|Chee?ckPuff|CheekPuff|MouthX|MouthSmile)[LR_0-9]*$/i.test(id)||/^(吐舌|伸舌头|鼓脸|鼓腮|舌出し)$/.test(name))role='精细表情';
   else if(/brow|cheek|eyestar|tear|mouthform|smile|眉|頬|脸颊|淚|泪|涙|微笑|星星眼/i.test(id+' '+name)||/brow|cheek|mouth|(?:^|[^a-z])eye(?:s|[^a-z]|$)|眉|頬|嘴|口部|眼部/i.test(group))role='精细表情';
   const meaning=typeof annotations[id]==='string'?annotations[id].trim().slice(0,64):'';
   if(meaning&&!role)role='精细表情';
   const mapped=Object.keys(mapping).find(axis=>mapping[axis]===id);
   if(mapped){const label={AngleX:'头部姿态',AngleY:'头部姿态',AngleZ:'头部姿态',PositionX:'身体姿态',PositionY:'身体姿态',ParamEyeBallX:'视线横向',ParamEyeBallY:'视线纵向'}[mapped];if(label)role=label;}
   if(role)rows.push({id,role,name:meaning||name||id,min:params.minimumValues[i],max:params.maximumValues[i],neutral:params.defaultValues[i],physicsInput:inputs.has(id)});
  }
  return rows;
 }
 function animationInfo(catalog,params){
  const ids=new Set(params.ids);
  const motions=catalog.motions.map(m=>({name:m.name,kind:m.behavior.kind,seconds:m.data.Meta?.Duration,loop:m.data.Meta?.Loop,fadeIn:m.behavior.fadeIn??m.data.FadeInTime,fadeOut:m.behavior.fadeOut??m.data.FadeOutTime,hotkeyFade:m.behavior.hotkey?m.behavior.fade:undefined}));
  const expressions=catalog.expressions.map(e=>{
   const bindings=(e.data.Parameters||[]).filter(p=>ids.has(p.Id)&&Number.isFinite(p.Value));
   return {name:e.name,bound:e.behavior.bound,usable:bindings.length>0,fadeIn:e.behavior.fade,fadeOut:e.data.FadeOutTime,autoOff:e.behavior.autoOff?e.behavior.autoOffSeconds:undefined,bindings:bindings.map(p=>[p.Id,p.Value,p.Blend||'Add'])};
  });
  return {motions,expressions};
 }
 function limitLists(data,limit){
  const size=v=>new TextEncoder().encode(JSON.stringify(v)).length;
  const keys=Object.keys(data).filter(k=>Array.isArray(data[k]));
  const result={...data,truncated:false};
  for(const key of keys)result[key]=data[key].slice();
  while(size(result)>limit){
   const key=keys.filter(k=>result[k].length).sort((a,b)=>size(result[b])-size(result[a]))[0];
   if(!key)break;
   result[key].length=Math.floor(result[key].length*.85);
   result.truncated=true;
  }
  return result;
 }
 function rigTimeline(plan,rows){
  const keys=new Map(rows.map(r=>[r.id,r])),out=[];let prior=-1;
  for(const f of (Array.isArray(plan.keyframes)?plan.keyframes:[]).slice(0,8)){
   if(!Number.isFinite(f?.at)||f.at<=prior||f.at<0||f.at>1)continue;
   const values={};for(const [id,value] of Object.entries(f.values||{})){const r=keys.get(id);if(r&&Number.isFinite(value))values[id]=clamp(value,r.min,r.max);}
   if(Object.keys(values).length){out.push({at:f.at,values});prior=f.at;}
  }
  return out;
 }
 // A single lane for discrete actions; faces and writable parameter keyframes remain layered.
 function gestureInfo(catalog,pairs=[]){
  const motion=name=>catalog.motions.find(m=>m.name===name);
  const duration=m=>Number.isFinite(m?.data?.Meta?.Duration)&&m.data.Meta.Duration>0?m.data.Meta.Duration:0;
  return pairs.filter(p=>motion(p.open)&&motion(p.close)).map(p=>({name:p.name,open:p.open,close:p.close,openSeconds:duration(motion(p.open)),closeSeconds:duration(motion(p.close)),fadeOut:Math.max(0,finite(motion(p.close)?.behavior?.fade,.2))}));
 }
 function actionTimeline(p,catalog,options,duration,report){
  const motions=new Map(catalog.motions.filter(m=>m.behavior?.kind==='once').map(m=>[m.name,m])),names=new Set(options.gestureNames||catalog.gestures||[]),definitions=options.gestureDefinitions||catalog.gestureTiming||[];
  const pairs=new Map(definitions.map(g=>[g.name,g]));
  const explicit=Array.isArray(p.actions),legacy=[];
  if(p.motion!==undefined)legacy.push({kind:'motion',name:p.motion});
  for(const entry of (Array.isArray(p.gestures)?p.gestures:[]).slice(0,3))legacy.push({kind:'gesture',...(typeof entry==='string'?{name:entry}:entry)});
  if(explicit&&legacy.length)report('legacy-actions-ignored','已有 actions 时间轴，忽略重复的 motion/gestures，避免重复执行','actions');
  if(p.actions!==undefined&&!explicit)report('invalid-actions','actions 必须是数组，改用有效旧格式动作','actions');
  const source=explicit?p.actions:legacy,rows=[];
  if(!explicit&&source.length>1)report('legacy-actions-sequenced','旧格式离散动作已按 motion → gestures 依次排队','actions');
  if(source.length>12)report('too-many-actions','只接受前 12 个离散动作','actions');
  for(const [index,a] of source.slice(0,12).entries()){
   if(!a||typeof a!=='object'||!['motion','gesture'].includes(a.kind)){report('invalid-action-kind','忽略未知离散动作类型','actions');continue;}
   let kind=a.kind;const field=explicit?'actions['+index+']':kind==='gesture'?'gestures':'motion',name=a.name;
   if(kind==='gesture'&&!names.has(name)&&a.on!==false&&motions.has(name)){kind='motion';report('motion-channel-corrected','已将 '+name+' 从 gestures 改为一次性 motion',field,name);}
   if(typeof name!=='string'||!(kind==='motion'?motions.has(name):names.has(name))){report(kind==='motion'?'unknown-motion':'unknown-gesture','忽略当前模型不支持的'+(kind==='motion'?'一次性动作 ':'手势 ')+String(name),field,String(name));continue;}
   if(a.at!==undefined&&(!Number.isFinite(a.at)||a.at<0||a.at>60)){report('invalid-action-time','忽略起始时间不在 0–60 秒内的动作 '+name,field,name);continue;}
   if(a.seconds!==undefined&&!(a.seconds===null&&a.persistent===true)&&(!Number.isFinite(a.seconds)||a.seconds<=0||a.seconds>20)){report('invalid-action-duration','忽略持续时间不在 (0,20] 秒内的动作 '+name,field,name);continue;}
   const pair=kind==='gesture'?pairs.get(name):definitions.find(g=>g.open===name||g.close===name),on=kind==='gesture'?a.on!==false:pair?pair.open===name:true;
   const native=kind==='motion'?motions.get(name)?.data?.Meta?.Duration:pair?(on?pair.openSeconds:pair.closeSeconds):0;
   const nativeSeconds=Number.isFinite(native)&&native>0?native:0;
   const returnSeconds=pair?(on?pair.closeSeconds+pair.fadeOut:pair.fadeOut):0;
   rows.push({kind,name,on,requested:a.at,requestedSeconds:a.seconds,seconds:a.seconds??(kind==='motion'?nativeSeconds||duration:duration),nativeSeconds,returnSeconds,persistent:kind==='gesture'&&a.persistent===true,...(pair?{pair:pair.name}:{}),field});
  }
  let cursor=0,priorRequested=-1;const out=[];
  for(const [i,row]of rows.entries()){
   if(row.persistent&&i<rows.length-1){row.persistent=false;report('persistent-action-bounded','手势 '+row.name+' 后还有动作，按本段时长返回，不跨段保持',row.field,row.name);}
   const minimum=row.nativeSeconds+(row.on&&!row.persistent?row.returnSeconds:row.on?0:row.returnSeconds);
   if(row.seconds<minimum){row.seconds=minimum;report('action-native-duration','动作 '+row.name+' 已按原生进入/返回时长延长，未加速原动画',row.field,row.name);}
   row.seconds=Math.max(.1,row.seconds);
   const desired=row.requested??cursor;
   if(row.requested!==undefined&&desired<priorRequested)report('nonmonotonic-action-time','动作时间未递增，按给定顺序向后排 '+row.name,row.field,row.name);
   if(row.requested!==undefined)priorRequested=desired;
   if(desired<cursor-.000001)report(out.at(-1)?.requested===desired?'simultaneous-discrete-actions':'overlapping-discrete-actions','离散动作 '+row.name+' 与前项重叠，已顺延到 '+cursor.toFixed(3)+' 秒',row.field,row.name);
   row.at=Math.max(cursor,desired);
   if(row.at+row.seconds>60){report('action-timeline-limit','动作 '+row.name+' 超出 60 秒演出上限，未加入队列',row.field,row.name);continue;}
   cursor=row.at+row.seconds;out.push(row);
  }
  if(cursor>duration+.000001)report('action-timeline-extended','动作序列需 '+cursor.toFixed(3)+' 秒，本地延长演出，参数关键帧仍按 '+duration+' 秒完成','actions');
  return out.map(({requested,requestedSeconds,field,...row})=>row);
 }
 function validatePlan(p,catalog,params,options={}){
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('演出计划必须是对象');
  const diagnostics=[],report=(code,message,field,id)=>{if(diagnostics.length<64)diagnostics.push({code,message,...(field?{field}:{}),...(id?{id}:{}),profile:catalog.profile});};
  const rows=(catalog.controlRig||rig(catalog,params)).filter(r=>params.ids.includes(r.id)&&!catalog.physicsIO?.Output?.includes(r.id)),byId=new Map(rows.map(r=>[r.id,r])),oldIds=new Set(options.previousParameterIds||[]);
  const out={text:String(p.text||'').slice(0,1200),speech:{instructions:typeof p.speech?.instructions==='string'?p.speech.instructions.trim().slice(0,900):''},emotion:String(p.emotion||'平静').slice(0,80),duration:clamp(finite(p.duration,4),.5,15),activity:clamp(finite(p.activity,.5)),expressions:[],gestures:[],fine:{},pose:{}};
  for(const e of (Array.isArray(p.expressions)?p.expressions:[]).slice(0,5)){
   if(!e||!catalog.expressions.some(x=>x.name===e.name)){report('unknown-expression','忽略未知表情 '+String(e?.name),'expressions',String(e?.name));continue;}
   out.expressions.push({name:e.name,on:e.on!==false,persistent:e.persistent===true,seconds:e.persistent===true?null:clamp(finite(e.seconds,out.duration),.5,20)});
  }
  out.actions=actionTimeline(p,catalog,options,out.duration,report);
  out.actionEnd=out.actions.reduce((end,a)=>Math.max(end,a.at+a.seconds),0);
  // Keep legacy summaries for existing diagnostics/tools; only actions is executed.
  if(out.actions.some(a=>a.kind==='motion'))out.motion=out.actions.find(a=>a.kind==='motion').name;
  out.gestures=out.actions.filter(a=>a.kind==='gesture').map(a=>({name:a.name,on:a.on,persistent:a.persistent,seconds:a.seconds,at:a.at}));
  const invalid=(id,field)=>{const code=!params.ids.includes(id)?oldIds.has(id)?'cross-model-parameter':'unknown-parameter':'unavailable-parameter';report(code,(code==='cross-model-parameter'?'忽略其他皮套参数 ':code==='unknown-parameter'?'忽略当前皮套不存在的参数 ':'忽略不可由 AI 控制的参数 ')+id,field,id);};
  for(const kind of ['fine','pose'])for(const [id,v]of Object.entries(p[kind]||{})){
   const row=byId.get(id);if(!row||!params.ids.includes(id)){invalid(id,kind);continue;}if(typeof v!=='number'||!Number.isFinite(v)){report('invalid-parameter-value','忽略非有限参数值 '+id,kind,id);continue;}
   const actual=row.role==='精细表情'?'fine':'pose';if(actual!==kind)report('parameter-channel-corrected','参数 '+id+' 已归到 '+actual,kind,id);
   out[actual][id]=clamp(v,row.min,row.max);
  }
  for(const f of (Array.isArray(p.keyframes)?p.keyframes:[]))for(const [id,v]of Object.entries(f?.values||{})){if(!byId.has(id)||!params.ids.includes(id))invalid(id,'keyframes');else if(!Number.isFinite(v))report('invalid-parameter-value','忽略关键帧非有限值 '+id,'keyframes',id);}
  out.keyframes=rigTimeline(p,rows);
  return {plan:out,warnings:diagnostics.map(d=>d.message),diagnostics};
 }
 function timeline(data){
  const frames=Array.isArray(data)?data:data?.frames;if(!Array.isArray(frames)||!frames.length||frames.length>120000)throw Error('嘴型文件需要 1–120000 个 frames');
  let last=-1;return frames.map(f=>{if(typeof f.time!=='number'||!Number.isFinite(f.time)||f.time<0||f.time<=last||f.time>7200)throw Error('嘴型时间必须严格递增，单位为秒');last=f.time;const r={time:f.time};for(const k of [...vowels,'silence']){const v=f[k]??(k==='silence'?0:0);if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw Error('嘴型权重须为 0–1');r[k]=v;}return r;});
 }
 function sample(frames,t){
  if(!frames.length||t<frames[0].time||t>frames.at(-1).time)return {A:0,I:0,U:0,E:0,O:0,silence:1};
  let lo=0,hi=frames.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(frames[m].time<=t)lo=m;else hi=m-1;}
  const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],w=clamp((t-a.time)/(b.time-a.time||1)),r={};for(const k of [...vowels,'silence'])r[k]=a[k]+(b[k]-a[k])*w;
  const sum=vowels.reduce((s,k)=>s+r[k],0);if(sum>1)for(const k of vowels)r[k]/=sum;
  return r;
 }
 function activityDelay(base,work,quietFactor,aiActivity){return Math.max(15,base*(1+clamp(work)*Math.max(0,quietFactor-1))*(1.5-clamp(aiActivity)));}
 class Layer{
  constructor(){this.current={};this.target={};this.until=0;this.holdUntil=0;this.last=0;}
  set(values,now,duration,frames=[]){this.target={...values};this.start=now;this.until=now+duration;this.holdUntil=this.until;this.frames=frames;this.progress=null;}
  at(now,base){
   const target={...this.target};if(!this.frames?.length)return target;
   const progress=this.progress===null||this.progress===undefined?clamp((now-this.start)/(this.until-this.start)):clamp(this.progress);
   const keys=new Set(this.frames.flatMap(f=>Object.keys(f.values)));
   for(const id of keys){
    let t=0,v=this.target[id]??base[id]??0;
    for(const f of this.frames){if(!(id in f.values))continue;
     if(progress<=f.at){const k=clamp((progress-t)/(f.at-t||1));v+=(f.values[id]-v)*k*k*(3-2*k);break;}
     v=f.values[id];t=f.at;
    }target[id]=v;
   }return target;
  }
  hold(until){if(Number.isFinite(until))this.holdUntil=Math.max(this.until,until);}
  clear(){this.target={};this.frames=[];this.until=0;this.holdUntil=0;this.progress=null;}
  frame(now,base){const dt=clamp(now-this.last,0,.1);this.last=now;const target=now<Math.max(this.until,this.holdUntil)?this.at(now,base):{};for(const id of new Set([...Object.keys(this.current),...Object.keys(target)])){
    const desired=id in target?target[id]:(base[id]??0),from=this.current[id]??base[id]??0;
    this.current[id]=from+(desired-from)*(1-Math.exp(-dt*9));if(!(id in target)&&Math.abs(this.current[id]-desired)<.001)delete this.current[id];
   }return {...base,...this.current};}
 }
 class Performance{
  constructor(layer,character,onTiming=()=>{}){this.layer=layer;this.character=character;this.onTiming=onTiming;this.owned=[];this.media=false;this.done=true;}
  authoredTime(elapsed){return clamp(this.pivotAuthored+(elapsed-this.pivotElapsed)/this.remainingScale,0,this.authoredEnd);}
  mappedTime(authored){return this.pivotElapsed+(authored-this.pivotAuthored)*this.remainingScale;}
  summary(){return {duration:this.plan.duration,actionEnd:this.plan.actionEnd||0,authoredVisualSpan:this.authoredEnd,audioDuration:this.audioDuration,scale:this.scale,remainingScale:this.remainingScale,effectiveActionEnd:this.actions.reduce((v,a)=>Math.max(v,a.at+a.seconds),0),effectiveVisualSpan:this.endAt,keyframeDuration:this.keyframeEnd,timingMode:this.timingMode,phase:this.phase,notes:this.notes.slice(),...(this.adjustedAt!==undefined?{scaleAdjustedAtAudioTime:this.adjustedAt}:{}),actions:this.actions.map(a=>({...a})),authoredActions:(this.plan.actions||[]).map(a=>({...a}))};}
  notify(){try{this.onTiming(this.summary());}catch{/* reporting must not interrupt playback */}}
  start(plan,now,media={}){
   this.plan=plan;this.startTime=now;this.media=media.media===true;this.done=false;this.audioEnded=false;this.next=0;this.elapsed=0;this.owned=[];this.phase=this.media?'playing':'authored';this.notes=[];
   this.authoredEnd=Math.max(plan.duration,plan.actionEnd||0);this.audioDuration=this.media&&Number.isFinite(media.audioDuration)&&media.audioDuration>0?media.audioDuration:0;
   this.scale=this.audioDuration>this.authoredEnd?this.audioDuration/this.authoredEnd:1;this.remainingScale=this.scale;this.pivotAuthored=0;this.pivotElapsed=0;this.timingMode=this.scale>1?'proportional':'authored';this.adjustedAt=undefined;
   this.actions=(plan.actions||[]).map(a=>({...a,at:a.at*this.scale,seconds:a.seconds*this.scale}));this.endAt=this.authoredEnd*this.scale;this.keyframeEnd=plan.duration*this.scale;
   if(this.audioDuration&&this.audioDuration<this.authoredEnd)this.notes.push('short-audio-tail');
   const end=now+Math.max(this.endAt,this.audioDuration?this.audioDuration+.25:0);
   for(const e of plan.expressions){const seconds=e.persistent?null:this.media?e.seconds*this.scale:e.seconds;this.character.setExpression(e.name,e.on,now,seconds);const state=this.character.expressions.get(e.name);if(e.on&&!e.persistent&&state)this.owned.push({kind:'expression',name:e.name,state,expires:state.expires,held:this.media,untilAuthored:e.seconds,untilElapsed:e.seconds*this.scale});}
   this.layer.set({...plan.pose,...plan.fine},now,this.keyframeEnd,plan.keyframes);
   this.layer.hold(end);this.tick(now,this.media?Math.max(0,media.audioElapsed||0):undefined);this.notify();
  }
  current(row){return row.kind==='expression'?this.character.expressions.get(row.name):[...this.character.gestures.values()].find(g=>g.pair.name===row.name);}
  dispatch(a,now,elapsed){
   const started=now-(elapsed-a.at);
   if(a.kind==='motion'&&!a.pair){if(this.motion&&this.character.temporary===this.motion)this.character.temporary=null;this.character.motion(a.name,started,a.seconds);this.motion=this.character.temporary;if(this.motion)this.motion.until=started+a.seconds;this.motionIndex=this.next-1;return;}
   const name=a.pair||a.name,before=[...this.character.gestures.values()].find(g=>g.pair.name===name);
   this.character.gesture(name,a.on,started,null);
   const state=[...this.character.gestures.values()].find(g=>g.pair.name===name);
   if(a.on&&state?.targetOn){state.expires=a.persistent?started+Math.max(a.seconds,this.endAt-a.at,this.audioDuration?this.audioDuration+.25-a.at:0):started+a.seconds-a.returnSeconds;this.owned.push({kind:'gesture',name,state,expires:state.expires,held:a.persistent,actionIndex:this.next-1,untilElapsed:a.at+a.seconds-a.returnSeconds});}
   // A native pair may queue behind a manually active hand: retain ownership for cancellation.
   if(!state||state===before&&state.queued){const queued=[...this.character.gestures.values()].find(g=>g.queued?.name===name);if(queued)this.owned.push({kind:'queued',name:queued.pair.name,state:queued,queued:queued.queued});}
  }
  tick(now,mediaElapsed){
   if(this.done)return;
   const elapsed=this.audioEnded?this.tailElapsed+Math.max(0,now-this.tailStart):this.media?Number.isFinite(mediaElapsed)?Math.max(0,mediaElapsed):this.elapsed:Math.max(0,now-this.startTime);
   // Playback seeks and stalled frames must not replay expired actions in a burst.
   this.elapsed=Math.max(this.elapsed,elapsed);
   if(this.media)this.layer.progress=clamp(this.authoredTime(this.elapsed)/this.plan.duration);
   for(const row of this.owned){if(row.kind==='queued'||row.kind==='gesture'&&row.held||row.kind==='expression'&&!this.media)continue;const state=this.current(row);if(state!==row.state||!(row.kind==='expression'?state.to>0:state.targetOn)||state.expires!==row.expires)continue;
    if(this.elapsed>=row.untilElapsed-.000001){const at=now-Math.max(0,this.elapsed-row.untilElapsed);if(row.kind==='expression')this.character.setExpression(row.name,false,at);else this.character.gesture(row.name,false,at);}
    else{state.expires=now+row.untilElapsed-this.elapsed;row.expires=state.expires;}
   }
   if(this.motion&&this.character.temporary===this.motion){const a=this.actions[this.motionIndex];if(a){if(this.elapsed>=a.at+a.seconds-.000001)this.character.temporary=null;else this.motion.until=now+a.at+a.seconds-this.elapsed;}}
   while(this.next<this.actions.length&&this.actions[this.next].at<=this.elapsed+.000001){const a=this.actions[this.next++];if(this.elapsed<a.at+a.seconds-.000001)this.dispatch(a,now,this.elapsed);}
   if(this.media&&!this.audioEnded){const holdEnd=now+Math.max(0,Math.max(this.endAt,this.audioDuration?this.audioDuration+.25:0)-this.elapsed);this.layer.hold(holdEnd);}
   else if(this.elapsed>=this.endAt-.000001)this.release(now);
  }
  extend(duration,elapsed,now){
   if(this.done||!this.media||this.audioEnded||!Number.isFinite(duration)||duration<=0||!Number.isFinite(elapsed))return;
   if(Math.abs(duration-this.audioDuration)<.001)return;
   this.elapsed=Math.max(this.elapsed,Math.max(0,elapsed));const pivot=this.authoredTime(this.elapsed),remaining=this.authoredEnd-pivot;
   this.audioDuration=duration;this.scale=Math.max(1,duration/this.authoredEnd);this.adjustedAt=this.elapsed;
   if(remaining>.000001){
    this.pivotAuthored=pivot;this.pivotElapsed=this.elapsed;this.remainingScale=Math.max(1,(duration-this.elapsed)/remaining);this.timingMode=this.elapsed>.000001?'remaining':'proportional';
    for(let i=0;i<this.actions.length;i++){const original=this.plan.actions[i],old=this.actions[i];if(old.at+old.seconds<=this.elapsed+.000001)continue;
     const end=this.mappedTime(original.at+original.seconds);this.actions[i]={...old,at:i<this.next?old.at:Math.max(this.elapsed,this.mappedTime(original.at)),seconds:Math.max(old.nativeSeconds||.1,end-(i<this.next?old.at:Math.max(this.elapsed,this.mappedTime(original.at))))};
    }
    this.endAt=Math.max(this.elapsed,this.mappedTime(this.authoredEnd),...this.actions.map(a=>a.at+a.seconds));
    this.keyframeEnd=pivot>=this.plan.duration?this.keyframeEnd:this.mappedTime(this.plan.duration);
    // Preserve the current keyframe value, then stretch only its remaining progress.
    this.layer.until=now+Math.max(0,this.keyframeEnd-this.elapsed);
    for(const row of this.owned){if(row.kind!=='gesture'||row.held)continue;const a=this.actions[row.actionIndex],state=this.current(row);if(a&&state===row.state&&state.targetOn&&state.expires===row.expires){row.untilElapsed=a.at+a.seconds-a.returnSeconds;state.expires=now+Math.max(0,row.untilElapsed-this.elapsed);row.expires=state.expires;}}
    if(this.motion&&this.character.temporary===this.motion){const a=this.actions[this.motionIndex];if(a)this.motion.until=now+Math.max(0,a.at+a.seconds-this.elapsed);}
   }else if(!this.notes.includes('late-duration-after-timeline'))this.notes.push('late-duration-after-timeline');
   if(this.elapsed>0&&!this.notes.includes('late-retime-partial'))this.notes.push('late-retime-partial');
   if(this.endAt>duration+.000001&&!this.notes.includes('short-audio-tail'))this.notes.push('short-audio-tail');
   const end=now+Math.max(0,Math.max(this.endAt,duration+.25)-this.elapsed);this.layer.hold(end);
   for(const row of this.owned){const state=this.current(row);if(row.held&&state===row.state&&state.expires===row.expires&&(row.kind==='expression'?state.to>0:state.targetOn)){if(row.kind==='expression'){row.untilElapsed=this.mappedTime(row.untilAuthored);state.expires=now+Math.max(0,row.untilElapsed-this.elapsed);}else state.expires=Math.max(state.expires??end,end);row.expires=state.expires;}}
   this.tick(now,this.elapsed);this.notify();
  }
  end(now,elapsed){
   if(this.done||!this.media||this.audioEnded)return;
   this.tick(now,Number.isFinite(elapsed)?elapsed:this.audioDuration||this.elapsed);this.audioEnded=true;this.tailElapsed=this.elapsed;this.tailStart=now;this.phase='tail';this.notify();
   if(this.elapsed>=this.endAt-.000001)this.release(now);else this.layer.hold(now+this.endAt-this.elapsed);
  }
  release(now,cancel=false){
   if(this.done)return;this.next=this.actions.length;this.done=true;this.layer.clear();
   for(const row of this.owned){const state=this.current(row);if(row.kind==='queued'){if(state===row.state&&state.queued===row.queued)state.queued=null;continue;}if((cancel||row.held)&&state===row.state&&state.expires===row.expires){if(row.kind==='expression')this.character.setExpression(row.name,false,now);else this.character.gesture(row.name,false,now);}}
   if(cancel&&this.motion&&this.character.temporary===this.motion)this.character.temporary=null;this.media=false;this.phase=cancel?'cancelled':'finished';this.notify();
  }
 }

 const api={rig,animationInfo,gestureInfo,actionTimeline,limitLists,validatePlan,timeline,sample,activityDelay,Layer,Performance,fineIds,poseIds,vowels};if(typeof module!=='undefined')module.exports=api;else root.CompanionCore=api;
})(globalThis);
