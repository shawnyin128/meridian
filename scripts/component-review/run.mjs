import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, rmdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { session } from '../test-library/app.mjs'
import { injector } from './inject.mjs'

const REPO = resolve(import.meta.dirname, '../..')
/** The main checkout, whose outputs/ folder holds the review even when a worktree runs this. */
export const MAIN = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim())
export const REVIEW = join(MAIN, 'outputs', 'review', 'v0.0.20.0')
/** The Electron lock every agent of the review takes before it launches an App. */
export const LOCK = join(REVIEW, 'electron.lock')
export const LIBRARY = join(MAIN, 'outputs', 'test-library', 'v0.0.19.0')
const LIBS = join(REVIEW, 'components', 'libs')
export const SIZES = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]
export const THEMES = ['light', 'dark']
/** How long one App run may hold the lock. */
const BUDGET_MS = 9 * 60 * 1000
const STEP_TIMEOUT_MS = 6000

/** The name of a size and theme in records and reports, for example `1440x900-light`. */
export const comboName = (size, theme) => `${size.width}x${size.height}-${theme}`

/**
 * Copies the test library `library` to a new folder under the review's libs/ folder, the way the
 * review brief prescribes (ditto, no Chromium singleton files, relocated), and returns its path.
 */
export function copyLibrary(library, name) {
  const copy = join(LIBS, `${name}-${process.pid}`)
  rmSync(copy, { recursive: true, force: true })
  mkdirSync(LIBS, { recursive: true })
  execFileSync('ditto', [library, copy])
  for (const file of readdirSync(join(copy, 'user-data')).filter((entry) => entry.startsWith('Singleton'))) {
    rmSync(join(copy, 'user-data', file))
  }
  execFileSync(process.execPath, [join(REPO, 'scripts', 'test-library.mjs'), 'relocate', '--out', copy], { stdio: 'inherit' })
  return copy
}

/** Deletes a copy `copyLibrary` made. Throws for any other folder. */
export function removeCopy(copy) {
  if (relative(LIBS, copy).startsWith('..') || dirname(copy) !== LIBS) throw new Error(`Refusing to remove ${copy}`)
  rmSync(copy, { recursive: true, force: true })
}

/** Runs `work` while holding the Electron lock, waiting for it in 15-second steps. */
async function withLock(work) {
  for (let waited = 0; ; waited += 15) {
    try {
      mkdirSync(LOCK)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (waited % 120 === 0) console.log(`waiting for ${LOCK}`)
      await sleep(15_000)
    }
  }
  const release = () => rmdirSync(LOCK)
  const interrupted = () => { release(); process.exit(130) }
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  try {
    return await work()
  } finally {
    process.off('SIGINT', interrupted)
    process.off('SIGTERM', interrupted)
    release()
  }
}

/** Sets the window's content size and waits until the page has it. */
export async function setSize(electron, win, size) {
  await electron.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height), size)
  await win.waitForFunction((s) => window.innerWidth === s.width && window.innerHeight === s.height, size)
  await settle(win)
}

/** Applies the light or dark appearance the way Settings does: stored, on the root element, announced. */
export async function setTheme(win, theme) {
  await win.evaluate((mode) => {
    window.localStorage.setItem('meridian.appearance', mode)
    const root = document.documentElement
    root.dataset.appearance = mode
    if (mode === 'dark') root.dataset.theme = 'dark'
    else delete root.dataset.theme
    root.style.colorScheme = mode
    window.dispatchEvent(new CustomEvent('meridian:appearance-change', { detail: mode }))
  }, theme)
  await settle(win)
}

/** Waits for fonts and two frames and finishes every running transition, so styles are final. */
export async function settle(win) {
  await win.evaluate(async () => {
    await document.fonts.ready
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getTiming().iterations !== Infinity) animation.finish()
    }
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
}

/** Moves the pointer onto the empty title bar so nothing shows its hover look. */
export async function park(win) {
  await win.mouse.move(700, 450)
  await win.mouse.move(1, 1)
}

/**
 * Runs one navigation step of screens.mjs with Playwright input: `['wait', ms | selector]`,
 * `['press', key]`, `['click' | 'rightclick' | 'hover', selector, index]` (index -1 is the last
 * match, the default the first), `['clickText', selector, text]` (the first match holding that
 * text), `['clickIf', selector]` (only when it is visible), `['fill', selector, text]`,
 * `['radio', name]` (the radio of that accessible name in the visible screen) and `['drag',
 * selector, type]` (a drag event of `type` carrying a PDF file, as the OS sends on a file drag). `['fail', method,
 * reason]`, `['answer', method, source]`, `['hold', method]` and `['transform', method, source]`
 * set a rule of `inject` for the state's Core calls. Throws when a target does not appear within STEP_TIMEOUT_MS.
 */
