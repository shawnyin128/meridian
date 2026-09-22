import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { ACTIVE_PROJECT, PROJECT_STATUSES, SHELVED_PROJECT } from '../apps/desktop/src/shared/vocabulary.js'
import {
  dshort, expect, fixtureDay, gotoProject, readDraft, test, uniqueHeights, vaultToday,
  type MeridianWindow,
} from './app.js'

const call = <T>(win: Page, method: string, params: unknown) => win.evaluate(
  ([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p) as Promise<T>,
  [method, params] as const,
)

/** The `rgb()` parsed by `--sep-strong` is used to compare the border color of the style C input box. */
const sepStrongRgb = (win: Page): Promise<string> => win.evaluate(() => {
  const probe = document.createElement('div')
  probe.style.color = 'var(--sep-strong)'
  document.body.appendChild(probe)
  const rgb = getComputedStyle(probe).color
  probe.remove()
  return rgb
})

/** The `rgba()` parsed by `--field` is used to compare the metadata input's filled background. */
const fieldRgb = (win: Page): Promise<string> => win.evaluate(() => {
  const probe = document.createElement('div')
  probe.style.backgroundColor = 'var(--field)'
  document.body.appendChild(probe)
  const rgb = getComputedStyle(probe).backgroundColor
  probe.remove()
  return rgb
})

/**
 * How many days are the dates of the draft project in the fixture from today in the library? The date of the fixture is generated as today, so
 * The use case targets this distance, not a certain day; running across days gets the same set of distances.
 */
const T2_START = -7
const T2_END = 3
const MILESTONES = { m1: -20, m2: 3, m3: 11, m4: 21 }

/** When the window is reduced to this content width, the Gantt viewport only has more than 300 pixels left, and the strips of the last two tasks fall outside the viewport. */
const NARROW_WIDTH = 760
/** The number of tasks in the draft project in the fixture. */
const TASK_ROWS = 5
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
    await win.locator('.gantt .gperiodnav button[title="下一个周期"]').click()
  }
  await expect(diamond).toBeVisible()
  return diamond
}
/** The width below which the Gantt viewport should fall after narrowing. */
const NARROW_VIEWPORT = 400
/** The stub sticks to the gap left on the inside of the Gantt viewport, which is consistent with the positioning formula of the stub in useGanttDrag.ts. */
const GANTT_STUB_INSET = 6
/** The title used for the new task is the same string used in manual testing (task-5d). */
const NEW_TASK_TITLE = '实测新建的任务'
/** A title, task and milestone rewritten from the list name format. */
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
  await expect(list).toHaveClass(/structured-list--embedded/)
  await expect(row).toContainText(idea!.title)
  expect(await row.evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.borderTopWidth, style.borderBottomWidth]
  })).toEqual(['0px', '0px'])
  await expect(page.getByText(/^结论 ·/)).toHaveCount(0)

  await row.click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])
  await expect(page.locator('.node-document-pane')).toContainText(idea!.title)
  await expect(page.locator('.project-idea-detail-body')).not.toBeEmpty()
  const openIdea = page.locator('.project-idea-detail-meta > .project-idea-open-idea')
  await expect(openIdea).toHaveText('跳转到想法')
  await expect(page.getByRole('button', { name: '打开来源对话' })).toHaveCount(0)
  await expect(row).toHaveClass(/selected/)

  await openIdea.click()
  await expect(win.locator('.screenslot:not([hidden]) .idea-detail-panel')).toContainText(idea!.title)
  await expect(win.locator('.screenslot:not([hidden])').getByRole('button', { name: '打开来源对话' })).toBeVisible()
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
  const side = page.locator('.node-document-pane')
  const actions = side.locator('.project-idea-node-actions')
  await expect.poll(() => side.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(400)
  const sideBox = await side.boundingBox()
  const actionsBox = await actions.boundingBox()
  expect(sideBox).not.toBeNull()
  expect(actionsBox).not.toBeNull()
  expect(sideBox!.x + sideBox!.width - actionsBox!.x - actionsBox!.width).toBeLessThan(30)

  await page.locator('.section-heading.flexh .segmented-control>button', { hasText: '科研图' }).click()
  const linkedNode = page.locator('.rgn[data-node="knee"]')
  await expect(linkedNode).toHaveClass(/idea-related/)
  await expect(linkedNode.locator('rect')).toHaveAttribute('style', /idea-node-hatch-/)

  await linkedNode.click()
  const headings = await side.locator('.section-heading').allTextContents()
  expect(headings.slice(1, 4)).toEqual(['分支 · 3', '关联想法 · 1', '科研记录 · 1'])
  // wide and prefix are both active_nodes, so knee's branches are 推进中 (2) and 已验证 (1); no candidate group remains.
  expect(await side.locator('.node-branch-label').evaluateAll((labels) => labels.map((label) => ({
    text: label.textContent,
    whiteSpace: getComputedStyle(label).whiteSpace,
  })))).toContainEqual({ text: '推进中', whiteSpace: 'nowrap' })
  const tableCell = side.locator('.node-markdown td').first()
  await expect(tableCell).toBeVisible()
  expect(await tableCell.evaluate((cell) => getComputedStyle(cell).borderTopWidth)).not.toBe('0px')
  // The node panel variant has no node column: chip, title, and who read left to right.
  const eventRow = side.locator('.record-row').first()
  await expect(eventRow.locator('.record-node')).toHaveCount(0)
  const eventParts = await eventRow.locator('.record-kind, .record-title-cell, .record-who').evaluateAll(
    (parts) => parts.map((part) => part.getBoundingClientRect()),
  )
  expect(eventParts[1]!.left).toBeGreaterThanOrEqual(eventParts[0]!.right - 1)
  expect(eventParts[2]!.left).toBeGreaterThan(eventParts[1]!.left)
  const linkedIdea = side.locator(`.node-idea-row[data-idea="${idea!.id}"]`)
  await expect(linkedIdea).toContainText(idea!.title)
  await linkedIdea.click()
  await expect(side.locator('.project-idea-detail-body')).toBeVisible()
})

