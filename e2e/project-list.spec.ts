import type { Page } from '@playwright/test'
import { PROJECT_STATUSES } from '../apps/desktop/src/shared/vocabulary.js'
import {
  dshort, expect, overlaps, settle, test, timelinePeriod, vaultToday, type MeridianWindow,
} from './app.js'

/** Visited screens stay mounted, so selectors every screen has, like the header, target the shown one. */
const shown = (win: Page) => win.locator('.screenslot:not([hidden])')

/** Calls `project.list` directly, bypassing the UI, for the projects the list screen should show. */
const listProjects = (win: Page) => win.evaluate(async () => {
  const rows = await (window as unknown as MeridianWindow).meridian
    .call('project.list', {}) as { id: string; name: string; status: string }[]
  return rows.map(({ id, name, status }) => ({ id, name, status }))
})

/** Calls `project.get` directly, bypassing the UI, for the detail screen's name and each section's count. */
const getProject = (win: Page, id: string) => win.evaluate(async (projectId) => {
  const project = await (window as unknown as MeridianWindow).meridian
    .call('project.get', { id: projectId }) as {
      name: string
      tasks: { state: string; start: string; end: string }[]
      milestones: { done: boolean }[]
      events: unknown[]
      agentSessions: unknown[]
      graph: { nodes: unknown[] }
    }
  return {
    name: project.name,
    tasks: project.tasks.map(({ start, end }) => ({ start, end })),
    // A done task or milestone starts collapsed into the plan list's archived group, so the visible
    // row count is the active-only count, not the contract's full array length.
    activeTasks: project.tasks.filter((t) => t.state !== 'done').length,
    activeMilestones: project.milestones.filter((m) => !m.done).length,
    events: project.events.length,
    agentSessions: project.agentSessions.length,
    graphNodes: project.graph.nodes.length,
  }
}, id)

/** Calls `project.list` directly, bypassing the UI, for the day the project last progressed. */
const lastProgress = (win: Page, id: string) => win.evaluate(async (projectId) => {
  const rows = await (window as unknown as MeridianWindow).meridian
    .call('project.list', {}) as { id: string; lastProgress?: string }[]
  return rows.find((row) => row.id === projectId)?.lastProgress
}, id)

/** Calls `project.get` directly, bypassing the UI, for the project's whole research log. */
const getEvents = (win: Page, id: string) => win.evaluate(async (projectId) => {
  const project = await (window as unknown as MeridianWindow).meridian
    .call('project.get', { id: projectId }) as { events: { date: string; text: string }[] }
  return project.events
}, id)

const ACTIVE = '进行中'
/** Days from the vault's today back to this date. */
const daysSince = (today: string, iso: string) =>
  Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000)
/** Returns to the list from any screen: the sidebar entry always lands on it, even from a project. */
const gotoList = (win: Page) => win.locator('[data-desk="resproj"]').click()
/** The fixture's projects other than draft; one test opens each of them once. */
const OTHER_PROJECTS = ['sched', 'moe', 'fa']
const NEW_PROJECT = '实测新建的项目'
const RENAMED_PROJECT = '实测重命名后的项目'

test('侧栏「项目」进的是列表,项目条数与 project.list 一致', async ({ win }) => {
  await gotoList(win)
  const projects = await listProjects(win)
  expect(projects.length).toBeGreaterThan(1)

  const active = projects.filter((p) => p.status === ACTIVE)
  await expect(shown(win).locator('.projpanel, .prow')).toHaveCount(projects.length)
  await expect(shown(win).locator('.projpanel')).toHaveCount(active.length)
  await expect(shown(win).locator('.desk-head .t'))
    .toHaveText(`项目 · ${projects.length}`)
  await expect(shown(win).locator('.projpanel .project-identity-name')).toHaveText(active.map((p) => p.name))
})

