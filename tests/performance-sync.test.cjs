const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function load(file){const context={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../lab',file),'utf8'),context);return context.module.exports;}const C=load('companion-core.js'),S=load('state.js');
function fixture(){const params={ids:['Head','Cheek','Physics'],minimumValues:[-30,0,0],maximumValues:[30,1,1],defaultValues:[0,0,0]},catalog={profile:'current-model',controlRig:[{id:'Head',role:'头部姿态',min:-30,max:30,neutral:0},{id:'Cheek',role:'精细表情',min:0,max:1,neutral:0},{id:'Physics',role:'精细表情',min:0,max:1,neutral:0}],physicsIO:{Output:['Physics']},motions:[{name:'special_02',behavior:{kind:'once'},data:{Meta:{Duration:3},Curves:[]}}],expressions:[{name:'Smile',behavior:{fade:.2},data:{Parameters:[{Id:'Cheek',Value:1,Blend:'Overwrite'}]}}]};return {params,catalog};}
const raw=()=>({text:'你好',emotion:'期待',activity:.5,duration:4,pose:{Head:20},fine:{Cheek:1},keyframes:[{at:0,values:{Head:0}},{at:1,values:{Head:20}}],expressions:[{name:'Smile',on:true,seconds:4}]});
test('idle paths reject ambiguous basenames and multiple switches restore original idle',()=>{
 const {catalog,params}=fixture();catalog.motions=[{name:'one',path:'a/idle.motion3.json',behavior:{kind:'idle-alternative'},data:{}},{name:'two',path:'b/idle.motion3.json',behavior:{kind:'idle-alternative'},data:{}}];
 catalog.vts={hotkeys:[{Action:'ChangeIdleAnimation',File:'idle.motion3.json'}]};assert.equal(C.animationInfo(catalog,params).controls.length,0);
 catalog.vts.hotkeys=[{Action:'ChangeIdleAnimation',File:'a\\idle.motion3.json'},{Action:'ChangeIdleAnimation',File:'b/idle.motion3.json'}];assert.equal(C.animationInfo(catalog,params).controls.length,2);
 const character=new S.Character(catalog,{}),original=character.tracking,performance=new C.Performance(new C.Layer(),character);
 const plan=C.validatePlan({...raw(),expressions:[],controls:[{kind:'idle',name:'one'},{kind:'idle',name:'two'}]},catalog,params).plan;
 performance.start(plan,0,{});assert.equal(character.tracking.name,'two');performance.release(1,true);assert.equal(character.tracking,original);
});
test('real hotkey control types clear only AI expressions and restore temporary idle ownership',()=>{
 const {params,catalog}=fixture();catalog.motions[0].path='idle2.motion3.json';catalog.vts={hotkeys:[{Action:'RemoveAllExpressions',Name:''},{Action:'ChangeIdleAnimation',Name:'换待机',File:'idle2.motion3.json'}]};
 const character=new S.Character(catalog,{Head:0,Cheek:0}),layer=new C.Layer(),first=new C.Performance(layer,character);
 first.start(C.validatePlan({...raw(),expressions:[{name:'Smile',persistent:true}]},catalog,params).plan,0,{});
 assert.equal(character.expressions.get('Smile').aiOwned,true);
 const clear=C.validatePlan({...raw(),expressions:[],controls:[{kind:'clearExpressions',name:'清除AI表情'},{kind:'idle',name:'换待机'}]},catalog,params).plan;
 const next=new C.Performance(layer,character),before=character.tracking;next.start(clear,1,{});assert.equal(character.expressions.get('Smile').to,0);assert.equal(character.tracking,catalog.motions[0]);next.release(2,true);assert.equal(character.tracking,before);
 character.setExpression('Smile',true,3,null);new C.Performance(layer,character).start(clear,4,{});assert.equal(character.expressions.get('Smile').to,1,'manual expression survives clearing');
});
test('motion hotkeys are advertised and resolve through normal and legacy action channels',()=>{
 const {params,catalog}=fixture();catalog.motions[0].aliases=['挥手快捷键'];catalog.motions[0].behavior.hotkey='挥手快捷键';
 assert.equal(C.animationInfo(catalog,params).motions[0].hotkey,'挥手快捷键');
 for(const input of [{motion:'挥手快捷键'},{actions:[{kind:'motion',name:'挥手快捷键'}]},{gestures:[{name:'挥手快捷键'}]}])assert.equal(C.validatePlan({...raw(),...input},catalog,params).plan.actions[0].name,'special_02');
 catalog.motions.push({...catalog.motions[0],name:'second'});
 assert.equal(C.validatePlan({...raw(),motion:'挥手快捷键'},catalog,params).plan.actions.length,0);
});
test('custom body and face switches remain discoverable and reach the runtime layer',()=>{
 const params={ids:['Custom01','Custom02','Physics','ParamMouthOpenY'],minimumValues:[0,0,0,0],maximumValues:[2,1,1,1],defaultValues:[0,0,0,0]};
 const catalog={physicsIO:{Output:['Physics']},parameters:[{Id:'Custom01',Name:'体型'},{Id:'Custom02',Name:'黑脸'}],motions:[],expressions:[]};
 catalog.controlRig=C.rig(catalog,params);
 assert.equal(catalog.controlRig.length,2);
 const result=C.validatePlan({text:'变大并黑脸',emotion:'害羞',duration:2,pose:{Custom01:2,Custom02:1}},catalog,params);
 assert.equal(result.plan.pose.Custom01,2);assert.equal(result.plan.pose.Custom02,1);
 const layer=new C.Layer();new C.Performance(layer,new S.Character(catalog,{Custom01:0,Custom02:0})).start(result.plan,0,{});assert.equal(layer.at(1,{Custom01:0,Custom02:0}).Custom02,1);
});
test('unique expression hotkey aliases resolve to stable names; ambiguous aliases are rejected',()=>{
 const {params,catalog}=fixture();catalog.expressions[0].aliases=['黑脸快捷键'];
 assert.equal(C.animationInfo(catalog,params).expressions[0].aliases[0],'黑脸快捷键');
 assert.equal(C.validatePlan({...raw(),expressions:[{name:'黑脸快捷键'}]},catalog,params).plan.expressions[0].name,'Smile');
 catalog.expressions.push({...catalog.expressions[0],name:'Other'});
 assert.equal(C.validatePlan({...raw(),expressions:[{name:'黑脸快捷键'}]},catalog,params).plan.expressions.length,0);
});
test('motion names in an unavailable gesture channel are recovered once with explicit diagnostics',()=>{const {params,catalog}=fixture(),p={...raw(),gestures:[{name:'special_02',seconds:9}]},before=JSON.stringify(p),r=C.validatePlan(p,catalog,params,{gestureNames:[]});assert.equal(r.plan.motion,'special_02');assert.equal(r.plan.gestures.length,0);assert.equal(r.diagnostics[0].code,'motion-channel-corrected');assert(r.warnings[0].includes('special_02'));assert.equal(JSON.stringify(p),before);assert.equal(C.validatePlan({...p,gestures:['special_02']},catalog,params).plan.motion,'special_02');});
test('current-rig channel errors are corrected, proven old-model IDs and unknown IDs are distinct, physics stays reserved',()=>{const {params,catalog}=fixture(),r=C.validatePlan({...raw(),pose:{},fine:{Head:10,ParamArmLA01:5,Invented:1,Physics:1}},catalog,params,{previousParameterIds:['ParamArmLA01']});assert.equal(r.plan.pose.Head,10);assert(!Object.hasOwn(r.plan.fine,'ParamArmLA01'));assert(r.diagnostics.some(d=>d.code==='cross-model-parameter'&&d.id==='ParamArmLA01'));assert(r.diagnostics.some(d=>d.code==='unknown-parameter'&&d.id==='Invented'));assert(r.diagnostics.some(d=>d.code==='unavailable-parameter'&&d.id==='Physics'));});
test('20-second audio stretches a 4-second keyframe timeline and holds a native one-shot without looping',()=>{const {params,catalog}=fixture(),p=C.validatePlan({...raw(),motion:'special_02'},catalog,params).plan,layer=new C.Layer(),character=new S.Character(catalog,{Head:0,Cheek:0,Physics:0}),performance=new C.Performance(layer,character);performance.start(p,0,{media:true,audioDuration:20});assert.equal(layer.until,20);assert.equal(layer.holdUntil,20.25);performance.tick(10,10);assert.equal(layer.at(10,{Head:0}).Head,10);character.frame(10);assert.equal(character.temporary.m.name,'special_02','native last frame is held until its scaled window ends');performance.tick(16,16);character.frame(16);assert.equal(character.temporary,null,'native clip is not restarted after its window');performance.tick(20,20);assert.equal(layer.at(20,{Head:0}).Head,20);performance.release(20);assert.equal(layer.holdUntil,0);assert.equal(character.expressions.get('Smile').to,0);});
test('unknown metadata extends later, Infinity is ignored, no-voice timing stays authored and manual changes retain ownership',()=>{const {params,catalog}=fixture(),p=C.validatePlan(raw(),catalog,params).plan,layer=new C.Layer(),character=new S.Character(catalog,{Head:0,Cheek:0}),performance=new C.Performance(layer,character);performance.start(p,0,{media:true,audioDuration:Infinity});assert.equal(layer.holdUntil,4);performance.extend(20,1,1);assert.equal(layer.holdUntil,20.25);performance.extend(Infinity,2,2);assert.equal(layer.holdUntil,20.25);character.setExpression('Smile',true,2,null);performance.release(3,true);assert.equal(character.expressions.get('Smile').to,1,'manual replacement is not cleared');assert.equal(layer.until,0);const noVoice=new C.Performance(layer,character);noVoice.start(p,30,{});assert.equal(layer.until,34);assert.equal(layer.holdUntil,34);});
test('persistent paired gestures end with the reply while explicit persistent accessories keep their toggle state',()=>{const {params,catalog}=fixture(),pair=S.pairs[0];for(const name of [pair.open,pair.close])catalog.motions.push({name,behavior:{kind:'once'},data:{Meta:{Duration:1},Curves:[]}});const p=C.validatePlan({...raw(),expressions:[{name:'Smile',on:true,persistent:true}],gestures:[{name:pair.name,on:true,persistent:true}]},catalog,params,{gestureNames:[pair.name]}).plan,layer=new C.Layer(),character=new S.Character(catalog,{Head:0,Cheek:0}),performance=new C.Performance(layer,character);performance.start(p,0,{media:true,audioDuration:20});assert.equal(character.gestures.get(pair.group).expires,20.25);performance.release(20);assert.equal(character.gestures.get(pair.group).targetOn,false);assert.equal(character.expressions.get('Smile').to,1);});

test('focus tracking yields the conflicting gaze parameter during a performance and resumes on the next frame',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const app=fs.readFileSync(path.join(__dirname,'../lab/app.js'),'utf8');
 const source=app.slice(app.indexOf('function tick(){'),app.indexOf('function renderParams(){'));
 const controls={},out={};
 const companion={performing:true,advance(){},frame(sec,values){return {...values,Eye:-1}}};
 const scope={window:{companion},document:{querySelectorAll:()=>[]},performance:{now:()=>2000},
  lastTick:1900,lastInput:2000,lastKey:0,lastModeRequest:1900,keyTimes:[],focusActive:true,
  pointer:{x:1,y:0},params:{ids:['Eye'],minimumValues:[-1],maximumValues:[1],defaultValues:[0]},
  catalog:{controlRig:[{id:'Eye',role:'视线横向'}]},smooth:new Map(),locks:new Map(),frames:0,fpsAt:2000,
  $:id=>(controls[id]??={value:35,classList:{toggle(){}}}),put:(id,v)=>{out[id]=v},breathing:()=>({}),
  character:{mode:'tracking',modeStart:0,busy:()=>false,frame:(sec,track)=>track}};
 vm.createContext(scope);vm.runInContext(source+';tick()',scope);assert.equal(out.Eye,-1);
 companion.performing=false;vm.runInContext('tick()',scope);assert.ok(out.Eye>0);
});