test('节点详情自己滚动;滚到底后滚轮接着滚整页', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden])')
  await page.locator('.section-heading.flexh .segmented-control>button', { hasText: '科研图' }).click()
  await page.locator('.rgn[data-node="knee"]').click()

  const body = page.locator('.desk-body')
  const side = page.locator('.node-document-pane')
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
  await expect(list).toHaveClass(/structured-list--embedded/)
  await expect(page.locator('#taskList')).toHaveClass(/structured-list--embedded/)
  await expect(page.locator('.evlist')).toHaveClass(/structured-list--embedded/)
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

test('窗口收窄后每条任务行在甘特视口里仍看得见条或残桩', async ({ app, win }) => {
  await gotoProject(win)
  await app.evaluate(({ BrowserWindow }, width) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900)
  }, NARROW_WIDTH)
  // Narrowing changes only the DOM width immediately; the position of the stump has to wait until React reads the new width from ResizeObserver.
  // It falls after re-rendering. The equal-width numbers become smaller only until the first half. There is only scrollLeft in the stub position attached to the left edge.
  // ——Narrowing it doesn’t move it——it looks the same under the old and new widths; only the positions close to the right edge contain the viewport width, so what’s waiting is
  // They are aligned to the current viewport.
  await expect.poll(() => win.locator('.gantt .gwrap').evaluate((wrap, { narrow, inset }) => {
    if (wrap.clientWidth >= narrow) return '视口还没收窄'
    const right = wrap.scrollLeft + wrap.clientWidth
    return [...wrap.querySelectorAll('.gstub')]
      .some((el) => right - ((el as HTMLElement).offsetLeft + (el as HTMLElement).offsetWidth) === inset)
      ? '残桩已按当前视口重算'
      : '残桩还停在旧视口'
  }, { narrow: NARROW_VIEWPORT, inset: GANTT_STUB_INSET })).toBe('残桩已按当前视口重算')

  // The strips and stumps are both absolutely positioned, and may fall entirely outside the Gantt viewport; the measurement is the width of the section where it intersects with the viewport.
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
    .toEqual(Array<boolean>(TASK_ROWS).fill(true))
  // The strip is really squeezed out of the viewport. This use case is testing the stub, otherwise it is empty.
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
      甘特任务行: project.tasks.length,
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

  // Milestones and scientific research maps are each hidden behind another tab. You can only view them by cutting over them.
  await win.locator('.section-heading.flexh .segmented-control>button', { hasText: '里程碑' }).click()
  await win.locator('#msList').waitFor()
  rendered['里程碑行'] = await win.locator('#msList .ddlrow').count()
  await win.locator('.section-heading.flexh .segmented-control>button', { hasText: '科研图' }).click()
  await win.locator('.rgraph').waitFor()
  rendered['科研图节点'] = await win.locator('.rgraph .rgn').count()
  rendered['科研图连线'] = await win.locator('.rgraph .redges path').count()

  for (const [section, count] of Object.entries(contract)) {
    expect(rendered[section], section).toBe(count)
  }
})

test('越界的日期被 core 拒绝,绕开界面直调也拦得住', async ({ win }) => {
  await gotoProject(win)
  const today = await vaultToday(win)
  const rejected = await win.evaluate(async (dates) => {
    const meridian = (window as unknown as MeridianWindow).meridian
    const reason = (call: Promise<unknown>) => call.then(() => '没有被拒绝', (e: Error) => e.message)
    return {
      // There is only end in patch, and whether it crosses the boundary depends on its relationship with the saved start date; this day is earlier than the start date of t2
      task: await reason(meridian.call('project.updateTask', {
        projectId: 'draft', taskId: 't2', patch: { end: dates.beforeTask },
      })),
      // In the same way, only change due, which is earlier than the start date of draft.
      project: await reason(meridian.call('project.update', {
        id: 'draft', patch: { due: dates.beforeProject },
      })),
    }
  }, { beforeTask: fixtureDay(today, T2_START - 1), beforeProject: fixtureDay(today, -200) })
  expect(rejected.task).toMatch(/任务结束日期早于开始日期/)
  expect(rejected.project).toMatch(/项目截止日期早于开始日期/)
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
  // Hovering will enlarge the diamond, and the outer frame will change accordingly; dragging moves its left, so measure left
  const left = () => diamond.evaluate((el) => (el as HTMLElement).offsetLeft)
  const from = await left()

  await win.mouse.move(x0, y)
  await win.mouse.down()
  // The drop point moved 15px further than the integer multiple of 3 days: the diamond was absorbed back to x0+3×dayWidth, but the cursor stopped 15px further to the right.
  // The raised hand landed on the background of Milestone Lane rather than on the rhombus itself - this was exactly the landing point that would have been mistaken for a new building back then.
  await win.mouse.move(x0 + 3 * dayWidth + 15, y, { steps: 8 })
  // During dragging, the diamond will follow the pointer all day long, and the extra 15px will be absorbed. Wait until it has really moved for three days before raising your hand: Did you press it?
  // If it falls on the diamond, or if it stays in place before the move is made, the area will be red instead of a drag that did not occur.
  // Passed by pretending to be "not misjudged as a new one"
  await expect.poll(async () => (await left()) - from).toBe(Math.round(3 * dayWidth))
  await win.mouse.up()

  await expect(win.locator('#toast')).toHaveText(`已改期到 ${dshort(moved)}`)
  // It is not regarded as a new one: the task segment is still there (misjudgment will cut the tab to the milestone segment and insert a blank line to create a new line)
  await expect(win.locator('#taskList')).toBeVisible()
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
  // t1 falls outside the Gantt window and only the stumps are drawn. t2 is the first task to draw the strip. It is postponed for 2 days.
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
  // The strip follows the pointer throughout the day while dragging. Wait until it has been moved for two days before raising your hand: the press does not fall on the bar, or the movement fails.
  // When it was not delivered, it stayed where it was, and it was red here, instead of raising your hand and waiting for a notification that it would not come.
  await expect.poll(async () => (await left()) - from).toBe(Math.round(2 * dayWidth))
  await win.mouse.up()

  await expect(win.locator('#toast')).toHaveText('任务顺延 2 天')
  const t2 = (await readDraft(win)).tasks.find((t) => t.id === 't2')
  expect(t2?.start).toBe(fixtureDay(today, T2_START + 2))
  expect(t2?.end).toBe(fixtureDay(today, T2_END + 2))
})

