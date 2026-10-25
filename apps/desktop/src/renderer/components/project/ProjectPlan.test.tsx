// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Milestone, Task } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { newPlanRow, ProjectPlan, ProjectTaskPanel, type PlanCreating } from './ProjectPlan.js'

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
  creating?: PlanCreating | null
} = {}) {
  const { tasks = [task], milestones = [milestone], flashId = null, creating = null } = options
  return renderToStaticMarkup(
    <MessagesProvider>
      <ProjectPlan
        projectId="p1" project={{ tasks, milestones }} tab={tab} today="2026-09-16"
        creating={creating} flashId={flashId} selectedTaskId={null}
        listRef={createRef()} draftRef={createRef()} addRef={createRef()} timelineAddRef={createRef()}
        onTab={vi.fn()} onDiscardOpenEdits={vi.fn()} onStartTask={vi.fn()} onStartMilestone={vi.fn()}
        onCreating={vi.fn()} onCancelCreate={vi.fn()} onCreateTask={vi.fn()} onCreateMilestone={vi.fn()}
        onUpdateTask={vi.fn()} onDeleteTask={vi.fn()} onReorderTasks={vi.fn()} onOpenTask={vi.fn()}
        onUpdateMilestone={vi.fn()}
        onDeleteMilestone={vi.fn()} onHoverMilestone={vi.fn()}
      />
    </MessagesProvider>,
  )
}

