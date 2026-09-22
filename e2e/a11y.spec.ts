import type { Locator, Page } from '@playwright/test'
import { gotoPapers, parkPointer, test } from './app.js'

/**
 * Keyboard and screen reading walkthrough: Gather facts, don’t make assertions. Run through the thesis library table and change the Tab order, Tab destination in the floating layer,
 * The focus after Escape, the element lacking an accessible name, and the role of the floating layer are hit to stdout, and are closed by the report.
 * Assertions are left to papers.spec.ts / shell.spec.ts, none of which should make e2e red.
 */

/** The upper limit of the number of tab steps is: enough to complete the shell + 10-line table + paging bar and circle back to the starting point. */
const TAB_STEPS = 150

/** The number of Tab steps in the floating layer is enough to complete the first few items in the floating layer and cross the boundary of the floating layer. */
const LAYER_TAB_STEPS = 6

/** Waiting so long before reading back the focus record allows the focusin triggered by the last key press to fall into the log. */
const SETTLE = 100

/** A fact record shared by the focus point and the interactive element. */
type Note = {
  id: number
  tag: string
  role: string
  name: string
  /** Sources of accessible names: aria-label / aria-labelledby / text / title / placeholder / none. */
  nameFrom: string
  visible: boolean
  opacity: string
  /** Which floating layer the element falls in? If it is not in the floating layer, it will be an empty string. */
  layer: string
}

/**
 * Install a focus recorder on the page: record the current focus as the first one, and append one each time focusin is used.
 * The element identity is stored in `window.__a11ySeen`, `Note.id` is its subscript in this array,
 * The same element will get the same id if it gets focus repeatedly. Repeated calls will clear the previous records.
 */
const INSTALL_FOCUS_LOG = () => {
  const w = window as unknown as {
    __a11yLog: Note[]; __a11ySeen: Element[]; __a11yOn?: () => void
  }
  w.__a11ySeen = []

  const note = (el: Element | null, register: boolean): Note => {
    if (!el) return { id: -1, tag: 'NONE', role: '', name: '', nameFrom: 'none', visible: false, opacity: '', layer: '' }
    let id = w.__a11ySeen.indexOf(el)
    if (id < 0 && register) id = w.__a11ySeen.push(el) - 1

    const label = el.getAttribute('aria-label')
    const labelledby = el.getAttribute('aria-labelledby')
    const labelled = labelledby ? document.getElementById(labelledby)?.textContent : null
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    const title = el.getAttribute('title')
    const placeholder = el.getAttribute('placeholder')
    const [name, nameFrom] = label ? [label, 'aria-label']
      : labelled ? [labelled, 'aria-labelledby']
        : text ? [text, 'text']
          : title ? [title, 'title']
            : placeholder ? [placeholder, 'placeholder']
              : ['', 'none']

    const layer = el.closest('[data-radix-popper-content-wrapper]')
    const layerRole = layer?.firstElementChild?.getAttribute('role')
    return {
      id,
      tag: el.tagName,
      role: el.getAttribute('role') ?? '',
      name: name.slice(0, 40),
      nameFrom,
      visible: el.checkVisibility(),
      opacity: getComputedStyle(el).opacity,
      layer: layer ? `popper[role=${layerRole ?? ''}]` : '',
    }
  }

  w.__a11yLog = [note(document.activeElement, true)]
  // When reinstalling, you must first remove the previous listener, otherwise the same Tab will be recorded as multiple entries.
  if (w.__a11yOn) document.removeEventListener('focusin', w.__a11yOn)
  w.__a11yOn = () => w.__a11yLog.push(note(document.activeElement, true))
  document.addEventListener('focusin', w.__a11yOn)
  // note is only used in closures. It is hung up for READ_FOCUS_LOG to reuse the same set of calibers.
  ;(w as unknown as { __a11yNote: typeof note }).__a11yNote = note
}

/** Read the current focus directly and cross-verify with the event log: when the log is missing, this article shall prevail. */
const READ_ACTIVE = () => {
  const w = window as unknown as { __a11yNote: (el: Element | null, register: boolean) => Note }
  return w.__a11yNote(document.activeElement, false)
}

/** Read back the focus record and list the interactive elements that are visible on the screen but have not received focus during the walkthrough. */
const READ_FOCUS_LOG = () => {
  const w = window as unknown as {
    __a11yLog: Note[]; __a11ySeen: Element[]; __a11yNote: (el: Element | null, register: boolean) => Note
  }
  const selector = 'button, input, select, textarea, a[href], [tabindex], [role="button"], [role="menuitem"]'
  const unreached = [...document.querySelectorAll(selector)]
    .filter((el) => el.checkVisibility() && !w.__a11ySeen.includes(el))
    .map((el) => w.__a11yNote(el, false))
  return { log: w.__a11yLog, unreached }
}

/** Fold the consecutively repeated `tag|role|name` into one line and add the number, so that the Tab sequence can be read in stdout. */
function collapse(log: Note[]): string[] {
  const out: string[] = []
  let last = ''
  let repeat = 0
  for (const n of log) {
    const key = `#${n.id < 0 ? '-' : n.id} ${n.tag}|${n.role || '-'}|${n.name || '(无名)'}|${n.nameFrom}|vis=${n.visible}|op=${n.opacity}|${n.layer || '屏上'}`
    if (key === last) { repeat++; continue }
    if (repeat > 1) out[out.length - 1] += ` ×${repeat}`
    out.push(key)
    last = key
    repeat = 1
  }
  if (repeat > 1) out[out.length - 1] += ` ×${repeat}`
  return out
}

/**
 * Wait for the table to be drawn and return the focus to the body: first click the screen title once (unfocusable),
 * Tab The starting point of the walkthrough can be determined.
 */
