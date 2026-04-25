const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, globalShortcut, powerSaveBlocker } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

let mainWindow
let tray
let psBlockerId = null
const DATA_DIR = path.join(app.getPath('userData'), 'ReccoBelloData')
const DB_FILE = path.join(DATA_DIR, 'posdata.json')
const LOG_FILE = path.join(DATA_DIR, 'audit.log')

// ── Ensure data directory exists ──────────────────────────────────────────
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ── Load / Save JSON store ────────────────────────────────────────────────
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  } catch (e) {}
  return {}
}
function saveDB(data) {
  ensureDataDir()
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8')
}
function appendLog(entry) {
  ensureDataDir()
  const line = `[${new Date().toISOString()}] ${entry}\n`
  fs.appendFileSync(LOG_FILE, line, 'utf8')
}

// ── Create main window ───────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 768,
    title: 'ReccoBello OS v5.0',
    backgroundColor: '#090916',
    show: false,
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true
    }
  })

  mainWindow.loadFile('app.html')

  // Show once ready — prevents white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
    // Block screen sleep (POS must stay on)
    psBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  })

  // Devtools shortcut (F12)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') mainWindow.webContents.toggleDevTools()
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── System Tray ──────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png')
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()

  tray = new Tray(img)
  tray.setToolTip('ReccoBello OS — Running')
  const menu = Menu.buildFromTemplate([
    { label: 'Open ReccoBello OS', click: () => { if (mainWindow) mainWindow.show(); else createWindow() } },
    { label: 'Fullscreen Toggle', accelerator: 'F11', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
    { type: 'separator' },
    { label: 'Open Data Folder', click: () => shell.openPath(DATA_DIR) },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => mainWindow && mainWindow.show())
}

// ── App lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensureDataDir()
  createWindow()
  createTray()

  // Auto-launch on Windows startup
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      name: 'ReccoBello OS',
      path: process.execPath
    })
  }

  // F11 fullscreen
  globalShortcut.register('F11', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (psBlockerId !== null) powerSaveBlocker.stop(psBlockerId)
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// ══════════════════════════════════════════════════════════════════════════
//  IPC HANDLERS — The "supercomputer" bridge layer
// ══════════════════════════════════════════════════════════════════════════

// ── 1. Persistent JSON Database ──────────────────────────────────────────
ipcMain.handle('db:get', (_e, key) => {
  const db = loadDB()
  return key ? db[key] : db
})
ipcMain.handle('db:set', (_e, key, value) => {
  const db = loadDB()
  db[key] = value
  saveDB(db)
  return true
})
ipcMain.handle('db:delete', (_e, key) => {
  const db = loadDB()
  delete db[key]
  saveDB(db)
  return true
})
ipcMain.handle('db:all', () => loadDB())

// ── 2. Audit Log ─────────────────────────────────────────────────────────
ipcMain.handle('log:write', (_e, entry) => {
  appendLog(entry)
  return true
})
ipcMain.handle('log:read', () => {
  try { return fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '' }
  catch (e) { return '' }
})

// ── 3. Print Receipt ─────────────────────────────────────────────────────
ipcMain.handle('print:receipt', async (_e, htmlContent) => {
  const win = new BrowserWindow({
    width: 400, height: 600, show: false,
    webPreferences: { contextIsolation: true }
  })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)
  await new Promise(r => setTimeout(r, 600))
  win.webContents.print({ silent: false, printBackground: true, color: false }, (success, err) => {
    if (!success) console.error('Print error:', err)
    win.close()
  })
  return true
})

// ── 4. Export CSV / JSON ──────────────────────────────────────────────────
ipcMain.handle('export:csv', async (_e, filename, content) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }]
  })
  if (filePath) { fs.writeFileSync(filePath, content, 'utf8'); return filePath }
  return null
})
ipcMain.handle('export:json', async (_e, filename, content) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (filePath) { fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8'); return filePath }
  return null
})

// ── 5. Logo / Image upload ────────────────────────────────────────────────
ipcMain.handle('file:pick-image', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  if (!filePaths.length) return null
  const buf = fs.readFileSync(filePaths[0])
  const ext = path.extname(filePaths[0]).replace('.', '')
  return `data:image/${ext};base64,${buf.toString('base64')}`
})

// ── 6. System Info (for diagnostics page) ────────────────────────────────
ipcMain.handle('system:info', () => ({
  platform: os.platform(),
  arch: os.arch(),
  cpus: os.cpus().length,
  cpuModel: os.cpus()[0]?.model || 'Unknown',
  totalMem: Math.round(os.totalmem() / 1073741824 * 10) / 10 + ' GB',
  freeMem: Math.round(os.freemem() / 1073741824 * 10) / 10 + ' GB',
  hostname: os.hostname(),
  appVersion: app.getVersion(),
  dataPath: DATA_DIR
}))

// ── 7. Window controls ────────────────────────────────────────────────────
ipcMain.handle('window:fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
})
ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize())
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.handle('window:kiosk', (_e, on) => {
  if (mainWindow) mainWindow.setKiosk(on)
})

// ── 8. Open external URL ──────────────────────────────────────────────────
ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url))

// ── 9. Notification ──────────────────────────────────────────────────────
ipcMain.handle('notify', (_e, title, body) => {
  const { Notification } = require('electron')
  if (Notification.isSupported()) new Notification({ title, body }).show()
})

// ── 10. Backup / Restore ──────────────────────────────────────────────────
ipcMain.handle('backup:save', async () => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `ReccoBello_Backup_${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'Backup', extensions: ['json'] }]
  })
  if (!filePath) return null
  const db = loadDB()
  const logs = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : ''
  fs.writeFileSync(filePath, JSON.stringify({ db, logs, exportedAt: new Date().toISOString() }, null, 2))
  return filePath
})
ipcMain.handle('backup:restore', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Backup', extensions: ['json'] }]
  })
  if (!filePaths.length) return false
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'))
    if (data.db) saveDB(data.db)
    if (data.logs) fs.writeFileSync(LOG_FILE, data.logs, 'utf8')
    return true
  } catch { return false }
})

// ── 11. List system printers ──────────────────────────────────────────────
ipcMain.handle('print:list', async () => {
  if (!mainWindow) return []
  const printers = await mainWindow.webContents.getPrintersAsync()
  return printers.map(p => ({ name: p.name, isDefault: p.isDefault, status: p.status }))
})

// ── 12. Print silently to a specific printer (for thermal) ───────────────
ipcMain.handle('print:direct', async (_e, htmlContent, printerName) => {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 400, height: 800, show: false,
      webPreferences: { contextIsolation: true }
    })
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const opts = {
          silent: !!printerName,
          printBackground: true,
          color: false,
          margins: { marginType: 'none' },
          pageSize: { width: 80000, height: 297000 } // 80mm thermal
        }
        if (printerName) opts.deviceName = printerName
        win.webContents.print(opts, (success, err) => {
          win.close()
          resolve({ success, err: err || null })
        })
      }, 800)
    })
  })
})

// ── 13. Auto-launch toggle ────────────────────────────────────────────────
ipcMain.handle('autolaunch:get', () => app.getLoginItemSettings().openAtLogin)
ipcMain.handle('autolaunch:set', (_e, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    name: 'ReccoBello OS',
    path: process.execPath
  })
  return true
})
