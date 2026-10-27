import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { ACTIVE_PROJECT, PROJECT_STATUSES, SHELVED_PROJECT } from '../apps/desktop/src/shared/vocabulary.js'
import {
  appSwitcher, dshort, expect, expectWholeInRail, fixtureDay, gotoProject, overlaps, panelHead, railEdges, readDraft, test,
  textBox, timelinePeriod, uniqueHeights, vaultToday, type MeridianWindow,
} from './app.js'

const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

/** The `rgb()` that `--sep-strong` resolves to, compared with the border color of a focused inline field. */
const sepStrongRgb = (win: Page): Promise<string> => win.evaluate(() => {
  const probe = document.createElement('div')
  probe.style.color = 'var(--sep-strong)'
  document.body.appendChild(probe)
  const rgb = getComputedStyle(probe).color
  probe.remove()
  return rgb
})

/** The `rgba()` parsed by `--field` is used to compare an inline field's filled background. */
const fieldRgb = (win: Page): Promise<string> => win.evaluate(() => {
  const probe = document.createElement('div')
  probe.style.backgroundColor = 'var(--field)'
  document.body.appendChild(probe)
  const rgb = getComputedStyle(probe).backgroundColor
  probe.remove()
  return rgb
})

/** Clicks the action `sel` of a row or chip; its actions show only while it is hovered. */
async function rowAction(row: Locator, sel: string): Promise<void> {
  await row.hover()
  await row.locator(sel).click()
}

/** Picks `item` from the … menu at the end of `row`, as a pointer does: hovering the row shows its … button. */
async function fromRowMenu(row: Locator, item: '重命名' | '删除'): Promise<void> {
  await rowAction(row, '.dots')
  await row.page().getByRole('menuitem', { name: item, exact: true }).click()
}

/**
 * Offsets in days from the vault's today to the dates of the fixture's draft project. The fixture
 * dates are generated from today, so tests target these offsets rather than calendar days, and
 * runs on different days see the same offsets.
 */
const T2_START = -7
const T2_END = 3
const MILESTONES = { m1: -20, m2: 3, m3: 11, m4: 21 }

/** At this content width the Gantt viewport is just over 300px, about nine days of month view. */
const NARROW_WIDTH = 760
/** The number of tasks in the draft project in the fixture. */
const TASK_ROWS = 5
/** One of the fixture's tasks (t1) is done, so the plan's task list shows this many rows by default: a
 * done task collapses into the archived group, which starts closed. */
const ACTIVE_TASK_ROWS = TASK_ROWS - 1
/**
 * Live per-day pixel width of the Gantt grid. `TimelineScale.tsx` fits the default week scale to the
 * viewport (`dayWidth = viewportWidth / 7`), so it is not a fixed constant and must be read from a
 * rendered date cell's inline width instead of assumed.
 */
const ganttDayWidth = (win: Page): Promise<number> => win.locator('.gantt .gdatecell').first()
  .evaluate((el) => parseFloat((el as HTMLElement).style.width))
/**
 * The day/week/month Gantt redesign only draws a milestone diamond inside its own calendar window
 * (`TimelineBoard.tsx`), so a milestone days away from today may start out of view. The month scale
 * gives the widest window; step forward through its calendar periods until the target diamond renders,
 * so the check is deterministic regardless of which day of the month the suite runs on.
 */
async function revealMilestone(win: Page, dataMilestone: string) {
  const diamond = win.locator(`.gantt .gddl[data-milestone="${dataMilestone}"]`)
  for (let step = 0; step < 3 && await diamond.count() === 0; step += 1) {
    await win.locator('.gantt .gperiodnav button[aria-label="下一个周期"]').click()
  }
  await expect(diamond).toBeVisible()
  return diamond
}
/** The width below which the Gantt viewport should fall after narrowing. */
const NARROW_VIEWPORT = 400
/** Gap between a stub and the viewport edge it sticks to; matches the stub formula in useGanttDrag.ts. */
const GANTT_STUB_INSET = 6
/** The title used for the new task is the same string used in manual testing (task-5d). */
const NEW_TASK_TITLE = '实测新建的任务'
/** New titles the tests write through the list's name cell, one for a task and one for a milestone. */
const EDITED_TASK_TITLE = '甘特里点开改的任务'
const EDITED_MILESTONE_TITLE = '甘特里点开改的里程碑'

test('项目反向展示关联想法，点击后在项目右栏就地打开详情，旧结论区不再出现', async ({ win }) => {
  await gotoProject(win)
  const idea = await call<{ id: string; title: string; project?: string }[]>(win, 'idea.list', {})
    .then((rows) => rows.find((row) => row.project === 'draft'))
  expect(idea).toBeDefined()

  const page = win.locator('.screenslot:not([hidden])')
  const list = page.locator('.project-ideas')
  const row = page.locator(`.project-idea-row[data-idea="${idea!.id}"]`)
  await expect(list).toHaveClass(/list--embedded/)
  await expect(row).toContainText(idea!.title)
  expect(await row.evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.borderTopWidth, style.borderBottomWidth]
  })).toEqual(['0px', '0px'])
  await expect(page.getByText(/^结论 ·/)).toHaveCount(0)

  await row.click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])
  await expect(page.locator('.project-detail-panel')).toContainText(idea!.title)
  await expect(page.locator('.idea-panel-body')).not.toBeEmpty()
  const openIdea = page.locator('.project-detail-panel .panel-head .project-idea-open-idea')
  await expect(openIdea).toHaveAttribute('aria-label', '打开想法')
  await expect(page.getByRole('button', { name: '打开来源对话' })).toHaveCount(0)
  await expect(row).toHaveClass(/selected/)

  await openIdea.click()
  await expect(win.locator('.screenslot:not([hidden]) .idea-detail-panel')).toContainText(idea!.title)
  await expect(win.locator('.screenslot:not([hidden])').getByRole('button', { name: '打开来源对话' })).toBeVisible()
})

test('在项目页的想法一节就地写下想法：存好就落在草稿那一行，记下冒出它的项目，不放进项目，也出现在想法页的未开始里', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden])')
  await page.locator('.section-heading', { hasText: '关联想法' }).getByRole('button', { name: '新建想法' }).click()
  const slots = () => page.locator('.project-ideas > .item').evaluateAll((rows) => rows.map((row) =>
    (row as HTMLElement).dataset['idea'] ?? (row.querySelector('.idea-draft') === null ? '?' : 'draft')))
  const draftAt = (await slots()).indexOf('draft')
  expect(draftAt).toBeGreaterThan(-1)
  const draft = page.locator('.idea-draft')
  await draft.locator('.form-input').fill('项目页写下的想法')
  await draft.locator('.form-markdown .cm-content').fill('先在 draft 效率里记下来。')
  await draft.getByRole('button', { name: '保存' }).click()
  await expect(draft).toHaveCount(0)
  const made = await call<{ id: string; title: string; sourceProject?: string; project?: string }[]>(win, 'idea.list', {})
    .then((rows) => rows.find((row) => row.title === '项目页写下的想法'))
  expect([made?.sourceProject, made?.project]).toEqual(['draft', undefined])
  await expect.poll(async () => (await slots())[draftAt]).toBe(made!.id)
  await expect(page.locator(`.project-idea-row[data-idea="${made!.id}"] .project-idea-flags`)).toHaveText('来源')
  await win.locator('[data-desk="ideas"]').click()
  const card = page.locator('.idea-card', { hasText: '项目页写下的想法' })
  await expect(card).toContainText('来源 · draft 效率')
  await expect(page.locator('.ideas-list > .grouped-list > .section-heading--group').first()).toHaveText(/^未开始/)
})

test('想法在科研图中动态标出关联节点，节点详情反向展示想法', async ({ win }) => {
  const idea = await call<{ id: string; title: string; project?: string }[]>(win, 'idea.list', {})
    .then((rows) => rows.find((row) => row.project === 'draft'))
  expect(idea).toBeDefined()
  await call(win, 'idea.placeOnGraph', {
    id: idea!.id,
    placement: { kind: 'link', nodeId: 'knee' },
  })
  await gotoProject(win)

  const page = win.locator('.screenslot:not([hidden])')
  await page.locator(`.project-idea-row[data-idea="${idea!.id}"]`).click()
  const side = page.locator('.project-detail-panel')
  const actions = side.locator('.section-heading', { hasText: '科研节点' }).locator('.section-heading-actions')
  await expect.poll(() => side.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(400)
  const sideBox = await side.boundingBox()
  const actionsBox = await actions.boundingBox()
  expect(sideBox).not.toBeNull()
  expect(actionsBox).not.toBeNull()
  expect(sideBox!.x + sideBox!.width - actionsBox!.x - actionsBox!.width).toBeLessThan(30)

  await page.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  const linkedNode = page.locator('.rgn[data-node="knee"]')
  await expect(linkedNode).toHaveClass(/idea-related/)
  await expect(linkedNode.locator('rect.rgn-box')).toHaveAttribute('style', /idea-node-hatch-/)

  await linkedNode.click()
  await expect(side.locator('.panel-head-title')).toHaveText('树宽收益拐点')
  const headings = await side.locator('.section-heading').allTextContents()
  expect(headings.slice(0, 4)).toEqual(['分支 · 3', '任务 · 1', '关联想法 · 1', '科研记录 · 1'])
  // wide and prefix are both active_nodes, so knee's branches are two in progress and one supported; no candidate group remains.
  expect(await side.locator('.node-branch-label').evaluateAll((labels) => labels.map((label) => ({
    text: label.textContent,
    whiteSpace: getComputedStyle(label).whiteSpace,
  })))).toContainEqual({ text: '推进中', whiteSpace: 'nowrap' })
  const tableCell = side.locator('.node-markdown td').first()
  await expect(tableCell).toBeVisible()
  expect(await tableCell.evaluate((cell) => getComputedStyle(cell).borderTopWidth)).not.toBe('0px')
  // The node panel variant has no node column: kind chip, date chip, text, and who read left to right.
  const eventRow = side.locator('.record-row').first()
  await expect(eventRow.locator('.record-node')).toHaveCount(0)
  const eventParts = await eventRow.locator('.project-signal-kind, .record-text, .record-who').evaluateAll(
    (parts) => parts.map((part) => part.getBoundingClientRect()),
  )
  expect(eventParts[1]!.left).toBeGreaterThanOrEqual(eventParts[0]!.right - 1)
  expect(eventParts[2]!.left).toBeGreaterThan(eventParts[1]!.left)
  const linkedIdea = side.locator(`.node-idea-row[data-idea="${idea!.id}"]`)
  await expect(linkedIdea).toContainText(idea!.title)
  await linkedIdea.click()
  await expect(side.locator('.idea-panel-body')).toBeVisible()
})

test('节点详情自己滚动;滚到底后滚轮接着滚整页', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden])')
  await page.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  await page.locator('.rgn[data-node="knee"]').click()

  const body = page.locator('.desk-body')
  const side = page.locator('.project-detail-panel .panel-body')
  expect(await side.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto')
  await body.evaluate((element) => { element.scrollTop = 0 })
  await side.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await side.hover()
  await win.mouse.wheel(0, 500)

  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
})

test('甘特每一行等高,行高是 44px', async ({ win }) => {
  await gotoProject(win)
  expect(await uniqueHeights(win.locator('.gantt .glrow, .gantt .grow'))).toEqual([44])
})

test('需要注意的类型、日期和正文使用统一列宽与间隔', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden])')
  const list = page.locator('.attn')
  const rows = list.locator('.attnrow')
  await expect(list).toHaveClass(/list--embedded/)
  await expect(page.locator('#taskList')).toHaveClass(/list--embedded/)
  await expect(page.locator('.evlist')).toHaveClass(/list--embedded/)
  expect(await rows.count()).toBeGreaterThan(1)
  const geometry = await rows.evaluateAll((elements) => elements.map((row) => {
    const kind = row.querySelector('.project-signal-kind')!.getBoundingClientRect()
    const date = row.querySelector('.project-signal-date')!.getBoundingClientRect()
    const text = row.querySelector('.attn-text')!.getBoundingClientRect()
    return {
      kindWidth: kind.width,
      dateWidth: date.width,
      kindToDate: date.left - kind.right,
      dateToText: text.left - date.right,
      textLeft: text.left,
    }
  }))
  expect(new Set(geometry.map((row) => row.kindWidth)).size).toBe(1)
  expect(new Set(geometry.map((row) => row.dateWidth)).size).toBe(1)
  expect(new Set(geometry.map((row) => row.kindToDate)).size).toBe(1)
  expect(new Set(geometry.map((row) => row.dateToText)).size).toBe(1)
  expect(new Set(geometry.map((row) => row.textLeft)).size).toBe(1)
  expect(await list.evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.borderTopWidth, style.borderBottomWidth]
  })).toEqual(['0px', '0px'])
})

