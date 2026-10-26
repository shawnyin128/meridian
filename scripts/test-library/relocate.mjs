import { isUtf8 } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { MARKER } from './safety.mjs'

/** The stores in a test library's own user-data folder whose records name its library by path. */
const CHOICES = join('chat-models', 'choices.json')
const SESSIONS = join('cli-chats', 'sessions.json')

/** The working folder of chat `chat` of the library at `vault` under cli-chats, as Core's `folderName` names it. */
const chatFolder = (vault, chat) => createHash('sha256').update(`${vault}\0${chat}`).digest('hex').slice(0, 32)

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Points the records of the user-data store `store` of the test library in `out` that name a library
 * under `from` at the same library under `out`, as Core reads them: the file is `{ chats: [...] }`,
 * and a record without a `vault` and a `chat` is left as it is and reported to `report`, as is a file
 * that cannot be read. A chat moved in the CLI sessions store takes its working folder along.
 */
function relocateStore(out, from, store, report) {
  const file = join(out, 'user-data', store)
  if (!existsSync(file)) return
  let value
  try {
    value = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    value = undefined
  }
  if (!isRecord(value) || !Array.isArray(value.chats)) {
    report(`${file} cannot be read; it stays as it is`)
    return
  }
  const moved = (path) => (path === from ? out : path.startsWith(`${from}${sep}`) ? `${out}${path.slice(from.length)}` : null)
  let unreadable = 0
  let changed = false
  const chats = value.chats.map((record) => {
    if (!isRecord(record) || typeof record.vault !== 'string' || record.vault === ''
      || typeof record.chat !== 'string' || record.chat === '') {
      unreadable += 1
      return record
    }
    const vault = moved(record.vault)
    if (vault === null) return record
    if (store === SESSIONS) {
      const root = join(out, 'user-data', 'cli-chats')
      const [before, after] = [join(root, chatFolder(record.vault, record.chat)), join(root, chatFolder(vault, record.chat))]
      if (existsSync(after)) report(`${after} already exists; chat ${record.chat} keeps its folder at ${before}`)
      else if (existsSync(before)) renameSync(before, after)
    }
    changed = true
    return { ...record, vault }
  })
  if (unreadable > 0) report(`${file}: ${unreadable} chat records cannot be read and stay as they are`)
  if (changed) writeFileSync(file, `${JSON.stringify({ ...value, chats }, null, 2)}\n`, 'utf8')
}

/**
 * Rewrites the absolute paths that a test library seeded at `from` stores, now that it lives at
 * `out`: every file in its library, config and workspaces folders and the MARKER that names
 * `from`, as is or JSON-escaped, names `out` instead, and so do the records of the chats' model
 * choices and CLI sessions in its own user-data folder (see `relocateStore`). Chromium's own state
 * in user-data is left as it is. Throws when a file to rewrite is not UTF-8 text; a user-data record
 * that cannot be read goes to `report` instead.
 */
export function relocate(out, from, report = (line) => console.error(line)) {
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
  for (const store of [CHOICES, SESSIONS]) relocateStore(out, from, store, report)
}
