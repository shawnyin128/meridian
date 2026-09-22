import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, openSettings, settle, test, type MeridianWindow } from './app.js'

/** The screen you entered is always hung, and the selectors that are present on every screen, such as messages and input boxes, should be included in the currently displayed screen. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const DEMO = resolve(import.meta.dirname, 'fixtures/platform-shell-demo.html')

/**
 * Extract the preset line of askConflict() from the demo source file: the sentence you asked, and the original HTML text of the answer.
 * The expected value is taken from the demo itself, not copied by hand.
 */
function conflictFromDemo(): { asked: string; reply: string } {
  const demo = readFileSync(DEMO, 'utf8')
  const body = /function askConflict\(\)\{([\s\S]*?)\n\}/.exec(demo)
  if (!body) throw new Error('demo 里找不到 askConflict() 的函数体')
  const asked = /you\('([^']*)'\)/.exec(body[1]!)
  const reply = /guide\(`([\s\S]*?)`\)/.exec(body[1]!)
  if (!asked || !reply) throw new Error('demo 的 askConflict() 里找不到那两条消息')
  // The demo predates the full-width punctuation convention decided in
  // docs/superpowers/plans/2026-09-18-ui-consistency.md (D1), which voided the earlier half-width rule;
  // the product's own copy already uses the full-width question mark, so normalize this one divergence.
  return { asked: asked[1]!.replace(/\?$/, '？'), reply: reply[1]! }
}

const MODEL_NOT_CONFIGURED = 'AI 尚未接入，请先在设置中配置模型与 API Key。'