test('从列表进入 draft 之外的项目,详情屏渲染的是那个项目', async ({ win }) => {
  await gotoList(win)
  await win.locator('[data-proj="repro"]').click()

  const project = await getProject(win, 'repro')
  expect(project.name).not.toBe('draft 效率')
  await expect(shown(win).locator('.desk-head .t')).toHaveText(project.name)
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', project.name])
  await expect(win.locator('#taskList .ddlrow')).toHaveCount(project.activeTasks)

  await win.locator('.segmented-control>button', { hasText: '里程碑' }).click()
  await expect(win.locator('#msList .ddlrow')).toHaveCount(project.activeMilestones)
})

test('项目详情的面包屑「项目」那一段点回列表', async ({ win }) => {
  await gotoList(win)
  await win.locator('[data-proj="draft"]').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])

  await win.locator('#crumb .cseg.link', { hasText: '项目' }).click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目'])
  await expect(shown(win).locator('[data-proj="draft"]')).toBeVisible()
})

test('侧栏项目角标是进行中的项目数', async ({ win }) => {
  const projects = await listProjects(win)
  const active = projects.filter((p) => p.status === ACTIVE).length
  // The badge counts active projects; if all were active, this test could not tell the two counts apart.
  expect(active).toBeLessThan(projects.length)
  await expect(win.locator('[data-desk="resproj"] .n')).toHaveText(String(active))
})

