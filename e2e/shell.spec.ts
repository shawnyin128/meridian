import { expect, gotoPapers, gotoProject, popupMenus, test, type MeridianWindow } from './app.js'

/** How far to drag the Title column wider than its default 300px. */
const COLUMN_DRAG = 60
const WIDENED = '360px'

/** A chat title wider than the sidebar: unwrapped and untruncated it exceeds the sidebar's 320px cap. */
const LONG_CHAT_TITLE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

test('窗口没有系统标题栏与菜单栏,整个外框都归页面', async ({ app, win }) => {
  await win.locator('.titlebar').waitFor()
  const menuShown = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.isMenuBarVisible())
  const size = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    return { outer: w.getBounds(), content: w.getContentBounds() }
  })
  const inner = await win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))

  console.log(`外框 ${size.outer.width}×${size.outer.height},内容 ${size.content.width}×${size.content.height},页面 ${inner.w}×${inner.h}`)
  // macOS draws the menu bar at the top of the screen, outside the window, and Electron always reports it
  // visible there.
  if (process.platform !== 'darwin') expect(menuShown, '菜单栏不该画出来').toBe(false)
  expect(inner.h, '页面拿到整个外框的高度:系统既不画标题栏也不画菜单栏').toBe(size.outer.height)
  expect(inner.w).toBe(size.outer.width)

  // The bar's height and titleBarOverlay's height in main/index.ts are two numbers kept equal by hand. If
  // the bar grows, the three window buttons the OS draws leave the center line of the bar's controls,
  // which a screenshot cannot show.
  const bar = (await win.locator('.titlebar').boundingBox())!
  expect(bar.height, '标题栏与 titleBarOverlay 的 height 都是 50').toBe(50)
})

test('平台名写进了 data-os,与 preload 报的一致', async ({ win }) => {
  await win.locator('.titlebar').waitFor()
  const seen = await win.evaluate(() => ({
    attr: document.documentElement.dataset.os,
    bridge: (window as unknown as MeridianWindow).meridian.platform,
  }))
  expect(seen.attr).toBe(seen.bridge)
  expect(seen.attr, 'data-os 空着的话按平台分的留白就全落空了').toBeTruthy()
})

test('右键文本框弹出系统的编辑菜单,右键选中的 Markdown 能复制(macOS 上先能查询);论文行只出 Meridian 自己的右键菜单', async ({ app, win }) => {
  const page = win.locator('.screenslot:not([hidden])')

  await gotoPapers(win)
  await page.locator('.ptable tbody tr').first().click({ button: 'right' })
  await expect(win.locator('.ctxmenu')).toBeVisible()
  await win.keyboard.press('Escape')
  await page.locator('#libq').click({ button: 'right' })
  // The row's own menu reaches Main as nothing: the only native menu is the field's.
  await expect.poll(() => popupMenus(app)).toEqual([['剪切', '复制', '粘贴', '全选']])

  await win.locator('[data-desk="wiki"]').click()
  await page.locator('[data-wk="topics/quantization"]').click()
  const heading = page.locator('.wkmain .md h2').first()
  await heading.evaluate((element) => document.getSelection()!.selectAllChildren(element))
  await heading.click({ button: 'right' })
  const text = (await heading.textContent())!
  await expect.poll(async () => (await popupMenus(app)).at(-1)).toEqual(
    process.platform === 'darwin' ? [`查询“${text}”`, '—', '复制'] : ['复制'],
  )
})

