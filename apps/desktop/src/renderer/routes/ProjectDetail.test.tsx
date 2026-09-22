// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type {
  Milestone, ProjectDetail, ResearchGraph, ResearchIdea,
} from '../../shared/contract.js'
import {
  idleNote, projectDecisionItems as attnItems, projectPulseSignal,
} from '../../shared/project-signals.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { zh } from '../messages/zh/index.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ProjectIdeaPanel } from './ProjectDetail.js'

const sm = zh.project.signals

const withMessages = (node: ReactNode) => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  return <MessagesProvider>{node}</MessagesProvider>
}

/** This set of use cases uses this day as today in the library, and the following dates are counted according to it. */
const TODAY = '2026-08-25'

const project = (over: Partial<ProjectDetail>): ProjectDetail => ({
  id: 'draft',
  name: 'draft 效率',
  status: '进行中',
  priority: 'p0',
  topic: 'speculative decoding',
  focus: '宽树实验补 B≥8',
  start: '2026-06-02',
  due: '2026-09-15',
  memo: '',
  conclusions: { verified: 1, pending: 0, conflicting: 0 },
  conclusionList: [],
  paperCount: 4,
  papers: ['p1', 'p2', 'p3', 'p4'],
  paperTitles: { p1: 'A', p2: 'B', p3: 'C', p4: 'D' },
  tasks: [],
  milestones: [],
  events: [],
  relations: [],
  attachments: [],
  graph: { nodes: [], edges: [] },
  agentSessions: [],
  ...over,
})

const milestone = (date: string): Milestone =>
  ({ id: `m${date}`, date, title: '宽树实验补 B≥8', done: false })

describe('attnItems', () => {
  it('三条依次是冲突、临近里程碑、停滞', () => {
    expect(attnItems(project({
      conclusions: { verified: 1, pending: 0, conflicting: 2 },
      milestones: [milestone('2026-08-28')],
      events: [{ date: '2026-08-17', text: '结论冲突:改写为条件式' }],
    }), TODAY, sm)).toEqual([
      {
        id: 'conflict', rank: 0, kind: '结论冲突', tone: 'bad',
        reason: '2 条证据结论互相冲突', action: '检查证据并裁决',
      },
      {
        id: 'milestone-m2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8', action: '确认交付准备',
      },
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'mut',
        reason: '已 8 天没有科研记录', action: '确认继续、搁置或调整方向',
      },
    ])
  })

  it('阻塞按统一优先级排在临近里程碑和停滞之前', () => {
    expect(attnItems(project({
      block: '等 A100 机时(周四释放)',
      milestones: [milestone('2026-08-28')],
      events: [{ date: '2026-08-17', text: '评测脚本跑通 MT-bench 子集' }],
    }), TODAY, sm)).toEqual([
      {
        id: 'block', rank: 1, kind: '阻塞', tone: 'bad',
        reason: '等 A100 机时(周四释放)', action: '确认如何解除阻塞',
      },
      {
        id: 'milestone-m2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8', action: '确认交付准备',
      },
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'mut',
        reason: '已 8 天没有科研记录', action: '确认继续、搁置或调整方向',
      },
    ])
  })

  it('不是进行中的项目一条都不报', () => {
    const noisy = {
      conclusions: { verified: 1, pending: 0, conflicting: 2 },
      milestones: [milestone('2026-08-28')],
      events: [{ date: '2026-08-17', text: '结论冲突:改写为条件式' }],
    }
    expect(attnItems(project({ ...noisy, status: '搁置' }), TODAY, sm)).toEqual([])
    expect(attnItems(project({ ...noisy, status: '已完成' }), TODAY, sm)).toEqual([])
  })

  it('任务逾期按日期聚类，并与其他逾期使用相同的严重级别和操作', () => {
    const items = attnItems(project({
      tasks: [
        {
          id: 'late-a', title: '过期任务 A', start: '2026-08-19', end: '2026-08-23',
          state: 'act', priority: 'p1',
        },
        {
          id: 'late-b', title: '过期任务 B', start: '2026-08-20', end: '2026-08-24',
          state: 'plan', priority: 'p1',
        },
        {
          id: 'late-c', title: '过期任务 C', start: '2026-08-21', end: '2026-08-24',
          state: 'act', priority: 'p2',
        },
      ],
    }), TODAY, sm)
    expect(items).toEqual([
      {
        id: 'overdue-tasks-2026-08-23', rank: 4, kind: '任务逾期', tone: 'bad',
        date: '2026-08-23', reason: '1 条任务已过计划时间', action: '完成或重新排期',
      },
      {
        id: 'overdue-tasks-2026-08-24', rank: 4, kind: '任务逾期', tone: 'bad',
        date: '2026-08-24', reason: '2 条任务已过计划时间', action: '完成或重新排期',
      },
    ])
  })

  it('项目进展沿用决策信号的严重级别，不把逾期降成黄色', () => {
    expect(projectPulseSignal(project({
      milestones: [milestone('2026-08-24')],
    }), TODAY, sm)).toEqual({
      tone: 'risk', label: '里程碑逾期', detail: '宽树实验补 B≥8',
    })
    expect(projectPulseSignal(project({
      tasks: [{
        id: 'late', title: '过期任务', start: '2026-08-20', end: '2026-08-24',
        state: 'act', priority: 'p1',
      }],
    }), TODAY, sm)).toEqual({
      tone: 'risk', label: '任务逾期', detail: '1 条任务已过计划时间',
    })
  })

  it('科研路径异常也在决策队列和项目进展中保持红色严重级别', () => {
    expect(attnItems({
      ...project({}), research: { pathState: 'broken' },
    }, TODAY, sm)[0]).toEqual({
      id: 'path-broken', rank: 2, kind: '科研路径', tone: 'bad',
      reason: '当前 active path 已断裂', action: '让 Agent 校正当前研究路径',
    })
  })

  it('里程碑正好 3 天后要报,4 天后不报', () => {
    expect(attnItems(project({ milestones: [milestone('2026-08-28')] }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8', action: '确认交付准备',
      },
    ])
    expect(attnItems(project({ milestones: [milestone('2026-08-29')] }), TODAY, sm)).toEqual([])
  })

  it('里程碑就在今天时仍只返回统一日期字段,不拼接相对日期', () => {
    expect(attnItems(project({ milestones: [milestone('2026-08-25')] }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-25', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-25', reason: '宽树实验补 B≥8', action: '确认交付准备',
      },
    ])
  })

  it('已经过去的里程碑按统一规则报告逾期，不跳过到未来里程碑', () => {
    expect(attnItems(project({
      milestones: [milestone('2026-08-24'), milestone('2026-08-28')],
    }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-24', rank: 3, kind: '里程碑逾期', tone: 'bad',
        date: '2026-08-24', reason: '宽树实验补 B≥8', action: '完成或重新排期',
      },
    ])
  })

  it('停滞超过 7 天才报,正好 7 天不报', () => {
    expect(attnItems(project({ events: [{ date: '2026-08-17', text: '结论冲突' }] }), TODAY, sm)).toEqual([
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'mut',
        reason: '已 8 天没有科研记录', action: '确认继续、搁置或调整方向',
      },
    ])
    expect(attnItems(project({ events: [{ date: '2026-08-18', text: '结论冲突' }] }), TODAY, sm)).toEqual([])
  })
})