test('拖完任务条那一下不算点击,单击只定位闪烁,名称格仍可独立写回 core', async ({ win }) => {
  await gotoProject(win)
  const today = await vaultToday(win)
  // t1 falls outside the Gantt window and only draws stumps, t2 is the first task to draw a strip
  const dayWidth = await ganttDayWidth(win)
  const bar = win.locator('.gantt .gbar').first()
  const box = (await bar.boundingBox())!
  const y = box.y + box.height / 2
  const left = () => bar.evaluate((el) => (el as HTMLElement).offsetLeft)
  const from = await left()

  await win.mouse.move(box.x + box.width / 2, y)
  await win.mouse.down()
  await win.mouse.move(box.x + box.width / 2 + 2 * dayWidth, y, { steps: 8 })
  // The strip follows the pointer throughout the day while dragging. Wait until it has been moved for two days before raising your hand: the press does not fall on the bar, or the movement fails.
  // It stayed where it was before it was delivered, and it was red here, so the following sentence "This is not a click" is out of the question.
  await expect.poll(async () => (await left()) - from).toBe(Math.round(2 * dayWidth))
  await win.mouse.up()
  await expect(win.locator('#toast')).toHaveText('任务顺延 2 天')
  // The suppression logic is still there: the click that raised the hand to resend did not trigger the positioning flash.
  await expect(win.locator('#taskList .ddlrow[data-row="t2"]')).not.toHaveClass(/\bflash\b/)

  const moved = (await readDraft(win)).tasks.find((t) => t.id === 't2')!
  expect(moved.start).toBe(fixtureDay(today, T2_START + 2))

  // Just click without dragging: only position and make the corresponding row flash, without opening any column
  await win.locator('.gantt .gbar').first().click()
  const row = win.locator('#taskList .ddlrow[data-row="t2"]')
  await expect(row).toHaveClass(/\bflash\b/)
  await expect(row.locator('.plan-name-input')).toHaveCount(0)
  await expect(win.locator('.plan-time-pop')).toHaveCount(0)

  await row.locator('.plan-name').click()
  await row.locator('.plan-name-input').fill(EDITED_TASK_TITLE)
  await row.locator('.plan-name-input').press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已更新任务')

  const saved = (await readDraft(win)).tasks.find((t) => t.id === 't2')!
  expect(saved.title).toBe(EDITED_TASK_TITLE)
  // This time the editor did not change the dragged out schedule back.
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
  await expect(row.locator('.plan-name-input')).toHaveCount(0)
  await expect(row.locator('.prtag')).toHaveCount(1)
  await expect(row.locator('.state-cell')).toHaveCount(1)
  await form.locator('input[type="date"]').first().fill(fixtureDay(today, T2_START + 1))
  await form.locator('button', { hasText: '保存' }).click()
  await expect(win.locator('#banner span')).toHaveText('已更新任务')
  const saved = (await readDraft(win)).tasks.find((t) => t.id === 't2')!
  expect(saved.start).toBe(fixtureDay(today, T2_START + 1))
  expect(saved.title).toBe(before.title)
})

