const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const factory=require('../desktop/library.cjs'),transition=require('../desktop/model-transition.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lc-import-events-')),assets={characters:[],active:null};
 try{
  const library=factory(root,assets,()=>{});library.setup();
  let profile='a'.repeat(24);
  const api=async(op,body)=>{if(op==='inspect')return {profile};if(op==='extract'){fs.mkdirSync(body.destination,{recursive:true});fs.writeFileSync(path.join(body.destination,'model.model3.json'),'{}');return}throw Error(op)};
  async function importing(target,label){const before=structuredClone(assets),result=await library.importModels('fixture.zip',[{entry:'model.model3.json',label}],target,api);return {result,event:transition(before,assets,result)};}
  let {result,event}=await importing({name:'鱼'},'初始形象');const owner=result.characterId;assert.equal(event.reason,'initial_import');assert.equal(event.from,'');assert.equal(event.profile,profile);assert.equal(library.route().characterId,owner);const session=library.route().id;
  profile='b'.repeat(24);({event}=await importing({characterId:owner},'外套'));assert.equal(event.reason,'model_added');assert.equal(event.from,'初始形象');assert.equal(library.route().id,session);
  profile='c'.repeat(24);await importing({name:'另一角色'},'初始');
  profile='d'.repeat(24);({event}=await importing({characterId:owner},'另一套'));assert.equal(event.reason,'model_added');assert.equal(event.from,'外套');assert.equal(event.to,'另一套');assert.equal(library.route().id,session);
  assert.equal(assets.active.characterId,owner);assert.equal(library.info().characters.find(c=>c.id===owner).models.length,3);
  const main=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8');const block=main.slice(main.indexOf("if(op==='importModels')"),main.indexOf("if(op==='selectModel')"));assert.match(block,/const previous=structuredClone\(assets\)/);assert.match(block,/modelChange:require\('\.\/model-transition.cjs'\)\(previous,assets,result\)/);
  console.log('PASS actual import library: initial appearance, model addition, addition to inactive role, preserved character session, main return wiring');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
