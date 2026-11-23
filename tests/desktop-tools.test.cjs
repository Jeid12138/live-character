const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{JSDOM}=require(process.env.LC_TEST_JSDOM||'jsdom');
const root=path.resolve(__dirname,'../lab'),html=fs.readFileSync(root+'/index.html','utf8'),pause=ms=>new Promise(r=>setTimeout(r,ms));
test('actual toolbar toggles native adjustment, Escape/finish and AI master with shared state, persistence and double-click protection',async()=>{const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:61951'}),w=dom.window,store=new Map(),calls=[],callbacks={};let enabled=true,failAfterPersist=false,showPicker=false;
try{w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.ResizeObserver=class{observe(){}};w.HTMLDialogElement.prototype.show=function(){this.open=true};w.HTMLDialogElement.prototype.showModal=w.HTMLDialogElement.prototype.show;w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLMediaElement.prototype.pause=function(){};w.fetch=async()=>({ok:true,json:async()=>({}),text:async()=>''});
w.petDesktop={store:(_p,op,key,v)=>op==='get'?store.get(key)??null:op==='set'?store.set(key,v):op==='history'?[]:op==='legacyAllowed'?false:null,asset:async(op,value)=>{if(op==='preferences')return {ai:enabled};if(op==='preference'){calls.push({op,value});await pause(10);enabled=value.enabled;if(failAfterPersist)throw Error('fixture cancellation timeout');return;}if(op==='status')return {core:true,characters:showPicker?[{id:'char-11111111-1111-4111-8111-111111111111',name:'测试角色',models:[{profile:'a',label:'模型A',lastUsed:0}]}]:[],top:true};if(op==='library')return {characters:[]};if(op==='pointerLock')return value;if(op==='route')return null;return {};},adjust:phase=>{calls.push({phase});callbacks.adjust?.(phase==='toggle'?w.document.getElementById('windowEditor').hidden:phase==='done'?false:true);},onAdjust:fn=>callbacks.adjust=fn,onLayout(){},onTop(){},onGaze(){},onFocusToggle(){},focusState(){},windowConfig:async()=>null,onLockProbe:fn=>callbacks.probe=fn,pointerPass:value=>calls.push({pass:value}),notify(){}};
for(const [,file]of html.matchAll(/<script src="([^"]+)"/g))if(file!=='profile.js'&&!file.startsWith('vendor/'))vm.runInContext(fs.readFileSync(root+'/'+file,'utf8'),dom.getInternalVMContext(),{filename:file});
await pause(35);const $=id=>w.document.getElementById(id);assert.equal($('switchModelPet').onclick,$('switchModel').onclick,'desktop model button reuses the same picker');w.document.body.classList.add('pet-only');$('adjustPet').click();assert.equal($('windowEditor').hidden,false);assert.equal($('adjustPet').getAttribute('aria-pressed'),'true');$('adjustPet').click();assert.equal($('windowEditor').hidden,true);$('adjustPet').click();$('finishWindow').click();assert.equal($('adjustPet').getAttribute('aria-pressed'),'false');$('adjustPet').click();w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal($('windowEditor').hidden,true);
assert.equal($('aiPet').getAttribute('aria-pressed'),'true');await Promise.all([$('aiPet').onclick(),$('aiPet').onclick()]);assert.equal(enabled,false);assert.equal(calls.filter(c=>c.op==='preference').length,1);assert.equal($('aiPet').getAttribute('aria-pressed'),'false');assert.equal($('aiMaster').textContent,'开启全部 AI 调用');await $('aiMaster').onclick();assert.equal($('aiPet').getAttribute('aria-pressed'),'true');assert.equal(enabled,true);
failAfterPersist=true;await $('aiPet').onclick();assert.equal(enabled,false);assert.equal($('aiPet').getAttribute('aria-pressed'),'false','a cancelled host call must refresh already persisted state');assert.equal($('aiPet').disabled,false);
showPicker=true;await $('switchModelPet').onclick();assert.equal($('assetDialog').open,true);assert.equal($('assetExtra').querySelectorAll('select').length,2);assert.equal($('assetExtra').querySelectorAll('select')[1].options.length,1);$('assetCancel').click();
await $('lockPet').onclick();for(const id of ['adjustPet','aiPet','switchModelPet']){w.document.elementFromPoint=()=>$(id);callbacks.probe?.(10,10);assert.equal(calls.at(-1).pass,false,'new buttons must stay clickable through transparent lock mode');}
const editor=w.zoneEditor;
w.zoneEditor={editing:true,dragging:false,pointerTarget:target=>target===$('zoneOverlay')};
for(const [target,pass] of [[$('canvas'),true],[$('zoneOverlay'),false],[$('zoneEditPanel'),false],[null,true]]){
 w.document.elementFromPoint=()=>target;
 callbacks.probe(10,10);
 assert.equal(calls.at(-1).pass,pass);
}
w.zoneEditor.dragging=true;
w.document.elementFromPoint=()=>null;
callbacks.probe(-5,10);
assert.equal(calls.at(-1).pass,false,'window keeps pointer capture when the cursor leaves its bounds');
w.zoneEditor.dragging=false;
callbacks.probe(-5,10);
assert.equal(calls.at(-1).pass,true);
w.zoneEditor=editor;
}finally{dom.window.close();}});
test('native adjustment toggle is sender-checked and works before the adjusting guard',()=>{const source=fs.readFileSync(path.resolve(root,'../desktop/main.cjs'),'utf8'),start=source.indexOf("ipcMain.on('pet-adjust-input'"),end=source.indexOf('\n  });',start)+6;const calls=[],win={webContents:{}},context={win,locked:false,adjusting:false,ipcMain:{on(_name,fn){this.handler=fn;}},adjust:on=>calls.push(on)};vm.runInNewContext(source.slice(start,end),context);context.ipcMain.handler({sender:{}},'toggle');assert.equal(calls.length,0);context.ipcMain.handler({sender:win.webContents},'toggle');assert.equal(calls[0],true);context.locked=true;context.ipcMain.handler({sender:win.webContents},'toggle');assert.equal(calls.length,1);});

