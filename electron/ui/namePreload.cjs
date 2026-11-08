const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nameHost', {
  getInfo: () => ipcRenderer.invoke('pet-name:get'),
  save: (name) => ipcRenderer.invoke('pet-name:save', name),
  close: () => ipcRenderer.send('pet-name:close'),
});
