import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {decide} from '../index.js';
import {appearanceContext} from '../appearance-context.js';
const require=createRequire(import.meta.url),transition=require('../desktop/model-transition.cjs');
const char='char-11111111-1111-4111-8111-111111111111',other='char-22222222-2222-4222-8222-222222222222',id='session-11111111-1111-4111-8111-111111111111',profile='b'.repeat(24);
const before={active:{characterId:char,profile:'a'.repeat(24)}};
const after={active:{characterId:char,profile},characters:[{id:char,name:'鱼',models:[{profile:'a'.repeat(24),label:'旧衣服'},{profile,label:'新衣服'}]}]};
assert.equal(transition({active:null},after),null);assert.equal(transition(after,after),null);assert.equal(transition({active:{characterId:other,profile:'a'}},after),null);
const change=transition(before,after);assert.equal(change.from,'旧衣服');assert.equal(change.to,'新衣服');assert.equal(change.characterId,char);assert.equal(change.profile,profile);
const fresh=transition({active:null,characters:[]},after,{characterId:char,profile,importedCount:1});assert.equal(fresh.reason,'initial_import');assert.equal(fresh.previousProfile,null);assert.equal(fresh.from,'');
const existingRole={active:{characterId:other,profile:'other'},characters:[{id:char,lastModel:'a'.repeat(24),models:[{profile:'a'.repeat(24)}]}]};
const addition=transition(existingRole,after,{characterId:char,profile,importedCount:2});assert.equal(addition.reason,'model_added');assert.equal(addition.from,'旧衣服');assert.equal(addition.importedCount,2);
assert.equal(transition(after,after,{characterId:char,profile,importedCount:1}),null,'missing-file repair must not pretend to be a new appearance');
assert.equal(transition(existingRole,after,{characterId:other,profile}),null);assert.equal(change.reason,'model_switch');
let calls=[],saved=0;const signal=new AbortController().signal;
const mock=images=>({listProviders:()=>[{id:'deepseek-account'}],resolveModelInfo:async()=>({inputModalities:images?['text','image']:['text'],reasoning:{efforts:[{id:'off'}]}}),async *stream(req){calls.push(req);yield {type:'text-delta',index:0,text:JSON.stringify({text:'换好了！',emotion:'自在',appearance:{summary:'画面中的新外观'}})};}});
const payload={instruction:'natural character',event:change,visuals:['data:image/jpeg;base64,/9j/2Q=='],route:{id},context:{characterId:char,profile},inference:{mode:'auto',cap:'high'}};
const attachments={saveImage:async()=>{saved++;return {id:'image-fixture'}}};
const sessionCalls=[];const sessions={chat:async(p,signal,selection,images)=>{sessionCalls.push({p,images});return {sessionId:id,sessionSeq:20,plan:{text:'换好了！',emotion:'自在',appearance:{summary:'画面中的新外观'}}};}};
let result=await decide(mock(true),{},payload,signal,sessions,attachments);assert.equal(calls.length,0);assert.equal(sessionCalls.length,1);assert.equal(saved,1);assert.equal(result.appearanceSource,'image');assert.equal(sessionCalls[0].images[0].type,'image');assert.equal(sessionCalls[0].p.appearanceEvidence,'image');assert.equal(result.sessionId,id);
saved=0;result=await decide(mock(false),{},payload,signal,sessions,attachments);assert.equal(calls.length,0);assert.equal(saved,0);assert.equal(result.appearanceSource,'metadata');assert.match(result.appearanceNote,/未建立新的视觉认知/);assert.equal(sessionCalls.at(-1).images.length,0);assert.equal(sessionCalls.at(-1).p.appearanceEvidence,'metadata');
result=await decide(mock(true),{},payload,signal,sessions,undefined);assert.equal(calls.length,0);assert.equal(result.appearanceSource,'metadata');
await assert.rejects(decide(mock(true),{},payload,signal,{chat(){throw Object.assign(Error('image block rejected'),{submitted:true});}},attachments),/image block rejected/);assert.equal(calls.length,0,'no second direct generation after session failure');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lc-appearance-'));
const observe={...payload,event:{type:'observe',automatic:true}};
await decide(mock(true),{},observe,signal,sessions,attachments);
assert.equal(sessionCalls.at(-1).images.length,1);
assert.equal(sessionCalls.at(-1).p.screenAttached,true);
assert.equal(sessionCalls.at(-1).p.visuals,undefined,'raw screenshot data must stay out of session context');
await decide(mock(false),{},observe,signal,sessions,attachments);
assert.equal(sessionCalls.at(-1).images.length,0);
assert.equal(sessionCalls.at(-1).p.screenAttached,false);
for(const event of [{type:'observe'},{type:'chat'},{type:'touch'}]){
 await assert.rejects(decide(mock(true),{},{...observe,event},signal,sessions,attachments),/图像请求无效/);
}
try{
 const write=(rel,data)=>{const dest=path.join(root,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(data))};
 write('assets.json',{characters:[{id:char},{id:other}],active:{characterId:other}});
 const home='asset/_characters/'+char;write(home+'/character.json',{persona:'独立个性'});write(home+'/memory/session.json',{id});
 write(home+'/memory/state.json',{'appearance-memory-v1':JSON.stringify({current:{characterId:char,profile,label:'新衣服',summary:'蓝色外套',source:'image'},events:[{type:'model_change',reply:'换好了！'}],capabilities:{pose:[{id:'CustomHead'}]}})});
 const text=appearanceContext(id,root);assert.match(text,/独立个性/);assert.match(text,/蓝色外套/);assert.match(text,/换好了/);assert.match(text,/CustomHead/);assert.equal(appearanceContext('session-33333333-3333-4333-8333-333333333333',root),'');
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log('PASS initial import, same-role addition (including inactive role), repair exclusion, same-role switch, one request, image/metadata honesty, explicit same-session image event, persistent session-to-character appearance context');
