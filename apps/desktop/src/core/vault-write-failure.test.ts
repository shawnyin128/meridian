import {
  chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRASH_RETENTION_DAYS } from '../shared/vocabulary.js'
import { placeResearchIdeaOnGraph, promoteResearchIdea } from './research-ideas/index.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

// The writer puts every file in place by renaming it there, or linking a new source there, so counting those picks which write of an operation fails.
// fsyncSync does nothing here: these cases check what a failed write leaves on disk and in memory, not durability across a power loss,
// and an fsync for every file of every repeated step is most of their time.
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return { ...real, renameSync: vi.fn(real.renameSync), linkSync: vi.fn(real.linkSync), fsyncSync: vi.fn() }
})

/** The file system's own rename and link, which the mocks pass every call to unless a case fails it. */
const { renameSync: rename, linkSync: link } = await vi.importActual<typeof import('node:fs')>('node:fs')

/** The bytes of a PDF that imports. */
const PDF = Uint8Array.from(Buffer.from('%PDF-1.7\n%%EOF'))

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
  void store.createNode(project, '节点', null)
  const node = store.heldProject(project).graph.nodes[0]!.id
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
 * changes.
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
  ['discovery/progress.json', '记下项目发现轮到哪一步', (s, w) => s.setRefreshProgress(
    { kind: 'project', id: w.project }, { steps: { 'intent-a': 1 }, candidates: [], favouredAt: null, newest: [], poolStalled: false },
  ), (s, w) => s.refreshProgress({ kind: 'project', id: w.project })],
  ['state.json', '调想法顺序', (s) => s.reorderIdeas(s.listIdeas().map((idea) => idea.id).reverse()), (s) => s.listIdeas()],
  ['changelog.json', '归档一条变动', (s) => s.archiveChange(s.listChanges().find((c) => !c.archived)!.id), (s) => s.listChanges()],
  ['changelog.json', '全部归档', (s) => s.archiveAllChanges(), (s) => s.listChanges()],
  ['changelog.json', '删掉一条变动', (s) => s.deleteChange(s.listChanges()[0]!.id), (s) => s.listChanges()],
  ['changelog.json', '清掉已归档的变动', (s) => s.clearArchivedChanges(), (s) => s.listChanges()],
]

/** A proposal that files a paper under two topics, writing the paper page and both topic pages. */
const TWO_TOPICS = {
  source: 'user' as const, title: '归进两个主题', ops: ['topics/draft-acceptance', 'topics/speculative-decoding'].map((topic) => ({
    op: 'setMembership' as const, paper: 'papers/Jiang-et-al-2024-Mixtral-of-Experts', in: topic, cells: {},
  })),
}

/** Writes `value` as the JSON file at `path` in the workspace `repo`, the way a coding agent does. */
const plant = (repo: string, path: string, value: unknown): void => {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), JSON.stringify(value))
}

/** Sets up one custom column of `type`, a select or a text column, and fills it on every paper. */
const fillColumn = (store: VaultStore, type: 'select' | 'text'): void => {
  const [key, value] = type === 'select' ? ['stage', '精读'] : ['note', '读到一半']
  store.setPaperColumns({
    ...store.paperColumns(), custom: [{ key, label: key, type, options: type === 'select' ? ['精读', '略读'] : [] }],
  })
  for (const { id } of store.listPapers({ page: 1, size: 10 }).rows) store.updatePaper(id, { custom: { [key]: value } })
}

/** Trashes what `trash` deletes and returns the id of the trash record it made. */
const trashed = (store: VaultStore, trash: () => unknown): string => {
  trash()
  return store.listTrash()[0]!.id
}

/**
 * Each case: a write that writes the vault more than once, what it sets up before the write, given the
 * world and the workspace the world's project is bound to, and returns the write, and whether recent
 * changes record it. Every write to that project also refreshes the workspace's projection.
 */
