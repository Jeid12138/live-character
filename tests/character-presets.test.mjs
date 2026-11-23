import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {characterPresets,characterPresetId,readCharacterContext,readCharacterRuntime} from '../character-presets.js';import {apply as actor} from '../preset/actor.mjs';import {PERFORMANCE_RULES} from '../performance-contract.js';import {sessionBridge} from '../pet-sessions.js';
const a='char-11111111-1111-4111-8111-111111111111',b='char-22222222-2222-4222-8222-222222222222',profile='a'.repeat(24),session='session-11111111-1111-4111-8111-111111111111',signal=new AbortController().signal;
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-character-presets-')),definitions=new Map(),registered=[],disposed=[];const assets={characters:[{id:a,name:'鱼',lastModel:profile},{id:b,name:'猫',lastModel:profile}],active:{characterId:a,profile}};const writeAssets=()=>fs.writeFileSync(path.join(dir,'assets.json'),JSON.stringify(assets));writeAssets();for(const c of assets.characters){const home=path.join(dir,'asset','_characters',c.id);fs.mkdirSync(path.join(home,'settings','models'),{recursive:true});fs.writeFileSync(path.join(home,'character.json'),JSON.stringify({persona:c.id===a?'鱼的性格':'猫的性格'}));}
 const ctx={get(name){assert.equal(name,'agentPresets');return {register:async d=>{registered.push(d);definitions.set(d.id,d);return ()=>{disposed.push(d.id);definitions.delete(d.id);}}};}};const registry=characterPresets(ctx,{dataDirectory:dir});return {dir,assets,writeAssets,ctx,registry,definitions,registered,disposed,clean(){registry.dispose();fs.rmSync(dir,{recursive:true,force:true});}};}
