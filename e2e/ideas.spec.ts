import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, narrowTitles, test, unfitTags, type MeridianWindow } from './app.js'

/** Screens stay mounted once visited, so selectors every screen has are scoped to the visible one. */
const shown = (win: Page) => win.locator('.screenslot:not([hidden])')

const gotoIdeas = (win: Page) => win.locator('[data-desk="ideas"]').click()

/** Creates a throwaway chat and one idea from it directly, bypassing the UI, and returns the idea. */
const seedIdea = (win: Page, title: string) => win.evaluate(async (ideaTitle) => {
  const meridian = (window as unknown as MeridianWindow).meridian
  const chat = await meridian.call('chat.create', { title: ideaTitle, named: true }) as { id: string }
  return meridian.call('idea.create', { chatId: chat.id, title: ideaTitle, body: '排序用例的正文' }) as
    Promise<{ id: string; title: string }>
}, title)

const listIdeaIds = (win: Page) => win.evaluate(async () => {
  const rows = await (window as unknown as MeridianWindow).meridian.call('idea.list', {}) as { id: string }[]
  return rows.map((row) => row.id)
})

const dragCard = async (win: Page, draggedId: string, targetId: string) => {
  const dragged = shown(win).locator(`[data-idea="${draggedId}"]`)
  const target = shown(win).locator(`[data-idea="${targetId}"]`)
  const targetBox = (await target.boundingBox())!
  // A card is dragged by the grip in its row-actions slot.
  await dragged.locator('.drag-handle').dispatchEvent('dragstart', { dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })
  await target.dispatchEvent('dragover', {
    clientY: targetBox.y + 2, // top of the target's box: insert before it.
    dataTransfer: await win.evaluateHandle(() => new DataTransfer()),
  })
  await target.dispatchEvent('drop', { dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })
}

test('拖一张想法卡片到另一张前面,顺序写进库里', async ({ win }) => {
  const seeded = new Set([
    (await seedIdea(win, '排序用想法甲')).id, (await seedIdea(win, '排序用想法乙')).id,
    (await seedIdea(win, '排序用想法丙')).id,
  ])
  await gotoIdeas(win)
  // Same-day ideas tie on `updated`, so the starting order is not creation order; read it instead of assuming it.
  const initial = (await listIdeaIds(win)).filter((id) => seeded.has(id))
  const [first, , last] = initial

  await dragCard(win, last!, first!)

  const rest = initial.filter((id) => id !== last)
  const expected = [...rest.slice(0, rest.indexOf(first!)), last, ...rest.slice(rest.indexOf(first!))]
  await expect.poll(async () => (await listIdeaIds(win)).filter((id) => seeded.has(id))).toEqual(expected)
})

test('拖一行进行中的想法经过另一行,落点画出和项目行一样的线,被拖的那行变淡', async ({ win }) => {
  const [dragged, target] = [await seedIdea(win, '落点线用想法甲'), await seedIdea(win, '落点线用想法乙')]
  for (const { id } of [dragged, target]) {
    await win.evaluate((ideaId) => (window as unknown as MeridianWindow).meridian.call('idea.update', {
      id: ideaId, patch: { project: 'draft' },
    }), id)
  }
  await gotoIdeas(win)
  const draggedRow = shown(win).locator(`.idea-row[data-idea="${dragged.id}"]`)
  const targetRow = shown(win).locator(`.idea-row[data-idea="${target.id}"]`)
  const ink = await win.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--ink)'
    document.body.append(probe)
    const colour = getComputedStyle(probe).color
    probe.remove()
    return colour
  })

  await draggedRow.locator('.drag-handle').dispatchEvent('dragstart', { dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })
  const box = (await targetRow.boundingBox())!
  await targetRow.dispatchEvent('dragover', { clientY: box.y + 2, dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })
  await expect(draggedRow).toHaveCSS('opacity', '0.4')
  await expect(targetRow).toHaveCSS('box-shadow', `${ink} 0px -2px 0px 0px`)
  await targetRow.dispatchEvent('dragover', {
    clientY: box.y + box.height - 2, dataTransfer: await win.evaluateHandle(() => new DataTransfer()),
  })
  await expect(targetRow).toHaveCSS('box-shadow', `${ink} 0px 2px 0px 0px`)
})

test('排序点「按更新时间」不报错,菜单收起、列表还在', async ({ win }) => {
  const seeded = await seedIdea(win, '排序菜单验证')
  await gotoIdeas(win)

  await win.locator('.desk-head .page-actions .sort-menu', { hasText: '排序' }).click()
  await win.locator('.ctxmenu .mi', { hasText: '按更新时间' }).click()

  await expect(win.locator('.ctxmenu')).toHaveCount(0)
  await expect(shown(win).locator(`[data-idea="${seeded.id}"]`)).toBeVisible()
})

