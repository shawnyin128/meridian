// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResearchIdea } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { IdeaPanel } from './IdeaPanel.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const IDEA: ResearchIdea = {
  id: 'idea-1', title: '用动态预算控制校准成本', body: '先做一个最小探针。',
  source: { chatId: 'chat-1', chatTitle: '论文讨论', paperId: 'p1', paperTitle: 'EAGLE-2' },
  project: 'draft', archived: true, created: '2026-09-17', updated: '2026-09-18',
}

describe('IdeaPanel', () => {
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
  })

  const headings = () => [...host.querySelectorAll('.section-heading [role="heading"]')].map((heading) => heading.textContent)

  it('面板头写标题，跟着宿主的操作和关闭；正文里再是类型标签、内容、宿主自己的分节，最后是来源', () => {
    const onClose = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <IdeaPanel idea={IDEA} actions={<button type="button" className="btn sm">打开想法</button>} onClose={onClose}>
          <section className="probe">关联</section>
        </IdeaPanel>
      </MessagesProvider>,
    ))
    const head = host.querySelector('.panel-head')!
    expect(head.querySelector('.panel-head-title')!.textContent).toBe(IDEA.title)
    expect([...head.querySelectorAll('button')].map((button) => button.textContent || button.getAttribute('aria-label')))
      .toEqual(['打开想法', '收起详情'])
    expect([...host.querySelectorAll('.idea-panel-meta .tag')].map((tag) => tag.textContent)).toEqual(['想法', '论文阅读', '已归档'])
    expect(headings()).toEqual(['内容', '来源'])
    expect(host.querySelector('.idea-panel-body')!.textContent).toBe('先做一个最小探针。')
    const order = [...host.querySelectorAll('.idea-panel-body, .probe, .idea-panel-source')].map((el) => el.className)
    expect(order).toEqual(['md idea-panel-body', 'probe', 'idea-panel-source'])
    expect(host.querySelector('.idea-panel-source')!.textContent).toBe('EAGLE-2 · 论文讨论')
    act(() => head.querySelector<HTMLButtonElement>('.panel-close')!.click())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('创建和更新日期在顶部，跟在类型标签后面；正文和来源之后不再写日期', () => {
    act(() => root.render(<MessagesProvider><IdeaPanel idea={IDEA} onClose={vi.fn()} /></MessagesProvider>))
    const meta = host.querySelector('.idea-panel-meta')!
    const body = host.querySelector('.panel-body')!
    expect([body.previousElementSibling, body.firstElementChild]).toEqual([host.querySelector('.panel-head'), meta])
    expect(meta.querySelector('.idea-panel-dates')!.textContent).toBe('创建于 9月17日 · 更新于 9月18日')
    expect([...meta.children].map((child) => child.className.split(' ')[0])).toEqual(['tag', 'tag', 'tag', 'idea-panel-dates'])
    expect(body.lastElementChild).toBe(host.querySelector('.idea-panel-source'))
  })

  it('创建和更新是同一天时只写创建于', () => {
    act(() => root.render(<MessagesProvider><IdeaPanel idea={{ ...IDEA, updated: IDEA.created }} onClose={vi.fn()} /></MessagesProvider>))
    expect(host.querySelector('.idea-panel-meta .idea-panel-dates')!.textContent).toBe('创建于 9月17日')
  })

  it('自己写下的想法没有来源一节，也不写手动添加', () => {
    const own: ResearchIdea = { ...IDEA, source: { chatTitle: '手动添加' } }
    act(() => root.render(<MessagesProvider><IdeaPanel idea={own} onClose={vi.fn()} onOpenSourceChat={vi.fn()} /></MessagesProvider>))
    expect(headings()).toEqual(['内容'])
    expect(host.querySelector('.idea-panel-source')).toBeNull()
    expect(host.textContent).not.toContain('手动添加')
  })

  it('类型标签后面跟着来源标签，和想法列表一样：对话、论文阅读、agent；自己写下的想法没有', () => {
    const kinds = (idea: ResearchIdea) => {
      act(() => root.render(<MessagesProvider><IdeaPanel idea={idea} onClose={vi.fn()} /></MessagesProvider>))
      return [...host.querySelectorAll('.idea-panel-meta .tag')].map((tag) => tag.textContent)
    }
    const open = { ...IDEA, archived: false }
    expect(kinds({ ...open, source: { chatId: 'chat-1', chatTitle: '论文讨论' } })).toEqual(['想法', '对话'])
    expect(kinds(open)).toEqual(['想法', '论文阅读'])
    expect(kinds({ ...open, source: { chatTitle: '缓存淘汰的实现讨论', agent: true } })).toEqual(['想法', 'agent'])
    expect(kinds({ ...open, source: { chatTitle: '手动添加' } })).toEqual(['想法'])
  })

  it('宿主给了想法的文件时，内容后面是附件一节：列出每个文件，带添加附件；删除把文件 id 交给宿主，点文件名定位它', () => {
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    const onReveal = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <IdeaPanel
          idea={IDEA} onClose={vi.fn()}
          files={{
            attachments: [
              { id: 'att-2', name: 'proposal.md', size: '14 KB', path: '/research/proposal.md' },
              { id: 'att-1', name: 'sketch.pdf', size: '1.2 MB', path: '/research/sketch.pdf' },
            ],
            onAdd, onRemove, onReveal,
          }}
        >
          <section className="probe">关联</section>
        </IdeaPanel>
      </MessagesProvider>,
    ))
    expect(headings()).toEqual(['内容', '附件', '来源'])
    const order = [...host.querySelectorAll('.idea-panel-body, .attachments, .probe')].map((el) => el.className.split(' ')[0])
    expect(order).toEqual(['md', 'attachments', 'probe'])
    expect([...host.querySelectorAll('.attrow .an')].map((name) => name.textContent)).toEqual(['proposal.md', 'sketch.pdf'])
    expect([...host.querySelectorAll('.section-heading .add-action')].map((add) => add.getAttribute('aria-label'))).toEqual(['添加附件'])
    act(() => host.querySelectorAll<HTMLButtonElement>('.attrow .ax')[1]!.click())
    expect(onRemove).toHaveBeenCalledWith('att-1')
    act(() => host.querySelector<HTMLButtonElement>('.attrow .an')!.click())
    expect(onReveal).toHaveBeenCalledWith('/research/proposal.md')
  })

  it('内容按 Markdown 显示;宿主给了自己的内容一节时换掉它', () => {
    act(() => root.render(
      <MessagesProvider><IdeaPanel idea={{ ...IDEA, body: '### 要验证\n\n- **一条**' }} onClose={vi.fn()} /></MessagesProvider>,
    ))
    expect(host.querySelector('.idea-panel-body h3')!.textContent).toBe('要验证')
    expect(host.querySelector('.idea-panel-body li strong')!.textContent).toBe('一条')
    act(() => root.render(
      <MessagesProvider>
        <IdeaPanel idea={IDEA} onClose={vi.fn()} body={<section className="editor-probe" />} />
      </MessagesProvider>,
    ))
    expect(host.querySelector('.editor-probe')).not.toBeNull()
    expect(host.querySelector('.idea-panel-body')).toBeNull()
    expect(headings()).toEqual(['来源'])
  })

  it('给了打开来源对话的去处才有这个按钮，按它打开那段对话', () => {
    const onOpenSourceChat = vi.fn()
    act(() => root.render(<MessagesProvider><IdeaPanel idea={IDEA} onClose={vi.fn()} /></MessagesProvider>))
    expect(host.textContent).not.toContain('打开来源对话')
    act(() => root.render(
      <MessagesProvider><IdeaPanel idea={IDEA} onClose={vi.fn()} onOpenSourceChat={onOpenSourceChat} /></MessagesProvider>,
    ))
    const open = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '打开来源对话')!
    act(() => open.click())
    expect(onOpenSourceChat).toHaveBeenCalledWith('chat-1')
  })

  it('来源对话删掉了：没有打开来源对话的按钮，来源后面跟着中性的对话已删除标签', () => {
    act(() => root.render(
      <MessagesProvider><IdeaPanel idea={IDEA} onClose={vi.fn()} onOpenSourceChat={vi.fn()} sourceChatDeleted /></MessagesProvider>,
    ))
    expect(host.textContent).not.toContain('打开来源对话')
    const tag = host.querySelector('.idea-panel-source .tag')!
    expect([tag.textContent, tag.className]).toEqual(['对话已删除', 'tag tag--label tag--neutral idea-panel-source-gone'])
    expect(host.querySelector('.idea-panel-source')!.textContent).toBe('EAGLE-2 · 论文讨论对话已删除')
  })

  it('给了打开论文的去处时，来源里的论文名是链接，点它打开那篇论文；对话名不是链接，没给去处时论文名也不是', () => {
    const onOpenSourcePaper = vi.fn()
    act(() => root.render(<MessagesProvider><IdeaPanel idea={IDEA} onClose={vi.fn()} /></MessagesProvider>))
    expect(host.querySelector('.idea-panel-source a, .idea-panel-source button')).toBeNull()
    act(() => root.render(
      <MessagesProvider><IdeaPanel idea={IDEA} onClose={vi.fn()} onOpenSourcePaper={onOpenSourcePaper} /></MessagesProvider>,
    ))
    const source = host.querySelector('.idea-panel-source')!
    expect(source.textContent).toBe('EAGLE-2 · 论文讨论')
    expect([...source.querySelectorAll('a, button')].map((link) => [link.tagName, link.className, link.textContent]))
      .toEqual([['A', 'entity-link entity-link--paper', 'EAGLE-2']])
    act(() => source.querySelector<HTMLElement>('.entity-link')!.click())
    expect(onOpenSourcePaper).toHaveBeenCalledWith('p1')
  })

  it('来源里的论文名和对话名按论文文本显示，不露 LaTeX 源码', () => {
    const latex = { ...IDEA, source: { ...IDEA.source, chatTitle: 'H$_2$O 的讨论', paperTitle: 'H$_2$O: Heavy-Hitter Oracle' } }
    act(() => root.render(<MessagesProvider><IdeaPanel idea={latex} onClose={vi.fn()} /></MessagesProvider>))
    const source = host.querySelector('.idea-panel-source')!
    expect(source.querySelectorAll('.katex')).toHaveLength(2)
    expect(source.textContent).not.toContain('$')
  })
})
