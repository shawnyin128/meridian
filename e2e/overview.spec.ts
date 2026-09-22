import type { Page } from '@playwright/test'
import { dshort, expect, fixtureDay, test, vaultToday, type MeridianWindow } from './app.js'

/** When the window is reduced to this content width, the Gantt viewport only has more than 300 pixels left. */
const NARROW_WIDTH = 760
/** The width below which the Gantt viewport should fall after narrowing. */
const NARROW_VIEWPORT = 400
/** The stub sticks to the gap left on the inside of the Gantt viewport, which is consistent with the positioning formula of the stub in useGanttDrag.ts. */
const GANTT_STUB_INSET = 6

/** The t2 and m2 of the repro in the fixture are the number of days from Curry today. */
const REPRO_T2_START = -1
const REPRO_T2_END = 8
const REPRO_M2 = 8

/** Monday of the week Curry is in today; both the overview and the project open this week by default. */
const weekStart = (today: string) => fixtureDay(
  today,
  -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7),
)

/** The positioning of the milestone pop-up layer is consistent with `<Popover.Content side="bottom" ... sideOffset={6}>` in ResearchOverview.tsx. */
const POPOVER_SIDE_OFFSET = 6
/** The allowable pixel error of the spring layer anchor point check covers the sub-pixel jitter measured by the bounding box after the diamond is rotated 45°. */
const POPOVER_ANCHOR_SLOP = 2

/** The screen you entered is always hung, and the selector that is present on every screen, such as the screen header, should be stored in the currently displayed screen. */
const shown = (win: Page) => win.locator('.screenslot:not([hidden])')

/** Click "Research › Overview" in the sidebar. The application falls on the dynamic screen. All use cases done on the overview must take this step first. */
const gotoOverview = (win: Page) => win.locator('[data-desk="restl"]').click()

/** Bypass the interface and directly call `project.overview`, calculate the number of items in each block of the overview based on the contract return value. */
const overviewCounts = (win: Page) => win.evaluate(async () => {
  const rows = await (window as unknown as MeridianWindow).meridian
    .call('project.overview', {}) as {
      id: string; name: string; status: string; start: string; due: string
      tasks: { id: string; start: string; end: string; state: string }[]
      milestones: { id: string; date: string; done: boolean }[]
      events: { date: string; text: string }[]
      research: { activeNodes: { id: string; label: string }[] }
    }[]
  const day = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / 86400000)
  const today = day(await (window as unknown as MeridianWindow).meridian
    .call('vault.today', {}) as string)
  const weekday = new Date(today * 86400000).getUTCDay()
  const w0 = today - (weekday + 6) % 7
  const w1 = w0 + 6
  const sum = (of: (p: (typeof rows)[number]) => number) => rows.reduce((n, p) => n + of(p), 0)
  // The default overview timeline leaves out finished tasks and milestones; the history view keeps them.
  const openTasks = (p: (typeof rows)[number]) => p.tasks.filter((t) => t.state !== 'done').length
  return {
    ids: rows.map((p) => p.id),
    ganttRows: sum((p) => p.status === '进行中' ? 1 + openTasks(p) : 0),
    allGanttRows: sum((p) => 1 + p.tasks.length),
    allTaskRows: sum((p) => p.tasks.length),
    taskRows: sum((p) => p.status === '进行中' ? openTasks(p) : 0),
    diamonds: sum((p) => p.status === '进行中' ? p.milestones.filter((m) => {
      const d = day(m.date)
      if (m.done) return false
      return d >= w0 && d <= w1
    }).length : 0),
    now: rows.filter((p) => p.status !== '已完成').length,
    recent: Math.min(6, sum((p) => p.events.length)),
    upcoming: sum((p) => p.milestones.filter((m) => !m.done && day(m.date) >= today).length),
    active: rows.filter((p) => p.status === '进行中').length,
    shelved: rows.filter((p) => p.status === '搁置').length,
    openMilestones: sum((p) => p.milestones.filter((m) => !m.done).length),
    week: sum((p) => p.events.filter((item) => {
      const distance = today - day(item.date)
      return distance >= 0 && distance < 7
    }).length),
  }
})

/**
 * The day/week/month Gantt redesign only draws a milestone diamond inside its own calendar window
 * (`TimelineBoard.tsx`), so a milestone days away from today may start out of view. Switch to the month
 * scale (the widest window) and step forward through its calendar periods until the target diamond
 * renders, so the check is deterministic regardless of which day of the month the suite runs on.
 */
async function revealMilestone(win: Page, dataMilestone: string) {
  await shown(win).locator('.gantt .gscale button', { hasText: '月' }).click()
  const diamond = shown(win).locator(`.gantt .gddl[data-milestone="${dataMilestone}"]`)
  for (let step = 0; step < 3 && await diamond.count() === 0; step += 1) {
    await shown(win).locator('.gantt .gperiodnav button[title="下一个周期"]').click()
  }
  await expect(diamond).toBeVisible()
  // Center it in the scrollable viewport instead of leaving it wherever it first became visible, so it
  // isn't pinned against the edge where Radix's own collision avoidance would shift an anchored popover.
  const targetLeft = await diamond.evaluate((el) => (el as HTMLElement).offsetLeft)
  await shown(win).locator('.gantt .gwrap').evaluate((wrap, left) => {
    wrap.scrollLeft = Math.max(0, left - wrap.clientWidth / 2)
  }, targetLeft)
  return diamond
}