test('科研记录的正文紧跟日期、与需要注意的正文对齐,节点和 agent 各成一列,细节用小号次要字', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden])')
  const geometry = await page.locator('.evlist .record-row').evaluateAll((rows) => rows.map((row) => {
    const box = (selector: string) => row.querySelector(selector)!.getBoundingClientRect()
    return {
      dateRight: box('.project-signal-date').right, text: box('.record-text').left,
      node: box('.record-node').left, who: box('.record-who').left,
      hasNode: row.querySelector('.record-node .entity-link') !== null,
    }
  }))
  // The draft's records include ones without a node, whose text used to sit after an empty node cell.
  expect(new Set(geometry.map((row) => row.hasNode))).toEqual(new Set([true, false]))
  const gap = await page.locator('.attn .attnrow').first().evaluate((row) => parseFloat(getComputedStyle(row).columnGap))
  expect(geometry.map((row) => Math.round(row.text - row.dateRight))).toEqual(geometry.map(() => gap))
  for (const cell of ['text', 'node', 'who'] as const) {
    expect(new Set(geometry.map((row) => Math.round(row[cell]))).size, `${cell} 应落在同一列`).toBe(1)
  }
  const attentionText = await page.locator('.attn .attn-text').first().evaluate((text) => text.getBoundingClientRect().left)
  expect(Math.round(geometry[0]!.text)).toBe(Math.round(attentionText))

  const look = await page.locator('.evlist .record-row', { has: win.locator('.record-detail') }).first()
    .evaluate((row) => {
      const role = (property: 'color' | 'fontSize', value: string) => {
        const probe = document.createElement('span')
        probe.style[property] = value
        row.append(probe)
        const resolved = getComputedStyle(probe)[property]
        probe.remove()
        return resolved
      }
      const style = (selector: string) => getComputedStyle(row.querySelector(selector)!)
      return {
        title: [style('.record-line').color, style('.record-line').fontSize],
        detail: [style('.record-detail').color, style('.record-detail').fontSize],
        body: [role('color', 'var(--ink)'), role('fontSize', 'var(--fs-base)')],
        meta: [role('color', 'var(--ter)'), role('fontSize', 'var(--fs-sm)')],
      }
    })
  expect(look.title).toEqual(look.body)
  expect(look.detail).toEqual(look.meta)
})

test('任务行开头的日期、时段、优先级和状态按需要注意的列距隔开,任务名再隔开一档', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden])')
  const gap = await page.locator('.attn .attnrow').first().evaluate((row) => parseFloat(getComputedStyle(row).columnGap))
  const rows = await page.locator('#taskList .task-row').evaluateAll((items) => items.map((row) => {
    const edges = ['.task-date-part', '.task-clock-part', '.plan-priority', '.state-cell', '.plan-name']
      .map((selector) => row.querySelector(selector)!.getBoundingClientRect())
    return edges.slice(1).map((edge, index) => Math.round(edge.left - edges[index]!.right))
  }))
  expect(rows).toEqual(rows.map(() => [gap, gap, gap, 2 * gap]))
})

test('任务行的日期从行的内边距开始,行尾的「更多」按钮在行的内边距处结束', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden])')
  const rows = await page.locator('#taskList .task-row').evaluateAll((items) => items.map((row) => {
    const box = row.getBoundingClientRect()
    const style = getComputedStyle(row)
    return {
      start: Math.round(row.querySelector('.task-date-part')!.getBoundingClientRect().left - box.left),
      end: Math.round(box.right - row.querySelector('.dots')!.getBoundingClientRect().right),
      padding: { start: parseFloat(style.paddingLeft), end: parseFloat(style.paddingRight) },
    }
  }))
  expect(rows.length).toBeGreaterThan(1)
  expect(rows.map(({ start, end }) => ({ start, end }))).toEqual(rows.map(({ padding }) => padding))
})

test.describe(() => {
  // The record opens through a height transition, which runs over frames; see `showWindow` in app.ts.
  test.use({ showWindow: true })

  test('放不下的科研记录停在上面一会儿就向下展开整段,不弹 tooltip,移开就收回', async ({ app, win }) => {
    await gotoProject(win)
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1100, 900) })
    const page = win.locator('.screenslot:not([hidden])')
    const rows = page.locator('.evlist .record-row')
    await expect(page.locator('.evlist .record-line.clipped').first()).toBeVisible()
    const index = await rows.evaluateAll((items) => items.findIndex((row) => row.querySelector('.record-line.clipped') !== null))
    const row = rows.nth(index)
    const text = row.locator('.record-line')
    await text.scrollIntoViewIfNeeded()
    const shape = () => row.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const line = element.querySelector('.record-line')!
      return {
        top: Math.round(box.top), height: Math.round(box.height),
        kindTop: Math.round(element.querySelector('.project-signal-kind')!.getBoundingClientRect().top),
        whole: line.scrollWidth <= line.clientWidth + 1 && line.scrollHeight <= line.clientHeight + 1,
      }
    })
    const rest = await shape()
    expect(rest.whole).toBe(false)

    await text.hover()
    await expect.poll(async () => (await shape()).whole).toBe(true)
    const open = await shape()
    expect(open.height).toBeGreaterThan(rest.height)
    expect([open.top, open.kindTop]).toEqual([rest.top, rest.kindTop])
    await expect(win.locator('.tooltip')).toHaveCount(0)

    await win.mouse.move(1, 1)
    await expect.poll(async () => (await shape()).height).toBe(rest.height)
    expect((await shape()).whole).toBe(false)
  })
})

test('任务条在时间格内上下居中', async ({ win }) => {
  await gotoProject(win)
  const centers = await win.locator('.gantt .gbar').evaluateAll((bars) => bars.map((bar) => {
    const barRect = bar.getBoundingClientRect()
    const rowRect = bar.parentElement!.getBoundingClientRect()
    return Math.abs((barRect.top + barRect.bottom - rowRect.top - rowRect.bottom) / 2)
  }))
  expect(centers.length).toBeGreaterThan(0)
  expect(Math.max(...centers)).toBeLessThanOrEqual(.5)
})

test('窗口收窄后月视图里每条任务行在甘特视口里仍看得见条或残桩', async ({ app, win }) => {
  // Day and week views fit their period to the viewport, so only month view scrolls and draws stubs.
  // Next month opens scrolled to its first day, so a task on its last day lies right of the viewport.
  // A write through Core directly does not refresh an open project page, so the task goes in first.
  const month = timelinePeriod(fixtureDay(timelinePeriod(await vaultToday(win), 'month').last, 1), 'month')
  await call(win, 'project.createTask', {
    projectId: 'draft',
    task: { title: '月末任务', start: month.last, end: month.last, state: 'plan', priority: 'p2' },
  })
  await gotoProject(win)
  const gantt = win.locator('.screenslot:not([hidden]) .gantt')
  await gantt.locator('.segmented-control>button', { hasText: '月' }).click()
  await gantt.locator('.gperiodnav button').last().click()
  await expect(gantt.locator('.gbar-label', { hasText: '月末任务' })).toHaveCount(1)
  const taskRows = (await readDraft(win)).tasks.filter((task) => overlaps(task, month)).length
  await app.evaluate(({ BrowserWindow }, width) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900)
  }, NARROW_WIDTH)
  // Narrowing changes the DOM width at once, but stubs move only after React reads the new width
  // from ResizeObserver and re-renders, so waiting for the width alone covers half of it. A stub on
  // the left edge depends only on scrollLeft and looks the same at either width; only right-edge
  // stubs include the viewport width, so the wait is for one of them to match the current viewport.
  await expect.poll(() => win.locator('.gantt .gwrap').evaluate((wrap, { narrow, inset }) => {
    if (wrap.clientWidth >= narrow) return '视口还没收窄'
    const right = wrap.scrollLeft + wrap.clientWidth
    return [...wrap.querySelectorAll('.gstub')]
      .some((el) => right - ((el as HTMLElement).offsetLeft + (el as HTMLElement).offsetWidth) === inset)
      ? '残桩已按当前视口重算'
      : '残桩还停在旧视口'
  }, { narrow: NARROW_VIEWPORT, inset: GANTT_STUB_INSET })).toBe('残桩已按当前视口重算')

  // Bars and stubs are absolutely positioned and may lie wholly outside the Gantt viewport, so
  // measure the width of their intersection with the viewport.
  const rows = await win.locator('.gantt .gwrap').evaluate((wrap) => {
    const view = wrap.getBoundingClientRect()
    const visible = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return Math.round(Math.min(r.right, view.right) - Math.max(r.left, view.left))
    }
    return [...wrap.querySelectorAll('.grow:not(.msrow)')].map((row) => ({
      bar: visible(row.querySelector('.gbar')),
      stub: visible(row.querySelector('.gstub')),
    }))
  })
  console.log(`甘特收窄到 ${NARROW_WIDTH}px 后每条任务行的可见宽度 ${JSON.stringify(rows)}`)

  expect(rows.map((r) => Math.max(r.bar ?? 0, r.stub ?? 0) > 0))
    .toEqual(Array<boolean>(taskRows).fill(true))
  // Some bar really is pushed out of the viewport, so this test checks a stub; otherwise it is vacuous.
  expect(rows.filter((r) => (r.bar ?? 0) <= 0 && (r.stub ?? 0) > 0).length).toBeGreaterThan(0)
})

test('各板块渲染出的条目数与 project.get 返回的条数逐对相等', async ({ win }) => {
  await gotoProject(win)
  const contract = await win.evaluate(async () => {
    const project = await (window as unknown as MeridianWindow).meridian
      .call('project.get', { id: 'draft' }) as {
        tasks: unknown[]; milestones: unknown[]; events: unknown[]; attachments: unknown[]
        relations: { items: unknown[] }[]
        paperCount: number
        graph: { nodes: unknown[]; edges: unknown[] }
        agentSessions: { steps: unknown[] }[]
      }
    const sum = (counted: number[]) => counted.reduce((a, b) => a + b, 0)
    return {
      任务行: project.tasks.length,
      科研记录: project.events.length,
      关联组: project.relations.length,
      // The paper relation group also renders the project's directly linked papers as chips, on top of any
      // free-text relation items filed under that group name; paperCount is the number still in the vault.
      关联条目: sum(project.relations.map((g) => g.items.length)) + project.paperCount,
      附件: project.attachments.length,
      Agent卡: project.agentSessions.length,
      Agent步骤: sum(project.agentSessions.map((s) => s.steps.length)),
      里程碑行: project.milestones.length,
      科研图节点: project.graph.nodes.length,
      科研图连线: project.graph.edges.length,
    }
  })

  // A done task/milestone starts collapsed into the archived group; open it so every row is in the
  // DOM and this parity check still accounts for every item the contract returns.
  const openArchive = async (listSelector: string) => {
    const toggle = win.locator(`${listSelector} .collapsible-group-head .fold-toggle`)
    if (await toggle.count() > 0) await toggle.click()
  }
  await openArchive('#taskList')

  const rendered: Record<string, number> = {
    任务行: await win.locator('#taskList .ddlrow').count(),
    甘特任务行: await win.locator('.gantt .grow:not(.msrow)').count(),
    科研记录: await win.locator('.evlist .record-row').count(),
    关联组: await win.locator('.wkrel').count(),
    关联条目: await win.locator('.wkrel .tagchip').count(),
    附件: await win.locator('.attrow').count(),
    Agent卡: await win.locator('.agcard').count(),
    Agent步骤: await win.locator('.agstep').count(),
  }

  // Milestones and the research graph each sit behind another tab and render only after switching to it.
  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '里程碑' }).click()
  await win.locator('#msList').waitFor()
  await openArchive('#msList')
  rendered['里程碑行'] = await win.locator('#msList .ddlrow').count()
  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  await win.locator('.rgraph').waitFor()
  rendered['科研图节点'] = await win.locator('.rgraph .rgn').count()
  rendered['科研图连线'] = await win.locator('.rgraph .redges path').count()

  // The Gantt lists only the tasks that overlap the shown week.
  const week = timelinePeriod(await vaultToday(win), 'week')
  const listed = { ...contract, 甘特任务行: (await readDraft(win)).tasks.filter((task) => overlaps(task, week)).length }
  for (const [section, count] of Object.entries(listed)) {
    expect(rendered[section], section).toBe(count)
  }
})

