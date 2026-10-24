import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const REPO = resolve(import.meta.dirname, '../..')
/** The checkout's desktop app, which `e2e/app.ts` launches too. */
export const DESKTOP = join(REPO, 'apps', 'desktop')

/**
 * How to start `app`: a folder such as apps/desktop runs under the checkout's electron package, a
 * macOS `Meridian.app` through its bundled executable, and any other path is the executable itself.
 * Throws when the folder has not been built.
 */
function appTarget(app) {
  const path = resolve(app)
  if (path.endsWith('.app')) return { executable: join(path, 'Contents', 'MacOS', 'Meridian'), args: [] }
  if (!statSync(path).isDirectory()) return { executable: path, args: [] }
  if (!existsSync(join(path, 'out', 'main', 'index.js'))) throw new Error(`${path} is not built: run npm --prefix apps/desktop run build`)
  return { executable: createRequire(import.meta.url)('electron'), args: [path] }
}

/**
 * Whether the Core of `app` answers from the canned responses in MERIDIAN_CANNED_NET_FILE, that is,
 * whether its built code names that variable: the `.js` files under a folder's `out`, else the
 * `app.asar` in the resources of a macOS `Meridian.app` or beside an executable, which holds the
 * scripts as plain text. Throws when that code is missing.
 */
export function readsCannedNetFile(app) {
  const path = resolve(app)
  const code = path.endsWith('.app') ? [join(path, 'Contents', 'Resources', 'app.asar')]
    : statSync(path).isDirectory()
      ? readdirSync(join(path, 'out'), { recursive: true }).filter((name) => name.endsWith('.js')).map((name) => join(path, 'out', name))
      : [join(dirname(path), 'resources', 'app.asar')]
  return code.some((file) => readFileSync(file).includes('MERIDIAN_CANNED_NET_FILE'))
}

/**
 * The environment an App on test library `out` runs with. `network: false` keeps Core off the
 * network, answering from its canned responses and those in the file `canned`, `bootstrap` lets
 * Core initialize an empty library, `show` opens a normal window for the owner. Without `show` the
 * window is isolated: it paints right of every display, never takes focus, and on macOS the App has
 * no Dock icon and never becomes the active app.
 */
function appEnv(out, { show = false, network = false, bootstrap = false, canned }) {
  const env = { ...process.env }
  for (const key of [
    'ELECTRON_RUN_AS_NODE', 'MERIDIAN_LIBRARY_ROOT', 'MERIDIAN_CANNED_NET', 'MERIDIAN_CANNED_NET_FILE', 'MERIDIAN_BOOTSTRAP_VAULT',
  ]) {
    delete env[key]
  }
  return {
    ...env,
    MERIDIAN_VAULT_ROOT: join(out, 'library'),
    MERIDIAN_CONFIG_HOME: join(out, 'config'),
    MERIDIAN_SHOW_WINDOW: show ? '1' : 'isolated',
    ...(network ? {} : { MERIDIAN_CANNED_NET: '1' }),
    ...(canned === undefined ? {} : { MERIDIAN_CANNED_NET_FILE: canned }),
    ...(bootstrap ? { MERIDIAN_BOOTSTRAP_VAULT: '1' } : {}),
  }
}

const appArgs = (out) => [`--user-data-dir=${join(out, 'user-data')}`, '--lang=zh-CN']

/**
 * Launches `app` isolated on test library `out`, runs `steps` with `call(method, params)`, which
 * calls Core through `window.meridian.call`, and closes the App. Rejects with an Error naming the
 * method and the reason Core gave when a call fails; Core logs its own text to the App's stdout.
 */
export async function session(out, app, options, steps) {
  const target = appTarget(app)
  const launched = await electron.launch({
    executablePath: target.executable,
    // Off every display Chromium paints in the primary display's colour profile; forced sRGB keeps a
    // screenshot's stored values equal to the page's colours. Chromium reads it before the main script.
    args: [...target.args, ...appArgs(out), '--force-color-profile=srgb'],
    env: appEnv(out, options),
  })
  try {
    const win = await launched.firstWindow()
    await win.waitForFunction(() => window.meridian !== undefined)
    const call = (method, params = {}) => win.evaluate(([m, p]) => window.meridian.call(m, p).catch((rejected) => {
      throw new Error(`${m}: ${JSON.stringify(rejected)}`)
    }), [method, params])
    return await steps(call, win)
  } finally {
    await launched.close()
  }
}

