import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault the store opens. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

const PROPOSAL = { name: 'proposal.md', size: '14 KB', path: '/research/proposal.md' }
const SKETCH = { name: 'sketch.pdf', size: '1.2 MB', path: '/research/sketch.pdf' }

describe('idea files', () => {
  let vault: string
  let store: VaultStore
  let day = '2026-10-27'
  const open = () => createVaultStore(vault, () => day)
  const stored = (name: string) => JSON.parse(readFileSync(join(vault, '.meridian', `${name}.json`), 'utf8')) as Record<string, unknown>[]

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-idea-files-'))
    cpSync(VAULT, vault, { recursive: true })
    day = '2026-10-27'
    store = open()
  })

  afterEach(() => { rmSync(vault, { recursive: true, force: true }) })

  it('keeps a file added to an idea in its own list, newest first, and leaves the idea record as it was', () => {
    const idea = store.createIdea(undefined, '熵正则路由', '用熵正则代替负载均衡 loss')
    const ideasBefore = readFileSync(join(vault, '.meridian/ideas.json'), 'utf8')
    const first = store.addIdeaFile(idea.id, PROPOSAL)
    const second = store.addIdeaFile(idea.id, SKETCH)

    expect(first).toEqual({ idea: idea.id, attachment: { id: expect.stringMatching(/^att-\d+$/), ...PROPOSAL } })
    expect(open().listIdeaFiles()).toEqual([second, first])
    expect(stored('idea-files')).toEqual([
      { id: second.attachment.id, idea: idea.id, ...SKETCH },
      { id: first.attachment.id, idea: idea.id, ...PROPOSAL },
    ])
    expect(readFileSync(join(vault, '.meridian/ideas.json'), 'utf8')).toBe(ideasBefore)
  })

  it('stores a file inside the vault relative to it and lists it at its absolute path, also once the vault has moved', () => {
    const idea = store.createIdea(undefined, '熵正则路由', '正文')
    mkdirSync(join(vault, '.meridian/designs'), { recursive: true })
    writeFileSync(join(vault, '.meridian/designs/d1.md'), '# 设计卡')
    const inside = store.addIdeaFile(idea.id, { name: 'd1.md', size: '1 KB', path: join(vault, '.meridian/designs/d1.md') })
    const outside = store.addIdeaFile(idea.id, PROPOSAL)

    expect(stored('idea-files').map((record) => record['path'])).toEqual([PROPOSAL.path, '.meridian/designs/d1.md'])
    expect(inside.attachment.path).toBe(join(vault, '.meridian/designs/d1.md'))
    store.deleteIdeaFile(idea.id, inside.attachment.id)
    store.restoreTrash(store.listTrash()[0]!.id)
    expect(stored('idea-files').map((record) => record['path'])).toEqual([PROPOSAL.path, '.meridian/designs/d1.md'])

    const moved = mkdtempSync(join(tmpdir(), 'meridian-idea-files-moved-'))
    cpSync(vault, moved, { recursive: true })
    try {
      expect(createVaultStore(moved).listIdeaFiles().map((file) => file.attachment.path))
        .toEqual([outside.attachment.path, join(moved, '.meridian/designs/d1.md')])
    } finally {
      rmSync(moved, { recursive: true, force: true })
    }
  })

  it('refuses a file with a relative path, and one for an idea that does not exist', () => {
    const idea = store.createIdea(undefined, '熵正则路由', '正文')
    expect(() => store.addIdeaFile(idea.id, { ...PROPOSAL, path: 'proposal.md' })).toThrow(/绝对路径/)
    expect(() => store.addIdeaFile('idea-404', PROPOSAL)).toThrow(/想法不存在/)
    expect(existsSync(join(vault, '.meridian/idea-files.json'))).toBe(false)
  })

  it('sends a removed file to Trash as an idea file and puts it back in its place', () => {
    const idea = store.createIdea(undefined, '熵正则路由', '正文')
    const first = store.addIdeaFile(idea.id, PROPOSAL)
    const second = store.addIdeaFile(idea.id, SKETCH)
    store.deleteIdeaFile(idea.id, first.attachment.id)

    expect(store.listIdeaFiles()).toEqual([second])
    const entry = store.listTrash()[0]!
    expect(entry).toMatchObject({ kind: 'ideaFile', title: 'proposal.md', restorable: true })
    const reopened = open()
    reopened.restoreTrash(entry.id)
    expect(reopened.listIdeaFiles()).toEqual([second, first])
    expect(reopened.listTrash().some((item) => item.id === entry.id)).toBe(false)
    expect(() => reopened.deleteIdeaFile(idea.id, 'att-404')).toThrow(/附件不存在/)
  })

  it('hides the files of an idea in Trash, and cannot put one of them back until the idea is back', () => {
    const idea = store.createIdea(undefined, '熵正则路由', '正文')
    const file = store.addIdeaFile(idea.id, PROPOSAL)
    const kept = store.addIdeaFile(idea.id, SKETCH)
    store.deleteIdeaFile(idea.id, file.attachment.id)
    const fileEntry = store.listTrash()[0]!.id
    store.deleteIdea(idea.id)
    const ideaEntry = store.listTrash()[0]!.id

    expect(store.listIdeaFiles()).toEqual([])
    expect(store.listTrash().find((item) => item.id === fileEntry)?.restorable).toBe(false)
    expect(() => store.restoreTrash(fileEntry)).toThrow(/想法不存在/)
    store.restoreTrash(ideaEntry)
    expect(store.listIdeaFiles()).toEqual([kept])
    store.restoreTrash(fileEntry)
    expect(open().listIdeaFiles()).toEqual([kept, file])
  })

  it('keeps a trashed idea\'s files for its restore and deletes them when the idea is purged or expires', () => {
    const kept = store.createIdea(undefined, '保留的想法', '正文')
    const keptFile = store.addIdeaFile(kept.id, SKETCH)
    const purged = store.createIdea(undefined, '彻底删除的想法', '正文')
    store.addIdeaFile(purged.id, PROPOSAL)
    const expired = store.createIdea(undefined, '过期的想法', '正文')
    store.addIdeaFile(expired.id, PROPOSAL)

    store.deleteIdea(kept.id)
    store.restoreTrash(store.listTrash()[0]!.id)
    expect(store.listIdeaFiles()).toContainEqual(keptFile)

    store.deleteIdea(purged.id)
    store.purgeTrash(store.listTrash()[0]!.id)
    expect(stored('idea-files').map((record) => record['idea'])).not.toContain(purged.id)

    store.deleteIdea(expired.id)
    day = '2026-11-27'
    const later = open()
    later.listTrash()
    expect(stored('idea-files').map((record) => record['idea'])).toEqual([kept.id])
  })

  it('removes, on open, the files of an idea an older App purged, and keeps those of ideas in Trash or this version cannot read', () => {
    const live = store.createIdea(undefined, '还在的想法', '正文')
    const trashed = store.createIdea(undefined, '在垃圾桶里的想法', '正文')
    const gone = store.createIdea(undefined, '旧版彻底删掉的想法', '正文')
    for (const idea of [live, trashed, gone]) store.addIdeaFile(idea.id, PROPOSAL)
    store.deleteIdea(trashed.id)
    store.deleteIdea(gone.id)
    // What App 0.0.23.0 leaves when it purges `gone`: its trash entry is dropped and idea-files.json is left alone.
    writeFileSync(join(vault, '.meridian/trash.json'), JSON.stringify(stored('trash').filter((item) => (item['idea'] as { id: string }).id !== gone.id)))
    const ideas = stored('ideas')
    writeFileSync(join(vault, '.meridian/ideas.json'), JSON.stringify([...ideas, { id: 'idea-900', title: 'newer', shape: 'unknown' }]))
    const files = stored('idea-files')
    writeFileSync(join(vault, '.meridian/idea-files.json'), JSON.stringify([
      ...files, { id: 'att-900', idea: 'idea-900', ...SKETCH },
    ]))

    open()
    expect(stored('idea-files').map((record) => record['idea']).sort()).toEqual([live.id, trashed.id, 'idea-900'].sort())
  })

  it('leaves an idea\'s files on the idea when it turns into a project, and when that project creation is undone', () => {
    const idea = store.createIdea(undefined, '熵正则路由', '正文')
    const file = store.addIdeaFile(idea.id, PROPOSAL)
    const before = readFileSync(join(vault, '.meridian/idea-files.json'), 'utf8')
    store.createProject(idea.title)
    const project = store.listProjects().find((held) => held.name === idea.title)!.id
    store.updateIdea(idea.id, { project })
    store.undoChange(store.listChanges().find((change) => change.title.includes('新建'))!.id)

    expect(readFileSync(join(vault, '.meridian/idea-files.json'), 'utf8')).toBe(before)
    expect(open().listIdeaFiles()).toEqual([file])
  })

  describe('files coding agents attach in a project workspace', () => {
    let repo: string
    let project: string
    const write = (name: string, value: unknown) => writeFileSync(join(repo, '.meridian/ideas', name), JSON.stringify(value))
    const agentFiles = (files: unknown[]) => write('files.json', { schema_version: 'meridian.workspace-agent-idea-files.v1', files })

    beforeEach(async () => {
      store.createProject('agent 文件项目')
      project = store.listProjects().find((held) => held.name === 'agent 文件项目')!.id
      repo = join(vault, 'agent-files-repo')
      mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
      mkdirSync(join(repo, 'docs'))
      writeFileSync(join(repo, 'docs/proposal.md'), 'x'.repeat(3000))
      await store.bindProjectWorkspace(project, { kind: 'local', root: repo })
    })

    it('takes in a file for an agent idea once, by its path in the workspace, and a removed one does not come back', () => {
      write('ideas.json', { schema_version: 'meridian.workspace-agent-ideas.v1', ideas: [{ id: 'reuse', date: '2026-10-20', title: '按复用距离淘汰', body: '正文' }] })
      agentFiles([{ id: 'p1', idea_id: 'reuse', path: 'docs/proposal.md', date: '2026-10-21' }])
      const idea = store.listIdeas().find((held) => held.title === '按复用距离淘汰')!

      const files = store.listIdeaFiles()
      expect(files).toEqual([{ idea: idea.id, attachment: { id: expect.any(String), name: 'proposal.md', size: '3 KB', path: join(realpathSync(repo), 'docs/proposal.md') } }])
      expect(open().listIdeaFiles()).toEqual(files)
      store.deleteIdeaFile(idea.id, files[0]!.attachment.id)
      expect(open().listIdeaFiles()).toEqual([])
    })

    it('matches an agent idea taken in before files existed by its project, title and date', () => {
      write('ideas.json', { schema_version: 'meridian.workspace-agent-ideas.v1', ideas: [{ id: 'reuse', date: '2026-10-20', title: '按复用距离淘汰', body: '正文' }] })
      const idea = store.listIdeas().find((held) => held.title === '按复用距离淘汰')!
      const state = JSON.parse(readFileSync(join(vault, '.meridian/state.json'), 'utf8')) as Record<string, unknown>
      delete state['agentIdeaIds']
      writeFileSync(join(vault, '.meridian/state.json'), JSON.stringify(state))
      agentFiles([{ id: 'p1', idea_id: 'reuse', path: 'docs/proposal.md', date: '2026-10-21' }])

      expect(open().listIdeaFiles().map((file) => file.idea)).toEqual([idea.id])
    })

    it('takes in a file for an App idea carried out in the project by the idea\'s own id', () => {
      const idea = store.createIdea(undefined, '项目里做的想法', '正文')
      store.updateIdea(idea.id, { project })
      agentFiles([{ id: 'p1', idea_id: idea.id, path: 'docs/proposal.md', date: '2026-10-21' }])

      expect(store.listIdeaFiles().map((file) => file.idea)).toEqual([idea.id])
    })

    it('leaves a file pending while its idea is unknown or its file is missing, and takes it in once both are there', () => {
      agentFiles([
        { id: 'p1', idea_id: 'later', path: 'docs/proposal.md', date: '2026-10-21' },
        { id: 'p2', idea_id: 'later', path: 'docs/missing.md', date: '2026-10-21' },
      ])
      expect(store.listIdeaFiles()).toEqual([])
      write('ideas.json', { schema_version: 'meridian.workspace-agent-ideas.v1', ideas: [{ id: 'later', date: '2026-10-20', title: '后来记下的想法', body: '正文' }] })
      expect(store.listIdeaFiles().map((file) => file.attachment.name)).toEqual(['proposal.md'])
      writeFileSync(join(repo, 'docs/missing.md'), 'x')
      expect(store.listIdeaFiles().map((file) => file.attachment.name).sort()).toEqual(['missing.md', 'proposal.md'])
    })
  })
})
