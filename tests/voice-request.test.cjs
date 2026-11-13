const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const vaultFactory=require('../desktop/voice-secrets.cjs'),diagFactory=require('../desktop/voice-diagnostics.cjs'),requestFactory=require('../desktop/voice-request.cjs');
const safe={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'dpapi',encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
test('actual native pipeline preserves TLS/401 details, fingerprint, persistent failure and playback result',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-voice-request-')),vault=vaultFactory(dir,safe),diag=diagFactory(dir);
 const body={provider:'breeze',endpoint:'https://api.breeze.blue',model:'breeze-tts-2',voice:'voc_private12345',network:'system',text:'private dialogue not for logs'};let mode='tls',calls=0;
 const key='brz_private_test_key_1234';vault.set(body.provider,body.endpoint,key);vault.verified(body.provider,body.endpoint,vault.status(body.provider,body.endpoint).fingerprint,true);
 const run=requestFactory({vault,diagnostics:diag,isEnabled:()=>true,fetchSynthesis:async sent=>{
  calls++;assert.equal(sent.key,key);if(mode==='tls'){const e=Error('private transport text');e.voice={stage:'connect',errorCode:'proxy_tls_eof',errorType:'SSLEOFError',proxyUsed:true};throw e}
  if(mode==='401'){const e=Error('Breeze did not authenticate');e.voice={stage:'http',errorCode:'AUTH_REQUIRED',httpStatus:401,proxyUsed:false,errorType:'HTTPError'};throw e}
  if(mode==='check')return {validated:true,httpStatus:200,keyStatus:'active'};
  return {audio:{mime:'audio/wav',base64:'UklGRg=='}};
 }});
 try{
  await assert.rejects(run(body));assert.equal(calls,1);let s=diag.snapshot();assert.equal(s.lastError.errorCode,'proxy_tls_eof');assert.equal(s.lastError.errorType,'SSLEOFError');assert.equal(s.lastError.proxyUsed,true);assert.match(s.lastError.keyFingerprint,/^sha256:/);assert(s.lastError.keySavedAt);
  const raw=fs.readFileSync(path.join(dir,'logs/voice-last-error.json'),'utf8');for(const secret of [key,body.text,body.voice,'private transport text'])assert(!raw.includes(secret));
  assert.equal(diagFactory(dir).snapshot().lastError.errorCode,'proxy_tls_eof');
  mode='401';await assert.rejects(run({...body,network:'direct',operation:'check'}));s=diag.snapshot();assert.equal(s.lastError.httpStatus,401);assert.equal(s.lastError.upstreamCode,'AUTH_REQUIRED');assert(!s.lastError.message.includes('地域'));assert.equal(vault.status(body.provider,body.endpoint).authState,'rejected');assert.equal(vault.get(body.provider,body.endpoint),key);
  mode='check';const check=await run({...body,operation:'check'});assert.equal(check.validated,true);assert.equal(vault.status(body.provider,body.endpoint).authState,'accepted');assert(vault.status(body.provider,body.endpoint).verifiedAt);
  mode='audio';const result=await run(body);assert.equal(diag.snapshot().lastError.upstreamCode,'AUTH_REQUIRED','audio receipt alone must not erase an unplayed failure');
  diag.report({requestId:result.requestId,stage:'play',errorCode:'play_blocked',errorType:'NotAllowedError'});assert.equal(diag.snapshot().lastError.errorCode,'play_blocked');
  diag.report({requestId:'00000000-0000-4000-8000-000000000000',stage:'playing'});assert(diag.snapshot().lastError,'ignore stale playback reports');
  diag.report({requestId:result.requestId,stage:'playing'});assert.equal(diag.snapshot().lastError,null);assert.equal(diagFactory.read(dir).status.stage,'playing');diag.fail({stage:'play',errorCode:'play_failed'});diag.clear();assert.equal(diag.snapshot().status,null);assert.equal(diagFactory.read(dir).lastError,null);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('duplicate prevention, late key-check result and key-decryption failure do not send extra requests',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-voice-race-')),vault=vaultFactory(dir,safe),diag=diagFactory(dir);let release,calls=0;
 const body={provider:'breeze',endpoint:'https://api.breeze.blue',operation:'check'};vault.set(body.provider,body.endpoint,'brz_original_key_1234');
 const run=requestFactory({vault,diagnostics:diag,isEnabled:()=>true,fetchSynthesis:()=>{calls++;return new Promise(r=>release=r)}});
 try{const first=run(body);await assert.rejects(run(body),/未重复提交/);assert.equal(calls,1);vault.set(body.provider,body.endpoint,'brz_new_rotated_key_5678');release({validated:true});assert.equal((await first).stale,true);assert.equal(vault.status(body.provider,body.endpoint).authState,'unverified');
 vault.clear(body.provider,body.endpoint);await assert.rejects(run(body),/输入并保存/);assert.equal(calls,1);assert.equal(diag.snapshot().lastError.stage,'key');assert.equal(diag.snapshot().lastError.errorCode,'key_missing');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('synthesis does not require a prior auth check and still respects the global AI switch',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-voice-unverified-')),vault=vaultFactory(dir,safe),diag=diagFactory(dir);let calls=0,enabled=true;
 const body={provider:'breeze',endpoint:'https://api.breeze.blue',model:'breeze-tts-2',voice:'opaque-voice',text:'test'};
 vault.set(body.provider,body.endpoint,'opaque-key');const run=requestFactory({vault,diagnostics:diag,isEnabled:()=>enabled,fetchSynthesis:async sent=>{calls++;assert.equal(sent.key,'opaque-key');return {audio:{mime:'audio/wav',base64:'UklGRg=='}}}});
 try{
  assert.equal(vault.status(body.provider,body.endpoint).authState,'unverified');await run(body);assert.equal(calls,1);assert.equal(vault.status(body.provider,body.endpoint).authState,'accepted');
  enabled=false;await assert.rejects(run(body),/AI 调用已关闭/);assert.equal(calls,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('mute blocks new TTS and discards audio that arrives after muting',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-voice-mute-')),vault=vaultFactory(dir,safe),diag=diagFactory(dir);let muted=true,calls=0,release;
 const body={provider:'breeze',endpoint:'https://api.breeze.blue',model:'breeze-tts-2',voice:'voc_test',text:'hello'};vault.set(body.provider,body.endpoint,'opaque-test-key');
 const run=requestFactory({vault,diagnostics:diag,isEnabled:()=>true,isMuted:()=>muted,fetchSynthesis:()=>{calls++;return new Promise(r=>release=r)}});
 try{await assert.rejects(run(body),/静音/);assert.equal(calls,0);muted=false;const pending=run(body);await new Promise(r=>setImmediate(r));muted=true;release({audio:{mime:'audio/wav',base64:'fixture'}});await assert.rejects(pending,/忽略晚到音频/);assert.equal(calls,1);assert.equal(diag.snapshot().lastError.errorCode,'voice_muted');}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
