// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type {
  Milestone, ProjectDetail, ResearchGraph, ResearchIdea,
} from '../../shared/contract.js'
import {
  idleNote, projectDecisionItems as attnItems, projectPulseSignal,
} from '../../shared/project-signals.js'
import { en } from '../messages/en/index.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { zh } from '../messages/zh/index.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ProjectTaskPanel } from '../components/project/ProjectPlan.js'
import { ProjectIdeaPanel, WorkspaceRoot } from './ProjectDetail.js'

const sm = zh.project.signals

const withMessages = (node: ReactNode) => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  return <MessagesProvider>{node}</MessagesProvider>
}

/** These tests use this day as the vault's today; the dates below count from it. */
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
      lastProgress: '2026-08-17',
    }), TODAY, sm)).toEqual([
      {
        id: 'conflict', rank: 0, kind: '结论冲突', tone: 'bad',
        reason: '2 条证据结论互相冲突', action: '检查证据并裁决',
      },
      {
        id: 'milestone-m2026-08-28', milestone: 'm2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8', action: '确认交付准备',
      },
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'mut',
        reason: '已 8 天无推进', action: '确认继续、搁置或调整方向',
      },
    ])
  })

  it('阻塞按统一优先级排在临近里程碑和停滞之前', () => {
    expect(attnItems(project({
      block: '等 A100 机时(周四释放)',
      milestones: [milestone('2026-08-28')],
      lastProgress: '2026-08-17',
    }), TODAY, sm)).toEqual([
      {
        id: 'block', rank: 1, kind: '阻塞', tone: 'warn',
        reason: '等 A100 机时(周四释放)', action: '确认如何解除阻塞',
      },
      {
        id: 'milestone-m2026-08-28', milestone: 'm2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8', action: '确认交付准备',
      },
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'mut',
        reason: '已 8 天无推进', action: '确认继续、搁置或调整方向',
      },
    ])
  })

  it('不是进行中的项目一条都不报', () => {
    const noisy = {
      conclusions: { verified: 1, pending: 0, conflicting: 2 },
      milestones: [milestone('2026-08-28')],
      lastProgress: '2026-08-17',
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
        id: 'overdue-tasks-2026-08-23', task: 'late-a', rank: 4, kind: '任务逾期', tone: 'bad',
        date: '2026-08-23', reason: '1 条任务已过计划时间', action: '完成或重新排期',
      },
      {
        id: 'overdue-tasks-2026-08-24', task: 'late-b', rank: 4, kind: '任务逾期', tone: 'bad',
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
      reason: '当前科研路径已断裂', action: '让 Agent 校正当前科研路径',
    })
  })

  it('里程碑正好 3 天后要报,4 天后不报', () => {
    expect(attnItems(project({ milestones: [milestone('2026-08-28')] }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-28', milestone: 'm2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8', action: '确认交付准备',
      },
    ])
    expect(attnItems(project({ milestones: [milestone('2026-08-29')] }), TODAY, sm)).toEqual([])
  })

  it('里程碑就在今天时仍只返回统一日期字段,不拼接相对日期', () => {
    expect(attnItems(project({ milestones: [milestone('2026-08-25')] }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-25', milestone: 'm2026-08-25', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-25', reason: '宽树实验补 B≥8', action: '确认交付准备',
      },
    ])
  })

  it('已经过去的里程碑按统一规则报告逾期，不跳过到未来里程碑', () => {
    expect(attnItems(project({
      milestones: [milestone('2026-08-24'), milestone('2026-08-28')],
    }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-24', milestone: 'm2026-08-24', rank: 3, kind: '里程碑逾期', tone: 'bad',
        date: '2026-08-24', reason: '宽树实验补 B≥8', action: '完成或重新排期',
      },
    ])
  })

  it('停滞超过 7 天才报,正好 7 天不报', () => {
    expect(attnItems(project({ lastProgress: '2026-08-17' }), TODAY, sm)).toEqual([
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'mut',
        reason: '已 8 天无推进', action: '确认继续、搁置或调整方向',
      },
    ])
    expect(attnItems(project({ lastProgress: '2026-08-18' }), TODAY, sm)).toEqual([])
  })

  it('停滞从最近推进那天算:科研记录停在很久以前,昨天改过任务就不报', () => {
    expect(attnItems(project({
      events: [{ date: '2026-08-01', text: '创建项目' }], lastProgress: '2026-08-24',
    }), TODAY, sm)).toEqual([])
  })
})

describe('idleNote', () => {
  it('一条科研记录都没有写「尚无推进」,今天有写「今天有推进」,其余写几天前', () => {
    expect(idleNote(null, sm.idle)).toBe('尚无推进')
    expect(idleNote(0, sm.idle)).toBe('今天有推进')
    expect(idleNote(5, sm.idle)).toBe('上次推进 5 天前')
  })
})