test('越界的日期被 core 拒绝,绕开界面直调也拦得住', async ({ win }) => {
  await gotoProject(win)
  const today = await vaultToday(win)
  type Stored = { due: string; tasks: { id: string; end: string }[] }
  const stored = (p: Stored) => ({ due: p.due, t2End: p.tasks.find((task) => task.id === 't2')!.end })
  const before = stored(await call<Stored>(win, 'project.get', { id: 'draft' }))
  const rejected = await win.evaluate(async (dates) => {
    const meridian = (window as unknown as MeridianWindow).meridian
    const reason = (call: Promise<unknown>) => call.then(() => '没有被拒绝', (e: unknown) => e)
    return {
      // The patch holds only end, checked against the stored start; this day is before t2's start.
      task: await reason(meridian.call('project.updateTask', {
        projectId: 'draft', taskId: 't2', patch: { end: dates.beforeTask },
      })),
      // Likewise only due changes, to a day before draft's start date.
      project: await reason(meridian.call('project.update', {
        id: 'draft', patch: { due: dates.beforeProject },
      })),
    }
  }, { beforeTask: fixtureDay(today, T2_START - 1), beforeProject: fixtureDay(today, -200) })
  expect(rejected).toEqual({ task: { reason: 'invalid' }, project: { reason: 'invalid' } })
  expect(stored(await call<Stored>(win, 'project.get', { id: 'draft' }))).toEqual(before)
})

test('拖菱形改期后,抬手补发的那次点击不算点在空白处新建里程碑', async ({ win }) => {
  await gotoProject(win)
  const today = await vaultToday(win)
  const moved = fixtureDay(today, MILESTONES.m2 + 3)
  // m2 is the milestone under test, delayed for 3 more days; navigate the calendar window to it first.
  const diamond = await revealMilestone(win, 'draft/m2')
  const dayWidth = await ganttDayWidth(win)
  const box = (await diamond.boundingBox())!
  const x0 = box.x + box.width / 2
  const y = box.y + box.height / 2
  // Hovering enlarges the diamond and its bounding box, and offsetLeft rounds to whole pixels, so measure
  // the unrounded left that dragging moves by whole day widths.
  const left = () => diamond.evaluate((el) => parseFloat((el as HTMLElement).style.left))
  const from = await left()

  await win.mouse.move(x0, y)
  await win.mouse.down()
  // Move 15px past a whole 3 days: the diamond snaps back to x0 + 3 × dayWidth while the cursor
  // stops 15px to its right, so the release lands on the milestone lane's background rather than on
  // the diamond, exactly where the click used to be mistaken for creating a milestone.
  await win.mouse.move(x0 + 3 * dayWidth + 15, y, { steps: 8 })
  // While dragging, the diamond follows the pointer in whole days and drops the extra 15px. Wait for
  // it to move three days before releasing: if the press missed it or the move was not delivered, it
  // stays put and fails here, instead of a drag that never happened passing as "no milestone created".
  await expect.poll(async () => (await left()) - from).toBeCloseTo(3 * dayWidth)
  await win.mouse.up()

  await expect.poll(async () => (await readDraft(win)).milestones.find((m) => m.id === 'm2')?.date).toBe(moved)
  // Not mistaken for a create: a misread click would open the "New milestone" editor on the lane.
  await expect(win.locator('.ctxmenu')).toHaveCount(0)
  // The exact core data below already proves no extra milestone appeared and the other three are untouched.
  expect((await readDraft(win)).milestones).toEqual([
    { id: 'm1', date: fixtureDay(today, MILESTONES.m1) },
    { id: 'm2', date: moved },
    { id: 'm3', date: fixtureDay(today, MILESTONES.m3) },
    { id: 'm4', date: fixtureDay(today, MILESTONES.m4) },
  ])
})

test('拖任务条顺延后,开始与结束日期移动了相同的天数', async ({ win }) => {
  await gotoProject(win)
  const today = await vaultToday(win)
  // t1 lies outside the shown week and has no row; t2, the first with a bar, moves 2 days.
  const dayWidth = await ganttDayWidth(win)
  const bar = win.locator('.gantt .gbar').first()
  const box = (await bar.boundingBox())!
  const x0 = box.x + box.width / 2
  const y = box.y + box.height / 2
  const left = () => bar.evaluate((el) => (el as HTMLElement).offsetLeft)
  const from = await left()

  await win.mouse.move(x0, y)
  await win.mouse.down()
  await win.mouse.move(x0 + 2 * dayWidth, y, { steps: 8 })
  // While dragging, the bar follows the pointer in whole days. Wait for it to move two days before
  // releasing: if the press missed the bar or the move was not delivered, it stays put and fails
  // here, instead of after the release while waiting for a write that never comes.
  await expect.poll(async () => (await left()) - from).toBe(Math.round(2 * dayWidth))
  await win.mouse.up()

  await expect.poll(async () => (await readDraft(win)).tasks.find((t) => t.id === 't2')?.start).toBe(fixtureDay(today, T2_START + 2))
  const t2 = (await readDraft(win)).tasks.find((t) => t.id === 't2')
  expect(t2?.start).toBe(fixtureDay(today, T2_START + 2))
  expect(t2?.end).toBe(fixtureDay(today, T2_END + 2))
})

test('拖完任务条那一下不算点击,单击只定位闪烁,名称格仍可独立写回 core', async ({ win }) => {
  await gotoProject(win)
  const today = await vaultToday(win)
  // t1 lies outside the shown week and has no row; t2 is the first task with a bar.
  const dayWidth = await ganttDayWidth(win)
  const bar = win.locator('.gantt .gbar').first()
  const box = (await bar.boundingBox())!
  const y = box.y + box.height / 2
  const left = () => bar.evaluate((el) => (el as HTMLElement).offsetLeft)
  const from = await left()

  await win.mouse.move(box.x + box.width / 2, y)
  await win.mouse.down()
  await win.mouse.move(box.x + box.width / 2 + 2 * dayWidth, y, { steps: 8 })
  // While dragging, the bar follows the pointer in whole days. Wait for it to move two days before
  // releasing: if the press missed the bar or the move was not delivered, it stays put and fails
  // here, since the "not a click" check below means nothing without a drag.
  await expect.poll(async () => (await left()) - from).toBe(Math.round(2 * dayWidth))
  await win.mouse.up()
  await expect.poll(async () => (await readDraft(win)).tasks.find((t) => t.id === 't2')?.start).toBe(fixtureDay(today, T2_START + 2))
  // Click suppression still works: the click the browser sends after the release did not flash the row.
  await expect(win.locator('#taskList .ddlrow[data-row="t2"]')).not.toHaveAttribute('data-arrived')

  const moved = (await readDraft(win)).tasks.find((t) => t.id === 't2')!
  expect(moved.start).toBe(fixtureDay(today, T2_START + 2))

  // A plain click without a drag only locates the matching row and makes it flash, opening no editor.
  await win.locator('.gantt .gbar').first().click()
  const row = win.locator('#taskList .ddlrow[data-row="t2"]')
  await expect(row).toHaveAttribute('data-arrived')
  await expect(row.locator('.metadata-input')).toHaveCount(0)
  await expect(win.locator('.plan-time-pop')).toHaveCount(0)

  await fromRowMenu(row, '重命名')
  await row.locator('.metadata-input').fill(EDITED_TASK_TITLE)
  await row.locator('.metadata-input').press('Enter')
  await expect.poll(async () => (await readDraft(win)).tasks.find((t) => t.id === 't2')?.title).toBe(EDITED_TASK_TITLE)

  const saved = (await readDraft(win)).tasks.find((t) => t.id === 't2')!
  expect(saved.title).toBe(EDITED_TASK_TITLE)
  // Editing the name did not revert the dates set by the drag.
  expect(saved.start).toBe(fixtureDay(today, T2_START + 2))
  expect(saved.end).toBe(fixtureDay(today, T2_END + 2))
})

test('任务时间列单独编辑时,名称、优先级与状态保持静息', async ({ win }) => {
  await gotoProject(win)
  const today = await vaultToday(win)
  const before = (await readDraft(win)).tasks.find((task) => task.id === 't2')!
  const row = win.locator('#taskList .ddlrow[data-row="t2"]')
  await expect(row.locator('.task-date-part')).toHaveText(
    `${dshort(before.start)}–${dshort(before.end)}`,
  )
  await expect(row.locator('.task-clock-part')).toHaveText('全天')
  // The date and time-of-day triggers are two independent popovers now; open the date one.
  await row.locator('.task-date-part').click()
  const form = win.locator('.schedule-form')
  await expect(form).toBeVisible()
  await expect(row.locator('.metadata-input')).toHaveCount(0)
  await expect(row.locator('.plan-priority')).toHaveCount(1)
  await expect(row.locator('.state-cell')).toHaveCount(1)
  // The start is picked from the one calendar, which opens on the start's month.
  const next = fixtureDay(today, T2_START + 1)
  await form.locator('.choice-picker').first().click()
  const day = win.locator(`.calg [aria-label="${dshort(next)}"]`)
  if (await day.count() === 0) await win.locator('.calh [aria-label="下个月"]').click()
  await day.click()
  await expect(win.locator('.calg')).toHaveCount(0)
  await expect(form.locator('.choice-picker').first()).toHaveText(dshort(next))
  await form.locator('button', { hasText: '保存' }).click()
  await expect.poll(async () => (await readDraft(win)).tasks.find((t) => t.id === 't2')?.start).toBe(fixtureDay(today, T2_START + 1))
  const saved = (await readDraft(win)).tasks.find((t) => t.id === 't2')!
  expect(saved.start).toBe(fixtureDay(today, T2_START + 1))
  expect(saved.title).toBe(before.title)
})

test('任务四列逐行对齐,任务与里程碑日期使用同一底色', async ({ win }) => {
  await gotoProject(win)
  const rows = win.locator('#taskList .task-row')
  // The fixture's one done task (t1) starts collapsed into the archived group; only the active rows
  // are visible and need to line up.
  await expect(rows).toHaveCount(ACTIVE_TASK_ROWS)
  for (const selector of ['.task-date-part', '.task-clock-part', '.plan-priority', '.state-cell', '.plan-name']) {
    const x = await rows.evaluateAll((items, cell) => items.map((row) =>
      Math.round(row.querySelector(cell as string)!.getBoundingClientRect().x)), selector)
    expect(new Set(x).size, `${selector} 应落在同一列`).toBe(1)
  }
  const taskDateColor = await rows.first().locator('.task-date-part .date-chip')
    .evaluate((element) => getComputedStyle(element).backgroundColor)

  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '里程碑' }).click()
  const milestoneDate = win.locator('#msList .milestone-row>.plan-date-button').first()
  await expect(milestoneDate).toBeVisible()
  expect(await milestoneDate.locator('.date-chip').evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(taskDateColor)
  await milestoneDate.hover()
  await expect(milestoneDate.locator('..')).not.toHaveClass(/\bhl\b/)
})

