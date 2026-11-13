const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const snap=(v,lo,hi)=>Math.abs(v-lo)<=12?lo:Math.abs(v-hi)<=12?hi:v;
function adjusted(start,edge,dx,dy,a){
 const right=a.x+a.width,bottom=a.y+a.height;
 let l=start.x,t=start.y,r=l+start.width,b=t+start.height;
 if(edge==='move'){
  const width=Math.min(start.width,a.width),height=Math.min(start.height,a.height);
  l=clamp(snap(l+dx,a.x,right-width),a.x,right-width);
  t=clamp(snap(t+dy,a.y,bottom-height),a.y,bottom-height);
  return {x:l,y:t,width,height};
 }
 if(edge.includes('w'))l=clamp(snap(l+dx,a.x,right),a.x,r-Math.min(120,a.width));
 if(edge.includes('e'))r=clamp(snap(r+dx,a.x,right),l+Math.min(120,a.width),right);
 if(edge.includes('n'))t=clamp(snap(t+dy,a.y,bottom),a.y,b-Math.min(160,a.height));
 if(edge.includes('s'))b=clamp(snap(b+dy,a.y,bottom),t+Math.min(160,a.height),bottom);
 return {x:l,y:t,width:r-l,height:b-t};
}
function relative(bounds,area){
 return {width:bounds.width,height:bounds.height,x:clamp((bounds.x-area.x)/Math.max(1,area.width-bounds.width),0,1),y:clamp((bounds.y-area.y)/Math.max(1,area.height-bounds.height),0,1)};
}
function restore(v,a){
 const width=Math.round(clamp(v.width,120,a.width)),height=Math.round(clamp(v.height,160,a.height));
 return {x:a.x+Math.round(clamp(v.x,0,1)*(a.width-width)),y:a.y+Math.round(clamp(v.y,0,1)*(a.height-height)),width,height};
}
module.exports={adjusted,relative,restore};
