import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DESKTOP } from '../test-library/app.mjs'
import { COLOUR_TOKENS, componentPatterns, probeEntries, SHADOW_TOKENS, VARIANT_CLASSES } from './patterns.mjs'
import { measureInPage } from './probe.mjs'
import { LIBRARY, REVIEW, setTheme, settle, SIZES, THEMES, walk } from './run.mjs'
import { SCREEN_ORDER, STATES } from './screens.mjs'

const USAGE = `Lays every instance of a component side by side, one contact sheet per theme.

  node scripts/component-review/sheets.mjs <component>... [--app <app>] [--library <dir>] [--out <dir>]

<component> is Row/Item, Card, SectionHeading, Button, EmptyState or any pattern name of
scripts/component-review/patterns.mjs. Writes <out>/<component>-light.png and -dark.png at
1440x900, with / in the name written as -. <out> defaults to outputs/review/v0.0.20.0/components/sheets
in the main checkout, <app> to this checkout's built apps/desktop and <library> to the v0.0.19.0
test library, which the run copies first.`

/** Context around each instance, in CSS pixels. */
const MARGIN = 20
/** The tallest page of a sheet in screen pixels, below Chromium's 16384-pixel screenshot limit; a longer sheet continues in <name>-<theme>-2.png and on. */
const PAGE_HEIGHT = 15000

const { positionals, values } = parseArgs({ allowPositionals: true, options: { app: { type: 'string' }, library: { type: 'string' }, out: { type: 'string' } } })
const app = values.app === undefined ? DESKTOP : resolve(values.app)
const library = values.library === undefined ? LIBRARY : resolve(values.library)
const out = values.out === undefined ? join(REVIEW, 'components', 'sheets') : resolve(values.out)
if (positionals.length === 0 || !existsSync(app) || !existsSync(library)) {
  console.error(USAGE)
  process.exit(2)
}
const components = positionals.map((name) => ({ name, file: name.replaceAll('/', '-'), patterns: componentPatterns(name) }))
const entries = probeEntries([...new Set(components.flatMap((component) => component.patterns))])
const viewport = SIZES[0]

/**
 * Every look of every component, per screen: one item per screen, selector entry and set of
 * metric values, with the instances that share it and a crop of the first one in each theme.
 */
const looks = new Map()
/** The element ids already counted per screen, so an element shown in several states counts once. */
const counted = new Map()

/**
 * Scrolls element `id` into view inside its scrolling container and returns its crop box in the
 * viewport and its own box inside the crop, or null when no part of it can be shown.
 */
