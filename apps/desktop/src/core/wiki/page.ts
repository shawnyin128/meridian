import type { WikiMembershipRecord } from './model.js'
import type { Json } from '../vault/frontmatter.js'
import { emitItem, emitKey } from '../vault/frontmatter.js'
import { rangeOf, removeKey, rowsOf, writeKey } from '../vault/page-lines.js'
import { replacePage, spliceLines } from '../vault/writer.js'

/** Opening and closing markers of a generated region. */
const GENERATED_OPEN = (name: string): string => `<!-- generated:${name} -->`
const GENERATED_CLOSE = '<!-- /generated -->'

/** Page lines for one membership: a sequence item indented two spaces under `memberships`. */
const ITEM_INDENT = '  '

/** Restore trailing CR so inserted lines follow the destination line ending. */
const withCrOf = (sample: string, lines: string[]): string[] =>
  lines.map((row) => (sample.endsWith('\r') ? `${row}\r` : row))

/** Frontmatter lines for one membership. */
function membershipLines(membership: WikiMembershipRecord): string[] {
  const cells: Record<string, Json> = Object.fromEntries(Object.entries(membership.cells ?? {})
    .map(([key, cell]) => [key, { value: cell.value, at: { page: cell.at.page, quote: cell.at.quote } }]))
  return emitItem({ in: membership.in, cells: Object.keys(cells).length === 0 ? [] : cells }, ITEM_INDENT)
}

/**
 * Line ranges `[from, to)` occupied by memberships, indexed by `in`. `key` is -1 when the page has no
 * `memberships`; `items` is empty for an explicit empty list. Throw when memberships are neither an
 * empty list nor indented sequence items under the key.
 */
