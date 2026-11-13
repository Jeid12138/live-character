const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const spec=require('./core-runtime.json');
module.exports=function managedCore(data){
 const directory=path.join(data,spec.directory),file=path.join(directory,spec.executable);
 const fail=message=>{throw Object.assign(Error('Cubism Core：'+message+'。请退出角色，在 DSH 中重新检测依赖。'),{code:'CORE_DEPENDENCY_INVALID'});};
 try{
  const consent=JSON.parse(fs.readFileSync(path.join(data,'install-state.json'),'utf8')).dependencies?.[spec.id];
  if(consent?.licenseRevision!==spec.licenseRevision)fail('尚未确认官方许可');
  for(let p=file;;p=path.dirname(p)){
   if(fs.lstatSync(p).isSymbolicLink())fail('运行库路径不能是链接');
   if(p===data)break;if(path.dirname(p)===p)fail('路径无效');
  }
  const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(hash!==spec.files[0].sha256)fail('文件损坏或版本不符');
 }catch(e){if(e.code==='CORE_DEPENDENCY_INVALID')throw e;fail('运行库缺失或无法校验');}
 return file;
};