/** Bypass the interface and call `project.get` directly, get a project milestone, and check whether the picture on the Gantt falls into the core. */
const milestonesOf = (win: Page, id: string) => win.evaluate(async (projectId) => {
  const project = await (window as unknown as MeridianWindow).meridian
    .call('project.get', { id: projectId }) as { milestones: { date: string; title: string }[] }
  return project.milestones.map(({ date, title }) => ({ date, title }))
}, id)

const NEW_PROJECT = '实测新建的项目'

/** Overview of the names of the use cases entered into the input boxes in the milestone pop-up layer. */
const REJECTED_TITLE = '写被拒时留着的里程碑'
const RETRIED_TITLE = '改了再回车的里程碑'
const TWICE_TITLE = '连按两下回车的里程碑'
const RENAMED_TITLE = '弹层里改好的里程碑'
const STALE_TITLE = '挪走弹层之前回车的里程碑'
const MOVED_TITLE = '挪过去的弹层里打的里程碑'

test('侧栏「总览」进的是研究总览,各块条数与 project.overview 一致', async ({ win }) => {
  await gotoOverview(win)
  const counts = await overviewCounts(win)

  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '总览'])
  await expect(shown(win).locator('.desk-head .t')).toHaveText(`总览 · ${counts.active}`)
  // This row in the demo sidebar does not have a subtitle, only other rows have it.
  await expect(win.locator('[data-desk="restl"] .n')).toHaveCount(0)

  // By default, only ongoing projects are displayed; one milestone line for each project, and another line for each real task.
  expect(counts.ganttRows).toBeGreaterThanOrEqual(counts.active)
  await expect(shown(win).locator('.gantt .grow')).toHaveCount(counts.ganttRows)
  await expect(shown(win).locator('.gantt .glrow')).toHaveCount(counts.ganttRows)
  await expect(shown(win).locator('.gantt .gddl')).toHaveCount(counts.diamonds)

  await expect(shown(win).locator('.ovstat b')).toHaveText([
    String(counts.active), String(counts.shelved), String(counts.openMilestones), String(counts.week),
  ])
  await expect(shown(win).locator('.ovlist-row.progress')).toHaveCount(counts.now)
  await expect(shown(win).locator('.timeline-task-priority')).toHaveCount(counts.taskRows)
  await expect(shown(win).locator('.ovcols > div').first().locator('.ovlist-row.dated')).toHaveCount(counts.recent)
  await expect(shown(win).locator('.ovcols > div').last().locator('.ovlist-row.dated')).toHaveCount(counts.upcoming)
  // The decision queue only appears when something happens; old project conclusions are no longer involved, and fixtures are still overdue, stagnant, and blocked.
  await expect(shown(win).locator('.ovlist-row.attention')).not.toHaveCount(0)
  const embeddedLists = shown(win).locator('.ovlist, .ovpulse')
  expect(await embeddedLists.count()).toBeGreaterThan(1)
  expect(await embeddedLists.evaluateAll(
    (elements) => elements.every((element) => element.classList.contains('structured-list--embedded')),
  )).toBe(true)
  const decisionGeometry = await shown(win).locator('.ovlist-row.attention').evaluateAll(
    (elements) => elements.map((row) => {
      const date = row.querySelector('.project-signal-date')!.getBoundingClientRect()
      const kind = row.querySelector('.project-signal-kind')!.getBoundingClientRect()
      return { dateWidth: date.width, kindWidth: kind.width, gap: kind.left - date.right }
    }),
  )
  expect(new Set(decisionGeometry.map((row) => row.dateWidth)).size).toBe(1)
  expect(new Set(decisionGeometry.map((row) => row.kindWidth)).size).toBe(1)
  expect(new Set(decisionGeometry.map((row) => row.gap)).size).toBe(1)
  await expect(shown(win).locator('.ovpulse-row[data-proj="draft"] .ovpulse-cell').first())
    .toContainText('宽树补 B≥8')

  await shown(win).locator('.overview-history-toggle').click()
  await expect(shown(win).locator('.gantt .grow')).toHaveCount(counts.allGanttRows)
  await expect(shown(win).locator('.overview-history-toggle')).toHaveAttribute('aria-pressed', 'true')
})

