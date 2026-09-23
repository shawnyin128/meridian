// @vitest-environment jsdom
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Milestone, Task } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectPlan, ProjectTaskPanel } from './ProjectPlan.js'

const task: Task = {
  id: 'task-1', title: '校准批次', start: '2026-09-16', end: '2026-09-16',
  window: { start: '08:00', end: '10:00' }, priority: 'p1', state: 'act',
}
const rangeTask: Task = {
  id: 'task-2', title: '跨天联调', start: '2026-09-16', end: '2026-09-20',
  priority: 'p2', state: 'plan',
}
const milestone: Milestone = {
  id: 'milestone-1', date: '2026-09-20', title: '完成首轮校准', done: false,
}
const doneTask: Task = {
  id: 'task-3', title: '已完成的任务', start: '2026-09-01', end: '2026-09-02', priority: 'p2', state: 'done',
}
const doneMilestone: Milestone = {
  id: 'milestone-2', date: '2026-09-05', title: '已完成的里程碑', done: true,
}

function renderPlan(tab: 'task' | 'ms', options: {
  tasks?: Task[]
  milestones?: Milestone[]
  flashId?: string | null
} = {}) {
  const { tasks = [task], milestones = [milestone], flashId = null } = options
  return renderToStaticMarkup(
    <MessagesProvider>
      <ProjectPlan
        project={{ tasks, milestones }} tab={tab} today="2026-09-16"
        creating={null} flashId={flashId} selectedTaskId={null}
        listRef={createRef()} addRef={createRef()} timelineAddRef={createRef()} milestoneLaneRef={createRef()}
        onTab={vi.fn()} onDiscardOpenEdits={vi.fn()} onStartTask={vi.fn()} onStartMilestone={vi.fn()}
        onCancelCreate={vi.fn()} onCreateTask={vi.fn()} onCreateMilestone={vi.fn()}
        onUpdateTask={vi.fn()} onDeleteTask={vi.fn()} onReorderTasks={vi.fn()} onOpenTask={vi.fn()}
        onUpdateMilestone={vi.fn()}
        onDeleteMilestone={vi.fn()} onHoverMilestone={vi.fn()}
      />
    </MessagesProvider>,
  )
}

describe('ProjectPlan', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('任务模式把日期和时间保留为两个独立编辑入口', () => {
    const output = renderPlan('task')
    expect(output).toContain('structured-list--embedded')
    expect(output).toContain('title="修改日期"')
    expect(output).toContain('title="修改时间"')
    expect(output).toContain('9月16日')
    expect(output).toContain('08:00–10:00')
    expect(output).toContain('校准批次')
    expect(output).not.toContain('完成首轮校准')
  })

  it('任务行可以拖拽排序', () => {
    const output = renderPlan('task')
    expect(output).toContain('data-row="task-1" draggable="true"')
  })

  it('单日和跨天任务的日期栏共用同一个网格列,不再包在同一个容器里', () => {
    const output = renderPlan('task', { tasks: [task, rangeTask] })
    expect(output).not.toContain('task-time-cell')
    expect(output).toContain('9月16日')
    expect(output).toContain('9月16日–9月20日')
    expect(output).toContain('class="schedule-trigger task-date-part"')
    expect(output).toContain('class="schedule-trigger task-clock-part"')
  })

  it('里程碑模式复用同一列表外壳并只显示里程碑字段', () => {
    const output = renderPlan('ms')
    expect(output).toContain('structured-list--embedded')
    expect(output).toContain('完成首轮校准')
    expect(output).toContain('9月20日')
    expect(output).toContain('未完成')
    expect(output).not.toContain('校准批次')
  })

  it('已完成的任务默认折叠进已归档分组,活动列表里看不到它', () => {
    const output = renderPlan('task', { tasks: [task, doneTask] })
    expect(output).toContain('校准批次')
    expect(output).not.toContain('已完成的任务')
    expect(output).toContain('已归档')
  })

  it('flashId 指向已归档任务时,归档分组自动展开显示它', () => {
    const output = renderPlan('task', { tasks: [task, doneTask], flashId: doneTask.id })
    expect(output).toContain('已完成的任务')
  })

  it('归档任务不参与拖拽排序', () => {
    const output = renderPlan('task', { tasks: [task, doneTask], flashId: doneTask.id })
    expect(output).toContain('data-row="task-1" draggable="true"')
    expect(output).not.toContain('data-row="task-3" draggable="true"')
  })

  it('已完成的里程碑默认折叠进已归档分组,展开后可见', () => {
    const closed = renderPlan('ms', { milestones: [milestone, doneMilestone] })
    expect(closed).toContain('完成首轮校准')
    expect(closed).not.toContain('已完成的里程碑')
    expect(closed).toContain('已归档')

    const open = renderPlan('ms', { milestones: [milestone, doneMilestone], flashId: doneMilestone.id })
    expect(open).toContain('已完成的里程碑')
  })

  it('任务行整行可点开任务详情,不止是拖拽把手', () => {
    const output = renderPlan('task')
    expect(output).toContain('title="打开任务"')
  })
})

function renderTaskPanel(
  taskOverrides: Partial<Task> = {}, node?: { id: string; label: string; mode: 'supported' },
) {
  return renderToStaticMarkup(
    <MessagesProvider>
      <ProjectTaskPanel
        task={{ ...task, ...taskOverrides }} node={node} onClose={vi.fn()} onSaveNote={vi.fn()} onOpenNode={vi.fn()}
      />
    </MessagesProvider>,
  )
}

describe('ProjectTaskPanel', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('展示任务标题、日期、优先级与状态', () => {
    const output = renderTaskPanel()
    expect(output).toContain('校准批次')
    expect(output).toContain('9月16日')
    expect(output).toContain('P1')
    expect(output).toContain('进行中')
  })

  it('没有备注时显示空状态提示,而不是空白', () => {
    const output = renderTaskPanel({ note: undefined })
    expect(output).toContain('还没有备注')
  })

  it('显示任务挂在哪个科研节点上;还没挂时说明 agent 做它时会挂上', () => {
    const linked = renderTaskPanel({}, { id: 'kv.n3', label: '前缀共调度', mode: 'supported' })
    expect(linked).toContain('科研节点')
    expect(linked).toMatch(/<button[^>]*class="node-tag node-tag--supported"[^>]*title="在科研图中打开「前缀共调度」"/)
    expect(renderTaskPanel()).toContain('还没挂到科研节点上')
  })

  it('agent 加的任务在面板和列表里都带一个安静的 agent 标记,用户加的没有', () => {
    expect(renderTaskPanel({ origin: 'agent' })).toContain('<span class="agtag">agent</span>')
    expect(renderTaskPanel()).not.toContain('agtag')
    expect(renderPlan('task', { tasks: [{ ...task, origin: 'agent' }] })).toContain('<span class="agtag">agent</span>')
    expect(renderPlan('task')).not.toContain('agtag')
  })

  it('有备注时渲染备注正文', () => {
    const output = renderTaskPanel({ note: '先跑 A/B 两组,再看结论' })
    expect(output).toContain('先跑 A/B 两组')
    expect(output).not.toContain('还没有备注')
  })
})
