const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  state: {
    load: ()        => ipcRenderer.invoke('state:load'),
    save: (state)   => ipcRenderer.invoke('state:save', state),
  },
  settings: {
    load:     ()        => ipcRenderer.invoke('settings:load'),
    save:     (updates) => ipcRenderer.invoke('settings:save', updates),
    status:   ()        => ipcRenderer.invoke('settings:status'),
    onStatus: (fn)      => ipcRenderer.on('server-status', (_e, s) => fn(s)),
  },
  onExternalUpdate: (fn) => ipcRenderer.on('state-updated-externally', fn),
  apps:  { list:       ()             => ipcRenderer.invoke('apps:list') },
  file:  {
    icon: (p)           => ipcRenderer.invoke('file:icon', p),
    open: (p, a)        => ipcRenderer.invoke('file:open', p, a),
    pick: ()            => ipcRenderer.invoke('dialog:openFile'),
  },
  app:   { launch:     (p)            => ipcRenderer.invoke('app:launch', p) },
  url:   { open:       (u)            => ipcRenderer.invoke('url:open', u) },
  web:   { screenshot: (u)            => ipcRenderer.invoke('web:screenshot', u) },
});
