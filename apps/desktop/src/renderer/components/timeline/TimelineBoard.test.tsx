// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { TodayContext, useToday } from '../../shell/AppShell.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ToolbarButton } from '../Toolbar.js'
import { TOOLTIP_DELAY } from '../Tooltip.js'
import { TimelineBoard, type TimelineProject } from './TimelineBoard.js'
import { useTimelinePeriod } from './TimelineScale.js'

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

/** The board with the period its screen would hold. */
function Board(props: Omit<ComponentProps<typeof TimelineBoard>, 'period'>) {
  return <TimelineBoard {...props} period={useTimelinePeriod(useToday())} />
}

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
        <Board
          projects={[project]}
          onTaskClick={vi.fn()} onMilestoneClick={vi.fn()} onMilestoneLaneClick={vi.fn()}
          onMoveTask={vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
          {...(onReorderTasks ? { onReorderTasks } : {})}
        />
      </TodayContext.Provider>
    </MessagesProvider>,
  )
}

/** Mounts an interactive TimelineBoard into `host` so real mouse events reach its handlers; returns its root. */
function mountBoard(host: HTMLDivElement, overrides: {
  onTaskClick?: (projectId: string, taskId: string) => void
  onTaskLabelClick?: (projectId: string, taskId: string) => void
  onProjectLabelClick?: (projectId: string) => void
  onMilestoneLaneClick?: (projectId: string, date: string, point: { left: number; top: number }) => void
  onMoveTask?: (projectId: string, taskId: string, start: string, end: string, days: number) => void
}): Root {
  const root = createRoot(host)
  act(() => root.render(
    <MessagesProvider>
      <TodayContext.Provider value="2026-09-16">
        <Board
          projects={[project]}
          onTaskClick={overrides.onTaskClick ?? vi.fn()}
          {...(overrides.onTaskLabelClick === undefined ? {} : { onTaskLabelClick: overrides.onTaskLabelClick })}
          {...(overrides.onProjectLabelClick === undefined ? {} : { onProjectLabelClick: overrides.onProjectLabelClick })}
          onMilestoneClick={vi.fn()} onMilestoneLaneClick={overrides.onMilestoneLaneClick ?? vi.fn()}
          onMoveTask={overrides.onMoveTask ?? vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
        />
      </TodayContext.Provider>
    </MessagesProvider>,
  ))
  return root
}

/** Dispatches a real mouse event so it reaches both React's synthetic handlers and useGanttDrag's own document-level listeners. */
function mouse(target: EventTarget, type: string, clientX = 0): void {
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX })) })
}

