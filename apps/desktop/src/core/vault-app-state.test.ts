import { execFileSync } from 'node:child_process'
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TRASH_RETENTION_DAYS } from '../shared/vocabulary.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'
import { minimalPdf } from './net/minimal-pdf.js'

/** Test vault for the real implementation: aggregation layout, two papers, two topics, one method, and four sources. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** Page backed by a source PDF. Its id is the filename and `PAPER_SOURCE` is the referenced source. */
const PAPER = '13979-STAR-Speculative-Decodin'
const PAPER_SOURCE = 'paper-pdf-a6b750e25a61'
const PAPER_PAGE = 'wiki/papers/13979-STAR-Speculative-Decodin.md'
const PAPER_PDF = 'sources/papers/paper-pdf-a6b750e25a61-13979-STAR-Speculative-Decodin.pdf'

/** Real-vault ignore rules copied byte-for-byte from D:\research\paper-wiki\.gitignore. */
const VAULT_GITIGNORE = [
  '# 原始 PDF 是不可变输入,体积大且不需要版本历史',
  'sources/papers/',
  'sources/assets/',
  '',
  '# 生成物,可从 Markdown 重建',
  'wiki/.index/',
  'wiki/.drafts/',
  'wiki/.versions/',
  '',
].join('\n')

/** Two inbox entries: one points to an existing paper and one to a source not yet in the library. */
const INBOX = [
  {
    id: 'in-dup',
    watch: 'w-1',
    source: '主题 · speculative decoding',
    title: 'STAR 又推了一遍',
    authors: 'Zhang et al.',
    venue: 'NeurIPS 2026',
    abstract: '……',
    rec: '与你在读的那条线重合',
    downloaded: false,
    paper: PAPER_SOURCE,
    pdf: 'https://arxiv.org/pdf/2609.10001',
    topic: 'speculative decoding',
    gone: false,
    arxiv: '2609.10001',
    meta: { authors: ['Zhang'], submitted: '2026-09-01', journalRef: null },
  },
  {
    id: 'in-new',
    watch: 'w-1',
    source: '主题 · speculative decoding',
    title: 'Medusa Heads Revisited',
    authors: 'Li et al.',
    venue: 'ICLR 2026',
    abstract: '……',
    rec: '接着你上周读的那一篇',
    downloaded: false,
    paper: 'paper-pdf-000000000001',
    pdf: 'https://arxiv.org/pdf/2609.10002',
    topic: 'draft acceptance',
    gone: false,
    arxiv: '2609.10002',
    meta: { authors: ['Li'], submitted: '2026-09-02', journalRef: 'ICLR 2026' },
  },
]

