// @vitest-environment jsdom
import { MessageChannel } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerCall } from '../core/call-error.js'
import { createFixtureStore } from '../core/fixture-store.js'
import { errorLabel } from '../renderer/lib/failure-label.js'
import { catalogFor } from '../renderer/messages/catalog.js'

const bridge = vi.hoisted(() => ({
  exposed: undefined as unknown,
  listeners: new Map<string, (event: { ports: unknown[] }) => void>(),
}))

// The preload runs for real; only Electron's bridge and IPC are replaced so the test can hand it a port.
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_key: string, api: unknown) => { bridge.exposed = api } },
  ipcRenderer: {
    on: (channel: string, listener: (event: { ports: unknown[] }) => void) => { bridge.listeners.set(channel, listener) },
    send: () => {},
  },
  webUtils: {},
}))

describe('调用跨过进程边界', () => {
  afterEach(() => vi.restoreAllMocks())

  it('Core 抛出的错误带着原因到达渲染端,原话与路径只进日志', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await import('../main/preload.js')
    const { port1: core, port2: page } = new MessageChannel()
    bridge.listeners.get('meridian:port')!({ ports: [page] })
    const store = createFixtureStore()
    core.on('message', ({ id, method, params }: { id: number; method: string; params: { id: string } }) => {
      void answerCall(core, id, method, Promise.resolve().then(() => store.getPaper(params.id)))
    })
    vi.stubGlobal('meridian', bridge.exposed)
    const { papers } = await import('../renderer/ipc.js')

    const missing = '/Users/me/vault/wiki/papers/missing'
    const caught: unknown = await papers.get(missing).catch((error: unknown) => error)
    core.close()

    expect(caught).toMatchObject({ method: 'papers.get', reason: 'not-found' })
    expect(errorLabel(catalogFor('zh'), caught)).toBe('这一项已不存在')
    expect(errorLabel(catalogFor('en'), caught)).toBe('It no longer exists')
    expect((caught as Error).message).not.toContain(missing)
    expect(log).toHaveBeenCalledWith(expect.stringContaining(missing))
  })
})
