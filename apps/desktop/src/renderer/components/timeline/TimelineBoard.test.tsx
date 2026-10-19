// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { TodayContext } from '../../shell/AppShell.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
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

describe('TimelineBoard 只显示当前时间段里的任务', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
  })

  // Today is Wednesday 2026-09-16: its week is 09-14 to 09-20, its month is September.
  const spanning = (id: string, start: string, end: string): Task => ({
    id, title: id, start, end, state: 'act', priority: 'p1',
  })
  const periods: TimelineProject = {
    id: 'proj-2', name: '时间段项目', milestones: [],
    tasks: [
      spanning('today', '2026-09-16', '2026-09-16'),
      spanning('week', '2026-09-10', '2026-09-15'),
      spanning('month', '2026-09-03', '2026-09-08'),
      spanning('before', '2026-08-20', '2026-08-25'),
    ],
  }

  const mountPeriods = (project: TimelineProject, onReorderTasks?: (projectId: string, order: string[]) => void) => {
    act(() => createRoot(host).render(
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
    ))
  }
  /** The task ids that have a label row and the task ids that have a canvas row, in order. */
  const shownTasks = () => ({
    labels: [...host.querySelectorAll<HTMLElement>('.glrow[data-task]')].map((row) => row.dataset.task),
    lanes: [...host.querySelectorAll<HTMLElement>('.grow[data-task]')].map((row) => row.dataset.task),
  })
  const pickScale = (label: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('.ghead .segmented-control>button')].find((b) => b.textContent === label)!
    act(() => { button.click() })
  }

  it('周视图只列出和这一周有交集的任务,完全在这一周之外的任务没有标签行、任务条或边缘标记', () => {
    mountPeriods(periods)
    expect(shownTasks()).toEqual({ labels: ['today', 'week'], lanes: ['today', 'week'] })
  })

  it('日视图和月视图同样只列出和当前这一天、这个月有交集的任务', () => {
    mountPeriods(periods)
    pickScale('日')
    expect(shownTasks()).toEqual({ labels: ['today'], lanes: ['today'] })
    pickScale('月')
    expect(shownTasks()).toEqual({ labels: ['today', 'week', 'month'], lanes: ['today', 'week', 'month'] })
  })

  it('拖动标签行排序时,不在这一周的任务留在原来的位置', () => {
    const onReorderTasks = vi.fn()
    mountPeriods({ ...periods, tasks: [periods.tasks[0]!, periods.tasks[3]!, periods.tasks[1]!] }, onReorderTasks)
    /** Fires a drag event carrying the dataTransfer and clientY that useDragReorder reads. */
    const drag = (type: string, target: Element, clientY = 0) => act(() => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        dataTransfer: { value: { effectAllowed: '', setData: vi.fn() } },
        clientY: { value: clientY },
      })
      target.dispatchEvent(event)
    })
    const row = (id: string) => host.querySelector(`.glrow[data-task="${id}"]`)!
    drag('dragstart', row('week'))
    // jsdom gives every row a zero-height box, so any negative clientY lands in its top half.
    drag('dragover', row('today'), -1)
    drag('drop', row('today'))
    expect(onReorderTasks).toHaveBeenCalledWith('proj-2', ['week', 'before', 'today'])
  })
})
