import {randomUUID} from 'node:crypto';
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id);
export function preparationExitError(code,status,version,runId){
 const cancelled=code===2;
 const phase=cancelled?'cancelled':'failed';
 const message=status.version===version&&status.runId===runId&&status.phase===phase&&typeof status.message==='string'
  ?status.message.trim():'';
 return Object.assign(Error(message||(cancelled
  ?'依赖安装已取消；自行准备后可重新检测依赖。'
  :'运行环境准备失败，请检查安装提示或复制诊断。')),{code:cancelled?'CANCELLED':'PREPARE_FAILED'});
}
// Construction/querying is inert. Only launch() may begin preparation.
export function createRuntimeLauncher({prepare,launchCharacter,cancelPreparation,isRunning,writeStatus}){
 let active=null,disposed=false;
 const cancelled=new Set();
 const remember=id=>{cancelled.add(id);if(cancelled.size>100)cancelled.delete(cancelled.values().next().value);};
 const api={
  state(){return active?{runId:active.id,preparing:true,cancelPending:active.cancelled}: {preparing:false,cancelPending:false};},
  launch({runId=randomUUID()}={}){
   if(!validId(runId))throw Error('启动请求标识无效');
   if(disposed||cancelled.has(runId))throw Error('本次启动已取消');
   if(active)return {starting:true,runId:active.id};
   if(isRunning())return {starting:false,running:true};
   const task={id:runId,cancelled:false};active=task;
   writeStatus({runId,phase:'checking',installed:false,manualStart:false,message:'正在检查运行环境…'});
   task.promise=Promise.resolve().then(()=>task.cancelled?null:prepare(runId)).then(result=>{
    if(task.cancelled||disposed||!result)return;
    if(result.installed===true){
     writeStatus({...result,runId,phase:'ready',installed:true,manualStart:true,message:'依赖修复完成，运行环境已就绪。请点击“启动角色”。'});
     return;
    }
    launchCharacter();
   }).catch(error=>{
    if(task.cancelled||disposed)return;
    const wasCancelled=error.code==='CANCELLED';
    writeStatus({runId,phase:wasCancelled?'cancelled':'failed',manualStart:false,message:error.message});
   }).finally(()=>{
    if(active===task)active=null;
    if(task.cancelled&&!disposed)writeStatus({runId,phase:'cancelled',manualStart:false,message:'准备已取消，可再次点击“启动角色”。'});
   });
   return {starting:true,runId};
  },
  async cancel(runId){
   if(!validId(runId))return {cancelled:false};
   remember(runId);
   const task=active;if(!task||task.id!==runId)return {cancelled:false};
   task.cancelled=true;
   writeStatus({runId,phase:'cancelling',manualStart:false,message:'正在取消准备…'});
   await Promise.allSettled([Promise.resolve().then(()=>cancelPreparation(runId)),task.promise]);
   return {cancelled:true};
  },
  async dispose(){disposed=true;if(active)await api.cancel(active.id);}
 };
 return api;
}
