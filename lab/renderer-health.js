/* Load before application scripts, including when model or profile initialization fails. */
(()=>{
 const health=window.petRendererHealth={ready:false,lastError:null};
 function report(kind,error,source,line){
  const detail={kind,message:String(error?.message||error||'未知页面错误').slice(0,3000),stack:String(error?.stack||'').slice(0,7000),source:String(source||'').slice(0,500),line:Number(line)||0};
  health.lastError=detail;window.petDesktop?.reportRenderer?.(detail);
  if(kind==='error'&&/cubism4\.js|pixi\.min\.js/.test(detail.source))window.petRenderFailure?.(error instanceof Error?error:Error(detail.message));
 }
 window.addEventListener('error',event=>{if(event.target?.src)report('resource','无法加载页面资源',event.target.src);else report('error',event.error||event.message,event.filename,event.lineno);},true);
 window.addEventListener('unhandledrejection',event=>report('rejection',event.reason));
 health.report=report;
 health.waitCore=async function(timeoutMs=15000){
  const started=performance.now();let cause;
  // The script load event can precede completion of Core's asynchronous WASM initialization.
  // Probe public version APIs before creating PIXI/Cubism objects.
  do{
   try{
    const api=window.Live2DCubismCore?.Version;
    const version=api?.csmGetVersion(),maxMoc=api?.csmGetLatestMocVersion();
    if(Number.isInteger(version)&&version>0&&Number.isInteger(maxMoc)&&maxMoc>0)return {version,maxMoc};
   }catch(error){cause=error;}
   await new Promise(resolve=>setTimeout(resolve,25));
  }while(performance.now()-started<timeoutMs);
  throw Error('Cubism Core 初始化超时'+(cause?'：'+String(cause.message||cause):''));
 };
})();
