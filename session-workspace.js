import fs from 'node:fs';
import path from 'node:path';

// Only public workspaceController.create/rename contracts supplied by DSH are used.
// Never reassign an existing session, or adopt an unrelated directory by title.
export function sessionWorkspace(ctx, dataRoot=process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'LiveCharacter')) {
 let pending;
 let state={status:'unused',message:'尚未创建新的角色会话'};
 const snapshot=()=>({...state});
 function save(){
  if(!dataRoot)return;
  try{const file=path.join(dataRoot,'session-workspace.json');fs.writeFileSync(file+'.tmp',JSON.stringify({...state,at:new Date().toISOString()}));fs.renameSync(file+'.tmp',file);}catch{}
 }
 async function prepare(){
  try{
   if(!dataRoot)throw Error('插件数据目录不可用');
   const wc=ctx.get('workspaceController');
   if(!wc?.create||!wc?.rename)throw Error('DSH 工作区服务不可用');
   const folder=path.join(dataRoot,'workspace');fs.mkdirSync(folder,{recursive:true});
   // Re-register the canonical path once per plugin lifecycle. A persisted ID may
   // belong to another DSH profile or a deleted workspace, so never trust it alone.
   let {workspace}=await wc.create({path:folder});
   if(typeof workspace?.workspaceId!=='string'||!workspace.workspaceId)throw Error('DSH 未返回有效工作区编号');
   if(workspace.path&&path.resolve(workspace.path)!==path.resolve(folder))throw Error('DSH 返回的工作区目录与角色专用目录不一致');
   const id=workspace.workspaceId;
   if(workspace.title!=='Live Character'){
    ({workspace}=await wc.rename({workspaceId:id,title:'Live Character'}));
    if(workspace?.workspaceId!==id||workspace.title!=='Live Character')throw Error('DSH 未确认工作区名称');
   }
   state={status:'ready',workspaceId:id,path:folder,title:'Live Character',message:'新角色会话将归入 Live Character'};save();
   return {workspaceId:id};
  }catch(error){
   state={status:'unavailable',message:'工作区分组不可用，仍可正常对话：'+String(error?.message||error).slice(0,240)};save();
   return {};
  }
 }
 return {ensure(){return pending??=prepare();},snapshot};
}