test('总览点一个项目进它的详情,返回钮回总览,面包屑「项目」回列表,列表进来的返回钮回列表', async ({ win }) => {
  await gotoOverview(win)
  const { active } = await overviewCounts(win)
  await shown(win).locator('.ovlist-row.progress[data-proj="draft"]').click()

  await expect(shown(win).locator('.desk-head .t')).toHaveText('draft 效率')
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])

  // Return is the history return: the origin is the overview, and the return button returns to the overview.
  await shown(win).locator('.desk-head .back').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '总览'])
  await expect(shown(win).locator('.desk-head .t')).toHaveText(`总览 · ${active}`)
  await expect(shown(win).locator('.ovlist-row.progress[data-proj="draft"]')).toBeVisible()

  // The breadcrumb section still returns to the project list, the same as demo
  await shown(win).locator('.gantt .glrow[data-proj="repro"]').first().click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', '复现 EAGLE-2'])
  await win.locator('#crumb .cseg.link', { hasText: '项目' }).click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目'])
  await expect(shown(win).locator('[data-proj="draft"]')).toBeVisible()
  // The items coming into the list have no origin, and return to the previous level in the button structure: the item list
  await shown(win).locator('[data-proj="draft"]').click()
  await expect(shown(win).locator('.desk-head .back')).toHaveCount(1)
  await shown(win).locator('.desk-head .back').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目'])
  await expect(shown(win).locator('[data-proj="draft"]')).toBeVisible()
})

test('总览时间线:项目行的折叠钮收起它的任务,别的项目不动,再点展开,点行本身仍进项目', async ({ win }) => {
  await gotoOverview(win)
  const gantt = shown(win).locator('.gantt')
  const taskLabels = (project: string) => gantt.locator(`.timeline-label-row[data-proj="${project}"][data-task]`)
  const taskBars = (project: string) => gantt.locator(`.grow[data-proj="${project}"][data-task]`)
  await expect(taskLabels('repro')).not.toHaveCount(0)
  await expect(taskLabels('draft')).not.toHaveCount(0)
  const reproTasks = await taskLabels('repro').count()
  const draftTasks = await taskLabels('draft').count()
  expect(reproTasks).toBeGreaterThan(0)
  expect(draftTasks).toBeGreaterThan(0)

  const fold = gantt.locator('.glrow.msl[data-proj="repro"] .timeline-fold')
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await expect(taskLabels('repro')).toHaveCount(0)
  await expect(taskBars('repro')).toHaveCount(0)
  await expect(gantt.locator('.glrow.msl[data-proj="repro"] .timeline-folded-count')).toHaveText(`${reproTasks} 项任务已折叠`)
  await expect(taskLabels('draft')).toHaveCount(draftTasks)
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '总览'])

  await fold.click()
  await expect(taskLabels('repro')).toHaveCount(reproTasks)
  await expect(taskBars('repro')).toHaveCount(reproTasks)

  await gantt.locator('.glrow.msl[data-proj="repro"] .timeline-item-label').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', '复现 EAGLE-2'])
})

test('新建的项目在总览里看得见,横幅那句话才算数', async ({ win }) => {
  await gotoOverview(win)
  const before = await overviewCounts(win)

  await win.locator('[data-desk="resproj"]').click()
  await shown(win).locator('#projNew').click()
  await shown(win).locator('.projpanel .inedit').fill(NEW_PROJECT)
  await shown(win).locator('.projpanel .inedit').press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已创建项目 · 已加入研究总览')

  await gotoOverview(win)
  const after = await overviewCounts(win)
  const created = after.ids.find((id) => !before.ids.includes(id))!
  expect(created).toBeDefined()

  await expect(shown(win).locator(`.ovlist-row.progress[data-proj="${created}"] .project-identity-name`))
    .toHaveText(NEW_PROJECT)
  await expect(shown(win).locator(`.gantt .glrow[data-proj="${created}"] .timeline-project-label`))
    .toHaveText(NEW_PROJECT)
  // When there are no tasks in a new project, there are only milestones, and the project schedule is no longer used to forge a task.
  await expect(shown(win).locator(`.gantt .gbar[data-proj="${created}"]`)).toHaveCount(0)
  await expect(shown(win).locator(`.ovcols .ovlist-row[data-proj="${created}"] .ovlist-main`))
    .toHaveText('创建项目')
  await expect(shown(win).locator('.ovlist-row.progress')).toHaveCount(before.now + 1)
})

test('点甘特行内空白在那一天新建里程碑,写落进 core', async ({ win }) => {
  await gotoOverview(win)
  const row = shown(win).locator('.gantt .grow[data-row="repro"]')
  // The default week scale only draws diamonds that fall inside the current week window, so how many of
  // repro's fixture milestones are visible depends on which day this runs; read the live count instead of
  // assuming both fixture milestones show, and check the click adds exactly one more.
  const before = await row.locator('.gddl').count()

  const firstDay = weekStart(await vaultToday(win))

  // The horizontal bar of repro is drawn from the second day of the window. The point at the beginning of the line is blank and falls on the first day of the window.
  await row.click({ position: { x: 10, y: 22 } })
  await expect(win.locator('.ctxmenu .rh')).toHaveText(`新建里程碑 · ${dshort(firstDay)}`)
  await win.locator('.ctxmenu .mi-in input').fill('总览上补的里程碑')
  await win.locator('.ctxmenu .mi-in input').press('Enter')

  await expect(win.locator('#banner span')).toHaveText('已添加里程碑')
  expect(await milestonesOf(win, 'repro'))
    .toContainEqual({ date: firstDay, title: '总览上补的里程碑' })
  await expect(row.locator('.gddl')).toHaveCount(before + 1)
})

