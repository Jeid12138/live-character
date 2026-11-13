const {JSDOM}=require(process.env.LC_TEST_JSDOM||'jsdom'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../lab'),html=fs.readFileSync(root+'/index.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:61951'}),w=dom.window,ctx=dom.getInternalVMContext(),store=new Map(),calls=[],snapshots=[];let inferenceFailure=false,appearanceSource='image';
w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
w.HTMLDialogElement.prototype.show=function(){this.open=true};w.HTMLDialogElement.prototype.showModal=w.HTMLDialogElement.prototype.show;w.HTMLDialogElement.prototype.close=function(){this.open=false};w.ResizeObserver=class{observe(){}};
w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=async function(){};
w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};
w.petCharacterId='char-11111111-1111-4111-8111-111111111111';w.petProfile='b'.repeat(24);w.petStorageKey=w.petCharacterId+':'+w.petProfile;
w.fetch=async(url,opts)=>{
 if(url==='/api/decide'){calls.push(JSON.parse(opts.body));if(inferenceFailure)throw Error('fixture model transport failure');return {ok:true,json:async()=>({plan:{text:'这就是我现在的样子。',emotion:'好奇',activity:.5,duration:2,appearance:{summary:'新的蓝色衣服'}},appearanceSource,appearanceNote:appearanceSource==='metadata'?'未建立新的视觉认知':undefined})};}
 if(url==='/api/synthesize'){calls.push({voice:JSON.parse(opts.body)});return {ok:true,json:async()=>({audio:{mime:'audio/wav',base64:'UklGRg=='}})};}
 return {ok:true,json:async()=>url==='/api/catalog'?null:{enabled:false},text:async()=>''};
};
w.petDesktop={store:(_p,op,k,v)=>{if(op==='get')return store.get(k)??null;if(op==='set'){store.set(k,v);return}if(op==='history')return JSON.parse(store.get('history')||'[]');if(op==='append'){const rows=JSON.parse(store.get('history')||'[]');rows.push(v);store.set('history',JSON.stringify(rows));return}if(op==='legacyAllowed')return false;return null},asset:async(op,value)=>{if(op==='experienceRecord')return {...value,eventId:value.event.id,occurredAt:value.event.at};if(op==='experienceQuery')return {rows:[]};if(op==='preferences')return {ai:true};if(op==='appearanceSnapshot'){snapshots.push(value);return true}if(op==='status')return {core:true,characters:[]};if(op==='library')return {current:w.petCharacterId,active:{characterId:w.petCharacterId,profile:w.petProfile},characters:[{id:w.petCharacterId,name:'鱼',models:[{profile:w.petProfile,label:'当前衣服'}]}]};if(op==='route')return {id:'session-11111111-1111-4111-8111-111111111111'};return {}},onLayout(){},onTop(){},onGaze(){},onFocusToggle(){},focusState(){},onAdjust(){},windowConfig:async()=>null,onLockProbe(){},pointerPass(){},notify(){}};
for(const [,file] of html.matchAll(/<script src="([^"]+)"/g)){if(file==='profile.js'||file.startsWith('vendor/'))continue;vm.runInContext(fs.readFileSync(root+'/'+file,'utf8'),ctx,{filename:file})}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await pause(30);let editing=false;Object.defineProperty(w.zoneEditor,'editing',{get:()=>editing});
 // Prepare real model-independent browser wiring, without pretending to render pixels.
 vm.runInContext(`ready=true;window.liveAI=true;catalog={profile:window.petProfile,model:'new',entry:'new.model3.json',motions:[],expressions:[],groups:[],parameters:[],parts:[],physicsIO:{Output:[]},parameterGroups:[],vts:{tracking:[]},controlRig:[],hitAreas:[]};params={ids:[],minimumValues:[],maximumValues:[],defaultValues:[]};character={mode:'tracking',expressions:new Map(),gestures:new Map(),busy(){return false}};app={screen:{width:400,height:600},stage:{},renderer:{resize(){},render(){}}};const vector=(x,y)=>({x,y,set(x,y){this.x=x;this.y=y??x},clone(){return vector(this.x,this.y)},copyFrom(v){this.x=v.x;this.y=v.y}});model={internalModel:{originalWidth:100,originalHeight:200},scale:vector(1,1),anchor:{set(){}},position:vector(0,0),getBounds(){return{x:0,y:0,width:100,height:200}}};`,ctx);
 w.HTMLCanvasElement.prototype.getContext=function(){return {canvas:this,fillRect(){},drawImage(){}}};w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,/9j/2Q==';
 const event=(reason,n)=>({id:'11111111-1111-4111-8111-'+String(n).padStart(12,'0'),type:'model_change',reason,at:new Date().toISOString(),characterId:w.petCharacterId,profile:w.petProfile,from:reason==='initial_import'?'':'旧衣服',to:'新衣服'});
 const first=event('initial_import',1);
 w.sessionStorage.setItem('lc-model-change',JSON.stringify(first));w.sessionStorage.setItem('lc-import-adapt',w.petProfile);w.sessionStorage.setItem('lc-import-result',JSON.stringify({profile:w.petProfile,characterName:'鱼',importedCount:1,modelCount:1}));
 w.dispatchEvent(new w.Event('pet-ready'));await pause(320);assert.equal(calls.length,0,'do not race import adaptation choice');assert(w.document.getElementById('assetDialog').open);
 w.document.getElementById('assetCancel').click();editing=true;await pause(320);assert.equal(calls.length,0,'wait for touch draft review');
 editing=false;await pause(360);assert.equal(calls.length,1);assert.equal(calls[0].payload.event.reason,'initial_import');assert.match(calls[0].payload.event.text,/没有旧形象/);assert.equal(snapshots.length,1);assert.equal(calls[0].payload.visuals.length,1);
 assert.match(JSON.parse(store.get('appearance-memory-v1')).current.summary,/蓝色/);assert.equal(w.sessionStorage.getItem('lc-model-change'),null);
 w.dispatchEvent(new w.Event('pet-ready'));await pause(320);assert.equal(calls.length,1,'duplicate ready must not repeat');
 const added=event('model_added',2);w.sessionStorage.setItem('lc-model-change',JSON.stringify(added));w.dispatchEvent(new w.Event('pet-ready'));await pause(350);assert.equal(calls.length,2);assert.match(calls[1].payload.event.text,/新增并使用/);
 await w.companion.modelChanged(added,async()=>{throw Error('duplicate capture')});assert.equal(calls.length,2);
 // Zero budget must remain zero after persisted config is applied/read.
 w.companion.applySettings({budget:0});const limited=event('model_added',3);await w.companion.modelChanged(limited,async()=>{throw Error('budget must prevent capture')});assert.equal(calls.length,2);
 // Exercise the real companion/studio bubble lifecycle and exported controls.
 const nativeBubbles=[],delays=[],originalTimeout=w.setTimeout;
 w.petDesktop.bubble=p=>nativeBubbles.push(p);w.document.documentElement.classList.add('pet-only');
 w.setTimeout=(fn,delay)=>{delays.push(delay);return 123456};
 const longText='字'.repeat(100);w.companion.bubble(longText);assert.equal(nativeBubbles.at(-1).text,longText);assert(delays.at(-1)>21900&&delays.at(-1)<=22000);assert.equal(w.document.getElementById('petBubble').textContent,longText);
 const rate=w.document.getElementById('bubbleReadSpeed');rate.value='600';rate.onchange();await pause(10);assert(delays.at(-1)>11900&&delays.at(-1)<=12000,'changing speed recalculates remaining reading time');
 const auto=w.document.getElementById('bubbleAutoTime');auto.checked=false;w.document.getElementById('bubbleTime').value='7';auto.onchange();await pause(10);assert(delays.at(-1)>6900&&delays.at(-1)<=7000);
 const saved=w.studioSettings.capture();assert.equal(saved.bubbleReadSpeed,'600');assert.equal(saved.bubbleAutoTime,false);const old={...saved};for(const k of ['bubbleAutoTime','bubbleReadSpeed','bubbleExtraTime'])delete old[k];w.studioSettings.validate(old);
 w.companion.bubble('');assert.equal(nativeBubbles.at(-1).hidden,true);assert.equal(w.document.getElementById('petBubble').hidden,true);w.setTimeout=originalTimeout;
 // A broken bubble/history UI must never discard a successful appearance reply.
 w.companion.applySettings({budget:12});
 const bubbleNode=w.document.getElementById('petBubble'),replace=bubbleNode.replaceChildren;
 bubbleNode.replaceChildren=()=>{throw Error('fixture bubble DOM failure')};
 const broken=event('model_added',4);assert.equal(await w.companion.modelChanged(broken,async()=>['data:image/jpeg;base64,/9j/2Q==']),true);
 let record=JSON.parse(store.get('appearance-memory-v1'));assert.equal(record.events.find(e=>e.id===broken.id).status,'completed');assert.match(record.events.find(e=>e.id===broken.id).reply,/现在的样子/);assert.match(JSON.parse(store.get('model-appearance-v1')).summary,/蓝色/);assert.match(w.document.getElementById('galStatus').textContent,/回复与记忆已保存/);assert(!w.document.getElementById('galStatus').textContent.includes('连接/返回错误'));
 bubbleNode.replaceChildren=replace;
 // Missing shared script and positioning exceptions still arm a hide timer.
 const module=w.LiveBubble,position=w.studioPositionBubble,scheduled=[];delete w.LiveBubble;w.studioPositionBubble=()=>{throw Error('fixture layout failure')};
 w.document.getElementById('bubbleAutoTime').checked=true;w.document.getElementById('bubbleReadSpeed').value='300';w.document.getElementById('bubbleTime').value='4';
 w.setTimeout=(fn,delay)=>{scheduled.push({fn,delay});return 123457};w.companion.bubble('字'.repeat(100));assert(scheduled.at(-1).delay>21900&&scheduled.at(-1).delay<=22000);scheduled.at(-1).fn();assert(bubbleNode.hidden);assert(nativeBubbles.at(-1).hidden);
 w.LiveBubble=module;w.studioPositionBubble=position;w.setTimeout=originalTimeout;
 w.companion.bubble('短句',30);await pause(55);assert(bubbleNode.hidden,'real timer must hide the bubble');
 // Failed inference is explicit and never retried on ordinary ready/startup.
 inferenceFailure=true;const failed=event('model_added',5);assert.equal(await w.companion.modelChanged(failed,async()=>['data:image/jpeg;base64,/9j/2Q==']),false);record=JSON.parse(store.get('appearance-memory-v1'));assert.equal(record.events.find(e=>e.id===failed.id).status,'failed');assert.equal(record.events.find(e=>e.id===failed.id).retry,'manual');
 const beforeRetry=calls.length;w.dispatchEvent(new w.Event('pet-ready'));await pause(300);assert.equal(calls.length,beforeRetry);
 inferenceFailure=false;w.document.getElementById('refreshAppearance').click();await pause(80);assert.equal(calls.length,beforeRetry+1);assert.equal(calls.at(-1).payload.event.reason,'appearance_refresh');assert.equal(calls.at(-1).payload.event.from,calls.at(-1).payload.event.to);assert.match(calls.at(-1).payload.event.text,/形象没有切换/);record=JSON.parse(store.get('appearance-memory-v1'));assert.equal(record.events.at(-1).status,'completed');assert.equal(record.events.at(-1).retryOf,failed.id);
 // The same state written by the page is readable by the DSH session preset.
 const os=require('node:os'),memoryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'lc-ui-context-'));
 try{
  const write=(rel,data)=>{const file=path.join(memoryRoot,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data))};
  const home='asset/_characters/'+w.petCharacterId;write('assets.json',{characters:[{id:w.petCharacterId}]});write(home+'/character.json',{persona:'温柔'});write(home+'/memory/session.json',{id:'session-11111111-1111-4111-8111-111111111111'});write(home+'/memory/state.json',{'appearance-memory-v1':store.get('appearance-memory-v1')});
  const {appearanceContext}=await import('../appearance-context.js');const text=appearanceContext('session-11111111-1111-4111-8111-111111111111',memoryRoot);assert.match(text,/新的蓝色衣服/);assert.match(text,/这就是我现在的样子/);assert.match(text,/appearance_refresh/);
 }finally{fs.rmSync(memoryRoot,{recursive:true,force:true})}
 // A text-only response can finish an interaction without inventing a visual summary.
 appearanceSource='metadata';store.delete('model-appearance-v1');const noImage=event('model_added',6);assert.equal(await w.companion.modelChanged(noImage,async()=>['data:image/jpeg;base64,/9j/2Q==']),true);record=JSON.parse(store.get('appearance-memory-v1'));assert.equal(record.events.at(-1).status,'completed');assert.equal(record.events.at(-1).evidence,'metadata');assert.equal(record.current.summary,'');assert(!store.has('model-appearance-v1'));assert.match(w.document.getElementById('galStatus').textContent,/未建立新的视觉认知/);appearanceSource='image';
 const mode=w.document.getElementById('voiceMode');mode.value='breeze';mode.onchange();assert.equal(w.document.getElementById('breezeEndpoint').parentElement.hidden,false);assert.equal(w.document.getElementById('ttsEndpoint').parentElement.hidden,true);assert.equal(w.document.getElementById('voiceId').parentElement.hidden,true);
 w.document.getElementById('breezeInstruction').value='温柔清晰';await w.document.getElementById('saveVoice').onclick();await w.document.getElementById('voiceTest').onclick();await pause(30);assert.equal(calls.at(-1).voice.mode,'breeze');assert.equal(calls.at(-1).voice.instruction,'温柔清晰');assert.match(calls.at(-1).voice.endpoint,/7860\/v1\/audio\/speech$/);
 console.log('PASS actual page: import confirmation/draft exclusion, first appearance once, model addition once, duplicate-ready guard, zero-budget skip, Breeze controls unchanged; adaptive bubble timer, native payload/settings; injected DOM/layout/module failures, persisted appearance context and explicit manual retry');
})().finally(()=>dom.window.close()).catch(e=>{console.error(e);process.exitCode=1});
