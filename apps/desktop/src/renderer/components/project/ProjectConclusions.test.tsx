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

vi.mock('../../ipc.js', () => ({ wiki: { cards: api.cards, aggregation: api.aggregation } }))

const { ProjectConclusionPanel, ProjectConclusionRow } = await import('./ProjectConclusions.js')

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
    onWrite: vi.fn<(title: string, ops: ProposalOp[]) => Promise<boolean>>(() => Promise.resolve(true)),
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
      root!.render(<MessagesProvider><ProjectConclusionPanel projectId="draft" conclusion={conclusion} node={NODE} {...handlers} /></MessagesProvider>)
    })
  }
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!

  it('一行与动态同一套列:状态、日期、节点、结论、Wiki 状态;点一下打开', () => {
    const onOpen = vi.fn()
    const written = { ...PENDING, state: 'verified' as const, verifiedOn: '2026-09-21', wiki: [{ page: 'topics/sd', title: 'Speculative decoding', claim: 'wide-b8', version: 2 }] }
    act(() => root!.render(
      <MessagesProvider>
        <ProjectConclusionRow conclusion={PENDING} node={NODE} selected={false} onOpen={onOpen} />
        <ProjectConclusionRow conclusion={written} node={NODE} selected onOpen={vi.fn()} />
      </MessagesProvider>,
    ))
    const [pending, verified] = [...host.querySelectorAll<HTMLElement>('.record-row')]
    expect(pending!.className).toContain('project-signal-columns record-row with-node')
    expect([...pending!.children].map((cell) => cell.className)).toEqual([
      'project-signal-kind', 'project-signal-date', 'record-node', 'attn-text record-text', 'record-who conclusion-wiki',
    ])
    expect(pending!.querySelector('.ak')!.textContent).toBe('待验证')
    expect(pending!.querySelector('.node-tag')!.textContent).toBe('宽树')
    expect(pending!.querySelector('.conclusion-wiki')!.textContent).toBe('未写入 Wiki')
    expect(verified!.querySelector('.ak')!.textContent).toBe('已验证')
    expect(verified!.querySelector('.conclusion-wiki')!.textContent).toBe('Speculative decoding v2')
    expect(verified!.classList.contains('structured-row--selected')).toBe(true)
    expect(pending!.classList.contains('structured-row--selected')).toBe(false)
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
    const chain = [...host.querySelectorAll('.conclusion-chain-row, .conclusion-detail-node .node-tag')].map((el) => el.textContent)
    expect(chain).toEqual(['跑宽度扫描', '宽树', '宽度扫描exp-1'])
    act(() => host.querySelector<HTMLButtonElement>('.conclusion-chain-row')!.click())
    expect(handlers.onOpenTask).toHaveBeenCalledWith('task-1')
    act(() => host.querySelector<HTMLButtonElement>('.conclusion-detail-node .node-tag')!.click())
    expect(handlers.onOpenNode).toHaveBeenCalledWith('t.wide')
  })

  it('已验证:选一页写入 Wiki,提交一条以这个节点为证据的结论', async () => {
    await panel({ ...PENDING, state: 'verified', verifiedOn: '2026-09-21' })
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === '验证')).toBe(false)
    act(() => button('取消验证').click())
    expect(handlers.onUnverify).toHaveBeenCalledWith('t.wide')
    await act(async () => { button('写入 Wiki').click(); await flush() })
    const select = document.querySelector<HTMLSelectElement>('.wiki-form select')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!.call(select, 'topics/sd')
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })
    expect(document.querySelector<HTMLTextAreaElement>('.wiki-form textarea')!.value).toBe('Wide trees win at B8')
    await act(async () => { button('保存').click(); await flush() })
    expect(handlers.onWrite).toHaveBeenCalledWith('项目结论写入「Speculative decoding」', [{
      op: 'addClaim', page: 'topics/sd', claim: {
        id: 'wide-trees-win-at-b8', text: 'Wide trees win at B8',
        evidence: [{ kind: 'experiment', project: 'draft', node: 't.wide' }],
      },
    }])
  })

  it('旧版结论:显示来源,不显示证据链和验证', async () => {
    await panel({ id: 'c1', source: '手动添加', text: '旧的一条', state: 'verified', tasks: [], experiments: [], wiki: [] })
    expect(host.querySelector('.conclusion-detail-source')!.textContent).toBe('手动添加')
    expect(host.querySelector('.conclusion-detail-node')).toBeNull()
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === '验证')).toBe(false)
  })
})
