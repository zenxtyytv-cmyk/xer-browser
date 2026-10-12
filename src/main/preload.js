const { contextBridge, ipcRenderer } = require('electron');
const inv = (c) => (...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('xer', {
  newTab: inv('tab:new'), switchTab: inv('tab:switch'), closeTab: inv('tab:close'),
  go: inv('nav:go'), back: inv('nav:back'), forward: inv('nav:forward'), reload: inv('nav:reload'),
  toggleSidebar: inv('sidebar:toggle'),
  hasKey: inv('claude:hasKey'), setKey: inv('claude:setKey'), ask: inv('claude:ask'),
  on: (ch, fn) => ipcRenderer.on(ch, (_, d) => fn(d))
});
