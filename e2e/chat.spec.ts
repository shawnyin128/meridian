import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { belowHeader, expect, openSettings, settle, test, type MeridianWindow } from './app.js'

/** Screens stay mounted once visited, so selectors every screen has, such as messages, are scoped to the visible one. */
const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

const DEMO = resolve(import.meta.dirname, 'fixtures/platform-shell-demo.html')

/**
 * Extracts the scripted exchange in the demo's askConflict(): the user's question and the reply's raw HTML.
 * Expected values come from the demo itself rather than being copied by hand.
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

/** The composer's state after a send that found no model set up. */
const NO_MODEL = 'AI 未连接'

/** A piece of HTML text with tags stripped and whitespace collapsed into a single space. */
const stripped = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/** Calls a Core contract method directly, bypassing the UI. */
const core = <T>(win: Page, method: string, params: unknown) =>
  win.evaluate(([m, p]) => (window as unknown as MeridianWindow).meridian.call(m as string, p),
    [method, params] as const) as Promise<T>

type Session = { id: string; title: string; archived: boolean; messageCount: number; paperId?: string }

/** Opens the chat at index `at` in the sidebar's Chats group, waiting first for the fetched list to render. */
async function gotoChat(win: Page, at = 0): Promise<void> {
  await win.locator('#chatList .chat-row').first().waitFor()
  await win.locator('#chatList .chat-row').nth(at).click()
  await shown(win, '#composer').waitFor()
  // Every fixture chat has messages; wait for them so an empty message list is not taken for the whole chat.
  await shown(win, '.msg').first().waitFor()
}

/** Sends a message in the open chat and waits until it is the last message; with no model, no reply follows it. */
async function say(win: Page, value: string): Promise<void> {
  const before = await shown(win, '.msg').count()
  await shown(win, '#composer').fill(value)
  await shown(win, '#sendBtn').click()
  await expect(shown(win, '.msg')).toHaveCount(before + 1)
  await expect(shown(win, '.msg').last()).toHaveClass(/\byou\b/)
}

/**
 * Sends `before`, then the mention picked by typing `@` and `query`, the candidate whose name starts
 * with `name`, then `after`, and waits until the message is the last one.
 */
async function sayWith(win: Page, before: string, query: string, name: string, after: string): Promise<void> {
  const count = await shown(win, '.msg').count()
  const composer = shown(win, '#composer')
  await composer.fill(before)
  await composer.pressSequentially(`@${query}`)
  await win.locator('#cRes .rrow').filter({ has: win.locator('.rt', { hasText: `@${name}` }) }).first().click()
  await composer.pressSequentially(after)
  await shown(win, '#sendBtn').click()
  await expect(shown(win, '.msg')).toHaveCount(count + 1)
}

/** Starts a new chat with the + on the sidebar's Chats heading. */
async function newChat(win: Page): Promise<void> {
  await win.locator('#sidebar .add-action[aria-label="新对话"]').click()
  await shown(win, '#composer').waitFor()
}

