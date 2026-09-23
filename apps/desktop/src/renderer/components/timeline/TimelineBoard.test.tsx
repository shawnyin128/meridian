// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { TodayContext } from '../../shell/AppShell.js'
import { TimelineBoard, type TimelineProject } from './TimelineBoard.js'

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