async function step(win, inject, [kind, target, arg]) {
  const nth = (locator) => (arg === -1 ? locator.last() : locator.nth(typeof arg === 'number' ? arg : 0))
  const options = { timeout: STEP_TIMEOUT_MS }
  if (kind === 'wait') {
    if (typeof target === 'number') await win.waitForTimeout(target)
    else await win.locator(target).first().waitFor({ state: 'visible', ...options })
  } else if (kind === 'press') await win.keyboard.press(target)
  else if (kind === 'click') await nth(win.locator(target)).click(options)
  else if (kind === 'clickText') await win.locator(target, { hasText: arg }).first().click(options)
  else if (kind === 'clickIf') {
    const found = win.locator(target).first()
    if (await found.isVisible()) await found.click(options)
  }
  else if (kind === 'rightclick') await nth(win.locator(target)).click({ button: 'right', ...options })
  else if (kind === 'hover') await nth(win.locator(target)).hover(options)
  else if (kind === 'fill') await win.locator(target).first().fill(arg, options)
  else if (kind === 'radio') await win.locator('.screenslot:not([hidden])').getByRole('radio', { name: target, exact: true }).first().click(options)
  else if (kind === 'drag') {
    const files = await win.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['%PDF-1.4'], 'review.pdf', { type: 'application/pdf' }))
      return transfer
    })
    await win.locator(target).first().dispatchEvent(arg, { dataTransfer: files })
  } else if (kind === 'fail') await inject.fail(target, arg)
  else if (kind === 'answer') await inject.answer(target, arg)
  else if (kind === 'hold') await inject.hold(target)
  else if (kind === 'transform') await inject.transform(target, arg)
  else throw new Error(`Unknown step ${kind}`)
}

/**
 * Walks `states` on a fresh copy of `library` with `app`: one App run per batch, each under the
 * Electron lock and within the run budget. Every state starts at 1440x900 in the light theme with
 * its steps done; then `visit(state, context)` runs with `context = { win, electron }`, returns
 * that state's result and leaves 1440x900 light, its fault-injection rules end, and the state's
 * `after` steps run. `finish`, when
 * given, runs with the same context after the last batch's states, in that App run. Returns
 * `{ results, failures }`: the result of every state reached, and the state and reason of every
 * one that was not. Throws when a batch runs over its budget.
 */
export async function walk({ app, library, name, states, visit, finish }) {
  const copy = copyLibrary(library, name)
  const results = []
  const failures = []
  try {
    const batches = [...new Set(states.map((state) => state.batch))]
    for (const batch of batches) {
      const todo = states.filter((state) => state.batch === batch)
      await withLock(() => session(copy, app, {}, async (_call, win, electron) => {
        const started = Date.now()
        const watchdog = setTimeout(() => { electron.close() }, BUDGET_MS)
        try {
          await win.locator('#sidebar').waitFor()
          const inject = await injector(win)
          await setSize(electron, win, SIZES[0])
          await setTheme(win, 'light')
          let reached = true
          for (const state of todo) {
            if (Date.now() - started > BUDGET_MS - 45_000) throw new Error(`Batch ${batch} ran over ${BUDGET_MS / 60000} minutes: split it`)
            if (state.continues && !reached) {
              failures.push({ screen: state.screen, state: state.state, reason: 'the state it continues was not reached' })
              continue
            }
            try {
              for (const item of state.steps) await step(win, inject, item)
              if (!state.keepPointer) await park(win)
              await settle(win)
              results.push({ state, result: await visit(state, { win, electron }) })
              await inject.clear()
              for (const item of state.after ?? []) await step(win, inject, item)
              reached = true
            } catch (error) {
              reached = false
              failures.push({ screen: state.screen, state: state.state, reason: error.message.split('\n')[0] })
              await inject.clear()
              await setSize(electron, win, SIZES[0])
              await setTheme(win, 'light')
            }
          }
          if (finish && batch === batches.at(-1)) await finish({ win, electron })
          console.log(`batch ${batch}: ${todo.length} states in ${Math.round((Date.now() - started) / 1000)} s`)
        } finally {
          clearTimeout(watchdog)
        }
      }))
    }
  } finally {
    removeCopy(copy)
  }
  return { results, failures }
}
