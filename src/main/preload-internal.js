// Exposed ONLY to file:// internal pages (new tab, settings). Web pages get nothing.
const { contextBridge, ipcRenderer } = require('electron');
if (location.protocol === 'file:') {
  const inv = (c) => (...a) => ipcRenderer.invoke(c, ...a);
  contextBridge.exposeInMainWorld('xerInternal', {
    net: { status: inv('net:status'), add: inv('net:add'), remove: inv('net:remove'), mode: inv('net:mode'), doh: inv('net:doh'), ip: inv('net:ip') },
    dash: { get: inv('dash:get'), set: inv('dash:set'), reset: inv('dash:reset') },
    ai: { get: inv('ai:get'), set: inv('ai:set'), models: inv('ai:models') }
  });
}
