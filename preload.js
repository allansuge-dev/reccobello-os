/**
 * preload.js — Secure bridge between Electron main process and the ReccoBello OS HTML
 * Exposes the `window.RB` API to the renderer (app.html)
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('RB', {

  // ── Persistent Database (survives restarts, stored in AppData) ──────────
  db: {
    get:    (key)          => ipcRenderer.invoke('db:get', key),
    set:    (key, value)   => ipcRenderer.invoke('db:set', key, value),
    delete: (key)          => ipcRenderer.invoke('db:delete', key),
    all:    ()             => ipcRenderer.invoke('db:all')
  },

  // ── Audit Log ────────────────────────────────────────────────────────────
  log: {
    write: (entry) => ipcRenderer.invoke('log:write', entry),
    read:  ()      => ipcRenderer.invoke('log:read')
  },

  // ── Print (thermal / system printer) ────────────────────────────────────
  print: {
    receipt: (htmlContent) => ipcRenderer.invoke('print:receipt', htmlContent)
  },

  // ── Export files ─────────────────────────────────────────────────────────
  export: {
    csv:  (filename, content) => ipcRenderer.invoke('export:csv', filename, content),
    json: (filename, content) => ipcRenderer.invoke('export:json', filename, content)
  },

  // ── File pickers ─────────────────────────────────────────────────────────
  file: {
    pickImage: () => ipcRenderer.invoke('file:pick-image')
  },

  // ── System diagnostics ───────────────────────────────────────────────────
  system: {
    info: () => ipcRenderer.invoke('system:info')
  },

  // ── Window controls ──────────────────────────────────────────────────────
  window: {
    fullscreen: ()      => ipcRenderer.invoke('window:fullscreen'),
    minimize:   ()      => ipcRenderer.invoke('window:minimize'),
    maximize:   ()      => ipcRenderer.invoke('window:maximize'),
    kiosk:      (on)    => ipcRenderer.invoke('window:kiosk', on)
  },

  // ── Shell / OS ───────────────────────────────────────────────────────────
  shell: {
    open: (url) => ipcRenderer.invoke('shell:open', url)
  },

  // ── Notifications ────────────────────────────────────────────────────────
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),

  // ── Backup & Restore ────────────────────────────────────────────────────
  backup: {
    save:    () => ipcRenderer.invoke('backup:save'),
    restore: () => ipcRenderer.invoke('backup:restore')
  },

  // ── Printer ───────────────────────────────────────────────────────────────
  printers: {
    list:   ()                  => ipcRenderer.invoke('print:list'),
    direct: (html, printerName) => ipcRenderer.invoke('print:direct', html, printerName)
  },

  // ── Auto-launch ───────────────────────────────────────────────────────────
  autolaunch: {
    get: ()       => ipcRenderer.invoke('autolaunch:get'),
    set: (enable) => ipcRenderer.invoke('autolaunch:set', enable)
  },

  // ── Convenience: is this running in Electron? ────────────────────────────
  isElectron: true,
  version: '5.0.0'
})