test('标题栏的品牌标记是应用菜单的入口,落在栏内', async ({ win }) => {
  const mark = win.locator('.titlebar .brandmark')
  expect(await mark.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

  const bar = (await win.locator('.titlebar').boundingBox())!
  const box = (await mark.boundingBox())!
  expect(box.y).toBeGreaterThan(bar.y)
  expect(box.y + box.height).toBeLessThan(bar.y + bar.height)

  // The mark is a button that opens the app menu; the bar no longer shows the app name a second time.
  await expect(win.locator('.titlebar .app-t')).toHaveCount(0)
  await win.locator('.titlebar .appbtn').click()
  await expect(win.locator('[data-appmenu] .mi').first()).toContainText('设置…')
  await win.keyboard.press('Escape')
  await expect(win.locator('[data-appmenu]')).toHaveCount(0)
  // Closing the menu and opening Settings share one callback; closing the menu with Esc must not also
  // open Settings.
  await expect(win.locator('.setdlg')).toHaveCount(0)
})

test('标题栏整条可拖,交互元素让出拖拽区', async ({ win }) => {
  // Read via getPropertyValue: the CSSStyleDeclaration type has no camelCase -webkit-app-region property.
  const region = (sel: string) => win.locator(sel).first()
    .evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))

  expect(await region('.titlebar'), '整条栏要能拖动窗口').toBe('drag')
  for (const sel of ['.titlebar .appbtn', '.titlebar .tbtn']) {
    expect(await region(sel), `${sel} 落在拖拽区里就点不动了`).toBe('no-drag')
  }

  // The breadcrumb stretches across the bar, so the point in the middle of the bar lands on it and must still drag the window.
  const middle = await win.evaluate(() => {
    const bar = document.querySelector('.titlebar')!.getBoundingClientRect()
    const hit = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2)!
    return {
      inBar: hit.closest('.titlebar') !== null,
      region: getComputedStyle(hit).getPropertyValue('-webkit-app-region'),
    }
  })
  expect(middle, '标题栏正中间要能拖动窗口').toEqual({ inBar: true, region: 'drag' })

  // Only a clickable breadcrumb segment leaves the drag region; the reader's breadcrumb has one.
  await gotoPapers(win)
  await win.locator('#libq').fill('STAR: SPECULATIVE DECODING')
  await expect(win.locator('.ptable tbody tr')).toHaveCount(1)
  await win.locator('.ptable tbody tr').click()
  await win.locator('.screenslot:not([hidden]) .paper-detail-slot [aria-label="开始阅读"]').click()
  expect(await region('.titlebar .cseg.link'), '能点的面包屑段落在拖拽区里就点不动了').toBe('no-drag')
  expect(await region('.titlebar .cseg:not(.link)'), '不能点的面包屑段要能拖动窗口').toBe('drag')
})

test('系统画的窗口外框不带用户的强调色', async ({ app, win }) => {
  // Only Windows paints the window border in the user's accent color.
  test.skip(process.platform !== 'win32', 'the accent-colored window border exists only on Windows')
  await win.locator('.titlebar').waitFor()
  const accent = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getAccentColor())
  expect(accent, '强调色边框要关掉').toBe(false)
})

test('标题栏给窗口按钮让出了留白', async ({ win }) => {
  const pad = await win.locator('.titlebar').evaluate((el) => {
    const s = getComputedStyle(el)
    return { left: s.paddingLeft, right: s.paddingRight, os: document.documentElement.dataset.os }
  })
  console.log(`data-os=${pad.os},左内边距 ${pad.left},右内边距 ${pad.right}`)
  if (pad.os === 'darwin') expect(pad.left).toBe('78px')
  else expect(pad.right).toBe('154px')
})

test('长会话标题不把侧栏顶宽', async ({ win }) => {
  const width = () => win.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width)
  await win.locator('#chatList .chat-row').first().waitFor()
  const before = await width()

  // Create the chat bypassing the UI: the UI names a new chat "New chat", too short to widen the sidebar.
  await win.evaluate((title) => (window as unknown as MeridianWindow).meridian
    .call('chat.create', { title, named: true }), LONG_CHAT_TITLE)
  await win.reload()
  await expect(win.locator('#chatList .ct-t').filter({ hasText: LONG_CHAT_TITLE })).toHaveCount(1)

  expect(await width()).toBe(before)
})

test('侧栏分组抬头是 11px 半粗体,比正文分节抬头小一号', async ({ win }) => {
  const head = win.locator('.sb-h').first()
  await expect(head).toHaveCSS('font-size', '11px')
  await expect(head).toHaveCSS('font-weight', '600')
})

test('侧栏的分组抬头一样高:收件、对话、我的库、研究都是 24px 的一行,折叠钮在每一行的同一处', async ({ win }) => {
  await expect(win.locator('.sidebar .sb-h')).toHaveCount(4)
  const heads = await win.locator('.sidebar .sb-h').evaluateAll((all) => all.map((head) => {
    const box = head.getBoundingClientRect()
    const toggle = head.querySelector('.fold-toggle')!.getBoundingClientRect()
    return [(head as HTMLElement).dataset['sect'], box.height, toggle.x - box.x, toggle.y + toggle.height / 2 - box.y]
  }))
  expect(heads.map(([sect, height]) => [sect, height])).toEqual([['inbox', 24], ['chats', 24], ['lib', 24], ['research', 24]])
  expect(new Set(heads.map(([, , x, middle]) => `${x} ${middle}`)).size).toBe(1)
})

test('侧栏在论文与项目两屏之间切换,面包屑跟着换', async ({ win }) => {
  await gotoPapers(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
  await gotoProject(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])
  await win.locator('[data-desk="papers"]').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
})

