import {
  app, BrowserWindow, dialog, ipcMain, MessageChannelMain, Menu, shell, utilityProcess,
} from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { menuTemplate } from './menu.js'
import { openLinks } from './links.js'
import { packagedHarnessEnvironment } from './harness-sidecar.js'
import { attachCredentialVault } from './credential-vault.js'
import { MAIN_COPY, uiLocaleOf } from './messages.js'
import { afterCoreStops } from './restart-core.js'
import { createUpdater } from './updater.js'
import { displayVersion } from '../shared/app-version.js'
import electronUpdater from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import macIcon from '../../resources/icon-macos.png?asset'

const here = dirname(fileURLToPath(import.meta.url))

/** Channel used by Main to forward a user request to open Settings; preload exposes only this event. */
const OPEN_SETTINGS = 'meridian:open-settings'
const OPEN_AGENT_TUTORIAL = 'meridian:open-agent-tutorial'
const CHOOSE_LIBRARY_ROOT = 'meridian:choose-library-root'
const CHOOSE_WORKSPACE_ROOT = 'meridian:choose-workspace-root'
const REVEAL_FILE = 'meridian:reveal-file'
const RESTART_APP = 'meridian:restart-app'
const TOGGLE_MAXIMIZE = 'meridian:toggle-maximize'
const SET_LOCALE = 'meridian:set-locale'
const UPDATE_STATUS = 'meridian:update-status'
const UPDATE_CHECK = 'meridian:update-check'
const UPDATE_INSTALL = 'meridian:update-install'
const UPDATE_CHANGED = 'meridian:update-changed'

// A closed terminal or an earlier parent-process exit is normal, not an application failure. Without
// this listener, EPIPE would become an uncaught exception and display a crash dialog.
process.stdout.on('error', () => {})

/** Best-effort write of one line to stdout. Callers must not depend on whether the write succeeds. */
function log(line: string): void {
  try {
    process.stdout.write(line)
  } catch {
    // As above, the pipe has simply gone away.
  }
}

/** Active vault registered in user configuration, or undefined when configuration is absent or unreadable. */
function configuredVaultRoot(): string | undefined {
  const file = join(configHome(), 'paper-wiki-workspaces.json')
  if (!existsSync(file)) return undefined
  try {
    const root = (JSON.parse(readFileSync(file, 'utf8')) as { active_library_root?: unknown })
      .active_library_root
    return typeof root === 'string' ? root : undefined
  } catch (error) {
    log(`[main] Failed to read the active library configuration: ${error instanceof Error ? error.message : String(error)}\n`)
    return undefined
  }
}

/** Meridian's user-level configuration directory, shared with Core and the Python CLI. */
function configHome(): string {
  return process.env['MERIDIAN_CONFIG_HOME'] ?? join(homedir(), '.meridian')
}

// Hide the window only when MERIDIAN_SHOW_WINDOW=0 is explicit. E2E and screenshot scripts set it; development does not.
const devUrl = process.env['ELECTRON_RENDERER_URL']
const hidden = devUrl === undefined && process.env['MERIDIAN_SHOW_WINDOW'] === '0'