function membershipsOf(file: string): { key: [number, number]; items: Map<string, [number, number]> } {
  const page = rowsOf(file)
  const key = rangeOf(page, 'memberships')
  const items = new Map<string, [number, number]>()
  if (key[0] < 0) return { key, items }
  // Memberships occupy indented lines below the key. A one-line key supports only the empty-list form; top-level items are not editable.
  const flat = key[1] - key[0] === 1 && page.bare[key[0]] !== 'memberships: []'
  const indentless = page.bare.slice(key[0] + 1, key[1]).some((row) => row.startsWith('- '))
  if (flat || indentless) throw new Error(`memberships 不是本模块能改的写法:${file}`)
  let at = key[0] + 1
  while (at < key[1]) {
    const head = /^\s*- in: (["']?)([^"'\s]+)\1\s*$/.exec(page.bare[at]!)
    if (!head) throw new Error(`memberships 里有一条不是 - in: 开头:${file} 第 ${at + 1} 行`)
    let to = at + 1
    while (to < key[1] && !page.bare[to]!.startsWith(`${ITEM_INDENT}- `)) to += 1
    items.set(head[2]!, [at, to])
    at = to
  }
  return { key, items }
}

/**
 * Writes `membership` onto the paper page at `file`: replacing the lines of the
 * membership with the same `in` when the page carries one, appending after the
 * last membership when it does not, opening a `memberships` block just above
 * the closing `---` when the page carries none. Every
 * other byte of the page is untouched; the lines written carry the line ending
 * of the line they land on. Throws if the page holds no closed frontmatter, or
 * its `memberships` is written some way this cannot edit line by line.
 */
export function setMembership(file: string, membership: WikiMembershipRecord, staging: string): void {
  const { key, items } = membershipsOf(file)
  const page = rowsOf(file)
  if (key[0] < 0) {
    writeKey(file, 'memberships', [{ in: membership.in, cells: [] }], staging, [])
    // A newly inserted key starts with an empty value; run again to replace it with the real item.
    setMembership(file, membership, staging)
    return
  }
  const held = items.get(membership.in)
  const lines = withCrOf(page.rows[key[0]]!, membershipLines(membership))
  if (held) {
    spliceLines(file, held[0], held[1], lines, staging)
  } else if (items.size === 0) {
    // Replace the `memberships: []` line with the key and first item.
    spliceLines(file, key[0], key[1], [...withCrOf(page.rows[key[0]]!, ['memberships:']), ...lines], staging)
  } else {
    spliceLines(file, key[1], key[1], lines, staging)
  }
}

/**
 * Removes the membership with the given `in` from the paper page at `file`,
 * leaving `memberships: []` when it was the last one. Every other byte of the
 * page is untouched. Throws if the page carries no such membership, or its
 * `memberships` is written some way this cannot edit line by line.
 */
export function removeMembership(file: string, target: string, staging: string): void {
  const { key, items } = membershipsOf(file)
  const held = items.get(target)
  if (!held) throw new Error(`这一页不属于 ${target}:${file}`)
  if (items.size === 1) {
    const page = rowsOf(file)
    spliceLines(file, key[0], key[1], withCrOf(page.rows[key[0]]!, ['memberships: []']), staging)
    return
  }
  spliceLines(file, held[0], held[1], [], staging)
}

/**
 * Appends `line` at the end of the `## section` block of the page at `file`:
 * after its last non-blank line, or right under the heading when the block is
 * empty; a blank line stays between the block and the next heading. Throws if
 * the page has no such heading.
 */
export function appendEntry(file: string, section: string, line: string, staging: string): void {
  const page = rowsOf(file)
  const heading = page.bare.indexOf(`## ${section}`)
  if (heading < 0) throw new Error(`页上没有「${section}」这一节:${file}`)
  let end = heading + 1
  while (end < page.bare.length && !page.bare[end]!.startsWith('## ')) end += 1
  let last = end - 1
  while (last > heading && page.bare[last]!.trim() === '') last -= 1
  spliceLines(file, last + 1, last + 1, withCrOf(page.rows[heading]!, [line]), staging)
}

/** Replaces the `columns` block of the aggregation page at `file`; `[]` when empty. */
export function setColumns(file: string, columns: { key: string; label: string }[], staging: string): void {
  writeKey(file, 'columns', columns.map((c) => ({ key: c.key, label: c.label })), staging, ['split_on', 'updated'])
}

/** Replaces the `parents` block of the aggregation page at `file`; `[]` when empty. */
export function setParents(file: string, parents: string[], staging: string): void {
  writeKey(file, 'parents', parents, staging, ['columns', 'split_on', 'updated'])
}

/** Update user-maintained aggregation name and split basis; id, kind, and derived fields never use this path. */
export function setAggregationMetadata(
  file: string, metadata: { title: string; splitOn: string | null }, staging: string,
): void {
  writeKey(file, 'title', metadata.title, staging, ['aliases', 'parents', 'columns', 'split_on', 'updated'])
  if (metadata.splitOn === null) removeKey(file, 'split_on', staging)
  else writeKey(file, 'split_on', metadata.splitOn, staging, ['updated'])
}

/** Writes `updated` on the page at `file`, replacing only that line. */
export function setUpdated(file: string, date: string, staging: string): void {
  writeKey(file, 'updated', date, staging, [])
}

/**
 * Replaces the body of the page at `file` — every line after the last
 * `<!-- /generated -->`, or after the closing `---` when the page has no
 * generated region — with `body`: one blank line between the last generated
 * region and the body, none after the frontmatter, a line ending after the
 * last line, an empty body leaving nothing. The lines written carry the line
 * ending of the frontmatter's closing line; every other byte is untouched.
 * Throws if the page holds no closed frontmatter.
 */
export function setBody(file: string, body: string, staging: string): void {
  const page = rowsOf(file)
  const last = page.bare.lastIndexOf(GENERATED_CLOSE)
  const from = (last < 0 ? page.close : last) + 1
  const lines = body === '' ? [] : [...(last < 0 ? [] : ['']), ...body.split('\n')]
  spliceLines(file, from, page.rows.length, [...withCrOf(page.rows[page.close]!, lines), ''], staging)
}

/** Frontmatter values that mark a paper page's body as reviewed by whoever applied it. */
const APPLIED_VALIDATION_STATE = 'text_converged'
const APPLIED_TRUST_STATE = 'source_grounded_text'

/**
 * Places `key: value` in an in-memory page, replacing the lines it already occupies or inserting the
 * new line just above `updated` — above the closing `---` when the page carries no `updated` either.
 */
function withScalarKey(
  page: { rows: string[]; bare: string[]; close: number }, key: string, value: string,
): { rows: string[]; bare: string[]; close: number } {
  const [from, to] = rangeOf(page, key)
  const updatedAt = rangeOf(page, 'updated')[0]
  const at = from >= 0 ? from : updatedAt >= 0 ? updatedAt : page.close
  const spliceTo = from < 0 ? at : to
  const line = emitKey(key, value, '')[0]!
  const lines = [page.rows[at]!.endsWith('\r') ? `${line}\r` : line]
  return {
    rows: [...page.rows.slice(0, at), ...lines, ...page.rows.slice(spliceTo)],
    bare: [...page.bare.slice(0, at), line, ...page.bare.slice(spliceTo)],
    close: page.close + lines.length - (spliceTo - at),
  }
}

/**
 * Writes `body` the way setBody does and sets validation_state to "text_converged" and trust_state to
 * "source_grounded_text", inserting each just above `updated` when the page does not carry it yet and
 * replacing it in place when it does — the body and both keys landing in the one write. Every other
 * byte of the page is untouched. Throws if the page holds no closed frontmatter.
 */
export function setBodyAndTrust(file: string, body: string, staging: string): void {
  const trusted = withScalarKey(
    withScalarKey(rowsOf(file), 'validation_state', APPLIED_VALIDATION_STATE), 'trust_state', APPLIED_TRUST_STATE,
  )
  const last = trusted.bare.lastIndexOf(GENERATED_CLOSE)
  const from = (last < 0 ? trusted.close : last) + 1
  const lines = body === '' ? [] : [...(last < 0 ? [] : ['']), ...body.split('\n')]
  const rows = [
    ...trusted.rows.slice(0, from), ...withCrOf(trusted.rows[trusted.close]!, lines), '',
  ]
  replacePage(file, rows.join('\n'), staging)
}

/** Marker line indexes `[open, close]` for a generated region. Throw when the region is absent. */
function generatedRange(bare: string[], name: string, file: string): [number, number] {
  const open = bare.indexOf(GENERATED_OPEN(name))
  const close = bare.indexOf(GENERATED_CLOSE, open + 1)
  if (open < 0 || close < 0) throw new Error(`页上没有 ${name} 的生成区:${file}`)
  return [open, close]
}

/**
 * Replaces what stands between each generated region's markers on the page at
 * `file` with the given markdown, the markers and every other byte untouched.
 * Throws if a region's markers are missing.
 */
export function fillGenerated(file: string, regions: { children: string; table: string }, staging: string): void {
  for (const [name, text] of Object.entries(regions)) {
    const page = rowsOf(file)
    const [open, close] = generatedRange(page.bare, name, file)
    spliceLines(file, open + 1, close, withCrOf(page.rows[open]!, text.split('\n')), staging)
  }
}

/**
 * Throws if the page at `file` lacks either generated region's markers — the
 * page cannot be refilled and should be reported before anything is written.
 */
export function checkGenerated(file: string): void {
  const { bare } = rowsOf(file)
  for (const name of ['children', 'table']) generatedRange(bare, name, file)
}

/**
 * Writes a new aggregation page at `file`: frontmatter from `front` (kind,
 * title, an empty aliases list, parents, columns, split_on when given,
 * updated), the two generated regions empty at the head, then the body — the
 * describing section with its text and one empty heading per appendable
 * section in order. Replaces what is there, staged under `staging` and
 * renamed over the page.
 */
export function createAggregationPage(
  file: string,
  front: { kind: string; title: string; parents: string[]; columns: { key: string; label: string }[]; splitOn: string | undefined; updated: string },
  describe: { section: string; text: string },
  sections: string[],
  staging: string,
): void {
  const keys: [string, Json][] = [
    ['kind', front.kind], ['title', front.title], ['aliases', []], ['parents', front.parents],
    ['columns', front.columns.map((c) => ({ key: c.key, label: c.label }))],
    ...(front.splitOn === undefined ? [] : [['split_on', front.splitOn] as [string, Json]]),
    ['updated', front.updated],
  ]
  replacePage(file, [
    '---', ...keys.flatMap(([k, v]) => emitKey(k, v, '')), '---',
    GENERATED_OPEN('children'), GENERATED_CLOSE,
    GENERATED_OPEN('table'), GENERATED_CLOSE, '',
    `## ${describe.section}`, describe.text, '',
    ...sections.flatMap((s) => [`## ${s}`, '']),
  ].join('\n'), staging)
}
