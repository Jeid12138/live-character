const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bubbleSurface',{
 onProgress:fn=>ipcRenderer.on('lc-bubble-progress',(_,payload)=>fn(payload)),
 onContent:fn=>ipcRenderer.on('lc-bubble-content',(_,payload)=>fn(payload)),
 measured:payload=>ipcRenderer.send('lc-bubble-size',payload)
});