// Installed builds run as a single instance; later launches bring the existing window forward.
const primary = !app.isPackaged || app.requestSingleInstanceLock()
if (!primary) app.quit()

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win === undefined) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(() => {
  if (!primary) return
  let uiLocale = uiLocaleOf(app.getLocale())
  const copy = () => MAIN_COPY[uiLocale]
  // Packaged macOS builds use the app-bundle icon, while development runs Electron's bundle.
  // Set the Dock icon explicitly so unpackaged runs still show Meridian's rounded macOS artwork.
  if (process.platform === 'darwin') app.dock?.setIcon(macIcon)

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: !hidden,
    // Only Windows and Linux use this option for window and taskbar icons; macOS uses the app bundle.
    ...(process.platform === 'darwin' ? {} : { icon }),
    // The system no longer draws the title and menu bars; the app's .titlebar becomes the window bar.
    // Let Electron draw Windows/Linux controls so Windows 11 snap layouts, high contrast, and native
    // accessibility semantics keep working. Keep this overlay height aligned with the 50px .titlebar
    // in AppShell.css.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 17 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#536175', height: 50 }, accentColor: false }),
    webPreferences: {
      backgroundThrottling: false,
      preload: join(here, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.webContents.setWindowOpenHandler(openLinks((url) => shell.openExternal(url)))

  // Forward renderer console output to Main stdout so headless agents can observe renderer behavior.
  win.webContents.on('console-message', (details) => {
    log(`[renderer] ${details.message}\n`)
  })

  // Settings only notifies this window; the renderer owns opening and closing the UI.
  const installMenu = () => Menu.setApplicationMenu(Menu.buildFromTemplate(
    menuTemplate(
      process.platform,
      () => win.webContents.send(OPEN_SETTINGS),
      copy().menu,
      () => win.webContents.send(OPEN_AGENT_TUTORIAL),
    )))
  installMenu()

  // Folder selection is Main's only OS integration; Core validates vaults and persists configuration.
  ipcMain.handle(CHOOSE_LIBRARY_ROOT, async (event) => {
    if (event.sender !== win.webContents) return null
    const result = await dialog.showOpenDialog(win, {
      title: copy().chooseLibrary.title,
      buttonLabel: copy().chooseLibrary.button,
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(CHOOSE_WORKSPACE_ROOT, async (event) => {
    if (event.sender !== win.webContents) return null
    const result = await dialog.showOpenDialog(win, {
      title: copy().chooseWorkspace.title,
      buttonLabel: copy().chooseWorkspace.button,
      properties: ['openDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  // Attachments store local paths only; reveal the file without opening or executing it.
  ipcMain.handle(REVEAL_FILE, (event, path: unknown) => {
    if (event.sender !== win.webContents || typeof path !== 'string' || !existsSync(path)) return false
    shell.showItemInFolder(path)
    return true
  })
  // Only packaged builds have a release feed; macOS without a signing identity cannot replace itself,
  // so there a found release is offered as a download instead.
  const updater = createUpdater({
    feed: electronUpdater.autoUpdater,
    current: displayVersion(app.getVersion()),
    supported: app.isPackaged,
    installsInPlace: process.platform !== 'darwin',
    now: Date.now,
    onChange: (status) => { if (!win.isDestroyed()) win.webContents.send(UPDATE_CHANGED, status) },
  })
  updater.arm()
  ipcMain.handle(UPDATE_STATUS, (event) => event.sender === win.webContents ? updater.status() : null)
  ipcMain.handle(UPDATE_CHECK, (event) => {
    if (event.sender !== win.webContents) return null
    updater.check()
    return updater.status()
  })
  ipcMain.on(UPDATE_INSTALL, (event) => {
    if (event.sender === win.webContents) updater.install()
  })
  ipcMain.on(TOGGLE_MAXIMIZE, (event) => {
    if (event.sender !== win.webContents) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  // MERIDIAN_LIBRARY_ROOT still selects the E2E fixture explicitly. Normal desktop runs prefer an
  // explicit or configured vault and otherwise ask Core to initialize under userData. Main chooses
  // the location but never writes the vault.
  const fallback = join(app.getPath('userData'), 'library')
  const fixture = process.env['MERIDIAN_VAULT_ROOT'] === undefined
    && process.env['MERIDIAN_LIBRARY_ROOT'] !== undefined
  const harnessEnvironment = packagedHarnessEnvironment(
    app.isPackaged, process.resourcesPath, process.platform,
  )
  const startCore = () => {
    const explicit = process.env['MERIDIAN_VAULT_ROOT']
    const configured = explicit === undefined ? configuredVaultRoot() : undefined
    const selected = explicit ?? configured ?? fallback
    const source = explicit !== undefined ? 'environment' : configured !== undefined ? 'configured' : 'fallback'
    const child = utilityProcess.fork(join(here, '../core/index.js'), [], {
      env: fixture
        ? { ...process.env, ...harnessEnvironment, MERIDIAN_APP_VERSION: displayVersion(app.getVersion()) }
        : {
          ...process.env,
          ...harnessEnvironment,
          MERIDIAN_APP_VERSION: displayVersion(app.getVersion()),
          MERIDIAN_VAULT_ROOT: selected,
          MERIDIAN_VAULT_SOURCE: source,
          MERIDIAN_CONFIG_HOME: configHome(),
          ...(selected === fallback ? { MERIDIAN_BOOTSTRAP_VAULT: '1' } : {}),
        },
    })
    attachCredentialVault(child, () => copy().credentials)
    return child
  }
  const loadRenderer = () => devUrl ? win.loadURL(devUrl) : win.loadFile(join(here, '../renderer/index.html'))
  let core = startCore()
  let restarting = false

  // Storage changes require a fresh Core because it owns all vault state. Keep Main and its renderer
  // host alive: relaunching Electron from electron-vite also terminates the renderer development
  // server, leaving the replacement window pointed at a dead URL.
  ipcMain.on(RESTART_APP, (event) => {
    if (event.sender !== win.webContents || restarting) return
    restarting = true
    const previous = core
    const resume = () => {
      core = startCore()
      restarting = false
      void loadRenderer()
    }
    afterCoreStops(previous, resume)
  })

  // Window-button symbol color is fixed at creation while themes can change at runtime, so the
  // renderer sends updates. macOS owns traffic-light colors and has no setTitleBarOverlay here.
  win.webContents.ipc.on('meridian:title-bar-theme', (_event, symbolColor: unknown) => {
    if (process.platform === 'darwin' || typeof symbolColor !== 'string') return
    win.setTitleBarOverlay({ symbolColor })
  })

  win.webContents.ipc.on(SET_LOCALE, (_event, locale: unknown) => {
    if (locale !== 'zh' && locale !== 'en') return
    uiLocale = locale
    installMenu()
  })

  // Preload requests a port on every document load. Transferred ports cannot be reused, so create a
  // new channel pair for each request or the renderer would lose its channel after reload.
  win.webContents.ipc.on('meridian:port-request', (event) => {
    const { port1, port2 } = new MessageChannelMain()
    core.postMessage({ type: 'port' }, [port1])
    event.senderFrame?.postMessage('meridian:port', null, [port2])
  })

  void loadRenderer()
}).catch((err: unknown) => {
  // If window assembly fails, log the cause instead of leaving only an unexplained crash dialog.
  log(`[main] Startup failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`)
  app.quit()
})

app.on('window-all-closed', () => app.quit())