/** Starts `app` on test library `out` with a visible window, using the network, and leaves it running. */
export function openApp(out, app) {
  const target = appTarget(app)
  spawn(target.executable, [...target.args, ...appArgs(out)], {
    env: appEnv(out, { show: true, network: true }), detached: true, stdio: 'ignore',
  }).unref()
}

/**
 * Runs Python (`$PYTHON`, else `python` on PATH) with `args` and stdin `input`, with this checkout's
 * `src` first on its path and config home `<out>/config`, the way a coding agent's plugin runs, and
 * returns its stdout. Throws with its output when it fails.
 */
export function python(out, args, input) {
  const run = spawnSync(process.env.PYTHON ?? 'python', args, {
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      MERIDIAN_CONFIG_HOME: join(out, 'config'),
      PYTHONPATH: [join(REPO, 'src'), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
    },
  })
  if (run.error) throw run.error
  if (run.status !== 0) throw new Error(`python ${args.join(' ')} failed:\n${run.stdout}${run.stderr}`)
  return run.stdout
}

/** Runs the `meridian` CLI with `args` through `python` and returns its stdout. */
export const meridian = (out, args) => python(out, ['-m', 'meridian', ...args])

/** The ISO date `days` after `today`, before it when negative. */
export const dayFrom = (today, days) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** The local calendar day of an ISO timestamp. */
const localDay = (iso) => {
  const at = new Date(iso)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
export const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

/** The ids of the records in `.meridian/<name>.json` of the library in `out`. */
const storedIds = (out, name) => {
  const file = join(out, 'library', '.meridian', `${name}.json`)
  return new Set(existsSync(file) ? readJson(file).map((record) => record.id) : [])
}

/**
 * Runs `steps` as the work of day `days` after the seed's today (before it when negative): the feed
 * entries and change records it adds are moved to that day by `redate` once the App is closed.
 */
export async function onDay(seed, days, steps) {
  const before = { feed: storedIds(seed.out, 'feed'), changelog: storedIds(seed.out, 'changelog') }
  const result = await steps()
  for (const name of ['feed', 'changelog']) {
    for (const id of storedIds(seed.out, name)) if (!before[name].has(id)) seed.days[name].set(id, days)
  }
  return result
}

/**
 * Moves the feed entries and change records `seed.days` names to their day in the stored files, the
 * way Core would have stamped them on that day, and keeps both files in the order Core reads them:
 * the feed oldest first, the change log newest first. A file Core has not created yet is left out.
 */
export function redate(seed) {
  const file = (name) => join(seed.out, 'library', '.meridian', `${name}.json`)
  if (existsSync(file('feed'))) {
    const feed = readJson(file('feed')).map((entry) => {
      const days = seed.days.feed.get(entry.id)
      if (days === undefined || entry.createdAt === undefined) return entry
      const shift = Date.parse(`${dayFrom(seed.today, days)}T00:00:00Z`) - Date.parse(`${localDay(entry.createdAt)}T00:00:00Z`)
      return { ...entry, createdAt: new Date(Date.parse(entry.createdAt) + shift).toISOString() }
    })
    writeJson(file('feed'), feed.sort((a, b) => Date.parse(a.createdAt ?? 0) - Date.parse(b.createdAt ?? 0)))
  }
  if (existsSync(file('changelog'))) {
    const changes = readJson(file('changelog')).map((row) => {
      const days = seed.days.changelog.get(row.id)
      return days === undefined ? row : { ...row, at: Date.parse(`${dayFrom(seed.today, days)}T00:00:00Z`) }
    })
    writeJson(file('changelog'), changes.sort((a, b) => b.at - a.at))
  }
}
