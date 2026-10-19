import { isUtf8 } from 'node:buffer'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKER } from './safety.mjs'

/**
 * Rewrites the absolute paths that a test library seeded at `from` stores, now that it lives at
 * `out`: every file in its library, config and workspaces folders and the MARKER that names
 * `from`, as is or JSON-escaped, names `out` instead. Chromium's own state in user-data is left as
 * it is. Throws when a file to rewrite is not UTF-8 text.
 */
export function relocate(out, from) {
  const forms = new Map([[from, out], [JSON.stringify(from).slice(1, -1), JSON.stringify(out).slice(1, -1)]])
  const files = [join(out, MARKER), ...['library', 'config', 'workspaces'].flatMap((folder) =>
    readdirSync(join(out, folder), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name)))]
  for (const file of files) {
    const bytes = readFileSync(file)
    if (![...forms.keys()].some((old) => bytes.includes(old))) continue
    if (!isUtf8(bytes)) throw new Error(`Cannot relocate ${file}: it names ${from} but is not UTF-8 text`)
    let text = bytes.toString('utf8')
    for (const [old, next] of forms) text = text.replaceAll(old, next)
    writeFileSync(file, text, 'utf8')
  }
}
