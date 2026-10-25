import {
  app, BrowserWindow, dialog, ipcMain, MessageChannelMain, Menu, nativeTheme, net, screen, shell,
  utilityProcess,
} from 'electron'
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { editMenuTemplate, menuTemplate, nextZoomLevel } from './menu.js'
import { openLinks } from './links.js'
import { packagedHarnessEnvironment } from './harness-sidecar.js'
import { attachCredentialVault } from './credential-vault.js'
import { MAIN_COPY, uiLocaleOf } from './messages.js'
import { afterCoreStops } from './restart-core.js'
import { canReplaceSelf, createMacSelfUpdate } from './mac-self-update.js'
import { windowBackground } from './window-background.js'
import { placeWindow, readWindowState, type WindowState } from './window-state.js'
import { createUpdater, type InstallRoute } from './updater.js'
import { releaseFilesUrl } from '../shared/app-update.js'
import type { AppCommand, MenuState } from '../shared/app-commands.js'
import { displayVersion } from '../shared/app-version.js'
import electronUpdater from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import macIcon from '../../resources/icon-macos.png?asset'

const here = dirname(fileURLToPath(import.meta.url))

/** Channel used by Main to forward a user request to open Settings; preload exposes only this event. */
const OPEN_SETTINGS = 'meridian:open-settings'
const OPEN_AGENT_TUTORIAL = 'meridian:open-agent-tutorial'
const OPEN_PALETTE = 'meridian:open-palette'
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
const FULL_SCREEN = 'meridian:full-screen'
const FULL_SCREEN_CHANGED = 'meridian:full-screen-changed'
const APP_COMMAND = 'meridian:app-command'
const MENU_STATE = 'meridian:menu-state'

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

/** Where the window's size and position are kept between launches: the App's user-data folder, never the vault. */
const windowStateFile = () => join(app.getPath('userData'), 'window-state.json')

/** The window as it last closed, or null when nothing was saved or the saved state is unreadable. */
function savedWindow(): WindowState | null {
  const file = windowStateFile()
  if (!existsSync(file)) return null
  const state = readWindowState(readFileSync(file, 'utf8'))
  if (state === null) log('[main] The saved window size is unreadable; the window opens at its default size\n')
  return state
}

/** Meridian's user-level configuration directory, shared with Core and the Python CLI. */
function configHome(): string {
  return process.env['MERIDIAN_CONFIG_HOME'] ?? join(homedir(), '.meridian')
}