describe('TimelineBoard 的头部', () => {
  it('上一个、下一个周期、今天和头部的操作是一个 Tab 停靠点，时间尺度自己是一个', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider>
        <TodayContext.Provider value="2026-09-16">
          <Board
            projects={[project]} headerAction={<ToolbarButton className="btn">新建</ToolbarButton>}
            onTaskClick={vi.fn()} onMilestoneClick={vi.fn()} onMilestoneLaneClick={vi.fn()}
            onMoveTask={vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
          />
        </TodayContext.Provider>
      </MessagesProvider>,
    ))
    const head = host.querySelector<HTMLElement>('.ghead')!
    const scale = head.querySelector<HTMLElement>('.segmented-control')!
    expect([head, ...head.querySelectorAll<HTMLElement>('*')].filter((element) => element.tabIndex === 0)).toEqual([head, scale])
    await act(async () => { head.focus() })
    const walked: (string | null)[] = []
    for (let step = 0; step < 3; step += 1) {
      walked.push(document.activeElement!.getAttribute('aria-label') ?? document.activeElement!.textContent)
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
        await new Promise((done) => setTimeout(done, 0))
      })
    }
    expect(walked).toEqual(['上一个周期', '下一个周期', '今天'])
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
      await new Promise((done) => setTimeout(done, 0))
    })
    expect(document.activeElement!.textContent).toBe('新建')
    act(() => root.unmount())
    host.remove()
  })

  it('头部的控件同一个高度：时间尺度用小号轨道，和周期箭头、今天一样是嵌套那一档', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const head = document.createElement('div')
    head.innerHTML = renderBoard()
    const scale = head.querySelector('.ghead .segmented-control')!
    const buttons = [...head.querySelectorAll('.ghead button')].filter((button) => !scale.contains(button))
    expect(scale.classList.contains('segmented-control--sm')).toBe(true)
    expect(buttons.map((button) => [button.getAttribute('aria-label') ?? button.textContent, button.classList.contains('sm')]))
      .toEqual([['上一个周期', true], ['下一个周期', true], ['今天', true]])
  })
})

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

  it('拖动中的任务条带 dragging 类,拖动时按 Esc 条回到原处,松手既不改日期也不算点击', () => {
    const onTaskClick = vi.fn()
    const onMoveTask = vi.fn()
    mountBoard(host, { onTaskClick, onMoveTask })
    const bar = () => host.querySelector<HTMLElement>('.gbar[data-task="t1"]')!
    const left = bar().style.left
    mouse(bar(), 'mousedown', 100)
    mouse(document, 'mousemove', 100 + 200)
    expect(bar().classList.contains('dragging')).toBe(true)
    expect(bar().style.left).not.toBe(left)
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => { document.body.dispatchEvent(escape) })
    expect(escape.defaultPrevented).toBe(true)
    expect(bar().classList.contains('dragging')).toBe(false)
    expect(bar().style.left).toBe(left)
    mouse(document, 'mousemove', 100 + 300)
    mouse(document, 'mouseup', 100 + 300)
    expect(bar().style.left).toBe(left)
    expect(onMoveTask).not.toHaveBeenCalled()
    expect(onTaskClick).not.toHaveBeenCalled()
  })

  it('点击任务的标签行打开任务，点击里程碑那一行的标签打开项目', () => {
    const onTaskLabelClick = vi.fn()
    const onProjectLabelClick = vi.fn()
    mountBoard(host, { onTaskLabelClick, onProjectLabelClick })
    mouse(host.querySelector('.glrow.timeline-label-row[data-task="t1"]')!, 'click')
    expect(onTaskLabelClick).toHaveBeenCalledWith('proj-1', 't1')
    mouse(host.querySelector('.glrow.msl.timeline-label-row')!, 'click')
    expect(onProjectLabelClick).toHaveBeenCalledWith('proj-1')
  })
})