test('任务四列逐行对齐,任务与里程碑日期使用同一底色', async ({ win }) => {
  await gotoProject(win)
  const rows = win.locator('#taskList .task-row')
  await expect(rows).toHaveCount(TASK_ROWS)
  for (const selector of ['.task-time-cell', '.prtag', '.state-cell', '.plan-name']) {
    const x = await rows.evaluateAll((items, cell) => items.map((row) =>
      Math.round(row.querySelector(cell as string)!.getBoundingClientRect().x)), selector)
    expect(new Set(x).size, `${selector} 应落在同一列`).toBe(1)
  }
  const taskDateColor = await rows.first().locator('.task-time-cell')
    .evaluate((element) => getComputedStyle(element).backgroundColor)

  await win.locator('.section-heading.flexh .segmented-control>button', { hasText: '里程碑' }).click()
  const milestoneDate = win.locator('#msList .milestone-row>.dchip').first()
  await expect(milestoneDate).toBeVisible()
  expect(await milestoneDate.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(taskDateColor)
  await milestoneDate.hover()
  await expect(milestoneDate.locator('..')).not.toHaveClass(/\bhl\b/)
})

test('拖完菱形那一下不算点击,单击只切到里程碑并闪烁,名称格可独立写回', async ({ win }) => {
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
  // Hovering will enlarge the diamond, and the outer frame will change accordingly; dragging moves its left, so the left
  const left = () => diamond.evaluate((el) => (el as HTMLElement).offsetLeft)
  const from = await left()

  await win.mouse.move(box.x + box.width / 2, y)
  await win.mouse.down()
  await win.mouse.move(box.x + box.width / 2 + 3 * dayWidth, y, { steps: 8 })
  // While dragging, the diamond follows the pointer throughout the day. Wait until it has really moved for three days before raising your hand: the press does not land on the diamond, or it moves
  // Before it was delivered, it stayed where it was, and it was red here, instead of raising your hand and waiting for a notification that it would not come.
  await expect.poll(async () => (await left()) - from).toBe(Math.round(3 * dayWidth))
  await win.mouse.up()
  await expect(win.locator('#toast')).toHaveText(`已改期到 ${dshort(moved)}`)
  // The suppression logic is still there: it is still stuck in task segmentation, and positioning is not triggered by dragging.
  await expect(win.locator('#taskList')).toBeVisible()

  // The reschedule may have pushed m2 into the next calendar window; find it again before clicking it.
  const movedDiamond = await revealMilestone(win, 'draft/m2')
  await movedDiamond.click()
  const row = win.locator('#msList .ddlrow[data-row="m2"]')
  await expect(row).toHaveClass(/\bflash\b/)
  await expect(row.locator('.plan-name-input')).toHaveCount(0)

  await row.locator('.plan-name').click()
  await expect(row.locator('.plan-name-input')).toHaveValue(titleOfM2)
  await row.locator('.plan-name-input').fill(EDITED_MILESTONE_TITLE)
  await row.locator('.plan-name-input').press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已更新里程碑')

  const saved = await win.evaluate(async () => {
    const project = await (window as unknown as MeridianWindow).meridian
      .call('project.get', { id: 'draft' }) as { milestones: { id: string; title: string; date: string }[] }
    return project.milestones.find((m) => m.id === 'm2')!
  })
  expect(saved.title).toBe(EDITED_MILESTONE_TITLE)
  // This time the editor did not change the dragged-out date back.
  expect(saved.date).toBe(moved)
})

test('新建一个任务再删掉,任务数前后一致', async ({ win }) => {
  await gotoProject(win)
  await expect(win.locator('#taskList .ddlrow')).toHaveCount(TASK_ROWS)

  await win.locator('.section-heading.flexh .btn.plain', { hasText: '任务' }).click()
  await win.locator('#taskList .min').fill(NEW_TASK_TITLE)
  await win.locator('#taskList .min').press('Enter')

  await expect(win.locator('#banner span')).toHaveText('已创建任务')
  await expect(win.locator('#taskList .ddlrow')).toHaveCount(TASK_ROWS + 1)
  expect((await readDraft(win)).tasks.some((t) => t.title === NEW_TASK_TITLE)).toBe(true)

  const created = win.locator('#taskList .ddlrow', { hasText: NEW_TASK_TITLE })
  await created.locator('.row-delete').click()

  await expect(win.locator('#banner span')).toHaveText('已删除任务')
  await expect(win.locator('#taskList .ddlrow')).toHaveCount(TASK_ROWS)
  expect((await readDraft(win)).tasks.some((t) => t.title === NEW_TASK_TITLE)).toBe(false)
})

test('科研图展示多个活跃节点,节点以只读 Markdown、分支结果与 Agent 记录呈现', async ({ win }) => {
  await gotoProject(win)
  await win.locator('.section-heading.flexh .segmented-control>button', { hasText: '科研图' }).click()
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
  const panel = win.locator('.screenslot:not([hidden]) .wkside')
  await expect(panel.locator('.node-markdown')).toContainText('核心问题是')
  await expect(panel.locator('.node-branch-group.useful .node-branch')).toHaveText('树宽收益拐点')
  await expect(panel.locator('.node-branch-group.dead .node-branch')).toHaveText('draft 提前停止策略')
  await expect(panel.getByText('写入 Wiki')).toHaveCount(0)
  await expect(panel.locator('input')).toHaveCount(0)

  await panel.locator('.node-branch', { hasText: '树宽收益拐点' }).click()
  await expect(panel.locator('.node-document-title')).toHaveText('树宽收益拐点')
  await expect(panel.locator('.node-markdown')).toContainText('Hypothesis')
  // wide and prefix are both in active_nodes, so both land in the in-progress group, not repairable/candidate.
  await expect(panel.locator('.node-branch-group.active .node-branch')).toHaveCount(2)
  await expect(panel.locator('.node-branch-group.repairable .node-branch')).toHaveCount(0)
  await expect(panel.locator('.node-branch-group.candidate .node-branch')).toHaveCount(0)
})

test('科研图节点上下居中且可缩放平移,分支和科研记录在正文上方', async ({ win }) => {
  await gotoProject(win)
  const gantt = win.locator('.gantt')
  const detail = win.locator('.project-detail-page')
  const [ganttBefore, detailBefore] = await Promise.all([gantt.boundingBox(), detail.boundingBox()])
  expect(Math.round(detailBefore!.x)).toBe(Math.round(ganttBefore!.x))
  expect(Math.round(detailBefore!.width)).toBe(Math.round(ganttBefore!.width))

  await win.locator('.section-heading.flexh .segmented-control>button', { hasText: '科研图' }).click()
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

  await viewport.locator('.graph-zoom-reset').click()
  const reset = (await firstNode.boundingBox())!
  const box = (await viewport.boundingBox())!
  await win.mouse.move(box.x + 8, box.y + 8)
  await win.mouse.down()
  await win.mouse.move(box.x + 58, box.y + 38, { steps: 5 })
  await win.mouse.up()
  const moved = (await firstNode.boundingBox())!
  expect(Math.round(moved.x - reset.x)).toBe(50)
  expect(Math.round(moved.y - reset.y)).toBe(30)

  await viewport.locator('.graph-zoom-reset').click()
  const mainWidth = (await detail.locator('.wkmain').boundingBox())!.width
  await viewport.locator('.rgn').first().click()
  const branchHeading = detail.locator('.node-document-pane .section-heading', { hasText: /^分支 ·/ })
  const recordHeading = detail.locator('.node-document-pane .section-heading', { hasText: /^科研记录 ·/ })
  const markdown = detail.locator('.node-markdown')
  await expect(detail.locator('.node-document-metadata')).toHaveCount(0)
  const [branchBox, recordBox, markdownBox] = await Promise.all([
    branchHeading.boundingBox(), recordHeading.boundingBox(), markdown.boundingBox(),
  ])
  expect(branchBox!.y).toBeLessThan(recordBox!.y)
  expect(recordBox!.y).toBeLessThan(markdownBox!.y)
  // The panel widens over a transition; the main column has shrunk once that settles.
  await expect.poll(async () => (await detail.locator('.wkmain').boundingBox())!.width).toBeLessThan(mainWidth)
  expect(Math.round((await detail.boundingBox())!.width)).toBe(Math.round(ganttBefore!.width))
})

test('节点阅读态保留科研图并扩宽右栏,可直接切换节点', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden]) .wkpage')
  const side = page.locator('.wkside')
  const propertyWidth = await side.evaluate((element) => element.getBoundingClientRect().width)

  await page.locator('.section-heading.flexh .segmented-control>button', { hasText: '科研图' }).click()
  await page.locator('.rgraph .rgn[data-node="knee"]').click()

  await expect(page).toHaveClass(/\bnode-reading\b/)
  await expect(page.locator('.rgraph')).toBeVisible()
  await expect(side).toHaveClass(/\bnode-document-pane\b/)
  await expect(side).toHaveClass(/\bdetail-panel--resize\b/)
  expect(await side.evaluate((element) => getComputedStyle(element).transitionProperty))
    .toContain('flex-basis')
  await expect(side.locator('.node-document-title')).toHaveText('树宽收益拐点')
  await expect.poll(() => side.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(propertyWidth + 120)

  await page.locator('.rgraph .rgn[data-node="stop"]').click()
  await expect(side.locator('.section-heading').first()).toContainText('draft 提前停止策略')
  await expect(side.locator('.node-document-title')).toHaveText('draft 提前停止策略')
  await expect(page.locator('.rgraph .rgn[data-node="stop"]')).toHaveClass(/\bsel\b/)

  await side.locator('button[title="收起详情"]').click()
  await expect(page).not.toHaveClass(/\bnode-reading\b/)
  await expect(side.locator('.section-heading').first()).toHaveText('属性')
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

test('科研记录在列表和科研图之间切换,标题留在原处,列表短也不留空白', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden]) .wkpage')
  const heading = page.locator('.section-heading.flexh', { hasText: '科研记录' })
  const toggle = (name: string) => heading.locator('.segmented-control>button', { hasText: name }).click()
  const top = () => heading.evaluate((el) => Math.round(el.getBoundingClientRect().top))
  const viewHeight = () => page.locator('.record-view').evaluate((el) => Math.round(el.getBoundingClientRect().height))

  await toggle('科研图')
  await expect(page.locator('.rgraph')).toBeVisible()
  const graphHeight = await viewHeight()
  // Scroll so the graph is in view, then switch back to the shorter list.
  await heading.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  const held = await top()
  await toggle('列表')
  await expect(page.locator('.evlist')).toBeVisible()
  // The heading holds its place unless the shorter page cannot scroll that far; then it sits as
  // high as the page allows, with nothing padded in to fake the old height.
  const scroller = win.locator('.screenslot:not([hidden]) .desk-body')
  const atEnd = await scroller.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)
  if (!atEnd) expect(await top()).toBe(held)
  expect(await viewHeight()).toBeLessThan(graphHeight)
  expect(await page.locator('.record-view').evaluate((el) => getComputedStyle(el).minHeight)).toBe('0px')
})

