const {randomUUID}=require('node:crypto');
module.exports=function transition(before,after,imported){
 const a=before.active,b=after.active;if(!b)return null;
 const owner=after.characters.find(c=>c.id===b.characterId);if(!owner)return null;
 let previousProfile,reason;
 if(imported){
  if(imported.characterId!==b.characterId||imported.profile!==b.profile)return null;
  const prior=before.characters?.find(c=>c.id===b.characterId);
  // Reimporting missing resources is a repair, not a newly acquired appearance.
  if(prior?.models.some(m=>m.profile===b.profile))return null;
  reason=prior?'model_added':'initial_import';
  previousProfile=prior?(a?.characterId===b.characterId?a.profile:prior.lastModel)||null:null;
 }else{
  if(!a||a.characterId!==b.characterId||a.profile===b.profile)return null;
  reason='model_switch';previousProfile=a.profile;
 }
 const label=profile=>profile?(owner.models.find(m=>m.profile===profile)?.label||profile):'';
 return {id:randomUUID(),type:'model_change',reason,at:new Date().toISOString(),characterId:b.characterId,characterName:owner.name||'',profile:b.profile,previousProfile,from:label(previousProfile),to:label(b.profile),...(imported?{importedCount:imported.importedCount}: {})};
};