async function frame(win, id) {
  const box = await win.evaluate((target) => {
    const el = document.querySelector(`[data-review-id="${target}"]`)
    if (!el) return null
    // Only scrolling containers move, inner ones first: scrollIntoView would also scroll the App's clipped root.
    let r = el.getBoundingClientRect()
    for (let scroller = el.parentElement; scroller && (r.top < 0 || r.bottom > window.innerHeight); scroller = scroller.parentElement) {
      if (!['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY) || scroller.scrollHeight <= scroller.clientHeight) continue
      scroller.scrollTop += r.top - scroller.getBoundingClientRect().top - 40
      r = el.getBoundingClientRect()
    }
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  }, id)
  if (box === null || box.width === 0 || box.height === 0) return null
  const x = Math.max(0, Math.floor(box.x - MARGIN))
  const y = Math.max(0, Math.floor(box.y - MARGIN))
  const clip = {
    x, y,
    width: Math.min(viewport.width, Math.ceil(box.x + box.width + MARGIN)) - x,
    height: Math.min(viewport.height, Math.ceil(box.y + box.height + MARGIN)) - y,
  }
  if (clip.width <= 0 || clip.height <= 0) return null
  return { clip, mark: { x: box.x - x, y: box.y - y, width: box.width, height: box.height } }
}

/** Records the looks the state shows and crops each new one in both themes. */
async function visit(state, { win }) {
  const found = await win.evaluate(measureInPage, {
    entries, scope: state.scope ?? 'screen', cap: 400, colourTokens: COLOUR_TOKENS, shadowTokens: SHADOW_TOKENS, variantClasses: VARIANT_CLASSES,
  })
  if (!counted.has(state.screen)) counted.set(state.screen, new Set())
  const ids = counted.get(state.screen)
  const fresh = []
  for (const record of found.records.filter((item) => !ids.has(`${item.entry} ${item.id}`))) {
    ids.add(`${record.entry} ${record.id}`)
    const key = `${state.screen}\n${record.entry}\n${JSON.stringify(record.metrics)}`
    if (looks.has(key)) {
      looks.get(key).count += 1
      continue
    }
    const look = { key, screen: state.screen, state: state.state, pattern: record.pattern, entry: record.entry, metrics: record.metrics, id: record.id, count: 1, crops: {} }
    looks.set(key, look)
    fresh.push(look)
  }
  for (const theme of THEMES) {
    await setTheme(win, theme)
    for (const look of fresh) {
      const framed = await frame(win, look.id)
      if (framed === null) continue
      await settle(win)
      look.crops[theme] = { ...framed, png: (await win.screenshot({ clip: framed.clip })).toString('base64') }
    }
  }
  await setTheme(win, 'light')
  return fresh.length
}

/**
 * Draws `sheet` in the App's window in place of the App and returns, for every page, the items of
 * each group on it: a page ends before the figure row that would make it taller than `pageHeight` screen pixels.
 */
function drawSheet(sheet) {
  document.getElementById('review-sheet')?.remove()
  // The App and any dialog still open stay in the page, hidden behind nothing but display.
  for (const el of document.body.children) el.style.display = 'none'
  for (const el of [document.documentElement, document.body]) Object.assign(el.style, { overflow: 'visible', height: 'auto' })
  const root = document.createElement('div')
  root.id = 'review-sheet'
  Object.assign(root.style, { padding: '24px', background: 'var(--window)', color: 'var(--ink)', width: '1440px', boxSizing: 'border-box', font: '12px/1.4 system-ui' })
  const title = document.createElement('div')
  title.textContent = sheet.title
  Object.assign(title.style, { font: '600 15px/1.4 system-ui', marginBottom: '16px' })
  root.append(title)
  const figures = []
  for (const [groupIndex, group] of sheet.groups.entries()) {
    const heading = document.createElement('div')
    heading.textContent = group.screen
    Object.assign(heading.style, { font: '600 13px/1.4 system-ui', margin: '20px 0 8px', paddingTop: '8px', borderTop: '1px solid var(--sep)' })
    const grid = document.createElement('div')
    Object.assign(grid.style, { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' })
    for (const [itemIndex, item] of group.items.entries()) {
      const figure = document.createElement('figure')
      Object.assign(figure.style, { margin: '0', maxWidth: '1392px', display: 'flex', flexDirection: 'column', gap: '4px' })
      const shot = document.createElement('div')
      // An instance wider than the window, such as a paper table row, is cut at the crop's edge.
      Object.assign(shot.style, { position: 'relative', width: `${item.width}px`, height: `${item.height}px`, outline: '1px solid var(--sep)', overflow: 'hidden' })
      const img = document.createElement('img')
      img.src = `data:image/png;base64,${item.png}`
      Object.assign(img.style, { width: `${item.width}px`, height: `${item.height}px`, display: 'block' })
      // The dashed frame marks the instance among the context around it.
      const mark = document.createElement('div')
      Object.assign(mark.style, {
        position: 'absolute', left: `${item.mark.x - 3}px`, top: `${item.mark.y - 3}px`, width: `${item.mark.width + 6}px`,
        height: `${item.mark.height + 6}px`, outline: '1px dashed #e0198a', pointerEvents: 'none',
      })
      shot.append(img, mark)
      const caption = document.createElement('figcaption')
      caption.textContent = item.caption
      Object.assign(caption.style, { color: 'var(--sec)', maxWidth: `${Math.max(item.width, 320)}px`, overflowWrap: 'anywhere' })
      figure.append(shot, caption)
      grid.append(figure)
      figures.push({ figure, groupIndex, itemIndex })
    }
    root.append(heading, grid)
  }
  document.body.append(root)
  const pages = []
  let pageTop = 0
  let rowTop = -1
  for (const { figure, groupIndex, itemIndex } of figures) {
    const box = figure.getBoundingClientRect()
    const newRow = box.top > rowTop + 1
    if (newRow) rowTop = box.top
    if (pages.length === 0 || (newRow && (box.bottom - pageTop) * window.devicePixelRatio > sheet.pageHeight)) {
      pages.push(sheet.groups.map(() => []))
      pageTop = box.top
    }
    pages.at(-1)[groupIndex].push(itemIndex)
  }
  return pages
}

/** Writes every component's sheets for both themes, a page per PAGE_HEIGHT of figures. */
async function finish({ win }) {
  mkdirSync(out, { recursive: true })
  for (const component of components) {
    const shown = [...looks.values()].filter((look) => component.patterns.includes(look.pattern))
    const screens = SCREEN_ORDER.filter((screen) => shown.some((look) => look.screen === screen))
    const instances = shown.reduce((sum, look) => sum + look.count, 0)
    for (const theme of THEMES) {
      await setTheme(win, theme)
      const groups = screens.map((screen) => ({
        screen,
        items: shown.filter((look) => look.screen === screen && look.crops[theme]).map((look) => ({
          png: look.crops[theme].png, mark: look.crops[theme].mark,
          width: look.crops[theme].clip.width, height: look.crops[theme].clip.height,
          caption: `${look.state} · ${look.entry} · ×${look.count} · ${Object.entries(look.metrics).map(([key, value]) => `${key} ${value ?? '–'}`).join(' · ')}`,
        })),
      }))
      const title = `${component.name} · ${theme} · ${instances} instances in ${shown.length} looks on ${screens.length} screens`
      const pages = await win.evaluate(drawSheet, { title, groups, pageHeight: PAGE_HEIGHT })
      for (const [index, page] of pages.entries()) {
        const sheet = {
          title: pages.length > 1 ? `${title} · page ${index + 1} of ${pages.length}` : title,
          groups: groups.map((group, at) => ({ ...group, items: page[at].map((item) => group.items[item]) })).filter((group) => group.items.length > 0),
          pageHeight: Infinity,
        }
        await win.evaluate(drawSheet, sheet)
        await win.evaluate(() => Promise.all([...document.querySelectorAll('#review-sheet img')].map((img) => img.decode())))
        await settle(win)
        const file = join(out, `${component.file}-${theme}${index === 0 ? '' : `-${index + 1}`}.png`)
        writeFileSync(file, await win.screenshot({ fullPage: true }))
        console.log(`Wrote ${file}`)
      }
    }
  }
}

const { failures } = await walk({ app, library, name: 'sheets', states: STATES, visit, finish })
for (const failure of failures) console.log(`not reached: ${failure.screen} · ${failure.state}: ${failure.reason}`)