test('拖完菱形那一下不算点击,单击打开它的改名小窗并写回', async ({ win }) => {
  await gotoProject(win)
  const today = await vaultToday(win)
  const moved = fixtureDay(today, MILESTONES.m2 + 3)
  // m2 is the milestone under test; navigate the calendar window to it first.
  const diamond = await revealMilestone(win, 'draft/m2')
  const titleOfM2 = await win.evaluate(async () => {
    const project = await (window as unknown as MeridianWindow).meridian
      .call('project.get', { id: 'draft' }) as { milestones: { id: string; title: string }[] }
    return project.milestones.find((m) => m.id === 'm2')!.title
  })

  const dayWidth = await ganttDayWidth(win)
  const box = (await diamond.boundingBox())!
  const y = box.y + box.height / 2
  // Hovering enlarges the diamond and its bounding box, and offsetLeft rounds to whole pixels, so measure
  // the unrounded left that dragging moves by whole day widths.
  const left = () => diamond.evaluate((el) => parseFloat((el as HTMLElement).style.left))
  const from = await left()

  await win.mouse.move(box.x + box.width / 2, y)
  await win.mouse.down()
  await win.mouse.move(box.x + box.width / 2 + 3 * dayWidth, y, { steps: 8 })
  // While dragging, the diamond follows the pointer in whole days. Wait for it to move three days
  // before releasing: if the press missed it or the move was not delivered, it stays put and fails
  // here, instead of after the release while waiting for a notice that never comes.
  await expect.poll(async () => (await left()) - from).toBeCloseTo(3 * dayWidth)
  await win.mouse.up()
  await expect.poll(async () => (await readDraft(win)).milestones.find((m) => m.id === 'm2')?.date).toBe(moved)
  // Click suppression still works: the drag opened no milestone editor.
  await expect(win.locator('.ctxmenu')).toHaveCount(0)

  // The reschedule may have pushed m2 into the next calendar window; find it again before clicking it.
  const movedDiamond = await revealMilestone(win, 'draft/m2')
  await movedDiamond.click()
  await expect(win.locator('.ctxmenu .rh')).toHaveText('里程碑')
  await expect(win.locator('.ctxmenu .short-text-field .form-button')).toHaveText(dshort(moved))
  const name = win.locator('.ctxmenu .mi-in input')
  await expect(name).toHaveValue(titleOfM2)
  await name.fill(EDITED_MILESTONE_TITLE)
  await name.press('Enter')

  const m2 = () => win.evaluate(async () => {
    const project = await (window as unknown as MeridianWindow).meridian
      .call('project.get', { id: 'draft' }) as { milestones: { id: string; title: string; date: string }[] }
    return project.milestones.find((m) => m.id === 'm2')!
  })
  await expect.poll(async () => (await m2()).title).toBe(EDITED_MILESTONE_TITLE)
  const saved = await m2()
  // Editing the name did not revert the date set by the drag.
  expect(saved.date).toBe(moved)
})

test('新建一个任务再删掉,任务数前后一致', async ({ win }) => {
  await gotoProject(win)
  await expect(win.locator('#taskList .ddlrow')).toHaveCount(ACTIVE_TASK_ROWS)

  await win.locator('.section-heading-actions .add-action', { hasText: '任务' }).click()
  await win.locator('#taskList .task-create-row input').fill(NEW_TASK_TITLE)
  await win.locator('#taskList .task-create-row input').press('Enter')

  await expect(win.locator('#taskList .ddlrow')).toHaveCount(ACTIVE_TASK_ROWS + 1)
  expect((await readDraft(win)).tasks.some((t) => t.title === NEW_TASK_TITLE)).toBe(true)

  await fromRowMenu(win.locator('#taskList .ddlrow', { hasText: NEW_TASK_TITLE }), '删除')

  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已删除任务')
  await expect(win.locator('#taskList .ddlrow')).toHaveCount(ACTIVE_TASK_ROWS)
  expect((await readDraft(win)).tasks.some((t) => t.title === NEW_TASK_TITLE)).toBe(false)
})

/** The parts of the draft project a removal on its page can take away, read from Core, bypassing the UI. */
const removable = (win: Page) => call<{
  tasks: unknown[]; milestones: unknown[]; relations: unknown[]; papers: string[]; attachments: unknown[]
}>(win, 'project.get', { id: 'draft' })

/** Clicks Undo on the notice the last write showed, and waits for the notice to close; the caller waits for what comes back. */
async function undoFromNotice(win: Page): Promise<void> {
  const undo = win.locator('#notice .btn')
  await expect(undo).toHaveText('撤销')
  await undo.click()
  await expect(win.locator('#notice')).not.toHaveClass(/\bshow\b/)
}

test('删掉一条任务,提示里的撤销把它原样放回计划', async ({ win }) => {
  await gotoProject(win)
  const before = (await removable(win)).tasks
  const row = win.locator('#taskList .ddlrow[data-row="t2"]')
  await fromRowMenu(row, '删除')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已删除任务')
  await expect(row).toHaveCount(0)

  await undoFromNotice(win)
  await expect(row).toHaveCount(1)
  expect((await removable(win)).tasks).toEqual(before)
})

test('在计划里删掉一个里程碑,提示里的撤销把它原样放回', async ({ win }) => {
  await gotoProject(win)
  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '里程碑' }).click()
  const before = (await removable(win)).milestones
  const row = win.locator('#msList .milestone-row[data-row="m2"]')
  await fromRowMenu(row, '删除')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已删除里程碑')
  await expect(row).toHaveCount(0)

  await undoFromNotice(win)
  await expect(row).toHaveCount(1)
  expect((await removable(win)).milestones).toEqual(before)
})

test('在时间线上删掉一个里程碑,提示里的撤销把它放回时间线', async ({ win }) => {
  await gotoProject(win)
  const before = (await removable(win)).milestones
  const diamond = await revealMilestone(win, 'draft/m2')
  await diamond.click()
  await expect(win.locator('.ctxmenu .rh')).toHaveText('里程碑')
  await win.locator('.ctxmenu .mi.danger').click()
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已删除里程碑')
  await expect(diamond).toHaveCount(0)

  await undoFromNotice(win)
  await expect(diamond).toBeVisible()
  expect((await removable(win)).milestones).toEqual(before)
})

test('移除一条关联,提示里的撤销把它放回原处', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const before = (await removable(win)).relations
  const first = side.locator('.wkrel .tagchip[data-wk]').first()
  const [page, text] = [(await first.getAttribute('data-wk'))!, await first.innerText()]
  const chip = side.locator(`.wkrel .tagchip[data-wk="${page}"]`)
  await rowAction(chip, '.rx')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText(`已移除关联「${text}」`)
  await expect(chip).toHaveCount(0)

  await undoFromNotice(win)
  await expect(chip).toHaveCount(1)
  expect((await removable(win)).relations).toEqual(before)
})

test('移除一篇关联论文,提示里的撤销把它放回', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const before = (await removable(win)).papers
  const paper = (await side.locator('.wkrel [data-paper]').first().getAttribute('data-paper'))!
  const chip = side.locator(`.wkrel [data-paper="${paper}"]`)
  await rowAction(chip, '.rx')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText(/^已移除关联「.+」$/)
  await expect(chip).toHaveCount(0)

  await undoFromNotice(win)
  await expect(chip).toHaveCount(1)
  expect((await removable(win)).papers).toEqual(before)
})

test('删掉一个附件,提示里的撤销把它放回', async ({ win }) => {
  await gotoProject(win)
  const rows = win.locator('.screenslot:not([hidden]) .attachment-list .attrow')
  const before = (await removable(win)).attachments
  await expect(rows).toHaveCount(before.length)
  await rowAction(rows.first(), '.ax')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已移入垃圾桶')
  await expect(rows).toHaveCount(before.length - 1)

  await undoFromNotice(win)
  await expect(rows).toHaveCount(before.length)
  expect((await removable(win)).attachments).toEqual(before)
})

test('移除一个主题,提示里的撤销把它放回', async ({ win }) => {
  await win.locator('[data-desk="resproj"]').waitFor()
  await call(win, 'project.update', { id: 'draft', patch: { topics: ['speculative decoding', 'kv cache eviction'] } })
  await gotoProject(win)
  const chips = win.locator('.screenslot:not([hidden]) .project-topics .tagchip:not(.tagadd)')
  await expect(chips).toHaveCount(2)
  await rowAction(chips.first(), '.rx')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已更新主题')
  await expect(chips).toHaveText(['kv cache eviction'])

  await undoFromNotice(win)
  await expect(chips).toHaveText(['speculative decoding', 'kv cache eviction'])
  const { topics } = await call<{ topics: string[] }>(win, 'project.get', { id: 'draft' })
  expect(topics).toEqual(['speculative decoding', 'kv cache eviction'])
})

test('科研图展示多个活跃节点,节点以只读 Markdown、分支结果与 Agent 记录呈现', async ({ win }) => {
  await gotoProject(win)
  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  const graph = win.locator('.rgraph')
  await expect(graph.locator('.active-path')).toHaveCount(0)
  // Fixture has two active siblings (wide, prefix) under knee: both routes (root-knee, knee-wide,
  // knee-prefix) are on an active path, so both edges and both leaf nodes light up.
  await expect(graph.locator('.redges path.active')).toHaveCount(3)
  await expect(graph.locator('.active-edge-flows path')).toHaveCount(3)
  await expect(graph.locator('.rgn.active-leaf')).toHaveCount(2)
  await expect(graph.locator('.rgn[data-node="root"]')).not.toHaveClass(/active-leaf/)
  await expect(graph.locator('.rgn[data-node="root"]')).toHaveClass(/active-path-node-graph/)

  await graph.locator('.rgn[data-node="root"]').click()
  const panel = win.locator('.screenslot:not([hidden]) .project-detail-panel')
  await expect(panel.locator('.node-markdown')).toContainText('核心问题是')
  await expect(panel.locator('.node-branch-group.useful .entity-link')).toHaveText('树宽收益拐点')
  await expect(panel.locator('.node-branch-group.dead .entity-link')).toHaveText('draft 提前停止策略')
  await expect(panel.getByText('写入 Wiki')).toHaveCount(0)
  await expect(panel.locator('input')).toHaveCount(0)

  await panel.locator('.node-branch-list .entity-link', { hasText: '树宽收益拐点' }).click()
  await expect(panel.locator('.panel-head-title')).toHaveText('树宽收益拐点')
  await expect(panel.locator('.node-markdown')).toContainText('Hypothesis')
  // wide and prefix are both in active_nodes, so both land in the in-progress group, not repairable/candidate.
  await expect(panel.locator('.node-branch-group.active .entity-link')).toHaveCount(2)
  await expect(panel.locator('.node-branch-group.repairable .entity-link')).toHaveCount(0)
  await expect(panel.locator('.node-branch-group.candidate .entity-link')).toHaveCount(0)
})

