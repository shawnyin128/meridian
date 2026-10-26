import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openChatModels } from '../../apps/desktop/src/core/harness/chat-models.ts'
import { openCliChatSessions } from '../../apps/desktop/src/core/harness/cli/chat-sessions.ts'
import { createHarnessModelConfig } from '../../apps/desktop/src/core/harness/model-config.ts'
import { relocate } from './relocate.mjs'

let home = ''
afterEach(() => rmSync(home, { recursive: true, force: true }))

/**
 * Writes a test library seeded at `root` with every file a seed stores an absolute path in, each in
 * the shape the seed writes it, a config home listing the library, and Chromium's state naming
 * `root` in user-data, in a text log and in a binary store.
 */
const seeded = (root) => {
  const files = {
    '.meridian-test-library.json': JSON.stringify({ root, app: '/Applications/Meridian.app', today: '2026-10-16' }, null, 2),
    'config/paper-wiki-workspaces.json': JSON.stringify({ active_library_root: `${root}/library`, workspaces: [{ library_root: `${root}/library` }] }),
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
    'user-data/Local Storage/leveldb/000003.log': Buffer.concat([Buffer.from([0xff, 0xfe, 0x00]), Buffer.from(root)]),
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
  it('论文库、配置、工作区和标记文件改写成副本的路径，user-data 原样保留', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    const from = join(home, 'v0.0.15.4')
    const out = join(home, 'copy')
    seeded(from)
    cpSync(from, out, { recursive: true })
    relocate(out, from)
    expect(naming(out, from)).toEqual(['user-data/Local Storage/leveldb/000003.log', 'user-data/Local Storage/leveldb/LOG'])
    expect(naming(out, out)).toEqual([
      '.meridian-test-library.json', 'config/paper-wiki-workspaces.json', 'library/.meridian/changelog.json',
      'library/.meridian/trash.json', 'library/meridian-wiki.json', 'library/wiki/projects/project-47.md',
      'workspaces/spec-decoding/.meridian/graph/graph-health.json',
    ])
    const health = JSON.parse(readFileSync(join(out, 'workspaces', 'spec-decoding', '.meridian', 'graph', 'graph-health.json'), 'utf8'))
    expect(health.lab_root).toBe(join(out, 'workspaces', 'spec-decoding', '.meridian'))
    for (const name of ['LOG', '000003.log']) {
      const path = ['user-data', 'Local Storage', 'leveldb', name]
      expect(readFileSync(join(out, ...path))).toEqual(readFileSync(join(from, ...path)))
    }
  })

  it('改写范围里不是 UTF-8 文本的文件写着原库路径时报错，不改写这个文件', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    const from = join(home, 'v0.0.15.4')
    const out = join(home, 'copy')
    seeded(from)
    const binary = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00]), Buffer.from(from)])
    writeFileSync(join(from, 'library', '.meridian', 'snapshot.bin'), binary)
    cpSync(from, out, { recursive: true })
    expect(() => relocate(out, from)).toThrow(/snapshot\.bin: it names .+ but is not UTF-8 text/)
    expect(readFileSync(join(out, 'library', '.meridian', 'snapshot.bin'))).toEqual(binary)
  })
  /** A credential store for model lists that hold no key. */
  const noKeys = { seal: async () => { throw new Error('no key is sealed') }, open: async () => { throw new Error('no key is opened') } }
  const SESSION = '0b1f6a9e-3c2d-4e5f-8a7b-9c0d1e2f3a4b'
  /** The models the Claude subscription offers, as Claude Code's status lists them. */
  const claudeList = async (source) => ({
    source, models: ['opus', '', 'sonnet'].map((id) => ({ id, efforts: { levels: ['low', 'medium', 'high', 'xhigh', 'max'] } })),
  })

  it('副本里每个聊天自己选的模型和它的 CLI 会话也改到副本：Core 读到的还是种下的选择和会话，会话的工作目录跟着搬过去', async () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    const from = join(home, 'v0.0.21.1')
    const out = join(home, 'copy')
    const cliHome = join(home, 'cli-home')
    seeded(from)
    const models = await createHarnessModelConfig(join(from, 'config'), noKeys)
    await models.addModel({ source: { kind: 'cli', cli: 'claude' }, model: 'opus', effort: 'high' })
    await openChatModels({ file: join(from, 'user-data', 'chat-models', 'choices.json'), vault: join(from, 'library'), models, offers: claudeList })
      .set('chat-156', 'cli:claude', 'sonnet', 'max')
    const sessions = openCliChatSessions({ root: join(from, 'user-data', 'cli-chats'), vault: join(from, 'library'), home: cliHome })
    const before = sessions.folder('chat-156')
    writeFileSync(join(before, 'turn.txt'), 'the CLI ran here')
    sessions.keep('chat-156', { cli: 'claude', id: SESSION, history: 'two turns' })
    mkdirSync(join(cliHome, '.claude', 'projects', 'chat'), { recursive: true })
    writeFileSync(join(cliHome, '.claude', 'projects', 'chat', `${SESSION}.jsonl`), '{}\n')
    cpSync(from, out, { recursive: true })

    const reported = []
    relocate(out, from, (line) => reported.push(line))
    const copied = openChatModels({
      file: join(out, 'user-data', 'chat-models', 'choices.json'), vault: join(out, 'library'),
      models: await createHarnessModelConfig(join(out, 'config'), noKeys), offers: claudeList,
    })
    const moved = openCliChatSessions({ root: join(out, 'user-data', 'cli-chats'), vault: join(out, 'library'), home: cliHome })
    expect(copied.shown('chat-156')).toEqual({ source: 'cli:claude', model: 'sonnet', effort: 'max' })
    expect(moved.resumable('chat-156', { source: 'cli', cli: 'claude' }, 'two turns')).toEqual({ cli: 'claude', id: SESSION, history: 'two turns' })
    expect(readFileSync(join(moved.folder('chat-156'), 'turn.txt'), 'utf8')).toBe('the CLI ran here')
    expect(existsSync(join(out, 'user-data', 'cli-chats', basename(before)))).toBe(false)
    expect([naming(join(out, 'user-data'), from), reported]).toEqual([
      ['Local Storage/leveldb/000003.log', 'Local Storage/leveldb/LOG'], [],
    ])
  })

  it('用户数据里读不出的记录和文件原样留着并报出来，不让整个改写失败；别的库的记录不动', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    const from = join(home, 'v0.0.21.1')
    const out = join(home, 'copy')
    seeded(from)
    const unreadable = { chat: 'chat-9', model: 'gone' }
    const elsewhere = { vault: '/libraries/research', chat: 'chat-3', model: 'opus' }
    mkdirSync(join(from, 'user-data', 'chat-models'), { recursive: true })
    writeFileSync(join(from, 'user-data', 'chat-models', 'choices.json'), JSON.stringify({
      chats: [unreadable, elsewhere, { vault: join(from, 'library'), chat: 'chat-156', model: 'sonnet', effort: 'max', note: 'kept' }],
    }))
    mkdirSync(join(from, 'user-data', 'cli-chats'), { recursive: true })
    writeFileSync(join(from, 'user-data', 'cli-chats', 'sessions.json'), '{"chats": [')
    cpSync(from, out, { recursive: true })

    const reported = []
    relocate(out, from, (line) => reported.push(line))
    expect(JSON.parse(readFileSync(join(out, 'user-data', 'chat-models', 'choices.json'), 'utf8')).chats).toEqual([
      unreadable, elsewhere, { vault: join(out, 'library'), chat: 'chat-156', model: 'sonnet', effort: 'max', note: 'kept' },
    ])
    expect(readFileSync(join(out, 'user-data', 'cli-chats', 'sessions.json'), 'utf8')).toBe('{"chats": [')
    expect(reported).toEqual([
      `${join(out, 'user-data', 'chat-models', 'choices.json')}: 1 chat records cannot be read and stay as they are`,
      `${join(out, 'user-data', 'cli-chats', 'sessions.json')} cannot be read; it stays as it is`,
    ])
    expect(JSON.parse(readFileSync(join(out, 'library', 'meridian-wiki.json'), 'utf8')).library_root).toBe(join(out, 'library'))
  })
})
