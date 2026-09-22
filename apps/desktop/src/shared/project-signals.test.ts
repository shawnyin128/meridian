import { describe, expect, it } from 'vitest'
import {
  projectSortOrder, recordKind, recordOrigin, sortRecordsNewestFirst,
} from './project-signals.js'

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

const record = (text: string, date: string, extra: { at?: string; kind?: 'note' | 'result' } = {}) =>
  ({ date, text, ...extra })

describe('sortRecordsNewestFirst', () => {
  it('新日期在前,旧日期在后', () => {
    const records = [record('a', '2026-09-10'), record('b', '2026-09-20'), record('c', '2026-09-15')]
    expect(sortRecordsNewestFirst(records).map((r) => r.text)).toEqual(['b', 'c', 'a'])
  })

  it('同一天内按 at 排序,时间晚的在前', () => {
    const records = [
      record('morning', '2026-09-15', { at: '2026-09-15T08:00:00+08:00' }),
      record('evening', '2026-09-15', { at: '2026-09-15T20:00:00+08:00' }),
    ]
    expect(sortRecordsNewestFirst(records).map((r) => r.text)).toEqual(['evening', 'morning'])
  })

  it('同一天且都没有 at 时,写入顺序里靠后的算更新,排在前面', () => {
    const records = [record('first-written', '2026-09-15'), record('second-written', '2026-09-15')]
    expect(sortRecordsNewestFirst(records).map((r) => r.text)).toEqual(['second-written', 'first-written'])
  })
})

describe('recordKind / recordOrigin', () => {
  it('没有 kind 的记录按 note 处理,没有 origin 的按 user 处理', () => {
    expect(recordKind({})).toBe('note')
    expect(recordOrigin({})).toBe('user')
  })

  it('有 kind/origin 时按记录本身的值处理', () => {
    expect(recordKind({ kind: 'result' })).toBe('result')
    expect(recordOrigin({ origin: 'agent' })).toBe('agent')
  })
})
