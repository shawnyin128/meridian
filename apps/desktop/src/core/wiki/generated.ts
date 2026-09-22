import type { WikiData } from './model.js'
import { wikiAggregation } from './model.js'

/**
 * Returns the markdown for an aggregation's child-aggregation region: its
 * heading, then one `[[id|title]]` line per child in id order, or the localized
 * empty-state text when
 * it has none.
 */
export function generatedChildren(data: WikiData, id: string): string {
  const { children } = wikiAggregation(data, id)
  return ['## 子聚合', ...(children.length === 0 ? ['(无)'] : children.map((c) => `- [[${c.id}|${c.title}]]`))].join('\n')
}

/**
 * Returns the markdown for an aggregation's comparison-table region: its
 * heading, then a header of the columns and derived columns, one row per
 * member in id order with each cell as `value ·pN`, an em dash for a cell not
 * filled, and derived cells as `[[id|title]]` links; localized empty-state text
 * when it has neither columns nor members, and a different localized state when it has columns but
 * no members.
 */
export function generatedTable(data: WikiData, id: string): string {
  const agg = wikiAggregation(data, id)
  const table = (): string[] => {
    if (agg.columns.length === 0 && agg.rows.length === 0) return ['(此节点不直接收论文)']
    if (agg.rows.length === 0) return ['(暂无成员)']
    const head = ['论文', ...agg.columns.map((c) => c.label), ...agg.derivedColumns.map((d) => d.label)]
    const rows = agg.rows.map((row) => [
      `[[${row.paper.id}|${row.paper.title}]]`,
      ...agg.columns.map((c) => {
        const cell = row.cells[c.key]
        return cell === undefined ? '—' : `${cell.value} ·p${cell.page}`
      }),
      ...agg.derivedColumns.map((d) =>
        (row.derived[d.key] ?? []).map((l) => `[[${l.id}|${l.title}]]`).join(', ') || '—'),
    ])
    return [`| ${head.join(' | ')} |`, `|${'---|'.repeat(head.length)}`, ...rows.map((r) => `| ${r.join(' | ')} |`)]
  }
  return ['## 对照表', ...table()].join('\n')
}
