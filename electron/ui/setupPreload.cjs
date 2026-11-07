const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupHost', {
  getStatus: () => ipcRenderer.invoke('ai:status'),
  testAndSave: (key) => ipcRenderer.invoke('ai:test-and-save', key),
  deleteKey: () => ipcRenderer.invoke('ai:delete-key'),
  openKeysPage: () => ipcRenderer.send('ai:open-keys-page'),
  copyLink: (text) => ipcRenderer.invoke('ai:copy-link', text),
  reportSize: (w, h) => ipcRenderer.send('setup:size', { width: w, height: h }),
  close: () => ipcRenderer.send('ai:close-setup'),
});
