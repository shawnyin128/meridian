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

  const headings = () => [...host.querySelectorAll('.section-heading')].map((heading) => heading.textContent)

  it('标题在顶行，跟着宿主的操作和关闭；再是类型标签、内容、宿主自己的分节，最后是来源', () => {
    const onClose = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <IdeaPanel idea={IDEA} actions={<button type="button" className="btn sm">打开想法</button>} onClose={onClose}>
          <section className="probe">关联</section>
        </IdeaPanel>
      </MessagesProvider>,
    ))
    const head = host.querySelector('.idea-panel-head')!
    expect(head.querySelector('.node-document-title')!.textContent).toBe(IDEA.title)
    expect([...head.querySelectorAll('button')].map((button) => button.textContent || button.getAttribute('aria-label')))
      .toEqual(['打开想法', '收起详情'])
    expect([...host.querySelectorAll('.idea-panel-meta .tag')].map((tag) => tag.textContent)).toEqual(['想法', '已归档'])
    expect(headings()).toEqual([`${IDEA.title}打开想法`, '内容', '来源'])
    expect(host.querySelector('.idea-panel-body')!.textContent).toBe('先做一个最小探针。')
    const order = [...host.querySelectorAll('.idea-panel-body, .probe, .idea-panel-source')].map((el) => el.className)
    expect(order).toEqual(['idea-panel-body', 'probe', 'idea-panel-source'])
    expect(host.querySelector('.idea-panel-source')!.textContent).toBe('EAGLE-2 · 论文讨论')
    act(() => head.querySelector<HTMLButtonElement>('.panel-close')!.click())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('创建和更新日期在顶部，跟在类型标签后面；正文和来源之后不再写日期', () => {
    act(() => root.render(<MessagesProvider><IdeaPanel idea={IDEA} onClose={vi.fn()} /></MessagesProvider>))
    const meta = host.querySelector('.idea-panel-meta')!
    expect(meta.previousElementSibling).toBe(host.querySelector('.idea-panel-head'))
    expect(meta.querySelector('.idea-panel-dates')!.textContent).toBe('创建于 9月17日 · 更新于 9月18日')
    expect([...meta.children].map((child) => child.className.split(' ')[0])).toEqual(['tag', 'tag', 'idea-panel-dates'])
    expect(host.lastElementChild).toBe(host.querySelector('.idea-panel-source'))
  })

  it('自己写下的想法没有来源一节，也不写手动添加', () => {
    const own: ResearchIdea = { ...IDEA, source: { chatTitle: '手动添加' } }
    act(() => root.render(<MessagesProvider><IdeaPanel idea={own} onClose={vi.fn()} onOpenSourceChat={vi.fn()} /></MessagesProvider>))
    expect(headings()).toEqual([own.title, '内容'])
    expect(host.querySelector('.idea-panel-source')).toBeNull()
    expect(host.textContent).not.toContain('手动添加')
  })

  it('编辑时编辑器换掉内容那一节', () => {
    act(() => root.render(
      <MessagesProvider>
        <IdeaPanel idea={IDEA} onClose={vi.fn()} editor={<section className="editor-probe" />} />
      </MessagesProvider>,
    ))
    expect(host.querySelector('.editor-probe')).not.toBeNull()
    expect(host.querySelector('.idea-panel-body')).toBeNull()
    expect(headings()).toEqual([IDEA.title, '来源'])
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
