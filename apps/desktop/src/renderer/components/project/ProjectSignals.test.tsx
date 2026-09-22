// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('renders the kind chip, node link, title, detail, and who; clicking the node reports its id', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onSelectNode = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <ProjectEventRow
          kind="result" title="第一个探针支持假设" detail="p99 从 80ms 降到 62ms"
          node={{ id: 'thread.B', label: '延迟探针' }} onSelectNode={onSelectNode} origin="agent"
        />
      </MessagesProvider>,
    ))

    expect(host.querySelector('.record-kind')?.textContent).toBe('实验结果')
    expect(host.querySelector('.record-kind')?.className).toContain('rk-result')
    expect(host.querySelector('.record-title')?.textContent).toBe('第一个探针支持假设')
    expect(host.querySelector('.record-detail')?.textContent).toBe('p99 从 80ms 降到 62ms')
    expect(host.querySelector('.record-who')?.textContent).toBe('agent')
    const nodeLink = host.querySelector('.record-node-link')
    expect(nodeLink?.textContent).toBe('延迟探针')
    act(() => { nodeLink!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onSelectNode).toHaveBeenCalledWith('thread.B')
    act(() => root.unmount())
  })

  it('omits the node column entirely when the caller passes no onSelectNode (the node-panel variant)', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider>
        <ProjectEventRow kind="note" title="搭好评测环境" origin="user" />
      </MessagesProvider>,
    ))

    expect(host.querySelector('.record-node')).toBeNull()
    expect(host.querySelector('.record-who')?.textContent).toBe('你')
    act(() => root.unmount())
  })

  it('keeps the node column but renders nothing in it when the record carries no node', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider>
        <ProjectEventRow kind="decision" title="改成条件式" onSelectNode={vi.fn()} origin="user" />
      </MessagesProvider>,
    ))

    const nodeCell = host.querySelector('.record-node')
    expect(nodeCell).not.toBeNull()
    expect(nodeCell?.textContent).toBe('')
    act(() => root.unmount())
  })
})
