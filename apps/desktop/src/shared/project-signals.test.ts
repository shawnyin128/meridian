import { describe, expect, it } from 'vitest'
import { projectSortOrder } from './project-signals.js'

const project = (id: string, priority: 'p0' | 'p1' | 'p2', milestoneDate?: string) => ({
  id, priority, milestones: milestoneDate === undefined ? [] : [{ date: milestoneDate, done: false }],
})

describe('projectSortOrder', () => {
  it('按优先级升序,p0 在前,平局保留原相对顺序', () => {
    const projects = [project('c', 'p2'), project('a', 'p0'), project('b', 'p1'), project('d', 'p0')]
    expect(projectSortOrder(projects, 'priority', '2026-09-21')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('按下一个未完成里程碑的日期升序,没有里程碑的排在最后', () => {
    const projects = [
      project('far', 'p1', '2026-10-01'),
      project('none', 'p0'),
      project('near', 'p2', '2026-09-25'),
    ]
    expect(projectSortOrder(projects, 'milestone', '2026-09-21')).toEqual(['near', 'far', 'none'])
  })

  it('已完成或已过期的里程碑不算数,视同没有里程碑', () => {
    const projects = [
      project('done', 'p0', '2026-09-25'),
      project('live', 'p1', '2026-09-30'),
    ]
    // The "done" project's only milestone is marked done, so it should never win the milestone sort.
    const withDone = [{ ...projects[0]!, milestones: [{ date: '2026-09-25', done: true }] }, projects[1]!]
    expect(projectSortOrder(withDone, 'milestone', '2026-09-21')).toEqual(['live', 'done'])
  })
})