describe('research record view names', () => {
  it('names the record list view after the records it holds, not after the Feed', () => {
    expect(zh.project.recordModes.activity).toBe('记录')
    expect(en.project.recordModes.activity).toBe('Log')
  })

  it('names the conclusions view 结论', () => {
    expect(zh.project.recordModes.conclusions).toBe('结论')
    expect(en.project.recordModes.conclusions).toBe('Conclusions')
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

  const mount = (panel: ReactNode) => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    document.body.innerHTML = ''
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(withMessages(panel)))
    const button = (label: string) => [...host.querySelectorAll('button')].find((candidate) => candidate.textContent === label)
    /** The texts of the buttons in the actions slot of the heading that starts with `label`. */
    const headingActions = (label: string) => [...host.querySelectorAll<HTMLElement>('.section-heading')]
      .filter((heading) => heading.textContent?.startsWith(label))
      .map((heading) => [...heading.querySelectorAll(':scope > .section-heading-actions > button')].map((b) => b.textContent))
    const pick = (label: string) => {
      act(() => { button(label)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
      return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    }
    return { host, button, headingActions, pick, unmount: () => { act(() => root.unmount()); vi.unstubAllGlobals() } }
  }
  const handlers = () => ({
    onClose: vi.fn(), onOpenIdea: vi.fn(), onCreateNode: vi.fn(), onOpenNode: vi.fn(), onSetNode: vi.fn(),
  })

  it('shows the shared idea panel: the head, the content, the research node, then the source', () => {
    const panel = mount(<ProjectIdeaPanel idea={idea} graph={graph} workspaceManaged {...handlers()} />)
    expect([...panel.host.querySelectorAll('.section-heading--rail')].map((heading) => heading.textContent))
      .toEqual(['用动态预算控制校准成本', '内容', '科研节点关联节点', '来源'])
    expect(panel.host.querySelector('.idea-panel-head .project-idea-open-idea')).not.toBeNull()
    expect(panel.host.textContent).not.toContain('工作区科研图只读')
    panel.unmount()
  })

  it('opens the idea in Ideas from the panel head, beside the close button', () => {
    const on = handlers()
    const panel = mount(<ProjectIdeaPanel idea={idea} graph={graph} workspaceManaged {...on} />)
    const actions = panel.host.querySelector('.node-document-head > .section-heading-actions')!
    // Like the paper detail's read action, opening elsewhere from a panel head is an icon button.
    expect([...actions.querySelectorAll('button')].map((b) => [b.getAttribute('aria-label'), b.className]))
      .toEqual([['打开想法', 'icbtn project-idea-open-idea'], ['收起详情', 'icbtn panel-close']])
    expect(panel.button('打开来源对话')).toBeUndefined()
    act(() => actions.querySelector<HTMLButtonElement>('[aria-label="打开想法"]')!.click())
    expect(on.onOpenIdea).toHaveBeenCalledOnce()
    panel.unmount()
  })

  it('assigns the research node through the same heading control as a task, with the same words', () => {
    const on = handlers()
    const task = mount(
      <ProjectTaskPanel
        task={{ id: 't1', title: '宽树实验', start: '2026-09-16', end: '2026-09-16', priority: 'p1', state: 'act' }}
        node={undefined} nodes={graph.nodes} handSet={false}
        onClose={vi.fn()} onSaveNote={vi.fn()} onOpenNode={vi.fn()} onSetNode={vi.fn()}
      />,
    )
    const taskUnlinked = task.headingActions('科研节点')
    task.unmount()
    const unlinked = mount(<ProjectIdeaPanel idea={idea} graph={graph} workspaceManaged {...on} />)
    expect(unlinked.headingActions('科研节点')).toEqual(taskUnlinked)
    expect(taskUnlinked).toEqual([['关联节点']])
    expect(unlinked.host.textContent).toContain('未关联')
    const items = unlinked.pick('关联节点')
    expect(items.map((item) => item.textContent)).toEqual(['动态预算探针'])
    act(() => items[0]!.click())
    expect(on.onSetNode).toHaveBeenCalledWith('thread.probe')
    unlinked.unmount()

    const own = mount(<ProjectIdeaPanel idea={idea} graph={graph} workspaceManaged={false} {...on} />)
    expect(own.headingActions('科研节点')).toEqual([['转为新节点', '关联节点']])
    act(() => own.button('转为新节点')!.click())
    expect(on.onCreateNode).toHaveBeenCalledOnce()
    own.unmount()
  })

  it('lets a linked idea open, change, or remove its current node from the heading', () => {
    const on = handlers()
    const panel = mount(<ProjectIdeaPanel idea={{ ...idea, node: 'thread.probe' }} graph={graph} workspaceManaged {...on} />)
    expect(panel.headingActions('科研节点')).toEqual([['更改', '取消关联']])
    act(() => panel.host.querySelector<HTMLButtonElement>('.node-assignment .entity-link--node')!.click())
    expect(on.onOpenNode).toHaveBeenCalledWith('thread.probe')
    act(() => panel.button('取消关联')!.click())
    expect(on.onSetNode).toHaveBeenCalledWith(null)
    panel.unmount()
  })
})

describe('the workspace field', () => {
  const field = (state: 'ready' | 'missing' | 'invalid') => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    return renderToStaticMarkup(
      <MessagesProvider><WorkspaceRoot state={state} name="spec-decoding" root="/work/spec-decoding" onOpen={vi.fn()} /></MessagesProvider>,
    )
  }

  it('names a workspace it cannot reach in words beside the red dot, so the state does not rest on colour alone', () => {
    expect(field('missing')).toContain('status-dot--bad" aria-hidden="true"></span><span class="fade-text status-dot-label">未找到</span>')
    expect(field('invalid')).toContain('<span class="fade-text status-dot-label">无效</span>')
  })

  it('keeps a connected workspace quiet: the green dot carries its state as its name and tooltip', () => {
    expect(field('ready')).toContain('class="status-dot status-dot--sm status-dot--good" role="img" aria-label="已连接" data-state="closed"')
    expect(field('ready')).not.toContain('status-dot-label')
  })
})