test('科研图节点上下居中且可缩放平移,分支和科研记录在正文上方', async ({ win }) => {
  await gotoProject(win)
  const gantt = win.locator('.gantt')
  const detail = win.locator('.project-detail-page')
  const [ganttBefore, detailBefore] = await Promise.all([gantt.boundingBox(), detail.boundingBox()])
  expect(Math.round(detailBefore!.x)).toBe(Math.round(ganttBefore!.x))
  expect(Math.round(detailBefore!.width)).toBe(Math.round(ganttBefore!.width))

  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  const viewport = win.locator('.rgraph-viewport')
  const firstNode = viewport.locator('.rgn').first()
  const [rootBox, kneeBox, stopBox] = await Promise.all([
    viewport.locator('.rgn[data-node="root"]').boundingBox(),
    viewport.locator('.rgn[data-node="knee"]').boundingBox(),
    viewport.locator('.rgn[data-node="stop"]').boundingBox(),
  ])
  expect(Math.round(kneeBox!.x)).toBe(Math.round(stopBox!.x))
  expect(Math.abs(kneeBox!.y - stopBox!.y)).toBeGreaterThan(40)
  const childMidpoint = ((kneeBox!.y + kneeBox!.height / 2) + (stopBox!.y + stopBox!.height / 2)) / 2
  expect(Math.abs(rootBox!.y + rootBox!.height / 2 - childMidpoint)).toBeLessThanOrEqual(2)
  const centered = await viewport.evaluate((element) => {
    const view = element.getBoundingClientRect()
    const nodes = [...element.querySelectorAll('.rgn')].map((node) => node.getBoundingClientRect())
    return {
      delta: Math.abs((Math.min(...nodes.map((node) => node.top))
        + Math.max(...nodes.map((node) => node.bottom))) / 2 - (view.top + view.bottom) / 2),
      heights: nodes.map((node) => Math.round(node.height)),
    }
  })
  expect(centered.delta).toBeLessThanOrEqual(2)
  expect(new Set(centered.heights)).toEqual(new Set([48]))
  const colors = await win.evaluate(() => {
    const resolve = (token: string) => {
      const probe = document.createElement('div')
      probe.style.color = `var(${token})`
      document.body.appendChild(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    }
    return {
      progress: resolve('--warn'), verified: resolve('--good'),
      failed: resolve('--bad'), candidate: resolve('--ter'),
    }
  })
  await expect(viewport.locator('.rgn.repairable .nd').first()).toHaveCSS('fill', colors.progress)
  await expect(viewport.locator('.rgn.supported .nd').first()).toHaveCSS('fill', colors.verified)
  await expect(viewport.locator('.rgn.dead .nd').first()).toHaveCSS('fill', colors.failed)
  await expect(viewport.locator('.rgn.unresolved .nd').first()).toHaveCSS('fill', colors.candidate)

  const beforeZoom = (await firstNode.boundingBox())!
  await viewport.getByRole('button', { name: '放大科研图' }).click()
  const afterZoom = (await firstNode.boundingBox())!
  expect(afterZoom.width).toBeGreaterThan(beforeZoom.width)

  await viewport.locator('.zoom-control-reset').click()
  const reset = (await firstNode.boundingBox())!
  const box = (await viewport.boundingBox())!
  await win.mouse.move(box.x + 8, box.y + 8)
  await win.mouse.down()
  await win.mouse.move(box.x + 58, box.y + 38, { steps: 5 })
  await win.mouse.up()
  const moved = (await firstNode.boundingBox())!
  expect(Math.round(moved.x - reset.x)).toBe(50)
  expect(Math.round(moved.y - reset.y)).toBe(30)

  await viewport.locator('.zoom-control-reset').click()
  const mainWidth = (await detail.locator('.wkmain').boundingBox())!.width
  // An empty section is hidden: root has branches but no records, knee has both.
  await viewport.locator('.rgn[data-node="root"]').click()
  await expect(detail.locator('.project-detail-panel .section-heading', { hasText: /^分支 ·/ })).toHaveCount(1)
  await expect(detail.locator('.project-detail-panel .section-heading', { hasText: /^科研记录/ })).toHaveCount(0)
  await viewport.locator('.rgn[data-node="knee"]').click()
  await expect(detail.locator('.panel-head-title')).toHaveText('树宽收益拐点')
  const branchHeading = detail.locator('.project-detail-panel .section-heading', { hasText: /^分支 ·/ })
  const recordHeading = detail.locator('.project-detail-panel .section-heading', { hasText: /^科研记录 ·/ })
  const markdown = detail.locator('.node-markdown')
  await expect(detail.locator('.node-document-metadata')).toHaveCount(0)
  const [branchBox, recordBox, markdownBox] = await Promise.all([
    branchHeading.boundingBox(), recordHeading.boundingBox(), markdown.boundingBox(),
  ])
  expect(branchBox!.y).toBeLessThan(recordBox!.y)
  expect(recordBox!.y).toBeLessThan(markdownBox!.y)
  // The panel takes its width at once; the poll waits for the render that opens it.
  await expect.poll(async () => (await detail.locator('.wkmain').boundingBox())!.width).toBeLessThan(mainWidth)
  expect(Math.round((await detail.boundingBox())!.width)).toBe(Math.round(ganttBefore!.width))
})

test('节点阅读态保留科研图并扩宽右栏,可直接切换节点', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden]) .wkpage')
  const rail = page.locator('.wkside')
  const side = page.locator('.project-detail-panel')
  const propertyWidth = await rail.evaluate((element) => element.getBoundingClientRect().width)

  await page.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  await page.locator('.rgraph .rgn[data-node="knee"]').click()

  await expect(page).toHaveClass(/\bnode-reading\b/)
  await expect(page.locator('.rgraph')).toBeVisible()
  await expect(rail).toHaveCount(0)
  await expect(side).toHaveClass(/\bside-panel--card\b/)
  expect(await side.evaluate((element) => getComputedStyle(element).transitionProperty))
    .not.toContain('flex-basis')
  await expect(side.locator('.panel-head-title')).toHaveText('树宽收益拐点')
  await expect.poll(() => side.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(propertyWidth + 120)

  await page.locator('.rgraph .rgn[data-node="stop"]').click()
  await expect(side.locator('.panel-head-title')).toHaveText('draft 提前停止策略')
  await expect(page.locator('.rgraph .rgn[data-node="stop"]')).toHaveClass(/\bsel\b/)

  await side.locator('button[aria-label="收起详情"]').click()
  await expect(page).not.toHaveClass(/\bnode-reading\b/)
  await expect(side).toHaveCount(0)
  await expect(rail.locator('.section-heading').first()).toHaveText('属性')
})

test('任务详情头部的收起钮在标题上方单独一行靠右,长标题每一行都占满头部的整行宽度', async ({ win }) => {
  const title = '汇总今天的宽度扫描结果并把每个树宽下的接受率和端到端加速比整理成一张对比表交给组会'
  // The plan's list shows the open tasks; this one is the first of them.
  const task = (await readDraft(win)).tasks.find((held) => held.title === '宽树实验 B≥8')!
  await call(win, 'project.updateTask', { projectId: 'draft', taskId: task.id, patch: { title } })
  await gotoProject(win)
  await win.locator(`#taskList .ddlrow[data-row="${task.id}"] .plan-name`).click()
  const side = win.locator('.screenslot:not([hidden]) .project-detail-panel')
  await expect(side.locator('.panel-head-title')).toHaveText(title)

  // The same head as the paper detail's: Han text breaks between any two characters, so every full line ends less than a character short.
  const head = await panelHead(side.locator('.panel-head'), '.panel-head-title', '.icbtn')
  expect(head.actions.map(({ label, width, height }) => [label, Math.round(width), Math.round(height)])).toEqual([['收起详情', 24, 24]])
  expect(Math.abs(head.actions[0]!.right - head.content.right)).toBeLessThan(1)
  expect(Math.round(head.actions[0]!.top - head.content.top)).toBe(0)
  expect(head.actions[0]!.top + head.actions[0]!.height).toBeLessThanOrEqual(head.title.top)
  expect([head.title.left - head.content.left, head.content.right - head.title.right].map(Math.round)).toEqual([0, 0])
  expect(head.title.lines.length).toBeGreaterThanOrEqual(2)
  expect(head.title.lines.slice(0, -1).map((line) => ({
    starts: Math.abs(line.left - head.content.left) < 1,
    fills: head.content.right - line.right < head.title.fontSize,
  }))).toEqual(head.title.lines.slice(0, -1).map(() => ({ starts: true, fills: true })))
})

test('在项目详情里再点侧栏的「项目」,回到项目列表;返回键在页头标题左边', async ({ win }) => {
  await gotoProject(win)
  const shown = win.locator('.screenslot:not([hidden])')
  const back = shown.locator('.desk-head .back')
  await expect(back).toHaveCount(1)
  const [backBox, titleBox] = await Promise.all([back.boundingBox(), shown.locator('.desk-head .t').boundingBox()])
  expect(backBox!.x + backBox!.width).toBeLessThanOrEqual(titleBox!.x)

  await win.locator('[data-desk="resproj"]').click()
  await expect(shown.locator('[data-proj="draft"]')).toHaveCount(1)
  await expect(back).toHaveCount(0)
})

test('科研记录在记录和科研图之间切换,标题留在原处,记录短也不留空白', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden]) .wkpage')
  const heading = page.locator('.section-heading', { hasText: '科研记录' })
  const toggle = (name: string) => heading.locator('.segmented-control>button', { hasText: name }).click()
  const top = () => heading.evaluate((el) => Math.round(el.getBoundingClientRect().top))
  const viewHeight = () => page.locator('.record-view').evaluate((el) => Math.round(el.getBoundingClientRect().height))

  await toggle('科研图')
  await expect(page.locator('.rgraph')).toBeVisible()
  const graphHeight = await viewHeight()
  // Scroll so the graph is in view, then switch back to the shorter activity feed.
  await heading.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  const held = await top()
  await toggle('记录')
  await expect(page.locator('.evlist')).toBeVisible()
  // The heading holds its place unless the shorter page cannot scroll that far; then it sits as
  // high as the page allows, with nothing padded in to fake the old height.
  const scroller = win.locator('.screenslot:not([hidden]) .desk-body')
  const atEnd = await scroller.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)
  if (!atEnd) expect(await top()).toBe(held)
  expect(await viewHeight()).toBeLessThan(graphHeight)
  expect(await page.locator('.record-view').evaluate((el) => getComputedStyle(el).minHeight)).toBe('0px')
})

test('标签页组里有一行的标签页和空着的一样高:科研计划与科研记录切换时下面的小标题不动', async ({ win }) => {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="moe"]').click()
  const page = win.locator('.screenslot:not([hidden]) .wkpage')
  await page.locator('#taskList').waitFor()
  // moe has one task and no milestone, one record, one conclusion and no research graph.
  const groups = [
    { heading: '科研计划', next: '科研记录', tabs: { 任务: 'row', 里程碑: 'empty' } },
    { heading: '科研记录', next: '关联想法', tabs: { 记录: 'row', 实验结论: 'row', 科研图: 'empty' } },
  ] as const
  const rowHeight = await win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--row-list-h').trim())
  for (const group of groups) {
    const heading = page.locator('.section-heading', { hasText: group.heading })
    const shown: Record<string, { content: string; panel: number; next: number }> = {}
    for (const tab of Object.keys(group.tabs)) {
      await heading.locator('.segmented-control>button', { hasText: tab }).click()
      shown[tab] = await heading.evaluate((el, next) => {
        const panel = el.nextElementSibling!
        const following = [...document.querySelectorAll('.screenslot:not([hidden]) .wkpage .section-heading')]
          .find((candidate) => candidate.textContent!.startsWith(next))!
        const rows = panel.querySelectorAll('.item--row').length
        return {
          content: rows === 1 ? 'row' : rows === 0 && panel.querySelector('.empty-state') !== null ? 'empty' : `${rows} rows`,
          panel: panel.getBoundingClientRect().height,
          next: following.getBoundingClientRect().top - el.getBoundingClientRect().top,
        }
      }, group.next)
    }
    expect(Object.fromEntries(Object.entries(shown).map(([tab, held]) => [tab, held.content])), group.heading).toEqual(group.tabs)
    expect(Object.values(shown).map((held) => `${held.panel}px`), group.heading).toEqual(Object.keys(group.tabs).map(() => rowHeight))
    expect(new Set(Object.values(shown).map((held) => held.next)).size, group.heading).toBe(1)
  }
})

test('切换科研图节点:右栏高度不随内容变,页面不跟着跳,新节点从顶部读起', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden]) .wkpage')
  const side = page.locator('.project-detail-panel')
  const scroller = side.locator('.panel-body')
  await page.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  // Nodes are activated with a dispatched click: a pointer click would first scroll the node into
  // view, and this test measures the page's own movement.
  await page.locator('.rgraph .rgn[data-node="knee"]').dispatchEvent('click')
  await expect(side.locator('.panel-head-title')).toHaveText('树宽收益拐点')

  const measure = () => side.evaluate((pane) => {
    let scroller: HTMLElement | null = pane.parentElement
    while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
    return {
      paneHeight: Math.round(pane.getBoundingClientRect().height),
      pageHeight: scroller?.scrollHeight ?? 0,
      pageScroll: scroller?.scrollTop ?? 0,
    }
  })
  await scroller.evaluate((pane) => { pane.scrollTop = 120 })
  const before = await measure()

  await page.locator('.rgraph .rgn[data-node="stop"]').dispatchEvent('click')
  await expect(side.locator('.panel-head-title')).toHaveText('draft 提前停止策略')
  expect(await measure()).toEqual(before)
  expect(await scroller.evaluate((pane) => pane.scrollTop)).toBe(0)
})

test('新任务行开着且打了字时按侧栏会话的「...」:任务照样建成,菜单打开', async ({ win }) => {
  await gotoProject(win)
  const titles = () => call<{ tasks: { title: string }[] }>(win, 'project.get', { id: 'draft' })
    .then((p) => p.tasks.map((task) => task.title))
  const before = await titles()
  await win.locator('.section-heading-actions .add-action', { hasText: '任务' }).click()
  const input = win.locator('#taskList .task-create-row input')
  await input.fill('按菜单触发器建成的任务')
  await expect(input).toHaveValue('按菜单触发器建成的任务')

  // The DropdownMenu trigger opens on pointerdown and calls preventDefault, so no mousedown follows.
  const chat = win.locator('#chatList .chat-row').first()
  await chat.hover()
  await chat.locator('.dots').click()
  await expect(win.locator('[role="menu"]')).toHaveCount(1)
  await expect(input).toHaveCount(0)
  const after = await titles()
  expect(after).toHaveLength(before.length + 1)
  expect(after).toContain('按菜单触发器建成的任务')
})