test('zone drag preserves capture across background hit probes and releases on blur or lost capture',()=>{
 const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
 const $=id=>w.document.getElementById(id);
 try{
  let draw,capture=null;
  w.requestAnimationFrame=fn=>{draw=fn;};
  w.petStore={getItem:()=>null};
  for(const file of ['zones-core.js','body-zones.js','zones-editor.js'])vm.runInContext(fs.readFileSync(root+'/'+file,'utf8'),dom.getInternalVMContext());
  const editor=w.ZoneEditor.init({ready:true,catalog:{model:'test'},meshIds:()=>['mesh'],mesh:()=>null,modelToStage:(x,y)=>({x,y}),stageToModel:(x,y)=>({x,y}),bounds:{x:30,y:30,width:80,height:80},freeze(){}});
  editor.begin();draw();
  const overlay=$('zoneOverlay');
  overlay.setPointerCapture=id=>{capture=id;};
  overlay.hasPointerCapture=id=>capture===id;
  overlay.releasePointerCapture=id=>{assert.equal(id,capture);capture=null;};
  const handle=overlay.querySelector('[data-handle]');
  assert.equal(editor.pointerTarget($('canvas'),1,1),false);
  assert.equal(editor.pointerTarget(handle,30,30),true);
  assert.equal(overlay.style.pointerEvents,'none');
  for(const ending of ['blur','lostpointercapture']){
   const event=new w.MouseEvent('pointerdown',{bubbles:true,clientX:30,clientY:30,button:0});
   Object.defineProperty(event,'pointerId',{value:4});
   handle.dispatchEvent(event);
   assert.equal(editor.dragging,true);
   assert.equal(capture,4);
   (ending==='blur'?w:overlay).dispatchEvent(new w.Event(ending));
   assert.equal(editor.dragging,false);
   assert.equal(capture,null);
  }
  editor.end(false);
  assert.equal(editor.pointerTarget(handle,30,30),false);
 }finally{w.close();}
});

