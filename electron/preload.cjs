const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mobHost', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),
  onSettings: (fn) => ipcRenderer.on('settings', (_e, s) => fn(s)),
  onCommand: (fn) => ipcRenderer.on('command', (_e, c) => fn(c)),
  setPointerOver: (over) => ipcRenderer.send('pointer:over', over),
  setExpanded: (on) => ipcRenderer.send('window:expand', on),
  reportState: (name) => ipcRenderer.send('state', name),
  setChatMode: (on) => ipcRenderer.send('chat:mode', on),
  sendChatMessage: (data) => ipcRenderer.invoke('chat:send', data),
  startScreenCapture: (opts) => ipcRenderer.invoke('chat:start-crop', opts),
  onCaptureResult: (fn) => {
    if (typeof fn !== 'function') return () => {};
    const listener = (_e, res) => fn(res);
    ipcRenderer.on('capture:result', listener);
    return () => ipcRenderer.removeListener('capture:result', listener);
  },
  openFileDialog: () => ipcRenderer.invoke('chat:pick-file'),
  deleteAttachment: (id) => ipcRenderer.send('chat:delete-attachment', id),
  onOpenChat: (fn) => ipcRenderer.on('chat:open', (_e, data) => fn(data)),
  openChat: (options) => ipcRenderer.send('chat:open-request', options),
  openSetup: (reason) => ipcRenderer.send('ai:open-setup', reason),
  openPermissionSettings: () => ipcRenderer.invoke('system:open-permission-settings'),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
});
