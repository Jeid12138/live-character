const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const makeVault=require('../desktop/voice-secrets.cjs'),makeDiag=require('../desktop/voice-diagnostics.cjs'),makeSettings=require('../desktop/voice-settings.cjs'),makeLibrary=require('../desktop/library.cjs');
test('local inference failures retain the selected decoder and stream mode across restarts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-decoder-status-'));
 try{
  const diag=makeDiag(dir);
  const {requestId}=diag.begin({provider:'local',model:'breeze-bf16',cudaGraph:true,streaming:false});
  diag.report({requestId,stage:'request',errorCode:'read_timeout'});
  const error=makeDiag(dir).snapshot().lastError;
  assert.equal(error.errorCode,'read_timeout');
  assert.equal(error.cudaGraph,true);
  assert.equal(error.streaming,false);
  assert.equal(diag.begin({provider:'local'}).cudaGraph,null);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
const safe={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'dpapi',encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
async function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-voice-settings-')),assets={characters:[],active:null},library=makeLibrary(dir,assets,()=>{});library.setup();
 await library.importModels('fixture.zip',[{entry:'model.model3.json',label:'model'}],{name:'测试角色'},async(op,body)=>{if(op==='inspect')return {profile:'a'.repeat(24)};if(op==='extract'){fs.mkdirSync(body.destination,{recursive:true});fs.writeFileSync(path.join(body.destination,'model.model3.json'),'{}');return}});
 const settings={voiceMode:'api',voiceProvider:'breeze',voiceApiUrl:'https://api.breeze.blue',voiceApiModel:'breeze-tts-2',voiceNetwork:'direct',breezeEndpoint:'http://127.0.0.1:7860/v1/audio/speech',breezeInstruction:'',tts:'http://127.0.0.1:61946/synthesize',voice:'voc_test_voice',referenceText:'',autoVoice:true,lipGain:1,lipOffset:0,voiceProfiles:{}};
 library.store('set','companion-config-v4',JSON.stringify({persona:'保留原人格',otherField:'preserved',...settings}));
 const vault=makeVault(path.join(dir,'preferences'),safe),diag=makeDiag(dir);vault.set('breeze',settings.voiceApiUrl,'brz_previous_secret_1234');
 const configFile=path.join(library.dir('setting'),'character.json'),keyFile=path.join(dir,'preferences/voice-credentials.json');
 let calls=[],verifyResult={validated:true},enabled=true;
 const save=makeSettings({vault,diagnostics:diag,owner:()=>assets.active?assets.active.characterId+':'+assets.active.profile:null,isEnabled:()=>enabled,verify:async body=>{calls.push(body.key);if(verifyResult instanceof Error)throw verifyResult;if(typeof verifyResult==='function')return verifyResult(body);return verifyResult},commit:(prefs,key)=>library.commitVoice(prefs,key)});
 return {dir,assets,library,vault,diag,settings,save,calls,configFile,keyFile,setVerify:value=>verifyResult=value,setEnabled:value=>enabled=value,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('offline save accepts opaque keys and never calls authentication even when the service is down',async()=>{
 const f=await fixture();try{
  f.setVerify(Error('network unavailable'));
  const input={settings:{...f.settings,voice:'voc_new'},key:'key_opaque_fixture+new='};const result=await f.save(input);
  assert.equal(input.key,undefined);assert.equal(f.calls.length,0);assert.equal(result.validated,false);assert.equal(result.credential.authState,'unverified');assert.equal(f.vault.get('breeze',f.settings.voiceApiUrl),'key_opaque_fixture+new=');assert.equal(f.diag.snapshot().status.operation,'save');
  const stored=JSON.parse(f.library.store('get','companion-config-v4'));assert.equal(stored.otherField,'preserved');assert.equal(stored.persona,'保留原人格');assert.equal(stored.voice,'voc_new');assert(!JSON.stringify(result).includes('key_opaque_fixture+new='));
 }finally{f.close()}
});
test('native saves keep supported streaming opt-in and clear stale acceleration settings',async()=>{
 const f=await fixture();try{
  const fields=makeSettings.fields;
  assert.equal(fields(f.settings).voiceStreaming,false);
  for(const voiceMode of ['api','local','breeze']){
   const settings=fields({...f.settings,voiceMode,voiceStreaming:true,voiceCudaGraph:true});
   assert.equal(settings.voiceStreaming,voiceMode==='breeze'||voiceMode==='api');
   assert.equal(settings.voiceCudaGraph,false);
  }
  const settings=fields({...f.settings,voiceProvider:'openai',voiceApiUrl:'https://voice.example/v1/audio/speech',voiceStreaming:true});
  assert.equal(settings.voiceStreaming,false);
 }finally{f.close()}
});
test('transport-invalid candidates cannot overwrite key or role settings',async()=>{
 const f=await fixture();try{
  const beforeKey=fs.readFileSync(f.keyFile),beforeConfig=fs.readFileSync(f.configFile);
  await assert.rejects(f.save({settings:f.settings,key:'bad\nkey'}),e=>e.voice.errorCode==='key_format_error');assert.equal(f.calls.length,0);assert(fs.readFileSync(f.keyFile).equals(beforeKey));assert(fs.readFileSync(f.configFile).equals(beforeConfig));assert.equal(f.diag.snapshot().lastError.keySource,'candidate');
 }finally{f.close()}
});
test('cloud settings preserve and explicitly clear a local reference with a Unicode filename',async()=>{
 const f=await fixture();
 try{
  for(const referenceName of ['中文 参考音色.wav','']){
   await f.save({settings:{...f.settings,referenceName}});
   const saved=JSON.parse(f.library.store('get','companion-config-v4'));
   assert.equal(saved.referenceName,referenceName);
  }
 }finally{f.close()}
});
test('draft cloud tests never save a candidate on success or HTTP failure and keep diagnostics redacted',async()=>{
 const f=await fixture();try{
  const beforeKey=fs.readFileSync(f.keyFile),beforeConfig=fs.readFileSync(f.configFile);
  const success=await f.save.check({settings:f.settings,key:'key_public_fixture'});assert(success.validated);assert.equal(success.stored,false);assert(fs.readFileSync(f.keyFile).equals(beforeKey));assert(fs.readFileSync(f.configFile).equals(beforeConfig));assert.equal(f.calls.at(-1),'key_public_fixture');
  const error=Error('private response');error.voice={stage:'http',errorCode:'AUTH_REQUIRED',httpStatus:401,errorType:'HTTPError'};f.setVerify(error);
  await assert.rejects(f.save.check({settings:{...f.settings,voice:'voc_new'},key:'voc_opaque_candidate'}));assert(fs.readFileSync(f.keyFile).equals(beforeKey));assert(fs.readFileSync(f.configFile).equals(beforeConfig));assert.equal(f.vault.status('breeze',f.settings.voiceApiUrl).authState,'unverified');
  const last=f.diag.snapshot().lastError;assert.equal(last.operation,'check');assert.equal(last.keySource,'candidate');assert.equal(last.httpStatus,401);assert.equal(last.upstreamCode,'AUTH_REQUIRED');assert(!JSON.stringify(last).includes('private response'));assert(!JSON.stringify(last).includes('voc_opaque_candidate'));
 }finally{f.close()}
});
test('actual multi-file offline commit rolls back key and settings on a write failure',async()=>{
 const f=await fixture(),rename=fs.renameSync;try{
  const key=fs.readFileSync(f.keyFile),config=fs.readFileSync(f.configFile);let failed=false;
  fs.renameSync=function(from,to){if(to===f.configFile&&!failed){failed=true;throw Object.assign(Error('private io'),{code:'EACCES'})}return rename.apply(this,arguments)};
  await assert.rejects(f.save({settings:{...f.settings,voice:'voc_new'},key:'opaque_candidate_9999'}),e=>e.voice.errorCode==='settings_write_failed');
  assert.equal(f.calls.length,0);assert(fs.readFileSync(f.keyFile).equals(key));assert(fs.readFileSync(f.configFile).equals(config));assert.equal(f.diag.snapshot().lastError.causeCode,'EACCES');assert(!JSON.stringify(f.diag.snapshot()).includes('private io'));
 }finally{fs.renameSync=rename;f.close()}
});
test('stored-key test updates only authentication metadata; offline re-save retains its evidence',async()=>{
 const f=await fixture();try{
  const value=JSON.parse(fs.readFileSync(f.keyFile));value.metadata={};fs.writeFileSync(f.keyFile,JSON.stringify(value));const before=fs.readFileSync(f.configFile);
  let result=await f.save.check({settings:f.settings,key:''});assert(result.stored);assert.equal(result.credential.authState,'accepted');assert.equal(result.credential.savedAt,null);assert(result.credential.verifiedAt);assert(fs.readFileSync(f.configFile).equals(before));
  result=await f.save({settings:f.settings,key:''});assert.equal(f.calls.length,1);assert.equal(result.credential.authState,'accepted');assert.equal(result.credential.savedAt,null);
  result=await f.save({settings:f.settings,key:'brz_previous_secret_1234'});assert.equal(result.credential.authState,'accepted');assert.equal(f.calls.length,1);
 }finally{f.close()}
});
test('late cloud responses cannot validate a replaced credential or a switched character',async()=>{
 const f=await fixture();try{
  let release;f.setVerify(()=>new Promise(r=>release=r));const first=f.save.check({settings:f.settings,key:'candidate_1111'});await new Promise(r=>setImmediate(r));await assert.rejects(f.save({settings:f.settings,key:'candidate_2222'}),e=>e.voice.errorCode==='busy');
  f.vault.set('breeze',f.settings.voiceApiUrl,'external_replacement_3333');release({validated:true});await assert.rejects(first,e=>e.voice.errorCode==='credential_changed');assert.equal(f.vault.get('breeze',f.settings.voiceApiUrl),'external_replacement_3333');assert.equal(f.vault.status('breeze',f.settings.voiceApiUrl).authState,'unverified');
  f.setVerify(async()=>{f.assets.active=null;return {validated:true}});await assert.rejects(f.save.check({settings:f.settings,key:'candidate_4444'}),e=>e.voice.errorCode==='owner_changed');
 }finally{f.close()}
});
test('credential scope mismatch and unsupported provider checks never authenticate',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.save({settings:f.settings,key:'candidate_1234',scope:{provider:'openai',endpoint:'https://other.example/v1/audio/speech'}}),e=>e.voice.errorCode==='credential_scope_changed');assert.equal(f.calls.length,0);
  await assert.rejects(f.save.check({settings:{...f.settings,voiceProvider:'fish',voiceApiUrl:'https://api.fish.audio/v1/tts',voiceApiModel:'s2-pro'},key:'fish_fixture'}),e=>e.voice.errorCode==='provider_unavailable');assert.equal(f.calls.length,0);
 }finally{f.close()}
});
test('encryption, credential-read and settings-read failures retain distinct safe causes',async()=>{
 const f=await fixture(),read=fs.readFileSync,available=safe.isEncryptionAvailable;try{
  safe.isEncryptionAvailable=()=>false;await assert.rejects(f.save({settings:f.settings,key:'candidate_1234'}),e=>e.voice.errorCode==='encryption_unavailable');assert.equal(f.calls.length,0);safe.isEncryptionAvailable=available;
  fs.readFileSync=function(file,...args){if(file===f.keyFile)throw Object.assign(Error('private key file'),{code:'EACCES'});return read.call(this,file,...args)};
  await assert.rejects(f.save({settings:f.settings,key:'candidate_1234'}),e=>e.voice.errorCode==='credential_store_read_failed');assert.equal(f.diag.snapshot().lastError.causeCode,'EACCES');
  fs.readFileSync=function(file,...args){if(file===f.configFile)throw Object.assign(Error('private config'),{code:'EACCES'});return read.call(this,file,...args)};
  const oldKey=read(f.keyFile);await assert.rejects(f.save({settings:f.settings,key:'candidate_5678'}),e=>e.voice.errorCode==='settings_read_failed');assert(read(f.keyFile).equals(oldKey));assert.equal(f.calls.length,0);assert(!JSON.stringify(f.diag.snapshot()).includes('private'));
 }finally{fs.readFileSync=read;safe.isEncryptionAvailable=available;f.close()}
});
test('stored HTTP 401 retains the credential and does not block later offline saving',async()=>{
 const f=await fixture();try{
  const error=Error('private response');error.voice={stage:'http',httpStatus:401,errorCode:'AUTH_REQUIRED'};f.setVerify(error);
  await assert.rejects(f.save.check({settings:f.settings,key:''}));assert.equal(f.diag.snapshot().lastError.keySource,'stored');assert.equal(f.diag.snapshot().lastError.inputKeyEmpty,true);assert.equal(f.vault.status('breeze',f.settings.voiceApiUrl).authState,'rejected');
  await f.save({settings:f.settings,key:'replacement_without_prefix'});assert.equal(f.calls.length,1);assert.equal(f.vault.get('breeze',f.settings.voiceApiUrl),'replacement_without_prefix');assert.equal(f.vault.status('breeze',f.settings.voiceApiUrl).authState,'unverified');
 }finally{f.close()}
});
test('global AI off permits offline save but prevents a cloud connection test',async()=>{
 const f=await fixture();try{
  f.setEnabled(false);await f.save({settings:f.settings,key:'offline_fixture_key'});assert.equal(f.calls.length,0);assert.equal(f.vault.get('breeze',f.settings.voiceApiUrl),'offline_fixture_key');
  await assert.rejects(f.save.check({settings:f.settings,key:''}),e=>e.voice.errorCode==='ai_disabled');assert.equal(f.calls.length,0);
 }finally{f.close()}
});
test('same-character model switching retains voice config and global encrypted credentials without re-entering a key',async()=>{
 const f=await fixture();try{
  await f.save({settings:{...f.settings,voiceGuidance:3},key:'opaque_saved_across_models'});const old=f.assets.active.profile,id=f.assets.active.characterId,scope=f.vault.status('breeze',f.settings.voiceApiUrl).scopeFingerprint;
  await f.library.importModels('second.zip',[{entry:'second.model3.json',label:'second'}],{characterId:id},async(op,body)=>{if(op==='inspect')return {profile:'b'.repeat(24)};if(op==='extract'){fs.mkdirSync(body.destination,{recursive:true});fs.writeFileSync(path.join(body.destination,'second.model3.json'),'{}');return}});
  for(const profile of [old,'b'.repeat(24),old]){f.library.activate(id,profile);const prefs=JSON.parse(f.library.store('get','companion-config-v4'));assert.equal(prefs.voice,'voc_test_voice');assert.equal(prefs.voiceGuidance,3);assert.equal(f.vault.get(prefs.voiceProvider,prefs.voiceApiUrl),'opaque_saved_across_models');assert.equal(f.vault.status(prefs.voiceProvider,prefs.voiceApiUrl).scopeFingerprint,scope);await f.save.check({settings:prefs,key:''});assert.equal(f.calls.at(-1),'opaque_saved_across_models');}
 }finally{f.close()}
});