describe('vault app state', () => {
  let vault: string
  let store: VaultStore
  let day: string
  const today = () => day

  /** Reopen from disk so persisted state must match what the next process reads. */
  const reopen = (): VaultStore => createVaultStore(vault, today)

  const read = (relative: string): string => readFileSync(join(vault, relative), 'utf8')

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-state-'))
    cpSync(VAULT, vault, { recursive: true })
    day = '2026-09-08'
    store = createVaultStore(vault, today)
  })

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true })
  })

  describe('项目', () => {
    it('新建的项目落成 wiki/projects 下的一页,重开之后还是同一个项目', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      expect(existsSync(join(vault, 'wiki', 'projects', `${id}.md`))).toBe(true)
      expect(reopen().getProject(id)).toEqual(store.getProject(id))
    })

    it('改一个字段,项目那一页里只有那一行变了', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      const before = read(`wiki/projects/${id}.md`).split('\n')
      store.updateProject(id, { status: '搁置' })
      const after = read(`wiki/projects/${id}.md`).split('\n')
      expect(after.length).toBe(before.length)
      expect(after.filter((row, i) => row !== before[i])).toEqual(['status: "搁置"'])
      expect(reopen().getProject(id).status).toBe('搁置')
    })

    it('任务、里程碑、关联与附件的增删都落在那一页上', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      store.createTask(id, { title: '宽树实验', start: '2026-09-01', end: '2026-09-10', state: 'act', priority: 'p0' })
      store.createMilestone(id, { date: '2026-09-20', title: '阶段汇报', done: false })
      store.createRelation(id, { group: 'Wiki', text: '树宽收益拐点' })
      store.createAttachment(id, {
        name: 'width-sweep.csv', size: '412 KB', path: join(vault, 'width-sweep.csv'),
      })
      const reopened = reopen().getProject(id)
      expect(reopened.tasks.map((t) => t.title)).toEqual(['宽树实验'])
      expect(reopened.milestones.map((m) => m.title)).toEqual(['阶段汇报'])
      expect(reopened.relations).toEqual([{ group: 'Wiki', items: [{ id: expect.any(String), text: '树宽收益拐点' }] }])
      expect(reopened.attachments.map((a) => a.name)).toEqual(['width-sweep.csv'])

      store.deleteTask(id, reopened.tasks[0]!.id)
      expect(reopen().getProject(id).tasks).toEqual([])
    })

    it('指向链接的关联连同显示名落在那一页上,重开后还在', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      store.createRelation(id, { group: 'links', text: '实验看板', url: 'https://wandb.ai/team/draft' })
      expect(reopen().getProject(id).relations).toEqual([{
        group: 'links',
        items: [{ id: expect.any(String), text: '实验看板', url: 'https://wandb.ai/team/draft' }],
      }])
      expect(() => store.createRelation(id, {
        group: 'links', text: 'x', page: 'topics/nope', url: 'https://example.com',
      })).toThrow()
    })

    it('关联顺序的调整落在那一页上,重开后顺序还在', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      store.createRelation(id, { group: 'Wiki', text: '甲' })
      const second = store.createRelation(id, { group: 'Wiki', text: '乙' }).relations[0]!.items[1]!
      store.moveRelation(id, second.id, 0)
      expect(reopen().getProject(id).relations[0]!.items.map((i) => i.text)).toEqual(['乙', '甲'])
    })

    it('科研记录追在正文里,一条一行', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      store.createEvent(id, '开始这条研究线')
      expect(read(`wiki/projects/${id}.md`))
        .toContain('## 科研记录\n\n- 2026-09-08 [kind:project] 创建项目\n- 2026-09-08 [kind:note] 开始这条研究线\n')
      expect(reopen().getProject(id).events).toEqual([
        { date: '2026-09-08', text: '创建项目', kind: 'project' },
        { date: '2026-09-08', text: '开始这条研究线', kind: 'note' },
      ])
    })

    it('项目按建立的先后排,第十个排在第二个之后,不按文件名', () => {
      for (let n = 0; n < 11; n += 1) store.createProject(`项目 ${n}`)
      const ids = store.listProjects().map((p) => p.id)
      expect(ids).toHaveLength(11)
      expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
      expect(ids.indexOf('project-2')).toBeLessThan(ids.indexOf('project-10'))
      // Reopen scans files by filename, but ordering must still follow creation time.
      expect(reopen().listProjects().map((p) => p.id)).toEqual(ids)
      expect(reopen().overviewProjects().map((p) => p.id)).toEqual(ids)
    })

    it('先建的排在前面,哪怕它的 id 排在后面', () => {
      store.createProject('先建的')
      day = '2026-09-10'
      store.createProject('后建的')
      const [first, second] = reopen().listProjects()
      expect([first?.name, second?.name]).toEqual(['先建的', '后建的'])
      // Creation date is stored on the project page rather than inferred from another field.
      expect(read(`wiki/projects/${first!.id}.md`)).toContain('created: "2026-09-08"')
      expect(read(`wiki/projects/${second!.id}.md`)).toContain('created: "2026-09-10"')
    })

    it('科研记录的正文带换行时被拒,项目一个字都没改', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      const page = read(`wiki/projects/${id}.md`)
      expect(() => store.createEvent(id, '第一行\n第二行')).toThrow(/换行/)
      expect(read(`wiki/projects/${id}.md`)).toBe(page)
      expect(store.getProject(id).events.map((e) => e.text)).toEqual(['创建项目'])
    })

    it('删掉的项目那一页搬进垃圾桶,恢复之后逐字节回到原处', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      const page = read(`wiki/projects/${id}.md`)
      store.deleteProject(id)
      expect(existsSync(join(vault, 'wiki', 'projects', `${id}.md`))).toBe(false)
      expect(store.listProjects()).toEqual([])

      const entry = store.listTrash()[0]!
      expect(entry).toMatchObject({ kind: 'project', title: 'draft 效率', restorable: true })
      store.restoreTrash(entry.id)
      expect(read(`wiki/projects/${id}.md`)).toBe(page)
      expect(store.listProjects().map((p) => p.id)).toEqual([id])
      expect(store.listTrash()).toEqual([])
    })

    it('附件的原项目也被删掉时放不回去,项目恢复之后又放得回去了', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      const project = store.createAttachment(id, {
        name: 'width-sweep.csv', size: '412 KB', path: join(vault, 'width-sweep.csv'),
      })
      store.deleteAttachment(id, project.attachments[0]!.id)
      store.deleteProject(id)
      const attachment = store.listTrash().find((t) => t.kind === 'attachment')!
      expect(attachment.restorable).toBe(false)
      expect(() => store.restoreTrash(attachment.id)).toThrow(/项目不存在/)

      const deleted = store.listTrash().find((t) => t.kind === 'project')!
      store.restoreTrash(deleted.id)
      store.restoreTrash(attachment.id)
      expect(store.getProject(id).attachments.map((a) => a.name)).toEqual(['width-sweep.csv'])
    })
  })

  describe('收件与入库', () => {
    beforeEach(() => {
      writeFileSync(join(vault, '.meridian', 'inbox.json'), JSON.stringify(INBOX), 'utf8')
      writeFileSync(join(vault, '.meridian', 'watches.json'), JSON.stringify([
        { id: 'w-1', type: 'topic', name: 'speculative decoding', active: true },
      ]), 'utf8')
      store = reopen()
    })

    it('划走的一条离开收件进垃圾桶,恢复之后回到原来的位置', () => {
      store.dismissInbox('in-new')
      expect(store.listInbox().map((e) => e.id)).toEqual(['in-dup'])
      store.restoreTrash(store.listTrash()[0]!.id)
      expect(store.listInbox().map((e) => e.id)).toEqual(['in-dup', 'in-new'])
      expect(reopen().listInbox().map((e) => e.id)).toEqual(['in-dup', 'in-new'])
    })

    it('存入稍后阅读的一条离开收件、进队列,重开之后两边都还在', () => {
      expect(store.readLater('in-new')).toBe(true)
      expect(store.listInbox().map((e) => e.id)).toEqual(['in-dup'])
      const queued = reopen().listLater()
      expect(queued.map((e) => e.id)).toEqual(['in-new'])
      expect(queued[0]).toMatchObject({ added: '2026-09-08', day: '今天', downloaded: false })
    })

    it('删除关注同步清掉它的推送与恢复入口,稍后阅读和论文库保留,重开也不会回来', () => {
      const papers = store.listPapers({ page: 1, size: 100 }).total
      expect(store.readLater('in-new')).toBe(true)
      store.dismissInbox('in-dup')

      store.deleteWatch('w-1')

      expect(store.listWatches()).toEqual([])
      expect(store.listInbox()).toEqual([])
      expect(store.listTrash()).toEqual([])
      expect(store.listLater().map((entry) => entry.id)).toContain('in-new')
      expect(store.listPapers({ page: 1, size: 100 }).total).toBe(papers)
      expect(reopen().listInbox()).toEqual([])
      expect(JSON.parse(read('.meridian/inbox.json'))).toEqual([])
    })

    it('旧库里已失去关注的遗留推送在重开时自动清理', () => {
      writeFileSync(join(vault, '.meridian', 'watches.json'), '[]', 'utf8')

      store = reopen()

      expect(store.listInbox()).toEqual([])
      expect(JSON.parse(read('.meridian/inbox.json'))).toEqual([])
    })

    it('入库新建那一篇的 wiki 页,论文表里立刻有它', () => {
      expect(store.completeInboxDownload('in-new', minimalPdf({ lines: ['Medusa'] })))
        .toEqual({ kind: 'added', paper: 'Medusa-Heads-Revisited' })
      const page = read('wiki/papers/Medusa-Heads-Revisited.md')
      expect(page).toMatch(/^source_id: "paper-pdf-[0-9a-f]{12}"$/m)
      expect(page).toContain('read_state: "未读"')
      expect(reopen().getPaper('Medusa-Heads-Revisited')).toMatchObject({
        title: 'Medusa Heads Revisited', topics: ['Draft acceptance'], readState: '未读',
        pageState: 'draft', updated: '2026-09-08',
      })
      expect(store.listInbox().find((e) => e.id === 'in-new')?.downloaded).toBe(true)
    })

    it('入库时把远端元数据一次写进论文页', () => {
      const paper = store.getPaper(store.completeInboxDownload('in-new', minimalPdf({ lines: ['Medusa'] })).paper)
      expect(paper.year).toBe(2026)
      expect(paper.venue).toBe('ICLR 2026')
      expect(paper.identifier).toBe('arXiv:2609.10002')
      expect(store.listInbox().find((e) => e.id === 'in-new')?.venue).toBe('ICLR 2026')
      expect(read('wiki/papers/Medusa-Heads-Revisited.md')).toContain('venue: "ICLR 2026"')
    })

    it('入库撞上库里已有的那一篇时不重复入库,给出的是那一篇的落点', () => {
      const before = store.listPapers({ page: 1, size: 10 }).total
      expect(store.prepareInboxDownload('in-dup')).toEqual({
        kind: 'existing', paper: PAPER, title: store.getPaper(PAPER).title,
      })
      expect(store.listPapers({ page: 1, size: 10 }).total).toBe(before)
      expect(store.listInbox().find((e) => e.id === 'in-dup')?.downloaded).toBe(false)
    })
  })

  describe('改论文', () => {
    it('第一次写阅读状态把 read_state 插在 memberships 之前,页上别处不动', () => {
      const before = read(PAPER_PAGE).split('\n')
      expect(before.some((row) => row.startsWith('read_state:'))).toBe(false)
      store.updatePaper(PAPER, { readState: '在读' })
      const after = read(PAPER_PAGE).split('\n')
      const at = before.indexOf('memberships:')
      expect(after).toHaveLength(before.length + 1)
      expect(after.slice(0, at).filter((row, i) => row !== before[i]))
        .toEqual(['updated: "2026-09-08"'])
      expect(after[at]).toBe('read_state: "在读"')
      expect(after.slice(at + 1)).toEqual(before.slice(at))
      expect(reopen().getPaper(PAPER).readState).toBe('在读')
    })

    it('改出处与阅读状态碰不到系统写的项与归属', () => {
      const before = read(PAPER_PAGE)
      const paper = store.getPaper(PAPER)
      store.updatePaper(PAPER, { venue: 'ICLR 2026', readState: '已读' })
      const line = (text: string, key: string): string | undefined =>
        text.split('\n').find((row) => row.startsWith(`${key}:`))
      for (const key of ['status', 'created', 'source_id']) {
        expect(line(read(PAPER_PAGE), key), key).toBe(line(before, key))
      }
      const memberships = (text: string): string => text.slice(text.indexOf('memberships:'), text.indexOf('\n---', text.indexOf('memberships:')))
      expect(memberships(read(PAPER_PAGE))).toBe(memberships(before))
      // Editing the page updates its timestamp; Core owns the value and the renderer cannot supply it.
      expect(line(read(PAPER_PAGE), 'updated')).toBe('updated: "2026-09-08"')
      expect(store.getPaper(PAPER))
        .toEqual({ ...paper, venue: 'ICLR 2026', readState: '已读', updated: '2026-09-08' })
    })

    it('撤销一次改动,页逐字节回到改之前', () => {
      const page = read(PAPER_PAGE)
      const paper = store.getPaper(PAPER)
      store.updatePaper(PAPER, { venue: 'ICLR 2026' })
      expect(read(PAPER_PAGE)).not.toBe(page)

      const back = reopen()
      const change = back.listChanges()[0]!
      expect(change).toMatchObject({ title: `论文「${paper.title}」· 改了字段`, undoable: true })
      back.undoChange(change.id)
      expect(read(PAPER_PAGE)).toBe(page)
      expect(back.getPaper(PAPER)).toEqual(paper)
    })

    it('撤销第一次设的阅读状态,页逐字节回到改前:read_state 那一行不留', () => {
      const page = read(PAPER_PAGE)
      store.updatePaper(PAPER, { readState: '在读' })
      expect(read(PAPER_PAGE)).toContain('read_state: "在读"')

      store.undoChange(store.listChanges()[0]!.id)
      expect(store.getPaper(PAPER).readState).toBe('未读')
      // The field was absent before the change, so undo must remove it rather than leave an unread line.
      expect(read(PAPER_PAGE)).toBe(page)
      expect(read(PAPER_PAGE)).not.toContain('read_state')
    })

    it('改动把 updated 推到今天,撤销还原成页上原来那一天', () => {
      const updatedLine = (): string | undefined =>
        read(PAPER_PAGE).split('\n').find((row) => row.startsWith('updated:'))
      const before = updatedLine()
      expect(before).toBe('updated: "2026-05-20"')
      store.updatePaper(PAPER, { venue: 'ICLR 2026' })
      expect(read(PAPER_PAGE)).toContain('updated: "2026-09-08"')
      expect(store.getPaper(PAPER).updated).toBe('2026-09-08')

      store.undoChange(store.listChanges()[0]!.id)
      expect(updatedLine()).toBe(before)
      expect(reopen().getPaper(PAPER).updated).toBe('2026-05-20')
    })
  })

  describe('页的写入', () => {
    it('写到一半的那一份落在 .meridian 下,不落在用户的 wiki 目录里', () => {
      store.updatePaper(PAPER, { readState: '在读' })
      store.createProject('draft 效率')
      expect(existsSync(join(vault, '.meridian', 'tmp'))).toBe(true)
      for (const dir of ['papers', 'projects']) {
        expect(readdirSync(join(vault, 'wiki', dir)).filter((name) => name.endsWith('.tmp')))
          .toEqual([])
      }
    })

    it('开库把上次没写完留下的那些临时文件清掉', () => {
      const tmp = join(vault, '.meridian', 'tmp')
      mkdirSync(tmp, { recursive: true })
      writeFileSync(join(tmp, '13979-STAR-Speculative-Decodin.md.tmp'), '半截', 'utf8')
      reopen()
      expect(existsSync(join(tmp, '13979-STAR-Speculative-Decodin.md.tmp'))).toBe(false)
    })
  })

  describe('删论文', () => {
    it('删掉的是 wiki 那一页,原文 PDF 留在原地', () => {
      store.deletePaper(PAPER)
      expect(existsSync(join(vault, PAPER_PAGE))).toBe(false)
      expect(existsSync(join(vault, PAPER_PDF))).toBe(true)
      expect(() => store.getPaper(PAPER)).toThrow(/论文不存在/)
      expect(() => store.wikiPaper('papers/13979-STAR-Speculative-Decodin')).toThrow()
    })

    it('恢复把那一页放回去,原文重新挂上', () => {
      const page = read(PAPER_PAGE)
      const title = store.getPaper(PAPER).title
      store.deletePaper(PAPER)
      store.restoreTrash(store.listTrash()[0]!.id)
      expect(read(PAPER_PAGE)).toBe(page)
      expect(store.getPaper(PAPER).title).toBe(title)
      expect(Buffer.from(store.paperSource(PAPER).subarray(0, 5)).toString('latin1'))
        .toBe('%PDF-')
    })

    it('保留期一过,垃圾桶连那一页一起丢掉,再也恢复不了', () => {
      store.deletePaper(PAPER)
      const entry = store.listTrash()[0]!
      day = '2026-09-15'
      expect(Math.round((Date.parse(`${day}T00:00:00Z`) - entry.deletedAt) / 86_400_000))
        .toBe(TRASH_RETENTION_DAYS)
      expect(store.listTrash()).toEqual([])
      expect(() => store.restoreTrash(entry.id)).toThrow(/垃圾桶里没有这一条/)
      expect(existsSync(join(vault, '.meridian', 'trash', `${entry.id}.md`))).toBe(false)
      // The source file remains untouched throughout.
      expect(existsSync(join(vault, PAPER_PDF))).toBe(true)
    })
  })

  describe('运行状态', () => {
    it('旧动态里写死的刚刚会一次性迁移成可推进的时间', () => {
      const file = join(vault, '.meridian', 'feed.json')
      const legacy = [{
        id: 'legacy-feed', source: 'me', day: '今天', time: '刚刚',
        body: { kind: 'runs', runs: [{ kind: 'text', text: '记一笔' }] },
      }]
      writeFileSync(file, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8')
      const writtenAt = new Date('2026-09-08T14:03:02.001Z')
      utimesSync(file, writtenAt, writtenAt)

      const migrated = reopen().listFeed()
      expect(migrated).toHaveLength(1)
      expect(migrated[0]!.createdAt).toBe('2026-09-08T14:03:02.001Z')
      expect(JSON.parse(read('.meridian/feed.json'))[0].createdAt)
        .toBe('2026-09-08T14:03:02.001Z')
      expect(reopen().listFeed()[0]!.createdAt).toBe('2026-09-08T14:03:02.001Z')
    })

    it('关注、对话与动态都写进 .meridian,重开之后还在', () => {
      store.createWatch({ type: 'topic', name: 'speculative decoding' })
      const watchId = store.listWatches()[0]!.id
      store.setWatchActive(watchId, false)
      store.updateWatch(watchId, { type: 'topic', name: 'speculative sampling' })
      const chat = store.createChat('新对话', false)
      store.appendChatMessages(chat.id, [{ role: 'you', runs: [{ kind: 'text', text: '树宽收益的拐点在哪' }], actions: [] }])
      store.appendFeed({ source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '记一笔' }] } })

      const back = reopen()
      expect(back.listWatches()).toEqual([{
        id: watchId, type: 'topic', name: 'speculative sampling', active: false,
      }])
      expect(back.listChats()).toEqual([{ id: chat.id, title: '树宽收益的拐点在哪', archived: false, messageCount: 1 }])
      expect(back.listFeed()[0]).toMatchObject({ source: 'me', day: '今天', time: '刚刚' })
    })

    it('论文上下文会话按论文身份复用并跨重启保存', () => {
      const session = store.chatForPaper(PAPER)
      expect(store.listChats()).toEqual([])
      store.appendChatMessages(session.id, [
        { role: 'you', runs: [{ kind: 'text', text: '作者的关键假设是什么?' }], actions: [] },
      ])

      const back = reopen()
      expect(back.chatForPaper(PAPER)).toMatchObject({ id: session.id, paperId: PAPER, messageCount: 1 })
      expect(back.chatMessages(session.id)[0]!.runs[0]!.text).toBe('作者的关键假设是什么?')
      expect(back.listChats()[0]).toMatchObject({ id: session.id, paperId: PAPER })
    })

    it('运行状态存的是 JSON,不进 wiki', () => {
      store.createWatch({ type: 'author', name: 'Tri Dao' })
      const text = read('.meridian/watches.json')
      expect(JSON.parse(text)).toEqual([{ id: expect.any(String), type: 'author', name: 'Tri Dao', active: true }])
      expect(text.endsWith('\n')).toBe(true)
      expect(existsSync(join(vault, 'wiki', 'chats'))).toBe(false)
    })
  })

  describe('变动记录与撤销', () => {
    it('记录存进 .meridian,重开之后还撤得动,页逐字节回到改之前', () => {
      store.createProject('draft 效率')
      const id = store.listProjects()[0]!.id
      const page = read(`wiki/projects/${id}.md`)
      store.updateProject(id, { status: '搁置', focus: '换个焦点' })
      expect(read(`wiki/projects/${id}.md`)).not.toBe(page)

      const stored = JSON.parse(read('.meridian/changelog.json')) as { title: string }[]
      expect(stored[0]!.title).toBe('项目「draft 效率」· 改了字段')

      const back = reopen()
      const change = back.listChanges()[0]!
      expect(change).toMatchObject({ undoable: true, undone: false })
      back.undoChange(change.id)
      expect(read(`wiki/projects/${id}.md`)).toBe(page)
      expect(back.getProject(id)).toMatchObject({ status: '进行中', focus: '定义第一步' })
      expect(reopen().listChanges()[1]).toMatchObject({ id: change.id, undone: true })
    })

    it('撤销之后项目仍排在原来的位置:建立日期没被写回时抹掉', () => {
      store.createProject('先建的')
      day = '2026-09-10'
      store.createProject('后建的')
      const first = store.listProjects()[0]!.id
      store.updateProject(first, { status: '搁置' })
      store.undoChange(store.listChanges()[0]!.id)
      expect(reopen().listProjects().map((p) => p.name)).toEqual(['先建的', '后建的'])
      expect(read(`wiki/projects/${first}.md`)).toContain('created: "2026-09-08"')
    })
  })

  describe('git 检查', () => {
    it('库不在 git 之下时,动态里说得出这件事,重开不再重复说', () => {
      const entries = store.listFeed()
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ source: 'steward' })
      expect(JSON.stringify(entries[0]!.body)).toContain('不在 git 管理之下')
      expect(reopen().listFeed()).toHaveLength(1)
    })

    it('库在 git 之下时说的是另一件事', () => {
      mkdirSync(join(vault, '.git'))
      const entries = reopen().listFeed()
      expect(entries).toHaveLength(2)
      expect(JSON.stringify(entries[0]!.body)).toContain('在 git 管理之下')
      expect(JSON.stringify(entries[0]!.body)).not.toContain('不在 git')
    })

    it('应用状态与 wiki 一起进 git:.meridian 没有被挡在版本历史之外', () => {
      writeFileSync(join(vault, '.gitignore'), VAULT_GITIGNORE, 'utf8')
      execFileSync('git', ['init', '-q'], { cwd: vault })
      const back = reopen()
      back.createProject('draft 效率')
      back.createWatch({ type: 'topic', name: 'speculative decoding' })

      const tracked = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: vault, encoding: 'utf8',
      })
      // Rolling back project deletion must restore both page and trash entry, so Git must see both paths.
      expect(tracked).toContain('.meridian/watches.json')
      expect(tracked).toContain('.meridian/state.json')
      expect(tracked).toContain('wiki/projects/')
      // The vault's own ignore rules remain byte-for-byte unchanged.
      expect(readFileSync(join(vault, '.gitignore'), 'utf8')).toBe(VAULT_GITIGNORE)
    })
  })
})
