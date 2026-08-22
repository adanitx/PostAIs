const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('postais', {
  sendRequest: (payload) => ipcRenderer.invoke('http:request', payload),
  setSecret: (payload) => ipcRenderer.invoke('secrets:set', payload),
  deleteSecret: (payload) => ipcRenderer.invoke('secrets:delete', payload),
  listSecrets: () => ipcRenderer.invoke('secrets:list'),
  saveTextFile: (payload) => ipcRenderer.invoke('file:saveText', payload),
  setZoom: (factor) => ipcRenderer.invoke('window:setZoom', factor),
  getZoom: () => ipcRenderer.invoke('window:getZoom'),
  setTitleBarOverlay: (options) => ipcRenderer.invoke('window:setTitleBarOverlay', options),
});