import { existsSync, readFileSync } from 'node:fs'
import type { z } from 'zod'

/** One step from a record down to a nested object: a key, a list position, or the list element carrying this `id`. */
type Step = PropertyKey | { id: string }

/** A field of a stored record this version does not know, with where it sat, so a rewrite can put it back. */
export type UnknownField = { at: Step[]; key: string; value: unknown }

/** A stored record as this version reads it: its value and the fields left out of it, or why it cannot be read. */
export type ReadRecord<T> = { value: T; unknown: UnknownField[] } | { error: string }

/**
 * Reads `raw` with `schema`. When every failure is a key `schema` does not know, at any depth, reads
 * `raw` without those keys and returns them as `unknown`; one inside a list element that carries a
 * string `id` is located by that id rather than by position. Returns the reason as `error` when
 * `raw` cannot be read even without them.
 */
export function readRecord<T>(schema: z.ZodType<T>, raw: unknown): ReadRecord<T> {
  const whole = schema.safeParse(raw)
  if (whole.success) return { value: whole.data, unknown: [] }
  const bare = structuredClone(raw)
  const unknown: UnknownField[] = []
  for (const issue of whole.error.issues) {
    if (issue.code !== 'unrecognized_keys') return { error: whole.error.message }
    let node = bare as Record<PropertyKey, unknown>
    const at: Step[] = []
    for (const step of issue.path) {
      const next = node[step] as Record<PropertyKey, unknown>
      at.push(Array.isArray(node) && typeof next['id'] === 'string' ? { id: next['id'] } : step)
      node = next
    }
    for (const key of issue.keys) {
      unknown.push({ at, key, value: node[key] })
      delete node[key]
    }
  }
  const read = schema.safeParse(bare)
  return read.success ? { value: read.data, unknown } : { error: whole.error.message }
}

/**
 * Reads the JSON file `file` with `schema` the way readRecord does, or returns null when there is no
 * such file. A file that is not JSON, or that cannot be read even without the keys `schema` does not
 * know, is reported on stderr with the reason and also returns null, so its reader treats it as absent.
 */
export function readStoredFile<T>(file: string, schema: z.ZodType<T>): { value: T; unknown: UnknownField[] } | null {
  if (!existsSync(file)) return null
  let read: ReadRecord<T>
  try {
    read = readRecord(schema, JSON.parse(readFileSync(file, 'utf8')))
  } catch (error) {
    read = { error: error instanceof Error ? error.message : String(error) }
  }
  if ('error' in read) {
    console.error(`[config] ${file} cannot be read by this version and is treated as absent (the App may need an update): ${read.error}`)
    return null
  }
  return read
}

/**
 * Returns a copy of `value` with each of `fields` put back where it was read, or `value` itself when
 * there are none. A field whose object `value` no longer holds, or whose key that object now has, is
 * left out.
 */
export function withUnknownFields(value: unknown, fields: readonly UnknownField[]): unknown {
  if (fields.length === 0) return value
  const out = structuredClone(value)
  for (const field of fields) {
    let node: unknown = out
    for (const step of field.at) {
      node = typeof step !== 'object'
        ? (node as Record<PropertyKey, unknown> | null | undefined)?.[step]
        : Array.isArray(node) ? node.find((item: { id?: unknown } | null) => item?.id === step.id) : undefined
    }
    if (typeof node === 'object' && node !== null && !Array.isArray(node) && !Object.hasOwn(node, field.key)) {
      (node as Record<string, unknown>)[field.key] = field.value
    }
  }
  return out
}

/** A stored list as this version reads it. */
export type StoredList<T> = {
  /** Every record this version can read, without the fields it does not know. */
  rows: T[]
  /** Every record it cannot read, exactly as written. */
  unreadable: unknown[]
  /** The list to store for `rows`: each with its unknown fields put back, then every unreadable record. */
  stored: (rows: readonly unknown[]) => unknown[]
}

/**
 * Reads the list `raw` stored in `file` record by record with `schema`, reporting on stderr the
 * position and reason of each record it cannot read. Records are told apart by the value of their
 * `key` field, so a record's unknown fields stay with it when an edit replaces or moves it. Throws
 * if `raw` is not a list.
 */
export function readStoredList<T>(file: string, raw: unknown, schema: z.ZodType<T>, key: string): StoredList<T> {
  if (!Array.isArray(raw)) throw new Error(`${file} 存的不是列表`)
  const rows: T[] = []
  const unreadable: unknown[] = []
  const unknown = new Map<unknown, UnknownField[]>()
  const keyOf = (row: unknown): unknown => (row as Record<string, unknown>)[key]
  raw.forEach((row: unknown, index) => {
    const read = readRecord(schema, row)
    if ('error' in read) {
      unreadable.push(row)
      console.error(`[vault] ${file}: record ${index + 1} cannot be read by this version and is kept as it is (the App may need an update): ${read.error}`)
      return
    }
    rows.push(read.value)
    if (read.unknown.length > 0) unknown.set(keyOf(read.value), read.unknown)
  })
  return {
    rows,
    unreadable,
    stored: (next) => [...next.map((row) => withUnknownFields(row, unknown.get(keyOf(row)) ?? [])), ...unreadable],
  }
}
