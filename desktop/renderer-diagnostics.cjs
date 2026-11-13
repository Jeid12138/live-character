const fs=require('node:fs'),path=require('node:path');
module.exports=function diagnostics(wc,data){
 const version=require('./package.json').version,events=[];
 const clip=(v,n=3000)=>String(v??'').slice(0,n);
 function record(kind,details={}){
  const entry={at:new Date().toISOString(),kind};
  for(const [key,value] of Object.entries(details))if(value!==undefined)entry[key]=typeof value==='number'?value:clip(value,key==='stack'?7000:3000);
  events.push(entry);if(events.length>35)events.shift();
  const dir=path.join(data,'logs'),dest=path.join(dir,'renderer-last-error.json');
  try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dest+'.tmp',JSON.stringify({version,events},null,2));fs.renameSync(dest+'.tmp',dest);}catch{}
  return entry;
 }
 wc.on('console-message',(_event,...args)=>{
  const detail=typeof _event?.message==='string'?_event:args[0]&&typeof args[0]==='object'?args[0]:{level:args[0],message:args[1],lineNumber:args[2],sourceId:args[3]};
  if(['error','warning',2,3].includes(detail.level))record('console',{level:detail.level,message:detail.message,line:detail.lineNumber,source:detail.sourceId});
 });
 wc.on('did-fail-load',(_e,code,description,url,isMainFrame)=>{if(isMainFrame)record('load',{code,message:description,source:url});});
 wc.on('render-process-gone',(_e,details)=>record('process',{reason:details.reason,exitCode:details.exitCode}));
 wc.on('preload-error',(_e,file,error)=>record('preload',{source:file,message:error.message,stack:error.stack}));
 const snapshot=()=>({version,events:[...events],file:path.join(data,'logs','renderer-last-error.json')});
 async function execute(script,operation,requestId,userGesture=false){
  // Catch inside the renderer, before Electron replaces the exception with its generic message.
  // Never log script text, action input, chat content or the bridge token.
  const wrapped=`(async()=>{try{const value=await (${script});return JSON.stringify({ok:true,value:value??null});}catch(e){return JSON.stringify({ok:false,error:{name:String(e?.name||'Error'),message:String(e?.message||e).slice(0,3000),stack:String(e?.stack||'').slice(0,7000)}});}})()`;
  try{
   const raw=await wc.executeJavaScript(wrapped,userGesture),result=JSON.parse(raw);
   if(!result.ok){
    const e=Object.assign(Error(result.error.message),{code:'RENDERER_EXECUTION_FAILED',rendererStack:result.error.stack});throw e;
   }
   return result.value;
  }catch(error){
   record('execute',{operation,requestId,message:error.message,stack:error.rendererStack||error.stack});
   const cause=[...events].reverse().find(e=>['error','rejection','preload','load','process'].includes(e.kind));
   if(/Script failed to execute/.test(error.message)&&cause)error.message+='；'+clip(cause.message||cause.reason,180);
   error.code||='RENDERER_EXECUTION_FAILED';throw error;
  }
 }
 return {record,snapshot,execute};
};