test('总览横条是真实任务:拖动改任务日期,单击进所属项目', async ({ win }) => {
  await gotoOverview(win)
  const today = await vaultToday(win)
  const bar = shown(win).locator('.gantt .gbar[data-proj="repro"][data-task="t2"]')
  const dayPx = (await shown(win).locator('.gantt .gday').first().boundingBox())!.width
  const box = (await bar.boundingBox())!
  const x0 = box.x + box.width / 2
  const y = box.y + box.height / 2
  const left = () => bar.evaluate((el) => (el as HTMLElement).offsetLeft)
  const from = await left()

  await win.mouse.move(x0, y)
  await win.mouse.down()
  await win.mouse.move(x0 + 2 * dayPx, y, { steps: 8 })
  // During dragging, the horizontal bar will follow the pointer throughout the day. Wait until it has really moved for two days before raising your hand: the press does not fall on the horizontal bar, or the movement has not yet occurred.
  // It stayed where it was when it was delivered, and it was red here
  await expect.poll(async () => Math.round((await left()) - from)).toBe(Math.round(2 * dayPx))
  await win.mouse.up()

  await expect(win.locator('#toast')).toHaveText('任务顺延 2 天')
  // The drag was not regarded as a click: it was still stuck in the overview and did not enter the project.
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '总览'])
  const saved = await win.evaluate(async () => {
    const project = await (window as unknown as MeridianWindow).meridian
      .call('project.get', { id: 'repro' }) as {
        tasks: { id: string; start: string; end: string }[]
      }
    return project.tasks.find((task) => task.id === 't2')!
  })
  expect(saved).toMatchObject({
    start: fixtureDay(today, REPRO_T2_START + 2),
    end: fixtureDay(today, REPRO_T2_END + 2),
  })

  await bar.click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', '复现 EAGLE-2'])
  await expect(shown(win).locator('.task-row[data-row="t2"]')).toHaveClass(/\bflash\b/)
})

test('总览时间线左栏宽度固定，长任务名不撑宽；点任务名跳到项目里的这条任务', async ({ win }) => {
  await gotoOverview(win)
  const labels = shown(win).locator('.gantt .glabels')
  const before = (await labels.boundingBox())!.width
  await win.evaluate(async () => {
    await (window as unknown as MeridianWindow).meridian.call('project.updateTask', {
      projectId: 'repro', taskId: 't2',
      patch: { title: '早期 observation 探索。重点放在发现问题上，目标搞清楚 Expert 的哪个东西有问题，并把结论整理成一页说明' },
    })
  })
  // The write bypassed the screen, so reload the window to read the overview afresh.
  await win.reload()
  await gotoOverview(win)
  const label = shown(win).locator('.gantt .timeline-label-row[data-proj="repro"][data-task="t2"] .timeline-item-label')
  await expect(label).toContainText('早期 observation 探索')
  expect((await labels.boundingBox())!.width).toBe(before)
  expect(await label.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)

  await label.click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', '复现 EAGLE-2'])
  await expect(shown(win).locator('.task-row[data-row="t2"]')).toHaveClass(/\bflash\b/)
})

