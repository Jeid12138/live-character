import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {createRuntimeLauncher,preparationExitError} from '../runtime-launcher.js';
import {dependencyAssistanceAvailability,diagnoseDependencies} from '../dependency-assist.js';
const version=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8'),body=source.slice(source.indexOf('export function apply(')).replace('export function','function');
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture({autoStart=false,stateExists=false,waitAI=false,delayBridge=false}={}){
 const files=new Map(),calls={spawn:[],writes:[],model:0},cleanups=[];let panel,handler;
 const statusFile=path.join('/user','LiveCharacter','install-status.json');
 const preferences=()=>({autoStart});
 const memoryFs={existsSync:()=>stateExists,readFileSync:file=>{if(file.endsWith('assets.json'))return JSON.stringify(preferences());if(!files.has(file))throw Error('not found');return files.get(file);},writeFileSync(file,text){calls.writes.push(file);files.set(file,text);},renameSync(from,to){files.set(to,files.get(from));files.delete(from);},mkdirSync(){}};
 let openBridge;
 const server={on(){},listen(_p,_h,cb){openBridge=cb;if(!delayBridge)cb();},address(){return {port:61990};},close(){},closeAllConnections(){}};
 const VoiceDiagnostics={read:()=>({version,status:null,lastError:{stage:'http',httpStatus:401,upstreamCode:'AUTH_REQUIRED'},events:[]})};
 const context={pluginVersion:version,VoiceDiagnostics,process:{platform:'win32',arch:'x64',pid:100,env:{LOCALAPPDATA:'/user'}},console,path,fs:memoryFs,root:'/plugin',AbortController,AbortSignal,randomBytes:()=>Buffer.alloc(32,1),createRuntimeLauncher,preparationExitError,dependencyAssistanceAvailability,diagnoseDependencies,
  preferences,sessionBridge:()=>({}),installPanel(_ctx,cb){panel=cb;},installHooks:()=>({emit(kind,value){(calls.events??=[]).push({kind,value});},links:()=>[]}),
  http:{createServer(cb){handler=cb;return server;}},spawn(exe,args,options){
   const child=new EventEmitter();child.pid=200+calls.spawn.length;child.exitCode=null;child.killed=false;
   child.finish=code=>{child.exitCode=code;child.emit('exit',code);};child.kill=()=>{child.killed=true;child.finish(-1);};
   calls.spawn.push({exe,args,options,child});
   if(exe==='taskkill.exe')setImmediate(()=>{const installer=calls.spawn.find(row=>row.child.pid===Number(args[1]));installer.child.finish(-1);child.finish(0);});
   return child;
  }
 };
 vm.createContext(context);vm.runInContext(body+'\nthis.startPlugin=apply;',context);
 context.startPlugin({effect(fn){cleanups.push(fn());},get(){return {listProviders:()=>[{id:'deepseek-account'}],resolveModelInfo:async()=>({}),async *stream(request){calls.model++;calls.aiSignal=request.signal;if(waitAI)await new Promise((resolve,reject)=>{if(request.signal.aborted)reject(request.signal.reason);else request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true});});yield {type:'text-delta',text:'{"summary":"修复","action":"install"}'};}};}});
 const finish=(index,installed)=>{const row=calls.spawn[index],runId=row.options.env.PET_PREPARE_ID;files.set(statusFile,JSON.stringify({version,runId,phase:'ready',installed}));row.child.finish(0);};
 const online=async()=>{
  const req=Readable.from(['61991']);req.method='POST';req.url='/desktop-online';req.headers={authorization:'Bearer '+Buffer.alloc(32,1).toString('hex')};
  let code;
  await handler(req,{writeHead(status){code=status;},end(){}});
  return code;
 };
 return{calls,files,panel,finish,handler,cleanups,statusFile,openBridge,online};
}
for(const stateExists of [false,true]){
 const f=await fixture({stateExists});await tick();for(let i=0;i<3;i++)assert.equal(f.panel({op:'dependencies'}).phase,'idle');assert.equal(f.calls.spawn.length,0);assert.equal(f.calls.writes.length,0);assert.equal(f.calls.model,0);
}
for(const phase of ['checking','installing','failed','cancelled','ready']){
 const stale=await fixture({stateExists:true});
 stale.files.set(stale.statusFile,JSON.stringify({version,runId:randomUUID(),phase,manualStart:phase==='ready',message:'历史检查'}));
 assert.equal(stale.panel({op:'dependencies'}).phase,'idle');
 assert.equal(stale.panel({op:'dependencies'}).online,false);
 assert.equal(stale.calls.spawn.length,0);
 assert.equal(stale.calls.writes.length,0);
}
let f=await fixture();const id=randomUUID();f.panel({op:'launch',runId:id});f.panel({op:'launch',runId:randomUUID()});await tick();assert.equal(f.calls.spawn.length,1);assert.equal(f.calls.spawn[0].exe,'powershell.exe');assert.equal(f.calls.spawn[0].options.env.PET_PREPARE_ID,id);f.finish(0,false);await tick();assert.equal(f.calls.spawn.length,2);assert.match(f.calls.spawn[1].exe,/Live Character\.exe$/);
f=await fixture();f.panel({op:'launch',runId:randomUUID()});await tick();f.finish(0,true);await tick();assert.equal(f.calls.spawn.length,1);assert.equal(f.panel({op:'dependencies'}).manualStart,true);assert.match(f.panel({op:'dependencies'}).message,/依赖修复完成/);f.panel({op:'launch',runId:randomUUID()});await tick();assert.equal(f.calls.spawn.length,2);f.finish(1,false);await tick();assert.equal(f.calls.spawn.length,3);
f=await fixture();const cancelId=randomUUID();f.panel({op:'launch',runId:cancelId});await tick();await f.panel({op:'launch-cancel',runId:cancelId});assert.equal(f.calls.spawn.length,2);assert.equal(f.calls.spawn[1].exe,'taskkill.exe');assert.equal(f.calls.spawn[1].args.join(' '),'/PID 200 /T /F');assert.equal(f.panel({op:'dependencies'}).phase,'cancelled');assert(!f.calls.spawn.some(row=>/Live Character\.exe$/.test(row.exe)));
f=await fixture({autoStart:true});await tick();assert.equal(f.calls.spawn.length,1);f.finish(0,false);await tick();assert.equal(f.calls.spawn.length,2);
// Read-only availability neither starts a subprocess nor generates tokens.
f=await fixture();let response;
const req=Readable.from([]);req.method='GET';req.url='/dependency-assist-status';req.headers={authorization:'Bearer '+Buffer.alloc(32,1).toString('hex')};
await f.handler(req,{writeHead(status){assert.equal(status,200);},end(value){response=JSON.parse(value);}});assert.equal(response.enabled,true);assert.equal(f.calls.model,0);assert.equal(f.calls.spawn.length,0);assert.equal(f.calls.writes.length,0);
console.log('PASS actual host apply: fresh/update silence, read-only queries, one preparation, install pause, explicit next launch, process-tree cancellation, opt-in autostart');