test('切换科研图节点:右栏高度不随内容变,页面不跟着跳,新节点从顶部读起', async ({ win }) => {
  await gotoProject(win)
  const page = win.locator('.screenslot:not([hidden]) .wkpage')
  const side = page.locator('.wkside')
  await page.locator('.section-heading.flexh .segmented-control>button', { hasText: '科研图' }).click()
  // Nodes are activated with a dispatched click: a pointer click would first scroll the node into
  // view, and this test measures the page's own movement.
  await page.locator('.rgraph .rgn[data-node="knee"]').dispatchEvent('click')
  await expect(side.locator('.node-document-title')).toHaveText('树宽收益拐点')

  const measure = () => side.evaluate((pane) => {
    let scroller: HTMLElement | null = pane.parentElement
    while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
    return {
      paneHeight: Math.round(pane.getBoundingClientRect().height),
      pageHeight: scroller?.scrollHeight ?? 0,
      pageScroll: scroller?.scrollTop ?? 0,
    }
  })
  await side.evaluate((pane) => { pane.scrollTop = 120 })
  const before = await measure()

  await page.locator('.rgraph .rgn[data-node="stop"]').dispatchEvent('click')
  await expect(side.locator('.node-document-title')).toHaveText('draft 提前停止策略')
  expect(await measure()).toEqual(before)
  expect(await side.evaluate((pane) => pane.scrollTop)).toBe(0)
})

test('新任务行开着且打了字时按侧栏会话的「...」:草稿与字都放弃,菜单打开', async ({ win }) => {
  await gotoProject(win)
  const tasksBefore = (await call<{ tasks: unknown[] }>(win, 'project.get', { id: 'draft' })).tasks.length
  await win.locator('.section-heading.flexh .btn.plain', { hasText: '任务' }).click()
  const input = win.locator('#taskList .ddlrow input.min')
  await input.fill('按菜单触发器放弃的任务')
  await expect(input).toHaveValue('按菜单触发器放弃的任务')

  // The trigger of DropdownMenu opens the menu on pointerdown and preventDefault. After this, the browser will no longer send mousedown.
  const chat = win.locator('#chatList .chat-row').first()
  await chat.hover()
  await chat.locator('.dots').click()
  await expect(win.locator('[role="menu"]')).toHaveCount(1)
  await expect(input).toHaveCount(0)
  expect((await call<{ tasks: unknown[] }>(win, 'project.get', { id: 'draft' })).tasks).toHaveLength(tasksBefore)
})

test('科研计划:新建任务那一行和已有行同一套样子,日期不折行、输入框没有边框', async ({ win }) => {
  await gotoProject(win)
  const plan = win.locator('.screenslot:not([hidden]) .project-plan')
  await plan.locator('[title="添加任务"]').first().click()
  const draft = plan.locator('.task-create-row')
  await expect(draft).toHaveCount(1)

  const chips = await draft.locator('.din').evaluateAll((els) => els.map((el) => {
    return { height: el.getBoundingClientRect().height, border: getComputedStyle(el).borderTopWidth }
  }))
  expect(chips.length).toBeGreaterThanOrEqual(4)
  // One line of 12px text plus 2px padding each side; a wrapped chip is twice as tall.
  for (const chip of chips) {
    expect(chip.border).toBe('0px')
    expect(chip.height).toBeLessThan(26)
  }

  const input = await draft.locator('input.min').evaluate((el) => {
    const style = getComputedStyle(el)
    return { border: style.borderTopWidth, height: el.getBoundingClientRect().height, background: style.backgroundColor }
  })
  expect(input.border).toBe('0px')
  expect(input.height).toBe(20)
  expect(input.background).not.toBe('rgba(0, 0, 0, 0)')
  await win.screenshot({ path: resolve(import.meta.dirname, '../.superpowers/e2e-shots/project-task-draft.png') })
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

  await side.locator('[title="添加关联"]').click()
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
  await win.screenshot({ path: resolve(import.meta.dirname, '../.superpowers/e2e-shots/project-url-draft.png') })
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
  await win.screenshot({ path: resolve(import.meta.dirname, '../.superpowers/e2e-shots/project-url-chip.png') })
})

