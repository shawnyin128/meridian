// @vitest-environment jsdom
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Milestone, Task } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectPlan } from './ProjectPlan.js'

const task: Task = {
  id: 'task-1', title: '校准批次', start: '2026-09-16', end: '2026-09-16',
  window: { start: '08:00', end: '10:00' }, priority: 'p1', state: 'act',
}
const milestone: Milestone = {
  id: 'milestone-1', date: '2026-09-20', title: '完成首轮校准', done: false,
}

function renderPlan(tab: 'task' | 'ms') {
  return renderToStaticMarkup(
    <MessagesProvider>
      <ProjectPlan
        project={{ tasks: [task], milestones: [milestone] }} tab={tab} today="2026-09-16"
        creating={null} flashId={null}
        listRef={createRef()} addRef={createRef()} timelineAddRef={createRef()} milestoneLaneRef={createRef()}
        onTab={vi.fn()} onDiscardOpenEdits={vi.fn()} onStartTask={vi.fn()} onStartMilestone={vi.fn()}
        onCancelCreate={vi.fn()} onCreateTask={vi.fn()} onCreateMilestone={vi.fn()}
        onUpdateTask={vi.fn()} onDeleteTask={vi.fn()} onUpdateMilestone={vi.fn()}
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

  it('里程碑模式复用同一列表外壳并只显示里程碑字段', () => {
    const output = renderPlan('ms')
    expect(output).toContain('structured-list--embedded')
    expect(output).toContain('完成首轮校准')
    expect(output).toContain('9月20日')
    expect(output).toContain('未完成')
    expect(output).not.toContain('校准批次')
  })
})
