/* 大肥鱼的部位网格。腿和脚共用皮肤底图，鞋子切换后仍能触摸脚。 */
(function(root){
 const definitions = [
  ['头部',['ArtMesh102'],0,1,[.10,.02,.80,.73]],
  ['胸口',['ArtMesh426','ArtMesh428','ArtMesh601','ArtMesh425'],0,1,[.13,.23,.74,.56]],
  ['肚子',['ArtMesh464'],0,1,[.14,.12,.72,.77]],
  ['左手臂',['ArtMesh684'],0,1,[.16,.10,.68,.80]],
  ['右手臂',['ArtMesh628'],0,1,[.16,.10,.68,.80]],
  ['左脚',['ArtMesh584'],.88,1,[.06,.02,.88,.94]],
  ['右脚',['ArtMesh653'],.88,1,[.06,.02,.88,.94]],
  ['左腿',['ArtMesh584'],.35,.86,[.09,.02,.82,.96]],
  ['右腿',['ArtMesh653'],.35,.86,[.09,.02,.82,.96]],
  ['尾巴左侧',['ArtMesh674','ArtMesh731'],0,1,[.01,.20,.34,.70]],
  ['尾巴右侧',['ArtMesh674','ArtMesh731','ArtMesh729'],0,1,[.65,.34,.34,.62]]
 ];
 const key=name=>'body/'+name;
 function geometry(spec,getMesh){
  const sources=spec[1].map(getMesh).filter(m=>m && m.opacity>=.05);
  let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
  for(const m of sources){
   const v=m.vertices, bounds=root.ZoneGeometry.bounds(v);
   if(!bounds)continue;
   const low=bounds.y+bounds.h*spec[2],high=bounds.y+bounds.h*spec[3];
   for(let i=0;i<v.length;i+=2){
    const y=v[i+1];
    if(y<low-.001 || y>high+.001)continue;
    l=Math.min(l,v[i]);r=Math.max(r,v[i]);t=Math.min(t,y);b=Math.max(b,y);
   }
  }
  if(!(l<r && t<b))return null;
  return {id:key(spec[0]),opacity:1,vertices:[l,t,r,t,r,b,l,b],sources};
 }
 const byId=new Map(definitions.map(s=>[key(s[0]),s]));
 function mesh(id,getMesh){const spec=byId.get(id);return spec?geometry(spec,getMesh):getMesh(id);}
 function defaults(getMesh){
  if(!getMesh('ArtMesh102') || !getMesh('ArtMesh584'))return null;
  return definitions.map(spec=>{
   const [x,y,w,h]=spec[4],anchor={id:key(spec[0]),x,y,w,h};
   const z={name:spec[0],anchor,rect:{x:0,y:0,w:1,h:1}};
   z.rect=root.ZoneGeometry.resolve(z,geometry(spec,getMesh))||z.rect;
   return z;
  });
 }
 root.BodyZones={mesh,defaults};
})(globalThis);
