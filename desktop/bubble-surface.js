'use strict';
(()=>{
 const bubble=document.getElementById('bubble'),words=document.getElementById('words');let current=null;
 function reveal(count){if(!current)return;const chars=Array.from(current.text),n=Math.min(chars.length,Math.max(0,Number.isFinite(count)?count:chars.length));const a=document.createElement('span'),b=document.createElement('span');a.textContent=chars.slice(0,n).join('');b.textContent=chars.slice(n).join('');b.style.visibility='hidden';b.setAttribute('aria-hidden','true');words.replaceChildren(a,b);}
 window.bubbleSurface.onContent(p=>{
  current=p;reveal(p.visibleCount);bubble.style.setProperty('--paper',p.paper);bubble.style.color=p.ink;
  const measure=(width,font,compact)=>{bubble.style.maxWidth=width+'px';bubble.style.fontSize=font+'px';bubble.style.whiteSpace=compact?'normal':'pre-wrap';const r=bubble.getBoundingClientRect();return {width:r.width,height:r.height};};
  const fit=window.LiveBubble?.fit||(({font,maxWidth,maxHeight,measure})=>{let size=font,r=measure(maxWidth,size,false);while(r.height>maxHeight&&size>9)r=measure(maxWidth,--size,false);if(r.height>maxHeight)r=measure(maxWidth,size,true);return {width:Math.ceil(r.width),height:Math.ceil(r.height)};});
  const box=fit({text:p.text,characterWidth:p.characterWidth,font:p.font,maxWidth:p.maxWidth-24,maxHeight:p.maxHeight-24,measure});
  window.bubbleSurface.measured({revision:p.revision,width:box.width+24,height:box.height+24});
 });
 window.bubbleSurface.onProgress?.(p=>{if(current&&p.id===current.id)reveal(p.visibleCount)});
})();
