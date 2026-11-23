import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRuntimeLauncher,preparationExitError} from '../runtime-launcher.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const calls={prepare:[],launch:0,cancel:[],status:[]},pending=[];let running=false;
 const controller=createRuntimeLauncher({
  prepare(id){calls.prepare.push(id);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},
  launchCharacter(){calls.launch++;running=true;},cancelPreparation(id){calls.cancel.push(id);pending.at(-1)?.reject(Error('stopped'));},
  isRunning:()=>running,writeStatus:value=>calls.status.push(value)
 });return{controller,calls,pending};
}
let f=fixture();f.controller.state();await tick();assert.equal(f.calls.prepare.length,0);assert.equal(f.calls.status.length,0);assert.equal(f.calls.launch,0);
// Initial load and repeated read-only polling do no work, regardless of install-state presence.
for(let i=0;i<10;i++)f.controller.state();assert.equal(f.calls.prepare.length,0);
const id=randomUUID();const first=f.controller.launch({runId:id});f.controller.launch();await tick();assert.equal(first.runId,id);assert.equal(f.calls.prepare.length,1);f.pending[0].resolve({installed:false});await tick();assert.equal(f.calls.launch,1);assert.equal(f.controller.state().preparing,false);f.controller.launch();assert.equal(f.calls.prepare.length,1);
// An installation must stop at ready; only another user launch may start the character.
f=fixture();f.controller.launch();await tick();f.pending[0].resolve({installed:true});await tick();assert.equal(f.calls.launch,0);assert.equal(f.calls.status.at(-1).installed,true);assert.equal(f.calls.status.at(-1).manualStart,true);assert.match(f.calls.status.at(-1).message,/依赖修复完成/);await tick();assert.equal(f.calls.prepare.length,1);f.controller.launch();await tick();f.pending[1].resolve({installed:false});await tick();assert.equal(f.calls.launch,1);
// A cancelled attempt, including a late successful result, never starts Electron.
f=fixture();const cancelId=f.controller.launch().runId;await tick();await f.controller.cancel(cancelId);assert.equal(f.calls.cancel.length,1);assert.equal(f.calls.launch,0);assert.equal(f.calls.status.at(-1).phase,'cancelled');f.controller.launch();await tick();f.pending[1].resolve({installed:false});await tick();assert.equal(f.calls.launch,1);
f=fixture();const lateId=f.controller.launch().runId;await tick();const cancel=f.controller.cancel(lateId);f.pending[0].resolve({installed:false});await cancel;assert.equal(f.calls.launch,0);
// Component unmount before the launch RPC arrives cannot resurrect its cancelled request.
f=fixture();const early=randomUUID();await f.controller.cancel(early);assert.throws(()=>f.controller.launch({runId:early}),/取消/);assert.equal(f.calls.prepare.length,0);
f=fixture();const owned=f.controller.launch().runId;await tick();await f.controller.cancel(randomUUID());assert.equal(f.calls.cancel.length,0);f.pending[0].resolve({installed:false});await tick();assert.equal(f.calls.launch,1);await f.controller.cancel(owned);assert.equal(f.calls.cancel.length,0,'closing a settings page must not kill an already-running character');
f=fixture();f.controller.launch();await tick();f.pending[0].reject(Object.assign(Error('cancelled by installer'),{code:'CANCELLED'}));await tick();assert.equal(f.calls.status.at(-1).phase,'cancelled');assert.equal(f.calls.launch,0);
f=fixture();f.controller.launch();await tick();f.pending[0].reject(Error('prepare failed'));await tick();assert.equal(f.calls.status.at(-1).phase,'failed');assert.equal(f.calls.launch,0);
f=fixture();f.controller.launch();await tick();await f.controller.dispose();assert.equal(f.calls.cancel.length,1);assert.equal(f.calls.launch,0);assert.throws(()=>f.controller.launch(),/取消/);
const version='test-version';
const diagnostic={version,runId:id,phase:'failed',message:'runtime probe failed'};
assert.equal(preparationExitError(1,diagnostic,version,id).message,diagnostic.message);
assert.match(preparationExitError(1,{...diagnostic,phase:'checking',message:'正在检查运行环境…'},version,id).message,/准备失败/);
assert.match(preparationExitError(1,diagnostic,version,randomUUID()).message,/准备失败/);
assert.match(preparationExitError(1,diagnostic,'other-version',id).message,/准备失败/);
assert.equal(preparationExitError(2,{...diagnostic,phase:'cancelled'},version,id).code,'CANCELLED');
assert.match(preparationExitError(2,diagnostic,version,id).message,/已取消/);
console.log('PASS launcher: inert load/query, one preparation, install-completion pause, explicit next launch, duplicate suppression, cancel/late success/disposal fences');
