import type { Page } from '@playwright/test'
import { expect, gotoProject, parkPointer, test, type MeridianWindow } from './app.js'

const shown = (win: Page, sel: string) => win.locator(`.screenslot:not([hidden]) ${sel}`)

test('空态只有两档:整屏的带图标居中,分节的是一行灰字', async ({ win }) => {
  test.slow()
  // The bin is empty in the fixture library, so it is the page variant.
  await win.locator('[data-desk="trash"]').click()
  const page = shown(win, '.empty-state')
  await expect(page).toHaveClass(/empty-state--page/)
  await expect(page).toHaveText('垃圾桶是空的。')
  await expect(page.locator('svg')).toHaveCount(1)

  // A leaf aggregation page has no children, so that section states it inline without an icon.
  await win.locator('[data-desk="wiki"]').click()
  await shown(win, '[data-wk="topics/quantization"]').click()
  await shown(win, '[data-wk="topics/ptq"]').click()
  await shown(win, '[data-wk="topics/ptq-weight-only"]').click()
  const section = shown(win, '.empty-state--section').first()
  await expect(section).toHaveText('还没有细分。')
  await expect(section.locator('svg')).toHaveCount(0)

  // No screen keeps a hand-rolled empty-state class any more.
  for (const gone of ['.inbox-empty', '.ideas-empty', '.ovempty', '.cempty', '.paper-chat-empty']) {
    await expect(win.locator(gone)).toHaveCount(0)
  }
})

test('平级视图切换全应用一个组件:药丸排,选中的那颗是实心', async ({ win }) => {
  test.slow()
  const accent = await win.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent-solid').trim())

  for (const [desk, label] of [['papers', '分组字段'], ['later', '分组方式']] as const) {
    await win.locator(`[data-desk="${desk}"]`).click()
    const group = shown(win, `[role="group"][aria-label="${label}"]`)
    await expect(group).toHaveCount(1)
    const on = group.locator('button.on')
    await expect(on).toHaveCount(1)
    await expect(on).toHaveAttribute('aria-pressed', 'true')
    await expect(on).toHaveCSS('background-color', await win.evaluate((raw) => {
      const probe = document.createElement('span')
      probe.style.backgroundColor = raw
      document.body.append(probe)
      const value = getComputedStyle(probe).backgroundColor
      probe.remove()
      return value
    }, accent))
  }

  // No screen keeps a second pill vocabulary.
  await expect(win.locator('.fchip, .segbtn')).toHaveCount(0)
})

test('内嵌列表和表格不画外框线:末行下方与首行上方都没有分隔线', async ({ win }) => {
  test.slow()
  const noBottom = async (sel: string, why: string) => {
    await expect(shown(win, sel).last(), why).toHaveCSS('border-bottom-width', '0px')
  }

  await win.locator('[data-desk="changelog"]').click()
  await shown(win, '.structured-row').first().waitFor()
  await noBottom('.structured-row', '最近变动末行')

  await win.locator('[data-desk="papers"]').click()
  await shown(win, '.ptable tbody tr').first().waitFor()
  await expect(shown(win, '.ptable tbody tr').last().locator('td').first(), '论文表末行')
    .toHaveCSS('border-bottom-width', '0px')
})

test('撤不回来的动作才弹确认,弹出来的都是同一个对话框', async ({ win }) => {
  test.slow()
  await win.locator('[data-inbox="all"]').click()
  await shown(win, '[title="关注设置"]').click()
  await win.locator('.setdlg .wrow').first().waitFor()
  await win.locator('.setdlg .wrow').first().locator('.btn', { hasText: '移除' }).click()

  const dialog = win.locator('.cfpop')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.dlg-t'))
    .toHaveText('移除「speculative decoding」？它带来的推送会一起清掉，且不能撤销。')
  // Cancel is always the left button and the destructive one is always on the right.
  await expect(dialog.locator('.dlg-a>*').first()).toHaveText('取消')
  await expect(dialog.locator('.dlg-a>*').last()).toHaveText('确认移除')
})

const TITLES: [string, string][] = [
  ['feed', '动态'],
  ['later', '稍后阅读 · 4'],
  ['papers', '论文 · 291'],
  ['wiki', 'Wiki · 13'],
  ['changelog', '最近变动 · 4'],
  ['restl', '总览 · 4'],
  ['resproj', '项目 · 6'],
  ['ideas', '想法 · 1'],
  ['trash', '垃圾桶 · 0'],
]

test('每一屏都有屏头,标题是「屏名 · 数字」,不带量词不带括号', async ({ win }) => {
  test.slow()
  for (const [desk, title] of TITLES) {
    await win.locator(`[data-desk="${desk}"]`).click()
    await expect(shown(win, '.desk-head .t'), desk).toHaveText(title)
  }
})

test('分节抬头全应用一个类名,右端动作只有一个槽', async ({ win }) => {
  test.slow()
  await win.locator('[data-desk="resproj"]').click()
  await shown(win, '[data-proj="draft"]').click()
  await shown(win, '.section-heading').first().waitFor()
  await expect(win.locator('.sh, .shx, .wk-sec, .wksec, .sechead')).toHaveCount(0)
  const withAction = shown(win, '.section-heading.flexh').first()
  await expect(withAction.locator('>*').last()).toHaveCSS('margin-left', /auto|\d/)
})

