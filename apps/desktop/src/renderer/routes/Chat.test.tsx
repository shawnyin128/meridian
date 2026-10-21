// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ChatSendResult, ChatSession, PaperRow } from '../../shared/contract.js'
import { CONFLICT_THREAD } from '../lib/chat.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { TOOLTIP_DELAY } from '../components/Tooltip.js'
import type { ScreenJump } from '../shell/AppShell.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  send: vi.fn((): Promise<ChatSendResult> => Promise.resolve({ id: 'chat-1', state: 'complete' })),
  cancel: vi.fn(() => Promise.resolve({ id: 'chat-1', cancelled: true })),
  listProjects: vi.fn(() => Promise.resolve([{
    id: 'draft', name: '草稿树项目', status: '进行中', priority: 'p1', topic: '推理', focus: '验证',
    conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
    milestones: [], recentEvents: [],
  }])),
  listPapers: vi.fn((): Promise<{ rows: PaperRow[]; total: number }> => Promise.resolve({ rows: [], total: 0 })),
  messages: vi.fn<() => Promise<ChatMessage[]>>(() => Promise.resolve([])),
  create: vi.fn<(title: string, named: boolean) => Promise<ChatSession>>(),
  recordAction: vi.fn<() => Promise<{ id: string; name: string }>>(),
  feedAppend: vi.fn(() => Promise.resolve()),
  createIdea: vi.fn(() => Promise.resolve({ id: 'idea-1' })),
}))

const session = vi.hoisted(() => ({ id: 'chat-1', revision: 0 }))
const settings = vi.hoisted(() => ({ openCategory: vi.fn() }))
/** The jump useJump hands the Chat screen. */
const nav = vi.hoisted(() => ({ jump: null as ScreenJump | null }))

/** The callbacks of every ResizeObserver made. */
const resized: (() => void)[] = []

vi.mock('../ipc.js', () => ({
  chat: { send: api.send, messages: api.messages, cancel: api.cancel, create: api.create, recordAction: api.recordAction },
  feed: { append: api.feedAppend },
  idea: { create: api.createIdea },
  papers: { list: api.listPapers },
  project: { list: api.listProjects },
  wiki: { cards: () => Promise.resolve([]) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: nav.jump, open: vi.fn(), returnTo: vi.fn() }),
  useChatSession: () => ({ id: session.id, title: '讨论', archived: false, select: vi.fn() }),
  useVaultRevision: () => ({ revision: session.revision, bump: vi.fn() }),
  useSettingsOpen: () => ({ open: false, openCategory: settings.openCategory }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (op: Promise<unknown>) => {
    await op
    return true
  },
}))

