const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('new character persona is empty and stored personas survive defaults merge',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lab/companion.js'),'utf8');
 const text=source.match(/const defaults=(\{[^\n]+\});/)[1],defaults=vm.runInNewContext('('+text+')');
 assert.equal(defaults.persona,'');
 for(const persona of ['既有性格卡',''])assert.equal({...defaults,...JSON.parse(JSON.stringify({persona}))}.persona,persona);
 const library=fs.readFileSync(path.join(__dirname,'../desktop/library.cjs'),'utf8');
 assert.match(library,/const defaultPersona='';/);
});

test('desktop reads legacy stored cards and persists explicitly empty cards',()=>{
 const os=require('node:os'),library=require('../desktop/library.cjs'),key='companion-config-v4';
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'lc-persona-'));
 try{
  const id='char-11111111-1111-4111-8111-111111111111',profile='a'.repeat(24),home=path.join(data,'asset','_characters',id);
  const model={profile,path:home,entry:'fixture.model3.json'};
  const assets={characters:[{id,name:'角色',models:[model]}],active:{characterId:id,profile}};
  const store=library(data,assets,()=>{}).store;
  fs.mkdirSync(path.join(home,'settings'),{recursive:true});
  fs.writeFileSync(path.join(home,model.entry),'{}');
  const meta=path.join(home,'character.json');
  fs.writeFileSync(meta,'{}');
  fs.writeFileSync(path.join(home,'settings','character.json'),JSON.stringify({[key]:JSON.stringify({persona:'旧设置中的性格卡'})}));
  assert.equal(JSON.parse(store('get',key)).persona,'旧设置中的性格卡');
  for(const persona of [' \t　','']){
   store('set',key,JSON.stringify({persona}));
   assert.equal(JSON.parse(store('get',key)).persona,persona);
   assert.equal(JSON.parse(fs.readFileSync(meta,'utf8')).persona,persona);
  }
 }finally{fs.rmSync(data,{recursive:true,force:true});}
});

test('blank card is a diagnostics-only notice and the scheduled observe route still runs',async()=>{
 const {boot,waitUntil}=require('./fixtures/browser-lab.cjs');
 let tick,now=0;
 const f=await boot({
  storage:new Map([['companion-config-v4',JSON.stringify({persona:' \t　',interval:30})]]),
  beforeCompanion(w){
   const setInterval=w.setInterval.bind(w);
   w.setInterval=(callback,ms)=>callback.toString().includes('nextDue')?(tick=callback,123):setInterval(callback,ms);
   Object.defineProperty(w.performance,'now',{value:()=>now,configurable:true});
  }
 });
 try{
  const {w}=f,diagnostic=w.document.getElementById('personaDiagnostic');
  assert.equal(diagnostic.hidden,false);
  assert.equal(diagnostic.closest('details').querySelector('summary').textContent,'诊断信息');
  assert.match(JSON.stringify(w.petPanel.read({pane:'renderPanel'}).fields),/性格卡为空/);
  assert.doesNotMatch(JSON.stringify(w.petPanel.read({pane:'companionPanel'}).fields),/性格卡为空/);
  assert.doesNotMatch(w.document.getElementById('status').textContent,/性格卡为空/);
  now=120000;w.liveAI=false;tick();
  assert.equal(f.calls.length,0);
  w.liveAI=true;tick();
  await waitUntil(()=>f.calls.some(call=>call.payload?.event.type==='observe'));
  const event=f.calls.find(call=>call.payload?.event.type==='observe').payload;
  assert.equal(event.event.automatic,true);
  assert.equal(event.persona.trim(),'');
  await waitUntil(()=>w.companion.lastReply);
  w.companion.applySettings({persona:'既有性格卡'});
  assert.equal(diagnostic.hidden,true);
  assert.doesNotMatch(JSON.stringify(w.petPanel.read({pane:'renderPanel'}).fields),/性格卡为空/);
  assert.equal(JSON.parse(f.store.get('companion-config-v4')).persona,'既有性格卡');
 }finally{f.dom.window.close();}
});
