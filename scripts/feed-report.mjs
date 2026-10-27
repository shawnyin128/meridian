// Prints the feed's measures over a period from Core's log: the live measures per scope and scoring
// path, the gap between the fallback and the API, and why refreshes fell back.
//
//   node scripts/feed-report.mjs [--logs <dir>] [--since <date>] [--until <date>]
//
// --logs   the folder holding core.log and its rotated copies (default: the App's logs folder)
// --since  the start of the period, an ISO date or time (default: 7 days before --until)
// --until  the end of the period, an ISO date or time (default: now)
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const LINE = /^(\S+) (info|warn|error) \[feed\] (measures|gap|fallback) (.*)$/

/** The `key=value` fields of `text`, as numbers where they parse as one. */
const fieldsOf = (text) => Object.fromEntries(text.split(' ').flatMap((word) => {
  const at = word.indexOf('=')
  if (at < 0) return []
  const value = word.slice(at + 1).replace(/:$/, '')
  return [[word.slice(0, at), Number.isNaN(Number(value)) ? value : Number(value)]]
}))

const percent = (count, total) => `${total === 0 ? '0.0' : (100 * count / total).toFixed(1)}%`
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * The report of the `[feed]` lines of `log`, Core's log text, from `since` to `until`, both ISO dates
 * or times. Live measures are cumulative counts, so a scope's period is the change from its last line
 * before `since` to its last line in the period; direction shares are averaged over the period's lines.
 */
export function feedReport(log, { since, until }) {
  const from = new Date(since).toISOString()
  const to = new Date(until).toISOString()
  const entries = log.split('\n').flatMap((line) => {
    const match = LINE.exec(line)
    if (match === null) return []
    const [, at, level, kind, rest] = match
    const [subject] = rest.split(' ')
    return [{ at: new Date(at).toISOString(), level, kind, subject, fields: fieldsOf(rest) }]
  }).sort((left, right) => left.at.localeCompare(right.at))
  const inPeriod = (entry) => entry.at >= from && entry.at <= to

  const live = new Map()
  for (const entry of entries.filter((held) => held.kind === 'measures')) {
    const key = `${entry.subject} ${entry.fields.path}`
    const held = live.get(key) ?? { before: undefined, lines: [] }
    if (entry.at < from) held.before = entry
    else if (inPeriod(entry)) held.lines.push(entry)
    live.set(key, held)
  }
  const liveLines = [...live].filter(([, held]) => held.lines.length > 0).map(([key, { before, lines }]) => {
    const last = lines.at(-1).fields
    const change = (field) => last[field] - (before?.fields[field] ?? 0)
    const delivered = change('delivered')
    const owned = lines.map((line) => line.fields['owned-shown'])
    const shares = new Map()
    for (const line of lines) {
      for (const pair of String(line.fields.directions ?? '').split(',').filter((held) => held !== '')) {
        const [id, share] = pair.split(':')
        shares.set(id, (shares.get(id) ?? 0) + Number(share) / lines.length)
      }
    }
    const refreshes = (count) => `${count} refresh${count === 1 ? '' : 'es'}`
    return `  ${key}: ${refreshes(lines.length)}, ${delivered} delivered, `
      + `added ${change('added')} (${percent(change('added'), delivered)}), dismissed ${change('dismissed')} (${percent(change('dismissed'), delivered)}), `
      + `known ${change('known')} (${percent(change('known'), delivered)}), `
      + `owned papers shown ${Math.max(...owned)} in ${refreshes(owned.filter((count) => count > 0).length)} (must be 0)`
      + (shares.size === 0 ? '' : `, directions ${[...shares].map(([id, share]) => `${id} ${(100 * share).toFixed(1)}%`).join(' ')}`)
  })

  const gaps = new Map()
  for (const entry of entries.filter((held) => held.kind === 'gap' && inPeriod(held))) {
    gaps.set(entry.subject, [...gaps.get(entry.subject) ?? [], entry.fields])
  }
  const gapLines = [...gaps].map(([scope, runs]) => {
    const measure = (label, field) => {
      const values = runs.map((run) => run[field])
      return `${label} ${mean(values).toFixed(3)} (${values[0].toFixed(3)} -> ${values.at(-1).toFixed(3)})`
    }
    return `  ${scope}: ${runs.length} run${runs.length === 1 ? '' : 's'}, ${measure('overlap@10', 'overlap@10')}, `
      + `${measure('nDCG@10', 'ndcg@10')}, ${measure('Spearman', 'spearman')}`
  })

  const reasons = new Map()
  for (const entry of entries.filter((held) => held.kind === 'fallback' && inPeriod(held))) {
    reasons.set(entry.fields.reason, (reasons.get(entry.fields.reason) ?? 0) + 1)
  }
  return [
    `Feed measures from ${from} to ${to}`,
    '',
    'Live measures by scope and path: cards delivered in the period and how they left',
    ...(liveLines.length === 0 ? ['  none'] : liveLines),
    '',
    'Gap of the fallback to the API by scope: mean over API runs (first -> latest)',
    ...(gapLines.length === 0 ? ['  none'] : gapLines),
    '',
    `Fallbacks by reason: ${reasons.size === 0 ? 'none' : [...reasons].map(([reason, count]) => `${reason} ${count}`).join(', ')}`,
  ].join('\n')
}

/** The text of `dir`'s core.log and its rotated copies, oldest first, one blank line between files. */
export function readCoreLog(dir) {
  const files = [2, 1, 0].map((n) => join(dir, n === 0 ? 'core.log' : `core.${n}.log`)).filter((file) => existsSync(file))
  return files.map((file) => readFileSync(file, 'utf8')).join('\n')
}

/** The App's logs folder on this platform. */
const appLogs = () => (process.platform === 'win32'
  ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), '@meridian', 'desktop', 'logs')
  : process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', '@meridian', 'desktop', 'logs')
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), '@meridian', 'desktop', 'logs'))

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({ options: { logs: { type: 'string' }, since: { type: 'string' }, until: { type: 'string' } } })
  const until = values.until ?? new Date().toISOString()
  const since = values.since ?? new Date(new Date(until).getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString()
  console.log(feedReport(readCoreLog(values.logs ?? appLogs()), { since, until }))
}
