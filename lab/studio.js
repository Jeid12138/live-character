'use strict';
(()=>{
 const desktop=window.petDesktop,H=window.companionHost;
 for(const id of ['saveCompanion','saveVoice','assetAccept','firstModel'])if($(id))$(id).dataset.ui='primary';
 const cost='调用 AI 会消耗模型 tokens';
 function hint(node,text=cost){const el=document.createElement('small');el.className='token-note';el.textContent=text;node.after(el);}
 hint($('autoStart').closest('label'),'开启后，DSH 启动时会检查依赖并启动角色；若需要安装或修复，会先征求确认，完成后请手动启动。');
 for(const id of ['tryDecision','chatForm','autonomy','touchAI'])hint($(id).closest('label')||$(id));
 const aiBtn=document.createElement('button');aiBtn.textContent='AI 适配触摸区域';$('zoneReset').parentElement.after(aiBtn);hint(aiBtn);
 const dialog=$('assetDialog'),options=$('assetOptions');
 function message(err){notice(String(err.message||err),'error');$('loadMessage').textContent=String(err.message||err);}
 function ask(title,note,items,accept,onAccept,allowBrowse=false){
  document.getElementById('assetExtra')?.replaceChildren();$('assetDelete').hidden=true;$('assetPurgeRow').hidden=true;$('assetNote').removeAttribute('data-level');$('assetAccept').removeAttribute('data-level');$('assetPurge').checked=false;$('assetTitle').textContent=title;$('assetNote').textContent=note;options.replaceChildren();
  for(const label of items){const o=document.createElement('option');o.textContent=label?.label??label;o.disabled=!allowBrowse&&!!label?.missing;options.append(o);}
  const first=Array.from(options.options).findIndex(o=>!o.disabled);options.selectedIndex=first;$('assetAccept').disabled=items.length>0&&first<0;options.hidden=!items.length;$('assetAccept').textContent=accept;if(accept.includes('删除'))$('assetAccept').dataset.level='error';$('assetBrowse').hidden=!allowBrowse;
  $('assetAccept').onclick=async()=>{const i=options.selectedIndex;dialog.close();try{await onAccept(i);}catch(err){message(err);}};
  if(!dialog.open){if(desktop?.asset)dialog.show();else dialog.showModal();}
 }
 $('assetCancel').onclick=()=>dialog.close();
 const characterLabel=c=>{const last=Math.max(0,...c.models.map(m=>m.lastUsed||0));return c.name+' · '+c.models.length+' 个模型 · 最近使用 '+(last?new Date(last).toLocaleString():'未使用')+' · '+c.id;};
 const extra=document.createElement('div');extra.id='assetExtra';options.after(extra);
 function field(title,control){const row=document.createElement('label');row.append(document.createTextNode(title),control);extra.append(row);return control;}
 function resetExtra(){extra.replaceChildren();}
 async function changeCharacter(action){
  if(!await beforeChange())return;
  window.petChangingMemory=true;window.petAdapting=true;desktop?.bubble?.({hidden:true});
  const progress=$('adaptDialog');progress.querySelector('h2').textContent='正在更新角色与模型…';$('adaptMessage').textContent='正在保存角色资产，完成后将恢复互动。';$('adaptDismiss').hidden=true;progress.showModal();
  try{await action();location.reload();}
  catch(error){window.petChangingMemory=false;window.petAdapting=false;progress.close();window.companion.schedule();throw error;}
 }
 async function beforeChange(){
  if(window.zoneEditor.editing){window.zoneEditor.requestClose();return false;}
  if(window.companion.chatState().busy)throw Error('请等待当前回复结束');
  rememberScene();window.companion.flushMemory();return true;
 }
 async function browse(targetId){
  if(!await beforeChange())return;
  if(dialog.open)dialog.close();
  const entries=await desktop.asset('browse');if(!entries)return;
  const info=await desktop.asset('library');
  resetExtra();
  ask('选择模型归属','同一角色的所有模型共用记忆、会话和性格。模型导入后不能拆分或移动到其他角色。',[],'下一步',()=>confirmImport());
  const owner=document.createElement('select');owner.add(new Option('新建角色',''));
  for(const c of info.characters)owner.add(new Option(characterLabel(c),c.id));
  owner.value=targetId||info.current||'';field('角色归属',owner);
  const name=document.createElement('input');name.maxLength=70;name.value=entries[0].split('/').pop().replace(/\.model3\.json$/i,'');const nameRow=document.createElement('label');nameRow.append(document.createTextNode('新角色名称'),name);extra.append(nameRow);
  owner.onchange=()=>nameRow.hidden=!!owner.value;owner.onchange();
  const chosen=[];
  for(const entry of entries){
   const row=document.createElement('label'),check=document.createElement('input'),label=document.createElement('input');check.type='checkbox';check.checked=true;label.value=entry.split('/').pop().replace(/\.model3\.json$/i,'');label.maxLength=70;label.setAttribute('aria-label','模型名称 · '+entry);
   row.append(check,document.createTextNode(entry),label);extra.append(row);chosen.push({entry,check,label});
  }
  function confirmImport(){
   const selected=chosen.filter(item=>item.check.checked).map(item=>({entry:item.entry,label:item.label.value.trim()}));
   if(!selected.length||selected.some(item=>!item.label))throw Error('请选择入口并填写模型名称');
   const characterId=owner.value,characterName=characterId?info.characters.find(c=>c.id===characterId).name:name.value.trim();
   if(!characterName)throw Error('请填写角色名称');
   resetExtra();
   const ownership=document.createElement('input');ownership.type='checkbox';
   ask('确认导入','模型「'+selected.map(item=>item.label).join('、')+'」将加入角色「'+characterName+'」。共享该角色的会话、记忆和性格。导入后会确认当前形象并主动互动一次，调用 AI 会消耗模型 tokens；遵守 AI 总开关和自动额度。导入后不可拆分或移动，只能删除。',[],'确认导入',async()=>{
    if(!ownership.checked)throw Error('请确认模型归属不可更改');
    await changeCharacter(async()=>{const result=await desktop.asset('importModels',{entries:selected,characterId:characterId||undefined,name:characterName,confirmed:true});sessionStorage.setItem('lc-import-adapt',result.profile);sessionStorage.setItem('lc-import-result',JSON.stringify(result));if(result.modelChange)sessionStorage.setItem('lc-model-change',JSON.stringify(result.modelChange));});
   });
   const confirmRow=document.createElement('label');confirmRow.append(ownership,document.createTextNode('我已确认：导入后不可拆分或移动到其他角色'));extra.append(confirmRow);$('assetAccept').disabled=true;ownership.onchange=()=>{$('assetAccept').disabled=!ownership.checked;};
  }
 }
 async function choose(){
  const info=await desktop.asset('status');if(!info.core)throw Error('Cubism Core 依赖未就绪，请退出角色并重新检测依赖');
  if(!info.characters.length)return browse();
  resetExtra();
  ask('切换角色与模型','选角色后仅显示它的模型。同角色切换后会主动互动并记录形象，继续原会话。调用 AI 会消耗模型 tokens；遵守 AI 总开关和自动额度。',[],'切换',async()=>{
   await changeCharacter(async()=>{const result=await desktop.asset('selectModel',{characterId:owners.value,profile:models.value});if(result.modelChange)sessionStorage.setItem('lc-model-change',JSON.stringify(result.modelChange));});
  });
  const owners=document.createElement('select'),models=document.createElement('select');
  for(const c of info.characters)owners.add(new Option(characterLabel(c),c.id));
  owners.value=info.current||info.characters[0].id;field('角色',owners);field('模型',models);
  owners.onchange=()=>{
   const c=info.characters.find(c=>c.id===owners.value);models.replaceChildren();
   for(const m of [...c.models].sort((a,b)=>b.lastUsed-a.lastUsed)){const option=new Option(m.label+(m.profile===info.active?.profile&&c.id===info.current?'（当前）':'')+(m.missing?'（资源缺失）':''),m.profile);option.disabled=m.missing;models.add(option);}
   models.value=c.models.find(m=>m.profile===c.lastModel&&!m.missing)?.profile||c.models.find(m=>!m.missing)?.profile||'';
  };owners.onchange();
  const add=document.createElement('button');add.textContent='添加模型';add.onclick=safe(()=>browse(owners.value));extra.append(add);
  const remove=document.createElement('button');remove.textContent='删除所选模型';remove.dataset.level='error';extra.append(remove);
  remove.onclick=safe(async()=>{
   const c=info.characters.find(c=>c.id===owners.value),m=c.models.find(m=>m.profile===models.value);
   if(c.models.length===1)throw Error('这是最后一个模型，请使用删除角色');
   resetExtra();ask('删除模型','确定删除「'+m.label+'」及它的触摸区、参数适配等模型配置？角色的记忆、会话和性格保留。',[],'确认删除',async()=>{await changeCharacter(()=>desktop.asset('deleteModel',{characterId:c.id,profile:m.profile,confirmed:true}));});$('assetNote').dataset.level='error';
  });
  const deleteRole=document.createElement('button');deleteRole.textContent='删除所选角色';deleteRole.dataset.level='error';extra.append(deleteRole);
  deleteRole.onclick=safe(()=>{
   const c=info.characters.find(c=>c.id===owners.value);
   resetExtra();ask('删除角色','确定删除「'+c.name+'」的全部模型、配置和记忆？DSH 会话将归档。此操作不可撤销。',[],'确认删除角色',async()=>{await changeCharacter(()=>desktop.asset('deleteCharacter',{characterId:c.id,confirmed:true}));});$('assetNote').dataset.level='error';
  });
 }
 const safe=fn=>()=>Promise.resolve().then(fn).catch(message);

 if(desktop?.asset){
  $('switchModelPet').onclick=$('firstModel').onclick=$('switchModel').onclick=$('switchModelRender').onclick=safe(choose);$('assetBrowse').onclick=safe(browse);
  desktop.asset('status').then(a=>{if(a.notice)notice(a.notice,'warning');topUI(a.top);}).catch(message);
  function topUI(on){$('alwaysTop').checked=on;$('topPet').setAttribute('aria-pressed',String(on));$('topPet').title=on?'窗口已置顶 · 点击取消':'窗口置顶';$('topPet').setAttribute('aria-label',$('topPet').title);}
  const setTop=async on=>{if(window.petAdapting||window.zoneEditor.editing)return;await desktop.asset('top',on);topUI(on);};
  $('alwaysTop').onchange=safe(()=>setTop($('alwaysTop').checked));
  $('topPet').onclick=safe(()=>$('topPet').disabled?null:setTop(!$('alwaysTop').checked));
  desktop.onTop?.(topUI);
 }
 function applyPrefs(v){window.liveAI=v.ai!==false;$('autoStart').checked=v.autoStart===true;$('processContext').checked=v.processContext===true;$('aiMaster').textContent=window.liveAI?'关闭全部 AI 调用':'开启全部 AI 调用';$('aiPet').setAttribute('aria-pressed',String(window.liveAI));$('aiPet').title=window.liveAI?'AI 调用已开启 · 点击关闭':'AI 调用已关闭 · 点击开启';$('aiPet').setAttribute('aria-label',$('aiPet').title);}
 if(desktop?.asset){
  const refresh=async()=>applyPrefs(await desktop.asset('preferences'));
  refresh().catch(message);
  for(const key of ['autoStart','processContext'])$(key).onchange=safe(async()=>{await desktop.asset('preference',{key,enabled:$(key).checked});await refresh();});
  let switchingAI=false;
  const toggleAI=safe(async()=>{if(switchingAI)return;switchingAI=true;$('aiMaster').disabled=$('aiPet').disabled=true;try{const enabled=!window.liveAI;if(!enabled)window.companion.stop();await desktop.asset('preference',{key:'ai',enabled});}finally{await refresh().catch(message);switchingAI=false;$('aiMaster').disabled=$('aiPet').disabled=false;}});
  $('aiMaster').onclick=$('aiPet').onclick=toggleAI;
 }
 const links={root:'资产库',model:'当前模型',memory:'角色记忆',setting:'角色与模型配置',legacy:'旧资产备份',core:'Cubism Core','voice-models':'本地语音模型'};
 for(const [key,title] of Object.entries(links)){
  const button=document.createElement('button');button.textContent='打开'+title;if(key==='legacy'){button.id='openLegacy';button.hidden=true;}button.onclick=safe(()=>desktop.asset('openFolder',key));$('folderLinks').append(button);
 }
 const card=document.createElement('section');card.id='characterCard';$('companionPanel').prepend(card);
 async function refreshCharacter(){
  const info=await desktop.asset('library'),c=info.characters.find(c=>c.id===info.current);card.replaceChildren();if($('openLegacy'))$('openLegacy').hidden=!info.hasLegacy;
  if(!c)return;
  const title=document.createElement('h3');title.textContent=c.name;
  const description=document.createElement('p');description.textContent=c.id+' · '+c.models.length+' 个模型 · 同一会话与性格';
  const renameInput=document.createElement('input');renameInput.value=c.name;renameInput.maxLength=70;renameInput.setAttribute('aria-label','角色名称');
  const renameButton=document.createElement('button');renameButton.textContent='修改角色名';renameButton.onclick=safe(async()=>{await desktop.asset('renameCharacter',{characterId:c.id,name:renameInput.value});await refreshCharacter();});
  const add=document.createElement('button');add.textContent='添加模型';add.onclick=safe(()=>browse(c.id));
  card.append(title,description,renameInput,renameButton,add);
  window.petPersonaLinked=false;$('persona').disabled=false;$('persona').removeAttribute('aria-disabled');

 }
 if(desktop?.asset)refreshCharacter().catch(message);
 $('changeAssetRoot').onclick=safe(async()=>{if(await desktop.asset('relocate'))location.reload();});
 const fields=['galFont','galOpacity','galColor','bubbleFont','bubbleTime','bubbleAutoTime','bubbleReadSpeed','bubbleExtraTime','bubbleColor','bubbleInk','bubbleTypewriter','bubbleTypingSpeed','bubbleReadReserve','bubbleSpeechTail','balanceEnabled','balanceUnit','balanceLimit','balanceMinutes','balanceLine'];
 function settings(){return Object.fromEntries(fields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));}
 function valid(values){
  if(!values||typeof values!=='object')throw Error('气泡或余额配置无效');
  for(const id of fields){if((id.startsWith('gal')||['bubbleAutoTime','bubbleReadSpeed','bubbleExtraTime','bubbleTypewriter','bubbleTypingSpeed','bubbleReadReserve','bubbleSpeechTail'].includes(id))&&values[id]===undefined)continue;const el=$(id),v=values[id];let ok;
   if(el.type==='checkbox')ok=typeof v==='boolean';
   else if(el.type==='number')ok=v!==''&&Number.isFinite(Number(v))&&+v>=+el.min&&+v<=+el.max;
   else if(el.type==='color')ok=/^#[0-9a-f]{6}$/i.test(v);
   else if(el.tagName==='SELECT')ok=[...el.options].some(o=>o.value===v);
   else ok=typeof v==='string'&&v.length<=120;
   if(!ok)throw Error('设置值无效：'+id);
  }
 }
 function apply(values){valid(values);for(const id of fields){if(values[id]===undefined)continue;if($(id).type==='checkbox')$(id).checked=values[id];else $(id).value=values[id];}save();}
 function styleGal(){const f=$('galForm');f.style.fontSize=$('galFont').value+'px';f.style.backgroundColor=$('galColor').value+Math.round(2.55*+$('galOpacity').value).toString(16).padStart(2,'0');}
 styleGal();
 let due=0,low=false,balanceBusy=false;
 function save(){const s=settings();valid(s);petStore.setItem('studio-options',JSON.stringify(s));due=0;low=false;window.studioPositionBubble?.();window.refreshBubbleTiming?.();styleGal();}
 try{const saved=JSON.parse(petStore.getItem('studio-options'));if(saved)apply(saved);}catch{}
 for(const id of fields)$(id).onchange=safe(save);
 window.studioSettings={capture:settings,validate:valid,apply};
 window.studioBubbleSeconds=text=>window.LiveBubble?.seconds?.(text,{auto:$('bubbleAutoTime').checked,speed:+$('bubbleReadSpeed').value,minimum:+$('bubbleTime').value,extra:+$('bubbleExtraTime').value});
 const bubble=$('petBubble');

 function fallbackBubbleFit({font,maxWidth,maxHeight,measure}){
  let size=font,box=measure(maxWidth,size,false);while(box.height>maxHeight&&size>9)box=measure(maxWidth,--size,false);
  if(box.height>maxHeight)box=measure(maxWidth,size,true);return {width:Math.ceil(box.width),height:Math.ceil(box.height)};
 }
 window.studioPositionBubble=()=>{
  bubble.style.setProperty('--bubble-paper',$('bubbleColor').value);bubble.style.color=$('bubbleInk').value;
  const native=document.documentElement.classList.contains('pet-only')&&typeof desktop?.bubble==='function';
  bubble.classList.toggle('native-bubble',native);
  if(bubble.hidden){desktop?.bubble?.({hidden:true});return;}
  const b=H.bounds,w=$('stage').clientWidth,h=$('stage').clientHeight;
  const head=window.zoneEditor.zones.find(z=>/头部|頭|head/i.test(z.name));
  const r=head&&window.zoneEditor.resolve(head),p=r&&H.modelToStage(r.x+r.w/2,r.y);
  const anchor={x:p?.x??(b?b.x+b.width/2:w/2),y:p?.y??b?.y??h/2};
  if(native){desktop.bubble({text:bubble.textContent,...window.companion?.bubblePresentation?.(),font:+$('bubbleFont').value,paper:$('bubbleColor').value,ink:$('bubbleInk').value,anchor});return;}
  const box=(window.LiveBubble?.fit||fallbackBubbleFit)({text:bubble.textContent,font:+$('bubbleFont').value,maxWidth:Math.max(40,w-16),maxHeight:Math.max(30,h-16),measure:(width,font,compact)=>{
   bubble.style.maxWidth=width+'px';bubble.style.fontSize=font+'px';bubble.style.whiteSpace=compact?'normal':'pre-wrap';const r=bubble.getBoundingClientRect();return {width:r.width,height:r.height};
  }});
  bubble.style.left=Math.max(box.width/2+4,Math.min(w-box.width/2-4,anchor.x))+'px';
  bubble.style.top=Math.max(3,Math.min(h-box.height-4,anchor.y-box.height-13))+'px';
 };
 window.studioRevealBubble=p=>{if(document.documentElement.classList.contains('pet-only'))desktop?.bubble?.({progress:true,...p});};
 setInterval(()=>{if(!bubble.hidden&&!window.petAdapting)window.studioPositionBubble();},120);
 $('bubbleTest').onclick=()=>window.companion.bubble('我在这里，慢慢写。今天也一起把喜欢的事情做好吧。台词变长时，气泡会自动伸展，留出足够的阅读时间。');
 new ResizeObserver(()=>{window.studioPositionBubble();}).observe($('stage'));
 async function query(manual=false){
  if(balanceBusy||window.petAdapting)return;balanceBusy=true;
  due=Date.now()+Math.max(1,+$('balanceMinutes').value||10)*60000;
  try{const r=await fetch('/api/balance',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'companion'},body:'{}'});
   const d=await r.json();if(!r.ok)throw Error(d.error||'余额查询失败');
   const w=d.wallets.find(w=>w.currency===$('balanceUnit').value);if(!w)throw Error('没有所选币种的钱包');
   const amount=w.total.toFixed(2);feedback($('balanceResult'),d.source+' · '+amount+' '+w.currency+' · '+new Date().toLocaleTimeString());
   const warn=w.total<+$('balanceLimit').value;
   if(!window.petAdapting&&H.ready&&((warn&&!low)||manual))window.companion.bubble(warn?$('balanceLine').value.replaceAll('{amount}',amount).replaceAll('{currency}',w.currency):'当前余额 '+amount+' '+w.currency);
   low=warn;
  }catch(err){feedback($('balanceResult'),err.message,'error');}finally{balanceBusy=false;}
 }
 $('balanceNow').onclick=()=>query(true);setInterval(()=>{if(H.ready&&$('balanceEnabled').checked&&Date.now()>=due)query();},2000);
 const axes=['AngleX','AngleY','AngleZ','PositionX','PositionY','ParamEyeBallX','ParamEyeBallY'];
 function mappings(obj){const out={};for(const k of axes)if(typeof obj?.[k]==='string'&&params.ids.includes(obj[k])&&!catalog.physicsIO?.Output?.includes(obj[k]))out[k]=obj[k];return out;}
 function rememberScene(){
  if(!ready||window.petChangingMemory)return;const scene={pins:[...locks],view,placement,mode:character.mode,expressions:[...character.expressions].filter(([n,e])=>e.to>0&&e.expires===null&&workExpressions.get(n)!==e).map(([n])=>n),gestures:[...character.gestures.values()].filter(g=>g.targetOn&&g.expires===null).map(g=>g.pair.name)};
  petStore.setItem('pet-scene',JSON.stringify(scene));
 }
 let sceneTimer;
 for(const event of ['change','click','input','wheel'])document.addEventListener(event,()=>{
  if(!ready||window.petAdapting)return;
  if(window.zoneEditor.editing)return message(Error('正在调整触摸区域，请先保存或取消'));clearTimeout(sceneTimer);sceneTimer=setTimeout(rememberScene,300);
 });
 window.addEventListener('beforeunload',rememberScene);
 window.addEventListener('pet-placement-changed',rememberScene);
 function report(lastAttempt){
  if(!ready)return;
  const zones=window.zoneEditor.exportSettings(),caps=window.companion.capabilities();
  const key='adaptation-report-v1';
  let prior;try{prior=JSON.parse(petStore.getItem(key));}catch{}
  const history=(prior?.history||[prior?.lastAttempt].filter(Boolean)).map(item=>({version:item.version||'旧版（未记录）',...item}));
  if(lastAttempt){lastAttempt={version:'0.12.36',...lastAttempt};history.push(lastAttempt);}
  const lastByKind={...prior?.lastByKind};
  for(const item of history)if(['parameters','touch'].includes(item.kind))lastByKind[item.kind]=item;
  const inRig=new Set(catalog.controlRig.map(row=>row.id)),metadata=new Map(catalog.parameters.map(p=>[p.Id,p]));
  const omissions=params.ids.flatMap((id,i)=>inRig.has(id)?[]:[{id,group:metadata.get(id)?.GroupId,min:params.minimumValues[i],max:params.maximumValues[i],neutral:params.defaultValues[i],physicsOutput:catalog.physicsIO.Output.includes(id)}]);
  const data={characterId:window.petCharacterId,settingsScope:'model',entry:catalog.entry,model3Count:catalog.model3Count,rigOmissions:omissions,version:'0.12.36',profile:catalog.profile,parameters:params.ids.length,groups:(catalog.groups||[]).length,
   rig:catalog.controlRig.length,fine:catalog.controlRig.filter(r=>r.role==='精细表情').length,
   physicsOutputs:catalog.physicsIO.Output.length,motions:catalog.motions.map(m=>[m.name,m.behavior.kind]),
   expressions:catalog.expressions.map(e=>[e.name,e.behavior.bound?'作者声明或热键':'扫描发现']),
   hitAreas:catalog.hitAreas.length,zones:zones.zones.map(z=>({name:z.name,anchor:z.anchor?.id,part:z.anchor?.id.startsWith('part/')?z.anchor.id.slice(5):z.anchor?H.meshPart(z.anchor.id):null})),zonesSaved:!!petStore.getItem(zones.signature),editing:window.zoneEditor.editing,
   capabilityBytes:new TextEncoder().encode(JSON.stringify(caps)).length,truncated:caps.truncated,lastAttempt:lastAttempt||prior?.lastAttempt||null,history:history.slice(-5),lastByKind};
  const output=JSON.stringify(data,null,2);$('adaptReport').textContent=output;petStore.setItem(key,JSON.stringify(data));
 }
 window.addEventListener('pet-zones-changed',()=>report());
 // Import adaptation can leave an editable touch draft. Do not race its model
 // calls, modal choice or draft review; consume this interaction only once clear.
 function queueAppearance(event){
  if(event.characterId!==window.petCharacterId||event.profile!==catalog.profile)return;
  window.petAppearancePending=true;
  const timer=setInterval(()=>{
   if(event.characterId!==window.petCharacterId||event.profile!==catalog.profile){clearInterval(timer);window.petAppearancePending=false;return;}
   if(window.petAdapting||window.petChangingMemory||window.zoneEditor.editing||dialog.open||$('adaptDialog').open||window.companion.chatState().busy)return;
   clearInterval(timer);window.petAppearancePending=false;
   void window.companion.modelChanged(event,()=>artwork(true)).catch(message);
  },250);
 }
 function onReady(){
  try{window.petTracking=mappings(JSON.parse(petStore.getItem('tracking-map')));refreshPerformanceRig();const s=JSON.parse(petStore.getItem('pet-scene'));if(s){
   for(const [id,v] of s.pins)if(params.ids.includes(id)&&Number.isFinite(v))locks.set(id,v);
   view=s.view;placement=s.placement;resize();renderParams();requestMode(s.mode);
   const now=performance.now()/1000;for(const e of s.expressions)character.setExpression(e,true,now);for(const g of s.gestures)character.gesture(g,true,now);
  }}catch{}
  const switched=sessionStorage.getItem('lc-model-change');sessionStorage.removeItem('lc-model-change');
  if(switched){try{queueAppearance(JSON.parse(switched));}catch(error){message(error);}}
  const imported=sessionStorage.getItem('lc-import-adapt');sessionStorage.removeItem('lc-import-adapt');
  report();
  try{const result=JSON.parse(sessionStorage.getItem('lc-import-result'));sessionStorage.removeItem('lc-import-result');if(result?.profile===catalog.profile)notice('已加入角色「'+result.characterName+'」 · 本次导入 '+result.importedCount+' 个模型，共 '+result.modelCount+' 个模型；可在“切换模型”中选择。');}catch{}
  if(imported===catalog.profile){
   ask('为此模型适配参数和触摸区域？','AI 将读取当前模型的参数、画面和贴图，分别适配演出参数和触摸区域，并按模型保存。'+cost+'。可跳过，稍后分别适配。两项各发起一次请求。',[],'开始两项适配',()=>adapt('both','import'));
  }
 }
 window.addEventListener('pet-ready',onReady);if(ready)onReady();
 $('adaptDialog').oncancel=e=>e.preventDefault();
 async function artwork(previewOnly=false){
  const side=640;
  function sheet(){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=side;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#dce4e7';ctx.fillRect(0,0,side,side);return ctx;
  }
  const preview=sheet(),atlas=sheet(),pos=model.position.clone(),scale=model.scale.clone();
  try{
   const bounds=model.getBounds(),screen=app.screen;
   const ratio=Math.min(screen.width/bounds.width,screen.height/bounds.height)*.96;
   model.scale.set(scale.x*ratio,scale.y*ratio);
   const full=model.getBounds();model.position.set(pos.x+(screen.width-full.width)/2-full.x,pos.y+(screen.height-full.height)/2-full.y);
   app.renderer.render(app.stage);
   const canvas=$('canvas'),k=side/Math.max(canvas.width,canvas.height);
   preview.drawImage(canvas,(side-canvas.width*k)/2,(side-canvas.height*k)/2,canvas.width*k,canvas.height*k);
  }finally{model.position.copyFrom(pos);model.scale.copyFrom(scale);app.renderer.render(app.stage);}
  if(previewOnly)return [preview.canvas.toDataURL('image/jpeg',.86)];
  const textures=model.textures||[],cols=Math.ceil(Math.sqrt(textures.length)),cell=side/cols;
  if(!textures.length)throw Error('无法读取当前角色的贴图');
  textures.forEach((t,i)=>{
   const source=t.baseTexture?.resource?.source;if(!source?.width||!source.height)throw Error('角色贴图尚未就绪');
   const k=cell/Math.max(source.width,source.height);atlas.drawImage(source,(i%cols)*cell,Math.floor(i/cols)*cell,source.width*k,source.height*k);
  });
  return [preview,atlas].map(ctx=>ctx.canvas.toDataURL('image/jpeg',.86));
 }
 async function runAdaptation(kind,initiatedFrom){
  const start=performance.now(),diagnostic={kind,initiatedFrom,requestSent:false,httpStatus:null,offered:0,accepted:0,reasons:{}};
  let phase='prepare';
  try{
   const cfg=window.companion.config;
   const payload={event:{type:'adapt',kind},inference:{model:cfg.model,mode:cfg.reasonMode,cap:cfg.reasonCap}};
   const meshIds=new Set();
   if(kind==='mouth'){
    const names=new Map(catalog.parameters.map(p=>[p.Id,p.Name||''])),known=new Set([...(catalog.parameterGroups||[]).filter(g=>g.Name==='LipSync').flatMap(g=>g.Ids||[]),...(catalog.vts?.tracking||[]).filter(r=>Object.hasOwn(LCSpeech.source({}),r.Input)).map(r=>r.OutputLive2D)]);
    const parameters=params.ids.filter(id=>!catalog.physicsIO.Output.includes(id)&&(known.has(id)||/mouth|jaw|viseme|唇|嘴|口型|^(?:Param)?[AIUEO](?:\s|$)/i.test(id+' '+names.get(id)))).slice(0,240).map(id=>{const i=params.ids.indexOf(id);return {id,name:names.get(id),min:params.minimumValues[i],max:params.maximumValues[i],neutral:params.defaultValues[i]};});
    payload.parameters=parameters;payload.inputs=Object.keys(LCSpeech.source({}));payload.current=window.mouthProfile.capture();payload.vts=catalog.vts.tracking;diagnostic.offered=parameters.length;
    payload.instruction='独立适配音频口型，不处理人格、触摸、精细表情或全身动作。仅选 parameters 中有明确口型证据的真实 ID，没有依据不添加。返回 JSON {bindings:[{id,input,enabled:true,mode:"linear或centered",inputMin:0,inputMax:1,outputMin:0,outputMax:1,neutral:0}]}。input 必须来自 inputs，输出范围与中立值必须在当前参数 min/max 内；优先保留 VTS 作者映射。centered 用于有正负方向的输入，inputMin<0、inputMax>0；其余用 linear。不要强制凑齐 AIUEO 或 VB 全套。';
   }else if(kind==='parameters'){
    const meta=new Map(catalog.parameters.map(p=>[p.Id,p]));
    const existing=new Set(catalog.controlRig.map(row=>row.id));
    const candidates=CompanionCore.rig(catalog,params,{},Object.fromEntries(params.ids.map(id=>[id,id])))
     .sort((a,b)=>Number(existing.has(a.id))-Number(existing.has(b.id))).slice(0,40);
    diagnostic.inputCandidates=candidates.length;
    payload.capabilities=CompanionCore.limitLists({parameters:candidates.map(row=>[row.id,meta.get(row.id)?.Name,meta.get(row.id)?.GroupId,row.min,row.max,row.neutral]),groups:catalog.groups,tracking:catalog.vts.tracking,physicsOutputs:catalog.physicsIO.Output,reservedGroups:catalog.parameterGroups,rig:catalog.controlRig,...CompanionCore.animationInfo(catalog,params)},48000);
    payload.axes=axes;
    payload.instruction='为当前皮套建立日常演出参数说明，供 DeepSeek 后续演出使用。参数行是 ID、名称、组、最小、最大、中立值。最多选择 24 个最有价值且有依据的参数，每个说明不超过 24 个字，只输出一个 JSON 对象。返回 JSON {meanings:{真实参数ID:"可见动作及数值方向"},mapping:{跟踪轴:"真实参数ID"}}。按真实模型命名与绑定推测，物理输出、呼吸、开合口型、自动眨眼、服装配饰开关与无法确定语义的项不写。勿生成触摸区域。';
   }else{
    const labels=new Map(catalog.parts.map(p=>[p.Id,p.Name])),b=H.bounds,records=[];
    for(const id of H.meshIds()){
     const m=H.mesh(id),r=ZoneGeometry.bounds(m?.vertices);if(!r||m.opacity<.05)continue;
     const p=H.modelToStage(r.x+r.w/2,r.y+r.h/2),q=H.modelToStage(r.x,r.y);
     const part=H.meshPart(id);records.push({id,part:labels.get(part)||part,box:[(p.x-b.x)/b.width,(p.y-b.y)/b.height,Math.abs(p.x-q.x)*2/b.width,Math.abs(p.y-q.y)*2/b.height].map(v=>+v.toFixed(3))});
    }
    payload.meshes=records.sort((a,b)=>b.box[2]*b.box[3]-a.box[2]*a.box[3]).slice(0,260);
    payload.meshes.forEach(m=>meshIds.add(m.id));payload.authorAreas=catalog.hitAreas;
    payload.visuals=await artwork();
    payload.instruction='图一是该角色全身渲染，图二是实际纹理图集。结合两图及可见网格的角色归一化中心 x,y,宽,高，识别确实存在且适合抚摸的部位。没有必选部位，没有可见依据就省略，尤其区分马尾发束、飘带与动物尾巴。最多输出 12 个区域，禁止逐个解释网格，只输出一个 JSON 对象。返回 JSON {zones:[{name,id,rect:[x,y,w,h]}]}。id 必须来自 meshes，rect 是相对此网格左上角的比例，坐标和右下角都在 0–1。保留作者区。';
   }
   phase='request';diagnostic.requestSent=true;
   const rsp=await fetch('/api/decide',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'companion'},body:JSON.stringify({payload}),signal:AbortSignal.timeout(260000)});
   diagnostic.httpStatus=rsp.status;phase=rsp.ok?'parse':'request';
   const reply=await rsp.json();
   diagnostic.model=reply.diagnostics||null;diagnostic.code=reply.code||null;
   if(!rsp.ok)throw Error(reply.error||'适配请求失败');
   const plan=reply.plan;if(!plan||typeof plan!=='object')throw Error('模型未返回有效的适配方案');
   phase='validate';
   const reject=reason=>{diagnostic.reasons[reason]=(diagnostic.reasons[reason]||0)+1;};
   if(kind==='mouth'){
    const allowed=new Set(payload.parameters.map(p=>p.id));if(!Array.isArray(plan.bindings)||!plan.bindings.length||plan.bindings.some(r=>!allowed.has(r?.id)))throw Error('AI 未返回可验证的口型绑定，原配置已保留');
    window.mouthProfile.applyAI(plan.bindings);diagnostic.accepted=plan.bindings.length;
   }else if(kind==='parameters'){
    const entries=Object.entries(plan.meanings||{}).slice(0,24),meaning=Object.create(null);
    const allowed=new Set(payload.capabilities.parameters.map(p=>p[0]));
    const candidates=Object.fromEntries(entries.filter(([id,v])=>allowed.has(id)&&typeof v==='string'&&v.trim()));
    const rows=CompanionCore.rig(catalog,params,{},candidates);
    const writable=new Set(rows.map(r=>r.id));for(const [id,v] of entries){
     if(!writable.has(id)||!Object.hasOwn(candidates,id)){reject('未知、受保护或无说明');continue;}
     meaning[id]=v.trim().slice(0,64);
    }
    const map=mappings(plan.mapping);for(const axis of Object.keys(map))if(!allowed.has(map[axis])||!writable.has(map[axis]))delete map[axis];
    diagnostic.parameterMeanings=Object.keys(meaning).length;diagnostic.trackingMappings=Object.keys(map).length;
    diagnostic.offered=entries.length+Object.keys(plan.mapping||{}).length;diagnostic.accepted=Object.keys(meaning).length+Object.keys(map).length;
    if(!diagnostic.accepted)throw Error('没有可验证的参数含义或跟踪映射');
    petStore.setItem('ai-parameter-meanings',JSON.stringify(meaning));window.petTracking={...window.petTracking,...map};
    petStore.setItem('tracking-map',JSON.stringify(window.petTracking));refreshPerformanceRig();
   }else{
    const old=window.zoneEditor.exportSettings().zones;
    const kept=new Map(old.filter(z=>catalog.hitAreas.some(a=>a.Id===z.anchor?.id)).map(z=>[z.name,z]));
    const zones=Array.isArray(plan.zones)?plan.zones:[];
    diagnostic.offered=zones.length;
    for(const z of zones.slice(0,12)){
     const name=typeof z?.name==='string'?z.name.trim().slice(0,40):'';
     if(!name||!meshIds.has(z.id)){reject('名称或网格无效');continue;}
     if(kept.has(name)||kept.size>=40){reject('区域重名或已达上限');continue;}
     if(!Array.isArray(z.rect)||z.rect.length!==4||!z.rect.every(Number.isFinite)){reject('坐标格式');continue;}
     const [x,y,w,h]=z.rect;if(x<0||y<0||w<=0||h<=0||x+w>1.001||y+h>1.001){reject('区域越界');continue;}
     const anchor={id:z.id,x,y,w,h},rect=ZoneGeometry.resolve({anchor},H.mesh(z.id));if(!rect){reject('网格无边界');continue;}
     kept.set(name,{name,anchor,rect});diagnostic.accepted++;
    }
    if(!diagnostic.accepted)throw Error('本次没有可验证的触摸区域，原区域已保留');
    const startedEditing=!window.zoneEditor.editing;
    if(startedEditing){window.petApplyingZones=true;try{window.zoneEditor.begin();}finally{window.petApplyingZones=false;}}
    try{window.zoneEditor.applyDraft([...kept.values()]);}
    catch(e){if(startedEditing)window.zoneEditor.end(false);throw e;}
   }
   diagnostic.phase=kind==='touch'&&window.zoneEditor.editing?'draft':'applied';
   return kind==='mouth'?'已保存 '+diagnostic.accepted+' 项独立口型绑定':kind==='parameters'?'已适配 '+diagnostic.accepted+' 项演出参数或映射':'已采用 '+diagnostic.accepted+' 个触摸区'+(window.zoneEditor.editing?'，请检查并保存':'');
  }catch(err){diagnostic.phase=err.name==='TimeoutError'?'timeout':phase+'-failed';diagnostic.error=String(err.message||err).slice(0,200);if(diagnostic.code)err.message='['+diagnostic.code+'] '+err.message;throw err;}
  finally{report({...diagnostic,durationMs:Math.round(performance.now()-start),at:new Date().toISOString()});}
 }
 async function adapt(mode,source){
  if(window.liveAI===false)return message(Error('AI 调用已关闭'));
  if(!ready||window.petAdapting)return;
  if(window.zoneEditor.editing)return message(Error('正在调整触摸区域，请先保存或取消'));
  
  const overlay=$('adaptDialog');$('adaptDismiss').hidden=true;$('adaptMessage').textContent='适配使用 high 推理，输出上限由模型服务决定。调用 AI 会消耗模型 tokens。';window.petAdapting=true;overlay.querySelector('h2').textContent=mode==='mouth'?'正在适配当前模型的口型…':mode==='both'?'正在适配演出参数和触摸区域…':mode==='touch'?'正在读取模型和贴图，适配触摸区域…':'正在适配演出参数…';
  overlay.showModal();window.companion.closeChat();window.companion.stop();
  const sampling=focusChoice!=='off',results=[];let failed=false;
  async function sample(enabled){const r=await fetch('/api/focus',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'companion'},body:JSON.stringify({enabled})});if(r.ok)nativeCount=(await r.json()).total;}
  try{
   await desktop?.asset?.('lock',true);if(sampling){focusGeneration++;await sample(false);}
   for(const kind of mode==='both'?['parameters','touch']:[mode]){
    try{results.push(await runAdaptation(kind,source));}catch(e){failed=true;results.push((kind==='touch'?'触摸':'参数')+'适配失败：'+e.message);}
   }
   const msg=results.join('；');notice(msg,failed?'error':'normal');$('zoneAnchorStatus').textContent=msg;
   if(failed){
    overlay.querySelector('h2').textContent='适配未完成';
    $('adaptMessage').textContent=msg;
    $('adaptDismiss').hidden=false;
    await new Promise(resolve=>{$('adaptDismiss').onclick=resolve;});
   }
  }finally{try{if(sampling)await sample(true);}finally{try{await desktop?.asset?.('lock',false);}finally{window.petAdapting=false;overlay.close();if(failed)window.companion.clearStatus();lastInput=performance.now();window.companion.schedule();}}}
 }
 $('refreshAppearance').onclick=safe(async()=>{
  if(!ready)throw Error('请先加载模型');if(window.liveAI===false)throw Error('AI 调用已关闭');
  if(!await beforeChange())return;
  const info=await desktop.asset('library'),owner=info.characters.find(c=>c.id===info.active?.characterId),model=owner?.models.find(m=>m.profile===info.active?.profile);
  if(!owner||!model||owner.id!==window.petCharacterId||model.profile!==catalog.profile)throw Error('角色或模型已变化，请重试');
  await window.companion.modelChanged({id:crypto.randomUUID(),type:'model_change',reason:'appearance_refresh',at:new Date().toISOString(),characterId:owner.id,characterName:owner.name,profile:model.profile,previousProfile:model.profile,from:model.label,to:model.label},()=>artwork(true));
 });
 $('adaptMouthProfile').onclick=safe(()=>adapt('mouth','voice'));
 $('adaptParameters').onclick=safe(()=>adapt('parameters','render'));
 $('adaptTouch').onclick=safe(()=>adapt('touch','zone-calibration'));
 aiBtn.onclick=safe(()=>adapt('touch','zone-editor'));
})();
