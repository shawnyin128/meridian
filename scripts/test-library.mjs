import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DESKTOP, openApp, readJson, readsCannedNetFile, redate, session, writeJson } from './test-library/app.mjs'
import { seedConversations } from './test-library/conversations.mjs'
import { redateLater, seedInbox, seedWatches, writeInbox } from './test-library/feed.mjs'
import { prepareWorkspace, redateEvents, seedLab, seedProposals } from './test-library/lab.mjs'
import { arxivMetadata, importPapers, paperFiles, redatePapers, seedPapers } from './test-library/papers.mjs'
import { discoveryProgress, discoveryRecords, redateProjects, seedProjects } from './test-library/projects.mjs'
import { relocate } from './test-library/relocate.mjs'
import { checkOut, MARKER, protectedRoots } from './test-library/safety.mjs'
import { seedColourTheme } from './test-library/themes.mjs'
import { seedWiki } from './test-library/wiki.mjs'

const USAGE = `Builds a Meridian test library that covers every screen, or opens one for review.

  node scripts/test-library.mjs seed --out <dir> [--app <app>] [--today <YYYY-MM-DD>]
  node scripts/test-library.mjs open --out <dir> [--app <app>]

<app> is a Meridian.app, a Meridian.exe, or a folder such as apps/desktop (the default, built
with npm --prefix apps/desktop run build). seed writes <dir>/library, config, user-data,
workspaces and files from scratch through the App's Core and keeps the PDFs and metadata it
downloads from arXiv in <dir>/cache, so a later seed into <dir> runs off the network unless the
App predates 0.0.16.0. --today is the day the seeded dates count from; it defaults to the system
date, which Core still uses to stamp the records the seed does not redate. open on a copy of a
test library first points the paths it stores at the copy.`

/** The folders a seed writes and therefore deletes before writing them again. */
const SEEDED = ['library', 'config', 'user-data', 'workspaces', 'files']

const systemToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Builds the test library in `out` from scratch with `app`. Each App launch below is one stage: the
 * first imports the papers with the App's arXiv lookups answered from `<out>/cache`, or over the
 * network by an App whose Core cannot read them from there, the others write through Core off the
 * network, and stored files change between launches only while the App is closed.
 */
async function seed(out, app, today) {
  checkOut(out, protectedRoots())
  for (const name of SEEDED) rmSync(join(out, name), { recursive: true, force: true })
  mkdirSync(join(out, 'config'), { recursive: true })
  writeJson(join(out, MARKER), { root: out, app, today, seededAt: new Date().toISOString() })
  // A fresh check time keeps the App's plugin-version check off GitHub while the seed runs.
  writeJson(join(out, 'config', 'plugin-latest.json'), { version: '0.0.0', checkedAt: new Date().toISOString() })
  seedColourTheme(out)
  const state = { out, today, papers: {}, projects: {}, days: { feed: new Map(), changelog: new Map(), later: new Map() } }
  const stamped = systemToday()
  const files = await paperFiles(out)
  const metadata = await arxivMetadata(out)
  const lookups = readsCannedNetFile(app) ? { canned: metadata } : { network: true }
  const titles = await session(out, app, { bootstrap: true, ...lookups }, async (call, win) => {
    await importPapers(state, call, win, files)
    const rows = (await call('papers.list', { page: 1, size: 200 })).rows
    return Object.fromEntries(Object.entries(state.papers).map(([key, id]) => [key, rows.find((row) => row.id === id).title]))
  })
  prepareWorkspace(state)
  await session(out, app, {}, async (call) => {
    await seedPapers(state, call, files)
    await seedWiki(state, call, files)
    await seedWatches(state, call)
    await seedLab(state, call, await seedProjects(state, call))
    await seedConversations(state, call)
    await seedProposals(state, call, files)
  })
  writeInbox(state, discoveryRecords(state))
  mkdirSync(join(out, 'library', '.meridian', 'discovery'), { recursive: true })
  writeJson(join(out, 'library', '.meridian', 'discovery', 'progress.json'), discoveryProgress(state))
  await session(out, app, {}, async (call) => {
    await seedInbox(state, call)
    await call('discovery.feedback', { id: 'seed-discovery-kvquant', feedback: 'more' })
    await call('feed.list')
  })
  redatePapers(state, titles)
  redateProjects(state, stamped)
  redateEvents(state)
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
  const marker = readJson(join(out, MARKER))
  if (marker.root !== out) {
    relocate(out, marker.root)
    writeJson(join(out, MARKER), { ...marker, root: out })
  }
  openApp(out, app)
  console.log(`Opened ${out} in ${app}`)
}
