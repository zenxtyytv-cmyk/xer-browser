const { contextBridge, ipcRenderer } = require('electron');
const inv = (c) => (...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('xer', {
  newTab: inv('tab:new'), switchTab: inv('tab:switch'), closeTab: inv('tab:close'),
  reopenTab: inv('tab:reopen'), duplicateTab: inv('tab:duplicate'), pinTab: inv('tab:pin'), moveTab: inv('tab:move'),
  createGroup: inv('group:create'), addToGroup: inv('group:add'), removeFromGroup: inv('group:remove'),
  renameGroup: inv('group:rename'), colorGroup: inv('group:color'), toggleGroup: inv('group:toggle'),
  ungroup: inv('group:ungroup'), closeGroup: inv('group:close'),
  go: inv('nav:go'), back: inv('nav:back'), forward: inv('nav:forward'), reload: inv('nav:reload'),
  suggest: inv('nav:suggest'),
  toggleSidebar: inv('sidebar:toggle'),
  bookmarks: inv('bm:list'), toggleBookmark: inv('bm:toggle'), history: inv('hist:list'), clearHistory: inv('hist:clear'),
  downloads: inv('dl:list'), clearDownloads: inv('dl:clear'), openDownload: inv('dl:open'), showDownload: inv('dl:show'), cancelDownload: inv('dl:cancel'),
  find: inv('find'), zoom: inv('zoom'), devtools: inv('devtools'), resetPerms: inv('perms:reset'),
  split: { toggle: inv('split:toggle'), ratio: inv('split:ratio'), swap: inv('split:swap'), get: inv('split:get'), drag: inv('split:drag') },
  game: { get: inv('game:get'), set: inv('game:set'), toggle: inv('game:toggle'), overlay: inv('game:overlay'), restart: inv('game:restart') },
  readerOpen: inv('reader:open'),
  openSettings: inv('open:settings'), ai: { get: inv('ai:get'), set: inv('ai:set'), models: inv('ai:models') },
  hasKey: inv('claude:hasKey'), setKey: inv('claude:setKey'), ask: inv('claude:ask'), runAction: inv('claude:runAction'),
  on: (ch, fn) => ipcRenderer.on(ch, (_, d) => fn(d))
});
