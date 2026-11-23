const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const code=fs.readFileSync(path.join(__dirname,'../desktop/core-runtime.cjs'),'utf8');
test('managed Core verifies payload and consent, never trusts assets.json or path alone',()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'lc-core-'));const body='official-fixture';
 const spec={id:'cubism-core',directory:'core',executable:'live2dcubismcore.min.js',licenseRevision:'test-r5',files:[{sha256:crypto.createHash('sha256').update(body).digest('hex')}]};
 const module={exports:{}};vm.runInNewContext(code,{require:id=>id==='./core-runtime.json'?spec:require(id),module,Error});const managed=module.exports;
 const core=path.join(data,'core'),file=path.join(core,spec.executable);fs.mkdirSync(core);fs.writeFileSync(file,body);
 const state=revision=>fs.writeFileSync(path.join(data,'install-state.json'),JSON.stringify({dependencies:{'cubism-core':{licenseRevision:revision}}}));
 try{
  assert.throws(()=>managed(data),/缺失或无法校验/);state('wrong');assert.throws(()=>managed(data),/尚未确认/);
  state('test-r5');assert.equal(managed(data),file);fs.writeFileSync(file,'corrupt');assert.throws(()=>managed(data),/损坏或版本/);
  fs.rmSync(file);assert.throws(()=>managed(data),/缺失或无法校验/);
  const outside=path.join(data,'external');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,spec.executable),body);
  fs.rmdirSync(core);fs.symlinkSync(outside,core,process.platform==='win32'?'junction':'dir');assert.throws(()=>managed(data),/不能是链接/);
 }finally{fs.rmSync(data,{recursive:true,force:true})}
});
test('installer and desktop share exactly one pinned official Core reference',()=>{
 const manifest=require('../runtime-manifest.json').dependencies.find(d=>d.id==='cubism-core');assert.deepEqual(require('../desktop/core-runtime.json'),manifest);
 assert(!manifest.sourceUrls.some(u=>/latest/i.test(u)));assert.equal(manifest.required[0],manifest.executable);
});
