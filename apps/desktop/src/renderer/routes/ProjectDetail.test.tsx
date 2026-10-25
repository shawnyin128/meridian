// @vitest-environment jsdom
import { act, Profiler, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { ProjectDetail as ProjectScreen, ProjectIdeaList, ProjectIdeaPanel, WorkspaceRoot } from './ProjectDetail.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Whether the project's screen is the one shown, and the shell around the project page. */
const shell = vi.hoisted(() => ({ shown: true }))
vi.mock('../shell/AppShell.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shell/AppShell.js')>(),
  useCrumbTail: () => {},
  useEscapeLayer: () => {},
  useJump: () => ({ jump: null, open: () => {}, returnTo: () => {}, enter: () => {} }),
  useNotice: () => ({ success: () => {}, refusal: () => {} }),
  useScreenShown: () => shell.shown,
  useToday: () => '2026-08-25',
  useVaultRevision: () => ({ revision: 0, bump: () => {} }),
}))

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
        id: 'conflict', rank: 0, kind: '实验结论冲突', tone: 'bad',
        reason: '2 条实验结论有冲突',
      },
      {
        id: 'milestone-m2026-08-28', milestone: 'm2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8',
      },
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'warn',
        reason: '已 8 天无推进',
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
        reason: '等 A100 机时(周四释放)',
      },
      {
        id: 'milestone-m2026-08-28', milestone: 'm2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8',
      },
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'warn',
        reason: '已 8 天无推进',
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
        date: '2026-08-23', reason: '1 条任务已过计划时间',
      },
      {
        id: 'overdue-tasks-2026-08-24', task: 'late-b', rank: 4, kind: '任务逾期', tone: 'bad',
        date: '2026-08-24', reason: '2 条任务已过计划时间',
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
      reason: '已断裂',
    })
  })

  it('里程碑正好 3 天后要报,4 天后不报', () => {
    expect(attnItems(project({ milestones: [milestone('2026-08-28')] }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-28', milestone: 'm2026-08-28', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-28', reason: '宽树实验补 B≥8',
      },
    ])
    expect(attnItems(project({ milestones: [milestone('2026-08-29')] }), TODAY, sm)).toEqual([])
  })

  it('里程碑就在今天时仍只返回统一日期字段,不拼接相对日期', () => {
    expect(attnItems(project({ milestones: [milestone('2026-08-25')] }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-25', milestone: 'm2026-08-25', rank: 5, kind: '临近里程碑', tone: 'warn',
        date: '2026-08-25', reason: '宽树实验补 B≥8',
      },
    ])
  })

  it('已经过去的里程碑按统一规则报告逾期，不跳过到未来里程碑', () => {
    expect(attnItems(project({
      milestones: [milestone('2026-08-24'), milestone('2026-08-28')],
    }), TODAY, sm)).toEqual([
      {
        id: 'milestone-m2026-08-24', milestone: 'm2026-08-24', rank: 3, kind: '里程碑逾期', tone: 'bad',
        date: '2026-08-24', reason: '宽树实验补 B≥8',
      },
    ])
  })

  it('停滞超过 7 天才报,正好 7 天不报', () => {
    expect(attnItems(project({ lastProgress: '2026-08-17' }), TODAY, sm)).toEqual([
      {
        id: 'stale', rank: 6, kind: '推进停滞', tone: 'warn',
        reason: '已 8 天无推进',
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

  it('names the conclusions view 实验结论', () => {
    expect(zh.project.recordModes.conclusions).toBe('实验结论')
    expect(en.project.recordModes.conclusions).toBe('Experiment conclusions')
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
    vi.stubGlobal('meridian', { platform: 'darwin' })
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
    return {
      host, button, headingActions, pick,
      rerender: (next: ReactNode) => act(() => root.render(withMessages(next))),
      unmount: () => { act(() => root.unmount()); vi.unstubAllGlobals() },
    }
  }
  const handlers = () => ({
    onClose: vi.fn(), onOpenIdea: vi.fn(), onOpenPaper: vi.fn(), onOpenNode: vi.fn(), onSetNode: vi.fn(),
    onCreateNode: vi.fn<(label: string, after: string | null) => Promise<boolean>>(() => Promise.resolve(true)),
  })
  const press = (target: Element, key: string) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })

  it('opens the paper the idea came from through its name in the source', () => {
    const on = handlers()
    const panel = mount(
      <ProjectIdeaPanel idea={{ ...idea, source: { ...idea.source, paperId: 'p1', paperTitle: 'EAGLE-2' } }} graph={graph} workspaceManaged {...on} />,
    )
    act(() => panel.host.querySelector<HTMLElement>('.idea-panel-source .entity-link')!.click())
    expect(on.onOpenPaper).toHaveBeenCalledWith('p1')
    panel.unmount()
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
        projectId="p1" task={{ id: 't1', title: '宽树实验', start: '2026-09-16', end: '2026-09-16', priority: 'p1', state: 'act' }}
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
    own.unmount()
  })

  it('转为新节点在科研节点区里、关联的节点将出现的地方就地打开节点草稿,不弹对话框;标题先是想法的标题,回车才建节点', async () => {
    const on = handlers()
    const panel = mount(<ProjectIdeaPanel idea={idea} graph={graph} workspaceManaged={false} {...on} />)
    act(() => panel.button('转为新节点')!.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    const heading = [...panel.host.querySelectorAll('.section-heading')].find((h) => h.textContent?.startsWith('科研节点'))!
    const draft = panel.host.querySelector<HTMLElement>('.draft-form')!
    expect(heading.nextElementSibling!.contains(draft)).toBe(true)
    expect(panel.host.textContent).not.toContain('未关联')
    const label = draft.querySelector('input')!
    expect([label.value, document.activeElement]).toEqual(['用动态预算控制校准成本', label])
    expect(on.onCreateNode).not.toHaveBeenCalled()
    await act(async () => { press(label, 'Enter'); await Promise.resolve() })
    expect(on.onCreateNode).toHaveBeenCalledWith('用动态预算控制校准成本', null)
    expect(panel.host.querySelector('.draft-form')).toBeNull()
    panel.unmount()
  })

  it('节点草稿里选它接在哪个节点后,保存时连同标题一起建;Esc 收起,什么也不建', async () => {
    const on = handlers()
    const panel = mount(<ProjectIdeaPanel idea={idea} graph={graph} workspaceManaged={false} {...on} />)
    act(() => panel.button('转为新节点')!.click())
    const picker = panel.host.querySelector<HTMLElement>('.draft-form .choice-picker')!
    expect(picker.textContent).toBe('作为新的根节点')
    await act(async () => {
      picker.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(items.map((item) => item.textContent)).toEqual(['作为新的根节点', '动态预算探针'])
    await act(async () => { items[1]!.click(); await Promise.resolve() })
    await act(async () => { panel.button('保存')!.click(); await Promise.resolve() })
    expect(on.onCreateNode).toHaveBeenCalledWith('用动态预算控制校准成本', 'thread.probe')

    act(() => panel.button('转为新节点')!.click())
    press(panel.host.querySelector('.draft-form input')!, 'Escape')
    expect(panel.host.querySelector('.draft-form')).toBeNull()
    expect(on.onCreateNode).toHaveBeenCalledOnce()
    panel.unmount()
  })

  it('换一个想法时,上一个想法的节点草稿不跟过去', () => {
    const on = handlers()
    const panel = mount(<ProjectIdeaPanel idea={idea} graph={graph} workspaceManaged={false} {...on} />)
    act(() => panel.button('转为新节点')!.click())
    panel.rerender(<ProjectIdeaPanel idea={{ ...idea, id: 'idea-2', title: '另一个想法' }} graph={graph} workspaceManaged={false} {...on} />)
    expect(panel.host.querySelector('.draft-form')).toBeNull()
    panel.unmount()
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
  it('只是关联这个项目、不在这里做的想法，详情里没有科研节点一节', () => {
    const panel = mount(<ProjectIdeaPanel idea={{ ...idea, project: 'other' }} graph={graph} workspaceManaged={false} related {...handlers()} />)
    expect([...panel.host.querySelectorAll('.section-heading--rail')].map((heading) => heading.textContent))
      .toEqual(['用动态预算控制校准成本', '内容', '来源'])
    panel.unmount()
  })

  it('来源对话删掉了的想法，项目页想法一节那一行带着对话已删除标签，详情的来源后面也跟着它', () => {
    const kept: ResearchIdea = { ...idea, id: 'idea-kept', source: { chatId: 'chat-kept', chatTitle: '还在的对话' } }
    const list = mount(
      <ProjectIdeaList
        projectId="draft" error={null} graph={graph} selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()}
        ideas={[idea, kept]} chatDeleted={(held) => held.id === idea.id}
      />,
    )
    expect([...list.host.querySelectorAll<HTMLElement>('.project-idea-row')].map((row) => [
      row.dataset['idea'], [...row.querySelectorAll('.tag')].map((tag) => tag.textContent),
    ])).toEqual([['idea-kept', []], ['idea-1', ['对话已删除']]])
    list.unmount()
    const panel = mount(<ProjectIdeaPanel idea={idea} graph={graph} workspaceManaged sourceChatDeleted {...handlers()} />)
    expect(panel.host.querySelector('.idea-panel-source')!.textContent).toBe('论文讨论对话已删除')
    panel.unmount()
  })

  it('读关联想法失败时，原因写在想法一节里，不再停在读取占位上', () => {
    const list = mount(
      <ProjectIdeaList projectId="draft" ideas={null} error="需要更新 App" graph={graph} selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} />,
    )
    expect([list.host.querySelector('.page-error')?.textContent, list.host.querySelectorAll('.loading-placeholder').length])
      .toEqual(['需要更新 App', 0])
    list.unmount()
  })

  it('项目页的想法一节先列在这个项目里做的想法，再列关联它的，再列在它这里冒出来的，各组新的在前；一个想法只出现在它的第一组', () => {
    const related: ResearchIdea = {
      ...idea, id: 'idea-2', title: '关联过来的想法', project: 'other', relations: { projects: ['draft'], pages: [] },
    }
    const sparked = (id: string, created: string, extra: Partial<ResearchIdea> = {}): ResearchIdea => ({
      ...idea, id, title: `冒出来的 ${id}`, project: undefined, sourceProject: 'draft', created, updated: created, ...extra,
    })
    const onSelect = vi.fn()
    const list = mount(
      <ProjectIdeaList
        projectId="draft" error={null} graph={graph} selectedId={null} onSelect={onSelect} onCreate={vi.fn()}
        ideas={[
          sparked('idea-old', '2026-09-01'), related, { ...idea, node: 'thread.probe', sourceProject: 'draft' },
          sparked('idea-new', '2026-09-20'), sparked('idea-both', '2026-09-25', { relations: { projects: ['draft'], pages: [] } }),
        ]}
      />,
    )
    expect(list.host.querySelector('.section-heading')!.firstChild!.textContent).toBe('关联想法 · 5')
    const rows = [...list.host.querySelectorAll<HTMLElement>('.project-idea-row')]
    expect(rows.map((row) => [row.dataset['idea'], row.querySelector('.project-idea-flags')!.textContent]))
      .toEqual([['idea-1', '动态预算探针'], ['idea-both', '关联'], ['idea-2', '关联'], ['idea-new', '来源'], ['idea-old', '来源']])
    act(() => rows[3]!.click())
    expect(onSelect).toHaveBeenCalledWith('idea-new')
    list.unmount()
  })

  it('想法一节标题右端有新建想法，草稿就地开在这个项目冒出来的那组最前面；⌘Enter 新建，存好的想法就落在草稿那一行', async () => {
    const onCreate = vi.fn<(title: string, body: string) => Promise<boolean>>(() => Promise.resolve(true))
    const held: ResearchIdea[] = [
      { ...idea, id: 'idea-here' },
      { ...idea, id: 'idea-old', project: undefined, sourceProject: 'draft', created: '2026-09-01', updated: '2026-09-01' },
    ]
    const list = mount(
      <ProjectIdeaList projectId="draft" ideas={held} error={null} graph={graph} selectedId={null} onSelect={vi.fn()} onCreate={onCreate} />,
    )
    expect(list.headingActions('关联想法')).toEqual([['想法']])
    const add = list.host.querySelector<HTMLButtonElement>('.section-heading-actions .add-action')!
    expect([add.getAttribute('aria-label'), add.className.split(' ').slice(0, 2).join(' ')]).toEqual(['新建想法', 'btn sm'])
    act(() => add.click())
    expect(document.querySelector('.modal-body')).toBeNull()
    const slots = () => [...list.host.querySelectorAll<HTMLElement>('.project-ideas > .structured-row')]
      .map((row) => row.dataset['idea'] ?? (row.querySelector('.idea-draft') === null ? '?' : 'draft'))
    expect(slots()).toEqual(['idea-here', 'draft', 'idea-old'])
    const draft = list.host.querySelector<HTMLElement>('.draft-form.idea-draft')!
    expect(document.activeElement).toBe(draft.querySelector('input'))
    const type = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const proto = field instanceof window.HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    act(() => {
      type(draft.querySelector('input')!, '项目页写下的想法')
      type(draft.querySelector('textarea')!, '先记下来。')
    })
    await act(async () => {
      draft.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(onCreate).toHaveBeenCalledWith('项目页写下的想法', '先记下来。')
    const saved: ResearchIdea = { ...idea, id: 'idea-saved', project: undefined, sourceProject: 'draft', created: '2026-09-18', updated: '2026-09-18' }
    list.rerender(
      <ProjectIdeaList projectId="draft" ideas={[saved, ...held]} error={null} graph={graph} selectedId={null} onSelect={vi.fn()} onCreate={onCreate} />,
    )
    expect(slots()).toEqual(['idea-here', 'idea-saved', 'idea-old'])
    list.unmount()
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

describe('项目页跟着工作区刷新', () => {
  const bound = (): ProjectDetail => project({
    workspace: { kind: 'local', root: '/work/spec-decoding', state: 'ready', planPath: 'plan.md', events: [] },
  })
  /** The project each project.get call answers, in order; a call past the end never answers. */
  let answers: (() => Promise<ProjectDetail>)[] = []
  let gets = 0
  let commits = 0
  /** What idea.list rejects with instead of answering, when a case makes it fail. */
  let ideasError: unknown = null
  let unmount = () => {}

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    shell.shown = true
    gets = 0
    commits = 0
    ideasError = null
    answers = [async () => bound()]
    vi.stubGlobal('meridian', {
      call: (method: string) => {
        if (method === 'project.get') return answers[gets++]?.() ?? new Promise(() => {})
        if (method === 'idea.list' && ideasError !== null) return Promise.reject(ideasError)
        if (method === 'idea.list' || method === 'chat.list') return Promise.resolve([])
        return new Promise(() => {})
      },
    })
  })

  afterEach(() => {
    unmount()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  let render = async () => {}
  const mount = async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    render = () => act(async () => {
      root.render(withMessages(
        <Profiler id="project" onRender={() => { commits += 1 }}>
          <ProjectScreen
            projectId="draft" onBack={() => {}} onReturn={() => {}}
            tab="task" onTab={() => {}} record="tl" onRecord={() => {}}
          />
        </Profiler>,
      ))
    })
    await render()
    unmount = () => { act(() => root.unmount()); host.remove() }
    return host
  }
  const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  it('读关联想法失败时，原因只写在想法一节的标题下，页头不再重复', async () => {
    ideasError = { reason: 'newer-version' }
    const host = await mount()
    expect([...host.querySelectorAll('.page-error')].map((banner) => [
      banner.previousElementSibling?.textContent?.startsWith('关联想法') ?? false, banner.textContent,
    ])).toEqual([[true, '需要更新 App']])
  })

  it('属性一节从名称开始，不再写一行类型 · 项目', async () => {
    const host = await mount()
    expect([...host.querySelectorAll('.wkprops > .pk')].map((key) => key.textContent).slice(0, 1)).toEqual(['名称'])
  })

  it('一次只读一回：上一次还没回来时，到点了也不再读', async () => {
    await mount()
    await wait(10_000)
    expect(gets).toBe(2)
  })

  it('项目不在屏上时不读', async () => {
    shell.shown = false
    await mount()
    await wait(10_000)
    expect(gets).toBe(1)
  })

  it('离开项目页后不再读，正在读的那次回来也不再排下一次；回到项目页马上读一次，再照常隔一段读', async () => {
    let answerTick: (value: ProjectDetail) => void = () => {}
    answers = [async () => bound(), () => new Promise((resolve) => { answerTick = resolve }), async () => bound()]
    await mount()
    await wait(2_000)
    shell.shown = false
    await render()
    await act(async () => { answerTick(bound()) })
    await wait(10_000)
    expect(gets).toBe(2)

    shell.shown = true
    await render()
    expect(gets).toBe(3)
    await wait(2_000)
    expect(gets).toBe(4)
  })

  it('读回来的项目没变时不重新渲染', async () => {
    answers = Array.from({ length: 4 }, () => async () => bound())
    await mount()
    const settled = commits
    await wait(6_500)
    expect([gets, commits]).toEqual([4, settled])
  })

  it('一次读失败，错误横幅等下一次读成功就收起', async () => {
    // Core rejects a call with its reason as plain data.
    answers = [async () => bound(), () => Promise.reject({ reason: 'newer-version' }), async () => bound()]
    const host = await mount()
    await wait(2_000)
    expect(host.querySelector('.page-error')?.textContent).toBe('需要更新 App')
    await wait(2_000)
    expect([gets, host.querySelector('.page-error')]).toEqual([3, null])
  })
})