describe('idleNote', () => {
  it('一条科研记录都没有写「尚无推进」,今天有写「今天有推进」,其余写几天前', () => {
    expect(idleNote(null, sm.idle)).toBe('尚无推进')
    expect(idleNote(0, sm.idle)).toBe('今天有推进')
    expect(idleNote(5, sm.idle)).toBe('上次推进 5 天前')
  })
})

describe('project idea panel', () => {
  const idea: ResearchIdea = {
    id: 'idea-1', title: '用动态预算控制校准成本', body: '先做一个最小探针。',
    source: { chatId: 'chat-1', chatTitle: '论文讨论' }, project: 'draft',
    archived: false, created: '2026-09-17', updated: '2026-09-18',
  }
  const graph: ResearchGraph = {
    nodes: [{
      id: 'thread.probe', label: '动态预算探针', state: 'act',
      x: 20, y: 20, width: 180, writebacks: [],
    }],
    edges: [],
  }

  it('keeps workspace node association in place and sends source navigation through Ideas', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onOpenIdea = vi.fn()
    const onLinkNode = vi.fn()
    act(() => root.render(withMessages(
      <ProjectIdeaPanel
        idea={idea} graph={graph} workspaceManaged
        onClose={vi.fn()} onOpenIdea={onOpenIdea} onCreateNode={vi.fn()}
        onLinkNode={onLinkNode} onOpenNode={vi.fn()} onUnlinkNode={vi.fn()}
      />,
    )))

    const buttons = [...host.querySelectorAll('button')]
    const button = (label: string) => buttons.find((candidate) => candidate.textContent === label)
    expect(button('跳转到想法')).toBeDefined()
    expect(button('打开来源对话')).toBeUndefined()
    expect(button('关联已有节点')).toBeDefined()
    expect(button('关联已有节点')!.disabled).toBe(false)
    expect(host.textContent).not.toContain('工作区科研图只读')

    act(() => button('跳转到想法')!.click())
    act(() => button('关联已有节点')!.click())
    expect(onOpenIdea).toHaveBeenCalledOnce()
    expect(onLinkNode).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })

  it('lets a linked workspace idea open, change, or remove its current node', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onOpenNode = vi.fn()
    const onLinkNode = vi.fn()
    const onUnlinkNode = vi.fn()
    act(() => root.render(withMessages(
      <ProjectIdeaPanel
        idea={{ ...idea, node: 'thread.probe' }} graph={graph} workspaceManaged
        onClose={vi.fn()} onOpenIdea={vi.fn()} onCreateNode={vi.fn()}
        onLinkNode={onLinkNode} onOpenNode={onOpenNode} onUnlinkNode={onUnlinkNode}
      />,
    )))

    const buttons = [...host.querySelectorAll('button')]
    const button = (label: string) => buttons.find((candidate) => candidate.textContent === label)!
    expect(button('动态预算探针').disabled).toBe(false)
    const actions = host.querySelector('.project-idea-node-actions')
    expect(actions?.textContent).toBe('更改取消关联')
    expect(actions?.parentElement?.firstElementChild?.textContent).toBe('动态预算探针')
    act(() => button('动态预算探针').click())
    act(() => button('更改').click())
    act(() => button('取消关联').click())
    expect(onOpenNode).toHaveBeenCalledWith('thread.probe')
    expect(onLinkNode).toHaveBeenCalledOnce()
    expect(onUnlinkNode).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })
})