describe('ProjectPlan', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('任务和里程碑共用一个位置，都空着时是同一种分节空态', () => {
    const empty = (tab: 'task' | 'ms') => {
      const host = document.createElement('div')
      host.innerHTML = renderPlan(tab, { tasks: [], milestones: [] })
      return [...host.querySelectorAll('.empty-state')].map((node) => [node.className, node.textContent])
    }
    expect(empty('task')).toEqual([['empty-state empty-state--section', '—']])
    expect(empty('ms')).toEqual([['empty-state empty-state--section', '—']])
  })

  it('任务模式把日期和时间保留为两个独立编辑入口', () => {
    const output = renderPlan('task')
    expect(output).toContain('list--embedded')
    expect(output).toMatch(/<button type="button" class="schedule-trigger task-date-part"/)
    expect(output).toMatch(/<button type="button" class="schedule-trigger task-clock-part"/)
    expect(output).toContain('9月16日')
    expect(output).toContain('08:00–10:00')
    expect(output).toContain('校准批次')
    expect(output).not.toContain('完成首轮校准')
  })

  it('任务行和里程碑行的删除是行尾操作槽里的图标钮，悬停时标红；任务行的改名铅笔也在操作槽里', () => {
    const host = document.createElement('div')
    host.innerHTML = renderPlan('task')
    const slot = (row: Element) => [...row.querySelectorAll('.row-actions button')].map((item) => [
      item.getAttribute('aria-label'), item.textContent, item.classList.contains('icbtn'), item.classList.contains('danger'),
    ])
    expect(slot(host.querySelector('.task-row')!)).toEqual([
      ['重命名任务：校准批次', '', true, false], ['删除任务：校准批次', '', true, true],
    ])
    host.innerHTML = renderPlan('ms')
    expect(slot(host.querySelector('.milestone-row')!)).toEqual([['删除里程碑：完成首轮校准', '', true, true]])
  })

  it('任务行整行就是拖拽把手，在窄的计划列表里不另占一列', () => {
    const host = document.createElement('div')
    host.innerHTML = renderPlan('task')
    const row = host.querySelector('[data-row="task-1"]')!
    expect(row.getAttribute('draggable')).toBe('true')
    expect(row.getAttribute('data-reorder-item')).toBe('task-1')
    expect(row.querySelector('.drag-handle')).toBeNull()
  })

  it('Alt+↓ 在任务行里把任务往下挪一格，已归档的任务不参与', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const host = document.createElement('div')
    document.body.append(host)
    const onReorderTasks = vi.fn()
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider>
        <ProjectPlan
          projectId="p1" project={{ tasks: [task, rangeTask, doneTask], milestones: [] }} tab="task" today="2026-09-16"
          creating={null} flashId={null} selectedTaskId={null}
          listRef={createRef()} draftRef={createRef()} addRef={createRef()} timelineAddRef={createRef()}
          onTab={vi.fn()} onDiscardOpenEdits={vi.fn()} onStartTask={vi.fn()} onStartMilestone={vi.fn()}
          onCreating={vi.fn()} onCancelCreate={vi.fn()} onCreateTask={vi.fn()} onCreateMilestone={vi.fn()}
          onUpdateTask={vi.fn()} onDeleteTask={vi.fn()} onReorderTasks={onReorderTasks} onOpenTask={vi.fn()}
          onUpdateMilestone={vi.fn()} onDeleteMilestone={vi.fn()} onHoverMilestone={vi.fn()}
        />
      </MessagesProvider>,
    ))
    const altDown = (id: string) => act(() => {
      host.querySelector(`[data-row="${id}"] .plan-open`)!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }))
    })
    altDown('task-1')
    expect(onReorderTasks).toHaveBeenCalledWith(['task-2', 'task-1', 'task-3'])
    onReorderTasks.mockClear()
    altDown('task-2')
    expect(onReorderTasks).not.toHaveBeenCalled()
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
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
    expect(output).toContain('list--embedded')
    expect(output).toContain('完成首轮校准')
    expect(output).toContain('9月20日')
    expect(output).toContain('未完成')
    expect(output).not.toContain('校准批次')
  })

  it('新建任务的输入行出现在列表最前,和新任务落下的位置一致', () => {
    const output = renderPlan('task', { creating: newPlanRow('task', '2026-09-16') })
    expect(output.indexOf('task-create-row')).toBeGreaterThan(-1)
    expect(output.indexOf('task-create-row')).toBeLessThan(output.indexOf('data-row="task-1"'))
    expect(output).toMatch(/task-create-row[\s\S]*<input[^>]*class="form-control form-input form-control-inline/)
  })

  it('已完成的任务默认折叠进已归档分组,活动列表里看不到它', () => {
    const output = renderPlan('task', { tasks: [task, doneTask] })
    expect(output).toContain('校准批次')
    expect(output).not.toContain('已完成的任务')
    expect(output).toContain('已归档')
  })

  it('已归档分组和想法页的一样,标题后带条数', () => {
    const count = (html: string) => /collapsible-group-title">已归档<\/span><span class="heading-count"> · (\d+)</.exec(html)?.[1]
    expect(count(renderPlan('task', { tasks: [task, doneTask] }))).toBe('1')
    expect(count(renderPlan('ms', { milestones: [milestone, doneMilestone] }))).toBe('1')
  })

  it('flashId 指向已归档任务时,归档分组自动展开显示它', () => {
    const output = renderPlan('task', { tasks: [task, doneTask], flashId: doneTask.id })
    expect(output).toContain('已完成的任务')
  })

  it('归档任务不参与拖拽排序', () => {
    const host = document.createElement('div')
    host.innerHTML = renderPlan('task', { tasks: [task, doneTask], flashId: doneTask.id })
    expect(host.querySelector('[data-row="task-1"]')!.getAttribute('draggable')).toBe('true')
    expect(host.querySelector('[data-row="task-3"]')!.hasAttribute('draggable')).toBe(false)
    expect(host.querySelector('[data-row="task-3"]')!.hasAttribute('data-reorder-item')).toBe(false)
  })

  it('已完成的里程碑默认折叠进已归档分组,展开后可见', () => {
    const closed = renderPlan('ms', { milestones: [milestone, doneMilestone] })
    expect(closed).toContain('完成首轮校准')
    expect(closed).not.toContain('已完成的里程碑')
    expect(closed).toContain('已归档')

    const open = renderPlan('ms', { milestones: [milestone, doneMilestone], flashId: doneMilestone.id })
    expect(open).toContain('已完成的里程碑')
  })

  describe('任务名', () => {
    let root: Root | null = null
    afterEach(() => {
      if (root !== null) act(() => root!.unmount())
      root = null
      document.body.innerHTML = ''
    })
    const mount = () => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
      const host = document.createElement('div')
      document.body.append(host)
      const onOpenTask = vi.fn()
      const onUpdateTask = vi.fn(() => Promise.resolve(true))
      root = createRoot(host)
      act(() => root!.render(
        <MessagesProvider>
          <ProjectPlan
            projectId="p1" project={{ tasks: [task], milestones: [] }} tab="task" today="2026-09-16"
            creating={null} flashId={null} selectedTaskId={null}
            listRef={createRef()} draftRef={createRef()} addRef={createRef()} timelineAddRef={createRef()}
            onTab={vi.fn()} onDiscardOpenEdits={vi.fn()} onStartTask={vi.fn()} onStartMilestone={vi.fn()}
            onCreating={vi.fn()} onCancelCreate={vi.fn()} onCreateTask={vi.fn()} onCreateMilestone={vi.fn()}
            onUpdateTask={onUpdateTask} onDeleteTask={vi.fn()} onReorderTasks={vi.fn()} onOpenTask={onOpenTask}
            onUpdateMilestone={vi.fn()} onDeleteMilestone={vi.fn()} onHoverMilestone={vi.fn()}
          />
        </MessagesProvider>,
      ))
      return { host, onOpenTask, onUpdateTask }
    }

    it('任务名是一个按钮,点它(键盘回车同样触发点击)打开任务详情,不进入改名', () => {
      const { host, onOpenTask } = mount()
      const title = host.querySelector<HTMLButtonElement>('.task-row .plan-name')!
      expect(title.tagName).toBe('BUTTON')
      expect(title.textContent).toBe('校准批次')
      act(() => title.click())
      expect(onOpenTask).toHaveBeenCalledWith('task-1')
      expect(host.querySelector('.plan-name-input')).toBeNull()
    })

    it('任务行整行可点开任务详情,不止是拖拽把手', () => {
      const { host, onOpenTask } = mount()
      act(() => host.querySelector<HTMLElement>('.task-row')!.click())
      expect(onOpenTask).toHaveBeenCalledWith('task-1')
    })

    it('改名从任务名旁的铅笔进入,在行内写回,不打开任务详情', async () => {
      const { host, onOpenTask, onUpdateTask } = mount()
      const rename = host.querySelector<HTMLButtonElement>('.task-row .plan-rename')!
      expect(rename.getAttribute('aria-label')).toBe('重命名任务：校准批次')
      act(() => rename.click())
      const input = host.querySelector<HTMLInputElement>('.task-row .plan-name-input')!
      expect(input.value).toBe('校准批次')
      act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, '复核批次')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await Promise.resolve()
      })
      expect(onUpdateTask).toHaveBeenCalledWith('task-1', { title: '复核批次' })
      expect(onOpenTask).not.toHaveBeenCalled()
    })

    it('一行任务只占一个 Tab 停靠点，方向键依次走过日期、时间、优先级、状态、任务名、改名铅笔和删除，双击仍不选中字', async () => {
      const { host } = mount()
      const row = host.querySelector<HTMLElement>('.task-row')!
      const stops = [...host.querySelectorAll<HTMLElement>('.list *')]
        .filter((element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled)
      expect(stops).toEqual([row])
      await act(async () => { row.focus() })
      const walked: string[] = []
      for (let step = 0; step < 8; step += 1) {
        walked.push(document.activeElement!.getAttribute('aria-label') ?? document.activeElement!.textContent ?? '')
        await act(async () => {
          document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
          await new Promise((done) => setTimeout(done, 0))
        })
      }
      expect(walked).toEqual(['9月16日', '08:00–10:00', 'P1', '进行中', '校准批次', '重命名任务：校准批次', '删除任务：校准批次', '9月16日'])
      const second = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 })
      row.querySelector('.plan-name')!.dispatchEvent(second)
      expect(second.defaultPrevented).toBe(true)
    })

    it('改名时点进输入框只是在编辑,不打开任务详情', () => {
      const { host, onOpenTask } = mount()
      act(() => host.querySelector<HTMLButtonElement>('.task-row .plan-rename')!.click())
      act(() => host.querySelector<HTMLInputElement>('.task-row .plan-name-input')!.click())
      expect(onOpenTask).not.toHaveBeenCalled()
      expect(host.querySelector('.task-row .plan-name-input')).not.toBeNull()
    })
  })
})

