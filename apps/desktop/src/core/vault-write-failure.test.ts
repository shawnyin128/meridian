import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TRASH_RETENTION_DAYS } from '../shared/vocabulary.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault for the real implementation: two paper pages, no projects and no app state. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** An arXiv paper a watch or a project discovery brings in. */
const remote = (id: string) => ({
  id, title: `Rotation ${id}`, authors: ['Li'], abstract: '……', submitted: '2026-09-01', journalRef: null,
  pdf: `https://arxiv.org/pdf/${id}`,
})

/** Makes one of every record the app-state lists hold, and returns the ids the cases below act on. */
function seed(store: VaultStore) {
  store.createWatch({ type: 'topic', name: 'quantization' })
  const watch = store.listWatches()[0]!.id
  store.addInboxEntries(watch, [remote('2609.10001'), remote('2609.10002'), remote('2609.10003')])
  const entry = (id: string): string => store.listInbox().find((row) => row.title === `Rotation ${id}`)!.id
  const later = entry('2609.10002')
  store.readLater(later)
  store.dismissInbox(entry('2609.10003'))
  const trashedEntry = store.listTrash()[0]!.id
  store.createProject('另一个')
  store.createProject('写库失败')
  const project = store.listProjects().find((row) => row.name === '写库失败')!.id
  const node = store.createNode(project, '节点', null).graph.nodes[0]!.id
  const chat = store.createChat('会话', true).id
  store.appendChatMessages(chat, [{
    role: 'ai', runs: [{ kind: 'text', text: '已引用项目' }],
    actions: [{ kind: 'writeBack', label: '记入科研记录', project, text: '一条结论' }],
  }])
  const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
  const paperChat = store.chatForPaper(paper).id
  store.appendChatMessages(paperChat, [{ role: 'you', runs: [{ kind: 'text', text: '这篇讲了什么' }], actions: [] }])
  const idea = store.createIdea(chat, '一个方向', '验证这个方向').id
  store.updateIdea(idea, { project, node })
  store.createIdea(chat, '另一个方向', '也验证一下')
  store.deleteIdea(store.createIdea(chat, '删掉的方向', '进垃圾桶').id)
  const trashedIdea = store.listTrash()[0]!.id
  store.archiveChange(store.listChanges()[0]!.id)
  return {
    watch, entry: entry('2609.10001'), later, trashedEntry, project, node, chat,
    message: store.chatMessages(chat)[0]!.id, paper, paperChat, idea, trashedIdea,
  }
}

type World = ReturnType<typeof seed>

/**
 * Each case: the `.meridian` file that refuses writes, what the write does, the write, and the lists it
 * changes. Writes a case makes before it reaches that file still land.
 */
