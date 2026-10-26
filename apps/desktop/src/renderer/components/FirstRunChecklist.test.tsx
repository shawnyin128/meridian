// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const ROOT = '/libraries/new'

const state = vi.hoisted(() => ({
  papers: 0 as number | null,
  revision: 0,
  openError: null as string | null,
  configured: false,
  plugin: 'not-installed' as 'installed' | 'not-installed',
  settingsOpen: false,
  reads: 0,
  extensionReads: 0,
  /** Whether the shell has read its model status yet. */
  modelKnown: true,
  openCategory: vi.fn(),
  jump: vi.fn(),
}))

vi.mock('../ipc.js', () => ({
  library: { location: () => Promise.resolve({ root: '/libraries/new', openError: state.openError }) },
  harness: { modelSettings: () => { state.reads += 1; return Promise.resolve({ configured: state.configured, subscription: { active: null, models: { claude: '', codex: '' } } }) } },
  extensions: {
    status: () => {
      state.extensionReads += 1
      return Promise.resolve([{ id: 'codex', state: 'not-installed' }, { id: 'claude-code', state: state.plugin }])
    },
  },
}))

vi.mock('../shell/AppShell.js', () => ({
  usePaperCount: () => state.papers,
  useVaultRevision: () => ({ revision: state.revision, bump: () => {} }),
  useSettingsOpen: () => ({ open: state.settingsOpen, openCategory: state.openCategory }),
  useJump: () => ({ jump: null, open: state.jump, returnTo: () => {} }),
}))

const { FirstRunChecklist, firstRunKey, firstRunShown } = await import('./FirstRunChecklist.js')
const { ModelStatusContext } = await import('../hooks/useModelStatus.js')

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve() })
}

describe('firstRunShown', () => {
  it('隐藏或做完后不再显示;还有没做完的步骤时,空库或之前在空库上显示过的库才显示', () => {
    expect(firstRunShown(null, 0, [true, false])).toBe(true)
    expect(firstRunShown('open', 3, [true, false])).toBe(true)
    expect(firstRunShown(null, 3, [true, false])).toBe(false)
    expect(firstRunShown('closed', 0, [true, false])).toBe(false)
    expect(firstRunShown('open', 3, [true, true])).toBe(false)
  })
})

describe('FirstRunChecklist', () => {
  let root: Root
  let host: HTMLDivElement
  const onError = vi.fn()
  const onShown = vi.fn()

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    Object.assign(state, {
      papers: 0, revision: 0, openError: null, configured: false, plugin: 'not-installed', settingsOpen: false, reads: 0, extensionReads: 0,
      modelKnown: true,
    })
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  /** Renders the checklist in a shell whose model status says a model is set up while `state.configured`. */
  const render = async () => {
    act(() => root.render(
      <MessagesProvider>
        <ModelStatusContext.Provider value={{
          connected: state.modelKnown ? state.configured : null, source: state.modelKnown && state.configured ? 'api' : null, track: (send) => send,
        }}>
          <FirstRunChecklist onError={onError} onShown={onShown} />
        </ModelStatusContext.Provider>
      </MessagesProvider>,
    ))
    await flush()
  }
  const remount = async () => {
    act(() => root.unmount())
    root = createRoot(host)
    await render()
  }
  const steps = () => [...host.querySelectorAll<HTMLElement>('[data-step]')]
    .map((li) => [li.dataset.step, li.dataset.done, li.textContent])
  const button = (step: string) => host.querySelector<HTMLButtonElement>(`[data-step="${step}"] button`)!

  it('空库上是一行:开始使用和四步,每步按真实状态标出做没做;没做的一步是小按钮,打开去做它的地方', async () => {
    await render()
    expect(host.querySelector('.firstrun-heading')!.textContent).toBe('开始使用')
    expect(steps()).toEqual([
      ['library', 'true', '选择论文库'], ['model', 'false', '设置模型'],
      ['plugin', 'false', '安装 agent 插件'], ['paper', 'false', '导入第一篇论文'],
    ])
    expect(host.querySelector('[data-step="library"] button')).toBeNull()
    expect(button('model').className).toBe('btn sm')
    act(() => button('model').click())
    expect(state.openCategory).toHaveBeenLastCalledWith('model')
    act(() => button('plugin').click())
    expect(state.openCategory).toHaveBeenLastCalledWith('extensions')
    act(() => button('paper').click())
    expect(state.jump).toHaveBeenCalledWith('papers', '', { importPdf: true })
    expect(window.localStorage.getItem(firstRunKey(ROOT))).toBe('open')
  })

  it('读到之后告诉页面它显示没显示：空库上显示，有论文的库上不显示', async () => {
    await render()
    expect(onShown.mock.calls).toEqual([[true]])
    act(() => root.unmount())
    root = createRoot(host)
    onShown.mockClear()
    window.localStorage.clear()
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    state.papers = 4
    await render()
    expect(onShown.mock.calls).toEqual([[false]])
  })

  it('不是空库、也没在空库上显示过时不出现', async () => {
    state.papers = 4
    await render()
    expect(host.innerHTML).toBe('')
    expect(window.localStorage.getItem(firstRunKey(ROOT))).toBeNull()
  })

  it('导入第一篇之后还没做完的步骤仍然显示;每一步都做完就不再显示,之后也不回来', async () => {
    await render()
    // The import is a vault write, which bumps the revision the checklist reads again on.
    state.papers = 1
    state.plugin = 'installed'
    state.revision += 1
    await render()
    expect(steps().map(([step, done]) => [step, done])).toEqual([
      ['library', 'true'], ['model', 'false'], ['plugin', 'true'], ['paper', 'true'],
    ])
    state.configured = true
    await remount()
    expect(host.innerHTML).toBe('')
    expect(window.localStorage.getItem(firstRunKey(ROOT))).toBe('closed')
    state.configured = false
    await remount()
    expect(host.innerHTML).toBe('')
  })

  it('设置关上时重读一次:在设置里配好模型,回来这一步就打上勾', async () => {
    await render()
    state.settingsOpen = true
    await render()
    state.configured = true
    state.settingsOpen = false
    await render()
    expect(steps().find(([step]) => step === 'model')![1]).toBe('true')
  })

  it('点隐藏就收起,只记在这台机器的 localStorage 里,重开也不再显示,也不再去读设置', async () => {
    await render()
    act(() => host.querySelector<HTMLButtonElement>('.firstrun-hide')!.click())
    expect(host.innerHTML).toBe('')
    expect(window.localStorage.getItem(firstRunKey(ROOT))).toBe('closed')
    state.extensionReads = 0
    await remount()
    expect(host.innerHTML).toBe('')
    expect(state.extensionReads).toBe(0)
  })

  it('模型这一步跟着应用共用的模型状态:状态一说配好了,不等设置关上也马上打上勾,也不自己去读模型设置', async () => {
    await render()
    expect(steps().find(([step]) => step === 'model')![1]).toBe('false')
    state.configured = true
    await render()
    expect(steps().find(([step]) => step === 'model')![1]).toBe('true')
    expect(state.reads).toBe(0)
  })

  it('应用还没读到模型状态时不显示,也不先说一声不显示', async () => {
    state.modelKnown = false
    await render()
    expect([host.innerHTML, onShown.mock.calls]).toEqual(['', []])
    state.modelKnown = true
    await render()
    expect(onShown.mock.calls).toEqual([[true]])
  })
})
