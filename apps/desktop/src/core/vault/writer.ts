import {
  closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** Create the file's parent directory when absent. */
function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true })
}

/** Maximum rename attempts; wait this base duration multiplied by attempt number before attempt n. */
const RENAME_TRIES = 5
const RENAME_BACKOFF_MS = 20

/**
 * Renames the file at `staged` over the file at `file`, retrying while Windows
 * refuses with EPERM because another program holds the page open — the vault is
 * an Obsidian vault and Obsidian keeps scanning it, so being refused once is
 * ordinary rather than exceptional. Waits longer before each retry and gives up
 * after RENAME_TRIES of them. Throws if it is refused that many times, or
 * refused for any other reason; the page is untouched either way.
 */
function renameOver(staged: string, file: string): void {
  for (let tried = 1; ; tried += 1) {
    try {
      renameSync(staged, file)
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EPERM') throw err
      if (tried === RENAME_TRIES) {
        throw new Error(`别的程序开着这一页,试了 ${RENAME_TRIES} 次都没能换上去:${file}`, {
          cause: err,
        })
      }
      // Writes are synchronous and cannot yield, so wait in place long enough for the other process to release the file.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_BACKOFF_MS * tried)
    }
  }
}

/**
 * Replaces the whole of the file at `file` with `text`, building the
 * directories above it: written under `staging`, flushed, and renamed over the
 * file, the way spliceLines has it, so a run cut short leaves the file as it
 * stood. Throws if another program holds the page open through every retry.
 */
export function replacePage(file: string, text: string, staging: string): void {
  ensureDir(file)
  mkdirSync(staging, { recursive: true })
  const staged = join(staging, `${basename(file)}.tmp`)
  const handle = openSync(staged, 'w')
  try {
    writeFileSync(handle, text, 'utf8')
    // Rename is atomic, but pre-rename bytes may remain only in page cache; power loss could otherwise install an empty or partial file.
    fsyncSync(handle)
  } finally {
    closeSync(handle)
  }
  renameOver(staged, file)
}

/**
 * Replaces the lines of the file at `file` from `from` up to but not including
 * `to` with the given lines, leaving every other byte of the file untouched.
 * Line numbers count from zero over the file split on newlines, so a line's own
 * carriage return belongs to it and survives with it. The result is written
 * under `staging`, flushed to disk, and renamed over the file, so a run cut
 * short — the process killed, or the machine losing power — leaves the file as
 * it stood rather than half rewritten. `staging` is created if it is not there
 * and has to sit on the same volume as the file, which is what makes the rename
 * atomic; anything it holds afterwards is a write that did not finish. Throws
 * if another program holds the page open through every retry renameOver makes.
 */
export function spliceLines(
  file: string, from: number, to: number, lines: string[], staging: string,
): void {
  const rows = readFileSync(file, 'utf8').split('\n')
  replacePage(file, [...rows.slice(0, from), ...lines, ...rows.slice(to)].join('\n'), staging)
}

/**
 * Writes a page, building the directories above it and replacing what is
 * there, through the same staged write as replacePage. Throws if another
 * program holds the page open through every retry.
 */
export function writePage(file: string, text: string, staging: string): void {
  replacePage(file, text, staging)
}

/**
 * Writes a value as indented JSON with a closing newline, building the
 * directories above the file and replacing what is there, through the same
 * staged write as replacePage. Throws if another program holds the page open
 * through every retry.
 */
export function writeJson(file: string, value: unknown, staging: string): void {
  replacePage(file, `${JSON.stringify(value, null, 2)}\n`, staging)
}

/**
 * Writes a new immutable binary source without ever replacing an existing
 * destination. Bytes are flushed under staging first, then linked into place;
 * a crash leaves either no source or the complete source, and a repeated name
 * throws instead of overwriting raw evidence.
 */
export function writeImmutable(file: string, bytes: Uint8Array, staging: string): void {
  ensureDir(file)
  mkdirSync(staging, { recursive: true })
  const staged = join(staging, `${basename(file)}.source.tmp`)
  rmSync(staged, { force: true })
  const handle = openSync(staged, 'wx')
  try {
    writeFileSync(handle, bytes)
    fsyncSync(handle)
  } finally {
    closeSync(handle)
  }
  try {
    linkSync(staged, file)
  } finally {
    rmSync(staged, { force: true })
  }
}

/** Moves a page, building the directories above its destination. */
export function movePage(file: string, to: string): void {
  ensureDir(to)
  renameSync(file, to)
}

/** Removes a page. Throws if the page is not there. */
export function removePage(file: string): void {
  rmSync(file)
}