test('关联:占位 chip 长在它将来待的那一组行末尾,切组跟着搬', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  // Click the group name label at the beginning of the line to identify the line: the two buttons of the section selector in the placeholder say "Wiki" and "Thesis".
  // Using .wkrel's own hasText filter will hit both groups in the line where the placeholder is located.
  const group = (name: string) =>
    side.locator('.wkrel').filter({ has: win.locator('.rl', { hasText: name }) })
  const pageRow = group('Wiki')
  const paperRow = group('论文')
  const pageChips = await pageRow.locator('.tagchip').count()

  await side.locator('[title="添加关联"]').click()
  await expect(pageRow.locator('.inedit')).toHaveCount(1)
  await expect(pageRow.locator('.tagchip')).toHaveCount(pageChips)
  // The segment selector and the input box have the same thing: when the chip line cannot fit, they wrap together and are not allowed to be split into the upper and lower lines.
  const pair = await pageRow.locator('.reladd').evaluate((el) => ({
    seg: el.querySelector('.segmented-control')!.getBoundingClientRect().top,
    input: el.querySelector('.inedit')!.getBoundingClientRect().top,
  }))
  expect(Math.abs(pair.seg - pair.input)).toBeLessThan(4)

  // Cut to the paper group: the placeholder moves there whole. That row's own linked papers now come
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
  await expect(pageRow.locator('.tagchip').last()).toContainText('端到端关联')

  // Esc removes the placeholder, the number of chips in both groups remains unchanged.
  await side.locator('[title="添加关联"]').click()
  await side.locator('.wkrel .inedit').press('Escape')
  await expect(side.locator('.wkrel .inedit')).toHaveCount(0)
  await expect(pageRow.locator('.tagchip')).toHaveCount(pageChips + 1)

  // Click outside the placeholder and remove it
  await side.locator('[title="添加关联"]').click()
  await expect(side.locator('.wkrel .inedit')).toHaveCount(1)
  await win.locator('.screenslot:not([hidden]) .memo').click()
  await expect(side.locator('.wkrel .inedit')).toHaveCount(0)
  await expect(pageRow.locator('.tagchip')).toHaveCount(pageChips + 1)
})

test('关联论文的候选行按标题任意一段命中,显示的是完整标题不是缩短过的', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  await side.locator('[title="添加关联"]').click()
  await side.locator('.wkrel .segmented-control>button', { hasText: '论文' }).click()
  const paperRow = side.locator('.wkrel').filter({ has: win.locator('.rl', { hasText: '论文' }) })
  // "Activation-aware Weight" only occurs after the colon; a short-title-only search or display would miss it.
  await paperRow.locator('.inedit').fill('Activation-aware Weight')
  const hit = win.locator('.pickhits li', { hasText: 'AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration' })
  await expect(hit).toHaveCount(1)
  await hit.click()
  // This row also merges in a free-text relation item ("LongSpec") after the linked papers,
  // so pick the new chip by its paper id rather than assuming it is the last one.
  await expect(paperRow.locator('[data-paper="2306.00978"]'))
    .toContainText('AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration')
})

test('关联 chip 上的 × 只移除这一条,不顺带打开它挂着的那一页', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const linked = side.locator('.wkrel .tagchip[data-wk]')
  const before = await linked.count()
  const chip = linked.first()
  const text = await chip.innerText()

  // × Normally I don’t connect the pointer, I can only click it by hovering over the chip.
  await chip.hover()
  await chip.locator('.rx').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])
  await expect(win.locator('.screenslot:not([hidden]) .desk-head .t')).toHaveText('draft 效率')
  await expect(win.locator('#toast')).toHaveText(`已移除关联「${text}」`)
  await expect(linked).toHaveCount(before - 1)
  const relations = (await call<{ relations: { items: { text: string }[] }[] }>(win, 'project.get', { id: 'draft' })).relations
  expect(relations.flatMap((r) => r.items.map((i) => i.text))).not.toContain(text)
})

test('属性格进入编辑时不改变右栏和值列宽度', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const props = side.locator('.wkprops')
  const field = props.locator('.pk:text-is("名称") + .metadata-field')
  const name = field.locator('.metadata-editable')
  const before = await Promise.all([side.boundingBox(), props.boundingBox(), field.boundingBox(), name.boundingBox()])
  expect(before[3]?.x).toBe(before[2]?.x)
  expect(before[3]?.width).toBe(before[2]?.width)

  await name.click()
  const input = field.locator('.metadata-input')
  await expect(input).toBeVisible()
  const editing = await Promise.all([side.boundingBox(), props.boundingBox(), field.boundingBox(), input.boundingBox()])

  expect(editing.map((box) => box?.width)).toEqual(before.map((box) => box?.width))
  expect(editing.map((box) => box?.x)).toEqual(before.map((box) => box?.x))
})

test('属性栏焦点格:焦点移走或点到格外都算放弃,只有回车才写回', async ({ win }) => {
  // Three rounds of editing and three verification core; the window that is not on the screen needs to wait two seconds for each operability, and the default 30 seconds is not enough
  test.slow()
  await gotoProject(win)
  const focusNow = () => call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
  const before = await focusNow()
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const edit = side.locator('button.metadata-editable', { hasText: before })
  const pin = side.locator('.metadata-input')

  // The keyboard moves the focus out of this space: put it away, and the words typed are not written.
  await edit.click()
  await pin.fill('改了又不要')
  await pin.press('Tab')
  await expect(pin).toHaveCount(0)
  await expect(edit).toHaveText(before)
  expect(await focusNow()).toBe(before)

  // Click outside the grid: also close it and don’t write
  await edit.click()
  await pin.fill('点外面也不要')
  await win.locator('.screenslot:not([hidden]) .memo').click()
  await expect(pin).toHaveCount(0)
  await expect(edit).toHaveText(before)
  expect(await focusNow()).toBe(before)

  await edit.click()
  await pin.fill('回车才写回的当前目标')
  await pin.press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已更新当前目标')
  expect(await focusNow()).toBe('回车才写回的当前目标')
})

test('属性栏焦点格:回车后写被拒,格子仍在编辑、字还在', async ({ win }) => {
  await gotoProject(win)
  const before = await call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const edit = side.locator('button.metadata-editable', { hasText: before })
  const pin = side.locator('.metadata-input')

  await edit.click()
  await pin.fill('项目没了这段还想留着')
  // When the grid is open, bypass the interface and delete the project: core will really reject this write when pressing Enter to submit.
  await call(win, 'project.delete', { id: 'draft' })
  await pin.press('Enter')
  await expect(win.locator('#toast')).toHaveText('项目不存在:draft')
  await expect(win.locator('.screenslot:not([hidden]) .ipcerror')).toHaveCount(0)
  await expect(pin).toHaveValue('项目没了这段还想留着')
})