test('科研计划:新建任务那一行和已有行同一套样子,日期、时段、优先级和状态落在已有行的同一列,输入框是共用的原位外观', async ({ win }) => {
  await gotoProject(win)
  const plan = win.locator('.screenslot:not([hidden]) .project-plan')
  await plan.locator('[aria-label="添加任务"]').first().click()
  const draft = plan.locator('.task-create-row')
  await expect(draft).toHaveCount(1)

  const cells = ['.task-date-part', '.task-clock-part', '.plan-priority', '.state-cell']
  const columns = (row: Locator) => row.evaluate((element, selectors) => selectors.map((selector) => {
    const box = element.querySelector(selector)!.getBoundingClientRect()
    return [Math.round(box.left), Math.round(box.width)]
  }), cells)
  expect(await columns(draft)).toEqual(await columns(plan.locator('#taskList .task-row:not(.task-create-row)').first()))

  const input = await draft.locator('input').evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      border: style.borderTopWidth, background: style.backgroundColor,
      // The height the input takes in its row: its box less the negative margins its edge and padding lie in.
      rowHeight: el.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom),
      lineHeight: parseFloat(style.lineHeight),
    }
  })
  expect(input.border).toBe('1px')
  expect(input.background).toBe(await fieldRgb(win))
  expect(input.rowHeight).toBeCloseTo(input.lineHeight, 1)
  await win.screenshot({ path: resolve(import.meta.dirname, '../outputs/e2e/shots/project-task-draft.png') })
})

test('关联:chip 可以拖到同一行的别的位置,顺序写进库里', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const wikiRow = side.locator('.wkrel').filter({ has: win.locator('.rl', { hasText: 'Wiki' }) })
  const chips = wikiRow.locator('.tagchip')
  const before = await chips.allInnerTexts()
  expect(before.length).toBeGreaterThan(1)

  // Drop the last chip on the left half of the first one.
  const last = chips.nth(before.length - 1)
  const first = chips.first()
  const target = (await first.boundingBox())!
  await last.dispatchEvent('dragstart', { dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })
  await first.dispatchEvent('dragover', {
    clientX: target.x + 2, clientY: target.y + target.height / 2,
    dataTransfer: await win.evaluateHandle(() => new DataTransfer()),
  })
  await first.dispatchEvent('drop', { dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })

  await expect(chips.first()).toHaveText(before[before.length - 1]!)
  const stored = await call<{ relations: { group: string; items: { text: string }[] }[] }>(
    win, 'project.get', { id: 'draft' },
  )
  expect(stored.relations.find((row) => row.group === 'Wiki')!.items.map((i) => i.text))
    .toEqual([before[before.length - 1], ...before.slice(0, -1)])
})

test('关联:可以加一个链接并给它起显示名,点 chip 交给系统浏览器打开', async ({ app, win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const linkRow = side.locator('.wkrel').filter({ has: win.locator('.rl', { hasText: '链接' }) })

  await side.locator('[aria-label="添加关联"]').click()
  await side.locator('.wkrel .segmented-control>button', { hasText: '链接' }).click()
  const fields = linkRow.locator('.urldraft input')
  await expect(fields).toHaveCount(2)
  // The group switch sits inside the draft row: switching away and back keeps the row open.
  await side.locator('.wkrel .segmented-control>button', { hasText: 'Wiki' }).click()
  await expect(side.locator('.wkrel .inedit')).toHaveCount(1)
  await side.locator('.wkrel .segmented-control>button', { hasText: '论文' }).click()
  await expect(side.locator('.wkrel .inedit')).toHaveCount(1)
  await side.locator('.wkrel .segmented-control>button', { hasText: '链接' }).click()
  await expect(fields).toHaveCount(2)
  await fields.nth(0).fill('wandb.ai/team/draft')
  await fields.nth(1).fill('实验看板')
  await win.screenshot({ path: resolve(import.meta.dirname, '../outputs/e2e/shots/project-url-draft.png') })
  await fields.nth(1).press('Enter')

  const chip = linkRow.locator('.tagchip')
  await expect(chip).toHaveText('实验看板')
  await expect(chip).toHaveAttribute('data-url', 'https://wandb.ai/team/draft')
  await expect(linkRow.locator('.urldraft')).toHaveCount(0)
  const stored = await call<{ relations: { group: string; items: { text: string; url?: string }[] }[] }>(
    win, 'project.get', { id: 'draft' },
  )
  expect(stored.relations.find((row) => row.group === 'links')!.items.map(({ text, url }) => ({ text, url })))
    .toEqual([{ text: '实验看板', url: 'https://wandb.ai/team/draft' }])

  // The chip hands the address to the system browser instead of navigating the app window.
  await app.evaluate(({ shell }) => {
    const seen: string[] = []
    ;(globalThis as { openedUrls?: string[] }).openedUrls = seen
    shell.openExternal = (url: string) => { seen.push(url); return Promise.resolve() }
  })
  await chip.click()
  await expect.poll(() => app.evaluate(() => (globalThis as { openedUrls?: string[] }).openedUrls))
    .toEqual(['https://wandb.ai/team/draft'])
  await win.screenshot({ path: resolve(import.meta.dirname, '../outputs/e2e/shots/project-url-chip.png') })
})

test('关联:占位 chip 长在它将来待的那一组行首,切组跟着搬', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  // Identify a group row by the name label at its start: the placeholder's segmented control also
  // shows the Wiki and Papers labels, so a hasText filter on .wkrel would match both groups in the
  // row that holds the placeholder.
  const group = (name: string) =>
    side.locator('.wkrel').filter({ has: win.locator('.rl', { hasText: name }) })
  const pageRow = group('Wiki')
  const paperRow = group('论文')
  const pageChips = await pageRow.locator('.tagchip').count()

  await side.locator('[aria-label="添加关联"]').click()
  await expect(pageRow.locator('.inedit')).toHaveCount(1)
  await expect(pageRow.locator('.tagchip')).toHaveCount(pageChips)
  // A new link lands first in its group, so the placeholder opens right after the group name.
  expect(await pageRow.evaluate((row) => row.querySelector('.rl')!.nextElementSibling!.className)).toBe('reladd')
  // The segmented control and the input stay together: when the chip row overflows they wrap as one,
  // never split across two lines.
  const pair = await pageRow.locator('.reladd').evaluate((el) => ({
    seg: el.querySelector('.segmented-control')!.getBoundingClientRect().top,
    input: el.querySelector('.inedit')!.getBoundingClientRect().top,
  }))
  expect(Math.abs(pair.seg - pair.input)).toBeLessThan(4)

  // Switch to the paper group: the placeholder moves there whole. That row's own linked papers now come
  // from project.papers and only offer picking an existing paper, so switch back to Wiki to submit free text.
  await side.locator('.wkrel .segmented-control>button', { hasText: '论文' }).click()
  await expect(pageRow.locator('.inedit')).toHaveCount(0)
  await expect(paperRow.locator('.inedit')).toHaveCount(1)

  await side.locator('.wkrel .segmented-control>button', { hasText: 'Wiki' }).click()
  await expect(paperRow.locator('.inedit')).toHaveCount(0)
  await expect(pageRow.locator('.inedit')).toHaveCount(1)

  await pageRow.locator('.inedit').fill('端到端关联')
  await expect(pageRow.locator('.inedit')).toHaveAttribute('aria-busy', 'false')
  await pageRow.locator('.inedit').press('Enter')
  await expect(pageRow.locator('.tagchip')).toHaveCount(pageChips + 1)
  await expect(pageRow.locator('.tagchip').first()).toContainText('端到端关联')

  // Esc removes the placeholder, the number of chips in both groups remains unchanged.
  await side.locator('[aria-label="添加关联"]').click()
  await side.locator('.wkrel .inedit').press('Escape')
  await expect(side.locator('.wkrel .inedit')).toHaveCount(0)
  await expect(pageRow.locator('.tagchip')).toHaveCount(pageChips + 1)

  // Click outside the placeholder and remove it
  await side.locator('[aria-label="添加关联"]').click()
  await expect(side.locator('.wkrel .inedit')).toHaveCount(1)
  await win.locator('.screenslot:not([hidden]) .wkmain .section-heading', { hasText: '项目随笔' }).click()
  await expect(side.locator('.wkrel .inedit')).toHaveCount(0)
  await expect(pageRow.locator('.tagchip')).toHaveCount(pageChips + 1)
})

test('关联论文的候选行按标题任意一段命中,显示的是完整标题不是缩短过的', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  await side.locator('[aria-label="添加关联"]').click()
  await side.locator('.wkrel .segmented-control>button', { hasText: '论文' }).click()
  const paperRow = side.locator('.wkrel').filter({ has: win.locator('.rl', { hasText: '论文' }) })
  // "Activation-aware Weight" only occurs after the colon; a short-title-only search or display would miss it.
  await paperRow.locator('.inedit').fill('Activation-aware Weight')
  const hit = win.locator('.pickhits .rrow', { hasText: 'AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration' })
  await expect(hit).toHaveCount(1)
  await hit.click()
  // This row also merges in a free-text relation item ("LongSpec") after the linked papers,
  // so pick the new chip by its paper id rather than assuming it is the last one.
  await expect(paperRow.locator('[data-paper="2306.00978"]'))
    .toContainText('AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration')
})

test('关联 chip 上的 × 悬停才出现,落在 chip 自己的框里;点它只移除这一条,不顺带打开它挂着的那一页', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const linked = side.locator('.wkrel .tagchip[data-wk]')
  const before = await linked.count()
  const chip = linked.first()
  const text = await chip.innerText()

  // Inside its chip's own box the × cannot be clipped by the side column, even on a chip as wide as the column.
  for (const each of await side.locator('.wkrel .tagchip').all()) {
    const remove = each.locator('.rx')
    await expect(each.locator('.row-actions')).toHaveCSS('opacity', '0')
    await each.hover()
    await expect(each.locator('.row-actions')).toHaveCSS('opacity', '1')
    const [outer, inner] = await Promise.all([each.boundingBox(), remove.boundingBox()])
    expect(inner!.y).toBeGreaterThanOrEqual(outer!.y)
    expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width)
  }
  await rowAction(chip, '.rx')
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])
  await expect(win.locator('.screenslot:not([hidden]) .desk-head .t')).toHaveText('draft 效率')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText(`已移除关联「${text}」`)
  await expect(linked).toHaveCount(before - 1)
  const relations = (await call<{ relations: { items: { text: string }[] }[] }>(win, 'project.get', { id: 'draft' })).relations
  expect(relations.flatMap((r) => r.items.map((i) => i.text))).not.toContain(text)
})

test('关联:点 chip 上的编辑就地改它,位置不变,改动写进库里', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const wikiRow = side.locator('.wkrel').filter({ has: win.locator('.rl', { hasText: 'Wiki' }) })
  const chips = wikiRow.locator('.tagchip')
  const before = await chips.allInnerTexts()
  const page = (await chips.first().getAttribute('data-wk'))!

  // Leaving the edit without a change closes it and leaves the item as it was, page link included.
  await rowAction(chips.first(), '.tagchip-edit')
  await win.locator('.screenslot:not([hidden]) .wkmain .section-heading', { hasText: '项目随笔' }).click()
  await expect(wikiRow.locator('.reladd')).toHaveCount(0)
  await expect(chips).toHaveText(before)
  await expect(chips.first()).toHaveAttribute('data-wk', page)

  await rowAction(chips.first(), '.tagchip-edit')
  const input = wikiRow.locator('.reladd .inedit')
  await expect(input).toHaveValue(before[0]!)
  await input.fill('端到端改名')
  await expect(input).toHaveAttribute('aria-busy', 'false')
  await input.press('Enter')

  await expect(wikiRow.locator('.reladd')).toHaveCount(0)
  await expect(chips).toHaveText(['端到端改名', ...before.slice(1)])
  const stored = await call<{ relations: { group: string; items: { text: string }[] }[] }>(
    win, 'project.get', { id: 'draft' },
  )
  expect(stored.relations.find((row) => row.group === 'Wiki')!.items.map((i) => i.text))
    .toEqual(['端到端改名', ...before.slice(1)])
})

test('属性格进入编辑时不改变右栏和值列宽度,字也不挪位', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const props = side.locator('.property-list')
  const field = props.locator('.property-label:text-is("名称") + .property-value > .metadata-field')
  const name = field.locator('.metadata-editable')
  const boxes = () => Promise.all([side.boundingBox(), props.boundingBox(), field.boundingBox()])
  const before = await boxes()
  const textBefore = await textBox(name)

  await name.click()
  const input = field.locator('.metadata-input')
  await expect(input).toBeVisible()
  expect(await boxes()).toEqual(before)
  expect(await textBox(input)).toEqual(textBefore)
})

