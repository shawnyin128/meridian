import { resolve } from 'node:path'
import { expect, gotoPapers, gotoProject, parkPointer, test } from './app.js'

const SHOTS = resolve(import.meta.dirname, '../.superpowers/e2e-shots')

test('截下论文库表的一组基线图', async ({ win }) => {
  await gotoPapers(win)
  await win.locator('.ptable tbody tr').first().waitFor()
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/papers-table.png` })

  await win.locator('.ptable tbody tr').first().click()
  await win.locator('.pdetail').waitFor()
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/papers-detail.png` })

  await win.locator('.pdetail [title="收起详情"]').click()
  await win.locator('.filters .segmented-control>button', { hasText: '主题' }).click()
  await win.locator('.gxrow').first().waitFor()
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/papers-grouped.png` })
})

test('截下带选择列与自定义分组的一组基线图', async ({ win, app }) => {
  test.slow()
  await gotoPapers(win)
  await win.locator('.ptable tbody tr').first().waitFor()
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('[data-radix-popper-content-wrapper] .ctbtn[title="多选"]').click()
  await win.locator('.ptable thead th.th-new input').fill('标签')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  // The multi-selected pop-up layer will not be closed after selection. The two values ​​are then completed in the same edit: clicking the grid again will be regarded as clicked outside by the pop-up layer.
  const cell = win.locator('.ptable tbody tr').first().locator('td.pt-cust')
  await cell.click()
  for (const value of ['综述', '必读']) {
    await cell.locator('input.celledit').fill(value)
    await win.locator('[data-radix-popper-content-wrapper] .rrow.mk').click()
    // There are only input boxes in the editing grid, and the chip can be drawn only after it has been closed for editing; the evidence for writing it down this time is that this line in the pop-up layer has a check mark.
    await expect(win.locator('[data-radix-popper-content-wrapper] .rrow.opt', { hasText: value })
      .locator('.ck svg')).toHaveCount(1)
  }
  await win.keyboard.press('Escape')
  await expect(cell.locator('.tagchip')).toHaveText(['综述', '必读'])

  // The grouping column should be viewed under the longest one: two built-in groupable fields, plus this multi-select column.
  // The topic and status are there by default, only new columns are added here.
  await win.locator('.filters .grpgear').click()
  for (const label of ['标签']) {
    await win.locator('[data-radix-popper-content-wrapper] .mi', { hasText: label }).click()
  }
  await win.keyboard.press('Escape')
  await expect(win.locator('.filters .segmented-control>button')).toHaveCount(4)

  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })
    // The newly created column is at the far right of the table. In a narrow window, you need to push the horizontal scroll all the way until its grid is in the screen.
    await win.locator('.tblwrap').evaluate((el) => { el.scrollLeft = el.scrollWidth })
    await parkPointer(win)
    await win.screenshot({ path: `${SHOTS}/papers-typed-${w}.png` })
  }
})

test('截下项目详情屏的一组基线图', async ({ win }) => {
  await gotoProject(win)
  await parkPointer(win)
  await win.screenshot({ path: `${SHOTS}/project-detail.png` })
  await win.locator('.gantt').screenshot({ path: `${SHOTS}/project-gantt.png` })
  // The screen can be scrolled, but the lower half of the screen cannot be captured into the entire window. Take a separate screenshot of each of the two columns.
  await win.locator('.wkmain').screenshot({ path: `${SHOTS}/project-main.png` })
  await win.locator('.wkside').screenshot({ path: `${SHOTS}/project-side.png` })
})

test('截下项目详情屏头在四档窗口下的图', async ({ win, app }) => {
  test.slow()
  // gotoProject uses the list click to enter: it is this screen header that has newly grown return buttons.
  await gotoProject(win)
  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })
    await parkPointer(win)
    await win.locator('.screenslot:not([hidden]) .desk-head')
      .screenshot({ path: `${SHOTS}/project-head-${w}.png` })
  }
})

test('截下对话屏在四档窗口下的图', async ({ win, app }) => {
  test.slow()
  await win.locator('#chatList .chat-row', { hasText: '摊薄的前提是共享前缀吗' }).click()
  await win.locator('.screenslot:not([hidden]) .msgs .mwrap').first().waitFor()
  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })
    await parkPointer(win)
    await win.screenshot({ path: `${SHOTS}/chat-${w}.png` })
  }
})

/** Directory of screenshots of the 6th batch: the same use case is run once before and after the modification (SHOTS_PHASE=before / after), and the two rounds of pictures are viewed side by side. */
const B6 = `${SHOTS}/b6-paper-columns/${process.env['SHOTS_PHASE'] ?? 'after'}`
const B6_SIZES = [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440]] as const

test('第 6 批:论文表的年份与发表、详情面板,四档窗口 × 亮暗', async ({ win, app }) => {
  test.slow()
  await gotoPapers(win)
  await win.locator('.ptable tbody tr').first().waitFor()
  for (const theme of ['light', 'dark'] as const) {
    await win.evaluate((t) => { document.documentElement.dataset['theme'] = t }, theme)
    for (const [w, h] of B6_SIZES) {
      await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })
      await win.locator('.tblwrap').evaluate((el) => { el.scrollLeft = 0 })
      await parkPointer(win)
      await win.screenshot({ path: `${B6}/table-${theme}-${w}.png` })
      await win.locator('.ptable tbody tr').first().locator('td.pt-title').click()
      await win.locator('.pdetail').waitFor()
      await parkPointer(win)
      await win.screenshot({ path: `${B6}/detail-${theme}-${w}.png` })
      await win.locator('.pdetail [title="收起详情"]').click()
      await expect(win.locator('.pdetail')).toHaveCount(0)
    }
  }
})

test('第 6 批:Wiki 论文页的属性,四档窗口 × 亮暗', async ({ win, app }) => {
  test.slow()
  await win.locator('[data-desk="wiki"]').click()
  const shownSlot = win.locator('.screenslot:not([hidden])')
  await shownSlot.locator('.wkgrid').last().locator('.wkcard').first().click()
  await shownSlot.locator('.wkside .wkprops').waitFor()
  for (const theme of ['light', 'dark'] as const) {
    await win.evaluate((t) => { document.documentElement.dataset['theme'] = t }, theme)
    for (const [w, h] of B6_SIZES) {
      await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })
      await parkPointer(win)
      await shownSlot.locator('.wkside').screenshot({ path: `${B6}/wiki-paper-${theme}-${w}.png` })
    }
  }
})

test('第 6 批:列菜单与改类型那一行,四档窗口 × 亮暗', async ({ win, app }) => {
  // Each window opens three menus: the hover state, the expanded type line, and the text column line; windows that are not on the screen have to wait two seconds for each operability.
  test.setTimeout(300_000)
  await gotoPapers(win)
  await win.locator('.ptable tbody tr').first().waitFor()
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('[data-radix-popper-content-wrapper] .ctbtn[title="单选"]').click()
  await win.locator('.ptable thead th.th-new input').fill('读法')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  // The default type is text, there is no need to click the type setting: create another column and cut off the row of the text column (there is no fold button)
  await win.locator('.ptable thead').hover()
  await win.locator('.ptable thead [title="新增列"]').click()
  await win.locator('.ptable thead th.th-new input').fill('备注')
  await win.locator('.ptable thead th.th-new input').press('Enter')
  await expect(win.locator('.ptable thead th.th-new')).toHaveCount(0)
  for (const theme of ['light', 'dark'] as const) {
    await win.evaluate((t) => { document.documentElement.dataset['theme'] = t }, theme)
    for (const [w, h] of B6_SIZES) {
      await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setSize(s.w, s.h), { w, h })

      await win.locator('.ptable thead').hover()
      await win.locator('.ptable thead [title="列设置"]').click()
      const row = win.locator('[data-radix-popper-content-wrapper] .mi.colrow', { hasText: '读法' })
      await row.hover()
      // The mouse stays on the line: fold, change type, rename, delete four .cmx and display them simultaneously
      await win.screenshot({ path: `${B6}/column-menu-hover-${theme}-${w}.png` })
      await row.locator('[title="改类型"]').click()
      await parkPointer(win)
      await win.screenshot({ path: `${B6}/column-menu-${theme}-${w}.png` })
      await win.keyboard.press('Escape')
      await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)

      await win.locator('.ptable thead').hover()
      await win.locator('.ptable thead [title="列设置"]').click()
      const textRow = win.locator('[data-radix-popper-content-wrapper] .mi.colrow', { hasText: '备注' })
      await textRow.hover()
      // There is no fold button in the text column. The first button at the end of the line is to change the type.
      await win.screenshot({ path: `${B6}/column-menu-text-${theme}-${w}.png` })
      await win.keyboard.press('Escape')
      await expect(win.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0)
    }
  }
})
