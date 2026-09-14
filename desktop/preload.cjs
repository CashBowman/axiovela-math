const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('methodflowDesktop',{
 update:(action,value)=>ipcRenderer.invoke('math:update',action,value),
 onUpdate:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('math:update-state',listener);return()=>ipcRenderer.removeListener('math:update-state',listener);},
 onUpdateOpen:callback=>{const listener=()=>callback();ipcRenderer.on('math:update-open',listener);return()=>ipcRenderer.removeListener('math:update-open',listener);},
 chooseExperimentProject:()=>ipcRenderer.invoke('math:choose-experiment-project'),
 chooseProjectFolder:()=>ipcRenderer.invoke('math:choose-folder'),
 chooseTool:id=>ipcRenderer.invoke('math:choose-tool',id),
 setupProvider:(id,action)=>ipcRenderer.invoke('math:setup',id,action),
 detectTools:()=>ipcRenderer.invoke('math:detect'),
});
