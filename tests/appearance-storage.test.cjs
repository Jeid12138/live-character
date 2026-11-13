const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'lc-appearance-storage-')),factory=require('../desktop/library.cjs');
const id='char-11111111-1111-4111-8111-111111111111',a='a'.repeat(24),b='b'.repeat(24);
try{
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value))};
 const home=path.join(data,'asset','_characters',id),models=[a,b].map(profile=>({profile,label:profile[0],path:path.join(home,'models',profile[0]),entry:'m.model3.json'}));
 for(const m of models)write(path.join(m.path,m.entry),'{}');
 const assets={characters:[{id,name:'角色',lastModel:a,models}],active:{characterId:id,profile:a}};write(path.join(home,'character.json'),{persona:'个性',models});
 const library=factory(data,assets,()=>write(path.join(data,'assets.json'),assets));library.setup();
 library.store('set','model-appearance-v1','A');library.store('set','appearance-memory-v1',JSON.stringify({current:{characterId:id,profile:a},events:[]}));
 library.activate(id,b);assert.equal(library.store('get','model-appearance-v1'),null);assert.equal(JSON.parse(library.store('get','appearance-memory-v1')).current.characterId,id);
 library.store('set','model-appearance-v1','B');const file=library.appearanceSnapshot(b,'data:image/jpeg;base64,/9j/2Q==');assert(fs.existsSync(file));assert.throws(()=>library.appearanceSnapshot(a,'data:image/jpeg;base64,/9j/2Q=='),/已切换/);
 library.activate(id,a);assert.equal(library.store('get','model-appearance-v1'),'A');library.deleteModel(id,b);assert(!fs.existsSync(file));
 console.log('PASS per-model appearance isolation, shared per-character memory, correct snapshot identity, model deletion snapshot cleanup');
}finally{fs.rmSync(data,{recursive:true,force:true})}
