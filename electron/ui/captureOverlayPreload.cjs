const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('captureHost', {
  getScreenImage: () => ipcRenderer.invoke('capture:get-image'),
  confirmSelection: (rect) => ipcRenderer.send('capture:confirm', rect),
  cancelSelection: () => ipcRenderer.send('capture:cancel'),
});
