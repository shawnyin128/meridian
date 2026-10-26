// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { redo, undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ChatSendResult, ChatSession, ChatWriting, JobsStatus, PaperRow } from '../../shared/contract.js'
import { CONFLICT_THREAD } from '../lib/chat.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { TOOLTIP_DELAY } from '../components/Tooltip.js'
import type { ScreenJump } from '../shell/AppShell.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  /** The chats Core is generating a reply in. */
  generating: new Set<string>(),
  send: vi.fn((): Promise<ChatSendResult> => Promise.resolve({ id: 'chat-1', state: 'complete' })),
  retry: vi.fn((): Promise<ChatSendResult> => Promise.resolve({ id: 'chat-1', state: 'complete' })),
  cancel: vi.fn((id: string) => Promise.resolve({ id, cancelled: api.generating.delete(id) })),
  listProjects: vi.fn(() => Promise.resolve([{
    id: 'draft', name: '草稿树项目', status: '进行中', priority: 'p1', topic: '推理', focus: '验证',
    conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
    milestones: [], recentEvents: [],
  }])),
  listPapers: vi.fn((): Promise<{ rows: PaperRow[]; total: number }> => Promise.resolve({ rows: [], total: 0 })),
  messages: vi.fn<() => Promise<ChatMessage[]>>(() => Promise.resolve([])),
  writing: vi.fn<(id: string) => Promise<ChatWriting | null>>(() => Promise.resolve(null)),
  create: vi.fn<(title: string, named: boolean) => Promise<ChatSession>>(),
  recordAction: vi.fn<() => Promise<{ id: string; name: string }>>(),
  feedAppend: vi.fn(() => Promise.resolve()),
  createIdea: vi.fn(() => Promise.resolve({ id: 'idea-1' })),
  /** Whether the model settings set up a model. */
  configured: true,
}))

const session = vi.hoisted(() => ({ id: 'chat-1', revision: 0 }))
const settings = vi.hoisted(() => ({ openCategory: vi.fn() }))
/** The jump useJump hands the Chat screen. */
const nav = vi.hoisted(() => ({ jump: null as ScreenJump | null, returnTo: vi.fn(), entry: 0 }))

/** The callbacks of every ResizeObserver made. */
const resized: (() => void)[] = []

