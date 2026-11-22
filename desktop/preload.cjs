const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('glyphfieldDesktop', {
  saveBrandBookPdf: () => ipcRenderer.invoke('brand-book:save-pdf'),
});
