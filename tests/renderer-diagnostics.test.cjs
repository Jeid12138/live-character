const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const diagnostics=require('../desktop/renderer-diagnostics.cjs');
test('renderer errors retain original stack, operation, ID; failed operations do not poison later calls',async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'lc-diag-')),wc=new EventEmitter();
 const context=vm.createContext({window:{petPanel:{read(){throw Error('original-read-cause')},act(){return undefined}}}});
 wc.executeJavaScript=script=>vm.runInContext(script,context);
 const d=diagnostics(wc,data);
 try{
  await assert.rejects(d.execute('window.petPanel.read()','read','request-1'),e=>e.code==='RENDERER_EXECUTION_FAILED'&&/original-read-cause/.test(e.message));
  const snapshot=d.snapshot();assert.equal(snapshot.events[0].operation,'read');assert.equal(snapshot.events[0].requestId,'request-1');assert.match(snapshot.events[0].stack,/original-read-cause/);
  assert.equal(await d.execute('window.petPanel.act()','click'),null);
  assert.deepEqual(await d.execute('({ready:false})','read'),{ready:false});
  wc.emit('console-message',{level:'error',message:'current Event details',sourceId:'app.js',lineNumber:2});
  wc.emit('console-message',{}, {level:'error',message:'renderer console cause',sourceId:'app.js',lineNumber:3});
  wc.emit('console-message',{},2,'legacy warning',4,'studio.js');
  wc.emit('did-fail-load',{},-105,'not found','http://127.0.0.1/',true);
  wc.emit('render-process-gone',{}, {reason:'crashed',exitCode:7});
  wc.emit('preload-error',{},'preload.cjs',Error('preload cause'));
  wc.executeJavaScript=()=>Promise.reject(Error('Script failed to execute'));
  await assert.rejects(d.execute('secret-user-text','chat'),/preload cause/);
  const log=fs.readFileSync(path.join(data,'logs','renderer-last-error.json'),'utf8');assert(!log.includes('secret-user-text'));assert.match(log,/renderer console cause/);assert.match(log,/current Event details/);assert.match(log,/request-1/);
 }finally{fs.rmSync(data,{recursive:true,force:true})}
});
test('public Core readiness probe waits for WASM and reports timeout',async()=>{
 const window=new EventTarget();let n=0;window.Live2DCubismCore={Version:{csmGetVersion(){if(++n<3)throw Error('not initialized');return 100663297},csmGetLatestMocVersion:()=>6}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lab/renderer-health.js'),'utf8'),{window,performance,setTimeout,Error});
 const ready=await window.petRendererHealth.waitCore(500);assert.equal(ready.version,100663297);assert.equal(ready.maxMoc,6);assert(n>=3);
 window.Live2DCubismCore.Version.csmGetVersion=()=>{throw Error('broken wasm')};
 await assert.rejects(window.petRendererHealth.waitCore(40),/初始化超时.*broken wasm/);
});