/** A piece of HTML text with tags stripped and whitespace collapsed into a single space. */
const stripped = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/** Bypass the interface and adjust the contract directly. */
const core = <T>(win: Page, method: string, params: unknown) =>
  win.evaluate(([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p),
    [method, params] as const) as Promise<T>

type Session = { id: string; title: string; archived: boolean; messageCount: number }

/** Click the `at` conversation in the "Conversation" group on the sidebar to enter the conversation screen. The session list is laid out after it is retrieved, so wait for it to land first. */
async function gotoChat(win: Page, at = 0): Promise<void> {
  await win.locator('#chatList .chat-row').first().waitFor()
  await win.locator('#chatList .chat-row').nth(at).click()
  await shown(win, '#composer').waitFor()
  // Each session in the fixture carries messages. Wait until they are completed before starting, so as not to regard the empty stream as the entire session.
  await shown(win, '.msg').first().waitFor()
}

/** Send a sentence in the current conversation and wait for the response to fall on the message stream. */
async function say(win: Page, value: string): Promise<void> {
  const before = await shown(win, '.msg').count()
  await shown(win, '#composer').fill(value)
  await shown(win, '#sendBtn').click()
  await expect(shown(win, '.msg')).toHaveCount(before + 2)
}

/** Start a new conversation: + on the "Conversation" title in the sidebar. */
async function newChat(win: Page): Promise<void> {
  await win.locator('.sidebar .sb-add[title="新对话"]').click()
  await shown(win, '#composer').waitFor()
}

test('侧栏对话组的行数与 chat.list 一致,进屏后面包屑是对话加会话名', async ({ win }) => {
  const sessions = await core<Session[]>(win, 'chat.list', {})
  const active = sessions.filter((s) => !s.archived)
  const archived = sessions.filter((s) => s.archived)
  expect(active.length).toBeGreaterThan(0)
  expect(archived.length).toBeGreaterThan(0)

  await expect(win.locator('#chatList .chat-row')).toHaveCount(active.length)
  await expect(win.locator('#chatList .ct-t')).toHaveText(active.map((s) => s.title))
  // Archived conversations are not in the sidebar at all, they are in settings
  await expect(win.locator('.sidebar .chat-row')).toHaveCount(active.length)
  for (const s of archived) await expect(win.locator('.sidebar')).not.toContainText(s.title)

  await gotoChat(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', active[0]!.title])
  await expect(shown(win, '.msg')).toHaveCount(active[0]!.messageCount)
})

test('动态的「看看」建立结论冲突会话，未配置模型时给明确状态', async ({ win }) => {
  const demo = conflictFromDemo()
  await win.locator('.brief .bitem .go .btn').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', '结论冲突'])

  await expect(shown(win, '.msg.you .bubble')).toHaveText(demo.asked)
  await expect(shown(win, '.msg .event')).toHaveText(MODEL_NOT_CONFIGURED)
  await expect(shown(win, '.msg.ai')).toHaveCount(0)
  await expect(shown(win, '.msgs')).not.toContainText(stripped(demo.reply.split('<div class="macts">')[0]!))

  // This line becomes a conversation by itself and is ranked at the top of the conversation list.
  await expect(win.locator('#chatList .ct-t').first()).toHaveText('结论冲突')
})

test('@ 引用项目、论文与 wiki 页都交给真实对话链路', async ({ win }) => {
  await gotoChat(win)

  const projects = await core<{ id: string; name: string }[]>(win, 'project.list', {})
  const p = projects.find((x) => x.id === 'draft')!
  await say(win, `@${p.name} 这条线还剩什么`)
  await expect(shown(win, '.msg.you .bubble').last()).toContainText(`@${p.name}`)
  await expect(shown(win, '.msg .event').last()).toHaveText(MODEL_NOT_CONFIGURED)

  const page = (await core<{ id: string; title: string; kindLabel: string; updated: string; summary: string }[]>(
    win, 'wiki.cards', {}))[0]!
  await say(win, `@${page.title} 这一页怎么说`)
  await expect(shown(win, '.msg.you .bubble').last()).toContainText(`@${page.title}`)
  await expect(shown(win, '.msg .event').last()).toHaveText(MODEL_NOT_CONFIGURED)

  const paper = (await core<{ rows: { title: string }[] }>(
    win, 'papers.list', { page: 1, size: 1 })).rows[0]!
  await say(win, `@${paper.title.split(':')[0]} 这篇讲了什么`)
  await expect(shown(win, '.msg.you .bubble').last()).toContainText(`@${paper.title.split(':')[0]}`)
  await expect(shown(win, '.msg .event').last()).toHaveText(MODEL_NOT_CONFIGURED)
})

test('问一个一般问题,出来的是「AI 尚未接入」的状态而不是回答', async ({ win }) => {
  await newChat(win)
  await say(win, '宽树在批量下还成立吗?')

  await expect(shown(win, '.msg .event')).toHaveText(MODEL_NOT_CONFIGURED)
  // The status is not an answer: it does not form an answer bubble, nor does the fake answer marked "demo" appear.
  await expect(shown(win, '.msg.ai')).toHaveCount(0)
  await expect(shown(win, '.msgs')).not.toContainText('(demo)')
})

test('短输入也会真正发送，不再被当成未实现的搜索词', async ({ win }) => {
  await newChat(win)
  await say(win, '测试')

  await expect(shown(win, '.msg .event')).toHaveText(MODEL_NOT_CONFIGURED)
  await expect(shown(win, '.msg.ai')).toHaveCount(0)
  await expect(shown(win, '.msg.you .bubble')).toHaveText('测试')
})

test('@ 下拉按项目、论文、Wiki 三组列候选,点一条填进输入框', async ({ win }) => {
  await gotoChat(win)
  await shown(win, '#composer').fill('@')
  await expect(win.locator('#cRes .rg')).toHaveText(['项目', '论文', 'Wiki'])

  const first = win.locator('#cRes .rrow').first()
  const picked = await first.locator('.rt').textContent()
  await first.click()
  await expect(shown(win, '#composer')).toHaveValue(`${picked} `)
  await expect(win.locator('#cRes')).toHaveCount(0)
})

/** Ask the contract directly: This article is not archived now. */
const isArchived = async (win: Page, id: string) =>
  (await core<Session[]>(win, 'chat.list', {})).find((s) => s.id === id)!.archived

test('归档把会话移出侧栏,设置里取消归档把它放回', async ({ app, win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  const sessions = await core<Session[]>(win, 'chat.list', {})
  const target = sessions.find((s) => !s.archived)!
  const listed = sessions.filter((s) => !s.archived).length

  await win.locator(`#chatList [data-chat="${target.id}"]`).hover()
  await win.locator(`#chatList [data-chat="${target.id}"] .dots`).click()
  await win.locator('.ctxmenu .mi').click()
  await expect(win.locator('.sidebar .chat-row')).toHaveCount(listed - 1)
  await expect(win.locator(`.sidebar [data-chat="${target.id}"]`)).toHaveCount(0)
  expect(await isArchived(win, target.id)).toBe(true)

  await openSettings(app, win)
  // Settings is a modal that covers the current screen, not one screen: opening it does not change the screen, and the breadcrumbs still stay on the screen where the archiving occurred.
  await expect(win.locator('#crumb .cseg')).toHaveText(['动态'])
  // By default, the settings fall into the storage category. Only the category in the left column of archived dialogue points can be drawn.
  await win.locator('[data-setcat="archived"]').click()
  await expect(win.locator(`.setdlg .wrow[data-chat="${target.id}"] .nm`)).toHaveText(target.title)

  await win.locator(`.setdlg .wrow[data-chat="${target.id}"]`)
    .getByRole('button', { name: '取消归档' }).click()
  await expect(win.locator(`.setdlg .wrow[data-chat="${target.id}"]`)).toHaveCount(0)
  await expect(win.locator(`#chatList [data-chat="${target.id}"]`)).toHaveCount(1)
  await expect(win.locator('.sidebar .chat-row')).toHaveCount(listed)
  expect(await isArchived(win, target.id)).toBe(false)
})

test('设置里「打开」进那条归档的会话,模态让开且屏上标出它是归档的', async ({ app, win }) => {
  const archived = (await core<Session[]>(win, 'chat.list', {})).find((s) => s.archived)!

  await openSettings(app, win)
  // By default, the settings fall into the storage category. Only the category in the left column of archived dialogue points can be drawn.
  await win.locator('[data-setcat="archived"]').click()
  await win.locator(`.setdlg .wrow[data-chat="${archived.id}"]`)
    .getByRole('button', { name: '打开' }).click()

  await expect(win.locator('.setdlg')).toHaveCount(0)
  // The archived conversations are not in the sidebar column. Once they are entered, they cannot be distinguished from other conversations, so the breadcrumbs must be marked with a sentence.
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', `${archived.title} · 已归档`])
  await expect(shown(win, '.msg')).toHaveCount(archived.messageCount)
})

test('把讨论整理成可回看的想法', async ({ win }) => {
  await gotoChat(win)
  await say(win, '@draft 效率 拐点是 batch size 的函数')

  // The dialog renders through a Radix portal outside any screenslot, so address it directly.
  await shown(win, '#qaIdea').click()
  await win.locator('.idea-dialog .form-input').fill('批大小拐点')
  await win.locator('.idea-dialog .form-textarea').fill('验证最优批大小是否随推理深度稳定迁移。')
  await win.locator('.idea-dialog').getByRole('button', { name: '保存想法' }).click()
  await win.locator('[data-desk="ideas"]').click()
  // Target the new idea by its own title: the ideas list holds many fixture cards, not sorted with ours first.
  const ideaCard = shown(win, '.idea-card').filter({ hasText: '批大小拐点' })
  await expect(ideaCard).toContainText('批大小拐点')
  await expect(ideaCard).toContainText('未关联项目')
  // The card now previews the idea's body as its own summary line, not just in the detail panel.
  await expect(ideaCard).toContainText('验证最优批大小是否随推理深度稳定迁移。')
  await ideaCard.click()
  await expect(shown(win, '.idea-detail-panel'))
    .toContainText('验证最优批大小是否随推理深度稳定迁移。')
  await expect(win.locator('#qaConcl')).toHaveCount(0)
})

test('会话行的更多菜单是真菜单:触发器报 menu,下键高亮归档,回车归档且不进那条会话', async ({ win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  const target = (await core<Session[]>(win, 'chat.list', {})).find((s) => !s.archived)!
  const row = win.locator(`#chatList [data-chat="${target.id}"]`)

  await row.hover()
  await expect(row.locator('.dots')).toHaveAttribute('aria-haspopup', 'menu')
  await row.locator('.dots').click()
  const items = win.locator('[role="menu"] [role="menuitem"]')
  await expect(items).toHaveText(['归档'])
  await win.keyboard.press('ArrowDown')
  await expect(items.first()).toHaveAttribute('data-highlighted', '')
  await win.keyboard.press('Enter')

  await expect(row).toHaveCount(0)
  expect(await isArchived(win, target.id)).toBe(true)
  // The click of Enter to select does not pop up on the session line: it still stays on the dynamic screen when the application starts.
  await expect(win.locator('#crumb .cseg')).toHaveText(['动态'])
})

test('正打开着的会话开它的 ... 菜单,行仍然是选中底色,不是 hover 底色', async ({ win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  const target = (await core<Session[]>(win, 'chat.list', {})).find((s) => !s.archived)!
  const row = win.locator(`#chatList [data-chat="${target.id}"]`)
  await row.click()
  await shown(win, '#composer').waitFor()
  await expect(row).toHaveClass(/\bon\b/)

  // The background color of the selected row is given by .srow.on, not this hover rule; here we first take the background color of the actual selected state for reference
  await settle(row)
  const selectedBg = await row.evaluate((el) => getComputedStyle(el).backgroundColor)

  await row.hover()
  await row.locator('.dots').click()
  // When the pointer is moved to the menu item, the line is really lost :hover - if it is not moved, it will be "sticky" and no problem can be detected.
  await win.locator('[role="menu"] [role="menuitem"]').first().hover()
  await settle(row)
  expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(selectedBg)
})

test('未选中的会话行开它的 ... 菜单,行留着 hover 底色', async ({ win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  const sessions = (await core<Session[]>(win, 'chat.list', {})).filter((s) => !s.archived)
  const row = win.locator(`#chatList [data-chat="${sessions[0]!.id}"]`)
  await expect(row).not.toHaveClass(/\bon\b/)

  await row.hover()
  await settle(row)
  const hoverBg = await row.evaluate((el) => getComputedStyle(el).backgroundColor)

  await row.locator('.dots').click()
  // When the pointer is moved to the menu item, the line is really lost :hover - if it is not moved, it will be "sticky" and no problem can be detected.
  await win.locator('[role="menu"] [role="menuitem"]').first().hover()
  await settle(row)
  expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(hoverBg)
})
