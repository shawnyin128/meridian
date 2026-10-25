// @vitest-environment jsdom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperRow, ResearchIdea } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

vi.mock('../ipc.js', () => ({
  project: { list: async () => [], removePaper: async () => ({ change: 'c' }), addPaper: async () => ({ change: 'c' }) },
  papers: { facets: async () => [] },
  changelog: { undo: async () => {} },
}))
vi.mock('../shell/AppShell.js', () => ({ useJump: () => ({ jump: null, open: vi.fn() }) }))
vi.mock('../hooks/useVaultWrite.js', () => ({ useVaultWrite: () => async () => true }))

const { PaperTopics } = await import('./PaperTopics.js')
const { ProjectChips } = await import('./ProjectChips.js')
const { ProjectAreasField, ProjectRelations } = await import('./project/ProjectSections.js')
const { IdeaRelations } = await import('./ideas/IdeaRelations.js')

const IDEA = {
  id: 'idea-1', title: '想法', body: '', archived: false, created: '2026-09-17', updated: '2026-09-18',
  source: { chatId: 'chat-1', chatTitle: '对话' }, relations: { projects: ['draft'], pages: [] },
} as unknown as ResearchIdea

describe('ChipList', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    // FadeText measures whether its text fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  const render = (node: ReactNode) => act(() => root.render(<MessagesProvider>{node}</MessagesProvider>))
  /**
   * How the first chip under `host` removes itself: whether the chip hosts a row-actions slot, whether
   * the × sits in that slot, the ×'s classes and its stroke.
   */
  const removal = () => {
    const chip = host.querySelector('.tagchip:not(.tagadd)')!
    const cross = chip.querySelector('.rx')!
    return [
      chip.hasAttribute('data-row-actions'), cross.parentElement!.classList.contains('row-actions'),
      cross.className, cross.querySelector('svg')!.getAttribute('stroke-width'),
    ]
  }

  it('每个 chip 列表都一样移除:× 是 chip 自己操作槽里的同一个行内图标按钮,悬停或聚焦这个 chip 才显出', () => {
    const removals: unknown[] = []
    render(<PaperTopics topics={['推理']} keep={['paper', 'p1']} onAdd={vi.fn()} onRemove={vi.fn()} onError={vi.fn()} />)
    removals.push(removal())
    render(<ProjectAreasField projectId="draft" areas={['推理']} onSave={vi.fn()} onRemove={vi.fn()} onError={vi.fn()} />)
    removals.push(removal())
    render(<ProjectChips paper={{ id: 'p1', projects: [{ id: 'draft', name: 'draft 效率' }] } as PaperRow} onError={vi.fn()} />)
    removals.push(removal())
    render(
      <ProjectRelations
        groups={[{ group: 'Wiki', items: [{ id: 'rel-1', text: '树宽', page: 'topics/knee' }] }]} papers={[]}
        onEdit={vi.fn()} onRemove={vi.fn()} onOpenPage={vi.fn()} onOpenPaper={vi.fn()} onRemovePaper={vi.fn()} onMove={vi.fn()}
      />,
    )
    removals.push(removal())
    render(
      <IdeaRelations
        idea={IDEA} projects={[{ id: 'draft', name: 'draft 效率' } as never]} pages={new Map()}
        onChange={vi.fn()} onOpenProject={vi.fn()} onOpenPage={vi.fn()} onError={vi.fn()}
      />,
    )
    removals.push(removal())
    expect(removals).toEqual(Array(5).fill([true, true, 'icbtn xs rx', '2.5']))
  })

  it('chip 列表末尾的 + 是 AddAction 的 chip 尺寸圆钮:属性里一直显出,表格行里放进这一行的操作槽', () => {
    const plus = () => {
      const add = host.querySelector('.tagadd')!
      return [add.className, add.parentElement!.classList.contains('row-actions')]
    }
    render(<PaperTopics topics={[]} keep={['paper', 'p1']} onAdd={vi.fn()} onRemove={vi.fn()} onError={vi.fn()} />)
    const rest = plus()
    render(<PaperTopics topics={[]} keep={['paper', 'p1']} onAdd={vi.fn()} onRemove={vi.fn()} onError={vi.fn()} reveal="hover" />)
    expect([rest, plus()]).toEqual([
      ['add-action add-action-icon add-action-chip tagchip tagadd', false],
      ['add-action add-action-icon add-action-chip tagchip tagadd', true],
    ])
  })

  it('点 chip 的名字只打开它命名的东西,点击不传到 chip 外面的行', () => {
    const onOpenPage = vi.fn()
    const outside = vi.fn()
    render(
      <div onClick={outside}>
        <ProjectRelations
          groups={[{ group: 'Wiki', items: [{ id: 'rel-1', text: '树宽', page: 'topics/knee' }] }]} papers={[]}
          onEdit={vi.fn()} onRemove={vi.fn()} onOpenPage={onOpenPage} onOpenPaper={vi.fn()} onRemovePaper={vi.fn()} onMove={vi.fn()}
        />
      </div>,
    )
    act(() => host.querySelector<HTMLElement>('.tagchip-open')!.click())
    act(() => host.querySelector<HTMLElement>('.tagchip .rx')!.click())
    expect([onOpenPage.mock.calls, outside.mock.calls.length]).toEqual([[['topics/knee']], 0])
  })
})
