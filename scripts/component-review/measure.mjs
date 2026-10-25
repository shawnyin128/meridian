import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DESKTOP } from '../test-library/app.mjs'
import { driftMarkdown, driftSummary } from './drift.mjs'
import { COLOUR_TOKENS, PATTERNS, probeEntries, SHADOW_TOKENS, VARIANT_CLASSES } from './patterns.mjs'
import { clearFocusPathInPage, markFocusPathInPage, measureInPage } from './probe.mjs'
import { comboName, LIBRARY, REVIEW, setSize, setTheme, settle, SIZES, THEMES, walk } from './run.mjs'
import { SCREEN_ORDER, STATES } from './screens.mjs'

const USAGE = `Measures every pattern of the component inventory in the running App and writes its drift.

  node scripts/component-review/measure.mjs [--name <name>] [--app <app>] [--library <dir>] [--out <dir>]

Writes <out>/<name>.json (every instance and the summary) and <out>/<name>.md (the drift
summary). <name> defaults to baseline, <out> to outputs/review/v0.0.20.0/components/drift in the
main checkout, <app> to this checkout's built apps/desktop and <library> to the v0.0.19.0 test
library, which the run copies first.`

/** Instances measured per selector entry and state. */
const CAP = 40

const { values } = parseArgs({ options: { name: { type: 'string' }, app: { type: 'string' }, library: { type: 'string' }, out: { type: 'string' } } })
const name = values.name ?? 'baseline'
const app = values.app === undefined ? DESKTOP : resolve(values.app)
const library = values.library === undefined ? LIBRARY : resolve(values.library)
const out = values.out === undefined ? join(REVIEW, 'components', 'drift') : resolve(values.out)
if (!/^[\w.-]+$/.test(name) || !existsSync(app) || !existsSync(library)) {
  console.error(USAGE)
  process.exit(2)
}

const entries = probeEntries()
const tokens = { colourTokens: COLOUR_TOKENS, shadowTokens: SHADOW_TOKENS }

/**
 * The focus look of field `record` in a state of `scope`: what its outline, shadow and border
 * become while the DevTools protocol forces `:focus` and `:focus-visible` on the control it holds
 * and `:focus-within` on that control's ancestors, or `unchanged`. Nothing receives real focus.
 */
async function focusLook(win, cdp, record, scope) {
  await win.evaluate(markFocusPathInPage, record.id)
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-review-focus]' })
  // Document order puts the field, the innermost marked element, last.
  const forced = nodeIds.map((nodeId, index) => [nodeId, index === nodeIds.length - 1 ? ['focus', 'focus-visible'] : ['focus-within']])
  const field = { ...entries.find((item) => item.id === record.entry), selector: `[data-review-id="${record.id}"]`, not: undefined }
  try {
    for (const [nodeId, forcedPseudoClasses] of forced) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
    await settle(win)
    const again = await win.evaluate(measureInPage, { entries: [field], scope, cap: 1, ...tokens, variantClasses: VARIANT_CLASSES })
    const focused = again.records[0].metrics.focus
    return focused === record.metrics.focus ? 'unchanged' : focused
  } finally {
    for (const [nodeId] of forced) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    await win.evaluate(clearFocusPathInPage)
  }
}

/** The DevTools session of each App run's window. */
const sessions = new WeakMap()

/** Measures the state at every size and theme and returns its records; leaves 1440x900 light. */
async function visit(state, { win, electron }) {
  if (!sessions.has(win)) {
    const session = await win.context().newCDPSession(win)
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    sessions.set(win, session)
  }
  const cdp = sessions.get(win)
  const records = []
  const totals = {}
  for (const size of SIZES) {
    await setSize(electron, win, size)
    for (const theme of THEMES) {
      await setTheme(win, theme)
      const combo = comboName(size, theme)
      const found = await win.evaluate(measureInPage, { entries, scope: state.scope ?? 'screen', cap: CAP, ...tokens, variantClasses: VARIANT_CLASSES })
      for (const record of found.records.filter((item) => 'focus' in item.metrics)) record.metrics.focus = await focusLook(win, cdp, record, state.scope ?? 'screen')
      records.push(...found.records.map((record) => ({ combo, screen: state.screen, state: state.state, ...record })))
      totals[combo] = found.totals
    }
  }
  await setTheme(win, 'light')
  await setSize(electron, win, SIZES[0])
  return { records, totals }
}

const { results, failures } = await walk({ app, library, name: `measure-${name}`, states: STATES, visit })

// An element measured in an earlier state of the same screen counts once, as it first appeared.
const seen = new Set()
const records = results.flatMap(({ result }) => result.records).filter((record) => {
  const key = `${record.combo} ${record.screen} ${record.entry} ${record.id}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
const summary = driftSummary(records, SCREEN_ORDER)
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const meta = {
  app,
  // The last commit that changed a folder App's code; a packaged App names its version itself.
  appCommit: app.endsWith('.app') ? null : git(app, 'log', '-1', '--format=%H', '--', '.'),
  library, branch: git(import.meta.dirname, 'rev-parse', '--abbrev-ref', 'HEAD'), commit: git(import.meta.dirname, 'rev-parse', 'HEAD'),
  combos: SIZES.flatMap((size) => THEMES.map((theme) => comboName(size, theme))),
}
const states = results.map(({ state, result }) => ({
  screen: state.screen, state: state.state, batch: state.batch, scope: state.scope ?? 'screen', matched: result.totals,
}))
mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${name}.json`), `${JSON.stringify({ ...meta, states, failures, summary, records }, null, 1)}\n`)
writeFileSync(join(out, `${name}.md`), driftMarkdown({
  summary,
  failures,
  meta: [
    `App \`${app}\`${meta.appCommit ? `, its code last changed in \`${meta.appCommit.slice(0, 10)}\`` : ''}; scripts on \`${meta.branch}\` at \`${meta.commit.slice(0, 10)}\`; library a copy of \`${library}\`.`,
    `${states.length} states on ${SCREEN_ORDER.length} screens, ${records.length} instance measurements over ${meta.combos.join(', ')}.`,
    'Each instance is measured once per screen, in the first state that shows it. Selectors and metric keys: `scripts/component-review/patterns.mjs`.',
    `Patterns no state showed: ${Object.keys(PATTERNS).filter((pattern) => !records.some((record) => record.pattern === pattern)).join(', ') || 'none'}.`,
  ],
}))
console.log(`Wrote ${join(out, `${name}.json`)} and ${name}.md: ${records.length} measurements, ${failures.length} states not reached`)
