const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function load(file){const c={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../lab',file),'utf8'),c);return c.module.exports;}
const C=load('companion-core.js'),S=load('state.js');
test('adapted raw states hold independently of a timed pose and drop on release or character change',()=>{
 const ids=['Umbrella','Glasses','Costume','BodyShape','Tail','Prop','ParamAngleX','Mystery','MoonHat','Shoe'];
 const params={ids,minimumValues:ids.map(()=>0),maximumValues:ids.map(()=>1),defaultValues:ids.map(()=>0)};
 const catalog={expressions:[{name:'glasses',data:{Parameters:[{Id:'Glasses',Value:1}]}}],motions:[{name:'show',behavior:{kind:'once'},data:{Curves:[{Target:'Parameter',Id:'Costume'}]}}],vts:{tracking:[{OutputLive2D:'Tail',Input:'Other'}]},physicsIO:{Input:['Prop'],Output:['Shoe']}};
 const classes=Object.fromEntries(ids.map(id=>[id,'state']));
 catalog.controlRig=C.rig(catalog,params,{AngleX:'BodyShape'},Object.fromEntries(ids.map(id=>[id,id])),classes);
 assert.deepEqual(Array.from(catalog.controlRig.filter(r=>r.lifetime==='state'),r=>r.id),['Umbrella','MoonHat']);
 const result=C.validatePlan({parameterStates:ids.map(id=>({id,value:2})).slice(0,8)},catalog,params);
 assert.deepEqual(Array.from(result.plan.parameterStates,e=>[e.id,e.value]),[['Umbrella',1]]);
 assert.equal(result.diagnostics.filter(d=>d.code==='invalid-parameter-state').length,7);
 const blocked=C.validatePlan({parameterStates:[{id:'Umbrella',value:1}]},catalog,params,{protectedStateIds:['Umbrella']});
 assert.equal(blocked.plan.parameterStates.length,0);
 const character=new S.Character(catalog,{}),layer=new C.Layer(),performance=new C.Performance(layer,character);
 performance.start(result.plan,0);
 assert.equal(layer.states.get('Umbrella'),1);
 performance.release(4);
 const timed=C.validatePlan({pose:{Umbrella:0},duration:1},catalog,params).plan;
 performance.start(timed,5);
 assert.equal(layer.at(5.5,{}).Umbrella,0);
 assert.ok(layer.frame(6.5,{Umbrella:0}).Umbrella>0);
 performance.start(C.validatePlan({parameterStates:[{id:'Umbrella',value:null}]},catalog,params).plan,7);
 assert.equal(layer.states.has('Umbrella'),false);
 performance.start(result.plan,8);
 layer.bindCharacter(new S.Character(catalog,{}));
 assert.equal(layer.states.size,0);
 assert.equal(layer.frame(9,{Umbrella:0}).Umbrella,0);
});
test('damaged expression text only recovers a unique complete current expression or alias',()=>{
 const f=fixture(),[smile,blush]=f.catalog.expressions;
 blush.aliases=['脸红'];
 f.params.ids.push('Blush');
 const plan=name=>f.validate({expressions:[{name}],actions:[{kind:'motion',name:'番茄酱'},{kind:'motion',name:'chuipaopao'},{kind:'motion',name:'喷水'}]});
 const restored=plan('脸\uFFFD红');
 assert.equal(restored.plan.expressions[0].name,'blush');
 assert.equal(restored.plan.actions.length,0);
 assert.equal(restored.diagnostics.filter(d=>d.code==='unknown-motion').length,3);
 assert.ok(restored.diagnostics.some(d=>d.code==='expression-replacement-character-removed'&&d.id==='脸\uFFFD红'));
 for(const name of ['脸\uFFFD','\uFFFD','别的脸\uFFFD红'])assert.equal(plan(name).plan.expressions.length,0);
 smile.aliases=['脸红'];
 assert.equal(plan('脸\uFFFD红').plan.expressions.length,0);
 smile.aliases=[];
 f.params.ids.length=0;
 assert.equal(plan('脸\uFFFD红').plan.expressions.length,0);
});
test('body shape persists through performance completion and a later reply until switched or closed',()=>{
 const f=fixture();
 for(const [name,value] of [['幼体',1],['成体',2]]){
  f.catalog.expressions.push({name,behavior:{fade:.1},data:{Parameters:[{Id:'BodyShape',Value:value,Blend:'Overwrite'}]}});
 }
 f.params.ids.push('BodyShape');
 f.catalog.parameters=[{Id:'BodyShape',Name:'体型'}];
 f.performance.start(f.validate({expressions:[{name:'幼体'}]}).plan,0);
 f.performance.tick(5);
 assert.equal(f.character.frame(30).BodyShape,1);
 assert.equal(f.character.expressions.get('幼体').expires,null);
 f.performance.start(f.validate({expressions:[{name:'blush',seconds:1}]}).plan,30);
 f.performance.tick(35);
 f.character.frame(35);
 assert.equal(f.character.frame(40).BodyShape,1);
 assert.equal(f.character.expressions.has('blush'),false);
 f.performance.start(f.validate({expressions:[{name:'成体'}]}).plan,40);
 assert.equal(f.character.frame(41).BodyShape,2);
 assert.equal(f.character.expressions.has('幼体'),false);
 f.performance.start(f.validate({expressions:[{name:'成体',on:false}]}).plan,45);
 f.character.frame(46);
 assert.equal(f.character.expressions.has('成体'),false);
});
test('state and emotion defaults follow the current model bindings and respect explicit timing and ownership',()=>{
 const f=fixture();
 f.catalog.parameters=[{Id:'Param140',Name:'伞'},{Id:'key7',Name:'7. 脸红'},{Id:'k1',Name:'黑框眼镜'},{Id:'k2',Name:'钢盆'},{Id:'timer',Name:'道具'}];
 for(const {Id} of f.catalog.parameters){
  f.params.ids.push(Id);
  f.catalog.expressions.push({name:Id,data:{Parameters:[{Id,Value:1}]},behavior:{fade:.1,autoOff:Id==='timer',autoOffSeconds:2}});
 }
 const info=new Map(C.animationInfo(f.catalog,f.params).expressions.map(e=>[e.name,e.lifetime]));
 for(const name of ['Param140','k1','k2'])assert.equal(info.get(name),'state');
 for(const name of ['key7','timer'])assert.equal(info.get(name),'temporary');
 const plan=(...expressions)=>f.validate({expressions}).plan;
 const defaults=plan({name:'Param140'},{name:'key7'},{name:'timer'});
 assert.equal(defaults.expressions[0].persistent,true);
 assert.equal(defaults.expressions[1].persistent,false);
 assert.equal(defaults.expressions[2].seconds,2);
 assert.equal(plan({name:'Param140',seconds:1}).expressions[0].persistent,false);
 assert.equal(plan({name:'Param140',persistent:false}).expressions[0].persistent,false);
 assert.equal(plan({name:'key7',persistent:true}).expressions[0].persistent,true);
 f.character.setExpression('Param140',true,0);
 const manual=f.character.expressions.get('Param140');
 f.performance.start(defaults,1);
 f.performance.tick(10);
 f.character.frame(10);
 f.character.frame(11);
 assert.equal(f.character.expressions.get('Param140'),manual);
 assert.equal(manual.aiOwned,undefined);
 assert.equal(f.character.expressions.has('key7'),false);
 f.performance.start(plan({name:'Param140',on:false}),12);
 f.character.frame(13);
 assert.equal(f.character.expressions.has('Param140'),false);
});
function fixture(){const motion=(name,d=.4)=>({name,behavior:{kind:'once',fade:.1},data:{Meta:{Duration:d},Curves:[]}}),catalog={profile:'skin-A',controlRig:[],motions:[motion('wave',.8),motion('nod',.7),motion('bow',.7)],expressions:[{name:'smile',behavior:{fade:.1},data:{Parameters:[{Id:'Smile',Value:1}]}},{name:'blush',behavior:{fade:.1},data:{Parameters:[{Id:'Blush',Value:1}]}}]};for(const p of S.pairs)catalog.motions.push(motion(p.open,.2),motion(p.close,.3));const options={gestureNames:S.pairs.map(g=>g.name),gestureDefinitions:C.gestureInfo(catalog,S.pairs)},params={ids:[],minimumValues:[],maximumValues:[],defaultValues:[]},character=new S.Character(catalog,{}),layer=new C.Layer(),performance=new C.Performance(layer,character),calls=[];for(const kind of ['motion','gesture','setExpression']){const fn=character[kind].bind(character);character[kind]=(...args)=>{calls.push({kind,args});return fn(...args);};}const validate=p=>C.validatePlan({text:'先后做给你看。',emotion:'期待',activity:.6,duration:4,...p},catalog,params,options);return {catalog,params,options,character,layer,performance,calls,validate};}
test('explicit actions start at 0 / 1.2 / 2.3 seconds, expressions remain simultaneous',()=>{const f=fixture(),p=f.validate({actions:[{kind:'motion',name:'wave',at:0,seconds:1.2},{kind:'motion',name:'nod',at:1.2,seconds:1.1},{kind:'motion',name:'bow',at:2.3,seconds:1}],expressions:[{name:'smile'},{name:'blush'}]}).plan;f.performance.start(p,10);assert.equal(f.calls.filter(c=>c.kind==='motion').length,1);assert(f.calls.filter(c=>c.kind==='setExpression').every(c=>c.args[2]===10));f.performance.tick(11.19);assert.equal(f.calls.filter(c=>c.kind==='motion').length,1);f.performance.tick(11.2);f.performance.tick(12.3);assert.deepEqual(f.calls.filter(c=>c.kind==='motion').map(c=>[c.args[0],Number((c.args[1]-10).toFixed(3))]),[['wave',0],['nod',1.2],['bow',2.3]]);});
test('legacy motion then gestures run serially with the authored return window reserved',()=>{const f=fixture(),r=f.validate({motion:'wave',gestures:[{name:'竖食指',seconds:1.2},{name:'持草',seconds:1.1}]}),p=r.plan;assert(r.diagnostics.some(d=>d.code==='legacy-actions-sequenced'));assert.deepEqual(Array.from(p.actions,a=>Number(a.at.toFixed(3))),[0,.8,2]);f.performance.start(p,0);assert(!f.character.gestures.size);f.performance.tick(.8);f.character.frame(.8);assert(f.character.gestures.get('right').targetOn);f.character.frame(1.6);assert.equal(f.character.gestures.get('right').targetOn,false,'return begins before next gesture');f.character.frame(2);f.performance.tick(2);assert.equal(f.character.gestures.get('right').pair.name,'持草');assert.equal(f.character.gestures.get('right').start,2);});
test('overlapping, nonmonotonic and invalid times are diagnosed and cannot silently begin together',()=>{const f=fixture(),r=f.validate({duration:1,actions:[{kind:'motion',name:'wave',at:0,seconds:1.2},{kind:'motion',name:'nod',at:0,seconds:1.1},{kind:'motion',name:'bow',at:.1,seconds:1},{kind:'motion',name:'bow',at:-1},{kind:'motion',name:'bow',at:NaN},{kind:'motion',name:'bow',seconds:0},{kind:'expression',name:'smile'}]});for(const code of ['simultaneous-discrete-actions','overlapping-discrete-actions','invalid-action-time','invalid-action-duration','invalid-action-kind','action-timeline-extended'])assert(r.diagnostics.some(d=>d.code===code),code);assert.equal(r.plan.actions.length,3);assert.equal(r.plan.duration,1,'original keyframe duration is unchanged');assert(Math.abs(r.plan.actionEnd-3.3)<1e-8);const decreasing=f.validate({actions:[{kind:'motion',name:'wave',at:3},{kind:'motion',name:'nod',at:1}]});assert(decreasing.diagnostics.some(d=>d.code==='nonmonotonic-action-time'));});
test('native motion and paired entry/return durations are never accelerated to fit a small slot',()=>{const f=fixture(),r=f.validate({actions:[{kind:'motion',name:'wave',seconds:.1},{kind:'gesture',name:'持草',seconds:.1}]});assert.equal(r.plan.actions[0].seconds,.8);assert(Math.abs(r.plan.actions[1].seconds-.6)<1e-8);assert.equal(r.plan.actions[1].at,.8);assert.equal(r.diagnostics.filter(d=>d.code==='action-native-duration').length,2);});
test('short audio ends without dropping future actions; a wall-clock tail finishes once',()=>{const f=fixture(),p=f.validate({duration:1,actions:[{kind:'motion',name:'wave',at:0,seconds:1},{kind:'motion',name:'nod',at:3,seconds:1}]}).plan;f.performance.start(p,10,{media:true,audioDuration:2});f.performance.tick(11,1);f.performance.end(12,2);assert.equal(f.performance.done,false);assert.equal(f.layer.until,11);assert.equal(f.layer.holdUntil,14);f.performance.tick(13);assert.deepEqual(f.calls.filter(c=>c.kind==='motion').map(c=>c.args[0]),['wave','nod']);f.performance.tick(14);assert.equal(f.performance.done,true);assert.equal(f.layer.holdUntil,0);f.performance.tick(99);assert.equal(f.calls.filter(c=>c.kind==='motion').length,2);});
test('action dispatch follows audio currentTime, not wall time, and long audio does not loop motions',()=>{const f=fixture(),p=f.validate({actions:[{kind:'motion',name:'wave',at:0,seconds:1},{kind:'motion',name:'nod',at:1.2,seconds:1}]}).plan;f.performance.start(p,10,{media:true,audioDuration:20});f.performance.tick(15,.5);assert.equal(f.calls.filter(c=>c.kind==='motion').length,1);f.performance.tick(16,6);assert.equal(f.calls.filter(c=>c.kind==='motion').length,2);f.performance.tick(20,10);assert.equal(f.performance.done,false);f.performance.end(30,20);assert.equal(f.performance.done,true);assert.equal(f.calls.filter(c=>c.kind==='motion').length,2);});
test('cancel clears pending actions and does not clear a manually replaced expression',()=>{const f=fixture(),p=f.validate({actions:[{kind:'motion',name:'wave',at:0},{kind:'motion',name:'nod',at:2}],expressions:[{name:'smile'}]}).plan;f.performance.start(p,0,{media:true,audioDuration:20});f.character.setExpression('smile',true,.3,null);f.performance.release(.5,true);f.performance.tick(3,3);assert.equal(f.calls.filter(c=>c.kind==='motion').length,1);assert.equal(f.character.temporary,null);assert.equal(f.character.expressions.get('smile').to,1);});
test('late frames and backward audio seeks do not burst-play expired or previously dispatched actions',()=>{const f=fixture(),p=f.validate({actions:[{kind:'motion',name:'wave',at:0,seconds:1},{kind:'motion',name:'nod',at:2,seconds:1},{kind:'motion',name:'bow',at:4,seconds:1}]}).plan;f.performance.start(p,0,{media:true,audioDuration:5});f.performance.tick(4.2,4.2);assert.deepEqual(f.calls.filter(c=>c.kind==='motion').map(c=>c.args[0]),['wave','bow']);f.performance.tick(5,1);f.performance.tick(6,4.2);assert.equal(f.calls.filter(c=>c.kind==='motion').length,2);});
test('mixed duplicate legacy fields are ignored; early persistent gestures are bounded and final persistent state is owned',()=>{const f=fixture(),r=f.validate({motion:'wave',gestures:[{name:'持草'}],actions:[{kind:'gesture',name:'竖食指',seconds:1,persistent:true},{kind:'motion',name:'nod'},{kind:'gesture',name:'持草',seconds:1,persistent:true}]});assert(r.diagnostics.some(d=>d.code==='legacy-actions-ignored'));assert(r.diagnostics.some(d=>d.code==='persistent-action-bounded'));assert.equal(r.plan.actions[0].persistent,false);assert.equal(r.plan.actions[2].persistent,true);f.performance.start(r.plan,0,{media:true,audioDuration:4});f.character.frame(1);f.character.frame(1.5);f.performance.tick(1.7,1.7);f.performance.tick(2,2);f.character.frame(2);const state=f.character.gestures.get('right');assert.equal(state.pair.name,'持草');assert(state.expires>=4);f.performance.release(3,true);assert.equal(f.character.gestures.get('right').targetOn,false);});
test('cancel removes a native hand transition queued behind an existing manual hand',()=>{const f=fixture();f.character.gesture('竖食指',true,0,null);const p=f.validate({actions:[{kind:'gesture',name:'持草',seconds:1}]}).plan;f.performance.start(p,.3,{media:true,audioDuration:20});assert.equal(f.character.gestures.get('right').queued.name,'持草');f.performance.release(.4,true);assert.equal(f.character.gestures.get('right').queued,null);f.character.frame(3);assert(![...f.character.gestures.values()].some(g=>g.pair.name==='持草'&&g.targetOn));});

test('late hand-return frame uses its scheduled end instead of overlapping the next gesture',()=>{const f=fixture(),p=f.validate({actions:[{kind:'gesture',name:'竖食指',seconds:1.2},{kind:'gesture',name:'持草',seconds:1.2}]}).plan;f.performance.start(p,0);f.performance.tick(1.1);const off=f.calls.find(c=>c.kind==='gesture'&&c.args[0]==='竖食指'&&c.args[1]===false);assert(off);assert(Math.abs(off.args[2]-.8)<1e-8);f.character.frame(1.1);f.performance.tick(1.2);assert.equal(f.character.gestures.get('right').pair.name,'持草');assert.equal(f.character.gestures.get('right').queued,undefined);});
