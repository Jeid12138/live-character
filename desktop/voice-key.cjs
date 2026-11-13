// Treat credentials as opaque; only enforce transport limits, never a provider prefix.
function cleaned(_provider,value){return value.trim()}
function describe(value,source='candidate'){
 const raw=typeof value==='string'?value:'',key=cleaned('',raw);
 return {keySource:['candidate','stored'].includes(source)?source:'unknown',rawKeyLength:Math.min(Array.from(raw).length,4097),keyLength:Math.min(Array.from(key).length,4097),keyPrefix:key.startsWith('brz_')?'brz_':key.startsWith('key_')?'key_':key.startsWith('voc_')?'voc_':key?'other':'empty',hasWhitespace:/\s/u.test(raw),hasInvisible:/[\u200b-\u200f\u2060\ufeff]/u.test(raw),hasControl:/[\x00-\x1f\x7f]/.test(raw),hasMaskingChar:/[\u2022\u2026]/u.test(raw),hasNonAscii:/[^\x00-\x7f]/.test(key),hasDot:key.includes('.'),hasPlus:key.includes('+'),hasSlash:key.includes('/'),hasEquals:key.includes('='),normalizationChanged:raw!==key};
}
function normalize(provider,value){
 const fail=message=>{const e=Error(message);e.voice={stage:'key',errorCode:'key_format_error',errorType:'Error',...describe(value)};throw e};
 if(typeof value!=='string'||value.length>4096)fail('API Key 为空、类型不正确或超过 4096 字符');
 // Do not silently remove internal whitespace, zero-width characters or line breaks.
 const key=cleaned(provider,value);
 if(!key||/[^\x21-\x7e]/.test(key))fail('API Key 不能为空或包含内部空白、换行、控制及不可安全发送的请求头字符；未修改密钥内容');
 return key;
}
module.exports={normalize,describe};