test('属性栏多行的值(当前目标)进入编辑时,编辑框整个露在右栏里,右栏不横向滚动,字不挪位', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const field = side.locator('.property-label:text-is("当前目标") + .property-value > .metadata-field')
  const value = field.locator('.metadata-editable')
  const before = await textBox(value)

  await value.click()
  const input = field.locator('.metadata-input')
  await expectWholeInRail(side, input)
  expect((await textBox(input)).left).toBe(before.left)
})

test('属性栏点一个主题就地改它:编辑框里是它的字,整个露在右栏里,右栏不横向滚动,字不挪位', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const field = side.locator('.property-label:text-is("主题") + .property-value > .project-topics')
  const chip = field.locator('.tagchip-open').first()
  const text = await chip.innerText()
  const before = await textBox(chip.locator('.tagchip-text'))

  await chip.click()
  const input = field.locator('.tagin')
  await expect(input).toHaveValue(text)
  await expectWholeInRail(side, input)
  const after = await textBox(input)
  expect([after.left, after.top]).toEqual([before.left, before.top])
})

test('关联里加一条:页面和链接的就地输入框都整个露在右栏里,右栏不横向滚动,链接两格的字从右栏内容左缘起', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const { left } = await railEdges(side)

  await side.locator('[aria-label="添加关联"]').click()
  await expectWholeInRail(side, side.locator('.wkrel .reladd .inedit'))
  await side.locator('.wkrel .segmented-control>button', { hasText: '链接' }).click()
  const fields = side.locator('.urldraft input')
  await expect(fields).toHaveCount(2)
  await expectWholeInRail(side, fields.nth(0))
  expect((await textBox(fields.nth(0))).left).toBe(left)
  await fields.nth(1).focus()
  await expectWholeInRail(side, fields.nth(1))
  expect((await textBox(fields.nth(1))).left).toBe(left)
})

test('属性栏焦点格:焦点移走或点到格外都像回车一样写回,Esc 才放弃', async ({ win }) => {
  // Three edits, each checked in Core: many actionability checks for a hidden window; see `showWindow` in app.ts.
  test.slow()
  await gotoProject(win)
  const focusNow = () => call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const edit = side.locator('.property-label:text-is("当前目标") + .property-value > .metadata-field button.metadata-editable')
  const pin = side.locator('.metadata-input')

  // Moving focus out with the keyboard writes the typed text.
  await edit.click()
  await pin.fill('焦点移走就写回')
  await pin.press('Tab')
  await expect(pin).toHaveCount(0)
  await expect(edit).toHaveText('焦点移走就写回')
  expect(await focusNow()).toBe('焦点移走就写回')

  // Clicking outside the cell writes it too.
  await edit.click()
  await pin.fill('点外面也写回')
  await win.locator('.screenslot:not([hidden]) .wkmain .section-heading', { hasText: '项目随笔' }).click()
  await expect(pin).toHaveCount(0)
  await expect(edit).toHaveText('点外面也写回')
  expect(await focusNow()).toBe('点外面也写回')

  await edit.click()
  await pin.fill('Esc 放弃的当前目标')
  await pin.press('Escape')
  await expect(pin).toHaveCount(0)
  await expect(edit).toHaveText('点外面也写回')
  expect(await focusNow()).toBe('点外面也写回')
})

test('属性栏焦点格:回车后写被拒,格子仍在编辑、字还在', async ({ win }) => {
  await gotoProject(win)
  const before = await call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const edit = side.locator('button.metadata-editable', { hasText: before })
  const pin = side.locator('.metadata-input')

  await edit.click()
  await pin.fill('项目没了这段还想留着')
  // With the cell open, delete the project through Core, so Core really rejects the write Enter submits.
  await call(win, 'project.delete', { id: 'draft' })
  await pin.press('Enter')
  await expect(win.locator('#notice[data-tone="refusal"] .notice-text')).toHaveText('这一项已不存在')
  await expect(win.locator('.screenslot:not([hidden]) .page-error')).toHaveCount(0)
  await expect(pin).toHaveValue('项目没了这段还想留着')
})

test('就地输入框:关联占位与属性栏焦点格都是共用的原位外观,1px 边框、浅灰实底,焦点都不出环;按钮的环不受影响', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const sepStrong = await sepStrongRgb(win)
  const field = await fieldRgb(win)

  // The + that adds a link is a plain, still unclicked button; check its focus ring the keyboard way.
  // A prior Tab keypress puts Chromium's input-modality tracking into "keyboard" so the following
  // scripted focus() still counts as keyboard-driven, matching :focus-visible like a real Tab would.
  const relAdd = side.locator('.section-heading-actions [aria-label="添加关联"]')
  await win.keyboard.press('Tab')
  await relAdd.evaluate((el) => el.focus())
  await expect(relAdd).toHaveCSS('outline-style', 'solid')
  await expect(relAdd).toHaveCSS('outline-width', '2px')

  // .inedit: the link placeholder takes the one inline field look, a 1px edge over the field fill.
  await relAdd.click()
  const relInput = side.locator('.wkrel .inedit')
  await relInput.focus()
  await expect(relInput).toHaveCSS('outline-style', 'none')
  await expect(relInput).toHaveCSS('background-color', field)
  await expect(relInput).toHaveCSS('border-top-width', '1px')
  await expect(relInput).toHaveCSS('border-top-color', sepStrong)

  // .metadata-input of the property bar focus cell takes the same look (papers.spec.ts checks the same
  // class in the paper details).
  const before = await call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
  await side.locator('button.metadata-editable', { hasText: before }).click()
  const pin = side.locator('.metadata-input')
  await expect(pin).toHaveCSS('outline-style', 'none')
  await expect(pin).toHaveCSS('border-top-width', '1px')
  await expect(pin).toHaveCSS('border-right-width', '1px')
  await expect(pin).toHaveCSS('border-bottom-width', '1px')
  await expect(pin).toHaveCSS('border-left-width', '1px')
  await expect(pin).toHaveCSS('border-top-color', sepStrong)
  await expect(pin).toHaveCSS('background-color', field)
})

test.describe('属性栏焦点格:切到别的应用', () => {
  test('切回来不重新全选:接着打字接在原字后面,不是把原字替掉', async ({ app, win }) => {
    await gotoProject(win)
    const before = await call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
    const side = win.locator('.screenslot:not([hidden]) .wkside')
    const edit = side.locator('button.metadata-editable', { hasText: before })
    const pin = side.locator('.metadata-input')

    await edit.click()
    await pin.fill('切走前打的字')

    // Switch to another app and back: .metadata-input stayed mounted, so Blink gives focus back to it.
    const switcher = await appSwitcher(app, win)
    await switcher.away()
    await expect.poll(() => win.evaluate(() => document.hasFocus()), {
      message: '页面没有失去焦点,切走无从谈起',
    }).toBe(false)
    await switcher.back()
    await expect.poll(() => win.evaluate(() => document.hasFocus())).toBe(true)

    await pin.pressSequentially('后')
    await expect(pin).toHaveValue('切走前打的字后')
  })
})

test('属性栏焦点格保存后,照旧收起其他正在编辑的东西(随笔编辑器)', async ({ win }) => {
  await gotoProject(win)
  const before = await call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const main = win.locator('.screenslot:not([hidden]) .wkmain')
  const edit = side.locator('button.metadata-editable', { hasText: before })
  const pin = side.locator('.metadata-input')
  const memoActions = main.locator('.section-heading', { hasText: '项目随笔' }).locator('button')

  await main.locator('.memo [data-line]').first().click({ position: { x: 2, y: 4 } })
  await expect(memoActions).toHaveText(['取消', '保存'])

  await edit.click()
  await pin.fill('保存焦点格顺带收起随笔')
  await pin.press('Enter')
  await expect(memoActions).toHaveCount(0)
  await expect(main.locator('.memo .cm-editor')).toHaveCount(0)
})

test('项目随笔边写边渲染:写完「# 标题」回车,标题马上渲染,光标回到那一行又是原文,⌘回车照常存下', async ({ win }) => {
  await gotoProject(win)
  const main = win.locator('.screenslot:not([hidden]) .wkmain')
  const memo = main.locator('.memo')
  await memo.locator('[data-line]').first().click({ position: { x: 2, y: 4 } })
  await expect(memo.locator('.cm-content')).toBeFocused()
  // The cursor starts in the first block, where the click landed; the display formula further down already renders.
  await expect(memo.locator('.md-block .katex-display')).toHaveCount(1)

  await win.keyboard.press('ControlOrMeta+End')
  await win.keyboard.press('Enter')
  await win.keyboard.press('Enter')
  await win.keyboard.type('# 边写边渲染')
  await expect(memo.locator('.cm-line', { hasText: '# 边写边渲染' })).toHaveCount(1)
  await win.keyboard.press('Enter')
  await expect(memo.locator('.md-block h1')).toHaveText('边写边渲染')
  await expect(memo.locator('.cm-line', { hasText: '# 边写边渲染' })).toHaveCount(0)

  await win.keyboard.press('ArrowUp')
  await expect(memo.locator('.md-block h1')).toHaveCount(0)
  await expect(memo.locator('.cm-line', { hasText: '# 边写边渲染' })).toHaveCount(1)

  await win.keyboard.press('ControlOrMeta+Enter')
  await expect(memo.locator('.cm-editor')).toHaveCount(0)
  await expect(memo.locator('h1')).toHaveText('边写边渲染')
  expect((await call<{ memo: string }>(win, 'project.get', { id: 'draft' })).memo).toMatch(/重跑一遍再下结论。\n\n# 边写边渲染$/)
})

test('项目随笔里输入法组字时的回车和 ⌘回车归输入法:不换行、不保存,编辑器还开着', async ({ win }) => {
  await gotoProject(win)
  const main = win.locator('.screenslot:not([hidden]) .wkmain')
  const memo = main.locator('.memo')
  await memo.locator('[data-line]').first().click({ position: { x: 2, y: 4 } })
  await expect(memo.locator('.cm-content')).toBeFocused()
  await win.keyboard.press('ControlOrMeta+End')
  await win.keyboard.press('Enter')
  await win.keyboard.press('Enter')
  const lines = await memo.locator('.cm-line').count()

  // Chromium's own input-method path: keys pressed while this composition is open arrive with
  // isComposing set, as a real Chinese input method sends them.
  const platform = await win.evaluate(() => (window as unknown as MeridianWindow).meridian.platform)
  const cdp = await win.context().newCDPSession(win)
  await cdp.send('Input.imeSetComposition', { text: 'zhong', selectionStart: 5, selectionEnd: 5 })
  // CDP's modifier bits: 2 is Ctrl and 4 is Meta, the command key on macOS.
  for (const modifiers of [0, platform === 'darwin' ? 4 : 2]) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', modifiers, windowsVirtualKeyCode: 229 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', modifiers, windowsVirtualKeyCode: 229 })
  }
  await expect(memo.locator('.cm-editor')).toHaveCount(1)
  await expect(memo.locator('.cm-line')).toHaveCount(lines)
  await expect(memo.locator('.cm-line').last()).toHaveText('zhong')
})

test('项目列表点进详情,内容导航行的返回钮退回列表', async ({ win }) => {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').click()
  await expect(win.locator('.screenslot:not([hidden]) .desk-head .t')).toHaveText('draft 效率')
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])

  // Opened from the list there is no origin to return to, so Back goes up a level, to the project list.
  await win.locator('.screenslot:not([hidden]) .desk-head .back').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目'])
  await expect(win.locator('.screenslot:not([hidden]) [data-proj="draft"]')).toBeVisible()
})