test('想法详情开着时再点侧栏「想法」,详情收起回到列表', async ({ win }) => {
  const seeded = await seedIdea(win, '侧栏收起详情')
  await gotoIdeas(win)
  await shown(win).locator(`[data-idea="${seeded.id}"]`).click()
  await expect(shown(win).locator('.idea-detail-panel')).toHaveCount(1)
  await gotoIdeas(win)
  await expect(shown(win).locator('.idea-detail-panel')).toHaveCount(0)
})

test('论文详情开着时再点侧栏「论文」,详情收起回到表格', async ({ win }) => {
  await win.locator('[data-desk="papers"]').click()
  await shown(win).locator('.ptable tbody tr').first().click()
  await expect(shown(win).locator('.pdetail')).toHaveCount(1)
  await win.locator('[data-desk="papers"]').click()
  await expect(shown(win).locator('.pdetail')).toHaveCount(0)
})

test('coding agent 在项目工作区记下的想法出现在想法页,标着 agent,来源写那个项目,不算放进那个项目,没有「打开来源对话」', async ({ win }) => {
  const repo = mkdtempSync(join(tmpdir(), 'meridian-agent-ideas-'))
  const ideaCount = win.locator('[data-desk="ideas"] .nav-row-count')
  const before = Number(await ideaCount.textContent())
  try {
    await win.evaluate((root) => (window as unknown as MeridianWindow).meridian.call('project.bindWorkspace', {
      id: 'draft', binding: { kind: 'local', root },
    }), repo)
    mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
    writeFileSync(join(repo, '.meridian/ideas/ideas.json'), JSON.stringify({
      schema_version: 'meridian.workspace-agent-ideas.v1',
      ideas: [{
        id: 'reuse-distance', date: '2026-09-21', title: 'agent 记下的想法:按复用距离淘汰前缀缓存',
        body: '用复用距离替代 LRU,只淘汰短期内不会再命中的前缀。', context: '缓存淘汰的实现讨论',
      }],
    }))

    await gotoIdeas(win)
    const card = shown(win).locator('.idea-card', { hasText: 'agent 记下的想法' })
    await expect(card).toHaveCount(1)
    await expect(card.locator('.idea-source-kind')).toHaveText('agent')
    await expect(ideaCount).toHaveText(String(before + 1))
    await expect(card.locator('.idea-card-source')).toHaveText('来源 · draft 效率 · 缓存淘汰的实现讨论')
    await card.click()
    const detail = shown(win).locator('.idea-detail-panel')
    await expect(detail.locator('.idea-panel-source')).toHaveText('draft 效率 · 缓存淘汰的实现讨论')
    await expect(detail.getByRole('button', { name: '打开来源对话' })).toHaveCount(0)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

/**
 * The trailing "updated" date of every idea card and row on the shown Ideas page: whether the item
 * is a card or a row, the date's text, where its box starts and ends, and what cuts it off: its own box,
 * the item's padding edge, a clipping box around it inside the item, or another element of the item
 * painted over it.
 */
const trailingDates = (win: Page) => shown(win).locator('.idea-card, .idea-row').evaluateAll((items) => items.map((item) => {
  const date = [...item.querySelectorAll('span')].find((span) => /^\d+月\d+日 更新$/.test(span.textContent ?? ''))!
  const box = date.getBoundingClientRect()
  const text = document.createRange()
  text.selectNodeContents(date)
  const cuts: string[] = []
  if (date.scrollWidth > date.clientWidth || text.getBoundingClientRect().right > box.right + 0.5) cuts.push('its own box')
  const itemStyle = getComputedStyle(item)
  const itemEnd = item.getBoundingClientRect().right - parseFloat(itemStyle.borderRightWidth) - parseFloat(itemStyle.paddingRight)
  if (box.right > itemEnd + 0.5) cuts.push('the item edge')
  /** The part of `el` from `left` to `right` that the clipping boxes around it inside the item leave visible. */
  const visible = (el: Element) => {
    let { left, right } = el.getBoundingClientRect()
    for (let around = el.parentElement; around !== null && around !== item; around = around.parentElement) {
      if (getComputedStyle(around).overflowX === 'visible') continue
      const clip = around.getBoundingClientRect()
      left = Math.max(left, clip.left)
      right = Math.min(right, clip.right)
    }
    return { left, right }
  }
  if (visible(date).right < box.right - 0.5) cuts.push('a clipping box around it')
  for (const el of item.querySelectorAll('*')) {
    if (el.childElementCount > 0 || el.contains(date) || date.contains(el)) continue
    const { top, bottom } = el.getBoundingClientRect()
    const { left, right } = visible(el)
    if (right > box.left + 0.5 && left < box.right - 0.5 && bottom > box.top && top < box.bottom) cuts.push(`${el.className} over it`)
  }
  return { kind: item.classList.contains('idea-row') ? 'row' : 'card', text: date.textContent, left: box.left, right: box.right, cuts }
}))

test('未开始的卡片和进行中的行,末尾的更新日期起点和右边线都对齐,长短不同的日期也不被截断', async ({ app, win }) => {
  const repo = mkdtempSync(join(tmpdir(), 'meridian-trailing-dates-'))
  try {
    // Agent ideas keep the day the workspace file gives them: the narrowest and the widest date label.
    await win.evaluate((root) => (window as unknown as MeridianWindow).meridian.call('project.bindWorkspace', {
      id: 'draft', binding: { kind: 'local', root },
    }), repo)
    mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
    writeFileSync(join(repo, '.meridian/ideas/ideas.json'), JSON.stringify({
      schema_version: 'meridian.workspace-agent-ideas.v1',
      ideas: [
        { id: 'narrow-date', date: '2026-01-01', title: '日期最窄的想法', body: '一月一日记下。' },
        { id: 'wide-date', date: '2025-12-28', title: '日期最宽的想法', body: '十二月二十八日记下。' },
      ],
    }))
    await gotoIdeas(win)
    await expect(shown(win).locator('.idea-card', { hasText: '日期最窄的想法' })).toHaveCount(1)

    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
    for (const [width, height] of [[1440, 900], [1280, 800]] as const) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(size.width, size.height), { width, height })
      await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(width)
      const dates = await trailingDates(win)
      const shownDates = `${width}×${height}: ${JSON.stringify(dates)}`
      expect(new Set(dates.map((date) => date.kind)), shownDates).toEqual(new Set(['card', 'row']))
      expect(dates.map((date) => date.text), shownDates).toEqual(expect.arrayContaining(['1月1日 更新', '12月28日 更新']))
      expect(spread(dates.map((date) => date.right)), `右边线 ${shownDates}`).toBeLessThan(0.5)
      expect(spread(dates.map((date) => date.left)), `起点 ${shownDates}`).toBeLessThan(0.5)
      expect(dates.filter((date) => date.cuts.length > 0), shownDates).toEqual([])
    }
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('项目名很长、行又放不下时,标题留够十二个字,放不下的列整列收起,留下的标签都完整显示', async ({ app, win }) => {
  const idea = await seedIdea(win, '挤压标签用想法')
  // A shelved project with a long name: its row shows the name and the shelved status tag side by side.
  await win.evaluate(async (ideaId) => {
    const meridian = (window as unknown as MeridianWindow).meridian
    const name = '推测解码和 KV 量化联合优化'
    await meridian.call('project.create', { name })
    const projects = await meridian.call('project.list', {}) as { id: string; name: string }[]
    const id = projects.find((project) => project.name === name)!.id
    await meridian.call('project.update', { id, patch: { status: '搁置' } })
    await meridian.call('idea.update', { id: ideaId, patch: { project: id } })
  }, idea.id)
  await gotoIdeas(win)
  const row = shown(win).locator(`.idea-row[data-idea="${idea.id}"]`)
  await expect(row.locator('.idea-row-work .tag')).toHaveText(['推测解码和 KV 量化联合优化', '搁置'])

  for (const [width, height] of [[1440, 900], [1280, 800]] as const) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(size.width, size.height), { width, height })
    await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(width)
    expect(await unfitTags(shown(win).locator('.ideas-list')), `${width}×${height}`).toEqual([])
    expect(await narrowTitles(shown(win).locator('.idea-row-open')), `${width}×${height}`).toEqual([])
    await row.click()
    await expect(shown(win).locator('.idea-detail-panel')).toHaveCount(1)
    expect(await unfitTags(shown(win).locator('.ideas-list')), `${width}×${height} 详情开着`).toEqual([])
    expect(await narrowTitles(shown(win).locator('.idea-row-open')), `${width}×${height} 详情开着`).toEqual([])
    await shown(win).locator('.idea-detail-panel .panel-close').click()
    await expect(shown(win).locator('.idea-detail-panel')).toHaveCount(0)
  }
})
