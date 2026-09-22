import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test, type MeridianWindow } from './app.js'

/** The screen you entered is always hung; store selectors that exist on every screen inside the currently shown one. */
const shown = (win: Page) => win.locator('.screenslot:not([hidden])')

const gotoIdeas = (win: Page) => win.locator('[data-desk="ideas"]').click()

/** Bypass the interface: create a throwaway chat, then one idea from it, and return the idea. */
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
  await dragged.dispatchEvent('dragstart', { dataTransfer: await win.evaluateHandle(() => new DataTransfer()) })
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

test('排序按钮点「按更新时间」不报错,菜单收起、列表还在', async ({ win }) => {
  const seeded = await seedIdea(win, '排序菜单验证')
  await gotoIdeas(win)

  await win.locator('.section-heading.flexh .sort-menu', { hasText: '排序' }).click()
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

test('coding agent 在项目工作区记下的想法出现在想法页,标着来自 coding agent,没有「打开来源对话」', async ({ win }) => {
  const repo = mkdtempSync(join(tmpdir(), 'meridian-agent-ideas-'))
  const ideaCount = win.locator('[data-desk="ideas"] .n')
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
    await expect(card.locator('.idea-source-kind')).toHaveText('coding agent')
    await expect(ideaCount).toHaveText(String(before + 1))
    await expect(card.locator('.idea-project-tag')).toHaveText('项目 · draft 效率')
    await card.click()
    const detail = shown(win).locator('.idea-detail-panel')
    await expect(detail).toContainText('缓存淘汰的实现讨论')
    await expect(detail.getByRole('button', { name: '打开来源对话' })).toHaveCount(0)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
