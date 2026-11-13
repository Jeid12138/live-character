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
 await pause(30);
 vm.runInContext(`ready=true;window.liveAI=true;catalog={profile:window.petProfile,model:'new',entry:'new.model3.json',motions:[],expressions:[],groups:[],parameters:[],parts:[],physicsIO:{Output:[]},parameterGroups:[],vts:{tracking:[]},controlRig:[],hitAreas:[]};params={ids:[],minimumValues:[],maximumValues:[],defaultValues:[]};character={mode:'tracking',expressions:new Map(),gestures:new Map(),busy(){return false}};app={screen:{width:400,height:600},stage:{},renderer:{resize(){},render(){}}};const vector=(x,y)=>({x,y,set(x,y){this.x=x;this.y=y??x},clone(){return vector(this.x,this.y)},copyFrom(v){this.x=v.x;this.y=v.y}});model={internalModel:{originalWidth:100,originalHeight:200},scale:vector(1,1),anchor:{set(){}},position:vector(0,0),getBounds(){return{x:0,y:0,width:100,height:200}}};`,ctx);

 const $=id=>w.document.getElementById(id);let zone='头';w.zoneEditor.hit=()=>zone?{name:zone}:null;
 w.companion.applySettings({auto:false,touchAI:true,touchDebounceMs:50});
 $('touchDebounceMs').value='250';$('saveCompanion').click();assert.equal(w.companion.config.touchDebounceMs,250);assert.equal(JSON.parse(store.get('companion-config-v4')).touchDebounceMs,250);
 $('touchDebounceMs').value='49';$('saveCompanion').click();assert.equal(w.companion.config.touchDebounceMs,250,'invalid input cannot overwrite setting');
 w.companion.applySettings({touchDebounceMs:50});
 const canvas=$('canvas');canvas.setPointerCapture=()=>{};
 function pointer(type,x=10){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,button:0,clientX:x,clientY:10});canvas.dispatchEvent(e);}
 // An unmoving press must not become a tap at pointerdown or flush mid-hold.
 pointer('pointerdown');await pause(180);assert.equal(calls.length,0);pointer('pointerup');await pause(20);
 pointer('pointerdown');zone='手';pointer('pointermove',30);await pause(120);assert.equal(calls.length,0);pointer('pointerup',30);await pause(100);
 assert.equal(calls.length,1);const e=calls[0].payload.event;assert.equal(e.type,'touch');assert.equal(e.presses,2);assert.deepEqual(Array.from(e.touches,x=>x.zone),['头','手']);assert.ok(e.touches[0].durationMs>=150);assert.ok(e.touches[1].durationMs>=100);assert.ok(calls[0].payload.route.id);
 assert.equal(calls[0].payload.context.characterId,w.petCharacterId);assert.equal(calls[0].payload.event.id.length,36);
 const history=w.companion.history();assert.equal(history.filter(x=>x.kind==='character_event').length,1);assert.equal(history.filter(x=>x.role==='assistant').length,1);
 // The end and lost-capture events must not double-submit.
 pointer('lostpointercapture');await pause(100);assert.equal(calls.length,1);
 const before=w.companion.exportMemory().state.history.length;w.companion.receiveSession({role:'assistant',text:'重复的观察流回复',eventId:e.id});assert.equal(w.companion.exportMemory().state.history.length,before,'own event echo must not replay');
 const originalFetch=w.fetch;let busyOnce=true;w.fetch=async(url,opts)=>{if(url==='/api/decide'&&busyOnce){busyOnce=false;calls.push(JSON.parse(opts.body));return {ok:false,json:async()=>({error:'session busy',code:'SESSION_BUSY',submitted:false})};}return originalFetch(url,opts);};
 pointer('pointerdown');pointer('pointerup');await pause(100);assert.equal(calls.length,2);await pause(550);assert.equal(calls.length,3);assert.equal(calls[1].payload.event.id,calls[2].payload.event.id,'busy retry retains the event ID');assert.equal(w.companion.exportMemory().state.calls.length,2,'busy pre-admission is not charged as an automatic request');assert.equal(w.companion.history().filter(x=>x.kind==='character_event').length,2,'retry must not duplicate local facts');

 w.fetch=async(url,opts)=>{if(url==='/api/decide'){calls.push(JSON.parse(opts.body));return {ok:false,json:async()=>({error:'unknown admission with busy label',code:'SESSION_BUSY'})};}return originalFetch(url,opts);};
 pointer('pointerdown');pointer('pointerup');await pause(100);assert.equal(calls.length,4);await pause(600);assert.equal(calls.length,4,'busy without explicit submitted:false must not retry');
 pointer('pointerdown');w.companion.stop();pointer('pointerup');await pause(100);assert.equal(calls.length,4,'stop discards pending hold');
 pointer('pointerdown');pointer('pointerup');w.liveAI=false;await pause(170);assert.equal(calls.length,4,'master AI off discards pending event');
 console.log('PASS actual pointerdown/hold/slide/up + configurable saved debounce + one event/reply + safe busy retry/echo suppression + cancel/AI-off');dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1});