test.describe('拖总览菱形改期', () => {
  // A wide window keeps the whole month canvas on-screen with no horizontal scroll, so the milestone
  // never lands pinned against the window's right edge; without this, on days when the dragged-to date
  // is near the end of the calendar month, Radix's own collision avoidance shifts the popover away from
  // its plain anchor math, and the anchor-position assertion below would fail through no fault of the app.
  test.use({ showWindow: true })

  test('抬手补发的点击不在行内空白新建;不拖只点菱形开出它自己的编辑弹层', async ({ app, win }) => {
    await gotoOverview(win)
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(2200, 900)
    })
    const wrap = shown(win).locator('.gantt .gwrap')
    await expect.poll(() => wrap.evaluate((el) => el.clientWidth)).toBeGreaterThan(1100)
    const today = await vaultToday(win)
    const moved = fixtureDay(today, REPRO_M2 + 3)
    const title = (await milestonesOf(win, 'repro')).find((m) => m.date === fixtureDay(today, REPRO_M2))!.title
    // draft has its own milestone also called "m2"; dragging repro's must not touch it. Read draft's full
    // list up front and compare it byte-for-byte afterwards, rather than tracking its on-screen position
    // (the calendar window that brings repro's milestone into view need not also show draft's).
    const draftBefore = await milestonesOf(win, 'draft')
    const diamond = await revealMilestone(win, 'repro/m2')
    const box = (await diamond.boundingBox())!
    const x0 = box.x + box.width / 2
    const y = box.y + box.height / 2
    const left = () => diamond.evaluate((el) => (el as HTMLElement).offsetLeft)
    const from = await left()
    const dayPx = (await shown(win).locator('.gantt .gday').first().boundingBox())!.width

    await win.mouse.move(x0, y)
    await win.mouse.down()
    // The drop point is moved 15px more than an integer multiple of 3 days: the diamond is absorbed back to the whole day, the cursor stops on the blank space in the line, and the click that is raised to reissue falls on the blank space.
    await win.mouse.move(x0 + 3 * dayPx + 15, y, { steps: 8 })
    await expect.poll(async () => Math.round((await left()) - from)).toBe(Math.round(3 * dayPx))
    await win.mouse.up()

    await expect(win.locator('#toast')).toHaveText(`已改期到 ${dshort(moved)}`)
    // The reissued click was swallowed: the "New Milestone" popup in the blank space of the line did not appear.
    await expect(win.locator('.ctxmenu')).toHaveCount(0)
    expect(await milestonesOf(win, 'repro')).toContainEqual({ date: moved, title })
    expect(await milestonesOf(win, 'draft')).toEqual(draftBefore)

    // The reschedule may have pushed the milestone into the next calendar window; find it again before clicking it.
    const movedDiamond = await revealMilestone(win, 'repro/m2')
    await movedDiamond.click()
    await expect(win.locator('.ctxmenu .rh')).toHaveText(`里程碑 · ${dshort(moved)}`)
    await expect(win.locator('.ctxmenu .mi-in input')).toHaveValue(title)
    // The anchor point of the spring layer is the point where the mouse clicks, which is the center of the diamond at this moment - the diamond rotates 45° and the hover will enlarge, but both revolve around
    // When the center is transformed, the measurement center is not affected. side="bottom" align="start": The x of the anchor point is attached to the left side of the spring layer, and the y of the anchor point is higher than the upper side.
    // Multiple sideOffset
    const diamondBox = (await movedDiamond.boundingBox())!
    const anchor = { x: diamondBox.x + diamondBox.width / 2, y: diamondBox.y + diamondBox.height / 2 }
    const popoverBox = (await win.locator('.ctxmenu').boundingBox())!
    expect(Math.abs(popoverBox.x - anchor.x)).toBeLessThan(POPOVER_ANCHOR_SLOP)
    expect(Math.abs(popoverBox.y - (anchor.y + POPOVER_SIDE_OFFSET))).toBeLessThan(POPOVER_ANCHOR_SLOP)
  })
})

test('日周月切换只改视口,任务行不丢失且同日任务在月视图只占一格', async ({ win }) => {
  const today = await vaultToday(win)
  const taskTitle = '总览切换尺度用的同日任务'
  const made = await win.evaluate(async ({ date, title }) => (window as unknown as MeridianWindow).meridian
    .call('project.createTask', {
      projectId: 'repro',
      task: {
        title, start: date, end: date, window: { start: '08:00', end: '10:00' },
        state: 'act', priority: 'p1',
      },
    }) as Promise<{ tasks: { id: string; title: string }[] }>, { date: today, title: taskTitle })
  const taskId = made.tasks.find((task) => task.title === taskTitle)!.id
  await gotoOverview(win)
  const gantt = shown(win).locator('.overview-gantt')
  const labels = gantt.locator('.timeline-label-row')
  const bar = gantt.locator(`.gbar[data-proj="repro"][data-task="${taskId}"]`)
  await expect(bar).toBeVisible()
  const before = await labels.evaluateAll((items) => items.map((item) => item.textContent))
  expect(before.length).toBeGreaterThan(0)

  await gantt.locator('.gscale button', { hasText: '月' }).click()
  await expect(bar).toBeVisible()
  expect((await bar.boundingBox())!.width).toBeLessThan(40)
  expect(await labels.evaluateAll((items) => items.map((item) => item.textContent))).toEqual(before)

  await gantt.locator('.gscale button', { hasText: '日' }).click()
  await expect(bar).toBeVisible()
  expect(await labels.evaluateAll((items) => items.map((item) => item.textContent))).toEqual(before)

  await gantt.locator('.gscale button', { hasText: '周' }).click()
  await expect(bar).toBeVisible()
  expect(await labels.evaluateAll((items) => items.map((item) => item.textContent))).toEqual(before)
})

