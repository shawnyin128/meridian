import type { ConflictTarget, Evidence } from '../../shared/contract.js'
import type { WikiData } from './model.js'
import { aggregationView, claimAt, claimsOf, labelOf, titleOf } from './model.js'

/**
 * Returns the markdown for an aggregation's child-aggregation region: its
 * heading, then one `[[id|title]]` line per child in id order, or the localized
 * empty-state text when
 * it has none.
 */
export function generatedChildren(data: WikiData, id: string): string {
  const { children } = aggregationView(data, id)
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
  const agg = aggregationView(data, id)
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

/**
 * Returns the markdown for an aggregation's claims region (write protocol §2.4): its heading, then per
 * claim in page order `- <text> · v<n> · <since> ^<id>` followed by one indented line per evidence item
 * and one per open conflict, or the no-claims line when it has none. `projects` maps project ids to names (the
 * id stands when unnamed); a missing claim or page is shown by its ref or id. Line breaks inside a quote
 * render as spaces.
 */
export function generatedClaims(data: WikiData, id: string, projects: Record<string, string>): string {
  const link = (target: string, text: string): string => `[[${target}|${text}]]`
  const claimLink = (ref: string, text: string): string => link(ref.replace('#', '#^'), text)
  const side = (item: Evidence | ConflictTarget): string => {
    switch (item.kind) {
      case 'source':
        return `${link(item.paper, labelOf(data, item.paper))} (p.${item.page})「${item.quote.replace(/\r?\n/g, ' ')}」`
      case 'experiment':
        return `实验 ${link(`projects/${item.project}`, projects[item.project] ?? item.project)} ${item.node ?? item.conclusion ?? ''}${item.text ? `:${item.text}` : ''}`
      case 'wiki':
        return item.ref.includes('#')
          ? claimLink(item.ref, titleOf(data, item.ref.split('#')[0]!))
          : link(item.ref, titleOf(data, item.ref))
      case 'claim':
        return claimLink(item.ref, claimAt(data, item.ref)?.text ?? item.ref)
      case 'note':
        return link(item.paper, labelOf(data, item.paper))
      case 'personal':
        return item.text
      default:
        return ''
    }
  }
  const label = (item: Evidence): string =>
    item.kind === 'note' ? '你的笔记' : item.kind === 'personal' ? '个人判断' : '证据'
  const claims = claimsOf(data, id)
  if (claims.length === 0) return '## 结论\n(暂无结论)'
  return ['## 结论', ...claims.flatMap((claim) => [
    `- ${claim.text} · v${claim.version} · ${claim.since} ^${claim.id}`,
    ...claim.evidence.map((item) => `  - ${label(item)}${side(item) === '' ? '' : ` · ${side(item)}`}`),
    ...(claim.conflicts ?? []).map((c) => `  - 冲突 · ${side(c.against)}:${c.note}`),
  ])].join('\n')
}