test('任务四列各自编辑,点击行或任务名只打开任务详情,不改变任何列,改名从行尾「更多」菜单的重命名进入', async ({ win }) => {
  test.slow()
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .project-detail-panel')
  const rail = win.locator('.screenslot:not([hidden]) .wkside')
  const menu = win.locator('[role="menu"]')
  const radios = menu.locator('[role="menuitemradio"]')

  // Clicking the blank space of the row opens the task panel and no editor; each of the four columns only opens its own control.
  const row = win.locator('#taskList .ddlrow').first()
  await expect(row.locator('.dots')).toHaveCount(1)
  await expect(row.locator('.row-delete, .plan-rename')).toHaveCount(0)
  const title = await row.locator('.plan-name').textContent()
  await row.evaluate((element) => (element as HTMLElement).click())
  await expect(side.locator('.panel-head-title')).toHaveText(title!)
  await expect(row.locator('.metadata-input')).toHaveCount(0)
  await expect(win.locator('.schedule-form')).toHaveCount(0)
  await win.keyboard.press('Escape')
  await expect(side.locator('.panel-head-title')).toHaveCount(0)

  // The name opens the same panel, on a click and on Enter, and renaming starts from the row's … menu.
  await row.locator('.plan-name').click()
  await expect(side.locator('.panel-head-title')).toHaveText(title!)
  await expect(row.locator('.metadata-input')).toHaveCount(0)
  await win.keyboard.press('Escape')
  await expect(side.locator('.panel-head-title')).toHaveCount(0)
  await row.locator('.plan-name').focus()
  await win.keyboard.press('Enter')
  await expect(side.locator('.panel-head-title')).toHaveText(title!)
  await win.keyboard.press('Escape')
  await expect(side.locator('.panel-head-title')).toHaveCount(0)

  await fromRowMenu(row, '重命名')
  await expect(row.locator('.metadata-input')).toHaveCount(1)
  await expect(win.locator('.schedule-form')).toHaveCount(0)
  await win.keyboard.press('Escape')
  await expect(row.locator('.metadata-input')).toHaveCount(0)

  // The date and time-of-day triggers are two independent popovers now; open the date one.
  await row.locator('.task-date-part').click()
  await expect(win.locator('.schedule-form')).toBeVisible()
  await expect(row.locator('.metadata-input')).toHaveCount(0)
  await win.keyboard.press('Escape')

  await row.locator('.plan-priority').click()
  await expect(radios).toHaveText(['P0 · 紧急', 'P1 · 常规', 'P2 · 较低'])
  await win.keyboard.press('Escape')
  await row.locator('.state-cell').click()
  await expect(radios).toHaveText(['进行中', '计划中', '已完成'])
  await win.keyboard.press('Escape')

  // Status: three radio options, ACTIVE_PROJECT checked; clicking SHELVED_PROJECT writes it back.
  await rail.locator('.property-label:text-is("状态") + .property-value > .pv').click()
  await expect(radios).toHaveText([...PROJECT_STATUSES])
  await expect(radios.filter({ hasText: ACTIVE_PROJECT })).toHaveAttribute('aria-checked', 'true')
  await radios.filter({ hasText: SHELVED_PROJECT }).click()
  await expect.poll(async () => (await call<{ status: string }>(win, 'project.get', { id: 'draft' })).status).toBe(SHELVED_PROJECT)

  // Priority: the current P0 is checked; ArrowDown twice reaches P1 and Enter writes it back.
  await rail.locator('.property-label:text-is("优先级") + .property-value > .pv').click()
  await expect(radios).toHaveText(['P0 · 紧急', 'P1 · 常规', 'P2 · 较低'])
  await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true')
  await win.keyboard.press('ArrowDown')
  await win.keyboard.press('ArrowDown')
  await expect(radios.nth(1)).toHaveAttribute('data-highlighted', '')
  await win.keyboard.press('Enter')
  await expect.poll(async () => (await call<{ priority: string }>(win, 'project.get', { id: 'draft' })).priority).toBe('p1')
})

test('任务详情里手动给任务挂科研节点,面板里显示挂上的节点并写进库里;手动挂的可以取消', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .project-detail-panel')
  const linked = side.locator('.node-assignment .entity-link--node')
  const taskNodes = async () => (await call<{ taskNodes?: Record<string, string> }>(
    win, 'project.get', { id: 'draft' },
  )).taskNodes

  await win.locator('#taskList .ddlrow', { hasText: '宽树实验 B≥8' }).evaluate((element) => (element as HTMLElement).click())
  await expect(linked).toHaveCount(0)
  await side.locator('button', { hasText: '关联节点' }).click()
  await win.locator('[role="menuitemradio"]', { hasText: '树宽收益拐点' }).click()
  await expect(linked).toHaveText('树宽收益拐点')
  expect(await taskNodes()).toEqual({ t2: 'knee' })

  await side.locator('button', { hasText: '取消关联' }).click()
  await expect(linked).toHaveCount(0)
  expect(await taskNodes()).toBeUndefined()
})

test('任务与里程碑的状态格独立修改并立即写回 core', async ({ win }) => {
  await gotoProject(win)
  const before = await call<{
    tasks: { id: string; state: 'act' | 'plan' | 'done' }[]
    milestones: { id: string; date: string; done: boolean }[]
  }>(win, 'project.get', { id: 'draft' })
  // Done tasks and milestones sit in the collapsed archive, so the check uses the first open ones.
  const firstTask = before.tasks.find((task) => task.state !== 'done')!
  const nextState = { act: 'plan', plan: 'done', done: 'act' } as const
  const stateWord = { act: '进行中', plan: '计划中', done: '已完成' } as const

  const taskRow = win.locator(`#taskList .ddlrow[data-row="${firstTask.id}"]`)
  await taskRow.locator('.state-cell').click()
  await win.locator('[role="menuitemradio"]', { hasText: stateWord[nextState[firstTask.state]] }).click()
  await expect.poll(async () => (await call<{ tasks: { id: string; state: string }[] }>(win, 'project.get', { id: 'draft' }))
    .tasks.find((task) => task.id === firstTask.id)?.state).toBe(nextState[firstTask.state])

  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '里程碑' }).click()
  const firstMilestone = [...before.milestones].filter((milestone) => !milestone.done)
    .sort((a, b) => a.date.localeCompare(b.date))[0]!
  const milestoneRow = win.locator(`#msList .ddlrow[data-row="${firstMilestone.id}"]`)
  await milestoneRow.locator('.state-cell').click()
  await win.locator('[role="menuitemradio"]', { hasText: firstMilestone.done ? '未完成' : '已完成' }).click()
  await expect.poll(async () => (await call<{ milestones: { id: string; done: boolean }[] }>(win, 'project.get', { id: 'draft' }))
    .milestones.find((milestone) => milestone.id === firstMilestone.id)?.done).toBe(!firstMilestone.done)
})

test('「更多」菜单里红字的删除直接删除任务,不先确认,也不会先把这一行切进编辑态', async ({ win }) => {
  await gotoProject(win)
  const row = win.locator('#taskList .ddlrow').first()
  const taskId = await row.getAttribute('data-row')
  const bad = await win.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--bad-text)'
    document.body.appendChild(probe)
    const rgb = getComputedStyle(probe).color
    probe.remove()
    return rgb
  })
  await rowAction(row, '.dots')
  const remove = win.getByRole('menuitem', { name: '删除', exact: true })
  await expect(remove).toHaveCSS('color', bad)
  await remove.click()
  await expect(win.locator('[role="alertdialog"]')).toHaveCount(0)
  await expect(win.locator('#taskList .metadata-input')).toHaveCount(0)
  await expect(win.locator('.plan-time-pop')).toHaveCount(0)
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已删除任务')
  const project = await call<{ tasks: { id: string }[] }>(win, 'project.get', { id: 'draft' })
  expect(project.tasks.some((task) => task.id === taskId)).toBe(false)
})

/** Opens draft's research graph and clicks the knee node; returns the first heading of the column, the node panel's title while it shows. */
async function openNodePanel(win: Page) {
  await gotoProject(win)
  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  await win.locator('.rgraph .rgn[data-node="knee"]').click()
  const head = win.locator('.screenslot:not([hidden]) :is(.project-detail-panel .panel-head-title, .wkside .section-heading)').first()
  await expect(head).toContainText('树宽收益拐点')
  return head
}

test('科研图由 Agent 管理:空图没有 App 侧新增入口', async ({ win }) => {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('.screenslot:not([hidden]) [data-proj="sched"]').click()
  const main = win.locator('.screenslot:not([hidden]) .wkmain')
  await main.locator('.segmented-control>button', { hasText: '科研图' }).click()
  await expect(main.locator('.record-view .empty-state--section')).toHaveText('—')
  await expect(main.locator('.section-heading-actions .btn', { hasText: '节点' })).toHaveCount(0)
})

test('节点面板由 Agent 管理:标题、状态、记录与分支都不可在 App 编辑', async ({ win }) => {
  await gotoProject(win)
  const main = win.locator('.screenslot:not([hidden]) .wkmain')
  const side = win.locator('.screenslot:not([hidden]) .project-detail-panel')
  await main.locator('.segmented-control>button', { hasText: '科研图' }).click()
  await main.locator('.rgn[data-node="prefix"]').click()
  await expect(side.locator('.panel-head-title')).toHaveText('前缀复用配置')
  await expect(side.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0)
  await expect(side.getByText('删除节点')).toHaveCount(0)
  await expect(side.getByText('子节点')).toHaveCount(0)
})

test('节点面板开着时 Esc 先关任务名称格,再按一次才收面板', async ({ win }) => {
  const head = await openNodePanel(win)
  const row = win.locator('#taskList .ddlrow').first()
  await fromRowMenu(row, '重命名')
  await expect(row.locator('.metadata-input')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(row.locator('.metadata-input')).toHaveCount(0)
  await expect(head).toContainText('树宽收益拐点')

  await win.keyboard.press('Escape')
  await expect(head).toHaveText('属性')
})

test('节点面板开着时 Esc 先关新任务的日期编辑框,再按一次才收面板', async ({ win }) => {
  const head = await openNodePanel(win)
  await win.locator('.section-heading-actions .add-action', { hasText: '任务' }).click()
  await win.locator('#taskList .task-create-row .task-date-part').click()
  await expect(win.locator('.schedule-pop')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(win.locator('.schedule-pop')).toHaveCount(0)
  await expect(head).toContainText('树宽收益拐点')

  await win.keyboard.press('Escape')
  await expect(head).toHaveText('属性')
})

test('节点面板开着时 Esc 先关侧栏的会话菜单,再按一次才收面板', async ({ win }) => {
  const head = await openNodePanel(win)
  const chat = win.locator('#chatList .chat-row').first()
  await chat.hover()
  await chat.locator('.dots').click()
  await expect(win.locator('[role="menu"]')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(win.locator('[role="menu"]')).toHaveCount(0)
  await expect(head).toContainText('树宽收益拐点')

  await win.keyboard.press('Escape')
  await expect(head).toHaveText('属性')
})

test('节点面板开着时 Esc 先关全局搜索结果,再按一次才收面板', async ({ win }) => {
  const head = await openNodePanel(win)
  await win.locator('#sSearch').fill('Distillation-based')
  await expect(win.locator('#sRes')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(win.locator('#sRes')).toHaveCount(0)
  await expect(head).toContainText('树宽收益拐点')

  await win.keyboard.press('Escape')
  await expect(head).toHaveText('属性')
})

test('SSH 工作区的文件夹按钮叠开测试主机的文件夹选择框,从远端主目录点进文件夹,选择填进项目路径,添加后项目连到这台主机的这个文件夹', async ({ win }) => {
  await gotoProject(win)
  await win.locator('.screenslot:not([hidden]) button.pv.metadata-editable', { hasText: '连接' }).click()
  const dialog = win.locator('.workspace-dialog')
  await dialog.locator('.workspace-kinds button', { hasText: 'SSH' }).click()
  const host = dialog.locator('#workspaceSsh input').first()
  await host.fill('gpu')
  await win.locator('.pickhits .rrow', { hasText: 'gpu-lab' }).click()
  await expect(host).toHaveValue('gpu-lab')
  await dialog.locator('#workspaceSsh .directory-field-action').click()
  const picker = win.locator('.ssh-folder-picker')
  await expect(picker.locator('.modal-title')).toHaveText('gpu-lab')
  await expect(picker.locator('input.ssh-folders-path')).toHaveValue('/home/researcher')
  await picker.locator('.ssh-folder-row', { hasText: 'projects' }).click()
  await expect(picker.locator('input.ssh-folders-path')).toHaveValue('/home/researcher/projects')
  await picker.locator('.modal-actions button', { hasText: '选择' }).click()
  await expect(picker).toHaveCount(0)
  await expect(dialog.locator('#workspaceSsh .directory-field input')).toHaveValue('/home/researcher/projects')
  await dialog.locator('.modal-actions button[type="submit"]', { hasText: '添加' }).click()
  await expect(dialog).toHaveCount(0)
  const project = await call<{ workspace?: { kind: string; host?: string; root: string } }>(win, 'project.get', { id: 'draft' })
  expect(project.workspace).toMatchObject({ kind: 'ssh', host: 'gpu-lab', root: '/home/researcher/projects' })
})
