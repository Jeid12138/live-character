const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {normalize,describe}=require('../desktop/voice-key.cjs');
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/voice-key-cases.json'),'utf8'));
test('opaque key fixtures permit punctuation while retaining transport checks',()=>{
 for(const item of cases)if(item.valid===false)assert.throws(()=>normalize('breeze',item.input),item.name);else assert.equal(normalize('breeze',item.input),item.normalized,item.name);
 assert.throws(()=>normalize('breeze','brz_'+ 'x'.repeat(4096)));assert.equal(normalize('breeze','brz_'+ 'x'.repeat(4092)).length,4096);
});
test('diagnostic metadata exposes categories and source, not the key or its suffix',()=>{
 const secret='brz_not_real.v1+private/pad=';const info=describe(secret,'stored');assert.equal(info.keySource,'stored');assert.equal(info.keyPrefix,'brz_');assert.equal(info.keyLength,secret.length);for(const flag of ['hasDot','hasPlus','hasSlash','hasEquals'])assert.equal(info[flag],true);assert.equal(info.hasMaskingChar,false);assert(!JSON.stringify(info).includes('not_real'));assert(!JSON.stringify(info).includes('private'));
 try{normalize('breeze','brz_fixture•hidden')}catch(e){assert.equal(e.voice.errorCode,'key_format_error');assert.equal(e.voice.hasMaskingChar,true);assert(!e.message.includes('fixture'))}
});