// Hide the window only when MERIDIAN_SHOW_WINDOW=0 is explicit. E2E and screenshot scripts set it; development does not.
const devUrl = process.env['ELECTRON_RENDERER_URL']
const hidden = devUrl === undefined && process.env['MERIDIAN_SHOW_WINDOW'] === '0'
// E2E cases and drivers that need pixels set MERIDIAN_SHOW_WINDOW=isolated: the window paints off every
// display, where the machine's real keyboard and pointer cannot reach the page and the page cannot cover
// the user's work, while DevTools-protocol input still reaches it.
const isolated = devUrl === undefined && process.env['MERIDIAN_SHOW_WINDOW'] === 'isolated'
// Automated launches run while the user works on the same Mac: an accessory app has no Dock icon and is
// never made the active app.
if ((hidden || isolated) && process.platform === 'darwin') app.setActivationPolicy('accessory')
// An automated launch on the App's own profile would read and overwrite the user's settings and drafts,
// so it stops here, before Chromium has written anything there. The reason is written synchronously: the
// process ends before an asynchronous write to a pipe lands.
const ownProfile = join(app.getPath('appData'), app.getName())
if ((hidden || isolated) && app.getPath('userData') === ownProfile) {
  writeSync(2, `[main] Refusing to start: MERIDIAN_SHOW_WINDOW=${process.env['MERIDIAN_SHOW_WINDOW']} is an automated `
    + `launch, which needs its own --user-data-dir instead of the App's own profile at ${ownProfile}\n`)
  app.exit(1)
}

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

  // The window opens where it last closed, on the system theme's background, and shows once the
  // renderer has painted.
  const saved = savedWindow()
  const win = new BrowserWindow({
    ...placeWindow(saved, screen.getAllDisplays().map((display) => display.workArea)),
    show: false,
    focusable: !isolated,
    // Without it macOS pulls a shown window back onto a display and caps its height at the display's.
    enableLargerThanScreen: isolated,
    backgroundColor: windowBackground(nativeTheme.shouldUseDarkColors),
    // Only Windows and Linux use this option for window and taskbar icons; macOS uses the app bundle.
    ...(process.platform === 'darwin' ? {} : { icon }),
    // The system no longer draws the title and menu bars; the app's .titlebar becomes the window bar.
    // Let Electron draw Windows/Linux controls so Windows 11 snap layouts, high contrast, and native
    // accessibility semantics keep working. Keep this overlay height aligned with the 50px .titlebar
    // in AppShell.css.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 17 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#555555', height: 50 }, accentColor: false }),
    webPreferences: {
      backgroundThrottling: false,
      preload: join(here, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.once('ready-to-show', () => {
    if (!isolated) {
      if (hidden) return
      // maximize() shows the window too, so an automated launch never gets here.
      if (saved?.maximized === true) win.maximize()
      win.show()
      return
    }
    // show() would activate the app. Inactive and unfocusable, the window never becomes key, so the
    // keyboard keeps typing into whatever app the user is in. It is placed right of every display, with
    // room for its shadow, before it is ordered in.
    const right = Math.max(...screen.getAllDisplays().map(({ bounds }) => bounds.x + bounds.width))
    win.setPosition(right + 100, 0)
    win.showInactive()
  })

  win.webContents.setWindowOpenHandler(openLinks((url) => shell.openExternal(url)))

  win.on('close', () => {
    const state: WindowState = { ...win.getNormalBounds(), maximized: win.isMaximized() }
    try {
      writeFileSync(windowStateFile(), JSON.stringify(state))
    } catch (error) {
      log(`[main] Failed to keep the window size: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  })

  // Forward renderer console output to Main stdout so headless agents can observe renderer behavior.
  win.webContents.on('console-message', (details) => {
    log(`[renderer] ${details.message}\n`)
  })

  // Settings and the commands the page carries out only notify this window; the renderer owns the
  // UI they open. The zoom items zoom the reader's paper while it is shown, the window otherwise.
  let menuState: MenuState = { sidebarHidden: false, reading: false }
  const onCommand = (command: AppCommand) => {
    if ((command === 'zoomIn' || command === 'zoomOut' || command === 'resetZoom') && !menuState.reading) {
      win.webContents.setZoomLevel(nextZoomLevel(command, win.webContents.getZoomLevel()))
      return
    }
    win.webContents.send(APP_COMMAND, command)
  }
  const installMenu = () => Menu.setApplicationMenu(Menu.buildFromTemplate(
    menuTemplate(
      process.platform,
      () => win.webContents.send(OPEN_SETTINGS),
      copy().menu,
      () => win.webContents.send(OPEN_AGENT_TUTORIAL),
      () => win.webContents.send(OPEN_PALETTE),
      { packaged: app.isPackaged, sidebarHidden: menuState.sidebarHidden, onCommand },
    )))
  installMenu()
  win.webContents.ipc.on(MENU_STATE, (_event, state: unknown) => {
    if (typeof state !== 'object' || state === null) return
    const { sidebarHidden, reading } = state as Record<string, unknown>
    if (typeof sidebarHidden !== 'boolean' || typeof reading !== 'boolean') return
    const retitle = sidebarHidden !== menuState.sidebarHidden
    menuState = { sidebarHidden, reading }
    if (retitle) installMenu()
  })
  // The swipe Electron names `left` is the one browsers take as Back. It fires only when the Trackpad
  // setting "Swipe between pages" allows three fingers.
  win.on('swipe', (_event, direction) => { if (direction === 'left') onCommand('back') })

  // A secondary click on text opens the edit menu. A click the page handles itself, such as a paper
  // row's own context menu, prevents the default and never reaches Main.
  win.webContents.on('context-menu', (_event, params) => {
    const items = editMenuTemplate(process.platform, params, copy().editMenu, {
      replaceMisspelling: (word) => win.webContents.replaceMisspelling(word),
      lookUp: () => win.webContents.showDefinitionForSelection(),
    })
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: win })
  })

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
  // Only packaged builds have a release feed. Squirrel.Mac only updates signed apps, so on macOS
  // the App replaces its own bundle, or offers the release page where it cannot write its location.
  // MERIDIAN_UPDATE_FEED_URL points checks and downloads at a test server.
  const feedUrl = process.env['MERIDIAN_UPDATE_FEED_URL']
  if (feedUrl !== undefined) electronUpdater.autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
  const bundle = resolve(app.getPath('exe'), '../../..')
  const route: InstallRoute = process.platform !== 'darwin' ? { kind: 'feed' }
    : !app.isPackaged || !canReplaceSelf(bundle) ? { kind: 'page' }
      : {
        kind: 'self',
        self: createMacSelfUpdate({
          bundle,
          pid: process.pid,
          base: (version) => feedUrl ?? releaseFilesUrl(version),
          fetch: (url) => net.fetch(url),
          run: (command, args) => new Promise((done, fail) => {
            execFile(command, [...args], (error, stdout) => { if (error) fail(error); else done(stdout) })
          }),
          launch: (script, args) => {
            spawn('/bin/sh', ['-c', script, 'meridian-update', ...args], { detached: true, stdio: 'ignore' }).unref()
          },
          quit: () => app.quit(),
        }),
      }
  const updater = createUpdater({
    feed: electronUpdater.autoUpdater,
    current: displayVersion(app.getVersion()),
    supported: app.isPackaged,
    route,
    now: Date.now,
    onChange: (status) => { if (!win.isDestroyed()) win.webContents.send(UPDATE_CHANGED, status) },
    log: (line) => log(`${line}\n`),
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
  // macOS hides the traffic lights in full screen, so the title bar drops the room it keeps for them.
  ipcMain.handle(FULL_SCREEN, (event) => event.sender === win.webContents && win.isFullScreen())
  const sendFullScreen = () => { if (!win.isDestroyed()) win.webContents.send(FULL_SCREEN_CHANGED, win.isFullScreen()) }
  win.on('enter-full-screen', sendFullScreen)
  win.on('leave-full-screen', sendFullScreen)
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