test('toolbar layout restores from desktop preferences and saves orientation and all nine anchors',async()=>{
 const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
 const app=fs.readFileSync(root+'/app.js','utf8');
 const block=app.slice(app.indexOf("const windowEditor=$('windowEditor');"),app.indexOf("for(const edge of ['n','s','w','e'"));
 const $=id=>w.document.getElementById(id);
 let saved={layout:'horizontal',row:2,column:0};
 try{
  w.petDesktop={asset:async(op,value)=>{assert.equal(op,'toolLayout');if(value)saved={...value};return saved;}};
  Object.assign(w,{$,requestAnimationFrame:fn=>fn()});
  vm.runInContext(block,dom.getInternalVMContext());
  await Promise.resolve();
  const tools=$('petTools'),panel=$('toolLayout'),toggle=$('adjustTools');
  assert.equal(tools.dataset.layout,'horizontal');
  assert.equal(tools.dataset.row,'2');
  assert.equal(tools.dataset.column,'0');
  toggle.click();
  assert.equal(panel.hidden,false);
  panel.querySelector('[data-layout=vertical]').click();
  const anchors=[...panel.querySelectorAll('[data-row]')];
  assert.equal(anchors.length,9);
  for(const anchor of anchors){
   anchor.click();
   assert.deepEqual(saved,{layout:'vertical',row:Number(anchor.dataset.row),column:Number(anchor.dataset.column)});
   assert.equal(anchor.getAttribute('aria-pressed'),'true');
  }
  toggle.click();
  assert.equal(panel.hidden,true);
 }finally{w.close();}
});

test('character canvas covers the large viewport and recovers old placement after shrinking',async()=>{
 const {boot}=require('./fixtures/browser-lab.cjs'),f=await boot();
 try{
  const {w,ctx}=f,el=id=>w.document.getElementById(id),stage=el('stage'),canvas=el('canvas');
  w.document.documentElement.classList.add('pet-only');
  for(const file of ['style.css','companion.css']){
   const css=w.document.createElement('style');css.textContent=fs.readFileSync(root+'/'+file,'utf8');w.document.head.append(css);
  }
  assert.equal(w.getComputedStyle(w.document.querySelector('main')).maxWidth,'none');
  let width=2560,height=1440;
  Object.defineProperties(stage,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});
  Object.defineProperty(w,'devicePixelRatio',{value:1.5,configurable:true});
  vm.runInContext(`
   const screen={width:800,height:600};
   app={screen,renderer:{resolution:1,resize(width,height){
    screen.width=width;screen.height=height;
    $('canvas').width=width*this.resolution;$('canvas').height=height*this.resolution;
   }}};
   model={internalModel:{originalWidth:500,originalHeight:700},
    anchor:{set(){}},scale:{x:1,set(x){this.x=x;}},
    position:{x:0,y:0,set(x,y){this.x=x;this.y=y;}},
    getBounds(){const {x,y}=this.position,w=500*this.scale.x;return {x:x-w/2,y,width:w,height:700*this.scale.x};}
   };
   placement={x:844,y:0,zoom:1};resize();
  `,ctx);
  assert.deepEqual([canvas.width,canvas.height],[3840,2160]);
  assert(vm.runInContext('model.getBounds().right??(model.getBounds().x+model.getBounds().width)',ctx)>1800);
  width=350;height=520;
  vm.runInContext('resize()',ctx);
  assert.deepEqual([canvas.width,canvas.height],[525,780]);
  const recovered=vm.runInContext('model.getBounds()',ctx);
  assert(recovered.x>=0&&recovered.x+recovered.width<=width);
  for(const [x,y] of [[-3000,0],[3000,0],[0,-3000],[0,3000]]){
   const b=vm.runInContext(`placement={x:${x},y:${y},zoom:1};resize({dragging:true});model.getBounds()`,ctx);
   assert(Math.min(width,b.x+b.width)-Math.max(0,b.x)>=79);
   assert(Math.min(height,b.y+b.height)-Math.max(0,b.y)>=79);
  }
 }finally{f.dom.window.close();}
});