test('收起钮全应用一个说法,Escape 一层一层剥,「/」跳到输入框', async ({ win }) => {
  test.slow()
  await win.locator('[data-desk="papers"]').click()
  await shown(win, '.ptable tbody tr').first().click()
  await expect(shown(win, '.pdetail .panel-close')).toHaveAttribute('aria-label', '收起详情')
  await win.keyboard.press('Escape')
  await expect(shown(win, '.pdetail')).toHaveCount(0)

  await win.locator('[data-desk="ideas"]').click()
  await shown(win, '.idea-card').first().click()
  await expect(shown(win, '.idea-detail-panel .panel-close')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(shown(win, '.idea-detail-panel')).toHaveCount(0)

  await win.locator('[data-desk="papers"]').click()
  await shown(win, '.ptable tbody tr').first().waitFor()
  await win.keyboard.press('/')
  await expect(shown(win, '#libq')).toBeFocused()

  await expect(win.locator('[title="关闭"]')).toHaveCount(0)
})

test('按天分组的三屏用同一行小标题', async ({ win }) => {
  test.slow()
  const box = async (desk: string) => {
    await win.locator(`[data-desk="${desk}"]`).click()
    const heading = shown(win, '.day-heading').first()
    await heading.waitFor()
    return {
      size: await heading.evaluate((el) => getComputedStyle(el).fontSize),
      align: await heading.evaluate((el) => getComputedStyle(el).textAlign),
    }
  }
  const a = await box('changelog')
  const b = await box('later')
  const c = await box('feed')
  expect(b).toEqual(a)
  expect(c).toEqual(a)
  await expect(win.locator('.daymark, .cday')).toHaveCount(0)
})

test('四处「更多」菜单同一个触发器:tooltip 一样、悬停显形、键盘能到、开着不褪色', async ({ win }) => {
  test.slow()
  await win.locator('[data-desk="resproj"]').click()
  const card = shown(win, '.research-object-card').first()
  await card.hover()
  const dots = card.locator('.dots')
  await expect(dots).toHaveAttribute('title', '更多')
  await expect(dots).toHaveCSS('opacity', '1')
  await dots.click()
  // Move off the card: only the open state, not hover, should be keeping the trigger visible now.
  await parkPointer(win)
  await expect(dots).toHaveCSS('opacity', '1') // the trigger stays put while its own menu is open
  await win.keyboard.press('Escape')
})

test('项目目录那一行的「更多」悬停就能点到', async ({ win }) => {
  // No fixture project ships a bound directory, and e2e cannot drive the native folder picker.
  await win.evaluate(() => (window as unknown as MeridianWindow).meridian.call('project.bindWorkspace', {
    id: 'draft', binding: { kind: 'local', root: 'D:/develop/meridian' },
  }))
  await gotoProject(win)
  const field = shown(win, '.workspace-field')
  await field.hover()
  // pointer-events has no transition, so it reads the settled value even in an off-screen window.
  await expect(field.locator('.dots')).toHaveCSS('pointer-events', 'auto')
  await field.locator('.dots').click()
  await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)
  await win.keyboard.press('Escape')
})

test('分节里的添加钮都带字,tooltip 和可见文字说的是同一句', async ({ win }) => {
  test.slow()
  await win.locator('[data-desk="wiki"]').click()
  await shown(win, '[data-wk="topics/quantization"]').click()
  for (const [text, title] of [['主题', '添加主题'], ['论文', '添加论文']] as const) {
    const btn = shown(win, `.section-heading .add-action[title="${title}"]`)
    await expect(btn).toHaveCount(1)
    await expect(btn).toHaveText(text)
  }
  // No section-level add button is icon-only any more.
  await expect(shown(win, '.section-heading .add-action:not(:has(span))')).toHaveCount(0)
})

test('六处候选下拉都能用方向键选,都是同一个壳', async ({ win }) => {
  test.slow()
  // Global search: rows are divs (.rrow), not <li> — the shared shell is the .pickhits wrapper, not the row tag.
  await win.locator('#sSearch').fill('spec')
  await win.locator('.pickhits .rrow').first().waitFor()
  await win.keyboard.press('ArrowDown')
  await expect(win.locator('.pickhits .rrow.on')).toHaveCount(1)
  await expect(win.locator('.pickhits .rrow').nth(1)).toHaveClass(/on/)
  await win.keyboard.press('Escape')

  // A paper-table row's topic tag-add cell (found by feature, not column position — column order is user-configurable).
  await win.locator('[data-desk="papers"]').click()
  const row = shown(win, '.ptable tbody tr').first()
  await row.hover()
  await row.locator('.tagadd').click()
  await win.locator('.pickhits .rrow').first().waitFor()
  await win.keyboard.press('ArrowDown')
  await expect(win.locator('.pickhits .rrow.on')).toHaveCount(1)
  await win.keyboard.press('Escape')

  await expect(win.locator('.ctxmenu.drop')).toHaveCount(0)
})

test('界面上没有文字叉、没有文字加号,主按钮一律在取消右边', async ({ win }) => {
  test.slow()
  await win.locator('[data-desk="wiki"]').click()
  await shown(win, '[data-wk="topics/quantization"]').click()
  await shown(win, '[data-wk="topics/ptq"]').click()
  await shown(win, '[data-wk="topics/ptq-weight-only"]').click()
  await shown(win, 'table.cmp thead').hover()
  await shown(win, '[title="列设置"]').first().click()
  // The column editor is a Radix popover, portaled to <body> outside .screenslot — not wrapped in shown().
  const actions = win.locator('.coledit .acts')
  await expect(actions.locator('>button').first()).toHaveText('取消')
  await expect(actions.locator('>button').last()).toHaveText('保存')
  // Every remove control is the shared icon, never the × glyph.
  await expect(win.locator('.coledit .row>button svg')).toHaveCount(await win.locator('.coledit .row').count())
})
