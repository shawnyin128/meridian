// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ChatSendResult, ChatWriting, JobsStatus, PaperRow } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { TOOLTIP_DELAY } from '../components/Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const withMessages = (node: ReactNode) => <MessagesProvider><Shell>{node}</Shell></MessagesProvider>

const api = vi.hoisted(() => ({
  /** The chats Core is generating a reply in. */
  generating: new Set<string>(),
  send: vi.fn((): Promise<ChatSendResult> => Promise.resolve({ id: 'chat-paper-1', state: 'complete' })),
  cancel: vi.fn((id: string) => Promise.resolve({ id, cancelled: api.generating.delete(id) })),
  forPaper: vi.fn((paperId: string) => Promise.resolve({
    id: `chat-${paperId}`, title: 'Paper One', archived: false, messageCount: 0, paperId,
  })),
  messages: vi.fn<() => Promise<ChatMessage[]>>(() => Promise.resolve([])),
  writing: vi.fn<(id: string) => Promise<ChatWriting | null>>(() => Promise.resolve(null)),
  createIdea: vi.fn(() => Promise.resolve({ id: 'idea-1' })),
  recordAction: vi.fn(() => Promise.reject(new Error('未在本测试调用'))),
  listProjects: vi.fn(() => Promise.resolve([{
    id: 'draft', name: '草稿树项目', status: '进行中', priority: 'p1', topic: '推理', focus: '验证',
    conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
    milestones: [], recentEvents: [],
  }])),
  createConclusion: vi.fn(() => Promise.resolve({})),
  feedAppend: vi.fn(() => Promise.resolve()),
  bump: vi.fn(),
  open: vi.fn(),
  writes: [] as { result: unknown; opts: { note?: unknown; action?: (result: never) => { label: string; onAction: () => void } } }[],
  notice: { success: vi.fn(), refusal: vi.fn() },
  grip: {
    id: 'rrgrip', label: '论文对话宽度', value: 300, min: 240, max: 480,
    onResize: vi.fn(), onReset: vi.fn(),
  },
  collapsed: false,
  revision: 0,
  openCategory: vi.fn(),
  /** Whether the model settings set up a model. */
  configured: true,
}))

vi.mock('../ipc.js', () => ({
  appMenu: { platform: () => 'darwin' },
  chat: {
    send: api.send, cancel: api.cancel, forPaper: api.forPaper, messages: api.messages,
    recordAction: api.recordAction, writing: api.writing,
    model: () => Promise.resolve({ source: 'model-1' }), setModel: () => Promise.resolve({ source: 'model-1' }),
  },
  harness: {
    sourceModels: () => Promise.resolve({ source: 'model-1', models: [{ id: 'gpt-5.5', efforts: { levels: [] } }] }),
    modelSettings: () => Promise.resolve({
      configured: api.configured, subscription: { active: null, models: { claude: '', codex: '' } },
      models: [{ id: 'model-1', source: { kind: 'api', profile: 'openai' }, model: 'gpt-5.5', configured: api.configured }], defaultModel: 'model-1', sources: [{ source: { kind: 'api', profile: 'openai' }, provider: 'openai', entries: ['model-1'], defaultEntry: 'model-1' }],
    }),
    subscriptionStatus: () => Promise.resolve({ state: 'missing' }),
  },
  idea: { create: api.createIdea },
  feed: { append: api.feedAppend },
  jobs: {
    status: (): Promise<JobsStatus> => Promise.resolve({
      writes: 0, uploads: [], downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null },
      generating: [...api.generating], generatingWiki: [], wikiFailures: {},
    }),
  },
  project: { list: api.listProjects, createConclusion: api.createConclusion },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => api.notice,
  useJump: () => ({ jump: null, open: api.open, returnTo: vi.fn() }),
  useVaultRevision: () => ({ revision: api.revision, bump: api.bump }),
  usePaperChatGrip: () => api.grip,
  usePaperChatCollapsed: () => api.collapsed,
  useSettingsOpen: () => ({ open: false, openCategory: api.openCategory }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (op: Promise<unknown>, opts = {}) => {
    api.writes.push({ result: await op, opts })
    api.bump()
    return true
  },
}))

