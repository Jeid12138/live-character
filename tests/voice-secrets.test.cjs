const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const create=require('../desktop/voice-secrets.cjs');
test('encrypted persistence, service/endpoint scope, no expiry, deletion and fail-closed storage',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-voice-vault-'));let allowed=true;
 const safe={isEncryptionAvailable:()=>allowed,getSelectedStorageBackend:()=> 'dpapi',encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
 try{
  let vault=create(dir,safe);assert.equal(vault.status('breeze','https://api.breeze.blue').saved,false);
  vault.set('breeze','https://api.breeze.blue','brz_test_long_lived_key');assert(!fs.readFileSync(path.join(dir,'voice-credentials.json'),'utf8').includes('brz_test_long_lived_key'));
  vault=create(dir,safe);assert.equal(vault.get('breeze','https://api.breeze.blue/'),'brz_test_long_lived_key');assert.equal(vault.status('fish','https://api.fish.audio/v1/tts').saved,false);
  assert.throws(()=>vault.get('openai','https://example.com/v1/audio/speech'),/先输入/);assert.throws(()=>vault.set('openai','http://remote.test','key'),/HTTPS/);
  allowed=false;assert.throws(()=>vault.set('breeze','https://api.breeze.blue','brz_new_test_key'),/加密存储/);assert.throws(()=>vault.get('breeze','https://api.breeze.blue'),/加密存储/);allowed=true;
  assert.equal(vault.get('breeze','https://api.breeze.blue'),'brz_test_long_lived_key');vault.clear('breeze','https://api.breeze.blue');assert.equal(vault.status('breeze','https://api.breeze.blue').saved,false);
  fs.writeFileSync(path.join(dir,'voice-credentials.json'),'broken');assert.throws(()=>vault.status('breeze','https://api.breeze.blue'),/损坏/);assert.equal(fs.readFileSync(path.join(dir,'voice-credentials.json'),'utf8'),'broken');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Breeze formatting, overwrite identity, alias reuse and old encrypted file compatibility',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-voice-keys-'));
 const safe={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'dpapi',encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
 const vault=create(dir,safe),endpoint='https://api.breeze.blue';
 try{
  vault.set('breeze',endpoint,'  brz_abc123_secret1234  ');const first=vault.status('breeze',endpoint);assert.equal(vault.get('breeze',endpoint),'brz_abc123_secret1234');assert.match(first.fingerprint,/^sha256:[a-f0-9]{12}$/);assert.match(first.hint,/1234$/);assert(first.savedAt);assert.equal(first.authState,'unverified');
  assert.equal(vault.status('breeze',endpoint+'/v1').fingerprint,first.fingerprint);assert.throws(()=>vault.set('breeze',endpoint,'internal\nnewline'),/请求头字符/);assert.equal(vault.status('breeze',endpoint).fingerprint,first.fingerprint,'rejecting a malformed replacement must preserve the stored key');
  vault.set('breeze',endpoint,'brz_rotated_secret5678');assert.notEqual(vault.status('breeze',endpoint).fingerprint,first.fingerprint);assert.equal(vault.verified('breeze',endpoint,first.fingerprint,true),false);
  const oldId=require('node:crypto').createHash('sha256').update('breeze\n'+endpoint+'/v1').digest('hex');fs.writeFileSync(path.join(dir,'voice-credentials.json'),JSON.stringify({version:1,entries:{[oldId]:safe.encryptString('brz_old_style_secret9999').toString('base64')}}));
  assert.equal(vault.get('breeze',endpoint),'brz_old_style_secret9999');assert.equal(vault.status('breeze',endpoint).savedAt,null,'do not invent the old save time');vault.clear('breeze',endpoint);assert.equal(vault.status('breeze',endpoint+'/v1').saved,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
