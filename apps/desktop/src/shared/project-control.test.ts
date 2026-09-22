import { describe, expect, it } from 'vitest'
import type { Task } from './contract.js'
import { projectControlState } from './project-control.js'

const task = (over: Partial<Task>): Task => ({
  id: 'task', title: '任务', start: '2026-09-16', end: '2026-09-16',
  state: 'plan', priority: 'p1', ...over,
})

describe('projectControlState', () => {
  it('进行中的高优先级任务是下一步，不把更宽泛的项目目标冒充动作', () => {
    expect(projectControlState({
      tasks: [
        task({ id: 'p1', title: '普通任务', state: 'act' }),
        task({ id: 'p0', title: '立即跑校准', state: 'act', priority: 'p0' }),
        task({ id: 'later', title: '之后整理', state: 'plan' }),
      ],
    }).next).toMatchObject({ source: 'task', text: '立即跑校准', task: { id: 'p0' } })
  })

  it('没有进行中任务时依次使用科研节点 Next Action、计划任务和缺失提示', () => {
    expect(projectControlState({
      tasks: [task({ id: 'later', title: '之后整理' })],
      activePath: [{ id: 'node', label: '动态阈值', nextAction: '运行阈值矩阵' }],
    }).next).toEqual({
      source: 'research', text: '运行阈值矩阵',
      node: { id: 'node', label: '动态阈值' },
    })
    expect(projectControlState({ tasks: [task({ title: '之后整理' })] }).next)
      .toMatchObject({ source: 'task', text: '之后整理' })
    expect(projectControlState({ tasks: [] }).next)
      .toEqual({ source: 'missing', text: '需要定义任务' })
  })

  it('只投影显示下一步所需的任务字段，不把任务标题复制两份', () => {
    expect(projectControlState({
      tasks: [task({ title: '执行实验', state: 'act', window: { start: '08:00', end: '10:00' } })],
    }).next).toEqual({
      source: 'task', text: '执行实验',
      task: {
        id: 'task', state: 'act', priority: 'p1', start: '2026-09-16', end: '2026-09-16',
        window: { start: '08:00', end: '10:00' },
      },
    })
  })

  it('阻塞保留明确的人工来源，空白不算阻塞', () => {
    expect(projectControlState({ tasks: [], block: ' 等 A100 机时 ' }).blocker)
      .toEqual({ source: 'manual', text: '等 A100 机时' })
    expect(projectControlState({ tasks: [], block: ' ' }).blocker).toBeUndefined()
  })
})
