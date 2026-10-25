// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectConclusion, ProposalOp } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  cards: vi.fn(() => Promise.resolve([{ id: 'topics/sd', title: 'Speculative decoding' }])),
  aggregation: vi.fn(() => Promise.resolve({ claims: [{ id: 'wide-b8' }] })),
}))

vi.mock('../../ipc.js', () => ({
  wiki: { cards: api.cards, aggregation: api.aggregation },
  library: { location: async () => ({ root: '/vaults/conclusions' }) },
}))

const { ProjectConclusionPanel, ProjectConclusionRow } = await import('./ProjectConclusions.js')
const { DraftsProvider, keptDraftsKey } = await import('../../hooks/useDrafts.js')

const PENDING: ProjectConclusion = {
  id: 't.wide', node: 't.wide', text: 'Wide trees win at B8', date: '2026-09-20', state: 'pending', fingerprint: '0123456789abcdef',
  tasks: [{ id: 'task-1', title: '跑宽度扫描' }], experiments: [{ id: 'exp-1', title: '宽度扫描' }], wiki: [],
}
const NODE = { label: '宽树', mode: 'supported' as const }

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
}

describe('project conclusions', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  const handlers = {
    onClose: vi.fn(), onVerify: vi.fn(), onUnverify: vi.fn(), onOpenNode: vi.fn(), onOpenTask: vi.fn(), onOpenPage: vi.fn(),
    onWrite: vi.fn<(page: string, title: string, ops: ProposalOp[]) => Promise<boolean>>(() => Promise.resolve(true)),
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    document.body.innerHTML = ''
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })

  const panel = async (conclusion: ProjectConclusion) => {
    await act(async () => {
      root!.render(
        <MessagesProvider>
          <ProjectConclusionPanel projectId="draft" projectName="draft 效率" conclusion={conclusion} node={NODE} {...handlers} />
        </MessagesProvider>,
      )
    })
  }
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!
  const draft = () => host.querySelector<HTMLElement>('.draft-form')
  const press = (target: Element, key: string) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
  const VERIFIED = { ...PENDING, state: 'verified' as const, verifiedOn: '2026-09-21' }

  it('一行与科研记录同一套列:状态、日期、结论连同 Wiki 状态、节点、末尾是 agent 标签;点一下打开', () => {
    const onOpen = vi.fn()
    const written = { ...PENDING, state: 'verified' as const, verifiedOn: '2026-09-21', wiki: [{ page: 'topics/sd', title: 'Speculative decoding', claim: 'wide-b8', version: 2 }] }
    act(() => root!.render(
      <MessagesProvider>
        <ProjectConclusionRow conclusion={PENDING} node={NODE} selected={false} onOpen={onOpen} />
        <ProjectConclusionRow conclusion={written} node={NODE} selected onOpen={vi.fn()} />
      </MessagesProvider>,
    ))
    const [pending, verified] = [...host.querySelectorAll<HTMLElement>('.record-row')]
    expect(pending!.className).toContain('attnrow record-row conclusion-row')
    expect([...pending!.children].map((cell) => cell.className)).toEqual([
      'project-signal-kind', 'project-signal-date', 'attn-text record-text', 'record-node', 'record-who',
    ])
    expect(pending!.querySelector('.tag--warning')!.textContent).toBe('待验证')
    expect(pending!.querySelector('.entity-link--node')!.textContent).toBe('宽树')
    expect(pending!.querySelector('.record-line')!.textContent).toBe('Wide trees win at B8 · 未写入 Wiki')
    expect(pending!.querySelector('.record-who .source-label')!.textContent).toBe('agent')
    expect(verified!.querySelector('.tag--done')!.textContent).toBe('已验证')
    expect(verified!.querySelector('.record-line')!.textContent).toBe('Wide trees win at B8 · Speculative decoding v2')
    expect(verified!.classList.contains('item--selected')).toBe(true)
    expect(pending!.classList.contains('item--selected')).toBe(false)
    act(() => pending!.click())
    expect(onOpen).toHaveBeenCalled()
  })

  it('待验证:能验证、不能写入 Wiki;证据链依次是任务、节点、实验记录,点任务和节点各自跳过去', async () => {
    await panel(PENDING)
    expect(host.querySelector('.conclusion-detail-meta .project-signal-kind')!.textContent).toBe('待验证')
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === '取消验证')).toBe(false)
    act(() => button('验证').click())
    expect(handlers.onVerify).toHaveBeenCalledWith('t.wide', '0123456789abcdef')
    expect(button('写入 Wiki').disabled).toBe(true)
    const chain = [...host.querySelectorAll('.conclusion-chain-row, .conclusion-detail-node .entity-link--node')].map((el) => el.textContent)
    expect(chain).toEqual(['跑宽度扫描', '宽树', '宽度扫描exp-1'])
    act(() => host.querySelector<HTMLButtonElement>('.conclusion-chain-row')!.click())
    expect(handlers.onOpenTask).toHaveBeenCalledWith('task-1')
    act(() => host.querySelector<HTMLButtonElement>('.conclusion-detail-node .entity-link--node')!.click())
    expect(handlers.onOpenNode).toHaveBeenCalledWith('t.wide')
  })

  it('验证和写入 Wiki 是面板的操作,和关闭按钮一起放在面板头部;写不了时按钮旁写着未验证', async () => {
    await panel(PENDING)
    const head = () => host.querySelector('.panel-head > .panel-head-actions')!
    expect([...head().children].map((child) => child.textContent || child.getAttribute('aria-label')))
      .toEqual(['验证', '未验证', '写入 Wiki', '收起详情'])
    expect(head().querySelector('.tag')!.nextElementSibling!.textContent).toBe('写入 Wiki')
    await panel({ ...PENDING, state: 'verified', verifiedOn: '2026-09-21' })
    expect(head().querySelector('.tag')).toBeNull()
  })

  it('面板头部的验证、取消验证和写入 Wiki 与其他面板头部一样是小号的普通按钮', async () => {
    const looks = () => [...host.querySelectorAll<HTMLButtonElement>('.panel-head > .panel-head-actions > .btn')]
      .map((button) => `${button.textContent} ${button.className}`)
    await panel(PENDING)
    expect(looks()).toEqual(['验证 btn sm', '写入 Wiki btn sm'])
    await panel({ ...PENDING, state: 'verified', verifiedOn: '2026-09-21' })
    expect(looks()).toEqual(['取消验证 btn sm', '写入 Wiki btn sm'])
  })

  it('已验证:能取消验证;写入 Wiki 在结论正下方就地打开草稿,不弹对话框,标明落到哪一页的结论区,摆出要写的结论和它的实验证据', async () => {
    await panel(VERIFIED)
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === '验证')).toBe(false)
    act(() => button('取消验证').click())
    expect(handlers.onUnverify).toHaveBeenCalledWith('t.wide')
    await act(async () => { button('写入 Wiki').click(); await flush() })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(host.querySelector('.conclusion-detail-meta')!.nextElementSibling!.contains(draft())).toBe(true)
    expect(draft()!.querySelector('.draft-form-destination')!.textContent).toBe('→聚合页· 结论')
    expect(document.activeElement).toBe(draft()!.querySelector('.choice-picker'))
    expect(draft()!.querySelector('input')!.value).toBe('Wide trees win at B8')
    expect(draft()!.querySelector('.conclusion-draft-evidence')!.textContent).toBe('实验draft 效率宽树')
  })

  it('已验证:选一页后在结论上回车,经 onWrite 写入一条以这个节点为证据的结论;没选页时回车不写,页标成无效;Esc 收起', async () => {
    await panel(VERIFIED)
    await act(async () => { button('写入 Wiki').click(); await flush() })
    const text = draft()!.querySelector('input')!
    await act(async () => { press(text, 'Enter'); await flush() })
    expect(handlers.onWrite).not.toHaveBeenCalled()
    expect(draft()!.querySelector('.choice-picker')!.getAttribute('aria-invalid')).toBe('true')
    await act(async () => {
      draft()!.querySelector('.choice-picker')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      await flush()
    })
    const page = [...document.querySelectorAll<HTMLElement>('.choice-picker-menu [role="menuitemradio"]')]
      .find((item) => item.textContent === 'Speculative decoding')!
    await act(async () => {
      page.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      page.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })
    expect(draft()!.querySelector('.draft-form-destination')!.textContent).toBe('→Speculative decoding· 结论')
    await act(async () => { press(text, 'Enter'); await flush() })
    expect(handlers.onWrite).toHaveBeenCalledWith('topics/sd', '实验结论写成「Speculative decoding」的结论', [{
      op: 'addClaim', page: 'topics/sd', claim: {
        id: 'wide-trees-win-at-b8', text: 'Wide trees win at B8',
        evidence: [{ kind: 'experiment', project: 'draft', node: 't.wide' }],
      },
    }])
    expect(draft()).toBeNull()

    await act(async () => { button('写入 Wiki').click(); await flush() })
    press(draft()!.querySelector('input')!, 'Escape')
    expect(draft()).toBeNull()
    expect(handlers.onWrite).toHaveBeenCalledOnce()
  })

  it('退出前打到一半、选好了页的结论草稿,重开后原样回来:页选框显示那一页,回车写到那一页', async () => {
    window.localStorage.setItem(keptDraftsKey('/vaults/conclusions'), JSON.stringify({
      format: 1, drafts: [[['project', 'draft', 'conclusion', 't.wide'], 'claim', { page: 'topics/sd', text: 'Wide trees win at B8' }]],
    }))
    try {
      await act(async () => {
        root!.render(
          <DraftsProvider><MessagesProvider>
            <ProjectConclusionPanel projectId="draft" projectName="draft 效率" conclusion={VERIFIED} node={NODE} {...handlers} />
          </MessagesProvider></DraftsProvider>,
        )
        await flush()
      })
      expect(draft()!.querySelector('.draft-form-destination')!.textContent).toBe('→Speculative decoding· 结论')
      await act(async () => { press(draft()!.querySelector('input')!, 'Enter'); await flush() })
      expect(handlers.onWrite).toHaveBeenCalledWith('topics/sd', '实验结论写成「Speculative decoding」的结论', expect.any(Array))
    } finally {
      window.localStorage.removeItem(keptDraftsKey('/vaults/conclusions'))
    }
  })

  it('旧版结论写入 Wiki:证据是那条结论本身', async () => {
    await panel({ id: 'c1', source: '手动添加', text: '旧的一条', state: 'verified', tasks: [], experiments: [], wiki: [] })
    await act(async () => { button('写入 Wiki').click(); await flush() })
    expect(draft()!.querySelector('.conclusion-draft-evidence')!.textContent).toBe('实验draft 效率旧的一条')
  })

  it('换一条结论时,上一条的草稿不跟过去', async () => {
    await panel(VERIFIED)
    await act(async () => { button('写入 Wiki').click(); await flush() })
    await panel({ ...VERIFIED, id: 't.other', node: 't.other', text: '另一条' })
    expect(draft()).toBeNull()
  })

  it('旧版结论:显示来源,不显示证据链和验证', async () => {
    await panel({ id: 'c1', source: '手动添加', text: '旧的一条', state: 'verified', tasks: [], experiments: [], wiki: [] })
    expect(host.querySelector('.conclusion-detail-source')!.textContent).toBe('手动添加')
    expect(host.querySelector('.conclusion-detail-node')).toBeNull()
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === '验证')).toBe(false)
  })
})