const WHOLE: [string, (store: VaultStore, world: World, repo: string) => () => unknown, boolean][] = [
  ['删掉附件', (s, w) => {
    void s.createAttachment(w.project, { name: '数据.csv', size: '1 KB', path: '/tmp/数据.csv' })
    const { id } = s.heldProject(w.project).attachments[0]!
    return () => s.deleteAttachment(w.project, id)
  }, true],
  ['删掉记过笔记的论文', (s, w) => {
    s.mutatePaperReading(w.paper, { kind: 'note.add', page: 1, text: '笔记' })
    return () => s.deletePaper(w.paper)
  }, true],
  ['删掉有论文发现的项目', (s, w) => {
    s.addDiscoveryEntries(w.project, [{ ...remote('2609.10020'), semanticId: 's-20' }, { ...remote('2609.10021'), semanticId: 's-21' }])
    s.dismissInbox(s.listInbox({ kind: 'discovery' })[0]!.id)
    return () => s.deleteProject(w.project)
  }, true],
  ['项目完成，连着的想法跟着归档', (s, w) => () => s.updateProject(w.project, { status: '已完成' }), true],
  ['把一句话记入科研记录', (s, w) => () => s.recordAction(w.chat, w.message), true],
  ['改有会话的论文的标题', (s, w) => () => s.updatePaper(w.paper, { title: '改过的标题' }), true],
  ['新建项目', (s) => () => s.createProject('新的项目'), true],
  ['一次改项目的好几项', (s, w) => () => s.updateProject(w.project, {
    name: '改过的名字', focus: '新目标', priority: 'p0', block: '等数据', memo: '随笔',
  }), true],
  ['一次改任务的名字和备注', (s, w) => {
    void s.createTask(w.project, { title: '任务', start: '2026-09-10', end: '2026-09-11', state: 'plan', priority: 'p1' })
    const task = s.heldProject(w.project).tasks[0]!.id
    return () => s.updateTask(w.project, task, { title: '改过的任务', note: '备注' })
  }, true],
  ['一条提案写好几页', (s) => () => s.applyProposal(TWO_TOPICS), true],
  ['从垃圾桶恢复连着项目的想法', (s, w) => {
    const id = trashed(s, () => s.deleteIdea(w.idea))
    return () => s.restoreTrash(id)
  }, false],
  ['从垃圾桶恢复记过笔记的论文', (s, w) => {
    s.mutatePaperReading(w.paper, { kind: 'note.add', page: 1, text: '笔记' })
    const id = trashed(s, () => s.deletePaper(w.paper))
    return () => s.restoreTrash(id)
  }, false],
  ['从垃圾桶恢复项目', (s) => {
    const id = trashed(s, () => s.deleteProject(s.listProjects().find((p) => p.name === '另一个')!.id))
    return () => s.restoreTrash(id)
  }, false],
  ['从垃圾桶恢复附件', (s, w) => {
    void s.createAttachment(w.project, { name: '数据.csv', size: '1 KB', path: '/tmp/数据.csv' })
    const { id } = s.heldProject(w.project).attachments[0]!
    const entry = trashed(s, () => s.deleteAttachment(w.project, id))
    return () => s.restoreTrash(entry)
  }, false],
  ['从垃圾桶恢复一条推荐', (s, w) => () => s.restoreTrash(w.trashedEntry), false],
  ['收件里不看一条', (s, w) => () => s.dismissInbox(w.entry), false],
  ['收件里稍后读一条', (s, w) => () => s.readLater(w.entry), false],
  ['删掉有推荐的关注', (s, w) => () => s.deleteWatch(w.watch), false],
  ['删掉连着项目的想法', (s, w) => () => s.deleteIdea(w.idea), false],
  ['手排过顺序时新建想法', (s) => {
    s.reorderIdeas(s.listIdeas().map((idea) => idea.id).reverse())
    return () => s.createIdea(undefined, '新的方向', '验证一下')
  }, false],
  ['删掉连着想法的科研节点', (s, w) => () => s.deleteNode(w.project, w.node), false],
  ['把论文页的 Wiki 草稿写进去', (s, w) => () => s.applyPaperWikiDraft(`papers/${w.paper}`, '读过之后的正文'), true],
  ['改 Wiki 页的正文', (s) => () => s.updateWikiPage('topics/draft-acceptance', '改过的正文'), true],
  ['改一个选项的名字，填着它的论文一起改', (s) => {
    fillColumn(s, 'select')
    return () => s.renamePaperOption('stage', '精读', '细读')
  }, true],
  ['改一列的类型，填着它的论文一起改', (s) => {
    fillColumn(s, 'text')
    return () => s.setPaperColumnType('note', 'multi')
  }, true],
  ['撤销改一列的类型', (s) => {
    fillColumn(s, 'text')
    s.setPaperColumnType('note', 'multi')
    return () => s.undoChange(s.listChanges()[0]!.id)
  }, true],
  ['撤销改有会话的论文的好几项', (s, w) => {
    s.updatePaper(w.paper, { title: '改过的标题', venue: 'ICML' })
    return () => s.undoChange(s.listChanges()[0]!.id)
  }, true],
  ['撤销一条写好几页的提案', (s) => {
    s.applyProposal(TWO_TOPICS)
    return () => s.undoChange(s.listChanges()[0]!.id)
  }, true],
  ['导入一篇 PDF', (s) => () => s.importPaper('新的论文.pdf', PDF), false],
  ['下载稍后读里的一篇', (s, w) => {
    s.readLater(w.entry)
    return () => s.completeInboxDownload(w.entry, PDF)
  }, false],
  ['给下载的论文补全元数据，稍后读里的那一条跟着改', (s, w) => {
    s.readLater(w.entry)
    const { paper } = s.completeInboxDownload(w.entry, PDF)
    return () => s.fillPaperMetadata(paper, { title: '补全的标题', pageCount: 12 }, s.getPaper(paper).title)
  }, false],
  ['收进 agent 要加的一条任务', (s, w, repo) => {
    plant(repo, '.meridian/tasks/tasks.json', {
      schema_version: 'meridian.workspace-agent-tasks.v1',
      tasks: [{ id: 'request-1', date: '2026-09-11', title: 'agent 要跑的实验', note: '跑一遍' }],
    })
    return () => s.absorbAgentTasks(w.project)
  }, true],
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
  const staged = (file: string): string => join(vault, '.meridian', 'tmp', `${basename(file)}.tmp`)
  /** Makes every write of `.meridian/<file>` fail, and no other write: its staged file exists read-only. */
  const refuse = (file: string): void => {
    mkdirSync(join(vault, '.meridian', 'tmp'), { recursive: true })
    writeFileSync(staged(file), '')
    chmodSync(staged(file), 0o444)
  }
  const allow = (file: string): void => rmSync(staged(file))
  const projectNamed = (store: VaultStore, name: string): string =>
    store.listProjects().find((project) => project.name === name)!.id

  /** A local workspace a case binds a project to, outside the vault. */
  let repo: string
  /** Every file of the vault and of the workspace with its text, the writer's staging folder left out. */
  const filesOf = (): Record<string, string> => Object.fromEntries([vault, repo].flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: 'utf8' }).map((name) => join(root, name))
      .filter((file) => statSync(file).isFile() && !file.startsWith(join(vault, '.meridian', 'tmp', sep)))
      .map((file) => [file, readFileSync(file, 'utf8')])))
  /** Everything the store answers about what the WHOLE cases write. */
  const view = (store: VaultStore) => {
    const projects = store.listProjects()
    const papers = store.listPapers({ page: 1, size: 100 }).rows
    return {
      projects, details: projects.map((project) => store.getProject(project.id)), overview: store.overviewProjects(),
      papers, readings: papers.map((paper) => store.paperReading(paper.id)),
      pages: store.wikiCards().map((card) => store.wikiAggregation(card.id)), signals: store.wikiSignals(),
      inbox: store.listInbox(), later: store.listLater(), trash: store.listTrash(), ideas: store.listIdeas(),
      chats: store.listChats().map((chat) => ({ ...chat, messages: store.chatMessages(chat.id) })),
      feed: store.listFeed(), changes: store.listChanges(),
    }
  }
  /**
   * Makes the `step`th file the writer puts in place in the vault from now on fail as a read-only folder
   * refuses it, and lets every other one through. The change log is not counted: its record is written
   * after the write and kept when it cannot be (see the changelog.json case below). Returns whether that
   * write has been reached.
   */
  const failWrite = (step: number): (() => boolean) => {
    let seen = 0
    const refuse = (syscall: string, from: unknown, to: unknown): void => {
      const file = String(to)
      if (file.startsWith(vault + sep) && file !== join(vault, '.meridian', 'changelog.json') && (seen += 1) === step) {
        throw Object.assign(new Error(`EACCES: permission denied, ${syscall} '${String(from)}' -> '${file}'`), {
          code: 'EACCES', syscall,
        })
      }
    }
    vi.mocked(renameSync).mockImplementation((from, to) => {
      refuse('rename', from, to)
      rename(from, to)
    })
    vi.mocked(linkSync).mockImplementation((from, to) => {
      refuse('link', from, to)
      link(from, to)
    })
    return () => seen >= step
  }
  /**
   * Fails `write` at each vault write it makes, one after another on the same store, and checks after each
   * failure that every file and what `read` answers are as they were before. Returns the number of vault
   * writes `write` made once it runs through.
   */
  const everyStep = async (write: () => unknown, read: () => unknown): Promise<number> => {
    const shown = read()
    const files = filesOf()
    for (let step = 1; ; step += 1) {
      const reached = failWrite(step)
      try {
        await write()
        return step - 1
      } catch (error) {
        if (!reached()) throw error
      } finally {
        vi.mocked(renameSync).mockImplementation(rename)
        vi.mocked(linkSync).mockImplementation(link)
      }
      expect(filesOf(), `第 ${step} 次写没写成`).toEqual(files)
      expect(read(), `第 ${step} 次写没写成`).toEqual(shown)
    }
  }

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-write-failure-'))
    cpSync(VAULT, vault, { recursive: true })
    repo = mkdtempSync(join(tmpdir(), 'meridian-write-failure-repo-'))
  })

  afterEach(() => {
    unlock()
    rmSync(vault, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  })

  for (const [write, arrange, logged] of WHOLE) {
    it(`${write}时哪一次写没写成，库和内存都回到写之前；写成时整个落盘${logged ? '，最近变动记下一条' : ''}`, async () => {
      const store = open()
      const world = seed(store)
      await store.bindProjectWorkspace(world.project, { kind: 'local', root: repo })
      const act = arrange(store, world, repo)
      const changes = store.listChanges().length
      expect(await everyStep(act, () => view(store))).toBeGreaterThan(1)
      expect(store.listChanges()).toHaveLength(changes + (logged ? 1 : 0))
      expect(view(open())).toEqual(view(store))
    })
  }

  it('agent 在工作区记下的想法和科研记录，收进来时哪一次写没写成都不落地，收成之后各只有一份', async () => {
    let clock = Date.parse('2026-09-10T08:00:00Z')
    // A minute passes between reads, so the once-a-minute limit on reading workspace events never skips one.
    const store = createVaultStore(vault, () => '2026-09-10', () => new Date(clock += 61_000))
    const world = seed(store)
    await store.bindProjectWorkspace(world.project, { kind: 'local', root: repo })
    store.listFeed()
    plant(repo, '.meridian/ideas/ideas.json', {
      schema_version: 'meridian.workspace-agent-ideas.v1',
      ideas: [1, 2].map((n) => ({ id: `agent-idea-${n}`, date: '2026-09-10', title: `agent 的方向 ${n}`, body: '验证这一步' })),
    })
    plant(repo, '.meridian/events/events.json', {
      schema_version: 'meridian.workspace-events.v1',
      events: [1, 2].map((n) => ({ id: `agent-event-${n}`, date: '2026-09-10', text: `agent 跑完了第 ${n} 组`, source: 'agent' })),
    })
    expect(await everyStep(() => store.listIdeas(), () => null)).toBeGreaterThan(1)
    expect(await everyStep(() => store.listFeed(), () => null)).toBeGreaterThan(1)
    expect(store.listIdeas().filter((idea) => idea.title.startsWith('agent 的方向'))).toHaveLength(2)
    expect(store.listFeed().filter((entry) => JSON.stringify(entry).includes('agent 跑完了'))).toHaveLength(2)
    expect(view(open())).toEqual(view(store))
  })

  it('想法转成项目时哪一次写没写成，库和内存都回到写之前；重来一次写成了，也只多出一个项目', async () => {
    const store = open()
    const world = seed(store)
    const idea = store.createIdea(world.chat, '转成项目的方向', '项目从这里开始').id
    const projects = store.listProjects().length
    const changes = store.listChanges().length
    expect(await everyStep(() => promoteResearchIdea(store, idea), () => view(store))).toBeGreaterThan(1)
    expect(store.listChanges()).toHaveLength(changes + 2)
    for (const read of [store, open()]) {
      const made = read.listProjects().filter((project) => project.name === '转成项目的方向')
      expect(made).toHaveLength(1)
      expect(read.listProjects()).toHaveLength(projects + 1)
      expect(read.listIdeas().find((held) => held.id === idea)!.project).toBe(made[0]!.id)
    }
  })

  it('把想法放到新建的科研节点上时哪一次写没写成，库和内存都回到写之前；重来一次写成了，也只多出一个节点', async () => {
    const store = open()
    const world = seed(store)
    const nodes = (await store.getProject(world.project)).graph.nodes.length
    expect(await everyStep(() => placeResearchIdeaOnGraph(store, world.idea, {
      kind: 'create', label: '新的节点', after: world.node,
    }), () => view(store))).toBeGreaterThan(1)
    for (const read of [store, open()]) {
      const { graph } = await read.getProject(world.project)
      const made = graph.nodes.filter((node) => node.label === '新的节点')
      expect(made).toHaveLength(1)
      expect(graph.nodes).toHaveLength(nodes + 1)
      expect(read.listIdeas().find((idea) => idea.id === world.idea)!.node).toBe(made[0]!.id)
    }
  })

  it('几次写合成一次写，后面一步没写成时，项目、它的最新进展和最近变动都回到写之前', async () => {
    let day = '2026-09-10'
    const store = createVaultStore(vault, () => day)
    const id = store.createProject('合成一次写')
    day = '2026-09-11'
    const [project, changes, files] = [await store.getProject(id), store.listChanges(), filesOf()]
    expect(() => store.atomically(() => {
      void store.updateProject(id, { focus: '没落地的目标' })
      throw new Error('后一步没写成')
    })).toThrow('后一步没写成')
    expect(await store.getProject(id)).toEqual(project)
    expect(store.listChanges()).toEqual(changes)
    expect(filesOf()).toEqual(files)
  })

  it('想法从垃圾桶恢复到最后一步没写成，再恢复一次也只有一份', () => {
    const store = open()
    const world = seed(store)
    const ideas = store.listIdeas()
    refuse('trash.json')
    expect(() => store.restoreTrash(world.trashedIdea)).toThrow()
    expect(store.listIdeas()).toEqual(ideas)
    allow('trash.json')
    store.restoreTrash(world.trashedIdea)
    expect(open().listIdeas().filter((idea) => idea.title === '删掉的方向')).toHaveLength(1)
  })

  it('项目页没写成时，项目仍是写之前的样子，与重开库读到的一样', async () => {
    const store = open()
    store.createProject('写不进去')
    const id = projectNamed(store, '写不进去')
    const before = (await store.getProject(id)).focus
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '没写进磁盘的目标' })).toThrow()
    expect((await store.getProject(id)).focus).toBe(before)
    expect(await store.getProject(id)).toEqual(await open().getProject(id))
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

  it('项目页没写成时，项目没有完成，它的想法没归档，它连着的计划面也没刷新', async () => {
    const store = open()
    store.createProject('收尾')
    const id = projectNamed(store, '收尾')
    const repo = join(vault, 'bound-repo')
    mkdirSync(repo)
    await store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const idea = store.createIdea(store.createChat('想法来源', true).id, '一个方向', '验证这个方向')
    store.updateIdea(idea.id, { project: id })
    const ideas = store.listIdeas()
    const plan = readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { status: '已完成' })).toThrow()
    expect((await store.getProject(id)).status).toBe('进行中')
    expect(store.listIdeas()).toEqual(ideas)
    expect(readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')).toBe(plan)
  })

  it('项目页没写成时，最近变动不多一条，之前记下的那一条照样撤得回去', async () => {
    const store = open()
    store.createProject('撤得回去')
    const id = projectNamed(store, '撤得回去')
    await store.updateProject(id, { focus: '落了盘的目标' })
    const changes = store.listChanges()
    const log = readFileSync(join(vault, '.meridian', 'changelog.json'), 'utf8')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '没写进磁盘的目标' })).toThrow()
    expect(store.listChanges()).toEqual(changes)
    expect(readFileSync(join(vault, '.meridian', 'changelog.json'), 'utf8')).toBe(log)
    unlock()
    store.undoChange(changes[0]!.id)
    expect((await open().getProject(id)).focus).toBe('定义第一步')
  })

  it('没写成的改动重来一次写成了，最近变动就记下它，撤销回到最初的样子', async () => {
    const store = open()
    store.createProject('重来一次')
    const id = projectNamed(store, '重来一次')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '第二次才写成' })).toThrow()
    unlock()
    await store.updateProject(id, { focus: '第二次才写成' })
    const [change] = store.listChanges()
    expect(change!.diff).toEqual(['- 当前目标：定义第一步', '+ 当前目标：第二次才写成'])
    store.undoChange(change!.id)
    expect((await open().getProject(id)).focus).toBe('定义第一步')
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

  it('changelog.json 写不进去时落了盘的改动仍在最近变动里、撤得回去，下一次写进去时一起落盘', async () => {
    const store = open()
    store.createProject('记得住')
    const id = projectNamed(store, '记得住')
    refuse('changelog.json')
    expect(() => store.updateProject(id, { focus: '落了盘的目标' })).toThrow()
    expect((await store.getProject(id)).focus).toBe('落了盘的目标')
    expect(store.listChanges()[0]).toMatchObject({ title: '项目「记得住」· 改了字段', undoable: true })
    allow('changelog.json')
    await store.updateProject(id, { priority: 'p0' })
    expect(open().listChanges().map((change) => change.diff)).toEqual([
      ['- 优先级：常规', '+ 优先级：紧急'],
      ['- 当前目标：定义第一步', '+ 当前目标：落了盘的目标'],
      expect.any(Array),
    ])
  })
})
