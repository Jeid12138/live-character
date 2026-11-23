const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
function mkdir(p){fs.mkdirSync(p,{recursive:true});return p;}
function json(p){return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{};}
function atomic(p,text){mkdir(path.dirname(p));const tmp=p+'.'+randomUUID();try{fs.writeFileSync(tmp,text);fs.renameSync(tmp,p);}finally{fs.rmSync(tmp,{force:true});}}
function slug(s){return String(s||'模型').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,70)||'模型';}
function contains(root,file){const rel=path.relative(root,file);return rel===''||!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);}
const defaultPersona='';
const modelKey=k=>/^(mouth-profile|performance-rig|companion-zones|adaptation-report|ai-parameter|tracking-map|breathing|pet-model-sidebar|model-appearance)/.test(k);
const modelScene=new Set(['pins','view','placement']);
const modelStage=new Set(['idle','physics','amp','cap','quality','colors','showZones']);
function splitSettings(settings){
 const character={},model={};
 for(const [k,v] of Object.entries(settings)){
  if(['pet-scene','pet-stage-settings'].includes(k)){
   const a={},b={},keys=k==='pet-scene'?modelScene:modelStage;
   for(const [key,value] of Object.entries(JSON.parse(v||'{}')))(keys.has(key)?b:a)[key]=value;
   character[k]=JSON.stringify(a);model[k]=JSON.stringify(b);
  }else (modelKey(k)?model:character)[k]=v;
 }
 return {character,model};
}
function rows(file){
 if(fs.existsSync(file))return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const markdown=path.join(path.dirname(file),'对话记录.md');
 if(path.basename(file)!=='history.jsonl'||!fs.existsSync(markdown))return [];
 return [...fs.readFileSync(markdown,'utf8').matchAll(/^## (用户|角色) \| ([^\n]+)\n((?:> [^\n]*\n)+)/gm)].map(m=>({role:m[1]==='用户'?'user':'assistant',at:m[2]==='原记录无时间'?null:m[2],text:m[3].trimEnd().split('\n').map(line=>line.slice(2)).join('\n')}));
}
module.exports=function library(data,assets,persist){
 const root=()=>mkdir(assets.assetRoot||path.join(data,'asset'));
 const home=id=>{if(typeof id!=='string'||!/^char-[a-f0-9-]{36}$/.test(id))throw Error('角色 ID 无效');return path.join(root(),'_characters',id);};
 const roster=()=>assets.characters||[];
 function get(id){const c=roster().find(c=>c.id===id);if(!c)throw Error('角色不存在，请刷新列表');return c;}
 function activeCharacter(){return get(assets.active?.characterId);}
 function activeModel(){const c=activeCharacter(),m=c.models.find(m=>m.profile===assets.active.profile);if(!m)throw Error('模型不存在');return m;}
 function syncActive(){
  const c=roster().find(c=>c.id===assets.active?.characterId),m=c?.models.find(m=>m.profile===assets.active?.profile);
  for(const k of ['model','entry','profile','variant'])delete assets[k];
  if(m&&fs.existsSync(path.join(m.path,m.entry)))Object.assign(assets,{model:m.path,entry:m.entry,profile:m.profile});else assets.active=null;
 }
 function commit(work){
  const before=structuredClone(assets),originals=new Map();
  const write=(file,value)=>{if(!originals.has(file))originals.set(file,fs.existsSync(file)?fs.readFileSync(file):null);atomic(file,typeof value==='string'?value:JSON.stringify(value,null,2));};
  try{const result=work(write);syncActive();persist();return result;}
  catch(e){
   for(const key of Object.keys(assets))delete assets[key];Object.assign(assets,before);
   for(const [file,value] of [...originals].reverse())if(value===null)fs.rmSync(file,{force:true});else atomic(file,value);
   throw e;
  }
 }
 let setupNotice='';
 function setup(){
  for(const name of ['voice-models','voice-references','_characters'])mkdir(path.join(root(),name));
  if(!Array.isArray(assets.characters)){
   if(assets.model||assets.history?.length)setupNotice='检测到旧版资产结构，请通过导入重新选择角色归属。旧文件和备份保持原位。';
   commit(()=>{assets.characters=[];assets.active=null;assets.characterSchema=1;});
  }else{const before=JSON.stringify(assets);syncActive();if(JSON.stringify(assets)!==before)persist();}
 }

 function meta(c){return json(path.join(home(c.id),'character.json'));}
 function route(){
  const c=activeCharacter(),file=path.join(home(c.id),'memory','session.json');
  if(!fs.existsSync(file))atomic(file,JSON.stringify({id:'session-'+randomUUID()}));
  return {...json(file),title:'Live Character · '+c.name,characterId:c.id};
 }
 function dir(kind){
  if(kind==='root')return root();
  if(kind==='legacy'){const folder=path.join(root(),'_legacy');if(!fs.existsSync(folder))throw Error('没有历史备份目录');return folder;}
  if(kind==='core')return mkdir(path.join(data,'core'));
  if(['voice-models','voice-references'].includes(kind))return mkdir(path.join(root(),kind));
  const c=activeCharacter();
  if(kind==='model')return activeModel().path;
  if(kind==='memory')return mkdir(path.join(home(c.id),'memory'));
  if(kind==='setting')return mkdir(path.join(home(c.id),'settings'));
  throw Error('未知目录');
 }
 function info(){
  const c=roster().find(c=>c.id===assets.active?.characterId);
  return {root:root(),current:c?.id||null,active:assets.active||null,persona:c?meta(c).persona||'':'',
   characters:roster().map(c=>({id:c.id,name:c.name,lastModel:c.lastModel,models:c.models.map(m=>({profile:m.profile,label:m.label,entry:m.entry,missing:!fs.existsSync(path.join(m.path,m.entry)),lastUsed:m.lastUsed||0}))})),
   notice:setupNotice,hasLegacy:fs.existsSync(path.join(root(),'_legacy'))};
 }
 function activate(id,profile){
  const c=get(id),m=c.models.find(m=>m.profile===profile);if(!m||!fs.existsSync(path.join(m.path,m.entry)))throw Error('模型资源不可用，请添加或重新导入模型');
  commit(write=>{assets.active={characterId:id,profile};c.lastModel=profile;m.lastUsed=Date.now();write(path.join(home(id),'character.json'),{...meta(c),models:c.models,lastModel:profile});});
  return {path:m.path,entry:m.entry};
 }
 function readSettings(file){return json(file);}
 function store(op,k,v){
  if(!assets.active?.characterId){if(op==='get')return null;if(op==='legacyAllowed')return false;if(['history','recall'].includes(op))return [];if(['set','seed'].includes(op))return;throw Error('请先导入角色');}
  const c=activeCharacter(),memory=dir('memory'),archive=path.join(memory,'history.jsonl');
  const charFile=path.join(home(c.id),'settings','character.json'),modelFile=path.join(home(c.id),'settings','models',assets.active.profile+'.json');
  if(op==='legacyAllowed')return false;
  if(op==='seed'){if(!fs.existsSync(archive))atomic(archive,v.map(row=>JSON.stringify(row)+'\n').join(''));return;}
  if(op==='append'){fs.appendFileSync(archive,JSON.stringify(v)+'\n');return;}
  if(op==='history')return rows(archive);
  if(op==='replaceHistory'){atomic(archive,v.map(row=>JSON.stringify(row)+'\n').join(''));return;}
  if(op==='recall'){
   const text=String(v||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,''),terms=new Set(text.match(/[a-z0-9]{3,}/g)||[]);
   for(let i=0;i+1<text.length;i++)if(text.charCodeAt(i)>127)terms.add(text.slice(i,i+2));
   if(!terms.size)return [];
   const history=rows(archive);if(history.at(-1)?.role==='user'&&history.at(-1).text===String(v||''))history.pop();
   return history.slice(-3000).map((m,i)=>({m,i,score:[...terms].filter(t=>String(m.text).toLowerCase().includes(t)).length})).filter(x=>x.score>=2).sort((a,b)=>b.score-a.score||b.i-a.i).slice(0,3).map(x=>({role:x.m.role,text:x.m.text.slice(0,240)}));
  }
  if(['companion-memory-v4','appearance-memory-v1'].includes(k)){
   const file=path.join(memory,'state.json'),state=json(file);
   if(op==='get')return state[k]??null;
   if(op==='set'){state[k]=v;atomic(file,JSON.stringify(state));return;}
  }
  const char=readSettings(charFile),model=readSettings(modelFile);
  if(op==='get'){
   if(k==='companion-config-v4'){
    const config=JSON.parse(char[k]||'{}'),saved=meta(c).persona;
    return JSON.stringify({...config,persona:typeof saved==='string'?saved:typeof config.persona==='string'?config.persona:defaultPersona});
   }
   if(['pet-scene','pet-stage-settings'].includes(k))return char[k]||model[k]?JSON.stringify({...JSON.parse(char[k]||'{}'),...JSON.parse(model[k]||'{}')}):null;
   return (modelKey(k)?model:char)[k]??null;
  }
  if(op==='set'){
   commit(write=>{
    if(k==='companion-config-v4'){
     const config=JSON.parse(v);if(typeof config.persona!=='string'||config.persona.length>5000)throw Error('性格卡无效');
     write(path.join(home(c.id),'character.json'),{...meta(c),persona:config.persona});
    }
    if(['pet-scene','pet-stage-settings'].includes(k)){
     const split=splitSettings({[k]:v});char[k]=split.character[k];model[k]=split.model[k];write(charFile,char);write(modelFile,model);
    }else{const target=modelKey(k)?model:char;target[k]=v;write(modelKey(k)?modelFile:charFile,target);}
   });return;
  }
  throw Error('未知存储操作');
 }
 function commitVoice(prefs,credential){
  const c=activeCharacter(),file=path.join(home(c.id),'settings','character.json'),key='companion-config-v4';let settings;
  try{settings=readSettings(file);settings[key]=JSON.stringify({...JSON.parse(settings[key]||'{}'),...prefs})}catch(cause){const e=Error('无法读取角色语音配置');e.voice={stage:'save',errorCode:'settings_read_failed',errorType:cause.name,causeCode:cause.code};throw e;}
  commit(write=>{if(credential){credential.assertCurrent();write(credential.file,credential.value)}write(file,settings)});
 }
 async function importModels(source,selections,target,api){
  if(!Array.isArray(selections)||!selections.length||selections.length>30)throw Error('请选择模型入口');
  const isNew=!target.characterId,id=isNew?'char-'+randomUUID():get(target.characterId).id;
  const name=isNew?String(target.name||'').trim():get(id).name;
  if(!name||name.length>70)throw Error('角色名称须为 1–70 个字');
  const c=isNew?{id,name,models:[]}:structuredClone(get(id)),stage=path.join(root(),'.import-'+randomUUID()),moves=[],installed=[],removedEmpty=[],repairs=new Set(),replaced=[];
  mkdir(stage);const importedProfiles=new Set();
  try{
   for(const selected of selections){
    const inspected=await api('inspect',{path:source,entry:selected.entry}),profile=inspected.profile;
    if(typeof profile!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(profile))throw Error('模型指纹无效');
    if(importedProfiles.has(profile))throw Error('重复选择了同一模型');importedProfiles.add(profile);
    const existing=c.models.find(m=>m.profile===profile);
    if(existing&&fs.existsSync(path.join(existing.path,existing.entry)))throw Error('该角色已经拥有此模型');
    const requested=String(selected.label||path.posix.basename(selected.entry).replace(/\.model3\.json$/i,'')).trim().normalize('NFC');
    if(!existing&&(requested!==slug(requested)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(requested)))throw Error('模型名称包含 Windows 不支持的字符或保留名称，请修改名称');
    const label=existing?.label||requested;
    if(c.models.some(m=>m.profile!==profile&&m.label.toLowerCase()===label.toLowerCase()))throw Error('同角色模型名称重复，请修改名称');
    const dest=path.join(home(id),'models',label),tmp=path.join(stage,label);
    if(existing&&path.resolve(existing.path)===path.resolve(dest))repairs.add(dest);
    await api('extract',{path:source,destination:tmp});
    if(existing)c.models=c.models.filter(m=>m.profile!==profile);
    c.models.push({profile,entry:selected.entry,label,path:dest,characterId:id,lastUsed:Date.now()});moves.push([tmp,dest]);
   }
   // Extraction is complete before the roster or active identity changes.
   for(const [src,dest] of moves){
    mkdir(path.dirname(dest));
    if(fs.existsSync(dest)){
     if(repairs.has(dest)){const backup=path.join(stage,'.previous-'+randomUUID());fs.renameSync(dest,backup);replaced.push([backup,dest]);}
     else{if(fs.readdirSync(dest).length)throw Error('模型目录已存在且非空');fs.rmdirSync(dest);removedEmpty.push(dest);}
    }
    fs.renameSync(src,dest);installed.push(dest);
   }
   c.lastModel=c.models.at(-1).profile;
   commit(write=>{
    if(isNew){
     assets.characters=[...roster(),c];
     write(path.join(home(id),'character.json'),{id,name,persona:defaultPersona,createdAt:new Date().toISOString(),models:c.models,lastModel:c.lastModel});
     write(path.join(home(id),'memory','session.json'),{id:'session-'+randomUUID()});
    }else{
     assets.characters=roster().map(row=>row.id===id?c:row);
     write(path.join(home(id),'character.json'),{...meta(c),models:c.models,lastModel:c.lastModel});
    }
    c.lastModel=c.models.at(-1).profile;assets.active={characterId:id,profile:c.lastModel};
   });
   return {profile:c.lastModel,isNew,characterId:id,characterName:c.name,modelLabel:c.models.at(-1).label,modelCount:c.models.length,importedCount:selections.length};
  }catch(e){
   for(const dest of installed)if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true});
   for(const [backup,dest] of replaced)fs.renameSync(backup,dest);
   for(const folder of removedEmpty)if(!fs.existsSync(folder))mkdir(folder);
   if(isNew&&!roster().some(c=>c.id===id))fs.rmSync(home(id),{recursive:true,force:true});
   throw e;
  }finally{fs.rmSync(stage,{recursive:true,force:true});}
 }
 function deleteModel(id,profile){
  const c=get(id),m=c.models.find(m=>m.profile===profile);if(!m)throw Error('模型不存在');
  if(c.models.length===1)throw Error('这是最后一个模型，请使用删除角色');
  const trash=path.join(root(),'.delete-'+randomUUID()),settings=path.join(home(id),'settings','models',profile+'.json');
  const existed=fs.existsSync(m.path);if(existed)fs.renameSync(m.path,trash);
  try{
   commit(write=>{
    c.models=c.models.filter(m=>m.profile!==profile);if(c.lastModel===profile)c.lastModel=(c.models.find(m=>fs.existsSync(path.join(m.path,m.entry)))||c.models[0]).profile;
    if(assets.active?.characterId===id&&assets.active.profile===profile)assets.active.profile=c.lastModel;
    write(path.join(home(id),'character.json'),{...meta(c),models:c.models,lastModel:c.lastModel});
    if(fs.existsSync(settings)){write(settings,{});}
   });
  }catch(e){if(existed)fs.renameSync(trash,m.path);throw e;}
  fs.rmSync(trash,{recursive:true,force:true});fs.rmSync(settings,{force:true});fs.rmSync(path.join(home(id),'settings','models',profile+'.appearance.jpg'),{force:true});
 }
 function deleteCharacter(id){
  const c=get(id),record=characterSession(id),trash=path.join(root(),'.delete-'+randomUUID());
  fs.renameSync(home(id),trash);
  try{commit(()=>{assets.characters=roster().filter(row=>row.id!==id);if(record.connected)assets.sessionArchiveQueue=[...new Set([...(assets.sessionArchiveQueue||[]),record.id])];if(assets.active?.characterId===id){const next=roster().find(row=>row.models.some(m=>fs.existsSync(path.join(m.path,m.entry))));assets.active=next?{characterId:next.id,profile:next.models.find(m=>m.profile===next.lastModel&&fs.existsSync(path.join(m.path,m.entry)))?.profile||next.models.find(m=>fs.existsSync(path.join(m.path,m.entry))).profile}:null;}});}
  catch(e){fs.renameSync(trash,home(id));throw e;}
  fs.rmSync(trash,{recursive:true,force:true});return c;
 }
 function rename(id,name){if(typeof name!=='string'||!name.trim()||name.length>70)throw Error('角色名称须为 1–70 个字');commit(write=>{const c=get(id);c.name=name.trim();write(path.join(home(id),'character.json'),{...meta(c),name:c.name});});}
 function reset(){const old=route();commit(write=>{write(path.join(dir('memory'),'session.json'),{id:'session-'+randomUUID()});if(old.connected)assets.sessionArchiveQueue=[...new Set([...(assets.sessionArchiveQueue||[]),old.id])];});}
 function mark(id){if(route().id!==id)throw Error('角色身份已切换');atomic(path.join(dir('memory'),'session.json'),JSON.stringify({id,connected:true}));}
 const experiences=require('./experiences.cjs')(()=>dir('memory'),()=>({characterId:activeCharacter().id,profile:activeModel().profile,sessionId:route().id}));
 function characterSession(id){return json(path.join(home(id),'memory','session.json'));}
 function relocate(parent){
  const old=root(),next=path.join(parent,'asset');if(path.resolve(old)===path.resolve(next))return;
  if(contains(old,next)||contains(next,old)||fs.existsSync(next))throw Error('请选择没有 asset 的独立目录');
  const stage=next+'.'+randomUUID();try{fs.cpSync(old,stage,{recursive:true,errorOnExist:true,force:false});fs.renameSync(stage,next);}finally{fs.rmSync(stage,{recursive:true,force:true});}
  const before=structuredClone(assets),remap=p=>p&&contains(old,p)?path.join(next,path.relative(old,p)):p;
  try{assets.assetRoot=next;for(const c of roster())for(const m of c.models)m.path=remap(m.path);for(const c of roster()){const file=path.join(next,'_characters',c.id,'character.json');atomic(file,JSON.stringify({...json(file),models:c.models}));}syncActive();persist();}
  catch(e){for(const k of Object.keys(assets))delete assets[k];Object.assign(assets,before);fs.rmSync(next,{recursive:true,force:true});throw e;}
 }
 function appearanceSnapshot(profile,image){
  if(profile!==assets.profile||!/^[a-f0-9]{20,64}$/.test(profile))throw Error('截图对应模型已切换');
  if(typeof image!=='string'||image.length>850000||!image.startsWith('data:image/jpeg;base64,'))throw Error('角色截图格式或大小无效');
  const bytes=Buffer.from(image.slice(23),'base64');if(bytes[0]!==255||bytes[1]!==216)throw Error('角色截图无效');
  const file=path.join(dir('setting'),'models',profile+'.appearance.jpg');atomic(file,bytes);return file;
 }
 return {setup,info,activate,importModels,deleteModel,deleteCharacter,rename,characterSession,route,reset,mark,store,commitVoice,dir,relocate,appearanceSnapshot,experiences};
};