const payload=(id=a,p=profile)=>({persona:id===a?'鱼的性格':'猫的性格',route:{id:session,title:'角色',characterId:id},context:{characterId:id,profile:p,emotion:'当前心情'},modelSettings:{label:'衣服'},voiceSettings:{mode:'api',provider:'breeze',model:'breeze-tts-2',voice:'voc_fixture'},capabilities:{pose:[{id:id===a?'FishHead':'CatHead',min:-30,max:30,neutral:0}]},event:{id:randomUUID(),type:'chat',text:'你好',at:new Date().toISOString()}});
const assemble=(definition)=>{const sections=[],contexts=[];actor({tools:{restrict(){}},systemPrompt:{section:v=>sections.push(v),context:v=>contexts.push(v)}},definition.plugins[0].config);return {sections,contexts};};
test('actual actor registers a single complete system section and character-bound runtime contexts without coding prompt or model names',async()=>{const f=fixture();try{const cfg=await f.registry.publish(payload()),built=assemble(f.definitions.get(cfg.presetId));assert.equal(built.sections.length,1);assert.equal(built.sections[0].complete,true);assert.equal(built.sections[0].text,PERFORMANCE_RULES);assert(!built.sections[0].text.includes('deepseek-flash'));assert(!built.sections[0].text.includes('鱼的性格'));assert.equal(built.contexts[0].required,true);assert(built.contexts[0].text().includes('FishHead'));assert(built.contexts[0].text().includes('breeze-tts-2'));assert.equal(built.contexts[1].text(),'');assert.throws(()=>actor({},{}),/旧版/);}finally{f.clean();}});
test('two roles, same-role new skin, saved persona and voice updates stay isolated on every assembly',async()=>{const f=fixture();try{const fa=await f.registry.publish(payload()),fb=await f.registry.publish(payload(b));const ca=assemble(f.definitions.get(fa.presetId)).contexts[0],cb=assemble(f.definitions.get(fb.presetId)).contexts[0];assert(ca.text().includes('鱼的性格'));assert(!ca.text().includes('CatHead'));assert(cb.text().includes('猫的性格'));const home=path.join(f.dir,'asset','_characters',a);fs.writeFileSync(path.join(home,'character.json'),JSON.stringify({persona:'更新后的鱼人格'}));fs.writeFileSync(path.join(home,'settings','character.json'),JSON.stringify({'companion-config-v4':JSON.stringify({voiceMode:'api',voiceProvider:'qwen',voiceApiModel:'qwen3-tts-flash',voice:'Cherry'})}));assert(ca.text().includes('更新后的鱼人格'));assert(ca.text().includes('qwen3-tts-flash'));assert(!cb.text().includes('Cherry'));const next='b'.repeat(24);f.assets.active.profile=next;f.assets.characters[0].lastModel=next;f.writeAssets();assert.throws(()=>ca.text(),e=>e.code==='LC_CHARACTER_CONFIG_NOT_READY');await f.registry.publish(payload(a,next));assert(ca.text().includes(next));assert.equal(f.registered.length,2);fs.writeFileSync(path.join(home,'settings','models',next+'.json'),JSON.stringify({'performance-rig-v1':JSON.stringify([{id:'NewSavedRig',role:'身体姿态',min:0,max:10,neutral:3}])}));assert(ca.text().includes('NewSavedRig'));const moved=path.join(f.dir,'custom-assets');fs.cpSync(path.join(f.dir,'asset'),moved,{recursive:true});f.assets.assetRoot=moved;f.writeAssets();assert(ca.text().includes('NewSavedRig'));assert(cb.text().includes('猫的性格'));assert(ca.text().includes('"name":"鱼"'));}finally{f.clean();}});
test('runtime evidence is injected only during the LC turn, cleaned after completion, and stale/restarted records are rejected',async()=>{const f=fixture();try{const p=payload();p.pluginContext=[{source:'memory',text:'上次摸了头'}];await f.registry.publish(p);const token=f.registry.beginRuntime(p),config={characterId:a,dataDirectory:f.dir};assert(readCharacterRuntime(config).includes('上次摸了头'));const runtimeFile=path.join(f.dir,'asset','_characters',a,'settings','agent-runtime.json'),saved=JSON.parse(fs.readFileSync(runtimeFile));fs.writeFileSync(runtimeFile,JSON.stringify({...saved,pid:-1}));assert.equal(readCharacterRuntime(config),'');fs.writeFileSync(runtimeFile,JSON.stringify(saved));f.registry.endRuntime(token);assert.equal(readCharacterRuntime(config),'');assert(!readCharacterContext(config).includes('上次摸了头'));}finally{f.clean();}});
test('preset restore, disposal, deletion and unavailable API do not silently use the generic coding preset',async()=>{const f=fixture();try{const c=await f.registry.publish(payload());f.registry.bindSession(session,c.presetId);f.registry.assertSession(session,c.presetId);assert.throws(()=>f.registry.assertSession('session-unknown',c.presetId),e=>e.code==='LC_SESSION_PRESET_REQUIRED');f.registry.dispose();const reloaded=characterPresets(f.ctx,{dataDirectory:f.dir});await reloaded.restore();reloaded.assertSession(session,c.presetId);await reloaded.remove(a);assert(!f.definitions.has(c.presetId));assert.throws(()=>reloaded.assertSession(session,c.presetId));reloaded.dispose();const absent=characterPresets({get:()=>({})},{dataDirectory:f.dir});await assert.rejects(absent.publish(payload()),/register/);absent.dispose();}finally{f.clean();}});
test('real bridge creates the correct preset session and sends only the event while the actor reads full injection',async()=>{const f=fixture();try{let exists=false,request,creation,injected;const sc={events:async()=>{if(!exists)throw Object.assign(Error('missing'),{code:'session/not-found'});return {records:[]};},create:async r=>{creation=r;exists=true;return {sessionId:r.sessionId};},rename:async()=>{},state:async()=>({cursor:0,queue:[]}),prompt:async r=>{request=r;injected=assemble(f.definitions.get(creation.agentPreset)).contexts.map(c=>c.text());},wait:async()=>({reason:'idle',output:{records:[{event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:'{"text":"你好呀","emotion":"开心","activity":0.5,"duration":4}'}]}}}}]}})};const bridge=sessionBridge({get(name){if(name==='sessionController')return sc;throw Error('no workspace');}},{},{presets:f.registry});const p=payload();p.pluginContext=[{source:'memory',text:'之前的互动'}];const r=await bridge.chat(p,signal,undefined);assert.equal(creation.agentPreset,characterPresetId(a));assert.equal(request.content.length,1);assert(request.content[0].text.includes('lc.event.v3'));assert(!request.content[0].text.includes('lc.context.v1'));assert(injected[0].includes('FishHead'));assert(injected[1].includes('之前的互动'));assert.equal(r.transport.configurationBytes,0);assert.deepEqual(r.transport.userContentKinds,['lc.event.v3']);assert.equal(r.transport.configurationPlacement,'agent-preset.context');assert.equal(r.transport.runtimeBytes,0);assert(r.configurationInjected);assert.equal(readCharacterRuntime({dataDirectory:f.dir,characterId:a}),'');}finally{f.clean();}});