const { PaperChat } = await import('../components/chat/PaperChat.js')
const { GenerationsContext, useCoreGenerations } = await import('../hooks/useGenerations.js')
const { ModelStatusContext, useCoreModelStatus } = await import('../hooks/useModelStatus.js')
const { useJobsPoll } = await import('../shell/useJobs.js')

const noBump = () => {}
/** The shell around the paper chat: the jobs poll and the generations it reports, and the model status. */
function Shell({ children }: { children: ReactNode }) {
  const { status, refresh } = useJobsPoll(noBump)
  return (
    <GenerationsContext.Provider value={useCoreGenerations(status, refresh)}>
      <ModelStatusContext.Provider value={useCoreModelStatus(false)}>{children}</ModelStatusContext.Provider>
    </GenerationsContext.Provider>
  )
}

/** Lets every pending call to Core answer and the chat render what it answered. */
const settle = () => act(async () => {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
})

/** Makes the next send leave its reply generating until the returned call. */
function pendingReply(): () => Promise<void> {
  let finish = () => {}
  api.send.mockImplementationOnce(() => {
    api.generating.add('chat-paper-1')
    return new Promise((resolve) => {
      finish = () => {
        api.generating.delete('chat-paper-1')
        resolve({ id: 'chat-paper-1', state: 'complete' })
      }
    })
  })
  return async () => { await act(async () => { finish(); await Promise.resolve() }) }
}

const PAPER: PaperRow = {
  id: 'paper-1', title: 'Paper One', venue: '', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '未读', projects: [],
  pageCount: 8, noteCount: 0, conclusionCount: 0,
  updated: '2026-09-14', custom: {},
}
const PAPER_TWO: PaperRow = { ...PAPER, id: 'paper-2', title: 'Paper Two' }

/** The paper chat's editable text; showing another paper mounts a new one. */
const field = () => document.querySelector<HTMLElement>('[aria-label="向当前论文提问"]')!
const editor = () => EditorView.findFromDOM(field().closest<HTMLElement>('.cm-editor')!)!
/** Replaces the question with `text` as typing it would, leaving the caret at its end. */
const type = (text: string) => act(() => {
  const view = editor()
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length }, userEvent: 'input.type' })
})
/** The question as the composer shows it. */
const typed = () => editor().state.doc.toString()

