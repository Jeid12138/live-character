// Only Electron owns plaintext credentials. The file format stays compatible with 0.12.21.
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
function keyFailure(code,message,stage='key',cause){return Object.assign(Error(message),{voice:{stage,errorCode:code,errorType:cause?.name||'Error',causeCode:cause?.code}})}
const providers=new Set(['breeze','fish','qwen','openai']);
function scope(provider,endpoint){
 if(!providers.has(provider))throw Error('此服务未接入云语音协议');
 let u;try{u=new URL(endpoint)}catch{throw Error('语音接口地址无效')}
 if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('请使用不含密钥和查询参数的 HTTPS 地址');
 const pathname=provider==='breeze'&&u.hostname==='api.breeze.blue'&&['','/v1'].includes(u.pathname.replace(/\/$/,''))?'':u.pathname.replace(/\/$/,'');
 return hash(provider+'\n'+u.origin+pathname);
}
function hash(s){return createHash('sha256').update(s).digest('hex')}
function aliases(provider,endpoint){const first=scope(provider,endpoint),u=new URL(endpoint);return provider==='breeze'&&u.hostname==='api.breeze.blue'&&['','/v1'].includes(u.pathname.replace(/\/$/,''))?[first,hash(provider+'\n'+u.origin+'/v1')]:[first]}
const {normalize,describe}=require('./voice-key.cjs');
module.exports=function vault(directory,safeStorage){
 const file=path.join(directory,'voice-credentials.json');
 function available(){return safeStorage.isEncryptionAvailable()&&safeStorage.getSelectedStorageBackend?.()!=='basic_text'}
 function read(){try{const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.version!==1||!value.entries||typeof value.entries!=='object')throw Error();return {...value,metadata:value.metadata||{}}}catch(e){if(e.code==='ENOENT')return {version:1,entries:{},metadata:{}};throw keyFailure(e.code?'credential_store_read_failed':'credential_store_corrupt',e.code?'无法读取语音密钥库；原文件未覆盖':'语音密钥库格式损坏，原文件未覆盖','key',e)}}
 function write(value){fs.mkdirSync(directory,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.renameSync(tmp,file)}finally{try{fs.unlinkSync(tmp)}catch{}}}
 function find(value,provider,endpoint){return aliases(provider,endpoint).find(id=>value.entries[id])}
 function decrypt(encrypted){if(!available())throw keyFailure('encryption_unavailable','系统加密存储不可用');try{return safeStorage.decryptString(Buffer.from(encrypted,'base64'))}catch{throw keyFailure('decrypt_failed','无法解密已保存的语音密钥，请在本机重新保存')}}
 function status(provider,endpoint){
  const value=read(),id=find(value,provider,endpoint),meta=value.metadata[id]||{},out={scopeFingerprint:scope(provider,endpoint).slice(0,12),saved:!!id,encrypted:available(),fingerprint:null,hint:null,savedAt:meta.savedAt||null,verifiedAt:meta.verifiedAt||null,authState:meta.authState||'unverified'};
  if(id&&available())try{const raw=decrypt(value.entries[id]);out.keyInfo=describe(raw,'stored');let key=raw;try{key=normalize(provider,raw)}catch{}out.fingerprint='sha256:'+hash(key).slice(0,12);out.hint=(provider==='breeze'&&key.startsWith('brz_')?'brz_':'Key')+'…'+key.slice(-4).replace(/[^A-Za-z0-9_-]/g,'')}catch{out.decryptError=true}
  return out;
 }
 return {
  status,
  prepare(provider,endpoint,key,accepted){
   const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null,value=read(),id=scope(provider,endpoint),old=find(value,provider,endpoint),meta={...value.metadata[old]};
   let encrypted;
   if(key!==null){if(!available())throw keyFailure('encryption_unavailable','系统加密存储不可用');encrypted=safeStorage.encryptString(normalize(provider,key)).toString('base64');let unchanged=false;try{unchanged=!!old&&decrypt(value.entries[old])===normalize(provider,key)}catch{}if(!unchanged){meta.savedAt=new Date().toISOString();meta.authState='unverified';meta.verifiedAt=null;}}
   else{if(!old)throw Error('请先输入 API Key');encrypted=value.entries[old];}
   for(const alias of aliases(provider,endpoint)){delete value.entries[alias];delete value.metadata[alias]}
   value.entries[id]=encrypted;value.metadata[id]={...meta,authState:accepted===true?'accepted':accepted===false?'unverified':meta.authState||'unverified',verifiedAt:accepted===true?new Date().toISOString():accepted===false?null:meta.verifiedAt||null};
   return {file,value,assertCurrent(){const now=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;if(now!==before){const error=Error('保存期间密钥库已变化，请重新验证');error.voice={stage:'save',errorCode:'credential_changed',errorType:'Error'};throw error;}}};
  },
  set(provider,endpoint,key){const normalized=normalize(provider,key);if(!available())throw keyFailure('encryption_unavailable','系统加密存储不可用，未保存密钥');const value=read(),id=scope(provider,endpoint);for(const old of aliases(provider,endpoint)){delete value.entries[old];delete value.metadata[old]}value.entries[id]=safeStorage.encryptString(normalized).toString('base64');value.metadata[id]={savedAt:new Date().toISOString(),authState:'unverified'};write(value);return status(provider,endpoint)},
  clear(provider,endpoint){const value=read();for(const id of aliases(provider,endpoint)){delete value.entries[id];delete value.metadata[id]}write(value);return status(provider,endpoint)},
  verified(provider,endpoint,fingerprint,accepted){const value=read(),id=find(value,provider,endpoint);if(!id||status(provider,endpoint).fingerprint!==fingerprint)return false;value.metadata[id]={...value.metadata[id],authState:accepted?'accepted':'rejected',verifiedAt:accepted?new Date().toISOString():null};write(value);return true},
  get(provider,endpoint){const value=read(),id=find(value,provider,endpoint);if(!id)throw keyFailure('key_missing','请先输入并保存 API Key');const key=decrypt(value.entries[id]);try{return normalize(provider,key)}catch(error){if(error.voice)Object.assign(error.voice,describe(key,'stored'));throw error;}}

 };
};
module.exports.scope=scope;
module.exports.normalize=normalize;

module.exports.describe=describe;
