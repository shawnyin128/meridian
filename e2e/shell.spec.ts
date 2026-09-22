import { expect, gotoPapers, gotoProject, test, type MeridianWindow } from './app.js'

/** Drag the title bar this much wider from the default 300px. */
const COLUMN_DRAG = 60
const WIDENED = '360px'

/** A conversation title wider than the sidebar: without line wrapping, the full width before truncation exceeds the 320px upper limit of the sidebar. */
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
  expect(menuShown, '菜单栏不该画出来').toBe(false)
  expect(inner.h, '页面拿到整个外框的高度:系统既不画标题栏也不画菜单栏').toBe(size.outer.height)
  expect(inner.w).toBe(size.outer.width)

  // The column height and the height of titleBarOverlay in main/index.ts are two numbers that are manually aligned. As soon as the column becomes higher,
  // The three window buttons drawn by the system are no longer on the same center line as the controls in the column, and this cannot be seen in the screenshot.
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

test('标题栏的品牌标记是应用菜单的入口,落在栏内', async ({ win }) => {
  const mark = win.locator('.titlebar .brandmark')
  expect(await mark.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

  const bar = (await win.locator('.titlebar').boundingBox())!
  const box = (await mark.boundingBox())!
  expect(box.y).toBeGreaterThan(bar.y)
  expect(box.y + box.height).toBeLessThan(bar.y + bar.height)

  // The mark is a button, and clicking it is an application menu; there is no longer a second application name in the column
  await expect(win.locator('.titlebar .app-t')).toHaveCount(0)
  await win.locator('.titlebar .appbtn').click()
  await expect(win.locator('[data-appmenu] .mi').first()).toContainText('设置…')
  await win.keyboard.press('Escape')
  await expect(win.locator('[data-appmenu]')).toHaveCount(0)
  // The same callback is used to close the menu and open the settings. The time Esc is used to close the menu, it should not also open the settings.
  await expect(win.locator('.setdlg')).toHaveCount(0)
})

test('标题栏整条可拖,交互元素让出拖拽区', async ({ win }) => {
  // Read -webkit-app-region The type using getPropertyValue:CSSStyleDeclaration does not have this camel case property
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
  await win.locator('.screenslot:not([hidden]) .pdetail [title="开始阅读"]').click()
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

  // Bypassing the interface to create a conversation: The new one on the interface is called "New Conversation", which is too short to hold up the sidebar.
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

test('侧栏在论文与项目两屏之间切换,面包屑跟着换', async ({ win }) => {
  await gotoPapers(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
  await gotoProject(win)
  await expect(win.locator('#crumb .cseg')).toHaveText(['研究', '项目', 'draft 效率'])
  await win.locator('[data-desk="papers"]').click()
  await expect(win.locator('#crumb .cseg')).toHaveText(['我的库', '论文'])
})

test('切走再切回,分页页码、排序、列宽与详情面板都保持', async ({ win }) => {
  // Sorting, dragging a column, paging and a trip to the project screen take several offscreen frames each.
  test.slow()
  await gotoPapers(win)
  await expect(win.locator('.ptable tbody tr')).toHaveCount(20)

  const titles = () => win.locator('.ptable tbody tr td.pt-title').allInnerTexts()
  const byYear = await titles()
  await win.locator('.ptable thead th[data-k="title"]').click()
  await expect(win.locator('.ptable thead th[data-k="title"] svg')).toHaveCount(1)
  // The sort arrow is the local state, and rows on this page are still being fetched. The position of the handle should be measured after the new page is actually changed.
  // Otherwise, what is measured is the coordinate before rearrangement, and when pressed, it will fall outside the handle.
  await expect.poll(titles).not.toEqual(byYear)

  // The center of the handle falls right on the border of the adjacent table headers. Press 2px inward before it falls on the handle itself.
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
  // The column width during dragging is written directly on col. Wait for it to complete this journey before raising your hand: it keeps pressing until it falls on the handle.
  // It's the original 300px, just red here, instead of leaving an inexplicable width until after you raise your hand.
  await expect.poll(width).toBe(WIDENED)
  await win.mouse.up()
  await expect.poll(width).toBe(WIDENED)
  // The table width is added by each column, and it will change only when you raise your hand and submit the new column width back to the state. That width during dragging is directly
  // What is written on col does not enter this number, so I cannot recognize "can be dragged but cannot be saved" by just looking at col.
  await expect.poll(tableMin).toBe(minBefore + COLUMN_DRAG)

  const nextPage = win.locator('.pager .pgbtn').last()
  await nextPage.click()
  await expect(win.locator('.pager .pgbtn.on')).toHaveText('2')
  await nextPage.click()
  await expect(win.locator('.pager .pgbtn.on')).toHaveText('3')

  // Click on the title grid, but not on the row center: After the table fills the window, the row center may fall on the "+" that appears when hovering the subject column.
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
  // The four gears are scattered across two screens plus a sidebar; windows that are not on the screen have to wait two seconds for each operability, and the default 30 seconds is not enough.
  test.slow()
  await gotoPapers(win)
  await win.locator('.ptable tbody tr').first().waitFor()
  const gear = (await win.locator('.filters .grpgear svg path').getAttribute('d'))!

  // A gear is a closed outline with an axle hole; the eight segments each start and do not close, which is a sun, not a gear.
  expect(gear.match(/M/g)).toHaveLength(1)
  expect(gear.endsWith('Z')).toBe(true)
  await expect(win.locator('.filters .grpgear svg circle')).toHaveCount(1)

  // Column menu entry at the end of the table header: What you click is the column setting, so it is also a gear. The tooltip has the same meaning as the one on the aggregation page.
  expect(await win.locator('.ptable thead [title="列设置"] svg path').getAttribute('d')).toBe(gear)
  // The configuration entry is no longer crowded in the sidebar; there is only one push settings gear left in the inbox toolbar.
  await expect(win.locator('.sidebar [title="管理关注"]')).toHaveCount(0)
  await win.locator('[data-inbox="all"]').click()
  expect(await win.locator('.screenslot:not([hidden]) [title="关注设置"] svg path').getAttribute('d'))
    .toBe(gear)

  // Column setting of "Papers Comparison" on the aggregation page: The gear lives at the end of the header of the comparison table, so it must be on the page where there are real members
  await win.locator('[data-desk="wiki"]').click()
  const shown = win.locator('.screenslot:not([hidden])')
  await shown.locator('[data-wk="topics/quantization"]').click()
  await shown.locator('[data-wk="topics/ptq"]').click()
  await shown.locator('[data-wk="topics/ptq-weight-only"]').click()
  await shown.locator('table.cmp').waitFor()
  expect(await shown.locator('[title="列设置"] svg path').getAttribute('d')).toBe(gear)
})