describe('PaperChat', () => {
  /** The paper chat's capsule that organizes it into an idea. */
  const organizeIdea = () => [...document.querySelectorAll<HTMLButtonElement>('.paper-chat .choice-capsule')].find((held) => held.textContent === '整理想法')!
  let root: Root | null = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The head's title measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    api.generating.clear()
    api.writing.mockResolvedValue(null)
    api.configured = true
    api.writes.length = 0
    api.collapsed = false
    api.revision = 0
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })

  it('记入科研记录后，动态里那一条和提示说的是同一句，项目名带着项目的 id', async () => {
    api.messages.mockResolvedValueOnce([{
      id: 'm1', role: 'ai', runs: [{ kind: 'text', text: '结论' }],
      actions: [{ kind: 'writeBack', label: '记入科研记录', project: 'draft', text: '结论' }],
    }])
    api.recordAction.mockResolvedValueOnce({ id: 'draft', name: '草稿树项目' } as never)
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => { host.querySelector<HTMLButtonElement>('.macts .btn')!.click() })
    expect(api.feedAppend).toHaveBeenCalledWith({
      source: 'me', body: { kind: 'runs', runs: [
        { kind: 'text', text: '已记入《' }, { kind: 'text', text: '草稿树项目', target: { kind: 'project', id: 'draft' } },
        { kind: 'text', text: '》的科研记录' },
      ] },
    })
  })

  it('按论文取得持久会话并把输入追加到同一条会话', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.forPaper).toHaveBeenCalledWith('paper-1')
    expect(api.messages).toHaveBeenCalledWith('chat-paper-1')
    expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe('当前论文对话')

    type('  关键假设是什么？  ')
    await act(async () => { host.querySelector<HTMLButtonElement>('.paper-chat .send')!.click() })

    // Core trims the turn at its ends.
    expect(api.send).toHaveBeenCalledWith('chat-paper-1', [{ kind: 'text', text: '  关键假设是什么？  ' }], null)
    expect(typed()).toBe('')
  })

  it('没配置模型时发送失败，输入框里的「AI 未连接」是一个按钮，打开设置的模型一栏', async () => {
    api.send.mockResolvedValueOnce({ id: 'chat-paper-1', state: 'failed', reason: 'no-model' } as never)
    api.configured = false
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })
    type('关键假设是什么？')
    await act(async () => { host.querySelector<HTMLButtonElement>('.paper-chat .send')!.click() })
    await act(async () => { await Promise.resolve() })
    const tag = host.querySelector<HTMLElement>('.paper-chat .cbox .tag')!
    expect([tag.tagName, tag.textContent]).toEqual(['BUTTON', 'AI 未连接'])
    act(() => tag.click())
    expect(api.openCategory).toHaveBeenCalledWith('model')
  })

  it('对话栏的拖动条在共享 tooltip 里写它的操作「收起论文对话」和 ⌘B，不写拖动提示', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => { root!.render(withMessages(<PaperChat paper={PAPER} />)) })
    vi.useFakeTimers()
    act(() => {
      host.querySelector('#rrgrip')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))
    })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    vi.useRealTimers()
    const tip = document.querySelector('[role="tooltip"]')!
    expect([tip.firstChild?.textContent, tip.querySelector('.tooltip-key')?.textContent, tip.querySelector('.tooltip-note')])
      .toEqual(['收起论文对话', '⌘B', null])
  })

  it('对话栏头部写出整篇论文的标题，放不下时淡出，和面包屑同一个规则', async () => {
    const title = 'EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty'
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => { root!.render(withMessages(<PaperChat paper={{ ...PAPER, title }} />)) })
    expect(host.querySelector('.paper-chat .desk-head .t')?.textContent).toBe(title)
  })

  it('论文还没读到时对话栏头部不写正在载入，对话区是载入占位', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => { root!.render(withMessages(<PaperChat paper={null} />)) })
    const head = host.querySelector('.paper-chat .desk-head')!
    expect([head.textContent, host.querySelector('.paper-chat .msgs .loading-placeholder') !== null]).toEqual(['', true])
  })

  it('提交未完成时发送箭头变为可停止的旋转控件', async () => {
    const finish = pendingReply()
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })

    type('What is the mechanism?')
    act(() => host.querySelector<HTMLButtonElement>('.paper-chat .send')!.click())
    await settle()
    const control = host.querySelector<HTMLButtonElement>('.paper-chat .send')!
    expect(control.getAttribute('aria-label')).toBe('停止生成')
    expect(control.querySelector('.ring.spin')).not.toBeNull()
    expect(control.querySelector('.generation-stop')).not.toBeNull()

    act(() => control.click())
    await settle()
    expect(control.getAttribute('aria-label')).toBe('发送')
    expect(api.cancel).toHaveBeenCalledWith('chat-paper-1')
    await finish()
  })

  it('一发出问题，论文对话里回答那一行就带着模型标签出现，写出字前是运行圈和「思考中…」', async () => {
    api.writing.mockResolvedValue({ text: '', model: { route: 'api', id: 'gpt-5.5' }, since: new Date().toISOString() })
    const finish = pendingReply()
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })

    type('What is the mechanism?')
    act(() => host.querySelector<HTMLButtonElement>('.paper-chat .send')!.click())
    await settle()
    expect([...host.querySelectorAll('.msg.ai')].map((answer) => [
      answer.querySelector('.msg-who')?.textContent,
      answer.querySelector('.answer [aria-busy="true"]')?.textContent,
      answer.querySelector('.answer .ring.spin') === null,
    ])).toEqual([['GPT-5.5 · API', expect.stringMatching(/^思考中… \ds$/), false]])
    await finish()
  })

  /** Renders the paper chat for PAPER and waits for its session and messages to load. */
  async function mountChat(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })
    return host
  }

  /** Shows `paper` in the mounted chat, as the reader does when it opens another paper. */
  async function showPaper(paper: PaperRow | null): Promise<void> {
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={paper} />))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('问题草稿留在它的论文上：换一篇时输入框是空的，回到原篇问题还在', async () => {
    await mountChat()
    type('这篇的关键假设是什么？')
    // While the next paper loads, the reader passes no paper.
    await showPaper(null)
    await showPaper(PAPER_TWO)
    expect(typed()).toBe('')

    await showPaper(null)
    await showPaper(PAPER)
    expect(typed()).toBe('这篇的关键假设是什么？')
  })

  it('上一篇还在生成时换一篇论文，这一篇照常可以提问，停止只停正在生成的那篇', async () => {
    const finish = pendingReply()
    const host = await mountChat()
    const control = () => host.querySelector<HTMLButtonElement>('.paper-chat .send')!
    type('这篇的关键假设是什么？')
    act(() => control().click())
    await settle()
    expect(control().getAttribute('aria-label')).toBe('停止生成')

    await showPaper(null)
    await showPaper(PAPER_TWO)
    expect(field().getAttribute('contenteditable')).toBe('true')
    expect(control().getAttribute('aria-label')).toBe('发送')

    await showPaper(null)
    await showPaper(PAPER)
    expect(control().getAttribute('aria-label')).toBe('停止生成')
    act(() => control().click())
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith('chat-paper-1')
    await finish()
  })

  it('这篇论文的对话在别处删掉后，对话栏换成论文新开的空对话，不报会话不存在；从垃圾桶恢复后又是原来那段', async () => {
    const asked: ChatMessage[] = [{ id: 'm1', role: 'you', runs: [{ kind: 'text', text: '删之前问的' }], actions: [] }]
    // The chats Core holds by id; the paper's chat is whichever of them is listed first.
    let held: Record<string, ChatMessage[]> = { 'chat-paper-1': asked }
    const forPaper = api.forPaper.getMockImplementation()!
    const messages = api.messages.getMockImplementation()!
    api.forPaper.mockImplementation(async (paperId: string) => ({
      id: Object.keys(held)[0]!, title: 'Paper One', archived: false, messageCount: 0, paperId,
    }))
    api.messages.mockImplementation((async (id: string) => {
      if (held[id] === undefined) throw new CallError('chat.messages', 'not-found')
      return held[id]
    }) as () => Promise<ChatMessage[]>)
    const shown = (host: HTMLElement) => [host.querySelector('.paper-chat .page-error'), host.querySelector('.paper-chat .msgs')!.textContent]
    try {
      const host = await mountChat()
      expect(shown(host)).toEqual([null, '删之前问的'])

      held = { 'chat-paper-2': [] }
      api.revision = 1
      await showPaper(PAPER)
      expect([shown(host), host.querySelector('.paper-chat .msgs .empty-state--page svg') !== null]).toEqual([[null, ''], true])

      held = { 'chat-paper-1': asked }
      api.revision = 2
      await showPaper(PAPER)
      expect(shown(host)).toEqual([null, '删之前问的'])
    } finally {
      api.forPaper.mockImplementation(forPaper)
      api.messages.mockImplementation(messages)
    }
  })

  it('问题去掉空白后为空时发送钮不可点；整理想法是输入框下面一行的模式胶囊，开着时这一问按整理想法轮次发出，上面不再有一行', async () => {
    const host = await mountChat()
    const send = host.querySelector<HTMLButtonElement>('.paper-chat .send')!
    expect(send.disabled).toBe(true)
    type('   ')
    expect(send.disabled).toBe(true)
    type('关键假设是什么？')
    expect(send.disabled).toBe(false)

    const organize = organizeIdea()
    expect([organize.className, organize.getAttribute('aria-pressed'), organize.closest('.cbox-foot') !== null])
      .toEqual(['choice-capsule', 'false', true])
    expect(host.querySelector('.paper-chat .qacts')).toBeNull()
    act(() => organize.click())
    act(() => { field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    await act(async () => { await Promise.resolve() })
    expect(api.send).toHaveBeenLastCalledWith('chat-paper-1', [{ kind: 'text', text: '关键假设是什么？' }], 'idea')
    expect(host.querySelector('.idea-draft')).toBeNull()
  })

  it('空对话的空态只有对话的图标，和输入框一样留在对话栏的左右边距里', async () => {
    const host = await mountChat()
    const hint = host.querySelector('.msgs .empty-state')!
    expect([hint.textContent, hint.querySelector('svg') !== null]).toEqual(['', true])
    expect(hint.parentElement!.className).toBe(host.querySelector('.composer > div')!.className)
  })

  it('输入框是多行文本框：回车发送，Shift+回车换行，输入法组字时的回车不发送', async () => {
    const host = await mountChat()
    expect(host.contains(field())).toBe(true)
    expect(field().getAttribute('aria-multiline')).toBe('true')
    type('第一行')
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init })
      act(() => { field().dispatchEvent(event) })
      return event
    }

    press({ shiftKey: true })
    expect(typed()).toBe('第一行\n')
    // The composer leaves an Enter that confirms a composition untouched.
    let free: boolean | null = null
    const see = (event: Event) => { free = !event.defaultPrevented }
    field().addEventListener('keydown', see, { capture: true })
    press({ isComposing: true })
    field().removeEventListener('keydown', see, { capture: true })
    expect(free).toBe(true)
    expect(api.send).not.toHaveBeenCalled()

    type('第一行')

    // The Enter that sends inserts no line break of its own.
    expect(press({}).defaultPrevented).toBe(true)
    expect(api.send).toHaveBeenCalledWith('chat-paper-1', [{ kind: 'text', text: '第一行' }], null)
    await act(async () => { await Promise.resolve() })
  })

  it('收起的对话栏整个不可聚焦，展开后恢复', async () => {
    api.collapsed = true
    const host = await mountChat()
    expect(host.querySelector('.paper-chat')!.hasAttribute('inert')).toBe(true)
    api.collapsed = false
    await act(async () => { root!.render(withMessages(<PaperChat paper={PAPER} />)) })
    expect(host.querySelector('.paper-chat')!.hasAttribute('inert')).toBe(false)
  })

  it('对话栏右缘有调宽把手，拖动时把新宽度交给外壳', async () => {
    const host = await mountChat()
    host.querySelector<HTMLElement>('.paper-chat')!.getBoundingClientRect = () => ({ width: 300 }) as DOMRect
    const grip = host.querySelector<HTMLElement>('.paper-chat > .grip')!
    expect(grip.getAttribute('role')).toBe('separator')
    act(() => { grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 })) })
    act(() => { document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140 })) })
    act(() => { document.dispatchEvent(new MouseEvent('mouseup')) })
    expect(api.grip.onResize).toHaveBeenLastCalledWith(340)
  })

  it('消息列表停在末尾时新消息滚进视野,往上翻着读时不抢,自己发出的消息总会滚进视野', async () => {
    // The browser reports the stream's content growing through the ResizeObserver its scroll area watches it with.
    const observers: (() => void)[] = []
    vi.stubGlobal('ResizeObserver', class { constructor(changed: () => void) { observers.push(changed) } observe() {} disconnect() {} })
    const host = await mountChat()
    const stream = host.querySelector<HTMLElement>('.paper-chat > .scroll-area')!
    let top = 0
    let length = 600
    Object.defineProperty(stream, 'clientHeight', { configurable: true, get: () => 300 })
    Object.defineProperty(stream, 'scrollHeight', { configurable: true, get: () => length })
    Object.defineProperty(stream, 'scrollTop', {
      configurable: true, get: () => top, set: (value: number) => { top = Math.min(value, Math.max(length - 300, 0)) },
    })
    const said: ChatMessage[] = []
    /** An answer lands in the vault: the chat reloads and its list grows by one 200px message. */
    const arrive = async () => {
      said.push({ id: `m${said.length}`, role: 'ai', runs: [{ kind: 'text', text: '回答' }], actions: [] })
      api.messages.mockResolvedValueOnce([...said])
      api.revision += 1
      length += 200
      await showPaper(PAPER)
      act(() => { for (const changed of observers) changed() })
    }

    await arrive()
    expect(stream.scrollTop).toBe(500)
    act(() => {
      stream.scrollTop = 100
      stream.dispatchEvent(new Event('scroll'))
    })
    await arrive()
    expect(stream.scrollTop).toBe(100)

    type('为什么')
    act(() => { field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    await act(async () => { await Promise.resolve() })
    expect(stream.scrollTop).toBe(700)
  })
})