test.describe('窗口收窄并滚动', () => {
  // Narrowing re-fits the week/month day width, which re-centers the scroll on today and reflows the
  // whole canvas; off-screen windows only get one animation-frame tick per second (see app.ts), so this
  // multi-step settling can take several real seconds there but is immediate once the window is on screen.
  test.use({ showWindow: true })

  test('窗口收窄并滚动后,每个任务行都保留横条或边缘残桩', async ({ app, win }) => {
    await gotoOverview(win)
    // The history view keeps finished tasks, whose early bars are the ones left as stubs at the left edge.
    await shown(win).locator('.overview-history-toggle').click()
    const { allTaskRows: taskRows } = await overviewCounts(win)
    // Wait for one more frame after Gant has finished painting, and the first callback of ResizeObserver will be implemented; if you don't wait, the subsequent recalculation when changing the window size will be one frame later.
    await shown(win).locator('.gantt .grow').first().waitFor()
    await win.evaluate(() => new Promise<null>((drawn) => requestAnimationFrame(() => drawn(null))))
    await app.evaluate(({ BrowserWindow }, width) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900)
    }, NARROW_WIDTH)
    const wrap = shown(win).locator('.gantt .gwrap')
    await expect.poll(() => wrap.evaluate((el) => el.clientWidth)).toBeLessThan(NARROW_VIEWPORT)
    await wrap.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    // The stub position attached to the left edge contains scrollLeft, waiting for the position of the viewport after they are scrolled.
    await expect.poll(() => wrap.evaluate((el, inset) => {
      const stubs = [...el.querySelectorAll<HTMLElement>('.gstub')]
      if (stubs.length === 0) return '没有残桩'
      return stubs.some((s) => s.offsetLeft - el.scrollLeft === inset) ? '残桩已按当前视口重算' : '残桩还停在旧视口'
    }, GANTT_STUB_INSET)).toBe('残桩已按当前视口重算')

    // The horizontal bars and stumps are both absolutely positioned, and may fall entirely outside the Gantt viewport; the measurement is the width of the section where it intersects with the viewport.
    const rows = await wrap.evaluate((el) => {
      const view = el.getBoundingClientRect()
      const visible = (node: Element | null) => {
        if (!node) return null
        const r = node.getBoundingClientRect()
        return Math.round(Math.min(r.right, view.right) - Math.max(r.left, view.left))
      }
      return [...el.querySelectorAll<HTMLElement>('.grow[data-task]')].map((row) => ({
        row: row.dataset.row,
        bar: visible(row.querySelector('.gbar')),
        stub: visible(row.querySelector('.gstub')),
      }))
    })
    console.log(`总览甘特收窄到 ${NARROW_WIDTH}px 并滚动后每个任务行的可见宽度 ${JSON.stringify(rows)}`)

    expect(rows.map((r) => Math.max(r.bar ?? 0, r.stub ?? 0) > 0))
      .toEqual(Array<boolean>(taskRows).fill(true))
    expect(rows.some((r) => (r.bar ?? 0) <= 0 && (r.stub ?? 0) > 0)).toBe(true)
  })
})

test('总览新建里程碑:写被拒时弹层与打的字都留着,改了再回车,写成了才收起', async ({ win }) => {
  await gotoOverview(win)
  const firstDay = weekStart(await vaultToday(win))
  const menu = win.locator('.ctxmenu')
  const input = menu.locator('.mi-in input')

  // The horizontal bar of repro is drawn from the second day of the window. The point at the beginning of the line is blank and falls on the first day of the window.
  await shown(win).locator('.gantt .grow[data-row="repro"]').click({ position: { x: 10, y: 22 } })
  await expect(menu.locator('.rh')).toHaveText(`新建里程碑 · ${dshort(firstDay)}`)

  // Bypass the interface and directly delete the repro: the overview will not be retrieved, and the elastic layer is still hung on the repro. Writing core this time will inevitably be rejected.
  await win.evaluate(() => (window as unknown as MeridianWindow).meridian.call('project.delete', { id: 'repro' }))
  await input.fill(REJECTED_TITLE)
  await input.press('Enter')
  // First wait for the error message to appear on the screen: it means that the carriage return is really written and rejected, and then look at the pop-up layer so that the judgment is not made before it is written back.
  await expect(win.locator('#toast')).toHaveText('项目不存在:repro')
  await expect(shown(win).locator('.ipcerror')).toHaveCount(0)
  await expect(menu).toBeVisible()
  await expect(input).toHaveValue(REJECTED_TITLE)

  // Put the repro back from the trash can, change the wording and press Enter: This time it is written, and the elastic layer is closed
  await win.evaluate(async () => {
    const meridian = (window as unknown as MeridianWindow).meridian
    const trash = await meridian.call('trash.list', {}) as { id: string; kind: string; title: string }[]
    const entry = trash.find((t) => t.kind === 'project' && t.title === '复现 EAGLE-2')!
    await meridian.call('trash.restore', { id: entry.id })
  })
  await input.fill(RETRIED_TITLE)
  await input.press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已添加里程碑')
  await expect(menu).toHaveCount(0)
  const saved = await milestonesOf(win, 'repro')
  expect(saved).toContainEqual({ date: firstDay, title: RETRIED_TITLE })
  expect(saved.map((m) => m.title)).not.toContain(REJECTED_TITLE)
})

