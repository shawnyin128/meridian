// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { TodayContext } from '../../shell/AppShell.js'
import { TimelineBoard, type TimelineProject } from './TimelineBoard.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// jsdom has no layout engine and no ResizeObserver; TimelineBoard's own fit-to-viewport effect and
// useGanttDrag's viewport-tracking effect both construct one on mount, so a bare stub keeps an
// interactive (createRoot) mount from throwing. It never needs to actually report a resize here.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver ??= ResizeObserverStub

const task = (id: string, title: string): Task => ({
  id, title, start: '2026-09-16', end: '2026-09-18', state: 'act', priority: 'p1',
})

const project: TimelineProject = {
  id: 'proj-1', name: '排序项目', tasks: [task('t1', '第一个任务'), task('t2', '第二个任务')], milestones: [],
}

function renderBoard(onReorderTasks?: (projectId: string, order: string[]) => void) {
  return renderToStaticMarkup(
    <MessagesProvider>
      <TodayContext.Provider value="2026-09-16">
        <TimelineBoard
          projects={[project]}
          onTaskClick={vi.fn()} onMilestoneClick={vi.fn()} onMilestoneLaneClick={vi.fn()}
          onMoveTask={vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
          {...(onReorderTasks ? { onReorderTasks } : {})}
        />
      </TodayContext.Provider>
    </MessagesProvider>,
  )
}

/** Mounts an interactive TimelineBoard into `host` so real mouse events reach its handlers. */
function mountBoard(host: HTMLDivElement, overrides: {
  onTaskClick?: (projectId: string, taskId: string) => void
  onLabelClick?: (projectId: string, kind: 'milestones' | 'task', itemId?: string) => void
  onMoveTask?: (projectId: string, taskId: string, start: string, end: string, days: number) => void
}) {
  act(() => createRoot(host).render(
    <MessagesProvider>
      <TodayContext.Provider value="2026-09-16">
        <TimelineBoard
          projects={[project]}
          onTaskClick={overrides.onTaskClick ?? vi.fn()}
          {...(overrides.onLabelClick === undefined ? {} : { onLabelClick: overrides.onLabelClick })}
          onMilestoneClick={vi.fn()} onMilestoneLaneClick={vi.fn()}
          onMoveTask={overrides.onMoveTask ?? vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
        />
      </TodayContext.Provider>
    </MessagesProvider>,
  ))
}

/** Dispatches a real mouse event so it reaches both React's synthetic handlers and useGanttDrag's own document-level listeners. */
function mouse(target: EventTarget, type: string, clientX = 0): void {
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX })) })
}

describe('TimelineBoard 标签列拖拽排序', () => {
  it('提供了 onReorderTasks 时,任务标签行可以拖拽,里程碑行不可以', () => {
    const output = renderBoard(vi.fn())
    expect(output).toContain('data-task="t1" draggable="true"')
    expect(output).toContain('data-task="t2" draggable="true"')
    expect(output).not.toMatch(/class="glrow msl timeline-label-row"[^>]*draggable/)
  })

  it('没有提供 onReorderTasks 时,标签行保持原有的不可拖拽行为(总览甘特不受影响)', () => {
    const output = renderBoard()
    expect(output).not.toContain('draggable="true"')
  })
})

describe('TimelineBoard 点击打开任务详情', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
  })

  it('点击任务条(不拖动)会触发 onTaskClick', () => {
    const onTaskClick = vi.fn()
    mountBoard(host, { onTaskClick })
    const bar = host.querySelector('.gbar[data-task="t1"]')!
    mouse(bar, 'mousedown', 100)
    mouse(document, 'mouseup', 100)
    expect(onTaskClick).toHaveBeenCalledWith('proj-1', 't1')
  })

  it('先拖动任务条再松手,不会触发 onTaskClick,而是触发 onMoveTask', () => {
    const onTaskClick = vi.fn()
    const onMoveTask = vi.fn()
    mountBoard(host, { onTaskClick, onMoveTask })
    const bar = host.querySelector('.gbar[data-task="t1"]')!
    mouse(bar, 'mousedown', 100)
    // Move well past the 4px-of-pixel / one-grid-unit threshold useGanttDrag treats as a real drag.
    mouse(document, 'mousemove', 100 + 200)
    mouse(document, 'mouseup', 100 + 200)
    expect(onTaskClick).not.toHaveBeenCalled()
    expect(onMoveTask).toHaveBeenCalled()
  })

  it('点击任务的标签行会触发 onLabelClick,里程碑标签行不会', () => {
    const onLabelClick = vi.fn()
    mountBoard(host, { onLabelClick })
    const taskLabel = host.querySelector('.glrow.timeline-label-row[data-task="t1"]')!
    mouse(taskLabel, 'click')
    expect(onLabelClick).toHaveBeenCalledWith('proj-1', 'task', 't1')

    onLabelClick.mockClear()
    const msLabel = host.querySelector('.glrow.msl.timeline-label-row')!
    mouse(msLabel, 'click')
    expect(onLabelClick).toHaveBeenCalledWith('proj-1', 'milestones', undefined)
  })
})
