/* Bind DSH settings controls to the active character instance. */
(()=>{
 const epoch=crypto.randomUUID(),ids=new WeakMap();let serial=0,controls=new Map();
 const tags=new Set('nav label section h2 h3 p small div summary details button input select option textarea span strong output code pre hr form audio'.split(' '));
 const statusIds=new Set(['activity','diagnostics','ruleLog','voiceLastError','breathStatus']);
 function node(el,map,root=false){
  if(el.nodeType===3)return el.textContent.trim()||null;
  if(el.dataset?.lcHelpSource)return null;
  const tag=el.localName;if(el.hasAttribute?.('popover')||el.getAttribute?.('role')==='tooltip')return null;if(el.id==='viewHistory'||(el.type==='password'&&el.id!=='voiceApiKey'))return null;
  if(!tag||(!root&&el.hidden)||!tags.has(tag))return null;
  let id=ids.get(el);if(!id){id=++serial;ids.set(el,id);}map.set(id,el);
  const note=tag==='p'||tag==='small';
  const text=note?el.textContent.trim():'';
  const cost=note&&(el.classList.contains('token-note')||/tokens?|计费|费用|额度|消耗/i.test(text));
  const status=el.matches('[role=status],[data-ui=status],[data-level=error]:not(button),.companion-status')||statusIds.has(el.id);
  const n={tag,id,attrs:{},css:el.className||'',help:note&&!el.id&&!status&&!cost&&!el.childElementCount&&!!text};
  for(const a of ['type','min','max','step','maxlength','placeholder','readonly','data-secret-revision','disabled','title','aria-label','aria-describedby','data-help-text','data-level','data-ui','role'])if(el.hasAttribute(a))n.attrs[a]=el.getAttribute(a);
  if(status)n.attrs['data-ui']='status';
  else if(cost)n.attrs['data-ui']='cost';
  const description=el.getAttribute('aria-describedby');
  if(tag==='button'&&description){
   const tooltip=document.getElementById(description);
   if(tooltip?.matches('[role=tooltip]')&&tooltip.textContent.trim())n.attrs['data-help-text']=tooltip.textContent.trim();
  }
  if(tag==='details')n.open=el.open;
  if(el.id==='voiceApiKey'||el.type==='password')n.sensitive=true;
  if(['input','textarea','select','option'].includes(tag))n.value=n.sensitive||el.type==='file'?'':el.value;
  if(el.type==='checkbox')n.checked=el.checked;
  if(el.matches('.active'))n.active=true;
  if(tag!=='textarea')n.children=[...el.childNodes].map(c=>node(c,map)).filter(Boolean);
  return n;
 }
 const panes=['renderPanel','companionPanel','voicePanel','focusPanel','bubblePanel','balancePanel','assetPanel'];
 const drawerTabs=['param','expr','motion'];
 function read(cmd={}){
  const pane=panes.includes(cmd.pane)?cmd.pane:panes[0];
  if(pane==='voicePanel')window.companion?.refreshVoice?.();
  const tab=drawerTabs.includes(cmd.tab)?cmd.tab:drawerTabs[0];
  const dialog=document.querySelector('dialog[open]'),map=new Map();
  const list=(els)=>Array.from(els).filter(Boolean).map(el=>node(el,map)).filter(Boolean);
  const editing=window.zoneEditor.editing;
  if(!dialog)$('zoneEditPanel').hidden=!editing;
  const fields=dialog?list(dialog.children):editing?[]:list($(pane).children);

  const drawer=!dialog&&!editing&&cmd.drawer?list($(tab).children):[];
  const zone=!dialog&&editing?list($('zoneEditPanel').children):[];
  const actions=dialog||editing?[]:list(ready?['full','portrait','switchModel','home','reset','aiMaster'].map($):[$('firstModel'),$('aiMaster')]);
  controls=map;
  const rect=$('canvas').getBoundingClientRect();
  const boxes=Array.from(document.querySelectorAll('#zoneOverlay [data-zone]'),el=>{
   const b=el.getBoundingClientRect();
   return {x:(b.x-rect.x)/rect.width,y:(b.y-rect.y)/rect.height,w:b.width/rect.width,h:b.height/rect.height,name:el.firstChild?.textContent,selected:el.classList.contains('selected')};
  });
  const state={epoch,fields,drawer,actions,zone,boxes,editing,ready,modal:!!dialog,
   status:$('status').textContent,level:$('status').dataset.level,credit:$('modelCredit').textContent,
   state:$('state').textContent,fps:$('fps').textContent,message:$('loadMessage').textContent,
   chat:!dialog&&pane==='bubblePanel'?window.companion.chatState():null};
  if(cmd.preview)state.preview=frame(false);
  if(window.petRendererHealth?.renderFailed){state.ready=false;state.status=$('status').textContent;state.level='error';}
  return state;
 }
 let out;
 function frame(jpeg){
  if(!ready||!app)return null;
  const canvas=$('canvas');out||=document.createElement('canvas');const scale=Math.min(1,720/canvas.height,720/canvas.width);
  const w=Math.max(1,Math.round(canvas.width*scale)),h=Math.max(1,Math.round(canvas.height*scale));
  if(out.width!==w||out.height!==h){out.width=w;out.height=h;}
  try{app.renderer.render(app.stage);}catch(error){window.petRenderFailure?.(error);return null;}const ctx=out.getContext('2d');
  ctx.fillStyle='#e6eff0';ctx.fillRect(0,0,w,h);ctx.drawImage(canvas,0,0,w,h);
  return out.toDataURL(jpeg?'image/jpeg':'image/webp',.76);
 }
 async function act(cmd){
  if(cmd.epoch!==epoch)throw Error('角色已切换，请重试');
  if(cmd.op==='chat'||cmd.op==='stop'){
   if(window.petAdapting||document.querySelector('dialog[open]'))throw Error('请先完成角色设置');
   if(cmd.op==='stop'){window.companion.stop();return;}
   window.companion.sendFromPanel(cmd.text);return;
  }
  const el=controls.get(cmd.id);
  if(window.petAdapting&&!el?.closest('#adaptDialog'))throw Error('角色适配中，请等待完成');
  if(window.zoneEditor.editing&&!el?.closest('#zoneEditPanel,#zoneExit'))throw Error('正在调整触摸区域，请先保存或取消');if(!el?.isConnected||el.disabled)throw Error('设置项已变化');
  if(cmd.op==='click'){if(el.tagName==='SUMMARY'){el.parentElement.open=!el.parentElement.open;return;}if(el.tagName!=='BUTTON')throw Error('无效操作');el.click();return;}
  if(cmd.op==='value'&&el.matches('input:not([type=file]),select,textarea')){
   if(el.type==='checkbox')el.checked=cmd.value===true;else el.value=String(cmd.value).slice(0,50000);
   el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return;
  }
  if(cmd.op==='file'&&el.type==='file'){el.click();return;}
  throw Error('不支持的设置操作');
 }
 window.petPanel={read,act,frame};
 if(window.petRendererHealth)window.petRendererHealth.ready=true;
})();
