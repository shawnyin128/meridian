import { isUtf8 } from 'node:buffer'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Rewrites the absolute paths that a test library seeded at `from` stores, now that it lives at
 * `out`: every file under `out` that names `from`, as is or JSON-escaped, names `out` instead.
 * Throws when such a file is not UTF-8 text.
 */
export function relocate(out, from) {
  const forms = new Map([[from, out], [JSON.stringify(from).slice(1, -1), JSON.stringify(out).slice(1, -1)]])
  for (const entry of readdirSync(out, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = join(entry.parentPath, entry.name)
    const bytes = readFileSync(file)
    if (![...forms.keys()].some((old) => bytes.includes(old))) continue
    if (!isUtf8(bytes)) throw new Error(`Cannot relocate ${file}: it names ${from} but is not UTF-8 text`)
    let text = bytes.toString('utf8')
    for (const [old, next] of forms) text = text.replaceAll(old, next)
    writeFileSync(file, text, 'utf8')
  }
}
