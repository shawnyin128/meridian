import type { Locator, Page } from '@playwright/test'
import { gotoPapers, parkPointer, test } from './app.js'

/**
 * Keyboard and screen reader walkthrough that gathers facts without asserting. It walks the paper
 * table and prints to stdout the Tab order, where Tab lands inside popovers, the focus after Escape,
 * elements without an accessible name and the popovers' roles, for the report to collect.
 * Assertions belong in papers.spec.ts and shell.spec.ts; nothing here should turn e2e red.
 */

/** Most Tab presses in a walk: enough to pass the shell, a 10-row table and the pager and wrap around. */
const TAB_STEPS = 150

/** Tab presses inside a popover: enough to pass its first few items and cross its boundary. */
const LAYER_TAB_STEPS = 6

/** How long to wait before reading back the focus log, so the focusin from the last key press is in it. */
const SETTLE = 100

/** The fact record used for both focus stops and interactive elements. */
type Note = {
  id: number
  tag: string
  role: string
  name: string
  /** Sources of accessible names: aria-label / aria-labelledby / text / title / placeholder / none. */
  nameFrom: string
  visible: boolean
  opacity: string
  /** The popover the element is in, or an empty string when it is in none. */
  layer: string
}

/**
 * Installs a focus recorder on the page: logs the current focus first, then appends an entry on every
 * focusin. Element identities live in `window.__a11ySeen` and `Note.id` is the index there, so an
 * element focused again keeps its id. Calling it again clears the earlier records.
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
  // On reinstall, remove the previous listener first, or one Tab would be logged several times.
  if (w.__a11yOn) document.removeEventListener('focusin', w.__a11yOn)
  w.__a11yOn = () => w.__a11yLog.push(note(document.activeElement, true))
  document.addEventListener('focusin', w.__a11yOn)
  // note exists only in this closure; expose it so READ_FOCUS_LOG describes elements the same way.
  ;(w as unknown as { __a11yNote: typeof note }).__a11yNote = note
}

/** Reads the current focus directly to cross-check the event log; when the log misses a step, this wins. */
const READ_ACTIVE = () => {
  const w = window as unknown as { __a11yNote: (el: Element | null, register: boolean) => Note }
  return w.__a11yNote(document.activeElement, false)
}

/** Reads back the focus log and lists visible interactive elements the walk never focused. */
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

/** Folds runs of the same `tag|role|name` into one line with a count, so stdout shows a readable Tab order. */
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
 * Waits for the table to render and returns focus to the body by clicking the screen title once (not
 * focusable), so the Tab walk starts from a known point.
 */
async function ready(win: Page): Promise<void> {
  await gotoPapers(win)
  await win.locator('tbody tr').first().waitFor()
  await win.getByText(/^论文 · \d+$/).click()
  await parkPointer(win)
}

/**
 * Presses Tab repeatedly from the focus the page loaded with, and prints the order of focus stops,
 * where the walk wraps back to its start, and the unreached elements.
 */
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
 * Opens a popover and prints the role of the popover and of each item (with aria-checked), the
 * trigger's aria attributes, where the arrow keys and Tab move focus, and the focus after Escape.
 * `cell` is the trigger's cell, hovered before the click; clicking `trigger` opens the popover.
 */
async function layerWalk(win: Page, route: string, cell: Locator, trigger: Locator): Promise<void> {
  // While the popover is open, the + in the tag cell is replaced by an input, so the trigger's two
  // attributes can only be read before it opens.
  const triggerAria = await trigger.evaluate((el) => ({
    haspopup: el.getAttribute('aria-haspopup') ?? '',
    expanded: el.getAttribute('aria-expanded') ?? '',
  }))
  // A Topics cell that overflows folds away its trailing +; hovering the cell unfolds it.
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
  // Topics is the 7th cell (Title, Short title, Rating, Authors, Year, Venue, Topics, Status).
  const topics = row.locator('td:nth-child(7)')
  await layerWalk(win, 'A', topics, topics.locator('.tagadd'))
  // An overflowing Topics cell expands in place on hover, past its width and over the Status cell beside
  // it; unless the pointer moves away, the Status cell's first hover target is covered by that expansion.
  await parkPointer(win)
  const status = row.locator('td', { has: win.locator('.stchip') })
  await layerWalk(win, 'A-状态', status, status.locator('.stchip'))
})
