// The drift summary of a measure run: per pattern and metric, the distinct values the instances
// take, how many instances take each, and the screens they appear on.

/** The size and theme every summary leads with, as the inventory was measured. */
export const MAIN_COMBO = '1440x900-light'

const byValue = (a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value), 'en', { numeric: true })

/**
 * Summarizes `records` ({ combo, screen, pattern, metrics }) per combo and pattern: the number of
 * instances and, for every metric key, the distinct non-null values, each with its instance count
 * and screens, most common first, and how many instances have no value (`missing`). Screens are
 * listed in `screenOrder`, then by name. Returns a plain object keyed by combo, then pattern.
 */
export function driftSummary(records, screenOrder = []) {
  const rank = (screen) => (screenOrder.includes(screen) ? screenOrder.indexOf(screen) : screenOrder.length)
  const byScreen = (a, b) => rank(a) - rank(b) || a.localeCompare(b)
  const combos = new Map()
  for (const record of records) {
    if (!combos.has(record.combo)) combos.set(record.combo, new Map())
    const patterns = combos.get(record.combo)
    if (!patterns.has(record.pattern)) patterns.set(record.pattern, { instances: 0, metrics: new Map() })
    const pattern = patterns.get(record.pattern)
    pattern.instances += 1
    for (const [key, value] of Object.entries(record.metrics)) {
      if (!pattern.metrics.has(key)) pattern.metrics.set(key, { values: new Map(), missing: 0 })
      const metric = pattern.metrics.get(key)
      if (value === null || value === undefined) {
        metric.missing += 1
        continue
      }
      const slot = metric.values.get(String(value)) ?? { value, count: 0, screens: new Set() }
      slot.count += 1
      slot.screens.add(record.screen)
      metric.values.set(String(value), slot)
    }
  }
  const sorted = (map) => [...map.keys()].sort((a, b) => a.localeCompare(b, 'en'))
  return Object.fromEntries(sorted(combos).map((combo) => [combo, Object.fromEntries(sorted(combos.get(combo)).map((name) => {
    const pattern = combos.get(combo).get(name)
    return [name, {
      instances: pattern.instances,
      metrics: Object.fromEntries([...pattern.metrics].map(([key, metric]) => {
        const values = [...metric.values.values()].map((slot) => ({ value: slot.value, count: slot.count, screens: [...slot.screens].sort(byScreen) }))
        return [key, { distinct: values.length, missing: metric.missing, values: values.sort(byValue) }]
      })),
    }]
  }))]))
}

/**
 * The patterns of `combo` in `summary`, most drifted first: by the largest number of distinct
 * values any one metric takes, then by the distinct values of all metrics together, then by name.
 * Each item names the pattern, its instances, that largest count and the metric that has it.
 */
export function driftRanking(summary, combo = MAIN_COMBO) {
  return Object.entries(summary[combo] ?? {}).map(([pattern, { instances, metrics }]) => {
    const counts = Object.entries(metrics).map(([key, metric]) => [key, metric.distinct])
    const [metric, distinct] = counts.reduce((best, item) => (item[1] > best[1] ? item : best), ['', 0])
    return { pattern, instances, distinct, metric, total: counts.reduce((sum, [, count]) => sum + count, 0) }
  }).sort((a, b) => b.distinct - a.distinct || b.total - a.total || a.pattern.localeCompare(b.pattern, 'en'))
}

const cell = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ')
const valueList = (metric) => metric.values.map((slot) => `\`${cell(slot.value)}\` ×${slot.count} (${slot.screens.join(', ')})`).join('<br>')
const sameValues = (a, b) => a !== undefined && b !== undefined && a.values.map((slot) => String(slot.value)).sort().join('\n') === b.values.map((slot) => String(slot.value)).sort().join('\n')

/**
 * The Markdown report of a measure run: `meta` lines, the ranking of `combo`, its per-pattern
 * value tables, the metrics whose values differ in the other combos, and the `failures`.
 */
export function driftMarkdown({ summary, meta, failures, combo = MAIN_COMBO }) {
  const lines = ['# Component drift', '', ...meta.map((line) => `- ${line}`), '']
  lines.push(
    `## Patterns by distinct values (${combo})`, '',
    'Distinct: how many different values the most varied metric takes across every instance on every screen; 1 means every instance agrees. All: the distinct values of every metric added up.', '',
    '| Pattern | Instances | Distinct | Metric | All |', '|---|---:|---:|---|---:|',
    ...driftRanking(summary, combo).map((item) => `| ${item.pattern} | ${item.instances} | ${item.distinct} | ${item.metric} | ${item.total} |`),
    '',
  )
  lines.push(`## Values per pattern (${combo})`, '')
  for (const [pattern, { instances, metrics }] of Object.entries(summary[combo] ?? {})) {
    lines.push(`### ${pattern} · ${instances} instances`, '', '| Metric | Distinct | Values (×instances, screens) |', '|---|---:|---|')
    for (const [key, metric] of Object.entries(metrics)) {
      lines.push(`| ${key} | ${metric.distinct}${metric.missing ? ` (+${metric.missing} n/a)` : ''} | ${valueList(metric)} |`)
    }
    lines.push('')
  }
  for (const other of Object.keys(summary).filter((name) => name !== combo)) {
    lines.push(`## ${other}: metrics whose values differ from ${combo}`, '')
    let differs = false
    for (const [pattern, { metrics }] of Object.entries(summary[other])) {
      for (const [key, metric] of Object.entries(metrics)) {
        if (sameValues(metric, summary[combo]?.[pattern]?.metrics[key])) continue
        differs = true
        lines.push(`- **${pattern} ${key}** (${metric.distinct}): ${metric.values.map((slot) => `\`${cell(slot.value)}\` ×${slot.count}`).join(', ')}`)
      }
    }
    lines.push(...(differs ? [] : ['None.']), '')
  }
  lines.push('## States not reached', '', ...(failures.length ? failures.map((item) => `- ${item.screen} · ${item.state}: ${item.reason}`) : ['None.']), '')
  return lines.join('\n')
}
