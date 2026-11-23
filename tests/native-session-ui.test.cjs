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
w.structuredClone=value=>JSON.parse(JSON.stringify(value));
(async()=>{await pause(30);
 vm.runInContext(`ready=true;window.liveAI=true;catalog={profile:window.petProfile,model:'new',entry:'new.model3.json',motions:[],expressions:[],groups:[],parameters:[],parts:[],physicsIO:{Output:[]},parameterGroups:[],vts:{tracking:[]},controlRig:[],hitAreas:[]};params={ids:[],minimumValues:[],maximumValues:[],defaultValues:[]};character={mode:'tracking',expressions:new Map(),gestures:new Map(),busy(){return false}};app={screen:{width:400,height:600},stage:{},renderer:{resize(){},render(){}}};const vector=(x,y)=>({x,y,set(x,y){this.x=x;this.y=y??x},clone(){return vector(this.x,this.y)},copyFrom(v){this.x=v.x;this.y=v.y}});model={internalModel:{originalWidth:100,originalHeight:200},scale:vector(1,1),anchor:{set(){}},position:vector(0,0),getBounds(){return{x:0,y:0,width:100,height:200}}};`,ctx);


 const $=id=>w.document.getElementById(id);w.companion.applySettings({auto:false,autoVoice:false});
 vm.runInContext(`catalog.controlRig=[{id:'CustomHead',role:'头部姿态',min:-30,max:30,neutral:0}];params={ids:['CustomHead','ParamA'],minimumValues:[-30,0],maximumValues:[30,1],defaultValues:[0,0]};`,ctx);
 const now=new Date().toISOString(),row={role:'assistant',text:'',sessionId:'session-11111111-1111-4111-8111-111111111111',seq:10,at:now,plan:{text:'',emotion:'故作镇定又有点开心',activity:.8,duration:3,pose:{CustomHead:20}}};
 await w.companion.receiveSession(row);assert.equal(w.companion.externalState().emotion,'故作镇定又有点开心');assert.equal(JSON.parse(store.get('companion-memory-v4')).emotion,'故作镇定又有点开心');
 const frame=w.companion.frame(w.performance.now()/1000+.3,{});assert(frame.CustomHead>0,'native silent plan must animate the real parameter layer');
 const count=w.companion.exportMemory().state.history.length;await w.companion.receiveSession(row);assert.equal(w.companion.exportMemory().state.history.length,count,'same seq/session is not replayed');
 // Independent manual mouth bindings validate and persist separately from the performance rig.
 const cfg=w.mouthProfile.capture();cfg.bindings=[{id:'ParamA',input:'A',mode:'linear',enabled:true,inputMin:0,inputMax:1,outputMin:0,outputMax:.7,neutral:0}];w.mouthProfile.apply(cfg);assert.equal(JSON.parse(store.get('mouth-profile-v1')).bindings[0].outputMax,.7);assert.equal(w.mouthProfile.targets({A:1}).ParamA,.7);
 // Explicit paid adaptation uses existing blocking flow, then restores normal UI.
 w.fetch=async(url,opts)=>{if(url==='/api/decide'){const body=JSON.parse(opts.body);calls.push(body);return {ok:true,status:200,json:async()=>({plan:{bindings:[{id:'ParamA',input:'A',mode:'linear',enabled:true,inputMin:0,inputMax:1,outputMin:0,outputMax:.9,neutral:0}]}})};}return {ok:true,json:async()=>({total:0}),text:async()=>''};};
 assert.equal(calls.length,0,'loading mouth profile never calls AI');for(const id of ['adaptParameters','adaptTouch','adaptMouthProfile']){
  $(id).click();await pause(5);assert($('assetDialog').open);assert.match($('assetNote').textContent,/API 额度/);$('assetCancel').click();assert.equal(calls.length,0);
 }
 $('adaptMouthProfile').click();await pause(5);$('assetAccept').click();await pause(100);assert.equal(calls.length,1);assert.equal(calls[0].payload.event.kind,'mouth');assert.equal(w.petAdapting,false,$('adaptMessage').textContent);assert.equal(JSON.parse(store.get('mouth-profile-v1')).source,'ai');assert.equal(w.mouthProfile.targets({A:1}).ParamA,.9);
 let exported;w.Blob=Blob;w.URL.createObjectURL=blob=>{exported=blob;return 'blob:export'};w.HTMLAnchorElement.prototype.click=function(){};await $('save').onclick();assert(exported,'configuration export succeeds');const saved=JSON.parse(await exported.text());assert.equal(saved.mouth.bindings[0].outputMax,.9);assert.equal(saved.companion.touchDebounceMs,250);
 console.log('PASS native silent action/emotion persistence/replay suppression and model mouth save/manual/explicit AI adaptation');dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1});