describe('TimelineBoard 的键盘', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
  })

  /** Presses `key` on the focused element; Radix moves the roving focus on the next task. */
  const press = async (key: string) => {
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      await new Promise((done) => setTimeout(done, 0))
    })
  }

  it('标签列和画布各是一个 Tab 停靠点，上下键在行之间走：能打开东西的标签、里程碑那一行、任务条和边缘标记', async () => {
    const root = mountBoard(host, { onTaskLabelClick: vi.fn() })
    const labels = host.querySelector<HTMLElement>('.glabels')!
    const canvas = host.querySelector<HTMLElement>('.gcanvas')!
    expect([...host.querySelectorAll<HTMLElement>('.gsplit, .gsplit *')].filter((element) => element.tabIndex === 0))
      .toEqual([labels, canvas])

    await act(async () => { labels.focus() })
    expect(document.activeElement!.closest('.glrow')!.getAttribute('data-task')).toBe('t1')
    await press('ArrowDown')
    expect(document.activeElement!.closest('.glrow')!.getAttribute('data-task')).toBe('t2')

    await act(async () => { canvas.focus() })
    const walked: string[] = []
    for (let step = 0; step < 4; step += 1) {
      walked.push(document.activeElement!.className.split(' ')[0]!)
      await press('ArrowDown')
    }
    expect(walked).toEqual(['glane-new', 'gbar', 'gstub', 'gbar'])
    act(() => root.unmount())
  })

  it('任务的标签、任务条和边缘标记是按钮：Enter 或空格打开任务，鼠标点一下任务条只打开一次', () => {
    const onTaskClick = vi.fn()
    const onTaskLabelClick = vi.fn()
    mountBoard(host, { onTaskClick, onTaskLabelClick })
    const label = host.querySelector<HTMLButtonElement>('.glrow[data-task="t1"] .timeline-label-open')!
    const bar = host.querySelector<HTMLButtonElement>('.gbar[data-task="t1"]')!
    // jsdom measures the canvas viewport as 0px wide, so every bar also has its edge stub.
    const stub = host.querySelector<HTMLButtonElement>('.grow[data-task="t1"] .gstub')!
    expect([label.tagName, bar.tagName, stub.tagName]).toEqual(['BUTTON', 'BUTTON', 'BUTTON'])
    act(() => label.click())
    expect(onTaskLabelClick).toHaveBeenCalledWith('proj-1', 't1')
    act(() => bar.click())
    act(() => stub.click())
    expect(onTaskClick.mock.calls).toEqual([['proj-1', 't1'], ['proj-1', 't1']])
    onTaskClick.mockClear()

    mouse(bar, 'mousedown', 100)
    mouse(document, 'mouseup', 100)
    mouse(bar, 'click', 100)
    expect(onTaskClick.mock.calls).toEqual([['proj-1', 't1']])
  })

  it('里程碑那一行的键盘按钮落在今天这一格，按下在今天新建里程碑，不再按位置另建一个', () => {
    const onMilestoneLaneClick = vi.fn()
    mountBoard(host, { onMilestoneLaneClick })
    const lane = host.querySelector<HTMLButtonElement>('.msrow .glane-new')!
    expect(lane.getAttribute('aria-label')).toBe('添加里程碑 · 9月16日')
    act(() => lane.click())
    expect(onMilestoneLaneClick.mock.calls.map(([projectId, date]) => [projectId, date])).toEqual([['proj-1', '2026-09-16']])
  })

  it('不打开东西的标签不是按钮', () => {
    mountBoard(host, {})
    expect(host.querySelector('.timeline-label-open')).toBeNull()
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
          <Board
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

describe('TimelineBoard 的提示', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  it('任务条的 tooltip 说出这项任务，不再教人拖动或点击；里程碑那一行不带说明', () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.append(host)
    const withMilestone = { ...project, milestones: [{ id: 'm1', date: '2026-09-17', title: '阶段汇报', done: false }] }
    act(() => createRoot(host).render(
      <MessagesProvider>
        <TodayContext.Provider value="2026-09-16">
          <Board
            projects={[withMilestone]}
            onTaskClick={vi.fn()} onMilestoneClick={vi.fn()} onMilestoneLaneClick={vi.fn()}
            onMoveTask={vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
          />
        </TodayContext.Provider>
      </MessagesProvider>,
    ))
    const tip = (selector: string) => {
      const target = host.querySelector(selector)!
      act(() => { target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
      act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
      const text = document.querySelector('[role="tooltip"]')?.textContent
      act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
      return text
    }
    expect([tip('.gbar[data-task="t1"]'), tip('.gddl')]).toEqual(['第一个任务 · 9月16日 – 9月18日 · P1', '9月17日 阶段汇报'])
    expect(host.querySelectorAll('[title]')).toHaveLength(0)
    vi.useRealTimers()
  })
})

describe('TimelineBoard 在总览上标出项目', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  it('项目名只在它的里程碑那一行写一次，占满标签列，放不下才淡出；任务行不再重复项目标签', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const projects: TimelineProject[] = [
      { id: 'joint', name: '推测解码和 KV 量化联合优化', tasks: [task('a', '联合实验')], milestones: [] },
      { id: 'spec', name: '推测解码加速', tasks: [task('b', '实现动态树宽度')], milestones: [] },
    ]
    act(() => createRoot(host).render(
      <MessagesProvider>
        <TodayContext.Provider value="2026-09-16">
          <Board
            projects={projects} showProjectNames foldable onProjectLabelClick={vi.fn()} onTaskLabelClick={vi.fn()}
            onTaskClick={vi.fn()} onMilestoneClick={vi.fn()} onMilestoneLaneClick={vi.fn()}
            onMoveTask={vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
          />
        </TodayContext.Provider>
      </MessagesProvider>,
    ))
    const lanes = [...host.querySelectorAll('.glrow.msl .timeline-item-label')]
    expect(lanes.map((label) => label.textContent)).toEqual(['推测解码和 KV 量化联合优化', '推测解码加速'])
    expect(lanes.every((label) => label.matches('.fade-text'))).toBe(true)
    expect(host.querySelectorAll('.glrow .project-label')).toHaveLength(0)
  })

  it('项目的折叠钮是共享的折叠钮，排在项目名前面；收起时箭头转向、任务行收走，点它不打开项目', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const onProjectLabelClick = vi.fn()
    act(() => createRoot(host).render(
      <MessagesProvider>
        <TodayContext.Provider value="2026-09-16">
          <Board
            projects={[project]} showProjectNames foldable onProjectLabelClick={onProjectLabelClick} onTaskLabelClick={vi.fn()}
            onTaskClick={vi.fn()} onMilestoneClick={vi.fn()} onMilestoneLaneClick={vi.fn()}
            onMoveTask={vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
          />
        </TodayContext.Provider>
      </MessagesProvider>,
    ))
    const lane = host.querySelector('.glrow.msl')!
    const fold = lane.querySelector<HTMLButtonElement>('.fold-toggle')!
    expect(fold.compareDocumentPosition(lane.querySelector('.timeline-item-label')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect([fold.getAttribute('aria-expanded'), fold.querySelector('.fold-caret')!.classList.contains('is-closed')]).toEqual(['true', false])
    act(() => fold.click())
    expect([fold.getAttribute('aria-expanded'), fold.querySelector('.fold-caret')!.classList.contains('is-closed')]).toEqual(['false', true])
    expect(host.querySelectorAll('.timeline-label-row[data-task]')).toHaveLength(0)
    expect(onProjectLabelClick).not.toHaveBeenCalled()
  })
})

describe('TimelineBoard 的一天任务条', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    // jsdom lays nothing out: the three-day bar's title is 90px wide and every other title 60px, and the
    // room for a title is its bar's width less the 10px padding on each side.
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('gbar-label')) return 0
      return this.textContent === '三天的任务' ? 90 : 60
    })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('gbar-label') ? Number.parseFloat(this.parentElement!.style.width) - 20 : 0
    })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('月视图里比标题还窄的一天任务条把整句标题画在条旁边，几天长的条和放得下的条照旧把标题画在条里', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const days: TimelineProject = {
      id: 'proj-3', name: '一天项目', milestones: [],
      tasks: [
        { id: 'one', title: '汇总今天的宽度扫描结果', start: '2026-09-16', end: '2026-09-16', state: 'act', priority: 'p1' },
        { id: 'three', title: '三天的任务', start: '2026-09-21', end: '2026-09-23', state: 'act', priority: 'p1' },
      ],
    }
    act(() => createRoot(host).render(
      <MessagesProvider>
        <TodayContext.Provider value="2026-09-16">
          <Board
            projects={[days]}
            onTaskClick={vi.fn()} onMilestoneClick={vi.fn()} onMilestoneLaneClick={vi.fn()}
            onMoveTask={vi.fn()} onMoveTaskWindow={vi.fn()} onMoveMilestone={vi.fn()}
          />
        </TodayContext.Provider>
      </MessagesProvider>,
    ))
    const beside = () => [...host.querySelectorAll<HTMLElement>('.gbar-aside')]
      .map((label) => [label.closest<HTMLElement>('.grow')!.dataset.task, label.textContent])
    expect(beside(), '周视图里一天的条放得下标题').toEqual([])
    const month = [...host.querySelectorAll<HTMLButtonElement>('.ghead .segmented-control>button')].find((b) => b.textContent === '月')!
    act(() => { month.click() })
    expect(beside()).toEqual([['one', '汇总今天的宽度扫描结果']])
  })
})