for(const autoStart of [false,true]){
 f=await fixture({autoStart,delayBridge:true});await tick();
 assert.equal(f.panel({op:'dependencies'}).online,false);
 assert.equal(f.calls.spawn.length,0);
 const starting=autoStart?null:f.panel({op:'launch',runId:randomUUID()});
 await tick();assert.equal(f.calls.spawn.length,0);
 f.openBridge();await starting;await tick();
 assert.equal(f.panel({op:'dependencies'}).preparing,true);
 f.finish(0,false);await tick();
 assert.equal(f.panel({op:'dependencies'}).starting,true);
 assert.equal(f.panel({op:'dependencies'}).online,false);
 assert.equal(await f.online(),200);
 assert.equal(await f.online(),200);
 assert.equal(f.calls.events.length,1);
 assert.equal(f.panel({op:'dependencies'}).online,true);
 assert.equal(f.panel({op:'dependencies'}).starting,false);
 assert.equal((await f.panel({op:'launch',runId:randomUUID()})).running,true);
 assert.equal(f.calls.spawn.length,2);
 f.calls.spawn[1].child.finish(0);
 assert.equal(f.panel({op:'dependencies'}).phase,'idle');
 assert.equal(f.panel({op:'dependencies'}).online,false);
 assert.equal(await f.online(),409);
}
f=await fixture();await f.panel({op:'launch',runId:randomUUID()});await tick();f.finish(0,false);await tick();
f.calls.spawn[1].child.emit('error',Error('spawn ENOENT'));
assert.equal(f.panel({op:'dependencies'}).starting,false);
assert.equal(f.panel({op:'dependencies'}).phase,'failed');
await f.panel({op:'launch',runId:randomUUID()});await tick();
assert.equal(f.calls.spawn.length,3);
f=await fixture();await f.panel({op:'launch',runId:randomUUID()});await tick();f.finish(0,false);await tick();
f.calls.spawn[1].child.finish(1);
assert.equal(f.panel({op:'dependencies'}).starting,false);
assert.equal(f.panel({op:'dependencies'}).phase,'failed');
assert.match(f.panel({op:'dependencies'}).message,/桌面进程退出/);
console.log('PASS bridge readiness, desktop handshake, already-running detection, normal stop, and retry after spawn failure');