test('从别的屏再进「项目」落在列表,已经在项目屏时再点侧栏也落在列表', async ({ win }) => {
  await gotoList(win)
  await win.locator('[data-proj="draft"]').click()
  await expect(shown(win).locator('.desk-head .t')).toHaveText('draft 效率')

  // Clicking the sidebar again is also an entry: it returns to the list, even from this screen's own detail.
  await gotoList(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目'])
  await expect(shown(win).locator('[data-proj="draft"]')).toBeVisible()

  // Go to Papers, turn a page and come back: the Projects screen shows the list.
  await win.locator('[data-desk="papers"]').click()
  await win.locator('.pager .pgbtn').last().click()
  await expect(win.locator('.pager .pgbtn.on')).toHaveText('2')

  await gotoList(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目'])
  await expect(shown(win).locator('[data-proj="draft"]')).toBeVisible()

  // The Papers page was not reset on the way; its grouping also survives a round trip to another screen.
  await win.locator('[data-desk="papers"]').click()
  await expect(win.locator('.pager .pgbtn.on')).toHaveText('2')
  await win.locator('.filters .segmented-control>button', { hasText: '主题' }).click()
  await expect(win.locator('.filters .segmented-control>button[aria-checked="true"]')).toHaveText('主题')

  await gotoList(win)
  await win.locator('[data-desk="papers"]').click()
  await expect(win.locator('.filters .segmented-control>button[aria-checked="true"]')).toHaveText('主题')
  await expect(win.locator('.gxrow').first()).toBeVisible()
})

test('新建行开着时再点「＋ 新建项目」,打好的名字留着而且焦点回到输入框', async ({ win }) => {
  await gotoList(win)
  await shown(win).locator('#projNew').click()
  await shown(win).locator('.projpanel .inedit').fill('打了一半的项目名')

  await shown(win).locator('#projNew').click()

  await expect(shown(win).locator('.projpanel .inedit')).toHaveCount(1)
  await expect(shown(win).locator('.projpanel .inedit')).toHaveValue('打了一半的项目名')
  await expect(shown(win).locator('.projpanel .inedit')).toBeFocused()
})

test('新建行输入空名字回车,占位留着且项目数不变', async ({ win }) => {
  await gotoList(win)
  const before = await listProjects(win)

  await shown(win).locator('#projNew').click()
  await shown(win).locator('.projpanel .inedit').press('Enter')

  await expect(shown(win).locator('.projpanel .inedit')).toHaveCount(1)
  await expect(shown(win).locator('.projpanel .inedit')).toBeFocused()
  expect((await listProjects(win)).length).toBe(before.length)
})

test('新建一个项目,重命名、改状态、删掉,再从垃圾桶恢复', async ({ win }) => {
  await gotoList(win)
  const before = await listProjects(win)
  const rows = shown(win).locator('[data-proj]')
  await expect(rows).toHaveCount(before.length)

  await shown(win).locator('#projNew').click()
  await shown(win).locator('.projpanel .inedit').fill(NEW_PROJECT)
  await shown(win).locator('.projpanel .inedit').press('Enter')

  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已创建项目 · 已加入研究总览')
  await expect(rows).toHaveCount(before.length + 1)
  const created = (await listProjects(win)).find((p) => p.name === NEW_PROJECT)
  expect(created?.status).toBe(ACTIVE)
  const card = shown(win).locator(`[data-proj="${created!.id}"]`)
  await expect(card).toHaveClass(/projpanel/)

  await card.hover()
  await card.locator('.dots').click()
  await win.locator('.ctxmenu .mi', { hasText: '重命名' }).click()
  await win.locator('.ctxmenu .mi-in input').fill(RENAMED_PROJECT)
  await win.locator('.ctxmenu .mi-in input').press('Enter')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已重命名')
  await expect(card.locator('.project-identity-name')).toHaveText(RENAMED_PROJECT)

  await card.hover()
  await card.locator('.dots').click()
  await win.locator('.ctxmenu .mi', { hasText: '搁置' }).click()
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已标记为 搁置')
  // It moves to another group: the panel becomes a compact row, and project.list has the new status.
  await expect(card).toHaveClass(/prow/)
  expect((await listProjects(win)).find((p) => p.id === created!.id)?.status).toBe('搁置')

  await card.hover()
  await card.locator('.dots').click()
  await win.locator('.ctxmenu .mi.danger').click()
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已移入垃圾桶 · 7 天内可恢复')
  await expect(rows).toHaveCount(before.length)
  expect((await listProjects(win)).map((p) => p.id)).not.toContain(created!.id)

  await win.locator('[data-desk="trash"]').click()
  await expect(shown(win).locator('.section-heading')).toHaveText('项目 · 1')
  await expect(win.locator('.tgroup .trow .tt2')).toHaveText([RENAMED_PROJECT])
  await win.locator('.tgroup .trow .row-actions [aria-label="恢复"]').click()
  await expect(win.locator('.tgroup .trow')).toHaveCount(0)

  await gotoList(win)
  await expect(rows).toHaveCount(before.length + 1)
  await expect(shown(win).locator(`[data-proj="${created!.id}"] .project-identity-name`)).toHaveText(RENAMED_PROJECT)
  expect((await listProjects(win)).find((p) => p.id === created!.id)?.status).toBe('搁置')
})

test('面板的最近推进、停滞天数与细行的上次推进都按最近推进那天算', async ({ win }) => {
  await gotoList(win)
  const today = await vaultToday(win)

  const draft = await getEvents(win, 'draft')
  expect(draft.length).toBeGreaterThan(3)
  const draftProgress = await lastProgress(win, 'draft')
  const recent = await shown(win).locator('[data-proj="draft"] .project-card-recent').innerText()
  expect(recent).toContain(dshort(draftProgress!))

  // Nothing has changed draft since its latest entry; the earliest entry is further back, so reading
  // the wrong end of the log gives a different number.
  expect(draftProgress).toBe(draft.at(-1)!.date)
  await expect(shown(win).locator('[data-proj="draft"] .project-card-alert'))
    .toContainText(`已 ${daysSince(today, draftProgress!)} 天无推进`)

  // moe is shelved and shows as one compact row, ending with the days since it last progressed.
  const moeProgress = await lastProgress(win, 'moe')
  await expect(shown(win).locator('[data-proj="moe"] .m'))
    .toContainText(`上次推进 ${daysSince(today, moeProgress!)} 天前`)
})

test('单日与跨天任务的日期标签、全天与时段标签在各自列里一样宽', async ({ win }) => {
  await gotoList(win)
  await win.locator('[data-proj="timeline-demo"]').click()
  const rows = win.locator('#taskList .task-row')
  await expect(rows).toHaveCount(4)
  for (const cell of ['.task-date-part .date-chip', '.task-clock-part .date-chip']) {
    const widths = await rows.evaluateAll((items, selector) => items.map((row) =>
      Math.round(row.querySelector(selector as string)!.getBoundingClientRect().width)), cell)
    expect(new Set(widths).size, `${cell} 各行应一样宽:${widths.join(',')}`).toBe(1)
  }
})

test('没有图数据的项目出的是一行占位,不是空画布加图例', async ({ win }) => {
  await gotoList(win)
  await win.locator('[data-proj="sched"]').click()
  expect((await getProject(win, 'sched')).graphNodes).toBe(0)

  await win.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' }).click()
  await expect(win.locator('.screenslot:not([hidden]) .record-view .empty-state--section')).toHaveText('还没有科研图')
  await expect(win.locator('.rgraph')).toHaveCount(0)
  await expect(win.locator('.glegend')).toHaveCount(0)

  // A project with graph data still shows the canvas and legend. It opens on its own timeline, not on
  // the graph tab sched was left on.
  await win.locator('#crumb .cseg.link', { hasText: '项目' }).click()
  await win.locator('[data-proj="draft"]').click()
  const graphTab = win.locator('.section-heading-actions .segmented-control>button', { hasText: '科研图' })
  await expect(graphTab).toHaveAttribute('aria-checked', 'false')
  await graphTab.click()
  await expect(win.locator('.rgraph .rgn')).toHaveCount((await getProject(win, 'draft')).graphNodes)
  await expect(win.locator('.glegend')).toHaveCount(1)
  await expect(win.locator('.rgempty')).toHaveCount(0)
})

test('sched / moe / fa 各打开一次,各板块条数与 project.get 一致', async ({ win }) => {
  await gotoList(win)
  for (const id of OTHER_PROJECTS) {
    await win.locator(`[data-proj="${id}"]`).click()
    const project = await getProject(win, id)
    await expect(shown(win).locator('.desk-head .t'), id).toHaveText(project.name)
    await expect(win.locator('#taskList .ddlrow'), id).toHaveCount(project.activeTasks)
    // The Gantt draws a bar for every task that overlaps this week, done or not.
    const week = timelinePeriod(await vaultToday(win), 'week')
    await expect(win.locator('.gantt .grow:not(.msrow)'), id)
      .toHaveCount(project.tasks.filter((task) => overlaps(task, week)).length)
    await expect(win.locator('.evlist .record-row'), id).toHaveCount(project.events)
    await expect(win.locator('.agcard'), id).toHaveCount(project.agentSessions)

    await win.locator('.section-heading-actions .segmented-control>button', { hasText: '里程碑' }).click()
    await expect(win.locator('#msList .ddlrow'), id).toHaveCount(project.activeMilestones)
    // Leaving on Milestones does not carry over: the next project opens on its own tasks.
    await win.locator('#crumb .cseg.link', { hasText: '项目' }).click()
  }
})

/**
 * Sends a real key press through CDP: Playwright's press does not recognize characters outside the
 * keyboard layout, and every menu item starts with a Chinese character.
 */
async function typeKey(win: Page, ch: string): Promise<void> {
  const cdp = await win.context().newCDPSession(win)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  await cdp.detach()
}

test('项目菜单是真菜单;重命名框里打菜单项首字、方向键、Home/End、空格都进输入框,焦点不跳,Esc 取消、回车提交照旧', async ({ win }) => {
  test.slow()
  await gotoList(win)
  const card = shown(win).locator('[data-proj="draft"]')
  const menu = win.locator('[role="menu"]')
  const input = menu.locator('.mi-in input')

  await card.hover()
  await expect(card.locator('.dots')).toHaveAttribute('aria-haspopup', 'menu')
  await card.locator('.dots').click()
  await expect(menu.locator('[role="menuitem"]')).toHaveText(['重命名', '删除'])
  await expect(menu.locator('[role="menuitemradio"]')).toHaveText([...PROJECT_STATUSES])
  await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveText(ACTIVE)

  await menu.locator('[role="menuitem"]', { hasText: '重命名' }).click()
  await expect(input).toBeFocused()
  await input.fill('')
  // The first character of each of the five menu items: Rename, Active, Shelved, Finished, Delete.
  for (const ch of ['重', '进', '搁', '已', '删']) await typeKey(win, ch)
  // If typeahead takes focus on a key, it moves it in a zero-delay setTimeout. Timers with the same delay
  // fire in queue order, so waiting one zero-delay macrotask lets any scheduled focus move run first.
  await win.evaluate(() => new Promise<void>((r) => setTimeout(r, 0)))
  // Assert here: the next press focuses the input first, which would hide whether focus had moved.
  await expect(input).toBeFocused()
  await input.press('Space')
  await input.press('a')
  await expect(input).toHaveValue('重进搁已删 a')
  await expect(input).toBeFocused()
  // Arrow keys and Home/End only move the caret in the input: Home then x, one right then y, End then z;
  // Tab does not move focus out of the menu.
  await input.press('ArrowDown')
  await input.press('ArrowUp')
  await input.press('Home')
  await input.press('x')
  await input.press('ArrowRight')
  await input.press('y')
  await input.press('End')
  await input.press('z')
  // Same reason: assert before press('Tab'), which would otherwise focus the input again first.
  await expect(input).toBeFocused()
  await input.press('Tab')
  await expect(input).toHaveValue('x重y进搁已删 az')
  await expect(input).toBeFocused()

  // Esc cancels: the menu closes and the name is unchanged.
  await input.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(card.locator('.project-identity-name')).toHaveText('draft 效率')
  expect((await listProjects(win)).find((p) => p.id === 'draft')?.name).toBe('draft 效率')

  // Enter to submit
  await card.hover()
  await card.locator('.dots').click()
  await menu.locator('[role="menuitem"]', { hasText: '重命名' }).click()
  await input.fill(RENAMED_PROJECT)
  await input.press('Enter')
  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已重命名')
  await expect(card.locator('.project-identity-name')).toHaveText(RENAMED_PROJECT)
})

test('项目菜单开着、指针挪到菜单项上之后,悬停才露出的 ... 触发器仍然可见,面板也留着 hover 的描边', async ({ win }) => {
  await gotoList(win)
  const card = shown(win).locator('[data-proj="draft"]')
  const dots = card.locator('.dots')

  await card.hover()
  await settle(card)
  const hoverBorderColor = await card.evaluate((el) => getComputedStyle(el).borderColor)
  await dots.click()
  // Moving the pointer onto a menu item really takes :hover off the card; without the move, :hover
  // sticks and the bug cannot show.
  await win.locator('[role="menu"] [role="menuitem"]').first().hover()
  await settle(dots)
  await expect(card.locator('.row-actions')).toHaveCSS('opacity', '1')
  await settle(card)
  expect(await card.evaluate((el) => getComputedStyle(el).borderColor)).toBe(hoverBorderColor)
})

test('搁置或已完成的项目菜单开着、指针挪到菜单项上之后,行也留着 hover 的底色', async ({ win }) => {
  await gotoList(win)
  const row = shown(win).locator('[data-proj="moe"]')
  const dots = row.locator('.dots')

  await row.hover()
  await settle(row)
  // The row's hover is an overlay image over its own colour (StructuredList.css).
  const hoverBg = await row.evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(hoverBg).not.toBe('none')
  await dots.click()
  // Moving the pointer onto a menu item really takes :hover off the row; without the move, :hover
  // sticks and the bug cannot show.
  await win.locator('[role="menu"] [role="menuitem"]').first().hover()
  await settle(row)
  expect(await row.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe(hoverBg)
})

test('菜单开着时触发器仍然可点;再点一下菜单收起,不重新弹出也不冒给行', async ({ win }) => {
  await gotoList(win)
  const card = shown(win).locator('[data-proj="draft"]')
  const dots = card.locator('.dots')
  const menu = win.locator('[role="menu"]')

  await card.hover()
  await dots.click()
  await expect(menu).toHaveCount(1)
  // Click again on the same trigger and the menu will collapse.
  await dots.click()
  await expect(menu).toHaveCount(0)
  // The click did not reach the card: the list still shows, and the project detail did not open.
  await expect(card).toBeVisible()
})

test('库里一个项目都没有时,「＋ 新建项目」仍在,建得出第一个项目', async ({ win }) => {
  for (const { id } of await listProjects(win)) {
    await win.evaluate((projectId) => (window as unknown as MeridianWindow).meridian
      .call('project.delete', { id: projectId }), id)
  }
  expect(await listProjects(win)).toEqual([])

  await gotoList(win)
  await expect(shown(win).locator('.desk-head .t')).toHaveText('项目 · 0')
  await shown(win).locator('#projNew').click()
  await shown(win).locator('.projpanel .inedit').fill(NEW_PROJECT)
  await shown(win).locator('.projpanel .inedit').press('Enter')

  await expect(win.locator('#notice[data-tone="success"] .notice-text')).toHaveText('已创建项目 · 已加入研究总览')
  expect((await listProjects(win)).map((p) => p.name)).toEqual([NEW_PROJECT])
  await expect(shown(win).locator('.projpanel .project-identity-name')).toHaveText([NEW_PROJECT])
})

test('拖一张进行中的卡片到另一张前面,顺序写进库里;别的分组不受影响', async ({ win }) => {
  await gotoList(win)
  const before = await listProjects(win)
  const activeIds = before.filter((p) => p.status === ACTIVE).map((p) => p.id)
  const otherIds = before.filter((p) => p.status !== ACTIVE).map((p) => p.id)
  expect(activeIds.length).toBeGreaterThan(2)

  const dragged = shown(win).locator(`[data-proj="${activeIds.at(-1)}"]`)
  const target = shown(win).locator(`[data-proj="${activeIds[0]}"]`)
  const targetBox = (await target.boundingBox())!
  // A card is dragged by the grip in its row-actions slot.
  await dragged.locator('.drag-handle').dispatchEvent('dragstart', { dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })
  await target.dispatchEvent('dragover', {
    clientY: targetBox.y + 2, // top of the target's box: insert before it.
    dataTransfer: await win.evaluateHandle(() => new DataTransfer()),
  })
  await target.dispatchEvent('drop', { dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })

  const expectedActive = [activeIds.at(-1), ...activeIds.slice(0, -1)]
  await expect(shown(win).locator('.projpanel')).toHaveCount(activeIds.length)
  await expect(shown(win).locator('.projpanel').first()).toHaveAttribute('data-proj', activeIds.at(-1)!)
  await expect.poll(async () => (await listProjects(win)).filter((p) => p.status === ACTIVE).map((p) => p.id))
    .toEqual(expectedActive)
  expect((await listProjects(win)).filter((p) => p.status !== ACTIVE).map((p) => p.id)).toEqual(otherIds)
})

test('排序按钮:按优先级重排后写进库里,与算出来的顺序一致', async ({ win }) => {
  await gotoList(win)
  const active = (await listProjects(win)).filter((p) => p.status === ACTIVE)
  expect(active.length).toBeGreaterThan(1)
  const priorityById = new Map(await win.evaluate(async () => {
    const rows = await (window as unknown as MeridianWindow).meridian.call('project.list', {}) as
      { id: string; priority: string }[]
    return rows.map(({ id, priority }): [string, string] => [id, priority])
  }))
  const expectedOrder = active
    .map((p, i) => ({ id: p.id, priority: priorityById.get(p.id)!, i }))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.i - b.i)
    .map((p) => p.id)

  const sortTrigger = win.locator('.desk-head .page-actions .sort-menu', { hasText: '排序' })
  const sortBox = await sortTrigger.boundingBox()
  const addBox = await win.locator('#projNew').boundingBox()
  // The sort entry sits beside the page's add action and must share its height and baseline.
  expect(sortBox!.height).toBe(addBox!.height)
  expect(sortBox!.y).toBe(addBox!.y)

  await sortTrigger.click()
  await win.locator('.ctxmenu .mi', { hasText: '按优先级' }).click()

  await expect.poll(async () => (await listProjects(win)).filter((p) => p.status === ACTIVE).map((p) => p.id))
    .toEqual(expectedOrder)
})
