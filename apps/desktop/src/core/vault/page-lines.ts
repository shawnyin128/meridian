import { readFileSync } from 'node:fs'
import type { Json } from './frontmatter.js'
import { emitKey } from './frontmatter.js'
import { spliceLines } from './writer.js'

/** Page lines, the same lines without trailing CR, and the closing frontmatter delimiter index. */
type Rows = { rows: string[]; bare: string[]; close: number }

/** Current page lines. Throw when the page has no closing frontmatter delimiter. */
export function rowsOf(file: string): Rows {
  const rows = readFileSync(file, 'utf8').split('\n')
  const bare = rows.map((row) => (row.endsWith('\r') ? row.slice(0, -1) : row))
  const close = bare.indexOf('---', 1)
  if (bare[0] !== '---' || close < 0) throw new Error(`页面没有收口的 frontmatter:${file}`)
  return { rows, bare, close }
}

/**
 * Frontmatter line range `[from, to)` occupied by a key, or -1/-1 when absent. Sequence and block
 * values indented under the key belong to it. When no inline value follows the key, top-level `- `
 * sequence items also belong to that key.
 */
export function rangeOf({ bare, close }: Rows, key: string): [number, number] {
  const from = bare.findIndex((row, i) => i > 0 && i < close && row.startsWith(`${key}:`))
  if (from < 0) return [-1, -1]
  // A top-level `- ` can only be an unindented sequence item of the preceding key; a top-level key cannot start that way.
  const keyOnly = bare[from]!.trimEnd() === `${key}:`
  let to = from + 1
  while (to < close && (bare[to]!.startsWith(' ') || (keyOnly && bare[to]!.startsWith('- ')))) to += 1
  return [from, to]
}

/**
 * Writes `value` under `key` in the frontmatter of the page at `file`,
 * replacing only the lines that key occupies and leaving every other byte of
 * the page untouched; the lines written carry the line ending of the line they
 * land on. A key the page does not carry is inserted just above the first of
 * `anchors` the page does carry, or, when it carries none, just above the
 * closing `---`. Throws if the page holds no closed frontmatter.
 */
export function writeKey(file: string, key: string, value: Json, staging: string, anchors: string[]): void {
  const page = rowsOf(file)
  const [from, to] = rangeOf(page, key)
  const at = from >= 0 ? from
    : anchors.map((anchor) => rangeOf(page, anchor)[0]).find((row) => row >= 0) ?? page.close
  const lines = emitKey(key, value, '')
    .map((row) => (page.rows[at]!.endsWith('\r') ? `${row}\r` : row))
  spliceLines(file, at, from < 0 ? at : to, lines, staging)
}

/**
 * Removes `key` and the lines under it from the frontmatter of the page at
 * `file`, leaving every other byte of the page untouched. A key the page does
 * not carry leaves the page as it stands. Throws if the page holds no closed
 * frontmatter.
 */
export function removeKey(file: string, key: string, staging: string): void {
  const [from, to] = rangeOf(rowsOf(file), key)
  if (from < 0) return
  spliceLines(file, from, to, [], staging)
}
