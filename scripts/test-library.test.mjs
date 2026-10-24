import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const CLI = resolve(import.meta.dirname, 'test-library.mjs')

let home = ''
afterEach(() => rmSync(home, { recursive: true, force: true }))

/** Writes a test library seeded at `root`: its marker, and a library and config home that name `root`. */
const seeded = (root) => {
  const files = {
    '.meridian-test-library.json': JSON.stringify({ root, app: '/Applications/Meridian.app', today: '2026-10-24' }, null, 2),
    'config/paper-wiki-workspaces.json': JSON.stringify({ active_library_root: `${root}/library` }),
    'library/meridian-wiki.json': JSON.stringify({ library_root: `${root}/library`, wiki_root: `${root}/library/wiki` }),
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  mkdirSync(join(root, 'workspaces'))
}

/**
 * Runs the command line with `args`, with `home` as the home folder, so its safety check reads no
 * real ~/.meridian. `--app` names nothing, so any attempt to start an App fails.
 */
const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--app', join(home, 'no-app')], {
  encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
})

describe('挪了地方的测试库副本', () => {
  it('relocate 把副本存的路径改成副本自己的,不需要也不启动任何 App', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-cli-'))
    const from = join(home, 'v0.0.18.0')
    const out = join(home, 'copy')
    seeded(from)
    cpSync(from, out, { recursive: true })

    const relocated = run('relocate', '--out', out)

    expect(relocated.stderr).toBe('')
    expect(relocated.status).toBe(0)
    expect(JSON.parse(readFileSync(join(out, '.meridian-test-library.json'), 'utf8')).root).toBe(out)
    expect(JSON.parse(readFileSync(join(out, 'config', 'paper-wiki-workspaces.json'), 'utf8')).active_library_root)
      .toBe(`${out}/library`)
    expect(readFileSync(join(out, 'library', 'meridian-wiki.json'), 'utf8')).not.toContain(from)
  })

  it('relocate 只认这个工具建的测试库', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-cli-'))
    const out = join(home, 'not-a-library')
    mkdirSync(out)
    writeFileSync(join(out, 'notes.txt'), 'kept')

    const refused = run('relocate', '--out', out)

    expect(refused.status).not.toBe(0)
    expect(refused.stderr).toMatch(/no test library was seeded there/)
  })

  it('open 要先找到 App,找不到就报错,副本原样不动', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-cli-'))
    const from = join(home, 'v0.0.18.0')
    const out = join(home, 'copy')
    seeded(from)
    cpSync(from, out, { recursive: true })

    const opened = run('open', '--out', out)

    expect(opened.status).not.toBe(0)
    expect(opened.stderr).toMatch(/No App at/)
    expect(JSON.parse(readFileSync(join(out, '.meridian-test-library.json'), 'utf8')).root).toBe(from)
  })
})
