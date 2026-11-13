import {mockCharacterPresets} from './fixtures/preset-registry.mjs';
const presetMocks=[];const sessionBridge=(ctx,cfg)=>{const presets=mockCharacterPresets();presetMocks.push(presets);const bridge=originalSessionBridge(ctx,cfg,{presets});bridge.testPresets=presets;return bridge;};
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sessionWorkspace} from '../session-workspace.js';
import {sessionBridge as originalSessionBridge} from '../pet-sessions.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lc-workspace-'));
const previous=process.env.LOCALAPPDATA;
const id='session-11111111-1111-4111-8111-111111111111',id2='session-22222222-2222-4222-8222-222222222222';
const signal=new AbortController().signal;
try{
 let creates=0,renames=0;let workspace;
 const wc={async create({path:folder}){assert.ok(fs.statSync(folder).isDirectory());creates++;workspace??={workspaceId:'ws-fixture',path:folder,title:'workspace',sessionIds:[]};return {workspace,created:creates===1};},async rename(req){renames++;assert.equal(req.workspaceId,workspace.workspaceId);workspace={...workspace,title:req.title};return {workspace};}};
 const ctx={get(name){assert.equal(name,'workspaceController');return wc;}};
 const a=sessionWorkspace(ctx,root);
 assert.equal(a.snapshot().status,'unused');assert.equal(creates,0);
 const pair=await Promise.all([a.ensure(),a.ensure()]);assert.deepEqual(pair,[{workspaceId:'ws-fixture'},{workspaceId:'ws-fixture'}]);assert.equal(creates,1);assert.equal(renames,1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'session-workspace.json'))).workspaceId,'ws-fixture');assert.equal(fs.existsSync(path.join(root,'assets.json')),false);
 await sessionWorkspace(ctx,root).ensure();assert.equal(creates,2);assert.equal(renames,1,'reload reuses same path without re-renaming');
 const unavailable=sessionWorkspace({get(){throw Error('inactive context');}},root+'/unavailable');assert.deepEqual(await unavailable.ensure(),{});assert.equal(unavailable.snapshot().status,'unavailable');
 const conflict=sessionWorkspace({get(){return {create:wc.create,async rename(){throw Error('title already exists');}};}},root);
 workspace.title='workspace';assert.deepEqual(await conflict.ensure(),{});assert.match(conflict.snapshot().message,/title already exists/);
 const wrong=sessionWorkspace({get(){return {create:async()=>({workspace:{workspaceId:'other',path:'/unrelated',title:'Live Character'}}),rename:wc.rename};}},root);
 assert.deepEqual(await wrong.ensure(),{});assert.match(wrong.snapshot().message,/目录/);
 // Bridge integration: only newly created sessions get a workspace; old sessions
 // retain their actual identity/history, and workspace failure never blocks chat.
 process.env.LOCALAPPDATA=path.join(root,'bridge');
 let requests=[],sessionNames=[],old=false,lookup=0,wcCalls=0,prompts=0;
 workspace=undefined;
 const sc={async events(){if(!old)throw Object.assign(Error('missing'),{code:'session/not-found'});return {records:[]};},async create(req){requests.push(req);return {sessionId:req.sessionId};},async rename(req){sessionNames.push(req.title);},async state(){return {running:false,queue:[],cursor:0};},async selectModel(){},async prompt(){prompts++;},async wait(){return {reason:'idle',output:{records:[{event:{type:'assistant/message',data:{message:{content:[{type:'text',text:'{"text":"你好","emotion":"平静","activity":0.5,"duration":4}'}]}}}}]}};}};
 const bridge=sessionBridge({get(name){if(name==='sessionController')return sc;if(name==='workspaceController'){wcCalls++;return wc;}throw Error(name);}},{});
 const payload=sessionId=>({route:{id:sessionId,title:'Live Character · 大肥鱼'},instruction:'personality',context:{characterId:'workspace-role',profile:'workspace-model'},event:{type:'chat',text:'你好'}});
 let result=await bridge.chat(payload(id),signal,{});assert.equal(result.workspaceGrouping.status,'grouped');assert.equal(requests[0].workspaceId,'ws-fixture');assert.equal(requests[0].agentPreset,'fixture-character-preset');assert.equal('cwd' in requests[0],false);assert.equal(prompts,1);
 await bridge.chat(payload(id),signal,{});await bridge.chat(payload(id2),signal,{});assert.equal(wcCalls,1);assert.equal(requests.length,2);assert.ok(sessionNames.every(x=>x==='Live Character · 大肥鱼'));
 old=true;requests=[];const existing=sessionBridge({get(name){if(name==='workspaceController')lookup++;return sc;}},{});
 result=await existing.chat(payload(id),signal,{});assert.equal(result.workspaceGrouping.status,'existing');assert.equal(lookup,0);assert.equal(requests.length,0);
 old=false;const fallback=sessionBridge({get(name){if(name==='workspaceController')throw Error('unsupported');return sc;}},{});
 result=await fallback.chat(payload(id),signal,{});assert.equal(result.workspaceGrouping.status,'unavailable');assert.equal('workspaceId' in requests[0],false);assert.equal(result.plan.text,'你好');
 // Do not submit a session after cancellation during workspace registration.
 const ac=new AbortController();requests=[];
 const cancelled=sessionBridge({get(name){if(name==='workspaceController')return {create:async()=>{ac.abort(Error('cancelled'));return {workspace:{workspaceId:'ws-fixture',title:'Live Character'}};},rename:wc.rename};return sc;}},{});
 await assert.rejects(cancelled.chat(payload(id),ac.signal,{}),/cancelled/);assert.equal(requests.length,0);
 console.log('PASS workspace path reuse, concurrent registration, no repeated rename, isolated state, conflict diagnostics, new-session grouping, preserved old sessions, unavailable fallback and cancellation');
}finally{if(previous===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=previous;fs.rmSync(root,{recursive:true,force:true});}
