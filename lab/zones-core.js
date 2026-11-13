(function(root){
 function bounds(v){if(!v||v.length<6)return null;let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;for(let i=0;i<v.length;i+=2){x=Math.min(x,v[i]);r=Math.max(r,v[i]);y=Math.min(y,v[i+1]);b=Math.max(b,v[i+1]);}return r-x>.01&&b-y>.01?{x,y,w:r-x,h:b-y}:null;}
 const inside=(r,p)=>p.x>=r.x&&p.y>=r.y&&p.x<=r.x+r.w&&p.y<=r.y+r.h;
 function attach(rect,mesh){const b=bounds(mesh.vertices);if(!b)throw Error('绑定网格尺寸无效');return {id:mesh.id,x:(rect.x-b.x)/b.w,y:(rect.y-b.y)/b.h,w:rect.w/b.w,h:rect.h/b.h};}
 function resolve(zone,mesh){if(!zone.anchor)return zone.rect;if(!mesh||mesh.opacity<.05)return null;const b=bounds(mesh.vertices);if(!b)return null;const a=zone.anchor;return {x:b.x+a.x*b.w,y:b.y+a.y*b.h,w:a.w*b.w,h:a.h*b.h};}
 function triangle(p,a,b,c){const d=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(d)<1e-8)return false;const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/d,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/d;return u>=0&&v>=0&&u+v<=1;}
 function hits(mesh,p){if(mesh.opacity<.05)return false;const b=bounds(mesh.vertices);if(!b||!inside(b,p))return false;const v=mesh.vertices,idx=mesh.indices;if(!idx?.length)return true;for(let i=0;i<idx.length;i+=3){const pt=j=>({x:v[idx[i+j]*2],y:v[idx[i+j]*2+1]});if(triangle(p,pt(0),pt(1),pt(2)))return true;}return false;}
 // Clip the visible triangles to the calibrated rectangle before measuring the
 // halo. This preserves the gaps between feet and prioritizes exact contacts.
 function clip(points,axis,limit,sign){
  const out=[];
  for(let i=0;i<points.length;i++){
   const a=points[(i+points.length-1)%points.length],b=points[i];
   const da=sign*(a[axis]-limit),db=sign*(b[axis]-limit);
   if((da<0)!==(db<0)){
    const t=da/(da-db);out.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});
   }
   if(db>=0)out.push(b);
  }
  return out;
 }
 function distance(r,sources,p,max){
  const dx=Math.max(r.x-p.x,0,p.x-r.x-r.w),dy=Math.max(r.y-p.y,0,p.y-r.y-r.h);
  const boxDistance=Math.hypot(dx,dy);
  if(!sources||boxDistance>max)return boxDistance;
  if(!boxDistance && sources.some(m=>hits(m,p)))return 0;
  if(max===0)return Infinity;
  let nearest=Infinity;
  for(const m of sources){
   const v=m.vertices,ids=m.indices;
   for(let i=0;i<ids.length;i+=3){
    let poly=[0,1,2].map(j=>({x:v[ids[i+j]*2],y:v[ids[i+j]*2+1]}));
    if(poly.every(q=>q.x<p.x-max)||poly.every(q=>q.x>p.x+max)||poly.every(q=>q.y<p.y-max)||poly.every(q=>q.y>p.y+max))continue;
    for(const [axis,limit,sign] of [['x',r.x,1],['x',r.x+r.w,-1],['y',r.y,1],['y',r.y+r.h,-1]])poly=clip(poly,axis,limit,sign);
    for(let n=0;n<poly.length;n++){
     const a=poly[n],b=poly[(n+1)%poly.length],x=b.x-a.x,y=b.y-a.y;
     const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));
     nearest=Math.min(nearest,Math.hypot(a.x+t*x-p.x,a.y+t*y-p.y));
    }
   }
  }
  return nearest;
 }
 function candidates(meshes,p){return meshes.filter(m=>hits(m,p)).sort((a,b)=>b.order-a.order);}
 function validate(data){if(!Array.isArray(data)||data.length>40)throw Error('最多 40 个区域');return data.map(z=>{if(typeof z.name!=='string'||!z.name.trim())throw Error('区域需要名称');const valid=r=>r&&['x','y','w','h'].every(k=>Number.isFinite(r[k])&&Math.abs(r[k])<1e6)&&r.w>0&&r.h>0;if(!valid(z.rect))throw Error('区域尺寸无效');if(z.anchor&&(!valid(z.anchor)||typeof z.anchor.id!=='string'))throw Error('网格绑定无效');return {name:z.name.slice(0,40),rect:{...z.rect},anchor:z.anchor?{...z.anchor}:null};});}
 const api={bounds,inside,attach,resolve,hits,distance,candidates,validate};if(typeof module!=='undefined')module.exports=api;else root.ZoneGeometry=api;
})(globalThis);
