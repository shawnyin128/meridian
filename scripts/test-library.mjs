import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DESKTOP, openApp, redate, session, writeJson } from './test-library/app.mjs'
import { redateLater, seedInbox, seedWatches, writeInbox } from './test-library/feed.mjs'
import { checkOut, MARKER, protectedRoots } from './test-library/safety.mjs'

const USAGE = `Builds a Meridian test library that covers every screen, or opens one for review.

  node scripts/test-library.mjs seed --out <dir> [--app <app>] [--today <YYYY-MM-DD>]
  node scripts/test-library.mjs open --out <dir> [--app <app>]

<app> is a Meridian.app, a Meridian.exe, or a folder such as apps/desktop (the default, built
with npm --prefix apps/desktop run build). seed writes <dir>/library, config and user-data from
scratch through the App's Core. --today is the day the seeded dates count from; it defaults to
the system date, which Core still uses to stamp the records the seed does not redate.`

/** The folders a seed writes and therefore deletes before writing them again. */
const SEEDED = ['library', 'config', 'user-data']

const systemToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Builds the test library in `out` from scratch with `app`. Each App launch below is one stage that
 * writes through Core off the network; stored files change between launches only while the App is
 * closed.
 */
async function seed(out, app, today) {
  checkOut(out, protectedRoots())
  for (const name of SEEDED) rmSync(join(out, name), { recursive: true, force: true })
  mkdirSync(join(out, 'config'), { recursive: true })
  writeJson(join(out, MARKER), { root: out, app, today, seededAt: new Date().toISOString() })
  const state = { out, today, days: { feed: new Map(), changelog: new Map(), later: new Map() } }
  await session(out, app, { bootstrap: true }, (call) => seedWatches(state, call))
  writeInbox(state)
  await session(out, app, {}, (call) => seedInbox(state, call))
  redate(state)
  redateLater(state)
  console.log(`Seeded ${out}`)
}

const { positionals: [command], values } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, app: { type: 'string' }, today: { type: 'string' } },
})
if (!['seed', 'open'].includes(command) || values.out === undefined) {
  console.error(USAGE)
  process.exit(2)
}
const out = resolve(values.out)
const app = values.app === undefined ? DESKTOP : resolve(values.app)
if (!existsSync(app)) throw new Error(`No App at ${app}`)
if (command === 'seed') {
  const today = values.today ?? systemToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today must be YYYY-MM-DD: ${today}`)
  await seed(out, app, today)
} else {
  checkOut(out, protectedRoots(), { seeded: true })
  openApp(out, app)
  console.log(`Opened ${out} in ${app}`)
}