test('总览新建里程碑:一次写没落地之前连按两下回车,只建一个', async ({ win }) => {
  await gotoOverview(win)
  const firstDay = weekStart(await vaultToday(win))
  await shown(win).locator('.gantt .grow[data-row="repro"]').click({ position: { x: 10, y: 22 } })
  const input = win.locator('.ctxmenu .mi-in input')
  await input.fill(TWICE_TITLE)

  // Two presses are sent in the same task: the first press has to go back and forth through IPC, and is divided into two presses. When the press is sent in, the second press
  // It may arrive after writing it back and closing the elastic layer. It may not be possible to detect if the anti-resubmission is broken.
  await input.evaluate((el) => {
    for (let i = 0; i < 2; i += 1) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await expect(win.locator('#banner span')).toHaveText('已添加里程碑')
  await expect(win.locator('.ctxmenu')).toHaveCount(0)
  expect((await milestonesOf(win, 'repro')).filter((m) => m.title === TWICE_TITLE))
    .toEqual([{ date: firstDay, title: TWICE_TITLE }])
})

test('总览里程碑改名:写成了才收起;写被拒时弹层与打的字都留着', async ({ win }) => {
  await gotoOverview(win)
  const today = await vaultToday(win)
  const menu = win.locator('.ctxmenu')
  const input = menu.locator('.mi-in input')
  const diamond = await revealMilestone(win, 'repro/m2')

  await diamond.click()
  await input.fill(RENAMED_TITLE)
  await input.press('Enter')
  await expect(win.locator('#banner span')).toHaveText('已更新里程碑')
  await expect(menu).toHaveCount(0)
  expect(await milestonesOf(win, 'repro'))
    .toContainEqual({ date: fixtureDay(today, REPRO_M2), title: RENAMED_TITLE })

  // Click it again, bypass the interface and directly delete this milestone: the overview will not be retrieved again, and this time the rename to core will be rejected.
  await diamond.click()
  await expect(input).toHaveValue(RENAMED_TITLE)
  await win.evaluate(() => (window as unknown as MeridianWindow).meridian
    .call('project.deleteMilestone', { projectId: 'repro', milestoneId: 'm2' }))
  await input.fill(REJECTED_TITLE)
  await input.press('Enter')
  await expect(win.locator('#toast')).toHaveText('里程碑不存在:m2')
  await expect(shown(win).locator('.ipcerror')).toHaveCount(0)
  await expect(menu).toBeVisible()
  await expect(input).toHaveValue(REJECTED_TITLE)
})

test('总览新建里程碑:点外落在一次被拒的写的在途期间,弹层与打的字都留着', async ({ win }) => {
  await gotoOverview(win)
  const menu = win.locator('.ctxmenu')
  const input = menu.locator('.mi-in input')

  await shown(win).locator('.gantt .grow[data-row="repro"]').click({ position: { x: 10, y: 22 } })
  await input.fill(REJECTED_TITLE)
  // Bypass the interface and directly delete the repro: the overview will not be retrieved, and the elastic layer is still hung on the repro. Writing core this time will inevitably be rejected.
  await win.evaluate(() => (window as unknown as MeridianWindow).meridian.call('project.delete', { id: 'repro' }))

  // First send Enter to initiate a submission, then send pointerdown/mousedown/click to the screen header
  // outside the pop-up layer, before writing IPC cross-process can come back. A microtask yield after Enter
  // lets React commit the busy-flag update first; without it, the outside click reads the pre-commit,
  // not-yet-busy state and dismisses the layer instead of being vetoed.
  await win.evaluate(async () => {
    document.querySelector<HTMLElement>('.ctxmenu .mi-in input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await Promise.resolve()
    const outside = document.querySelector<HTMLElement>('.screenslot:not([hidden]) .desk-head .t')!
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      outside.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
    }
  })

  await expect(win.locator('#toast')).toHaveText('项目不存在:repro')
  await expect(menu).toBeVisible()
  await expect(input).toHaveValue(REJECTED_TITLE)
})

test('总览里程碑弹层:焦点在「删除」上按 Esc 也收起,里程碑不删', async ({ win }) => {
  await gotoOverview(win)
  const menu = win.locator('.ctxmenu')
  const diamond = await revealMilestone(win, 'repro/m2')
  const before = await milestonesOf(win, 'repro')

  await diamond.click()
  const remove = menu.locator('.mi.danger')
  await remove.focus()
  await expect(remove).toBeFocused()
  await win.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  expect(await milestonesOf(win, 'repro')).toEqual(before)
})

test('总览新建里程碑:写在路上时把弹层挪到另一行,第一次写成了之后挪过去的弹层与它的字都还在', async ({ win }) => {
  await gotoOverview(win)
  const today = await vaultToday(win)
  const firstDay = weekStart(today)
  const secondDay = fixtureDay(firstDay, 1)
  const dayPx = (await shown(win).locator('.gantt .gday').first().boundingBox())!.width
  const menu = win.locator('.ctxmenu')
  const input = menu.locator('.mi-in input')

  await shown(win).locator('.gantt .grow[data-row="repro"]').click({ position: { x: 10, y: 22 } })
  await input.fill(STALE_TITLE)

  // In the same task: press Enter to start writing on the repro; send pointerdown/mousedown/click to the next day's cell in the draft line in sequence,
  // Move the elastic layer over; type in the moved elastic layer. Write away IPC cross-process, this whole sequence falls before it comes back
  await win.evaluate(async ({ dayPx, typed }) => {
    const stale = document.querySelector<HTMLInputElement>('.ctxmenu .mi-in input')!
    stale.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const row = document.querySelector<HTMLElement>('.screenslot:not([hidden]) .gantt .grow[data-row="draft"]')!
    const box = row.getBoundingClientRect()
    const at = { bubbles: true, button: 0, clientX: box.left + dayPx + 10, clientY: box.top + 22 }
    for (const type of ['pointerdown', 'mousedown', 'click']) row.dispatchEvent(new MouseEvent(type, at))
    // Only give way to the microtask: React draws the moved elastic layer in the microtask. The IPC reply is another task and cannot be inserted.
    for (let i = 0; i < 10 && document.querySelector('.ctxmenu .mi-in input') === stale; i += 1) {
      await Promise.resolve()
    }
    const moved = document.querySelector<HTMLInputElement>('.ctxmenu .mi-in input')
    if (moved === null || moved === stale) throw new Error('挪过去的弹层没有在同一个任务里画出来')
    // The input is a controlled React value; setting .value directly does not update React's own state,
    // so the next render reverts it. Go through the native setter and fire `input` like a real keystroke would.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(moved, typed)
    moved.dispatchEvent(new Event('input', { bubbles: true }))
  }, { dayPx, typed: MOVED_TITLE })

  await expect(win.locator('#banner span')).toHaveText('已添加里程碑')
  expect(await milestonesOf(win, 'repro')).toContainEqual({ date: firstDay, title: STALE_TITLE })
  await expect(menu).toBeVisible()
  await expect(menu.locator('.rh')).toHaveText(`新建里程碑 · ${dshort(secondDay)}`)
  await expect(input).toHaveValue(MOVED_TITLE)
})

test('总览新建里程碑:写在路上时把弹层挪到另一个项目的同一天同一处,挪过去的弹层从空的开始', async ({ win }) => {
  await gotoOverview(win)
  const firstDay = weekStart(await vaultToday(win))
  const menu = win.locator('.ctxmenu')
  const input = menu.locator('.mi-in input')

  await shown(win).locator('.gantt .grow[data-row="repro"]').click({ position: { x: 10, y: 22 } })
  await input.fill(STALE_TITLE)

  // In the same task: press Enter and start writing on the repro; on the draft line, send pointerdown/mousedown/click in sequence with the same x as just now,
  // The pop-up layer is moved to the same day and the same abscissa of the draft. Write away IPC cross-process, this whole sequence falls before it comes back
  await win.evaluate(async () => {
    document.querySelector<HTMLInputElement>('.ctxmenu .mi-in input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const gantt = '.screenslot:not([hidden]) .gantt'
    const from = document.querySelector<HTMLElement>(`${gantt} .grow[data-row="repro"]`)!.getBoundingClientRect()
    const row = document.querySelector<HTMLElement>(`${gantt} .grow[data-row="draft"]`)!
    const at = { bubbles: true, button: 0, clientX: from.left + 10, clientY: row.getBoundingClientRect().top + 22 }
    const anchor = document.querySelector<HTMLElement>(`${gantt} .ganchor`)!
    const top = anchor.style.top
    for (const type of ['pointerdown', 'mousedown', 'click']) row.dispatchEvent(new MouseEvent(type, at))
    // Only give up the microtask: React moves the anchor point to the draft line in the microtask. The IPC reply is another task and cannot be inserted.
    for (let i = 0; i < 10 && anchor.style.top === top; i += 1) await Promise.resolve()
    if (anchor.style.top === top) throw new Error('弹层没有在同一个任务里挪到 draft 行')
  })

  await expect(win.locator('#banner span')).toHaveText('已添加里程碑')
  expect(await milestonesOf(win, 'repro')).toContainEqual({ date: firstDay, title: STALE_TITLE })
  await expect(menu).toBeVisible()
  await expect(menu.locator('.rh')).toHaveText(`新建里程碑 · ${dshort(firstDay)}`)
  // The pop-up layer that is moved to another project must not contain the words repro, otherwise it will be built on draft by pressing Enter.
  await expect(input).toHaveValue('')
})

test('总览里程碑弹层:点「删除」收起弹层,里程碑从 core 里删掉', async ({ win }) => {
  await gotoOverview(win)
  const today = await vaultToday(win)
  const menu = win.locator('.ctxmenu')
  const diamond = await revealMilestone(win, 'repro/m2')
  const before = await milestonesOf(win, 'repro')
  const m2 = before.find((m) => m.date === fixtureDay(today, REPRO_M2))!

  await diamond.click()
  await expect(menu.locator('.rh')).toHaveText(`里程碑 · ${dshort(m2.date)}`)
  await menu.locator('.mi.danger').click()
  await expect(win.locator('#banner span')).toHaveText('已删除里程碑')
  await expect(menu).toHaveCount(0)
  const after = await milestonesOf(win, 'repro')
  expect(after).not.toContainEqual(m2)
  expect(after).toHaveLength(before.length - 1)
})