test('侧栏对话组的行数与 chat.list 一致,进屏后面包屑是对话加会话名', async ({ win }) => {
  const sessions = await core<Session[]>(win, 'chat.list', {})
  const active = sessions.filter((s) => !s.archived)
  const archived = sessions.filter((s) => s.archived)
  expect(active.length).toBeGreaterThan(0)
  expect(archived.length).toBeGreaterThan(0)

  await expect(win.locator('#chatList .chat-row')).toHaveCount(active.length)
  await expect(win.locator('#chatList .fade-text')).toHaveText(active.map((s) => s.title))
  // Archived chats are not in the sidebar at all; they are listed in Settings.
  await expect(win.locator('#sidebar .chat-row')).toHaveCount(active.length)
  for (const s of archived) await expect(win.locator('#sidebar')).not.toContainText(s.title)

  await gotoChat(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', active[0]!.title])
  await expect(shown(win, '.msg')).toHaveCount(active[0]!.messageCount)
})

test('动态的「看看」建立结论冲突会话，未配置模型时给明确状态', async ({ win }) => {
  const demo = conflictFromDemo()
  await win.locator('.brief .bitem .go .btn').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', '结论冲突'])

  await expect(shown(win, '.msg.you .bubble')).toHaveText(demo.asked)
  await expect(shown(win, '.cbox .tag')).toHaveText(NO_MODEL)
  await expect(shown(win, '.msg .event')).toHaveCount(0)
  await expect(shown(win, '.msg.ai')).toHaveCount(0)
  await expect(shown(win, '.msgs')).not.toContainText(stripped(demo.reply.split('<div class="macts">')[0]!))

  // The feed item opens a chat of its own, listed first in the chat list.
  await expect(win.locator('#chatList .fade-text').first()).toHaveText('结论冲突')
})

test('@ 引用项目、论文与 wiki 页都交给真实对话链路,发出的消息里引用是和输入框里一样的引用块,点它打开它点名的实体,返回回到对话', async ({ win }) => {
  await gotoChat(win)
  const lastSaid = () => shown(win, '.msg.you .bubble').last()
  const crumb = await win.locator('#crumb .cseg').allTextContents()

  const projects = await core<{ id: string; name: string }[]>(win, 'project.list', {})
  const p = projects.find((x) => x.id === 'draft')!
  await sayWith(win, '先说 ', p.name, p.name, '这条线还剩什么')
  await expect(lastSaid()).toHaveText(`先说 @${p.name} 这条线还剩什么`)
  await expect(lastSaid().locator('.tag')).toHaveText([`@${p.name}`])
  await expect(shown(win, '.cbox .tag')).toHaveText(NO_MODEL)

  await lastSaid().locator('.tag .entity-link--project').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', p.name])
  await shown(win, '.desk-head .back').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(crumb)
  await expect(lastSaid().locator('.tag')).toHaveText([`@${p.name}`])

  const page = (await core<{ id: string; title: string; kindLabel: string; updated: string; summary: string }[]>(
    win, 'wiki.cards', {}))[0]!
  await sayWith(win, '', page.title, page.title, '这一页怎么说')
  await expect(lastSaid().locator('.tag')).toHaveText([`@${page.title}`])
  await expect(shown(win, '.cbox .tag')).toHaveText(NO_MODEL)

  const paper = (await core<{ rows: { title: string }[] }>(
    win, 'papers.list', { page: 1, size: 1 })).rows[0]!
  const lead = paper.title.split(':')[0]!
  await sayWith(win, '', lead, lead, '这篇讲了什么')
  await expect(lastSaid().locator('.tag')).toContainText([`@${lead}`])
  await expect(shown(win, '.cbox .tag')).toHaveText(NO_MODEL)
})

test('对话的第一条消息和别的屏的第一项一样，从屏头下同一处开始；发出的新消息仍然滚到底', async ({ app, win }) => {
  await win.locator('[data-desk="changelog"]').click()
  const elsewhere = await belowHeader(shown(win, '.desk-body > :first-child'))
  await gotoChat(win)
  expect(await belowHeader(shown(win, '.desk-body > .stream > .msgs > :first-child'))).toBeCloseTo(elsewhere, 0)

  // A short window and a few more messages make the conversation taller than its page body, so following the end is observable.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 560))
  const body = shown(win, '.desk-body')
  const overflows = () => body.evaluate((element) => element.scrollHeight > element.clientHeight)
  for (let sent = 1; sent <= 6 && !await overflows(); sent++) await say(win, `新消息跟到底 ${sent}`)
  expect(await overflows()).toBe(true)
  await say(win, '最后一条也在视野里')
  await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
    .toBeLessThanOrEqual(1)
})

test('问一个一般问题,输入框显示「AI 未连接」的状态而不是回答', async ({ win }) => {
  await newChat(win)
  await say(win, '宽树在批量下还成立吗?')

  await expect(shown(win, '.cbox .tag')).toHaveText(NO_MODEL)
  await expect(shown(win, '.msg .event')).toHaveCount(0)
  // The status is not an answer: no answer bubble is drawn, and no fake answer marked "(demo)" appears.
  await expect(shown(win, '.msg.ai')).toHaveCount(0)
  await expect(shown(win, '.msgs')).not.toContainText('(demo)')
})

test('短输入也会真正发送，不再被当成未实现的搜索词', async ({ win }) => {
  await newChat(win)
  await say(win, '测试')

  await expect(shown(win, '.cbox .tag')).toHaveText(NO_MODEL)
  await expect(shown(win, '.msg.ai')).toHaveCount(0)
  await expect(shown(win, '.msg.you .bubble')).toHaveText('测试')
})

test('@ 下拉按项目、论文、Wiki 三组列候选,在句子中间点一条,它成了光标处的引用块,前后的字都留着', async ({ win }) => {
  await gotoChat(win)
  const composer = shown(win, '#composer')
  await composer.fill('先看看  再说')
  await composer.press('Home')
  for (let step = 0; step < 4; step += 1) await composer.press('ArrowRight')
  await composer.pressSequentially('@')
  await expect(win.locator('#cRes .rg')).toHaveText(['项目', '论文', 'Wiki'])

  const first = win.locator('#cRes .rrow').first()
  const picked = await first.locator('.rt').textContent()
  await first.click()
  await expect(composer.locator('.composer-mention')).toHaveText([picked!])
  await expect(composer).toHaveText(`先看看 ${picked} 再说`)
  await expect(win.locator('#cRes')).toHaveCount(0)

  // The mention goes as one piece: one Backspace after it takes it whole.
  await composer.press('ArrowLeft')
  await composer.press('Backspace')
  await expect(composer.locator('.composer-mention')).toHaveCount(0)
  await expect(composer).toHaveText('先看看  再说')
})

/** Asks Core directly whether the chat is archived now. */
const isArchived = async (win: Page, id: string) =>
  (await core<Session[]>(win, 'chat.list', {})).find((s) => s.id === id)!.archived

/** Clicks a button on an archived chat's row in Settings; the row shows its actions only while hovered. */
async function archivedRowAction(win: Page, id: string, name: string): Promise<void> {
  const row = win.locator(`.setdlg .wrow[data-chat="${id}"]`)
  await row.hover()
  await row.getByRole('button', { name }).click()
}

test('归档把会话移出侧栏,设置里取消归档把它放回', async ({ app, win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  const sessions = await core<Session[]>(win, 'chat.list', {})
  const target = sessions.find((s) => !s.archived)!
  const listed = sessions.filter((s) => !s.archived).length

  await win.locator(`#chatList [data-chat="${target.id}"]`).hover()
  await win.locator(`#chatList [data-chat="${target.id}"] .dots`).click()
  await win.getByRole('menuitem', { name: '归档' }).click()
  await expect(win.locator('#sidebar .chat-row')).toHaveCount(listed - 1)
  await expect(win.locator(`#sidebar [data-chat="${target.id}"]`)).toHaveCount(0)
  expect(await isArchived(win, target.id)).toBe(true)

  await openSettings(app, win)
  // Settings is a modal over the current screen, not a screen of its own: the breadcrumb still shows
  // the screen where the chat was archived.
  await expect(win.locator('#crumb .cseg')).toHaveText(['动态'])
  // Settings opens on another category; archived chats show only under "Archived chats" on the left.
  await win.locator('[data-setcat="archived"]').click()
  await expect(win.locator(`.setdlg .wrow[data-chat="${target.id}"] .nm`)).toHaveText(target.title)

  await archivedRowAction(win, target.id, '取消归档')
  await expect(win.locator(`.setdlg .wrow[data-chat="${target.id}"]`)).toHaveCount(0)
  await expect(win.locator(`#chatList [data-chat="${target.id}"]`)).toHaveCount(1)
  await expect(win.locator('#sidebar .chat-row')).toHaveCount(listed)
  expect(await isArchived(win, target.id)).toBe(false)
})

test('侧栏删掉的会话不弹确认就进垃圾桶的对话一组,恢复后回到侧栏原来的位置,消息一条不少', async ({ win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  const order = (await core<Session[]>(win, 'chat.list', {})).filter((s) => !s.archived)
  const target = order[0]!

  await win.locator(`#chatList [data-chat="${target.id}"]`).hover()
  await win.locator(`#chatList [data-chat="${target.id}"] .dots`).click()
  await win.getByRole('menuitem', { name: '删除' }).click()
  await expect(win.locator('[role="alertdialog"]')).toHaveCount(0)
  await expect(win.locator('#notice .notice-text')).toHaveText('已移入垃圾桶')
  await expect(win.locator(`#chatList [data-chat="${target.id}"]`)).toHaveCount(0)

  await win.locator('[data-desk="trash"]').click()
  await expect(shown(win, '.section-heading')).toContainText(['对话 · 1'])
  const row = shown(win, '.trow').filter({ hasText: target.title })
  await row.hover()
  await row.getByRole('button', { name: '恢复' }).click()
  await expect(win.locator('#chatList .chat-row .fade-text')).toHaveText(order.map((s) => s.title))
  expect((await core<Session[]>(win, 'chat.list', {})).find((s) => s.id === target.id)!.messageCount).toBe(target.messageCount)
})

test('设置里「打开」进那条归档的会话,模态让开且屏上标出它是归档的', async ({ app, win }) => {
  const archived = (await core<Session[]>(win, 'chat.list', {})).find((s) => s.archived)!

  await openSettings(app, win)
  // Settings opens on another category; archived chats show only under "Archived chats" on the left.
  await win.locator('[data-setcat="archived"]').click()
  await archivedRowAction(win, archived.id, '打开')

  await expect(win.locator('.setdlg')).toHaveCount(0)
  // Archived chats are not in the sidebar, so once opened they would look like any other chat; the
  // breadcrumb marks them as archived.
  await expect(win.locator('#crumb .cseg')).toHaveText(['对话', `${archived.title} · 已归档`])
  await expect(shown(win, '.msg')).toHaveCount(archived.messageCount)
})

test('把讨论整理成可回看的想法', async ({ win }) => {
  await gotoChat(win)
  await say(win, '@draft 效率 拐点是 batch size 的函数')

  await shown(win, '#qaIdea').click()
  const draft = shown(win, '.msgs .idea-draft')
  await draft.locator('.form-input').fill('批大小拐点')
  await draft.locator('.form-textarea').fill('验证最优批大小是否随推理深度稳定迁移。')
  await draft.getByRole('button', { name: '保存' }).click()
  await expect(draft).toHaveCount(0)
  await win.locator('[data-desk="ideas"]').click()
  // Target the new idea by its own title: the ideas list holds many fixture cards, not sorted with ours first.
  const ideaCard = shown(win, '.idea-card').filter({ hasText: '批大小拐点' })
  await expect(ideaCard).toContainText('批大小拐点')
  // A new idea is not started: its card leads with the title and keeps the body for the detail panel.
  await expect(ideaCard).not.toContainText('验证最优批大小是否随推理深度稳定迁移。')
  await ideaCard.click()
  await expect(shown(win, '.idea-detail-panel'))
    .toContainText('验证最优批大小是否随推理深度稳定迁移。')
  await expect(win.locator('#qaConcl')).toHaveCount(0)
})

test('会话行的更多菜单是真菜单:触发器报 menu,重命名、归档之后是删除,下键两次高亮归档,回车归档且不进那条会话', async ({ win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  const target = (await core<Session[]>(win, 'chat.list', {})).find((s) => !s.archived && s.paperId === undefined)!
  const row = win.locator(`#chatList [data-chat="${target.id}"]`)

  await row.hover()
  await expect(row.locator('.dots')).toHaveAttribute('aria-haspopup', 'menu')
  await row.locator('.dots').click()
  const items = win.locator('[role="menu"] [role="menuitem"]')
  await expect(items).toHaveText(['重命名', '归档', '删除'])
  await win.keyboard.press('ArrowDown')
  await win.keyboard.press('ArrowDown')
  await expect(items.nth(1)).toHaveAttribute('data-highlighted', '')
  await win.keyboard.press('Enter')

  await expect(row).toHaveCount(0)
  expect(await isArchived(win, target.id)).toBe(true)
  // The Enter that selects the item does not bubble to the chat row: the app stays on the Feed screen.
  await expect(win.locator('#crumb .cseg')).toHaveText(['动态'])
})

test('正打开着的会话开它的 ... 菜单,行仍然是选中底色,不是 hover 底色', async ({ win }) => {
  await win.locator('#chatList .chat-row').first().waitFor()
  const target = (await core<Session[]>(win, 'chat.list', {})).find((s) => !s.archived)!
  const row = win.locator(`#chatList [data-chat="${target.id}"]`)
  await row.click()
  await shown(win, '#composer').waitFor()
  await expect(row).toHaveClass(/\bon\b/)

  // The selected row's background comes from .nav-row.on, not the hover rule; record the actual
  // selected background first as the reference.
  await settle(row)
  const selectedBg = await row.evaluate((el) => getComputedStyle(el).backgroundColor)

  await row.hover()
  await row.locator('.dots').click()
  // Moving the pointer onto a menu item makes the row really lose :hover; without the move, :hover
  // sticks and no bug would show.
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
  // Moving the pointer onto a menu item makes the row really lose :hover; without the move, :hover
  // sticks and no bug would show.
  await win.locator('[role="menu"] [role="menuitem"]').first().hover()
  await settle(row)
  expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(hoverBg)
})
