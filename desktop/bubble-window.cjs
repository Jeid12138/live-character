const path=require('node:path');
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function place(anchor,size,area){
 const width=Math.min(size.width,area.width),height=Math.min(size.height,area.height),margin=4;
 let x=anchor.x-width/2,y=anchor.y-height-9;
 if(y<area.y+margin){
  const left=anchor.x-width-24,right=anchor.x+24;
  if(left>=area.x+margin)x=left;
  else if(right+width<=area.x+area.width-margin)x=right;
 }
 x=clamp(x,area.x,area.x+area.width-width);y=clamp(y,area.y,area.y+area.height-height);
 return {x:Math.round(x),y:Math.round(y),width:Math.round(width),height:Math.round(height)};
}
function create({BrowserWindow,screen,ipcMain,parent,isEnabled,isTop,onError=()=>{}}){
 let win,loaded=false,last=null,key='',revision=0,size=null,closed=false,topState,lastBounds,progressKey='';
 function hide(){last=null;key='';progressKey='';revision++;win?.hide();}
 function top(){if(win&&!win.isDestroyed()){const enabled=isTop();if(topState===enabled)return;topState=enabled;win.setAlwaysOnTop(enabled,enabled?'screen-saver':'normal');if(enabled&&win.isVisible())win.moveTop();}}
 function region(){
  const b=parent.getContentBounds();
  const anchor={
   x:b.x+clamp(last.anchor.x,0,Math.max(0,b.width-1)),
   y:b.y+clamp(last.anchor.y,0,Math.max(0,b.height-1))
  };
  const display=screen.getDisplayNearestPoint({x:Math.round(anchor.x),y:Math.round(anchor.y)});
  const edge=parent.isFullScreen?.()?(display.bounds||display.workArea):display.workArea;
  const x=Math.max(b.x,edge.x),y=Math.max(b.y,edge.y);
  const width=Math.min(b.x+b.width,edge.x+edge.width)-x,height=Math.min(b.y+b.height,edge.y+edge.height)-y;
  return {anchor,area:width>0&&height>0?{x,y,width,height}:b};
 }
 function location(){
  if(!win||!loaded||!size||!last||!isEnabled()||!parent.isVisible()||parent.isMinimized())return win?.hide();
  const {anchor,area}=region();
  const next=place(anchor,size,area);if(!lastBounds||Object.keys(next).some(k=>next[k]!==lastBounds[k])){win.setBounds(next);lastBounds=next;}top();if(!win.isVisible())win.showInactive();
 }
 function sendProgress(){if(!last||!loaded)return;const next=last.id+':'+last.visibleCount;if(next!==progressKey){progressKey=next;win.webContents.send('lc-bubble-progress',{id:last.id,visibleCount:last.visibleCount});}}
 function send(){
  if(!last||!loaded)return;
  const {area}=region();
  const next=JSON.stringify([last.id,last.text,last.font,last.paper,last.ink,last.characterWidth,area.width,area.height]);
  if(next!==key){if(win.isVisible())location();key=next;progressKey=last.id+':'+last.visibleCount;revision++;size=null;win.webContents.send('lc-bubble-content',{...last,revision,maxWidth:Math.max(1,area.width-8),maxHeight:Math.max(1,area.height-8)});}
  else {sendProgress();location();}
 }
 function update(payload){
  if(closed)return;
  if(payload?.progress){if(last&&payload.id===last.id&&Number.isInteger(payload.visibleCount)){last.visibleCount=clamp(payload.visibleCount,0,6000);sendProgress();}return;}
  if(!payload||payload.hidden||!isEnabled()){hide();return;}
  if(typeof payload.text!=='string'||!payload.text||payload.text.length>6000||!Number.isFinite(payload.anchor?.x)||!Number.isFinite(payload.anchor?.y)||Math.abs(payload.anchor.x)>100000||Math.abs(payload.anchor.y)>100000)return;
  last={id:Number.isSafeInteger(payload.id)?payload.id:0,visibleCount:Number.isInteger(payload.visibleCount)?clamp(payload.visibleCount,0,6000):Array.from(payload.text).length,text:payload.text,font:clamp(Number(payload.font)||15,12,26),paper:/^#[0-9a-f]{6}$/i.test(payload.paper)?payload.paper:'#fffcf5',ink:/^#[0-9a-f]{6}$/i.test(payload.ink)?payload.ink:'#263945',characterWidth:Number.isFinite(payload.characterWidth)?clamp(payload.characterWidth,1,20000):undefined,anchor:payload.anchor};
  if(!win){
   win=new BrowserWindow({parent,icon:path.join(__dirname,'lc.ico'),show:false,frame:false,transparent:true,backgroundColor:'#00000000',width:100,height:60,skipTaskbar:true,focusable:false,resizable:false,movable:false,hasShadow:false,webPreferences:{preload:path.join(__dirname,'bubble-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
   win.setIgnoreMouseEvents(true);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
   win.loadFile(path.join(__dirname,'bubble.html')).then(()=>{if(!closed){loaded=true;send();}}).catch(onError);
  }else send();
 }
 const measure=(event,p)=>{
  if(event.sender!==win?.webContents||p?.revision!==revision||!last||!['width','height'].every(k=>Number.isFinite(p[k])&&p[k]>0&&p[k]<=16000))return;
  size={width:p.width,height:p.height};location();
 };
 ipcMain.on('lc-bubble-size',measure);
 for(const name of ['move','resize','show','restore','enter-full-screen','leave-full-screen'])parent.on(name,send);
 for(const name of ['hide','minimize'])parent.on(name,()=>win?.hide());
 return {update,hide,top,destroy(){closed=true;last=null;ipcMain.removeListener('lc-bubble-size',measure);if(win&&!win.isDestroyed())win.destroy();win=null;}};
}
module.exports={create,place};
