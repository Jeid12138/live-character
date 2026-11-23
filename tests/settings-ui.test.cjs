const {test}=require('node:test'),assert=require('node:assert/strict'),{boot,waitUntil}=require('./fixtures/browser-lab.cjs');
function flat(nodes){return (nodes||[]).flatMap(n=>typeof n==='string'?[]:[n,...flat(n.children)]);}
test('native settings and DSH mirror retain the same wrapping action groups',async()=>{
 const f=await boot();
 try{
  const {w}=f,doc=w.document;
  const groups=[
   ['renderPanel','switchModelRender','adaptParameters','refreshAppearance'],
   ['companionPanel','editZones','adaptTouch'],
   ['voicePanel','openVoiceReferences','refreshVoiceReferences'],
   ['voicePanel','playCalibration','pauseCalibration'],
  ];
  for(const [pane,...ids] of groups){
   const buttons=ids.map(id=>doc.getElementById(id)),row=buttons[0].parentElement;
   assert(row.matches('.actions'));
   assert.deepEqual([...row.children],buttons);
   const labels=buttons.map(button=>button.textContent);
   const mirrored=flat(w.petPanel.read({pane}).fields).find(n=>n.css==='actions'&&n.children?.[0]?.children?.[0]===labels[0]);
   const visible=!row.closest('[hidden]')||row.closest('[hidden]').id===pane;
   assert.deepEqual(mirrored&&Array.from(mirrored.children,n=>n.children[0]),visible?labels:undefined);
  }
  const card=doc.querySelector('.character-card');
  assert(card.querySelector(':scope > input[aria-label="角色名称"]'));
  const cardActions=card.querySelector(':scope > .actions');
  assert.deepEqual([...cardActions.children].map(button=>button.textContent),['修改角色名','添加模型']);
  const mirroredCard=flat(w.petPanel.read({pane:'companionPanel'}).fields).find(n=>n.css==='character-card');
  assert.equal(mirroredCard.children.find(n=>n.css==='character-summary').help,false);
  assert.deepEqual(Array.from(mirroredCard.children.find(n=>n.css==='actions').children,n=>n.children[0]),['修改角色名','添加模型']);
 }finally{f.dom.window.close();}
});
test('DSH mirror keeps token notices visible and identifies help and diagnostics separately',async()=>{
 const f=await boot();
 try{
  const {w}=f;
  const nodes=flat(w.petPanel.read({pane:'renderPanel'}).fields);
  const tokenNote=nodes.find(n=>n.css==='token-note');
  assert.equal(tokenNote.attrs['data-ui'],'cost');
  assert.equal(tokenNote.help,false);
  assert(nodes.some(n=>n.attrs['data-help-text']?.includes('显存占用')));
  assert(nodes.some(n=>n.tag==='pre'&&n.attrs['data-ui']==='status'));
  w.document.querySelector('[data-pane=companionPanel]').click();
  const action=w.document.getElementById('tryDecision');
  const nativeNotice=action.nextElementSibling;
  assert(nativeNotice.matches('small.token-note'));
  assert.match(nativeNotice.textContent,/消耗模型 tokens/);
  assert(!nativeNotice.closest('[hidden], details:not([open])'));
  const companion=flat(w.petPanel.read({pane:'companionPanel'}).fields);
  const actionRow=companion.find(n=>n.children?.some(c=>c.tag==='button'&&c.children?.includes('请求一次演出')));
  assert(actionRow);
  const mirrorNotice=actionRow.children.find(n=>n.attrs?.['data-ui']==='cost');
  assert(mirrorNotice);
  assert(mirrorNotice.children.includes(nativeNotice.textContent.trim()));
  assert.equal(mirrorNotice.help,false);
 }finally{f.dom.window.close();}
});
test('mouth strength and offset persist immediately through native settings events and a full page reload, including zero',async()=>{const f=await boot();let settings;try{const {w}=f;let operations=[];const asset=w.petDesktop.asset;w.petDesktop.asset=async(op,value)=>{operations.push({op,value});return asset(op,value)};const snapshot=w.petPanel.read({pane:'voicePanel'}),gain=flat(snapshot.fields).find(n=>n.tag==='input'&&n.attrs.type==='range'&&n.attrs.max==='1.5');assert(gain);await w.petPanel.act({op:'value',epoch:snapshot.epoch,id:gain.id,value:'1.35'});const offset=w.document.getElementById('lipOffset');offset.value='.45';offset.dispatchEvent(new w.Event('input',{bubbles:true}));settings=new Map(f.store);const saved=JSON.parse(settings.get('companion-config-v4'));assert.equal(saved.lipGain,1.35);assert.equal(saved.lipOffset,.45);assert.equal(w.companion.config.lipGain,1.35);assert(!operations.some(({op,value})=>/voiceSave|Synthesize/.test(op)||op==='voiceCredential'&&['set','clear'].includes(value?.action)),'local mouth preference does not save keys or synthesize');}finally{f.dom.window.close();}const g=await boot({storage:settings});try{const {w}=g;assert.equal(w.document.getElementById('lipGain').value,'1.35');assert.equal(w.document.getElementById('lipOffset').value,'0.45');const gain=w.document.getElementById('lipGain');gain.value='0';gain.dispatchEvent(new w.Event('change',{bubbles:true}));settings=new Map(g.store);}finally{g.dom.window.close();}const zero=await boot({storage:settings});try{assert.equal(zero.w.document.getElementById('lipGain').value,'0');assert.equal(zero.w.companion.config.lipGain,0);}finally{zero.dom.window.close();}});
test('mouth save errors report failure and retain the last stored calibration',async()=>{const f=await boot();try{const {w}=f,store=w.petDesktop.store;w.petDesktop.store=(profile,op,key,value)=>{if(op==='set'&&key==='companion-config-v4')throw Error('disk fixture unavailable');return store(profile,op,key,value)};const before=w.companion.config.lipGain,gain=w.document.getElementById('lipGain');gain.value='1.4';gain.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.companion.config.lipGain,before);assert.match(w.document.getElementById('status').textContent,/口型设置未保存/);}finally{f.dom.window.close();}});
test('configuration import and export are exposed in Settings only; mirrored UI retains the real controls',async()=>{const f=await boot();try{const {w}=f,$=id=>w.document.getElementById(id);assert.equal($('save').closest('#assetPanel'),$('assetPanel'));assert.equal($('restore').closest('#assetPanel'),$('assetPanel'));assert(!$('renderPanel').contains($('save')));w.document.querySelector('[data-pane=assetPanel]').click();assert.equal($('assetPanel').hidden,false);let snapshot=w.petPanel.read({pane:'assetPanel'}),nodes=flat(snapshot.fields);assert(nodes.some(n=>n.tag==='button'&&n.children?.includes('导出配置')));assert(nodes.some(n=>n.tag==='button'&&n.children?.includes('导入配置')));nodes=flat(w.petPanel.read({pane:'renderPanel'}).fields);assert(!nodes.some(n=>n.tag==='button'&&n.children?.includes('导出配置')));const voice=flat(w.petPanel.read({pane:'voicePanel'}).fields);assert(voice.some(n=>n.tag==='button'&&n.attrs['data-ui']==='primary'&&n.children?.includes('保存语音设置')));let fileOpened=false;$('configFile').click=()=>fileOpened=true;$('restore').click();assert(fileOpened,'import still activates original native file input');}finally{f.dom.window.close();}});

