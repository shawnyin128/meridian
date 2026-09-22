/** Values representable in frontmatter. */
export type Json = string | number | boolean | Json[] | { [key: string]: Json }

/** Empty-list representation used consistently across vault pages. */
const EMPTY_LIST = '[]'

/** A `key: value` line. An empty second group after `key:` means its value is the indented block below. */
const PAIR = /^ *([\w-]+):(?: (.*))?$/

/** Number of indentation characters on one line. */
const indentOf = (row: string): number => row.length - row.trimStart().length

/** Frontmatter representation of a scalar: quote and escape strings; leave numbers and booleans bare. */
const emitScalar = (value: string | number | boolean): string =>
  (typeof value === 'string' ? JSON.stringify(value) : String(value))

/** Read a scalar from its frontmatter representation. */
const readScalar = (token: string): Json => {
  if (token.startsWith('"')) return JSON.parse(token) as string
  if (token === 'true') return true
  if (token === 'false') return false
  return Number(token)
}

/**
 * Returns the lines one frontmatter key takes on a page, indented from
 * `indent`, in the shape the rest of the vault writes: quoted scalars, an
 * empty list on the key's own line, and a block indented two spaces under the
 * key for everything else.
 */
export function emitKey(key: string, value: Json, indent: string): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}${key}: ${EMPTY_LIST}`]
    return [`${indent}${key}:`, ...value.flatMap((item) => emitItem(item, `${indent}  `))]
  }
  if (typeof value === 'object') {
    return [
      `${indent}${key}:`,
      ...Object.entries(value).flatMap(([k, v]) => emitKey(k, v, `${indent}  `)),
    ]
  }
  return [`${indent}${key}: ${emitScalar(value)}`]
}

/** Lines occupied by one sequence item: the first starts with `- ` and the rest align to its first key. */
export function emitItem(value: Json, indent: string): string[] {
  if (typeof value !== 'object') return [`${indent}- ${emitScalar(value)}`]
  const rows = Object.entries(value).flatMap(([k, v]) => emitKey(k, v, `${indent}  `))
  return [`${indent}- ${rows[0]!.slice(indent.length + 2)}`, ...rows.slice(1)]
}

/** Replace each leading `- ` with equal-width indentation and record those line numbers as item starts. */
function normalize(rows: string[]): { rows: string[]; items: Set<number> } {
  const items = new Set<number>()
  const flattened = rows.map((row, i) => {
    const dash = /^( *)- (.*)$/.exec(row)
    if (!dash) return row
    items.add(i)
    return `${dash[1]}  ${dash[2]}`
  })
  return { rows: flattened, items }
}

/**
 * Read a mapping at indentation `indent` starting from `from`, returning its value and the first line
 * after the block. Throw when a key requires a nested block but none exists.
 */
function readMapping(
  rows: string[], items: Set<number>, from: number, indent: number,
): [Record<string, Json>, number] {
  const out: Record<string, Json> = {}
  let i = from
  while (i < rows.length) {
    const row = rows[i]!
    if (row.trim() === '' || indentOf(row) !== indent) break
    if (i > from && items.has(i)) break
    const pair = PAIR.exec(row)
    if (!pair) break
    const key = pair[1]!
    const token = pair[2]
    if (token !== undefined) {
      out[key] = token === EMPTY_LIST ? [] : readScalar(token)
      i += 1
      continue
    }
    // Sequence `- ` prefixes were replaced with equal-width indentation, so items are one level deeper than mapping keys.
    const block = i + 1
    const inner = indent + (items.has(block) ? 4 : 2)
    if (block >= rows.length || indentOf(rows[block]!) !== inner) {
      throw new Error(`frontmatter 的 ${key} 下面没有块`)
    }
    const [value, after] = items.has(block)
      ? readSequence(rows, items, block, inner)
      : readMapping(rows, items, block, inner)
    out[key] = value
    i = after
  }
  return [out, i]
}

/** Read a sequence at indentation `indent` from `from`, returning its value and the next line number. */
function readSequence(
  rows: string[], items: Set<number>, from: number, indent: number,
): [Json[], number] {
  const out: Json[] = []
  let i = from
  while (i < rows.length && items.has(i) && indentOf(rows[i]!) === indent) {
    if (!PAIR.test(rows[i]!)) {
      out.push(readScalar(rows[i]!.trim()))
      i += 1
      continue
    }
    const [value, after] = readMapping(rows, items, i, indent)
    out.push(value)
    i = after
  }
  return [out, i]
}

/**
 * Reads the given frontmatter lines as a tree. Understands what emitKey writes
 * and nothing wider: quoted scalars, bare numbers and booleans, and a block
 * indented under its key holding either a mapping or a `- ` sequence. Throws if
 * a key opens a block the lines do not hold.
 */
export function readFrontmatter(rows: string[]): Record<string, Json> {
  const flattened = normalize(rows)
  return readMapping(flattened.rows, flattened.items, 0, 0)[0]
}
