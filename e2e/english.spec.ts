import { resolve } from 'node:path'
import { expect, openSettings, test } from './app.js'

const SHOTS = resolve(import.meta.dirname, '../.superpowers/e2e-shots')

/** Sidebar entry selector and the English crumb its screen shows. */
const SCREENS: readonly (readonly [string, string])[] = [
  ['[data-desk="feed"]', 'Feed'], ['[data-inbox="discovery"]', 'Inbox'], ['[data-desk="later"]', 'Read Later'],
  ['[data-desk="papers"]', 'Papers'], ['[data-desk="wiki"]', 'Wiki'], ['[data-desk="changelog"]', 'Recent Changes'],
  ['[data-desk="restl"]', 'Overview'], ['[data-desk="resproj"]', 'Projects'], ['[data-desk="ideas"]', 'Ideas'],
  ['[data-desk="trash"]', 'Trash'],
]

// Screenshots of an off-screen window take about a second each, so this spec shows its window.
test.use({ showWindow: true })

test('picking English relabels the shell and each main screen, and survives a reload', async ({ app, win }) => {
  test.setTimeout(120_000)
  await openSettings(app, win)
  await win.locator('select.language-select').selectOption('en')
  await expect(win.locator('select.language-select')).toHaveValue('en')
  await expect(win.locator('html')).toHaveAttribute('lang', 'en')
  await expect(win.locator('.language-note')).toContainText('only affects the interface')
  await win.screenshot({ path: `${SHOTS}/english-settings.png` })
  await win.keyboard.press('Escape')

  for (const [entry, label] of SCREENS) {
    await win.locator(`.sidebar ${entry}`).click()
    await expect(win.locator('.titlebar')).toContainText(label)
    await win.screenshot({ path: `${SHOTS}/english-${label.toLowerCase().replace(' ', '-')}.png` })
  }

  await win.reload()
  await expect(win.locator('html')).toHaveAttribute('lang', 'en')
  await expect(win.locator('[data-desk="papers"]')).toContainText('Papers')
})