test('Settings export keeps current character/model calibration and mouth gain while excluding the entered secret',async()=>{let exported;const f=await boot({configure(w){w.structuredClone=structuredClone;w.Blob=Blob;w.URL.createObjectURL=blob=>{exported=blob;return 'blob:settings-export'};w.HTMLAnchorElement.prototype.click=function(){};const asset=w.petDesktop.asset;w.petDesktop.asset=async(op,value)=>op==='sessionHistory'?{rows:[],total:0}:op==='voicePlayback'?{volume:.8,muted:false}:asset(op,value);}});try{const {w}=f;w.document.querySelector('[data-pane=assetPanel]').click();const gain=w.document.getElementById('lipGain');gain.value='1.2';gain.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.getElementById('voiceApiKey').value='SECRET_NOT_FOR_EXPORT';await w.document.getElementById('save').onclick();assert.equal(w.document.getElementById('configResult').textContent,'配置已导出');const text=await exported.text(),data=JSON.parse(text);assert.equal(data.scope,'character-lab');assert.equal(data.profile,w.petProfile);assert.equal(data.characterId,w.petCharacterId);assert.equal(data.companion.lipGain,1.2);assert(data.calibration);assert(data.mouth);assert(data.studio);assert(data.breathing);assert(!text.includes('SECRET_NOT_FOR_EXPORT'));}finally{f.dom.window.close();}});
