// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import {
  EventText, ProjectAttention, ProjectEventRow, ProjectSignalDate, ProjectSignalKind,
} from './ProjectSignals.js'

describe('ProjectSignals', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('keeps type and date in stable shared columns', () => {
    const type = renderToStaticMarkup(<ProjectSignalKind tone="bad">任务逾期</ProjectSignalKind>)
    const date = renderToStaticMarkup(
      <MessagesProvider><ProjectSignalDate date="2026-09-16" /></MessagesProvider>,
    )
    const emptyDate = renderToStaticMarkup(
      <MessagesProvider><ProjectSignalDate date={undefined} /></MessagesProvider>,
    )

    expect(type).toContain('class="project-signal-kind"')
    expect(type).toContain('class="tag tag--label tag--bad"')
    expect(date).toContain('class="project-signal-date"')
    expect(date).toContain('class="tag tag--chip tag--neutral date-chip"')
    expect(emptyDate).toBe('<span class="project-signal-date"></span>')
  })

  it('一行的记录正文在前,agent 写的在末尾跟 agent 标签,我写的不带', () => {
    const agent = renderToStaticMarkup(<MessagesProvider><EventText text="跑完基线" origin="agent" /></MessagesProvider>)
    expect(agent).toMatch(/跑完基线.*<span class="tag tag--label tag--neutral source-label"><span class="tag-text">agent<\/span><\/span><\/span>$/)
    expect(renderToStaticMarkup(<MessagesProvider><EventText text="我记的" /></MessagesProvider>)).not.toContain('source-label')
  })
})

describe('ProjectAttention', () => {
  it('任务和里程碑的提醒定位到它的条目，冲突打开它的页，其余的不能点', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const handlers = { onOpenPage: vi.fn(), onLocateTask: vi.fn(), onLocateMilestone: vi.fn() }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider>
        <ProjectAttention
          items={[
            { id: 'block', rank: 1, kind: '阻塞', tone: 'bad', reason: '等机器', action: '' },
            { id: 'milestone-m1', milestone: 'm1', rank: 3, kind: '里程碑逾期', tone: 'bad', reason: '初稿', action: '', date: '2026-10-13' },
            { id: 'overdue-tasks-2026-09-28', task: 't1', rank: 4, kind: '任务逾期', tone: 'bad', reason: '1 条任务已过计划时间', action: '', date: '2026-09-28' },
            { id: 'conflict', page: 'topics/sd', rank: 0, kind: '冲突', tone: 'bad', reason: '1 处冲突', action: '' },
          ]}
          {...handlers}
        />
      </MessagesProvider>,
    ))
    const rows = [...host.querySelectorAll<HTMLElement>('.attnrow')]
    expect(rows.map((row) => row.tagName)).toEqual(['DIV', 'BUTTON', 'BUTTON', 'BUTTON'])
    act(() => rows[1]!.click())
    act(() => rows[2]!.click())
    act(() => rows[3]!.click())
    expect(handlers.onLocateMilestone).toHaveBeenCalledWith('m1')
    expect(handlers.onLocateTask).toHaveBeenCalledWith('t1')
    expect(handlers.onOpenPage).toHaveBeenCalledWith('topics/sd')
    act(() => root.unmount())
    host.remove()
  })
})

describe('ProjectEventRow', () => {
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('跟决策行同一套列:类型标签、日期标签、节点标签、标题与细节、谁写的;点节点标签报出节点 id', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onSelectNode = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <ProjectEventRow
          kind="result" date="2026-09-22" title="第一个探针支持假设" detail="p99 从 80ms 降到 62ms"
          node={{ id: 'thread.B', label: '延迟探针', mode: 'repairable' }} onSelectNode={onSelectNode} origin="agent"
        />
      </MessagesProvider>,
    ))

    const row = host.querySelector('.record-row')
    expect(row?.className).toContain('attnrow project-signal-columns')
    expect(host.querySelector('.project-signal-kind .tag--good')?.textContent).toBe('实验结果')
    expect(host.querySelector('.project-signal-date .date-chip')).not.toBeNull()
    expect(host.querySelector('.record-line')?.textContent).toBe('第一个探针支持假设 · p99 从 80ms 降到 62ms')
    expect(host.querySelector('.record-who .source-label')?.textContent).toBe('agent')
    expect(row?.className).toContain('with-node')
    const tag = host.querySelector('.record-node button.node-tag--fill')
    expect(tag?.textContent).toBe('延迟探针')
    expect(tag?.querySelector('.status-dot--warn')?.getAttribute('aria-label')).toBe('待修复')
    act(() => { tag!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onSelectNode).toHaveBeenCalledWith('thread.B')
    act(() => root.unmount())
  })

  it('节点面板里的变体(不传 onSelectNode)不画节点标签;没有细节时只写标题', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider>
        <ProjectEventRow
          kind="note" date="2026-09-21" title="搭好评测环境" origin="user"
          node={{ id: 'thread.A', label: '评测', mode: 'unresolved' }}
        />
      </MessagesProvider>,
    ))

    expect(host.querySelector('.node-tag')).toBeNull()
    expect(host.querySelector('.record-line')?.textContent).toBe('搭好评测环境')
    expect(host.querySelector('.project-signal-kind .tag--neutral')?.textContent).toBe('记录')
    expect(host.querySelector('.record-who')?.childElementCount).toBe(0)
    act(() => root.unmount())
  })
})
