const assert=require('node:assert/strict');
const test=require('node:test');
const createScreenObservation=require('../desktop/screen-observation.cjs');

const jpeg='data:image/jpeg;base64,/9j/2Q==';
const scope={sessionId:'session-1',characterId:'character-1',profile:'model-1'};
const automatic={...scope,event:{type:'observe',automatic:true}};

function fixture(capture=async()=>jpeg){
 const preferences={ai:true,processContext:true,screenObservation:true};
 const active={...scope,quitting:false};
 let calls=0;
 const service=createScreenObservation({
  eligible:request=>!active.quitting&&Object.values(preferences).every(value=>value)&&
   request.sessionId===active.sessionId&&request.characterId===active.characterId&&request.profile===active.profile,
  async capture(){calls++;return capture();}
 });
 return {service,preferences,active,calls:()=>calls};
}

test('only opted-in automatic observation captures the active session and model',async()=>{
 const f=fixture();
 for(const event of [{type:'observe'},{type:'chat',automatic:true},{type:'touch',automatic:true},{type:'model_change'}]){
  assert.equal(await f.service.capture({...scope,event}),null);
 }
 for(const key of Object.keys(f.preferences)){
  f.preferences[key]=false;
  assert.equal(await f.service.capture(automatic),null);
  f.preferences[key]=true;
 }
 assert.equal(await f.service.capture({...automatic,sessionId:'other-session'}),null);
 assert.equal(f.calls(),0);
 const frame=await f.service.capture(automatic);
 assert.equal(frame.image,jpeg);
 assert.equal(f.calls(),1);
 assert.equal(f.service.valid(automatic,frame.stamp),true);
});

test('dropping or re-enabling permission and switching or quitting discard a captured image',async()=>{
 for(const change of [
  f=>{f.preferences.ai=false;},
  f=>{f.service.invalidate();},
  f=>{f.active.sessionId='next-session';},
  f=>{f.active.profile='next-model';},
  f=>{f.active.quitting=true;}
 ]){
  let finish;
  const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=f.service.capture(automatic);
  change(f);
  finish(jpeg);
  assert.equal(await pending,null);
 }
 const f=fixture();
 const frame=await f.service.capture(automatic);
 f.preferences.screenObservation=false;
 assert.equal(f.service.valid(automatic,frame.stamp),false);
});

test('capture failure, invalid JPEG and oversized screenshots fall back to text',async()=>{
 for(const capture of [
  async()=>null,
  async()=>{throw Error('display changed');},
  async()=>jpeg.replace('jpeg','png'),
  async()=>jpeg+'A'.repeat(850000)
 ]){
  assert.equal(await fixture(capture).service.capture(automatic),null);
 }
});