const { Chat } = await import('./Chat.js')

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Chat composer', () => {
  let root: Root | null = null
  let composer: HTMLTextAreaElement

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    resized.length = 0
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized.push(callback) }
      observe() {}
      disconnect() {}
    })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    session.id = 'chat-1'
    session.revision = 0
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(<MessagesProvider><Chat /></MessagesProvider>)
      await Promise.resolve()
      await Promise.resolve()
    })
    const field = host.querySelector('#composer')
    expect(field).toBeInstanceOf(window.HTMLTextAreaElement)
    composer = field as HTMLTextAreaElement
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    nav.jump = null
  })

  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    act(() => { composer.dispatchEvent(event) })
    return event
  }

  /** Opens chat `id` from the sidebar: the Chat screen stays mounted and shows another session. */
  const openChat = async (id: string) => {
    session.id = id
    await act(async () => {
      root!.render(<MessagesProvider><Chat /></MessagesProvider>)
      await Promise.resolve()
    })
  }

  it('从动态看冲突时新开一个叫结论冲突的对话，问这两条结论为什么冲突', async () => {
    api.create.mockResolvedValueOnce({ id: 'chat-9' } as ChatSession)
    nav.jump = { screen: 'chat', target: CONFLICT_THREAD, from: 'feed', seq: 1 }
    await act(async () => {
      root!.render(<MessagesProvider><Chat /></MessagesProvider>)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.create).toHaveBeenCalledWith('结论冲突', true)
    expect(api.send).toHaveBeenCalledWith('chat-9', '为什么说这两条结论冲突？')
  })

  it('回车发送，Shift+回车换行，输入法组字时的回车不发送', async () => {
    act(() => setValue(composer, '为什么'))
    expect(press('Enter', { shiftKey: true }).defaultPrevented).toBe(false)
    expect(press('Enter', { isComposing: true }).defaultPrevented).toBe(false)
    expect(api.send).not.toHaveBeenCalled()

    expect(press('Enter').defaultPrevented).toBe(true)
    await act(async () => { await Promise.resolve() })
    expect(api.send).toHaveBeenCalledWith('chat-1', '为什么')
  })

  it('没配置模型时发送失败，输入框里显示「AI 未连接」的状态，点它打开设置的模型一栏；配好后再发一次成功，状态就消失', async () => {
    api.send.mockResolvedValueOnce({ id: 'chat-1', state: 'failed', reason: 'no-model' })
    const state = () => document.querySelector('.cbox .tag')?.textContent ?? null
    expect(state()).toBeNull()
    act(() => setValue(composer, '为什么'))
    press('Enter')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(state()).toBe('AI 未连接')
    const tag = document.querySelector<HTMLElement>('.cbox .tag')!
    expect(tag.tagName).toBe('BUTTON')
    act(() => tag.click())
    expect(settings.openCategory).toHaveBeenCalledWith('model')
    act(() => setValue(composer, '再问一次'))
    press('Enter')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(state()).toBeNull()
  })

  it('@ 候选开着时输入法组字的 Esc 不收起候选，组完字后的 Esc 才收起', () => {
    act(() => setValue(composer, '@'))
    expect(document.querySelector('#cRes')).not.toBeNull()
    press('Escape', { isComposing: true })
    expect(document.querySelector('#cRes')).not.toBeNull()
    press('Escape')
    expect(document.querySelector('#cRes')).toBeNull()
  })

  it('有 @ 候选时回车填入候选而不发送；没有候选时上下键留给光标在行间移动', () => {
    act(() => setValue(composer, '@'))
    expect(document.querySelector('#cRes')).not.toBeNull()
    expect(press('Enter').defaultPrevented).toBe(true)
    expect(composer.value).toBe('@草稿树项目 ')
    expect(api.send).not.toHaveBeenCalled()

    act(() => setValue(composer, '第一行\n第二行'))
    expect(press('ArrowUp').defaultPrevented).toBe(false)
    expect(press('ArrowDown').defaultPrevented).toBe(false)
  })

  it('草稿属于它的对话：换到另一条对话后回车不把它发过去，输入框是空的，切回来草稿还在', async () => {
    act(() => setValue(composer, '只问第一条'))
    await openChat('chat-2')
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(api.send).not.toHaveBeenCalled()
    expect(composer.value).toBe('')

    await openChat('chat-1')
    expect(composer.value).toBe('只问第一条')
  })

  it('@ 候选里论文的灰字把稍后阅读的阅读状态写成待读', async () => {
    api.listPapers.mockResolvedValueOnce({
      rows: [{ id: 'p1', title: 'EAGLE', year: 2024, readState: '稍后阅读' } as PaperRow], total: 1,
    })
    session.revision += 1
    await openChat('chat-1')
    act(() => setValue(composer, '@EAGLE'))
    expect([...document.querySelectorAll('#cRes .rm')].map((line) => line.textContent)).toEqual(['2024 · 待读'])
  })

  it('记入科研记录后在动态里记一条,项目名带着项目的 id', async () => {
    api.messages.mockResolvedValueOnce([{
      id: 'm1', role: 'ai', runs: [{ kind: 'text', text: '结论' }],
      actions: [{ kind: 'writeBack', label: '记入科研记录', project: 'draft', text: '结论' }],
    }])
    api.recordAction.mockResolvedValueOnce({ id: 'draft', name: '草稿树项目' })
    session.revision += 1
    await openChat('chat-1')
    await act(async () => { document.querySelector<HTMLButtonElement>('.macts .btn')!.click() })
    expect(api.feedAppend).toHaveBeenCalledWith({ source: 'me', body: { kind: 'runs', runs: [
      { kind: 'text', text: '已记入《' }, { kind: 'text', text: '草稿树项目', target: { kind: 'project', id: 'draft' } },
      { kind: 'text', text: '》的科研记录' },
    ] } })
  })

  it('@ 候选只留在打开它的那条对话里', async () => {
    act(() => setValue(composer, '@'))
    expect(document.querySelector('#cRes')).not.toBeNull()
    await openChat('chat-2')
    expect(document.querySelector('#cRes')).toBeNull()
  })

  /** Sends `text` from the open chat and leaves its reply generating until the returned call. */
  const sendPending = (text: string) => {
    let finish = () => {}
    api.send.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ id: session.id, state: 'complete' })
    }))
    act(() => setValue(composer, text))
    press('Enter')
    return async () => { await act(async () => { finish(); await Promise.resolve() }) }
  }
  const control = () => document.querySelector<HTMLButtonElement>('#sendBtn')!

  it('一条对话还在生成时，换到另一条对话照常可以输入和发送', async () => {
    const finish = sendPending('第一条的问题')
    expect(control().getAttribute('aria-label')).toBe('正在生成，点击停止')

    await openChat('chat-2')
    expect(composer.disabled).toBe(false)
    expect(control().getAttribute('aria-label')).toBe('发送')
    act(() => setValue(composer, '第二条的问题'))
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(api.send).toHaveBeenLastCalledWith('chat-2', '第二条的问题')
    await finish()
  })

  it('停止停的是正在生成的那条对话，别的对话不显示停止', async () => {
    const finish = sendPending('第一条的问题')
    await openChat('chat-2')
    expect(control().getAttribute('aria-label')).toBe('发送')

    await openChat('chat-1')
    expect(control().getAttribute('aria-label')).toBe('正在生成，点击停止')
    act(() => control().click())
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith('chat-1')
    expect(control().getAttribute('aria-label')).toBe('发送')
    await finish()
  })

  it('草稿去掉空白后为空时发送钮不可点，生成中的停止仍可点', async () => {
    expect(control().disabled).toBe(true)
    act(() => setValue(composer, ' \n '))
    expect(control().disabled).toBe(true)
    act(() => setValue(composer, '为什么'))
    expect(control().disabled).toBe(false)

    const finish = sendPending('为什么')
    expect(control().getAttribute('aria-label')).toBe('正在生成，点击停止')
    expect(control().disabled).toBe(false)
    await finish()
  })

  it('快捷引用是一行的幽灵 chip，保存为想法是排在工具栏末尾的幽灵按钮，还没讨论时旁边写着尚无讨论', () => {
    const chips = [...document.querySelectorAll<HTMLButtonElement>('#qmChips button')]
    expect(chips.map((chip) => [chip.className, chip.querySelector('.fade-text')?.textContent]))
      .toEqual([['btn ghost sm qm', '@草稿树项目']])
    const save = document.querySelector<HTMLButtonElement>('#qaIdea')!
    expect(save.className).toBe('btn ghost sm save-idea')
    expect(save.parentElement!.lastElementChild).toBe(save)
    expect([save.disabled, save.previousElementSibling?.textContent]).toEqual([true, '尚无讨论'])
    expect(document.querySelector('.qsep')).toBeNull()
  })

  /** Shows the chat `id` holding one message of yours, as the shell does when that chat is picked. */
  const showChat = async (id: string) => {
    session.id = id
    session.revision += 1
    api.messages.mockResolvedValueOnce([{ id: 'm1', role: 'you', runs: [{ kind: 'text', text: '先讨论机制' }], actions: [] }])
    await act(async () => {
      root!.render(<MessagesProvider><Chat /></MessagesProvider>)
      await Promise.resolve()
      await Promise.resolve()
    })
  }
  const ideaDraft = () => document.querySelector<HTMLElement>('.idea-draft')
  const keyIn = (target: Element, key: string, init: KeyboardEventInit = {}) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })

  it('保存为想法在最后一条消息下面就地打开草稿,不弹对话框,标明落到想法和它的来源,焦点在标题', async () => {
    await showChat('chat-1')
    act(() => document.querySelector<HTMLButtonElement>('#qaIdea')!.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    const msgs = document.querySelector('.msgs')!
    expect(msgs.lastElementChild!.contains(ideaDraft())).toBe(true)
    expect(msgs.lastElementChild!.previousElementSibling!.textContent).toContain('先讨论机制')
    expect(ideaDraft()!.querySelector('.draft-form-destination')!.textContent).toBe('→想法')
    expect(ideaDraft()!.querySelector('.idea-draft-source')!.textContent).toBe('来源：讨论')
    expect(document.activeElement).toBe(ideaDraft()!.querySelector('input'))
  })

  it('想法草稿在正文上按 ⌘Enter 经 idea.create 存进这条对话的想法;Esc 收起,什么也不存', async () => {
    await showChat('chat-1')
    act(() => document.querySelector<HTMLButtonElement>('#qaIdea')!.click())
    act(() => setValue(ideaDraft()!.querySelector('input')!, '批大小拐点'))
    act(() => setValue(ideaDraft()!.querySelector('textarea')!, '验证最优批大小是否随推理深度稳定迁移。'))
    keyIn(ideaDraft()!.querySelector('textarea')!, 'Enter')
    expect(api.createIdea).not.toHaveBeenCalled()
    await act(async () => { keyIn(ideaDraft()!.querySelector('textarea')!, 'Enter', { metaKey: true }); await Promise.resolve() })
    expect(api.createIdea).toHaveBeenCalledWith('chat-1', '批大小拐点', '验证最优批大小是否随推理深度稳定迁移。')
    expect(ideaDraft()).toBeNull()

    act(() => document.querySelector<HTMLButtonElement>('#qaIdea')!.click())
    keyIn(ideaDraft()!.querySelector('input')!, 'Escape')
    expect(ideaDraft()).toBeNull()
    expect(api.createIdea).toHaveBeenCalledOnce()
  })

  it('想法草稿留在它的对话上:换一条对话时不跟过去,回来时还在', async () => {
    await showChat('chat-1')
    act(() => document.querySelector<HTMLButtonElement>('#qaIdea')!.click())
    act(() => setValue(ideaDraft()!.querySelector('input')!, '只属于这条对话'))
    await showChat('chat-2')
    expect(ideaDraft()).toBeNull()
    await showChat('chat-1')
    expect(ideaDraft()!.querySelector('input')!.value).toBe('只属于这条对话')
  })

  it('快捷引用的名字被截断时，悬停在共享 tooltip 里显示全名，放得下时不弹', () => {
    vi.useFakeTimers()
    const chip = document.querySelector<HTMLButtonElement>('#qmChips button')!
    const text = chip.querySelector<HTMLElement>('.fade-text')!
    text.style.overflowX = 'hidden'
    const width = vi.spyOn(text, 'scrollWidth', 'get').mockReturnValue(100)
    vi.spyOn(text, 'clientWidth', 'get').mockReturnValue(100)
    const tip = () => {
      act(() => { chip.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
      act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
      const shown = document.querySelector('[role="tooltip"]')?.textContent ?? null
      act(() => {
        chip.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }))
        chip.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      })
      act(() => { document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, pointerType: 'mouse' })) })
      act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
      return shown
    }
    expect(tip()).toBeNull()
    width.mockReturnValue(160)
    expect(tip()).toBe('草稿树项目')
    vi.useRealTimers()
  })

  it('对话在页面主体里滚动:停在末尾时新消息滚进视野,往上翻着读时不抢,自己发出的消息总会滚进视野', async () => {
    const body = document.querySelector<HTMLElement>('.desk-body')!
    let top = 0
    let length = 600
    Object.defineProperty(body, 'clientHeight', { configurable: true, get: () => 300 })
    Object.defineProperty(body, 'scrollHeight', { configurable: true, get: () => length })
    Object.defineProperty(body, 'scrollTop', {
      configurable: true, get: () => top, set: (value: number) => { top = Math.min(value, Math.max(length - 300, 0)) },
    })
    const said: ChatMessage[] = []
    /** An answer lands in the vault: the chat reloads and its conversation grows by 200px. */
    const arrive = async () => {
      said.push({ id: `m${said.length}`, role: 'ai', runs: [{ kind: 'text', text: '回答' }], actions: [] })
      api.messages.mockResolvedValueOnce([...said])
      session.revision += 1
      length += 200
      await act(async () => {
        root!.render(<MessagesProvider><Chat /></MessagesProvider>)
        await Promise.resolve()
      })
      act(() => { for (const callback of resized) callback() })
    }

    await arrive()
    expect(body.scrollTop).toBe(500)
    act(() => {
      body.scrollTop = 100
      body.dispatchEvent(new Event('scroll'))
    })
    await arrive()
    expect(body.scrollTop).toBe(100)

    act(() => setValue(composer, '为什么'))
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(body.scrollTop).toBe(700)
  })
})
