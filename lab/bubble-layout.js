/* Shared browser-only bubble sizing and reading-time policy. No model calls. */
(()=>{
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 function units(text){
  // CJK graphemes count individually; a Latin word/number counts as one unit.
  const chunks=String(text).normalize('NFC').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{Script=Latin}\p{N}]+(?:['’-][\p{Script=Latin}\p{N}]+)*|[^\s]/gu)||[];
  return chunks.length;
 }
 function seconds(text,options={}){
  const base=clamp(Number(options.minimum)||4,2,60);
  if(options.auto===false)return base;
  const speed=clamp(Number(options.speed)||300,60,1200),extra=clamp(Number(options.extra)||0,0,30);
  return Math.max(base,Math.ceil(units(text)*60/speed+extra));
 }
 function fit({text,font=15,maxWidth,maxHeight,measure}){
  const maxW=Math.max(40,maxWidth),maxH=Math.max(30,maxHeight),base=clamp(font,9,26);
  const preferred=clamp(Math.sqrt(Math.max(1,Array.from(String(text)).length)*base*base*2),Math.min(220,maxW),Math.min(680,maxW));
  let size=base,width=preferred,box=measure(width,size,false),compact=false;
  while(box.height>maxH&&width<maxW){width=Math.min(maxW,width+Math.max(80,width*.25));box=measure(width,size,false);}
  while((box.height>maxH||box.width>maxW)&&size>9){size--;box=measure(width,size,false);}
  if(box.height>maxH){compact=true;box=measure(maxW,size,true);width=maxW;}
  return {width:Math.ceil(box.width),height:Math.ceil(box.height),font:size,compact};
 }
 window.LiveBubble={units,seconds,fit};
})();
