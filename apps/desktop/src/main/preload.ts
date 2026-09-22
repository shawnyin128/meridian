import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ContractMethod } from '../shared/contract.js'
import type { AppUpdateStatus } from '../shared/app-update.js'
import { MAIN_COPY, type UiLocale } from './messages.js'

const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let nextId = 1

/** Resolve the saved preference before the renderer starts so connection errors use the same language. */
function initialLocale(): UiLocale {
  try {
    const stored = globalThis.localStorage?.getItem('meridian.language')
    if (stored === 'zh' || stored === 'en') return stored
  } catch {
    // A blocked storage backend falls through to the operating-system languages.
  }
  for (const tag of globalThis.navigator?.languages ?? []) {
    const primary = tag.toLowerCase().split('-')[0]
    if (primary === 'zh' || primary === 'en') return primary
  }
  return 'en'
}

let uiLocale = initialLocale()
const copy = () => MAIN_COPY[uiLocale].preload

// Main delivers the port asynchronously. Calls await this single-settlement promise instead of
// failing before the port arrives. The timeout preserves a useful "port never arrived" diagnostic.
const port = new Promise<MessagePort>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(copy().serviceUnavailable)), 5000)
  ipcRenderer.on('meridian:port', (event) => {
    clearTimeout(timer)
    const incoming = event.ports[0]
    // Throwing here cannot reject the outer promise because its executor has returned; reject explicitly.
    if (!incoming) {
      reject(new Error(copy().connectionMissing))
      return
    }
    incoming.onmessage = (msg) => {
      const { id, ok, data, error } = msg.data as { id: number; ok: boolean; data?: unknown; error?: string }
      const waiter = pending.get(id)
      if (!waiter) return
      pending.delete(id)
      if (ok) waiter.resolve(data)
      else waiter.reject(new Error(error ?? copy().unknownError))
    }
    incoming.start()
    resolve(incoming)
  })
})
ipcRenderer.send('meridian:port-request')

// Expose one contract-bound request method and one narrowly scoped subscription. Do not expose
// generic invoke(channel, args) or on(channel, handler) APIs; channel names remain private literals.
contextBridge.exposeInMainWorld('meridian', {
  call(method: ContractMethod, params: unknown): Promise<unknown> {
    return port.then((p) => new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      p.postMessage({ id, method, params })
    }))
  },
  onOpenSettings(handler: () => void): () => void {
    // IpcRendererEvent exposes sender and ports, so discard it instead of bypassing this narrow API.
    const relay = () => handler()
    ipcRenderer.on('meridian:open-settings', relay)
    return () => { ipcRenderer.off('meridian:open-settings', relay) }
  },
  onOpenAgentTutorial(handler: () => void): () => void {
    const relay = () => handler()
    ipcRenderer.on('meridian:open-agent-tutorial', relay)
    return () => { ipcRenderer.off('meridian:open-agent-tutorial', relay) }
  },
  chooseLibraryRoot(): Promise<string | null> {
    return ipcRenderer.invoke('meridian:choose-library-root') as Promise<string | null>
  },
  chooseWorkspaceRoot(): Promise<string | null> {
    return ipcRenderer.invoke('meridian:choose-workspace-root') as Promise<string | null>
  },
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
  revealFile(path: string): Promise<boolean> {
    return ipcRenderer.invoke('meridian:reveal-file', path) as Promise<boolean>
  },
  updates: {
    status(): Promise<AppUpdateStatus> {
      return ipcRenderer.invoke('meridian:update-status') as Promise<AppUpdateStatus>
    },
    check(): Promise<AppUpdateStatus> {
      return ipcRenderer.invoke('meridian:update-check') as Promise<AppUpdateStatus>
    },
    install(): void {
      ipcRenderer.send('meridian:update-install')
    },
    onChange(handler: (status: AppUpdateStatus) => void): () => void {
      const relay = (_event: unknown, status: AppUpdateStatus) => handler(status)
      ipcRenderer.on('meridian:update-changed', relay)
      return () => { ipcRenderer.off('meridian:update-changed', relay) }
    },
  },
  restartApp(): void {
    ipcRenderer.send('meridian:restart-app')
  },
  toggleMaximize(): void {
    ipcRenderer.send('meridian:toggle-maximize')
  },
  platform: process.platform,
  setTitleBarTheme(symbolColor: string): void {
    ipcRenderer.send('meridian:title-bar-theme', symbolColor)
  },
  setLocale(locale: 'zh' | 'en'): void {
    uiLocale = locale
    ipcRenderer.send('meridian:set-locale', locale)
  },
})