test('each skin retains its own most recently assembled capabilities',async()=>{
 const f=fixture();
 try{
  for(const [skin,name] of [[profile,'体型1'],['b'.repeat(24),'喷水']]){
   f.assets.active.profile=skin;f.writeAssets();
   const row=payload(a);row.context.profile=skin;row.capabilities={motions:[{name}]};
   await f.registry.publish(row);readCharacterContext({dataDirectory:f.dir,characterId:a});
  }
  for(const [skin,name] of [[profile,'体型1'],['b'.repeat(24),'喷水']]){
   const file=path.join(f.dir,'asset','_characters',a,'settings','models',skin+'.capabilities.json');
   const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));
   assert.deepEqual(snapshot.capabilities.motions,[{name}]);assert.equal(snapshot.profile,skin);
  }
 }finally{f.clean();}
});

test('empty and legacy cards work for LC events and direct DSH continuation',async()=>{
 const f=fixture();
 try{
  const home=path.join(f.dir,'asset','_characters',a),meta=path.join(home,'character.json'),settings=path.join(home,'settings','character.json');
  let seq=0,assembled='',request,preset;
  const controller={
   events:async()=>{if(!preset)throw Object.assign(Error('missing'),{code:'session/not-found'});return {records:[]};},
   rename:async()=>{},state:async()=>({cursor:seq,queue:[],running:false}),
   create:async value=>{preset=value.agentPreset;return {sessionId:value.sessionId};},
   prompt:async value=>{request=value;assembled=assemble(f.definitions.get(preset)).contexts[0].text();seq+=2;return {accepted:true};},
   wait:async()=>({reason:'idle',output:{records:[{event:{type:'assistant/message',seq,data:{message:{content:[{type:'text',text:'{"text":"还在这儿。","emotion":"平静","activity":0.5,"duration":4}'}]}}}}]}})
  };
  const bridge=sessionBridge({get(name){if(name==='sessionController')return controller;throw Error('no workspace');}},{},{presets:f.registry});
  for(const [type,card] of [['chat',''],['touch',' \t\n'],['observe',undefined],['model_change','']]){
   fs.writeFileSync(meta,JSON.stringify({persona:card}));
   const input=payload();
   input.persona=card;input.event.type=type;
   if(type==='touch')input.event.touches=[{zone:'头',count:1,durationMs:200}];
   if(type==='model_change')input.event.reason='initial_import';
   await bridge.chat(input,signal);
   assert.match(assembled,/"persona":""/);
   assert.match(assembled,/FishHead/);
   assert.match(request.content[0].text,new RegExp('"type":"'+type+'"'));
  }
  const nativeContext=assemble(f.definitions.get(preset)).contexts[0];
  assert.match(assemble(f.definitions.get(preset)).sections[0].text,/性格卡为空时仍正常回应本轮.*自然形成表达方式/);
  fs.writeFileSync(meta,'{}');
  fs.writeFileSync(settings,JSON.stringify({'companion-config-v4':JSON.stringify({persona:'既有性格卡'})}));
  assert.match(nativeContext.text(),/"persona":"既有性格卡"/);
  fs.writeFileSync(meta,JSON.stringify({persona:'　'}));
  assert.match(nativeContext.text(),/"persona":""/);
 }finally{f.clean();}
});