test('就地输入框:关联占位是样式 C,属性栏焦点格没有边框浅灰实底,焦点都不出环;按钮的环不受影响', async ({ win }) => {
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const sepStrong = await sepStrongRgb(win)
  const field = await fieldRgb(win)

  // The plus sign associated with the placeholder is an ordinary button. This button has not been clicked yet. The keyboard's determination of focus visibility should be based on the real path.
  // A prior Tab keypress puts Chromium's input-modality tracking into "keyboard" so the following
  // scripted focus() still counts as keyboard-driven, matching :focus-visible like a real Tab would.
  const relAdd = side.locator('.section-heading.flexh [title="添加关联"]')
  await win.keyboard.press('Tab')
  await relAdd.evaluate((el) => el.focus())
  await expect(relAdd).toHaveCSS('outline-style', 'solid')
  await expect(relAdd).toHaveCSS('outline-width', '2px')

  // .inedit:Style C for associated placeholders
  await relAdd.click()
  const relInput = side.locator('.wkrel .inedit')
  await relInput.focus()
  await expect(relInput).toHaveCSS('outline-style', 'none')
  await expect(relInput).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(relInput).toHaveCSS('border-top-color', sepStrong)

  // .metadata-input of the property bar focus cell: no border and a light filled background, not style C
  // (a drawn border there reads too heavy; confirmed by papers.spec.ts's sibling check on the same class).
  const before = await call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
  await side.locator('button.metadata-editable', { hasText: before }).click()
  const pin = side.locator('.metadata-input')
  await expect(pin).toHaveCSS('outline-style', 'none')
  await expect(pin).toHaveCSS('border-top-width', '0px')
  await expect(pin).toHaveCSS('border-right-width', '0px')
  await expect(pin).toHaveCSS('border-bottom-width', '0px')
  await expect(pin).toHaveCSS('border-left-width', '0px')
  await expect(pin).toHaveCSS('background-color', field)
})

test.describe('属性栏焦点格:切到别的应用', () => {
  // The window must be on the screen and take the system focus. Only then can the focus be lost or taken by the blur()/focus() of the main process.
  test.use({ showWindow: true })

  test('切回来不重新全选:接着打字接在原字后面,不是把原字替掉', async ({ app, win }) => {
    await gotoProject(win)
    const before = await call<{ focus: string }>(win, 'project.get', { id: 'draft' }).then((p) => p.focus)
    const side = win.locator('.screenslot:not([hidden]) .wkside')
    const edit = side.locator('button.metadata-editable', { hasText: before })
    const pin = side.locator('.metadata-input')

    await edit.click()
    await pin.fill('切走前打的字')

    // Turn off Playwright's focus simulation: when it is turned on, the page always assumes that it has focus, and the real window is out of focus and the focus cannot be transmitted.
    const cdp = await win.context().newCDPSession(win)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
    await app.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0]!
      target.show()
      target.focus()
    })
    await expect.poll(() => win.evaluate(() => document.hasFocus()), {
      message: '窗口没有真的拿到系统焦点,后面的 blur()/focus() 无从谈起',
    }).toBe(true)

    // Switch to another application and then switch back: .metadata-input has not been uninstalled, Blink will resend focus to it
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blur())
    await expect.poll(() => win.evaluate(() => document.hasFocus())).toBe(false)
    await app.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0]!
      target.show()
      target.focus()
    })
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
  const memoToggle = main.locator('.section-heading', { hasText: '项目随笔' }).locator('button')

  await memoToggle.click()
  await expect(memoToggle).toHaveText('保存')

  await edit.click()
  await pin.fill('保存焦点格顺带收起随笔')
  await pin.press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已更新当前目标')
  await expect(memoToggle).toHaveText('编辑')
})

test('项目列表点进详情,内容导航行的返回钮退回列表', async ({ win }) => {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('[data-proj="draft"]').click()
  await expect(win.locator('.screenslot:not([hidden]) .desk-head .t')).toHaveText('draft 效率')
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])

  // There is no way in from the list, and the return stack is empty: the return button returns to the previous level in the structure, which is the item list.
  await win.locator('.screenslot:not([hidden]) .desk-head .back').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目'])
  await expect(win.locator('.screenslot:not([hidden]) [data-proj="draft"]')).toBeVisible()
})

test('任务四列各自编辑,点击行本身不改变任何列', async ({ win }) => {
  test.slow()
  await gotoProject(win)
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  const menu = win.locator('[role="menu"]')
  const radios = menu.locator('[role="menuitemradio"]')

  // Clicking the blank space of the row does not open editing; each of the four columns only opens its own control.
  const row = win.locator('#taskList .ddlrow').first()
  await expect(row.locator('.dots')).toHaveCount(0)
  await expect(row.locator('.row-delete')).toHaveAttribute('title', '删除任务')
  await row.evaluate((element) => (element as HTMLElement).click())
  await expect(row.locator('.plan-name-input')).toHaveCount(0)
  await expect(win.locator('.schedule-form')).toHaveCount(0)

  await row.locator('.plan-name').click()
  await expect(row.locator('.plan-name-input')).toHaveCount(1)
  await expect(win.locator('.schedule-form')).toHaveCount(0)
  await win.keyboard.press('Escape')
  await expect(row.locator('.plan-name-input')).toHaveCount(0)

  // The date and time-of-day triggers are two independent popovers now; open the date one.
  await row.locator('.task-date-part').click()
  await expect(win.locator('.schedule-form')).toBeVisible()
  await expect(row.locator('.plan-name-input')).toHaveCount(0)
  await win.keyboard.press('Escape')

  await row.locator('.prtag').click()
  await expect(radios).toHaveText(['P0 · 紧急', 'P1 · 常规', 'P2 · 较低'])
  await win.keyboard.press('Escape')
  await row.locator('.state-cell').click()
  await expect(radios).toHaveText(['进行中', '计划中', '已完成'])
  await win.keyboard.press('Escape')

  // Status: Three-level radio selection, the current "In Progress" is checked; click "Shelved" to write back
  await side.locator('.wkprops .pk:text-is("状态") + .pv').click()
  await expect(radios).toHaveText([...PROJECT_STATUSES])
  await expect(radios.filter({ hasText: ACTIVE_PROJECT })).toHaveAttribute('aria-checked', 'true')
  await radios.filter({ hasText: SHELVED_PROJECT }).click()
  await expect(win.locator('#banner span')).toHaveText('已更新状态')
  expect((await call<{ status: string }>(win, 'project.get', { id: 'draft' })).status).toBe(SHELVED_PROJECT)

  // Priority: The current P0 is checked; press the key twice to go to P1, press Enter to write back
  await side.locator('.wkprops .pk:text-is("优先级") + .pv').click()
  await expect(radios).toHaveText(['P0 · 紧急', 'P1 · 常规', 'P2 · 较低'])
  await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true')
  await win.keyboard.press('ArrowDown')
  await win.keyboard.press('ArrowDown')
  await expect(radios.nth(1)).toHaveAttribute('data-highlighted', '')
  await win.keyboard.press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已更新优先级')
  expect((await call<{ priority: string }>(win, 'project.get', { id: 'draft' })).priority).toBe('p1')
})