const REFUSED: [string, string, (store: VaultStore, world: World) => unknown, (store: VaultStore, world: World) => unknown][] = [
  ['inbox.json', '收件里不看一条', (s, w) => s.dismissInbox(w.entry), (s) => s.listInbox()],
  ['inbox.json', '收件里稍后读一条', (s, w) => s.readLater(w.entry), (s) => s.listInbox()],
  ['inbox.json', '关注拉到新论文', (s, w) => s.addInboxEntries(w.watch, [remote('2609.10009')]), (s) => s.listInbox()],
  ['inbox.json', '关注的推荐换了排序', (s, w) => s.updateInboxEntries(w.watch, [{
    ...remote('2609.10001'),
    ranking: { relevance: 0.9, published: false, citationCount: 3, influentialCitationCount: 0, submitted: '2026-09-01' },
  }]), (s) => s.listInbox()],
  ['inbox.json', '项目发现新论文', (s, w) => s.addDiscoveryEntries(w.project, [{ ...remote('2609.10010'), semanticId: 's-10' }]), (s) => s.listInbox()],
  ['inbox.json', '从垃圾桶恢复一条推荐', (s, w) => s.restoreTrash(w.trashedEntry), (s) => [s.listInbox(), s.listTrash()]],
  ['inbox.json', '删掉关注', (s, w) => s.deleteWatch(w.watch), (s) => [s.listInbox(), s.listTrash()]],
  ['later.json', '收件里稍后读一条', (s, w) => s.readLater(w.entry), (s) => s.listLater()],
  ['later.json', '移出稍后读', (s, w) => s.removeLater(w.later), (s) => s.listLater()],
  ['watches.json', '新建关注', (s) => s.createWatch({ type: 'topic', name: 'kv cache' }), (s) => s.listWatches()],
  ['watches.json', '改关注', (s, w) => s.updateWatch(w.watch, { type: 'topic', name: 'rotation' }), (s) => s.listWatches()],
  ['watches.json', '停掉关注', (s, w) => s.setWatchActive(w.watch, false), (s) => s.listWatches()],
  ['watches.json', '删掉关注', (s, w) => s.deleteWatch(w.watch), (s) => [s.listWatches(), s.listInbox(), s.listTrash()]],
  ['trash.json', '收件里不看一条', (s, w) => s.dismissInbox(w.entry), (s) => s.listTrash()],
  ['trash.json', '删掉关注', (s, w) => s.deleteWatch(w.watch), (s) => s.listTrash()],
  ['trash.json', '从垃圾桶恢复一条推荐', (s, w) => s.restoreTrash(w.trashedEntry), (s) => s.listTrash()],
  ['trash.json', '删掉想法', (s, w) => s.deleteIdea(w.idea), (s) => s.listTrash()],
  ['chats.json', '新建会话', (s) => s.createChat('新会话', true), (s) => s.listChats()],
  ['chats.json', '会话里追加消息', (s, w) => s.appendChatMessages(w.chat, [{ role: 'you', runs: [{ kind: 'text', text: '再问一句' }], actions: [] }]), (s, w) => s.chatMessages(w.chat)],
  ['chats.json', '归档会话', (s, w) => s.setChatArchived(w.chat, true), (s) => s.listChats()],
  ['chats.json', '把一句话记入科研记录', (s, w) => s.recordAction(w.chat, w.message), (s, w) => s.chatMessages(w.chat)],
  ['chats.json', '改论文标题', (s, w) => s.updatePaper(w.paper, { title: '改过的标题' }), (s, w) => s.chatSession(w.paperChat)],
  ['ideas.json', '新建想法', (s, w) => s.createIdea(w.chat, '又一个方向', '验证'), (s) => s.listIdeas()],
  ['ideas.json', '改想法', (s, w) => s.updateIdea(w.idea, { title: '改过的方向' }), (s) => s.listIdeas()],
  ['ideas.json', '删掉想法', (s, w) => s.deleteIdea(w.idea), (s) => [s.listIdeas(), s.listTrash()]],
  ['ideas.json', '项目完成', (s, w) => s.updateProject(w.project, { status: '已完成' }), (s) => s.listIdeas()],
  ['ideas.json', '删掉想法连着的科研节点', (s, w) => s.deleteNode(w.project, w.node), (s) => s.listIdeas()],
  ['ideas.json', '从垃圾桶恢复想法', (s, w) => s.restoreTrash(w.trashedIdea), (s) => [s.listIdeas(), s.listTrash()]],
  ['feed.json', '记一条动态', (s) => s.appendFeed({ source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '记一笔' }] } }), (s) => s.listFeed()],
  ['paper-readings.json', '记一条阅读笔记', (s, w) => s.mutatePaperReading(w.paper, { kind: 'note.add', page: 1, text: '笔记' }), (s, w) => [s.paperReading(w.paper), s.getPaper(w.paper)]],
  ['proposals.json', '存提案队列', (s) => s.saveProposalRecords([{
    id: 'proposal-1', digest: '0123456789abcdef', proposal: null, received: 0, path: 'review', status: 'rejected',
    reason: null, decided: null, change: null, notice: null,
  }]), (s) => s.proposalRecords()],
  ['state.json', '论文表加一列', (s) => s.setPaperColumns({
    ...s.paperColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
  }), (s) => s.paperColumns()],
  ['state.json', '调项目顺序', (s) => s.reorderProjects(s.listProjects().map((p) => p.id).reverse()), (s) => s.listProjects()],
  ['state.json', '改推送设置', (s) => s.setDeliverySettings({ maxItemsPerRun: 3 }), (s) => s.deliverySettings()],
  ['state.json', '记下项目发现的进度', (s, w) => s.setDiscoverySchedule(w.project, { lastFetchedAt: 1, cursor: 1, requests: {} }), (s, w) => s.discoverySchedule(w.project)],
  ['state.json', '记下拉取时间', (s) => s.setLastFetch(1), (s) => s.lastFetch()],
  ['state.json', '调想法顺序', (s) => s.reorderIdeas(s.listIdeas().map((idea) => idea.id).reverse()), (s) => s.listIdeas()],
  ['changelog.json', '归档一条变动', (s) => s.archiveChange(s.listChanges().find((c) => !c.archived)!.id), (s) => s.listChanges()],
  ['changelog.json', '全部归档', (s) => s.archiveAllChanges(), (s) => s.listChanges()],
  ['changelog.json', '删掉一条变动', (s) => s.deleteChange(s.listChanges()[0]!.id), (s) => s.listChanges()],
  ['changelog.json', '清掉已归档的变动', (s) => s.clearArchivedChanges(), (s) => s.listChanges()],
]

