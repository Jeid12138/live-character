/* Rectangles bound to the current deformed ArtMesh, in model coordinates. */
window.ZoneEditor={init(H,legacy){
 const G=ZoneGeometry,$=id=>document.getElementById(id);let zones=[],editing=false,loaded=false,selected=0,snapshot=null,drag=null,picking=false,candidates=[],storageKey='';
 let returnFocus=null;
 let padding=20,savedPadding=20,lastCarrier=0;
 const overlay=document.createElement('div');overlay.id='zoneOverlay';overlay.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:8';$('stage').append(overlay);
 const panel=document.createElement('section');panel.id='zoneEditPanel';panel.hidden=true;panel.className='zone-edit-panel';panel.innerHTML=`<button type="button" id="zoneClose" aria-label="关闭触摸区域调整">×</button><h3>调整触摸区域</h3><p>角色已暂停。拖动区域移动，拖动四角或边缘缩放。</p><label>触摸向外扩展（屏幕像素）<input id="zonePadding" type="number" min="0" max="120" step="1" value="20"></label><label>选择部位<select id="zoneSelect"></select></label><label>名称<input id="zoneName" maxlength="40"></label><div class="actions"><button id="zoneAdd">新增区域</button><button id="zoneDelete">删除</button></div><div class="actions"><button id="zonePick">重新绑定：点选部位</button><button id="zoneNextMesh">下一层网格</button></div><p id="zoneAnchorStatus"></p><p>蓝框是触摸范围，橙框是绑定网格。选错头发或衣服时可点“下一层网格”。</p><div class="actions zone-edit-footer"><button id="zoneSave">保存并退出</button><button id="zoneCancel">取消修改</button><button id="zoneReset">恢复默认区域</button></div>`;document.body.append(panel);
 const clone=x=>JSON.parse(JSON.stringify(x));
 const rawMesh=id=>{try{return H.mesh(id)}catch{return null}};
 const partMeshes=new Map();
 function indexParts(){
  const labels=new Map((H.catalog.parts||[]).map(p=>[p.Id,p.Name]));
  for(const id of H.meshIds()){
   const part=H.meshPart?.(id),label=labels.get(part)||part||'';
   const normalize=v=>v.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_./-]/g,' ').toLowerCase();
   const nameOf=v=>{
    const text=normalize(v);
    const names=[['头部',/头部|頭部|前发|前髪|前髮|脸|顔|頭|\b(head|face|bangs|fringe)\b/],['耳朵',/耳|\bears?\b/],['手臂',/手臂|腕|\b(arms?|forearms?)\b/],['手掌',/手掌|手部|\bhands?\b/],['腿',/腿|太もも|\b(legs?|thighs?)\b/],['脚',/脚|足|\b(foot|feet|paws?)\b/],['尾巴',/尾巴|尻尾|しっぽ|^(?:part )?tail(?: [lr]| [0-9]+)?$/i],['翅膀',/翅|翼|羽根|\bwings?\b/],['胸部',/胸|\bchest\b/],['肚子',/肚|腹部|\b(belly|abdomen)\b/],['身体',/身体|胴|体幹|\b(body|torso)\b/]];
    const match=names.find(([,re])=>re.test(text));if(!match)return '';
    const side=/左|\b(left|l)\b/.test(text)?'左':/右|\b(right|r)\b/.test(text)?'右':'';
    return side+match[0];
   };
   const name=nameOf(label)||nameOf(part||'')||nameOf(id);
   if(!name||(name.includes('尾巴')&&/马尾|馬尾|双尾|雙尾|髪|发束|髮束|pony|twin.?tail|hair|ribbon|飘带|リボン/i.test([label,part,id].join(' '))))continue;
   const key='part/'+name;if(!partMeshes.has(key))partMeshes.set(key,[]);partMeshes.get(key).push(id);
  }
 }
 const mesh=id=>{if(partMeshes.has(id)){
  const sources=partMeshes.get(id).map(rawMesh).filter(m=>m&&m.opacity>=.05);
  const boxes=sources.map(m=>G.bounds(m.vertices)).filter(Boolean);if(!boxes.length)return null;
  const left=Math.min(...boxes.map(r=>r.x)),right=Math.max(...boxes.map(r=>r.x+r.w)),top=Math.min(...boxes.map(r=>r.y)),bottom=Math.max(...boxes.map(r=>r.y+r.h));
  return {id,opacity:1,sources,vertices:[left,top,right,top,right,bottom,left,bottom]};
 }
 if(H.catalog?.hitAreas?.some(a=>a.Id===id)){const raw=rawMesh(id);if(raw)return {...raw,opacity:1,sources:[{...raw,opacity:1}]};}return BodyZones.mesh(id,rawMesh);};
 function rect(z){return G.resolve(z,z.anchor?mesh(z.anchor.id):null)}
 function stageRect(r){const a=H.modelToStage(r.x,r.y),b=H.modelToStage(r.x+r.w,r.y+r.h);return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}}
 function point(e){const b=$('canvas').getBoundingClientRect();return H.stageToModel(e.clientX-b.left,e.clientY-b.top)}
 function pick(p){return G.candidates(Array.from(H.meshIds(),id=>mesh(id)).filter(Boolean),p)}
 function bind(z,r,id){const m=mesh(id);if(!m)return false;try{z.rect={...r};z.anchor=G.attach(r,m);return true}catch{return false}}
 function autoBind(z){const r=z.rect,ms=pick({x:r.x+r.w/2,y:r.y+r.h/2});if(ms.length)bind(z,r,ms[0].id);}
 function makeDefault(){const precise=H.catalog.profile==='e45ce94b922c4f663ef18ed9'&&H.meshIds().includes('ArtMesh102')?BodyZones.defaults(rawMesh):null;if(precise)return precise;
 const declared=(H.catalog.hitAreas||[]).flatMap(a=>{const m=mesh(a.Id),r=G.bounds(m?.vertices);if(!r)return [];const part=a.Name||a.Id.replace(/^HitArea/,'');return [{name:({Body:'身体',Head:'头部'})[part]||part||'身体',rect:r,anchor:G.attach(r,m)}];});
 const inferred=[];
 for(const id of partMeshes.keys()){
  const name=id.slice(5);if(declared.some(z=>z.name===name))continue;
  const m=mesh(id),rect=G.bounds(m?.vertices);if(rect)inferred.push({name,rect,anchor:G.attach(rect,m)});
 }
 if(declared.length||inferred.length)return [...inferred,...declared].sort((a,b)=>Number(a.name==='身体')-Number(b.name==='身体'));

 const b=H.bounds,a=H.stageToModel(b.x,b.y),q=H.stageToModel(b.x+b.width,b.y+b.height);
 return [{name:'角色（待校准）',anchor:null,rect:{x:Math.min(a.x,q.x),y:Math.min(a.y,q.y),w:Math.abs(q.x-a.x),h:Math.abs(q.y-a.y)}}];}

 function load(){if(loaded||!H.ready||!H.meshIds().length)return;indexParts();let hash=0;for(const ch of Array.from(H.meshIds()).join('|'))hash=(hash*31+ch.charCodeAt(0))|0;const suffix=H.catalog.model+':'+hash;storageKey='companion-zones-v6:'+suffix;
 try{
  const data=petStore.getItem(storageKey);
  if(data)zones=G.validate(JSON.parse(data));
  else{
   zones=makeDefault();
   const old=petStore.getItem('companion-zones-v5:'+suffix);
   if(old){
    const saved=G.validate(JSON.parse(old));
    const names=new Set([...zones.map(z=>z.name),'脚']);
    const custom=saved.filter(z=>!names.has(z.name));
    zones=[...custom,...zones].slice(0,40);
    petStore.setItem(storageKey,JSON.stringify(zones));
   }
  }
 }catch{zones=makeDefault()}
 const stored=petStore.getItem(storageKey+':padding');
 if(stored!==null && Number.isFinite(+stored))padding=Math.max(0,Math.min(120,Math.round(+stored)));
 loaded=true;}
 function refresh(){const sel=$('zoneSelect');sel.replaceChildren();zones.forEach((z,i)=>{const o=document.createElement('option');o.value=i;o.textContent=z.name;sel.append(o)});selected=Math.max(0,Math.min(selected,zones.length-1));sel.value=selected;const z=zones[selected];$('zoneName').value=z?.name||'';$('zoneAnchorStatus').textContent=z?(z.anchor?'绑定：'+z.anchor.id:'尚未绑定，区域不会随部位变形；请点选绑定'):'请新增区域';}
 function begin(){if(window.petAdapting&&!window.petApplyingZones)return;load();if(!loaded){window.alert('请先加载真实模型，再调整触摸区域。');return;}if(editing)return;snapshot=clone(zones);savedPadding=padding;$('zonePadding').value=padding;window.companion?.stop();H.freeze(true);editing=true;returnFocus=document.activeElement;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');if($('settingsDock'))$('settingsDock').inert=true;document.documentElement.classList.add('zones-modal');panel.hidden=false;refresh();$('zoneClose').focus();}
 function end(save){if(!editing)return;if(save){try{petStore.setItem(storageKey,JSON.stringify(G.validate(zones)));petStore.setItem(storageKey+':padding',String(padding))}catch(e){$('zoneAnchorStatus').textContent='保存失败：'+e.message;return;}}else {zones=snapshot;padding=savedPadding;}editing=false;if($('settingsDock'))$('settingsDock').inert=false;document.documentElement.classList.remove('zones-modal');drag=null;picking=false;panel.hidden=true;panel.removeAttribute('aria-modal');returnFocus?.focus?.();returnFocus=null;H.freeze(false);window.companion?.clearStatus?.();window.dispatchEvent(new Event('pet-zones-changed'));}
 $('zonePadding').oninput=()=>{
  const input=$('zonePadding');if(input.value!==''&&Number.isFinite(input.valueAsNumber))padding=Math.max(0,Math.min(120,Math.round(input.valueAsNumber)));
 };
 $('zonePadding').onchange=()=>{$('zonePadding').value=padding};
 $('zoneSelect').onchange=()=>{selected=+$('zoneSelect').value;candidates=[];refresh()};$('zoneName').onchange=()=>{if(zones[selected])zones[selected].name=$('zoneName').value.trim()||'未命名区域';refresh()};
 const exitDialog=document.createElement('dialog');exitDialog.id='zoneExit';exitDialog.innerHTML='<h3>保存触摸区域的修改？</h3><div class="actions"><button id="zoneExitSave">保存并退出</button><button id="zoneDiscard">不保存</button><button id="zoneContinue">继续调整</button></div>';document.body.append(exitDialog);
 function requestClose(){if(!editing)return;if(padding!==savedPadding||JSON.stringify(zones)!==JSON.stringify(snapshot)){if(!exitDialog.open)exitDialog.showModal();}else end(false);}
 $('zoneClose').onclick=requestClose;$('zoneExitSave').onclick=()=>{exitDialog.close();end(true);};$('zoneDiscard').onclick=()=>{exitDialog.close();end(false);};$('zoneContinue').onclick=()=>exitDialog.close();
 document.addEventListener('keydown',e=>{if(editing&&!exitDialog.open&&!window.petAdapting&&e.key==='Escape'){e.preventDefault();requestClose();}});
 $('zoneSave').onclick=()=>end(true);$('zoneCancel').onclick=()=>end(false);
 $('zoneAdd').onclick=()=>{if(zones.length>=40)return;const b=H.bounds,a=H.stageToModel(b.x+b.width*.4,b.y+b.height*.35),q=H.stageToModel(b.x+b.width*.6,b.y+b.height*.5);const z={name:'新区域',rect:{x:a.x,y:a.y,w:Math.abs(q.x-a.x),h:Math.abs(q.y-a.y)},anchor:null};autoBind(z);zones.push(z);selected=zones.length-1;refresh()};
 $('zoneDelete').onclick=()=>{zones.splice(selected,1);refresh()};$('zoneReset').onclick=()=>{zones=makeDefault();padding=20;$('zonePadding').value=padding;selected=0;refresh()};
 $('zonePick').onclick=()=>{picking=true;$('zoneAnchorStatus').textContent='请在角色想要跟随的部位点一下；再用下一层网格检查绑定。'};
 $('zoneNextMesh').onclick=()=>{const z=zones[selected];if(!z||!candidates.length)return;const index=candidates.findIndex(m=>m.id===z.anchor?.id),r=rect(z)||z.rect;bind(z,r,candidates[(index+1)%candidates.length].id);refresh()};
 overlay.addEventListener('pointerdown',e=>{if(!editing||e.button!==0)return;e.preventDefault();e.stopPropagation();const p=point(e);if(picking){const z=zones[selected];if(!z)return;candidates=pick(p);if(candidates.length){const r=rect(z)||z.rect;bind(z,r,candidates[0].id);picking=false;refresh()}else $('zoneAnchorStatus').textContent='这里没有找到可见网格，请点在部位内部。';return;}
  const node=e.target.closest('[data-zone]');if(!node)return;selected=+node.dataset.zone;refresh();const z=zones[selected],r=rect(z)||z.rect;drag={id:e.pointerId,start:p,rect:{...r},handle:e.target.dataset.handle||'move'};overlay.setPointerCapture(e.pointerId);
 });
 overlay.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();const p=point(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y,r={...drag.rect},h=drag.handle,min=5;if(h==='move'){r.x+=dx;r.y+=dy}else{if(h.includes('e'))r.w=Math.max(min,r.w+dx);if(h.includes('s'))r.h=Math.max(min,r.h+dy);if(h.includes('w')){r.w=Math.max(min,r.w-dx);r.x=drag.rect.x+drag.rect.w-r.w;}if(h.includes('n')){r.h=Math.max(min,r.h-dy);r.y=drag.rect.y+drag.rect.h-r.h;}}const z=zones[selected];if(z.anchor)bind(z,r,z.anchor.id);else z.rect=r;
 });
 const finish=()=>{if(drag){const z=zones[selected];if(z&&!z.anchor)autoBind(z);drag=null;refresh()}};overlay.addEventListener('pointerup',finish);overlay.addEventListener('pointercancel',finish);
 function draw(){load();const visible=editing||$('showZones')?.checked;overlay.style.pointerEvents=editing?'auto':'none';const carrier=!visible&&loaded&&padding>0&&document.documentElement.classList.contains('pet-only');
 if(carrier && performance.now()-lastCarrier<65){requestAnimationFrame(draw);return;}
 if(carrier)lastCarrier=performance.now();
 overlay.replaceChildren();
 if(carrier)for(const z of zones){
  const r=rect(z);if(!r)continue;const s=stageRect(r),patch=document.createElement('i');
  patch.style.cssText=`position:absolute;pointer-events:none;background:rgba(0,0,0,.004);border-radius:${padding}px;left:${s.x-padding}px;top:${s.y-padding}px;width:${s.w+2*padding}px;height:${s.h+2*padding}px`;
  overlay.append(patch);
 }
 if(visible&&loaded){zones.forEach((z,i)=>{const r=rect(z);if(!r)return;const s=stageRect(r),box=document.createElement('div');box.dataset.zone=i;box.className='touch-zone'+(i===selected&&editing?' selected':'');box.style.cssText=`left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;`;box.textContent=z.name+(z.anchor?'':' · 未绑定');if(padding && (!editing||i===selected)){const halo=document.createElement('i');halo.className='hit-margin';halo.style.setProperty('--pad',padding+'px');box.append(halo);}
 if(editing&&i===selected)for(const handle of ['nw','n','ne','e','se','s','sw','w']){const dot=document.createElement('i');dot.dataset.handle=handle;dot.className='zone-handle '+handle;box.append(dot)}overlay.append(box)});
 if(editing){const z=zones[selected],b=z?.anchor?G.bounds(mesh(z.anchor.id)?.vertices):null;if(b){const s=stageRect(b),line=document.createElement('div');line.className='zone-anchor';line.style.cssText=`left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;`;overlay.append(line)}}}
 requestAnimationFrame(draw);}
 requestAnimationFrame(draw);
 return {begin,end,requestClose,applyDraft(values){zones=G.validate(values);refresh();if(!editing){petStore.setItem(storageKey,JSON.stringify(zones));}},exportSettings(){load();return {signature:storageKey,zones:clone(zones),padding};},
 importSettings(data){load();zones=G.validate(data.zones);padding=data.padding;petStore.setItem(storageKey,JSON.stringify(zones));petStore.setItem(storageKey+':padding',String(padding));refresh();},get editing(){return editing},get zones(){return zones},hit(x,y){load();if(!loaded||editing)return null;const p=H.stageToModel(x,y),unit=H.stageToModel(x+1,y);
 const tolerance=padding*Math.hypot(unit.x-p.x,unit.y-p.y);
 let best=null,bestDistance=Infinity;
 for(const zone of zones){
  const m=zone.anchor?mesh(zone.anchor.id):null,r=G.resolve(zone,m);if(!r)continue;
  const distance=G.distance(r,m?.sources,p,Math.min(bestDistance,tolerance));
  if(distance===0)return zone;
  if(distance<=tolerance && distance<bestDistance){bestDistance=distance;best=zone;}
 }
 return best;},resolve:rect,refresh};
}};
