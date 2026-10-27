// @vitest-environment jsdom
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractMethod, JobsStatus } from './contract.js'
import { MessagesProvider } from '../renderer/messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../renderer/shell/language.js'
import { createFixtureStore } from '../core/fixture-store.js'
import { createChatService, createHarnessModelConfig, type ChatHarnessRunner } from '../core/harness/index.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Core as the Chat screen reaches it: the real chat service on the fixture store, behind a channel that keeps call order like the MessagePort. */
const core = vi.hoisted(() => ({
  service: null as null | ReturnType<typeof import('../core/harness/index.js').createChatService>,
  release: () => {},
  calls: [] as string[],
}))
/** Core's dispatcher: every call starts in the order it was made, after a microtask. */
const via = vi.hoisted(() => <T,>(method: string, fn: () => T): Promise<Awaited<T>> => {
  core.calls.push(method)
  return Promise.resolve().then(fn) as Promise<Awaited<T>>
})

/** The shell's vault revision, as real state the screen re-renders on. */
const revision = vi.hoisted(() => {
  let value = 0
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    bump: () => { value += 1; for (const l of listeners) l() },
    subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l) },
  }
})

vi.mock('../renderer/ipc.js', () => ({
  appMenu: { platform: () => 'darwin' },
  chat: {
    send: (id: string, runs: never) => via('chat.send' as ContractMethod, () => core.service!.send(id, runs)),
    retry: (id: string) => via('chat.retry', () => core.service!.retry(id)),
    messages: (id: string) => via('chat.messages', () => core.service!.messages(id)),
    cancel: (id: string) => via('chat.cancel', () => core.service!.cancel(id)),
    writing: (id: string) => via('chat.writing', () => core.service!.writing(id)),
    failure: (id: string) => via('chat.failure', () => core.service!.failure(id)),
    create: vi.fn(), recordAction: vi.fn(),
    model: () => Promise.resolve({ source: 'model-1' }), setModel: () => Promise.resolve({ source: 'model-1' }),
  },
  feed: { append: vi.fn() },
  harness: {
    sourceModels: () => Promise.resolve({ source: 'model-1', models: [{ id: 'local-model', efforts: { levels: [] } }] }),
    modelSettings: () => Promise.resolve({
      configured: true, subscription: { active: null, models: { claude: '', codex: '' } },
      models: [{ id: 'model-1', source: { kind: 'api', profile: 'openai' }, model: 'local-model', configured: true }], defaultModel: 'model-1', sources: [{ source: { kind: 'api', profile: 'openai' }, provider: 'openai', entries: ['model-1'], defaultEntry: 'model-1' }],
    }),
    subscriptionStatus: () => Promise.resolve({ state: 'missing' }),
  },
  idea: { create: vi.fn() },
  jobs: {
    status: (): Promise<JobsStatus> => via('jobs.status', () => ({
      writes: 0, uploads: [], downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null },
      generating: core.service!.generating(), generatingWiki: [], wikiFailures: {},
    })),
  },
  papers: { list: () => Promise.resolve({ rows: [], total: 0 }) },
  project: { list: () => Promise.resolve([]) },
  wiki: { cards: () => Promise.resolve([]) },
}))

vi.mock('../renderer/shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: null, open: vi.fn(), returnTo: vi.fn() }),
  useScreenEntry: () => 0,
  useChatSession: () => ({ id: 'amortize', title: '讨论', archived: false, select: vi.fn() }),
  useVaultRevision: () => ({ revision: useSyncExternalStore(revision.subscribe, revision.get), bump: revision.bump }),
  useSettingsOpen: () => ({ open: false, openCategory: vi.fn() }),
}))

const { Chat } = await import('../renderer/routes/Chat.js')
const { GenerationsContext, useCoreGenerations } = await import('../renderer/hooks/useGenerations.js')
const { ModelStatusContext, useCoreModelStatus } = await import('../renderer/hooks/useModelStatus.js')
const { useJobsPoll } = await import('../renderer/shell/useJobs.js')

function Shell({ children }: { children: ReactNode }) {
  const { status, refresh } = useJobsPoll(revision.bump)
  return (
    <GenerationsContext.Provider value={useCoreGenerations(status, refresh)}>
      <ModelStatusContext.Provider value={useCoreModelStatus(false)}>{children}</ModelStatusContext.Provider>
    </GenerationsContext.Provider>
  )
}

describe('a chat turn on the real Core chat service, with a reply that has not settled', () => {
  let root: Root | null = null

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const model = await createHarnessModelConfig(mkdtempSync(join(tmpdir(), 'meridian-451-')), {
      seal: async (secret) => secret, open: async (secret) => ({ secret }),
    })
    await model.update({
      provider: 'openai-compatible', protocol: 'responses',
      baseUrl: 'http://127.0.0.1:11434/v1', model: 'local-model', authentication: 'none',
    })
    const runner: ChatHarnessRunner = {
      checkConnection: vi.fn(), close: vi.fn(), listModels: vi.fn(), design: vi.fn(),
      answer: (_id, _text, _signal, on) => new Promise((resolve) => {
        on!.onModel({ route: 'subscription', cli: 'claude', id: 'claude-opus-5-5[1m]' })
        on!.onText('写到一半')
        core.release = () => resolve('写完的回答')
      }),
    }
    core.service = createChatService({ store: createFixtureStore(), model, runner })
    core.calls.length = 0
    document.body.innerHTML = ''
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(<MessagesProvider><Shell><Chat /></Shell></MessagesProvider>)
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
    })
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const settle = () => act(async () => { for (let turn = 0; turn < 10; turn += 1) await Promise.resolve() })
  const yours = () => [...document.querySelectorAll('.msgs .msg.you .bubble')].map((node) => node.textContent)
  const answers = () => [...document.querySelectorAll('.msgs .msg.ai .answer')].map((node) => node.textContent)

  it('shows the sent message in the stream at once, above the pending answer, before the reply settles', async () => {
    expect(yours()).not.toContain('新的问题')
    act(() => {
      const view = EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!
      view.dispatch({ changes: { from: 0, insert: '新的问题' }, userEvent: 'input.type' })
    })
    act(() => {
      document.querySelector('#composer')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()
    await act(async () => { await new Promise((wait) => setTimeout(wait, 200)) })

    expect(core.service!.generating()).toEqual(['amortize'])
    expect(yours().at(-1)).toBe('新的问题')
    expect(answers().at(-1)).toBe('写到一半')
    expect(core.calls.indexOf('chat.send')).toBeLessThan(core.calls.lastIndexOf('chat.messages'))

    await act(async () => { core.release(); await Promise.resolve() })
    await settle()
    expect(yours().at(-1)).toBe('新的问题')
    expect(answers().at(-1)).toBe('写完的回答')
  })
})