test('切走再切回,分页页码、排序、列宽与详情面板都保持', async ({ win }) => {
  // Sorting, dragging a column, paging and a trip to the project screen each wait for frames; see
  // `showWindow` in app.ts.
  test.slow()
  await gotoPapers(win)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(20)

  const titles = () => win.locator('.ptable tbody tr td.pt-title').allInnerTexts()
  const byYear = await titles()
  await win.locator('.ptable thead th[data-k="title"]').click()
  await expect(win.locator('.ptable thead th[data-k="title"] svg')).toHaveCount(1)
  // The sort arrow is local state while this page's rows are still being fetched, so measure the grip only
  // after the rows change; otherwise its position is from before the re-sort and the press misses it.
  await expect.poll(titles).not.toEqual(byYear)

  // The grip's center lies on the border with the next header cell; 2px inward lands on the grip itself.
  const grip = (await win.locator('.ptable thead th[data-k="title"] .thgrip').boundingBox())!
  const y = grip.y + grip.height / 2
  const titleColumn = win.locator('col[data-cw="t"]')
  const width = () => titleColumn.evaluate((c) => (c as HTMLElement).style.width)
  const tableMin = () =>
    win.locator('.ptable').evaluate((t) => parseFloat((t as HTMLElement).style.minWidth))
  const minBefore = await tableMin()

  await win.mouse.move(grip.x + 2, y)
  await win.mouse.down()
  await win.mouse.move(grip.x + 2 + COLUMN_DRAG, y, { steps: 8 })
  // During a drag the column width is written straight onto col. Wait for the full distance before
  // releasing: if the press missed the grip, the width stays at 300px and fails here, instead of an
  // unexplained width showing up after the release.
  await expect.poll(width).toBe(WIDENED)
  await win.mouse.up()
  await expect.poll(width).toBe(WIDENED)
  // The table width is the sum of the columns and changes only when the release commits the new column
  // width to state. The width written onto col during the drag is not included, so checking col alone
  // would miss a column that drags but is never saved.
  await expect.poll(tableMin).toBe(minBefore + COLUMN_DRAG)

  const nextPage = win.locator('.pager [aria-label="下一页"]')
  await nextPage.click()
  await expect(win.locator('.pager .pgbtn.on')).toHaveText('2')
  await nextPage.click()
  await expect(win.locator('.pager .pgbtn.on')).toHaveText('3')

  // Click the title cell, not the row center: once the table fills the window, the row center may land on
  // the "+" the Topics column shows on hover.
  await win.locator('.ptable tbody tr').first().locator('td.pt-title').click()
  await expect(win.locator('.pdetail')).toBeVisible()

  await gotoProject(win)
  await win.locator('[data-desk="papers"]').click()

  await expect(win.locator('.pager .pgbtn.on')).toHaveText('3')
  await expect(win.locator('.ptable thead th[data-k="title"] svg')).toHaveCount(1)
  await expect(win.locator('.ptable thead th[data-k="year"] > svg')).toHaveCount(0)
  expect(await titleColumn.evaluate((c) => (c as HTMLElement).style.width)).toBe(WIDENED)
  await expect(win.locator('.pdetail')).toBeVisible()
})

test('全应用的齿轮是同一颗:一条闭合轮廓加一个轴孔,四处逐字相同', async ({ win }) => {
  // The four gears are spread over two screens and the sidebar, many actionability checks for a hidden
  // window; see `showWindow` in app.ts.
  test.slow()
  await gotoPapers(win)
  await win.locator('.ptable tbody tr').first().waitFor()
  const gear = (await win.locator('.filters .grpgear svg path').getAttribute('d'))!

  // A gear is one closed outline plus an axle hole; eight separate open strokes would be a sun, not a gear.
  expect(gear.match(/M/g)).toHaveLength(1)
  expect(gear.endsWith('Z')).toBe(true)
  await expect(win.locator('.filters .grpgear svg circle')).toHaveCount(1)

  // The column menu at the end of the table header opens Column settings, so it is a gear too, with the
  // same tooltip as on aggregation pages.
  expect(await win.locator('.ptable thead [aria-label="列设置"] svg path').getAttribute('d')).toBe(gear)
  // Settings entries no longer crowd the sidebar; the only Watch settings gear is in the Inbox toolbar.
  await expect(win.locator('.sidebar [aria-label="管理关注"]')).toHaveCount(0)
  await win.locator('[data-inbox="all"] > .nav-row-label').click()
  expect(await win.locator('.screenslot:not([hidden]) [aria-label="关注设置"] svg path').getAttribute('d'))
    .toBe(gear)

  // Column settings of "Paper comparison" on an aggregation page: the gear sits at the end of the
  // comparison table's header, so it needs a page that really has member papers.
  await win.locator('[data-desk="wiki"]').click()
  const shown = win.locator('.screenslot:not([hidden])')
  await shown.locator('[data-wk="topics/quantization"]').click()
  await shown.locator('[data-wk="topics/ptq"]').click()
  await shown.locator('[data-wk="topics/ptq-weight-only"]').click()
  await shown.locator('table.cmp').waitFor()
  expect(await shown.locator('[aria-label="列设置"] svg path').getAttribute('d')).toBe(gear)
})