describe('a vault write that fails', () => {
  let vault: string
  /** Directories a case made read-only, given relative to the vault. */
  let locked: string[] = []

  const open = (): VaultStore => createVaultStore(vault, () => '2026-09-10')
  /** Makes the vault directory `dir` read-only, so every write that replaces a file in it fails. */
  const lock = (dir: string): void => {
    chmodSync(join(vault, dir), 0o555)
    locked.push(dir)
  }
  const unlock = (): void => {
    for (const dir of locked) chmodSync(join(vault, dir), 0o755)
    locked = []
  }
  /** The file the writer stages a write of `.meridian/<file>` in before renaming it over the file. */
  const staged = (file: string): string => join(vault, '.meridian', 'tmp', `${file}.tmp`)
  /** Makes every write of `.meridian/<file>` fail, and no other write: its staged file exists read-only. */
  const refuse = (file: string): void => {
    mkdirSync(join(vault, '.meridian', 'tmp'), { recursive: true })
    writeFileSync(staged(file), '')
    chmodSync(staged(file), 0o444)
  }
  const allow = (file: string): void => rmSync(staged(file))
  const projectNamed = (store: VaultStore, name: string): string =>
    store.listProjects().find((project) => project.name === name)!.id

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-write-failure-'))
    cpSync(VAULT, vault, { recursive: true })
  })

  afterEach(() => {
    unlock()
    rmSync(vault, { recursive: true, force: true })
  })

  it('项目页没写成时，项目仍是写之前的样子，与重开库读到的一样', () => {
    const store = open()
    store.createProject('写不进去')
    const id = projectNamed(store, '写不进去')
    const before = store.getProject(id).focus
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '没写进磁盘的目标' })).toThrow()
    expect(store.getProject(id).focus).toBe(before)
    expect(store.getProject(id)).toEqual(open().getProject(id))
  })

  it('论文页没写成时，论文仍是写之前的样子', () => {
    const store = open()
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    lock('wiki/papers')
    expect(() => store.updatePaper(paper.id, { readState: paper.readState === '在读' ? '已读' : '在读' })).toThrow()
    expect(store.getPaper(paper.id).readState).toBe(paper.readState)
  })

  it('新项目的页没写成时，项目列表里没有它', () => {
    const store = open()
    store.createProject('先有的')
    const before = store.listProjects()
    lock('wiki/projects')
    expect(() => store.createProject('写不进去')).toThrow()
    expect(store.listProjects()).toEqual(before)
    expect(store.listChanges().map((change) => change.title)).toEqual(['项目「先有的」· 新建'])
  })

  it('项目页没写成时，项目没有完成，它的想法没归档，它连着的计划面也没刷新', () => {
    const store = open()
    store.createProject('收尾')
    const id = projectNamed(store, '收尾')
    const repo = join(vault, 'bound-repo')
    mkdirSync(repo)
    store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const idea = store.createIdea(store.createChat('想法来源', true).id, '一个方向', '验证这个方向')
    store.updateIdea(idea.id, { project: id })
    const ideas = store.listIdeas()
    const plan = readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { status: '已完成' })).toThrow()
    expect(store.getProject(id).status).toBe('进行中')
    expect(store.listIdeas()).toEqual(ideas)
    expect(readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')).toBe(plan)
  })

  it('项目页没写成时，最近变动不多一条，之前记下的那一条照样撤得回去', () => {
    const store = open()
    store.createProject('撤得回去')
    const id = projectNamed(store, '撤得回去')
    store.updateProject(id, { focus: '落了盘的目标' })
    const changes = store.listChanges()
    const log = readFileSync(join(vault, '.meridian', 'changelog.json'), 'utf8')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '没写进磁盘的目标' })).toThrow()
    expect(store.listChanges()).toEqual(changes)
    expect(readFileSync(join(vault, '.meridian', 'changelog.json'), 'utf8')).toBe(log)
    unlock()
    store.undoChange(changes[0]!.id)
    expect(open().getProject(id).focus).toBe('定义第一步')
  })

  it('没写成的改动重来一次写成了，最近变动就记下它，撤销回到最初的样子', () => {
    const store = open()
    store.createProject('重来一次')
    const id = projectNamed(store, '重来一次')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '第二次才写成' })).toThrow()
    unlock()
    store.updateProject(id, { focus: '第二次才写成' })
    const [change] = store.listChanges()
    expect(change!.diff).toEqual(['- 当前目标：定义第一步', '+ 当前目标：第二次才写成'])
    store.undoChange(change!.id)
    expect(open().getProject(id).focus).toBe('定义第一步')
  })

  for (const [file, write, act, read] of REFUSED) {
    it(`${file} 写不进去时${write}，内存里仍是盘上那一份`, () => {
      const store = open()
      const world = seed(store)
      const stored = join(vault, '.meridian', file)
      const disk = (): string | null => (existsSync(stored) ? readFileSync(stored, 'utf8') : null)
      const [before, written] = [read(store, world), disk()]
      refuse(file)
      expect(() => act(store, world)).toThrow()
      expect(read(store, world)).toEqual(before)
      expect(disk()).toBe(written)
    })
  }

  it('state.json 写不进去时没用掉编号，写得进去之后下一条拿到的就是它', () => {
    const store = open()
    const [, seq] = store.createChat('第一个', true).id.split('-')
    refuse('state.json')
    expect(() => store.createChat('写不进去', true)).toThrow()
    allow('state.json')
    expect(store.createChat('第二个', true).id).toBe(`chat-${Number(seq) + 1}`)
  })

  it('trash.json 写不进去时彻底删除与清空都不丢掉垃圾桶里的页，写得进去之后照样恢复得了', () => {
    const store = open()
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    store.deletePaper(paper.id)
    const trash = store.listTrash()
    refuse('trash.json')
    expect(() => store.purgeTrash(trash[0]!.id)).toThrow()
    expect(() => store.clearTrash()).toThrow()
    expect(store.listTrash()).toEqual(trash)
    allow('trash.json')
    store.restoreTrash(trash[0]!.id)
    expect(open().getPaper(paper.id).title).toBe(paper.title)
  })

  it('trash.json 写不进去时过期的那一条连页带记录都留着，写得进去之后才一起清掉', () => {
    let day = '2026-09-10'
    const store = createVaultStore(vault, () => day)
    store.deletePaper(store.listPapers({ page: 1, size: 1 }).rows[0]!.id)
    const page = join(vault, '.meridian', 'trash', `${store.listTrash()[0]!.id}.md`)
    day = new Date(Date.parse(`${day}T00:00:00Z`) + (TRASH_RETENTION_DAYS + 1) * 86_400_000).toISOString().slice(0, 10)
    refuse('trash.json')
    expect(() => store.listTrash()).toThrow()
    expect(existsSync(page)).toBe(true)
    allow('trash.json')
    expect(store.listTrash()).toEqual([])
    expect(existsSync(page)).toBe(false)
  })

  it('changelog.json 写不进去时落了盘的改动仍在最近变动里、撤得回去，下一次写进去时一起落盘', () => {
    const store = open()
    store.createProject('记得住')
    const id = projectNamed(store, '记得住')
    refuse('changelog.json')
    expect(() => store.updateProject(id, { focus: '落了盘的目标' })).toThrow()
    expect(store.getProject(id).focus).toBe('落了盘的目标')
    expect(store.listChanges()[0]).toMatchObject({ title: '项目「记得住」· 改了字段', undoable: true })
    allow('changelog.json')
    store.updateProject(id, { priority: 'p0' })
    expect(open().listChanges().map((change) => change.diff)).toEqual([
      ['- 优先级：常规', '+ 优先级：紧急'],
      ['- 当前目标：定义第一步', '+ 当前目标：落了盘的目标'],
      expect.any(Array),
    ])
  })
})
