const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{create,place}=require('../desktop/bubble-window.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const area={x:-1280,y:0,width:1280,height:720};
 for(const anchor of [{x:-1270,y:4},{x:-700,y:350},{x:-10,y:710}]){
  const b=place(anchor,{width:720,height:400},area);assert(b.x>=area.x&&b.y>=area.y);assert(b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height);
 }
 const parent=new EventEmitter(),ipcMain=new EventEmitter();let origin={x:500,y:200,width:350,height:570},enabled=true,alwaysTop=false,windows=[];
 Object.assign(parent,{getContentBounds:()=>({...origin}),isVisible:()=>true,isMinimized:()=>false,setBounds(){throw Error('bubble must never move/resize character window')}});
 class Window{
  constructor(options){this.options=options;this.visible=false;this.sent=[];this.bounds=[];this.shows=0;this.tops=[];this.webContents=new EventEmitter();this.webContents.send=(...v)=>this.sent.push(v);this.webContents.setWindowOpenHandler=f=>this.open=f;windows.push(this);}
  loadFile(file){this.file=file;return Promise.resolve()}
  setIgnoreMouseEvents(v){this.ignore=v}setAlwaysOnTop(...v){this.tops.push(v)}moveTop(){}isVisible(){return this.visible}isDestroyed(){return false}isMinimized(){return false}
  setBounds(v){this.bounds.push(v)}showInactive(){this.visible=true;this.shows++}hide(){this.visible=false}destroy(){this.destroyed=true}
 }
 const surface=create({BrowserWindow:Window,screen:{getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1080}})},ipcMain,parent,isEnabled:()=>enabled,isTop:()=>alwaysTop});
 const payload={text:'长台词'.repeat(300),font:18,paper:'#fffcf5',ink:'#263945',anchor:{x:180,y:100}};
 surface.update(payload);await tick();const win=windows[0];assert.equal(windows.length,1);assert.equal(win.options.focusable,false);assert.equal(win.options.skipTaskbar,true);assert.equal(win.ignore,true);assert.equal(win.options.webPreferences.nodeIntegration,false);
 let request=win.sent.at(-1)[1];assert.equal(request.text,payload.text);assert.equal(request.maxWidth,1912);
 ipcMain.emit('lc-bubble-size',{sender:{}},{revision:request.revision,width:800,height:400});assert.equal(win.shows,0);
 ipcMain.emit('lc-bubble-size',{sender:win.webContents},{revision:request.revision,width:800,height:400});assert.equal(win.shows,1);assert.equal(win.bounds.at(-1).width,800);assert.deepEqual(origin,{x:500,y:200,width:350,height:570});
 surface.update(payload);assert.equal(win.sent.length,1);assert.equal(win.shows,1,'position polling must not repeatedly raise an unpinned bubble');assert.equal(win.bounds.length,1);
 surface.update({...payload,anchor:{x:240,y:200}});assert.equal(win.sent.length,1,'position-only update must not remeasure text');assert.equal(win.shows,1);
 alwaysTop=true;surface.top();assert.deepEqual(win.tops.at(-1),[true,'screen-saver']);
 surface.update({...payload,text:'<script>alert(1)</script>'});request=win.sent.at(-1)[1];surface.update({hidden:true});ipcMain.emit('lc-bubble-size',{sender:win.webContents},{revision:request.revision,width:400,height:100});assert.equal(win.visible,false,'late layout must not resurrect a hidden bubble');
 enabled=false;surface.update(payload);assert.equal(win.visible,false);surface.destroy();assert(win.destroyed);assert.equal(ipcMain.listenerCount('lc-bubble-size'),0);enabled=true;surface.update(payload);assert.equal(windows.length,1,'disposed bubble must not create a new window');
 console.log('PASS desktop bubble: screen edges/negative display coords, no character movement, click-through/nonfocus/taskbar flags, independent size, no repeated raising, pinned state, stale/hide protection');
})().catch(e=>{console.error(e);process.exitCode=1});