f=await fixture({waitAI:true});const aiRun=randomUUID();f.panel({op:'launch',runId:aiRun});await tick();
const aiReq=Readable.from([JSON.stringify({issues:[{id:'electron',version:'45.2.3',detail:'missing file'}]})]);aiReq.method='POST';aiReq.url='/dependency-assist';aiReq.headers={authorization:'Bearer '+Buffer.alloc(32,1).toString('hex')};
const aiRes=new EventEmitter();aiRes.writableEnded=false;aiRes.writeHead=()=>{};aiRes.end=()=>aiRes.writableEnded=true;
const processing=f.handler(aiReq,aiRes);await tick();assert.equal(f.calls.model,1);await f.panel({op:'launch-cancel',runId:aiRun});await processing;assert.equal(f.calls.aiSignal.aborted,true);assert.equal(f.calls.model,1);assert(!f.calls.spawn.some(row=>/Live Character\.exe$/.test(row.exe)));
console.log('PASS cancelling preparation also aborts pending AI diagnosis, with no duplicate model request');

f=await fixture();const failureId=randomUUID();f.panel({op:'launch',runId:failureId});await tick();f.files.set(f.statusFile,JSON.stringify({version,runId:failureId,phase:'failed',message:'无法读取 locales/af.pak'}));f.calls.spawn[0].child.finish(1);await tick();assert.match(f.panel({op:'dependencies'}).message,/locales\/af.pak/);
f=await fixture();f.panel({op:'launch',runId:randomUUID()});await tick();f.calls.spawn[0].child.finish(1);await tick();assert.equal(f.panel({op:'dependencies'}).phase,'failed');assert.match(f.panel({op:'dependencies'}).message,/准备失败/);
console.log('PASS preparation failures preserve the native diagnostic message');

// Preserve old renderer logs but label their version and surface current preparation failure.
f=await fixture();f.files.set(path.join('/user','LiveCharacter','logs','renderer-last-error.json'),JSON.stringify({version:'0.12.13',events:[{message:'old-render-error'}]}));
const diagnostic=await f.panel({op:'diagnostics'});assert.equal(diagnostic.historical,true);assert.equal(diagnostic.currentVersion,version);assert.equal(diagnostic.version,'0.12.13');assert.match(diagnostic.message,/旧版本/);assert.equal(diagnostic.voice.lastError.httpStatus,401);assert.equal(diagnostic.voice.lastError.upstreamCode,'AUTH_REQUIRED');
const diagnosticRun=randomUUID();await f.panel({op:'launch',runId:diagnosticRun});await tick();
f.files.set(f.statusFile,JSON.stringify({version,runId:diagnosticRun,phase:'failed',message:'程序包缺少必要文件：actual-cause'}));
f.calls.spawn[0].child.finish(1);await tick();
await assert.rejects(()=>f.panel({op:'read'}),/actual-cause/);
console.log('PASS current preparation failure is visible; old renderer logs are explicitly historical');