async function ready(win: Page): Promise<void> {
  await gotoPapers(win)
  await win.locator('tbody tr').first().waitFor()
  await win.getByText(/^论文 · \d+$/).click()
  await parkPointer(win)
}

/** Starting from the focus after the page is loaded, double-click Tab to type out the order of the drop points, the position around the starting point, and the unreached elements. */
async function tabWalk(win: Page, route: string): Promise<void> {
  await win.evaluate(INSTALL_FOCUS_LOG)
  for (let i = 0; i < TAB_STEPS; i++) await win.keyboard.press('Tab')
  const { log, unreached } = await win.evaluate(READ_FOCUS_LOG)

  const firstId = log[1]?.id
  const cycle = log.findIndex((n, i) => i > 1 && n.id === firstId)
  const round = log.slice(1, cycle < 0 ? undefined : cycle)
  console.log(`TAB-${route} 步数=${TAB_STEPS} 落点数=${log.length - 1} 一圈=${round.length} 绕回起点于第=${cycle < 0 ? '未绕回' : cycle} 未达元素数=${unreached.length}`)
  for (const line of collapse(round)) console.log(`TAB-${route}   ${line}`)

  const nameless = round.filter((n) => n.nameFrom === 'none')
  const byTitle = round.filter((n) => n.nameFrom === 'title')
  console.log(`NAME-${route} 无可访问名=${nameless.length} 仅靠 title 取名=${byTitle.length}`)
  for (const line of collapse(nameless)) console.log(`NAME-${route}   缺名 ${line}`)
  for (const line of collapse(byTitle)) console.log(`NAME-${route}   仅 title ${line}`)
  for (const line of collapse(unreached)) console.log(`UNREACHED-${route}   ${line}`)
}

/**
 * Open a floating layer, and combine the floating layer with the role of each item (with aria-checked), the aria of the trigger, the direction of the up and down keys and Tab,
 * The focus after Escape comes out. `cell` is the grid where the trigger is located, press it up before clicking; `trigger` clicks to open the floating layer.
 */
async function layerWalk(win: Page, route: string, cell: Locator, trigger: Locator): Promise<void> {
  // The + in the label grid is replaced by an input box when the floating layer is open, and the two items on the trigger can only be read when it is closed.
  const triggerAria = await trigger.evaluate((el) => ({
    haspopup: el.getAttribute('aria-haspopup') ?? '',
    expanded: el.getAttribute('aria-expanded') ?? '',
  }))
  // When the theme grid cannot fit in it, fold the + at the end and press it on this grid to unfold it.
  await cell.hover()
  await trigger.click()
  const layer = win.locator('[data-radix-popper-content-wrapper] > *').first()
  await layer.waitFor()

  const shape = await layer.evaluate((el) => ({
    role: el.getAttribute('role') ?? '',
    itemRoles: [...el.querySelectorAll('.mi, .rrow')].map((c) => {
      const checked = c.getAttribute('aria-checked')
      return `${c.getAttribute('role') ?? c.tagName}${checked === null ? '' : `(aria-checked=${checked})`}`
    }),
  }))
  console.log(`LAYER-${route} role=${shape.role || '(无)'} 项=${JSON.stringify(shape.itemRoles)} 触发器=${JSON.stringify(triggerAria)}`)

  await win.evaluate(INSTALL_FOCUS_LOG)
  await win.keyboard.press('ArrowDown')
  await win.keyboard.press('ArrowDown')
  await win.waitForTimeout(SETTLE)
  const afterArrow = (await win.evaluate(READ_FOCUS_LOG)).log
  for (const line of collapse(afterArrow)) console.log(`ARROW-${route}   ${line}`)
  console.log(`ARROW-${route} 两次下键后的焦点 ${collapse([await win.evaluate(READ_ACTIVE)])[0]}`)

  await win.evaluate(INSTALL_FOCUS_LOG)
  for (let i = 0; i < LAYER_TAB_STEPS; i++) await win.keyboard.press('Tab')
  await win.waitForTimeout(SETTLE)
  const inLayer = (await win.evaluate(READ_FOCUS_LOG)).log
  const escaped = inLayer.slice(1).filter((n) => n.layer === '')
  console.log(`TRAP-${route} Tab=${LAYER_TAB_STEPS} 落点数=${inLayer.length - 1} 跑到浮层外=${escaped.length} 浮层还开着=${await layer.count() > 0}`)
  for (const line of collapse(inLayer)) console.log(`TRAP-${route}   ${line}`)
  console.log(`TRAP-${route} ${LAYER_TAB_STEPS} 次 Tab 后的焦点 ${collapse([await win.evaluate(READ_ACTIVE)])[0]}`)

  await win.keyboard.press('Escape')
  const back = await trigger.evaluate((el) => el === document.activeElement).catch(() => false)
  console.log(`ESC-${route} 浮层还开着=${await win.locator('[data-radix-popper-content-wrapper] > *').count() > 0} 焦点回到触发器=${back}`)
}

test('路线 A 的论文库表:键盘与读屏走查', async ({ win }) => {
  await ready(win)
  await tabWalk(win, 'A')
  const row = win.locator('.ptable tbody tr').first()
  // Topic in box 7 (title/short title/rating/author/year/publication/topic/status)
  const topics = row.locator('td:nth-child(7)')
  await layerWalk(win, 'A', topics, topics.locator('.tagadd'))
  // When the theme grid cannot fit, hover will expand on the spot, cross the table width, and move to the 6th grid next to the status grid;
  // If you do not move the pointer, the first hover target measured by the status grid will be blocked by the expanded content of the theme grid.
  await parkPointer(win)
  const status = row.locator('td', { has: win.locator('.stchip') })
  await layerWalk(win, 'A-状态', status, status.locator('.stchip'))
})