function renderTaskPanel(
  taskOverrides: Partial<Task> = {}, node?: { id: string; label: string; mode: 'supported' },
) {
  return renderToStaticMarkup(
    <MessagesProvider>
      <ProjectTaskPanel
        projectId="p1" task={{ ...task, ...taskOverrides }} node={node} nodes={[]} handSet={false}
        onClose={vi.fn()} onSaveNote={vi.fn()} onOpenNode={vi.fn()} onSetNode={vi.fn()}
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

  it('没有备注时是分节空态 —,而不是空白,也不写一句', () => {
    const output = renderTaskPanel({ note: undefined })
    expect(output).toContain('<div class="empty-state empty-state--section">—</div>')
  })

  it('显示任务挂在哪个科研节点上;还没挂时是共享的空值 —', () => {
    const linked = renderTaskPanel({}, { id: 'kv.n3', label: '前缀共调度', mode: 'supported' })
    expect(linked).toContain('科研节点')
    expect(linked).toMatch(/<button type="button" class="entity-link entity-link--node"[^>]*><span class="status-dot status-dot--sm status-dot--good"/)
    expect(linked).not.toContain('title=')
    expect(renderTaskPanel()).toContain('<div class="empty-state empty-state--section">—</div>')
    expect(renderTaskPanel()).not.toContain('agent 做这个任务')
  })

  it('agent 加的任务在面板和列表里都带一个安静的 agent 标记,用户加的没有', () => {
    const agent = '<span class="tag tag--label tag--neutral source-label"><span class="fade-text tag-text" data-state="closed">agent</span></span>'
    expect(renderTaskPanel({ origin: 'agent' })).toContain(agent)
    expect(renderTaskPanel()).not.toContain('>agent<')
    expect(renderPlan('task', { tasks: [{ ...task, origin: 'agent' }] })).toContain(agent)
    expect(renderPlan('task')).not.toContain('>agent<')
  })

  it('有备注时渲染备注正文', () => {
    const output = renderTaskPanel({ note: '先跑 A/B 两组,再看结论' })
    expect(output).toContain('先跑 A/B 两组')
    const empties = (html: string) => html.split('empty-state--section').length - 1
    expect(empties(output)).toBe(empties(renderTaskPanel({ note: undefined })) - 1)
  })

  it('备注按长文本的同一套约定编辑:编辑的位置换成取消和保存,取消或 Esc 还原不写,保存或 ⌘回车写回', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('meridian', { platform: 'darwin' })
    const host = document.createElement('div')
    document.body.append(host)
    const onSaveNote = vi.fn(async () => true)
    const root = createRoot(host)
    act(() => root.render(
      <MessagesProvider>
        <ProjectTaskPanel
          projectId="p1" task={{ ...task, note: '原备注' }} node={undefined} nodes={[]} handSet={false}
          onClose={vi.fn()} onSaveNote={onSaveNote} onOpenNode={vi.fn()} onSetNode={vi.fn()}
        />
      </MessagesProvider>,
    ))
    const heading = () => [...host.querySelectorAll<HTMLElement>('.section-heading')]
      .find((element) => element.textContent?.startsWith('备注'))!
    const buttons = () => [...heading().querySelectorAll<HTMLButtonElement>('.section-heading-actions > .btn')]
    const press = (text: string) => act(() => buttons().find((button) => button.textContent === text)!.click())
    const type = (text: string) => {
      Object.defineProperty(host.querySelector('.md.src')!, 'innerText', { value: text, configurable: true })
    }

    press('编辑')
    expect(buttons().map((button) => button.textContent)).toEqual(['取消', '保存'])
    type('改过的备注')
    press('取消')
    expect(buttons().map((button) => button.textContent)).toEqual(['编辑'])
    press('编辑')
    type('改过的备注')
    act(() => {
      host.querySelector('.md.src')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onSaveNote).not.toHaveBeenCalled()
    press('编辑')
    type('改过的备注')
    await act(async () => {
      host.querySelector('.md.src')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    })
    expect(onSaveNote).toHaveBeenCalledWith('改过的备注')
    press('编辑')
    type('再改一次')
    press('保存')
    expect(onSaveNote).toHaveBeenLastCalledWith('再改一次')
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  describe('科研节点', () => {
    const nodes = [{ id: 'kv.n3', label: '前缀共调度' }, { id: 'kv.n4', label: '宽树' }]
    let root: Root | null = null
    const unmount = () => {
      if (root !== null) act(() => root!.unmount())
      root = null
      document.body.innerHTML = ''
    }
    afterEach(unmount)
    const mount = (props: { node?: { id: string; label: string; mode: 'supported' }; handSet?: boolean; nodes?: typeof nodes }) => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
      unmount()
      const host = document.createElement('div')
      document.body.append(host)
      const onSetNode = vi.fn()
      root = createRoot(host)
      act(() => root!.render(
        <MessagesProvider>
          <ProjectTaskPanel
            projectId="p1" task={task} node={props.node} nodes={props.nodes ?? nodes} handSet={props.handSet ?? false}
            onClose={vi.fn()} onSaveNote={vi.fn()} onOpenNode={vi.fn()} onSetNode={onSetNode}
          />
        </MessagesProvider>,
      ))
      const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text)
      const pick = (text: string) => {
        act(() => { button(text)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
        return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
      }
      return { button, pick, onSetNode }
    }

    it('没挂节点时从科研图的节点里挑一个挂上;图里没有节点时不给挑', () => {
      const { pick, onSetNode } = mount({})
      const items = pick('关联节点')
      expect(items.map((item) => item.textContent)).toEqual(['前缀共调度', '宽树'])
      act(() => items[1]!.click())
      expect(onSetNode).toHaveBeenCalledWith('kv.n4')
      expect(mount({ nodes: [] }).button('关联节点')).toBeUndefined()
    })

    it('科研节点的操作和备注的编辑一样放在小标题右侧', () => {
      /** The section heading that starts with `label`, and the texts of the buttons in its actions slot. */
      const heading = (label: string) => {
        const found = [...document.querySelectorAll<HTMLElement>('.section-heading')]
          .find((element) => element.textContent?.startsWith(label))!
        return {
          className: found.className,
          buttons: [...found.querySelectorAll(':scope > .section-heading-actions > .btn')].map((b) => b.textContent),
        }
      }
      mount({})
      expect(heading('科研节点').buttons).toEqual(['关联节点'])
      expect(heading('备注').buttons).toEqual(['编辑'])
      expect(heading('科研节点').className).toBe(heading('备注').className)
      mount({ node: { id: 'kv.n3', label: '前缀共调度', mode: 'supported' }, handSet: true })
      expect(heading('科研节点').buttons).toEqual(['更改', '取消关联'])
    })

    it('挂着节点时可以改;手动挂的还能取消关联,agent 连的不能', () => {
      const node = { id: 'kv.n3', label: '前缀共调度', mode: 'supported' as const }
      const agents = mount({ node })
      expect(agents.button('取消关联')).toBeUndefined()
      const items = agents.pick('更改')
      act(() => items[1]!.click())
      expect(agents.onSetNode).toHaveBeenCalledWith('kv.n4')

      const mine = mount({ node, handSet: true })
      act(() => mine.button('取消关联')!.click())
      expect(mine.onSetNode).toHaveBeenCalledWith(null)
    })
  })
})
