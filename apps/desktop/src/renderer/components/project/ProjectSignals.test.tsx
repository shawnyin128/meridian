// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectEventRow, ProjectSignalDate, ProjectSignalKind } from './ProjectSignals.js'

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
    expect(type).toContain('class="ak bad"')
    expect(date).toContain('class="project-signal-date"')
    expect(date).toContain('class="date-chip"')
    expect(emptyDate).toBe('<span class="project-signal-date"></span>')
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
    expect(host.querySelector('.project-signal-kind .ak.good')?.textContent).toBe('实验结果')
    expect(host.querySelector('.project-signal-date .date-chip')).not.toBeNull()
    expect(host.querySelector('.record-line')?.textContent).toBe('第一个探针支持假设 · p99 从 80ms 降到 62ms')
    expect(host.querySelector('.record-who')?.textContent).toBe('agent')
    expect(row?.className).toContain('with-node')
    const tag = host.querySelector('.record-node button.node-tag--fill')
    expect(tag?.textContent).toBe('延迟探针')
    expect(tag?.className).toContain('node-tag--repairable')
    expect(tag?.querySelector('.node-tag-dot')).not.toBeNull()
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
    expect(host.querySelector('.project-signal-kind .ak.mut')?.textContent).toBe('记录')
    expect(host.querySelector('.record-who')?.textContent).toBe('你')
    act(() => root.unmount())
  })
})
