const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('petDesktop',{
  bubble:payload=>ipcRenderer.send('lc-bubble',payload),
  reportRenderer:detail=>ipcRenderer.send('lc-renderer-error',detail),
  pointerPass:value=>ipcRenderer.send('lc-pointer-pass',value===true),
  onLockProbe:fn=>ipcRenderer.on('lc-lock-probe',(_,x,y)=>fn(x,y)),
  notify:(kind,payload)=>ipcRenderer.send('lc-event',kind,payload),
  store:(profile,op,key,value)=>{const r=ipcRenderer.sendSync('lc-store',profile,op,key,value);if(!r.ok)throw Error(r.error);return r.value;},
  asset:(op,value)=>ipcRenderer.invoke('pet-asset',op,value),
  onTop:fn=>ipcRenderer.on('pet-top',(_,value)=>fn(value)),
  onLayout:fn=>ipcRenderer.on('pet-layout',(_,compact,fromSidebar)=>fn(compact,fromSidebar)),
  onFocusToggle:fn=>ipcRenderer.on('pet-focus-toggle',(_,choice)=>fn(choice)),
  onGaze:fn=>ipcRenderer.on('pet-gaze',(_,x,y,area)=>fn(x,y,area)),
  focusState:(value,choice)=>ipcRenderer.send('pet-focus-state',value===true,choice),
  onAdjust:fn=>ipcRenderer.on('pet-adjust',(_,value)=>fn(value)),
  adjust:(phase,edge)=>ipcRenderer.send('pet-adjust-input',phase,edge),
  windowConfig:value=>ipcRenderer.invoke('pet-window-config',value),
  menu:()=>ipcRenderer.send('pet-menu')
});
