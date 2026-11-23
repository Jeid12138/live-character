const assert=require('node:assert/strict');
const test=require('node:test');
const {boot,waitUntil}=require('./fixtures/browser-lab.cjs');

test('the timer alone attaches a screen observation and settings gate its capture',async()=>{
 let timer,captures=0,now=0;
 const prefs={ai:true,processContext:false,screenObservation:false};
 const jpeg='data:image/jpeg;base64,/9j/2Q==';
 const {dom,w,calls}=await boot({
  configure(w){
   Object.defineProperty(w.performance,'now',{value:()=>now});
   const fetch=w.fetch;
   w.fetch=async(...args)=>{
    const response=await fetch(...args);
    return args[0]==='/api/decide'?{ok:true,json:async()=>({duplicate:true})}:response;
   };
   const asset=w.petDesktop.asset;
   w.petDesktop.asset=async(op,value)=>{
    if(op==='preferences')return {...prefs};
    if(op==='preference'){prefs[value.key]=value.enabled;if(value.key==='processContext'&&!value.enabled)prefs.screenObservation=false;return;}
    if(op==='screenObservationCapture'){
     if(!prefs.ai||!prefs.processContext||!prefs.screenObservation)return null;
     captures++;
     return {image:jpeg,stamp:1};
    }
    if(op==='screenObservationValidate')return prefs.ai&&prefs.processContext&&prefs.screenObservation&&value.stamp===1;
    return asset(op,value);
   };
  },
  beforeCompanion(w){
   const setInterval=w.setInterval.bind(w);
   w.setInterval=(callback,ms,...args)=>ms===1000&&String(callback).includes('nextDue')?(timer=callback,99999):setInterval(callback,ms,...args);
  }
 });
 try{
  const $=id=>w.document.getElementById(id);
  assert.equal($('screenObservation').checked,false);
  assert.equal($('screenObservation').disabled,true);
  assert.equal($('screenObservationSettings').hidden,true);
  assert.equal(w.petPanel.read({pane:'assetPanel'}).fields.some(field=>field.css==='screen-observation'),false);
  assert.match($('screenObservationHelp').textContent,/整张截图发送到当前 DSH 会话，并增加 token/);
  $('processContext').click();
  await waitUntil(()=>$('screenObservation').disabled===false);
  assert.equal(w.petPanel.read({pane:'assetPanel'}).fields.some(field=>field.css==='screen-observation'),true);
  $('screenObservation').click();
  await waitUntil(()=>prefs.screenObservation);
  w.companion.applySettings({auto:true,autoVoice:false});
  $('tryDecision').click();
  await waitUntil(()=>calls.length===1&&!w.companion.chatState().busy);
  assert.equal(calls[0].payload.visuals,undefined);
  assert.equal(captures,0);
  now+=360000;
  timer();
  await waitUntil(()=>calls.length===2&&!w.companion.chatState().busy);
  assert.equal(calls[1].payload.event.automatic,true);
  assert.deepEqual(calls[1].payload.visuals,[jpeg]);
  assert.equal(captures,1);
  $('processContext').click();
  await waitUntil(()=>$('screenObservation').disabled);
  assert.equal($('screenObservationSettings').hidden,true);
  assert.equal($('screenObservation').checked,false);
  now+=360000;
  timer();
  await waitUntil(()=>calls.length===3&&!w.companion.chatState().busy);
  assert.equal(calls[2].payload.visuals,undefined);
  assert.equal(captures,1);
 }finally{dom.window.close();}
});
