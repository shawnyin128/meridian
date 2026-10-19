import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { relocate } from './relocate.mjs'

let home = ''
afterEach(() => rmSync(home, { recursive: true, force: true }))

/**
 * Writes a test library seeded at `root` with every file a seed stores an absolute path in, each in
 * the shape the seed writes it.
 */
const seeded = (root) => {
  const files = {
    '.meridian-test-library.json': JSON.stringify({ root, app: '/Applications/Meridian.app', today: '2026-10-16' }, null, 2),
    'library/meridian-wiki.json': JSON.stringify({
      schema_version: 'meridian.paper_wiki_workspace.v1', library_root: `${root}/library`, wiki_root: `${root}/library/wiki`,
    }, null, 2),
    'library/wiki/projects/project-47.md': `---\nid: project-47\nattachments:\n  - id: att-79\n    path: "${root}/files/宽度扫描结果.csv"\n`
      + `workspace_root: "${root}/workspaces/spec-decoding"\n---\n`,
    'library/.meridian/trash.json': JSON.stringify([{ id: 'trash-33', kind: 'attachment', attachment: { path: `${root}/files/notes.md` } }]),
    'library/.meridian/changelog.json': JSON.stringify([{ id: 'change-1', before: { attachments: [{ path: `${root}/files/宽度扫描结果.csv` }] } }]),
    'workspaces/spec-decoding/.meridian/graph/graph-health.json': JSON.stringify({
      schema: 'meridian.lab.graph_health.v1', status: 'pass', lab_root: `${root}/workspaces/spec-decoding/.meridian`, findings: [],
    }, null, 2),
    'user-data/Local Storage/leveldb/LOG': `2026/10/16-17:16:21.663 29dd2a Reusing MANIFEST ${root}/user-data/Local Storage/leveldb/MANIFEST-000001\n`,
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

/** The files under `root` whose bytes contain `text`, as paths relative to `root`. */
const naming = (root, text) => readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && readFileSync(join(entry.parentPath, entry.name)).includes(text))
  .map((entry) => relative(root, join(entry.parentPath, entry.name)))
  .sort()

describe('测试库副本的路径改写', () => {
  it('改写后副本里找不到原库的路径，原来写着原库路径的文件都改写成副本的路径', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    const from = join(home, 'v0.0.15.4')
    const out = join(home, 'copy')
    seeded(from)
    cpSync(from, out, { recursive: true })
    relocate(out, from)
    expect(naming(out, from)).toEqual([])
    expect(naming(out, out)).toEqual(naming(from, from))
  })

  it('原库路径出现在不是 UTF-8 文本的文件里时报错，不改写这个文件', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    const from = join(home, 'v0.0.15.4')
    const out = join(home, 'copy')
    seeded(from)
    const binary = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00]), Buffer.from(from)])
    writeFileSync(join(from, 'user-data', 'Local Storage', 'leveldb', '000003.log'), binary)
    cpSync(from, out, { recursive: true })
    expect(() => relocate(out, from)).toThrow(/000003\.log: it names .+ but is not UTF-8 text/)
    expect(readFileSync(join(out, 'user-data', 'Local Storage', 'leveldb', '000003.log'))).toEqual(binary)
  })
})
