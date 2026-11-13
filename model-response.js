// Accept a single complete JSON object, optionally surrounded by prose or a fence.
export function responseObject(text) {
 const raw=text.trim().replace(/^\uFEFF/,'');
 let parsed;
 try{parsed={value:JSON.parse(raw)};}catch{}
 if(parsed){
  if(parsed.value&&typeof parsed.value==='object'&&!Array.isArray(parsed.value))return parsed.value;
  throw Object.assign(Error('模型应返回一个 JSON 对象'),{code:'MODEL_NOT_OBJECT'});
 }
 const candidates=[];
 let start=-1,depth=0,quoted=false,escaped=false;
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(start<0){if(c==='{'){start=i;depth=1;}continue;}
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{')depth++;
  if(c==='}'&&--depth===0){
   try{candidates.push(JSON.parse(raw.slice(start,i+1)));}catch{}
   start=-1;
  }
 }
 if(candidates.length===1)return candidates[0];
 const code=!raw?'MODEL_EMPTY':start>=0?'MODEL_INCOMPLETE':candidates.length>1?'MODEL_AMBIGUOUS':'MODEL_NOT_JSON';
 const messages={MODEL_EMPTY:'模型未返回正文',MODEL_INCOMPLETE:'模型返回的 JSON 不完整',MODEL_AMBIGUOUS:'模型返回了多个 JSON 方案，请重新适配',MODEL_NOT_JSON:'模型回复无法解析为 JSON'};
 throw Object.assign(Error(messages[code]),{code});
}