vi.mock('../ipc.js', () => ({
  appMenu: { platform: () => 'darwin' },
  chat: {
    send: api.send, retry: api.retry, messages: api.messages, cancel: api.cancel, create: api.create, recordAction: api.recordAction,
    writing: api.writing,
    model: () => Promise.resolve({ model: 'model-1' }), setModel: () => Promise.resolve({ model: 'model-1' }),
  },
  feed: { append: api.feedAppend },
  harness: {
    modelSettings: () => Promise.resolve({
      configured: api.configured, subscription: { active: null, models: { claude: '', codex: '' } },
      models: [{ id: 'model-1', source: { kind: 'api', profile: 'openai' }, model: 'gpt-5.5', configured: api.configured }], defaultModel: 'model-1', sources: [{ source: { kind: 'api', profile: 'openai' }, provider: 'openai', entries: ['model-1'], defaultEntry: 'model-1' }],
    }),
    subscriptionStatus: () => Promise.resolve({ state: 'missing' }),
  },
  idea: { create: api.createIdea },
  jobs: {
    status: (): Promise<JobsStatus> => Promise.resolve({
      writes: 0, uploads: [], downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null },
      generating: [...api.generating], generatingWiki: [], wikiFailures: {},
    }),
  },
  papers: { list: api.listPapers },
  project: { list: api.listProjects },
  wiki: { cards: () => Promise.resolve([]) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: nav.jump, open: vi.fn(), returnTo: nav.returnTo }),
  useScreenEntry: () => nav.entry,
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
const { GenerationsContext, useCoreGenerations } = await import('../hooks/useGenerations.js')
const { ModelStatusContext, useCoreModelStatus } = await import('../hooks/useModelStatus.js')
const { useJobsPoll } = await import('../shell/useJobs.js')

const noBump = () => {}
/** The shell around the screen: the jobs poll and the generations it reports, and the model status. */
function Shell({ children }: { children: ReactNode }) {
  const { status, refresh } = useJobsPoll(noBump)
  return (
    <GenerationsContext.Provider value={useCoreGenerations(status, refresh)}>
      <ModelStatusContext.Provider value={useCoreModelStatus(false)}>{children}</ModelStatusContext.Provider>
    </GenerationsContext.Provider>
  )
}
const screen = () => <MessagesProvider><Shell><Chat /></Shell></MessagesProvider>

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Chat composer', () => {
  let root: Root | null = null

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
    api.generating.clear()
    api.writing.mockResolvedValue(null)
    api.configured = true
    session.id = 'chat-1'
    session.revision = 0
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(screen())
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(['role', 'aria-label'].map((name) => host.querySelector('#composer')!.getAttribute(name))).toEqual(['textbox', '问题或想法'])
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    nav.jump = null
    nav.entry = 0
    nav.returnTo.mockClear()
  })

  /** The composer's editable text; switching chats mounts a new one. */
  const field = () => document.querySelector<HTMLElement>('#composer')!
  const editor = () => EditorView.findFromDOM(field().closest<HTMLElement>('.cm-editor')!)!
  /** Replaces the draft with `text` as typing it would, leaving the caret at `caret`, or at its end. */
  const type = (text: string, caret = text.length) => act(() => {
    const view = editor()
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: caret }, userEvent: 'input.type' })
  })
  /** The draft as the composer shows it, each pill as its text. */
  const typed = () => editor().state.doc.toString()
  /** The pills in the composer, in order. */
  const pills = () => [...field().querySelectorAll('.composer-mention')].map((pill) => pill.textContent)
  const locked = () => field().getAttribute('contenteditable') === 'false'
  /** Types `text` at the caret. */
  const typeOn = (text: string) => act(() => {
    const view = editor()
    view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.type' })
  })
  /**
   * Presses `key` in the composer and returns whether the key reached the editor unclaimed: a
   * listener on the editor's text sees it before the editor acts on it, after the composer has.
   */
  const reaches = (key: string, init: KeyboardEventInit = {}) => {
    let free: boolean | null = null
    const see = (event: Event) => { free = !event.defaultPrevented }
    field().addEventListener('keydown', see, { capture: true })
    press(key, init)
    field().removeEventListener('keydown', see, { capture: true })
    return free
  }

  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    act(() => { field().dispatchEvent(event) })
    return event
  }

  /** Opens chat `id` from the sidebar: the Chat screen stays mounted and shows another session. */
  const openChat = async (id: string) => {
    session.id = id
    await act(async () => {
      root!.render(screen())
      await Promise.resolve()
    })
  }

  it('从别的屏点链接来时屏头左端有返回，按它回到来的那一屏；从侧栏进来时没有返回', async () => {
    const back = () => document.querySelector<HTMLButtonElement>('.desk-head > .back')
    expect(back()).toBeNull()
    nav.jump = { screen: 'chat', target: 'chat-2', from: 'wiki', seq: 7 }
    await openChat('chat-2')
    expect([...document.querySelector('.desk-head')!.children].map((child) => child.className.split(' ')[0])).toEqual(['icbtn', 'fade-text'])
    expect(back()?.getAttribute('aria-label')).toBe('返回')
    act(() => back()!.click())
    expect(nav.returnTo).toHaveBeenCalledWith('wiki')
    expect(back()).toBeNull()

    nav.jump = { screen: 'chat', target: 'chat-1', from: 'feed', seq: 8 }
    await openChat('chat-1')
    expect(back()).not.toBeNull()
    nav.entry = 1
    await openChat('chat-1')
    expect(back()).toBeNull()
  })

  it('从动态看冲突时新开一个叫结论冲突的对话，问这两条结论为什么冲突', async () => {
    api.create.mockResolvedValueOnce({ id: 'chat-9' } as ChatSession)
    nav.jump = { screen: 'chat', target: CONFLICT_THREAD, from: 'feed', seq: 1 }
    await act(async () => {
      root!.render(screen())
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.create).toHaveBeenCalledWith('结论冲突', true)
    expect(api.send).toHaveBeenCalledWith('chat-9', [{ kind: 'text', text: '为什么说这两条结论冲突？' }])
  })

  it('回车发送，Shift+回车换行，输入法组字时的回车不发送', async () => {
    type('为什么')
    press('Enter', { shiftKey: true })
    expect(typed()).toBe('为什么\n')
    expect(reaches('Enter', { isComposing: true })).toBe(true)
    expect(api.send).not.toHaveBeenCalled()

    type('为什么')
    expect(press('Enter').defaultPrevented).toBe(true)
    await act(async () => { await Promise.resolve() })
    expect(api.send).toHaveBeenCalledWith('chat-1', [{ kind: 'text', text: '为什么' }])
  })

  it('没配置模型时发送失败，输入框里显示「AI 未连接」的状态，点它打开设置的模型一栏；配好后再发一次成功，状态就消失', async () => {
    api.send.mockResolvedValueOnce({ id: 'chat-1', state: 'failed', reason: 'no-model' })
    const state = () => document.querySelector('.cbox .tag')?.textContent ?? null
    expect(state()).toBeNull()
    api.configured = false
    type('为什么')
    press('Enter')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(state()).toBe('AI 未连接')
    const tag = document.querySelector<HTMLElement>('.cbox .tag')!
    expect(tag.tagName).toBe('BUTTON')
    act(() => tag.click())
    expect(settings.openCategory).toHaveBeenCalledWith('model')
    api.configured = true
    type('再问一次')
    press('Enter')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(state()).toBeNull()
  })

  it('@ 候选开着时输入法组字的 Esc 不收起候选，组完字后的 Esc 才收起', () => {
    type('@')
    expect(document.querySelector('#cRes')).not.toBeNull()
    press('Escape', { isComposing: true })
    expect(document.querySelector('#cRes')).not.toBeNull()
    press('Escape')
    expect(document.querySelector('#cRes')).toBeNull()
  })

  it('有 @ 候选时上下键和回车归候选，回车填入候选而不发送；没有候选时上下键留给光标在行间移动', () => {
    type('@')
    expect(document.querySelector('#cRes')).not.toBeNull()
    expect(reaches('ArrowDown')).toBe(false)
    expect(press('Enter').defaultPrevented).toBe(true)
    expect([typed(), pills()]).toEqual(['@草稿树项目 ', ['@草稿树项目']])
    expect(api.send).not.toHaveBeenCalled()

    type('第一行\n第二行')
    expect(reaches('ArrowUp')).toBe(true)
    expect(reaches('ArrowDown')).toBe(true)
  })

  it('在句子中间输入 @ 也打开候选，回车把引用插在 @ 处，前面写的字留着', () => {
    type('先问问 @')
    expect(document.querySelector('#cRes')).not.toBeNull()
    expect(press('Enter').defaultPrevented).toBe(true)
    expect(api.send).not.toHaveBeenCalled()
    expect([typed(), pills()]).toEqual(['先问问 @草稿树项目 ', ['@草稿树项目']])
  })

  it('光标停在 @ 后面、后面还有字时也打开候选，选中后把引用插在光标处，后面的字原样留着', () => {
    type('@ 这条线还剩什么', 1)
    expect(document.querySelector('#cRes')).not.toBeNull()
    press('Enter')
    expect([typed(), pills()]).toEqual(['@草稿树项目 这条线还剩什么', ['@草稿树项目']])
  })

  it('引用是一个整体：在它后面退格一次就整个删掉，撤销把它原样带回来，再撤销回到选它之前，重做又是引用', () => {
    type('看看 @')
    press('Enter')
    act(() => editor().dispatch({ selection: { anchor: '看看 @草稿树项目'.length } }))
    press('Backspace')
    expect([typed(), pills()]).toEqual(['看看  ', []])
    act(() => { undo(editor()) })
    expect([typed(), pills()]).toEqual(['看看 @草稿树项目 ', ['@草稿树项目']])
    act(() => { undo(editor()) })
    expect([typed(), pills()]).toEqual(['看看 @', []])
    act(() => { redo(editor()) })
    expect([typed(), pills()]).toEqual(['看看 @草稿树项目 ', ['@草稿树项目']])
  })

  it('引用后面照常打字，发出去的整句里引用还是引用，带着它点名的项目', async () => {
    type('看看 @')
    press('Enter')
    typeOn('这条线还剩什么')
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(api.send).toHaveBeenCalledWith('chat-1', [
      { kind: 'text', text: '看看 ' }, { kind: 'mention', text: '@草稿树项目', target: { kind: 'project', id: 'draft' } },
      { kind: 'text', text: ' 这条线还剩什么' },
    ])
    expect([typed(), pills()]).toEqual(['', []])
  })

  it('快捷引用把引用插在光标处，草稿其余部分保留', () => {
    type('先看 再说', 3)
    act(() => document.querySelector<HTMLButtonElement>('#qmChips button')!.click())
    expect([typed(), pills()]).toEqual(['先看 @草稿树项目 再说', ['@草稿树项目']])
    expect(document.activeElement).toBe(field())
  })

  it('草稿属于它的对话：换到另一条对话后回车不把它发过去，输入框是空的，切回来草稿和其中的引用都还在', async () => {
    type('只问第一条 @')
    press('Enter')
    await openChat('chat-2')
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(api.send).not.toHaveBeenCalled()
    expect(typed()).toBe('')

    await openChat('chat-1')
    expect([typed(), pills()]).toEqual(['只问第一条 @草稿树项目 ', ['@草稿树项目']])
  })

  it('@ 候选里论文的灰字把稍后阅读的阅读状态写成待读', async () => {
    api.listPapers.mockResolvedValueOnce({
      rows: [{ id: 'p1', title: 'EAGLE', year: 2024, readState: '稍后阅读' } as PaperRow], total: 1,
    })
    session.revision += 1
    await openChat('chat-1')
    type('@EAGLE')
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
    type('@')
    expect(document.querySelector('#cRes')).not.toBeNull()
    await openChat('chat-2')
    expect(document.querySelector('#cRes')).toBeNull()
  })

  /** Lets every pending call to Core answer and the screen render what it answered. */
  const settle = () => act(async () => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
  })

  /** Sends `text` from the open chat and leaves its reply generating until the returned call. */
  const sendPending = async (text: string) => {
    let finish = () => {}
    api.send.mockImplementationOnce(() => {
      const id = session.id
      api.generating.add(id)
      return new Promise((resolve) => {
        finish = () => {
          api.generating.delete(id)
          resolve({ id, state: 'complete' })
        }
      })
    })
    type(text)
    press('Enter')
    await settle()
    return async () => { await act(async () => { finish(); await Promise.resolve() }) }
  }
  const control = () => document.querySelector<HTMLButtonElement>('#sendBtn')!

  /** A chat turn: a message of `role` saying `text`. */
  const turnOf = (id: string, role: ChatMessage['role'], text: string): ChatMessage => ({ id, role, runs: [{ kind: 'text', text }], actions: [] })
  const retry = () => document.querySelector<HTMLButtonElement>('.msgs .event .btn')

  it('一轮没得到回答时,对话以那条状态行结束,行尾有重试;点它对这条对话的最后一问再要一次回答', async () => {
    api.messages.mockResolvedValueOnce([turnOf('1', 'you', '问'), turnOf('2', 'status', '生成失败：AI 服务停了')])
    session.revision = 1
    await openChat('chat-1')
    expect(retry()?.textContent).toBe('重试')
    act(() => retry()!.click())
    await settle()
    expect(api.retry).toHaveBeenCalledExactlyOnceWith('chat-1')
    expect(api.send).not.toHaveBeenCalled()
  })

  it('状态行后面已经有回答,或者还在生成时,不给重试;对话是一段读屏会念出新消息的记录', async () => {
    api.messages.mockResolvedValueOnce([turnOf('1', 'you', '问'), turnOf('2', 'status', '生成失败：AI 服务停了'), turnOf('3', 'ai', '答')])
    session.revision = 1
    await openChat('chat-1')
    expect(retry()).toBeNull()
    expect(document.querySelector('.msgs')!.getAttribute('role')).toBe('log')

    api.messages.mockResolvedValueOnce([turnOf('1', 'you', '问'), turnOf('2', 'status', '生成失败：AI 服务停了')])
    session.revision = 2
    await openChat('chat-1')
    const finish = await sendPending('再问')
    expect(retry()).toBeNull()
    await finish()
  })

  it('一发出问题，回答那一行就带着模型标签、运行圈和「思考中…」出现，写出字后是那些字；存下的回答读到后，只剩存下的那一条', async () => {
    const answers = () => [...document.querySelectorAll('.msgs .msg.ai .answer')].map((node) => node.textContent)
    const tags = () => [...document.querySelectorAll('.msgs .msg.ai .msg-who')].map((node) => node.textContent)
    const model = { route: 'subscription', cli: 'claude', id: 'claude-opus-5-5[1m]' } as const
    const since = new Date().toISOString()
    api.writing.mockResolvedValue({ text: '', model, since })
    api.messages.mockResolvedValueOnce([turnOf('1', 'you', 'EAGLE 快多少')])
    session.revision = 1
    await openChat('chat-1')
    const finish = await sendPending('EAGLE 快多少')
    await settle()
    expect(api.writing).toHaveBeenCalledWith('chat-1')
    expect(tags()).toEqual(['Claude Opus 5.5 · 订阅'])
    expect(answers()).toEqual([expect.stringMatching(/^思考中… \ds$/)])

    api.writing.mockResolvedValue({ text: 'EAGLE 快 3.76 倍', model, since })
    await act(async () => { await new Promise((wait) => setTimeout(wait, 200)) })
    expect(answers()).toEqual(['EAGLE 快 3.76 倍'])

    await finish()
    await settle()
    expect(answers()).toEqual(['EAGLE 快 3.76 倍'])
    api.messages.mockResolvedValueOnce([turnOf('1', 'you', 'EAGLE 快多少'), { ...turnOf('2', 'ai', 'EAGLE 快 3.76 倍 [p. 6]'), model }])
    session.revision = 2
    await openChat('chat-1')
    await settle()
    expect(answers()).toEqual(['EAGLE 快 3.76 倍 [p. 6]'])
    expect(tags()).toEqual(['Claude Opus 5.5 · 订阅'])
  })

  it('生成中在输入框里按 Escape 停下这条对话的回答；没在生成时 Escape 什么也不停', async () => {
    press('Escape')
    await settle()
    expect(api.cancel).not.toHaveBeenCalled()

    const finish = await sendPending('为什么')
    expect(control().getAttribute('aria-label')).toBe('停止生成')
    press('Escape')
    await settle()
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith('chat-1')
    expect(control().getAttribute('aria-label')).toBe('发送')
    await finish()
  })

  it('停下后，写到一半的字带着模型标签留作回答；还没写出字就停下，「思考中…」那一行就不在了', async () => {
    const answers = () => [...document.querySelectorAll('.msgs .msg.ai .answer')].map((node) => node.textContent)
    const tags = () => [...document.querySelectorAll('.msgs .msg.ai .msg-who')].map((node) => node.textContent)
    const model = { route: 'subscription', cli: 'codex', id: 'gpt-6.1' } as const
    const asked = turnOf('1', 'you', 'EAGLE 快多少')
    const kept = { ...turnOf('2', 'ai', 'EAGLE 快 3.7'), model }
    const since = new Date().toISOString()
    api.writing.mockResolvedValue({ text: 'EAGLE 快 3.7', model, since })
    api.messages.mockResolvedValueOnce([asked])
    session.revision = 1
    await openChat('chat-1')
    const finish = await sendPending('EAGLE 快多少')
    await act(async () => { await new Promise((wait) => setTimeout(wait, 200)) })
    expect(answers()).toEqual(['EAGLE 快 3.7'])
    act(() => control().click())
    await settle()
    await finish()
    api.messages.mockResolvedValueOnce([asked, kept])
    session.revision = 2
    await openChat('chat-1')
    await settle()
    expect([answers(), tags()]).toEqual([['EAGLE 快 3.7'], ['GPT-6.1 · 订阅']])

    const askedAgain = turnOf('3', 'you', '再问一句')
    api.writing.mockResolvedValue({ text: '', model, since })
    const again = await sendPending('再问一句')
    api.messages.mockResolvedValueOnce([asked, kept, askedAgain])
    session.revision = 3
    await openChat('chat-1')
    await settle()
    expect(answers()).toEqual(['EAGLE 快 3.7', expect.stringMatching(/^思考中… \ds$/)])
    act(() => control().click())
    await settle()
    await again()
    api.messages.mockResolvedValueOnce([asked, kept, askedAgain])
    session.revision = 4
    await openChat('chat-1')
    await settle()
    expect(answers()).toEqual(['EAGLE 快 3.7'])
    expect(api.cancel).toHaveBeenCalledTimes(2)
  })

  it('换到另一条对话后，前一条晚到的消息不会顶替这一条的', async () => {
    const said = (text: string): ChatMessage[] => [{ id: text, role: 'you', runs: [{ kind: 'text', text }], actions: [] }]
    let answerFirst: (messages: ChatMessage[]) => void = () => {}
    api.messages
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve }))
      .mockResolvedValueOnce(said('第二条的消息'))
    session.revision = 1
    await openChat('chat-1')
    await openChat('chat-2')
    expect(document.querySelector('.msgs')!.textContent).toBe('第二条的消息')

    await act(async () => { answerFirst(said('第一条的消息')) })
    expect(document.querySelector('.msgs')!.textContent).toBe('第二条的消息')
  })

  it('一条对话还在生成时，换到另一条对话照常可以输入和发送', async () => {
    const finish = await sendPending('第一条的问题')
    expect(control().getAttribute('aria-label')).toBe('停止生成')

    await openChat('chat-2')
    expect(locked()).toBe(false)
    expect(control().getAttribute('aria-label')).toBe('发送')
    type('第二条的问题')
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(api.send).toHaveBeenLastCalledWith('chat-2', [{ kind: 'text', text: '第二条的问题' }])
    await finish()
  })

  it('停止停的是正在生成的那条对话，别的对话不显示停止', async () => {
    const finish = await sendPending('第一条的问题')
    await openChat('chat-2')
    expect(control().getAttribute('aria-label')).toBe('发送')

    await openChat('chat-1')
    expect(control().getAttribute('aria-label')).toBe('停止生成')
    act(() => control().click())
    await settle()
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith('chat-1')
    expect(control().getAttribute('aria-label')).toBe('发送')
    await finish()
  })

  it('草稿去掉空白后为空时发送钮不可点，生成中的停止仍可点', async () => {
    expect(control().disabled).toBe(true)
    type(' \n ')
    expect(control().disabled).toBe(true)
    type('为什么')
    expect(control().disabled).toBe(false)

    const finish = await sendPending('为什么')
    expect(control().getAttribute('aria-label')).toBe('停止生成')
    expect(control().disabled).toBe(false)
    await finish()
  })

  it('快捷引用是一行的幽灵 chip，保存为想法是排在工具栏末尾的幽灵按钮，还没讨论时只是按不了，旁边不写字', () => {
    const chips = [...document.querySelectorAll<HTMLButtonElement>('#qmChips button')]
    expect(chips.map((chip) => [chip.className, chip.querySelector('.fade-text')?.textContent]))
      .toEqual([['btn ghost sm qm', '@草稿树项目']])
    const save = document.querySelector<HTMLButtonElement>('#qaIdea')!
    expect(save.className).toBe('btn ghost sm save-idea')
    expect(save.parentElement!.lastElementChild).toBe(save)
    expect([save.disabled, save.previousElementSibling?.id]).toEqual([true, 'qmChips'])
    expect(document.querySelector('.qsep')).toBeNull()
  })

  /** Shows the chat `id` holding one message of yours, as the shell does when that chat is picked. */
  const showChat = async (id: string) => {
    session.id = id
    session.revision += 1
    api.messages.mockResolvedValueOnce([{ id: 'm1', role: 'you', runs: [{ kind: 'text', text: '先讨论机制' }], actions: [] }])
    await act(async () => {
      root!.render(screen())
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
        root!.render(screen())
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

    type('为什么')
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(body.scrollTop).toBe(700)
  })
})