test('任务与里程碑的状态格独立修改并立即写回 core', async ({ win }) => {
  await gotoProject(win)
  const before = await call<{
    tasks: { id: string; state: 'act' | 'plan' | 'done' }[]
    milestones: { id: string; date: string; done: boolean }[]
  }>(win, 'project.get', { id: 'draft' })
  const firstTask = before.tasks[0]!
  const nextState = { act: 'plan', plan: 'done', done: 'act' } as const
  const stateWord = { act: '进行中', plan: '计划中', done: '已完成' } as const

  const taskRow = win.locator(`#taskList .ddlrow[data-row="${firstTask.id}"]`)
  await taskRow.locator('.state-cell').click()
  await win.locator('[role="menuitemradio"]', { hasText: stateWord[nextState[firstTask.state]] }).click()
  await expect(win.locator('#banner span')).toHaveText('已更新任务')
  const afterTask = await call<{ tasks: { id: string; state: string }[] }>(win, 'project.get', { id: 'draft' })
  expect(afterTask.tasks.find((task) => task.id === firstTask.id)?.state).toBe(nextState[firstTask.state])

  await win.locator('.section-heading.flexh .segmented-control>button', { hasText: '里程碑' }).click()
  const firstMilestone = [...before.milestones].sort((a, b) => a.date.localeCompare(b.date))[0]!
  const milestoneRow = win.locator(`#msList .ddlrow[data-row="${firstMilestone.id}"]`)
  await milestoneRow.locator('.state-cell').click()
  await win.locator('[role="menuitemradio"]', { hasText: firstMilestone.done ? '未完成' : '已完成' }).click()
  await expect(win.locator('#banner span')).toHaveText('已更新里程碑')
  const afterMilestone = await call<{ milestones: { id: string; done: boolean }[] }>(win, 'project.get', { id: 'draft' })
  expect(afterMilestone.milestones.find((milestone) => milestone.id === firstMilestone.id)?.done)
    .toBe(!firstMilestone.done)
})

test('红色垃圾桶直接删除任务,不会先把这一行切进编辑态', async ({ win }) => {
  await gotoProject(win)
  const row = win.locator('#taskList .ddlrow').first()
  const taskId = await row.getAttribute('data-row')
  await expect(row.locator('.row-delete')).toHaveCSS('color', /rgb/)
  await row.locator('.row-delete').click()
  await expect(win.locator('#taskList .plan-name-input')).toHaveCount(0)
  await expect(win.locator('.plan-time-pop')).toHaveCount(0)
  await expect(win.locator('#banner span')).toHaveText('已删除任务')
  const project = await call<{ tasks: { id: string }[] }>(win, 'project.get', { id: 'draft' })
  expect(project.tasks.some((task) => task.id === taskId)).toBe(false)
})

/** Enter the details of the draft, switch to the scientific research map, click on "Tree Width Inflection Point", and return to the header of the node panel; when you return, the header is already this node. */
async function openNodePanel(win: Page) {
  await gotoProject(win)
  await win.locator('.section-heading.flexh .segmented-control>button', { hasText: '科研图' }).click()
  await win.locator('.rgraph .rgn[data-node="knee"]').click()
  const head = win.locator('.screenslot:not([hidden]) .wkside .section-heading').first()
  await expect(head).toContainText('树宽收益拐点')
  return head
}

test('科研图由 Agent 管理:空图没有 App 侧新增入口', async ({ win }) => {
  await win.locator('[data-desk="resproj"]').click()
  await win.locator('.screenslot:not([hidden]) [data-proj="sched"]').click()
  const main = win.locator('.screenslot:not([hidden]) .wkmain')
  await main.locator('.segmented-control>button', { hasText: '科研图' }).click()
  await expect(main.locator('.rgempty')).toHaveText('暂无科研图')
  await expect(main.locator('.section-heading.flexh .btn.plain', { hasText: '节点' })).toHaveCount(0)
})

test('节点面板由 Agent 管理:标题、状态、记录与分支都不可在 App 编辑', async ({ win }) => {
  await gotoProject(win)
  const main = win.locator('.screenslot:not([hidden]) .wkmain')
  const side = win.locator('.screenslot:not([hidden]) .wkside')
  await main.locator('.segmented-control>button', { hasText: '科研图' }).click()
  await main.locator('.rgn[data-node="prefix"]').click()
  await expect(side.locator('.node-document-title')).toHaveText('前缀复用配置')
  await expect(side.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0)
  await expect(side.getByText('删除节点')).toHaveCount(0)
  await expect(side.getByText('子节点')).toHaveCount(0)
})

test('节点面板开着时 Esc 先关任务名称格,再按一次才收面板', async ({ win }) => {
  const head = await openNodePanel(win)
  const row = win.locator('#taskList .ddlrow').first()
  await row.locator('.plan-name').click()
  await expect(row.locator('.plan-name-input')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(row.locator('.plan-name-input')).toHaveCount(0)
  await expect(head).toContainText('树宽收益拐点')

  await win.keyboard.press('Escape')
  await expect(head).toHaveText('属性')
})

test('节点面板开着时 Esc 先关日历,再按一次才收面板', async ({ win }) => {
  const head = await openNodePanel(win)
  await win.locator('.section-heading.flexh .btn.plain', { hasText: '任务' }).click()
  await win.locator('#taskList .ddlrow .din').first().click()
  await expect(win.locator('.calg')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(win.locator('.calg')).toHaveCount(0)
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
