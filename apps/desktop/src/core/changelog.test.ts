import { beforeEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import type { ChangeEntry } from '../shared/contract.js'
import { TRASH_RETENTION_DAYS } from '../shared/vocabulary.js'
import { type ChangeRecord, withChangelog } from './changelog.js'
import { createFixtureStore } from './fixture-store.js'
import { minimalPdf } from './net/minimal-pdf.js'
import { emptyColumns } from './paper-library/index.js'
import type { VaultStore } from './vault.js'

/** Seeded fixture history predates this feature and lacks restoration data. */
const SEEDED = 4

/** Fixture project and one of its papers. */
const PROJECT = 'draft'

/** Fixture paper whose reading state the reading cases write. */
const READ = 'Jiang-et-al-2024-Mixtral-of-Experts'

/** A highlight's one rectangle. */
const RECTS = [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }]

describe('change log', () => {
  let store: VaultStore
  let day: string
  const today = () => day

  /** Entries recorded in this run, excluding seeded fixture history. */
  const recorded = (): ChangeEntry[] => {
    const rows = store.listChanges()
    return rows.slice(0, rows.length - SEEDED)
  }

  beforeEach(() => {
    day = '2026-08-25'
    store = createFixtureStore(today)
  })

  it('fixture 带进来的历史撤不了:库里没有还原它们所需的东西', () => {
    const seeded = store.listChanges()
    expect(seeded).toHaveLength(SEEDED)
    expect(seeded.every((c) => !c.undoable && !c.undone)).toBe(true)
    expect(() => store.undoChange(seeded[0]!.id)).toThrow(/撤不了/)
  })

  it('每一条的 id 在库里唯一:新记的不会撞上 fixture 带进来的那几条', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    store.createEvent(PROJECT, '记一笔')
    store.undoChange(recorded()[0]!.id)
    const ids = store.listChanges().map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('改一个字段记下一条,来源是我,最新的排在最前', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    const rows = recorded()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      title: '项目「draft 效率」· 改了字段', meta: '今天', source: '我',
      diff: ['- 当前目标：宽树实验补 B≥8 + 前缀复用配置', '+ 当前目标：改过的焦点'],
      undone: false, undoable: true,
    })
    expect(store.listChanges()[0]!.id).toBe(rows[0]!.id)
  })

  it('撤销把数据真的写回改之前,那一条标成已撤销,并多出一条撤销记录', () => {
    const before = store.getProject(PROJECT)
    store.updateProject(PROJECT, { focus: '改过的焦点', status: '搁置' })
    expect(store.getProject(PROJECT).focus).toBe('改过的焦点')
    const change = recorded()[0]!

    store.undoChange(change.id)
    // Read again to confirm the vault actually returned to the pre-change state.
    expect(store.getProject(PROJECT)).toEqual({ ...before, lastProgress: day })

    const rows = recorded()
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ id: change.id, undone: true, undoable: false })
    expect(rows[0]).toMatchObject({
      title: '撤销：项目「draft 效率」· 改了字段', source: '我', undone: false,
    })
    // This is history, not an undo stack; the undo action cannot itself be undone.
    expect(rows[0]!.undoable).toBe(false)
    expect(rows[0]!.diff).toEqual([
      '- 状态：搁置', '+ 状态：进行中',
      '- 重启条件：改过的焦点', '+ 当前目标：宽树实验补 B≥8 + 前缀复用配置',
    ])
  })

  it('乱序撤销撞上后来的改动时被拒,说清还有几条更新的,数据一个字没动', () => {
    store.updateProject(PROJECT, { focus: '第一次改' })
    const first = recorded()[0]!
    store.updateProject(PROJECT, { focus: '第二次改' })
    const between = store.getProject(PROJECT)

    expect(() => store.undoChange(first.id)).toThrow(/又被改过 1 次.*先撤销较新的那几条/)
    expect(store.getProject(PROJECT)).toEqual(between)
    expect(store.listChanges().find((c) => c.id === first.id)).toMatchObject({ undone: false })

    // Undo the newer entry first, after which this entry becomes undoable.
    store.undoChange(recorded()[0]!.id)
    store.undoChange(first.id)
    expect(store.getProject(PROJECT).focus).toBe('宽树实验补 B≥8 + 前缀复用配置')
  })

  it('这条之后实体在别处变过、又没有更新的记录时,同样拒绝', () => {
    // Trash operations are not logged but mutate the same project, so restoration invalidates this record's fingerprint.
    store.deleteAttachment(PROJECT, store.getProject(PROJECT).attachments[0]!.id)
    const change = recorded()[0]!
    store.restoreTrash(store.listTrash()[0]!.id)
    const now = store.getProject(PROJECT)

    expect(() => store.undoChange(change.id)).toThrow(/已经不是当时的样子/)
    expect(store.getProject(PROJECT)).toEqual(now)
    expect(store.listChanges().find((c) => c.id === change.id)).toMatchObject({ undone: false })
  })

  it('快照留 7 天:第 8 天撤不了,第 6 天还撤得了', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    const change = recorded()[0]!

    day = '2026-08-26'
    // The secondary text is derived from the recorded timestamp at read time rather than frozen on write.
    expect(change.meta).toBe('今天')
    expect(store.listChanges().find((c) => c.id === change.id)?.meta).toBe('昨天')

    day = '2026-08-31'
    expect(TRASH_RETENTION_DAYS).toBe(7)
    expect(store.listChanges().find((c) => c.id === change.id)?.undoable).toBe(true)

    day = '2026-09-02'
    expect(store.listChanges().find((c) => c.id === change.id)).toMatchObject({ undoable: false })
    expect(() => store.undoChange(change.id)).toThrow(/保留期/)
    // The record remains permanently even after it can no longer be undone.
    expect(store.listChanges().find((c) => c.id === change.id)?.title)
      .toBe('项目「draft 效率」· 改了字段')
  })

  it('日期是记下的那一天,不跟着今天走;标题下那行灰字跟着今天走', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    const id = recorded()[0]!.id
    expect(store.listChanges().find((c) => c.id === id))
      .toMatchObject({ date: '2026-08-25', meta: '今天' })

    day = '2026-08-27'
    expect(store.listChanges().find((c) => c.id === id))
      .toMatchObject({ date: '2026-08-25', meta: '本周' })
  })

  it('新记下的一条是没归档的', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    expect(recorded()[0]!.archived).toBe(false)
  })

  it('归一条只动它自己,别的条目一个字不变,也不多记一条', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    const before = store.listChanges()
    store.archiveChange(before[0]!.id)

    const after = store.listChanges()
    expect(after).toHaveLength(before.length)
    expect(after[0]).toEqual({ ...before[0]!, archived: true })
    expect(after.slice(1)).toEqual(before.slice(1))
  })

  it('归一条已归档的是空操作:不抛,也不改别的', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    const id = recorded()[0]!.id
    store.archiveChange(id)
    const after = store.listChanges()

    expect(() => store.archiveChange(id)).not.toThrow()
    expect(store.listChanges()).toEqual(after)
  })

  it('全部归档把没归档的一次归掉,再按一次是空操作', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    store.archiveChange(recorded()[0]!.id)
    store.createEvent(PROJECT, '记一笔')

    store.archiveAllChanges()
    const after = store.listChanges()
    expect(after.every((c) => c.archived)).toBe(true)
    expect(after).toHaveLength(SEEDED + 2)

    store.archiveAllChanges()
    expect(store.listChanges()).toEqual(after)
  })

  it('撤销不动归档:撤一条已归档的,它还在归档里,撤销本身没归档', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    const change = recorded()[0]!
    store.archiveChange(change.id)

    store.undoChange(change.id)
    const rows = recorded()
    expect(rows[1]).toMatchObject({ id: change.id, undone: true, archived: true })
    expect(rows[0]).toMatchObject({ title: '撤销：项目「draft 效率」· 改了字段', archived: false })
  })

  it('归一条库里没有的,说清是哪一条', () => {
    expect(() => store.archiveChange('chg-没有这一条')).toThrow(/最近变动里没有这一条/)
  })

  it('删除一条只清掉记录与撤销快照,不改被记录的知识内容', () => {
    const { lastProgress } = store.getProject(PROJECT)
    store.updateProject(PROJECT, { focus: '删除记录也保留的改动' })
    const change = recorded()[0]!
    const project = store.getProject(PROJECT)

    store.deleteChange(change.id)

    expect(store.listChanges().some((row) => row.id === change.id)).toBe(false)
    // The deleted record no longer counts as progress.
    expect(store.getProject(PROJECT)).toEqual({ ...project, lastProgress })
    expect(() => store.undoChange(change.id)).toThrow(/最近变动里没有这一条/)
  })

  it('删除不存在的记录会拒绝,清空已归档只删已归档的', () => {
    expect(() => store.deleteChange('chg-没有这一条')).toThrow(/最近变动里没有这一条/)
    store.updateProject(PROJECT, { focus: '保留的未归档改动' })
    const active = recorded()[0]!
    const archived = store.listChanges().find((row) => row.id !== active.id)!
    store.archiveChange(archived.id)

    store.clearArchivedChanges()

    expect(store.listChanges().some((row) => row.id === archived.id)).toBe(false)
    expect(store.listChanges().find((row) => row.id === active.id)).toEqual(active)
    expect(store.listChanges().every((row) => !row.archived)).toBe(true)
    const after = store.listChanges()
    store.clearArchivedChanges()
    expect(store.listChanges()).toEqual(after)
  })

  it('输入端与过程的那些写一条记录都不产生', () => {
    const before = store.listChanges()
    store.dismissInbox('drafterlite')
    store.readLater('sequoia2')
    store.completeInboxDownload('fa3', minimalPdf({ lines: ['fa3'] }))
    store.removeLater('mixtral')
    store.createWatch({ type: 'topic', name: 'kv cache' })
    store.setWatchActive('moe', false)
    store.deleteWatch('moe')
    const chat = store.createChat('新对话', false)
    store.appendChatMessages(chat.id, [{ role: 'you', runs: [{ kind: 'text', text: '问一句' }], actions: [] }])
    store.setChatArchived(chat.id, true)
    store.appendFeed({ source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '记一笔' }] } })
    store.mutatePaperReading(READ, { kind: 'progress.set', page: 4 })
    store.setPaperColumns({ ...store.paperColumns(), hidden: ['topics'], order: ['y'] })
    store.mutatePaperReading(READ, { kind: 'note.add', page: 1, text: '新加的笔记' })
    store.mutatePaperReading(READ, { kind: 'highlight.add', page: 1, quote: '新加的高亮', rects: RECTS, color: 'yellow' })
    // Trash is already a restoration mechanism; logging it again would create an "undo restore" entry.
    store.restoreTrash(store.listTrash().find((t) => t.kind === 'inbox')!.id)
    store.dismissInbox('drafterlite')
    store.purgeTrash(store.listTrash()[0]!.id)
    store.clearTrash()

    expect(store.listChanges()).toEqual(before)
  })

  it('改变持久知识的那 26 个写各记一条', () => {
    const writes: [string, () => unknown][] = [
      ['papers.update', () => store.updatePaper('Jiang-et-al-2024-Mixtral-of-Experts', { readState: '在读' })],
      ['papers.mutateReading note.delete', () => store.mutatePaperReading(READ, {
        kind: 'note.delete', id: store.mutatePaperReading(READ, { kind: 'note.add', page: 1, text: '要删的' }).notes[0]!.id,
      })],
      ['papers.mutateReading highlight.delete', () => store.mutatePaperReading(READ, {
        kind: 'highlight.delete',
        id: store.mutatePaperReading(READ, { kind: 'highlight.add', page: 1, quote: '要删的', rects: RECTS, color: 'blue' })
          .highlights[0]!.id,
      })],
      ['papers.mutateReading remark.set', () => store.mutatePaperReading(READ, { kind: 'remark.set', text: '随笔' })],
      ['papers.mutateReading note.update', () => store.mutatePaperReading(READ, {
        kind: 'note.update', id: store.mutatePaperReading(READ, { kind: 'note.add', page: 1, text: '要改的' }).notes[0]!.id,
        text: '改过的',
      })],
      ['papers.mutateReading highlight.update', () => store.mutatePaperReading(READ, {
        kind: 'highlight.update',
        id: store.mutatePaperReading(READ, { kind: 'highlight.add', page: 1, quote: '要改的', rects: RECTS, color: 'blue' })
          .highlights[0]!.id,
        note: '改过的批注',
      })],
      ['papers.setColumns', () => store.setPaperColumns({
        ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      })],
      ['papers.setColumnType', () => store.setPaperColumnType('note', 'select')],
      ['papers.delete', () => store.deletePaper('Jiang-et-al-2024-Mixtral-of-Experts')],
      ['wiki.apply', () => store.applyProposal({
        source: 'chat', title: '测试',
        ops: [{ op: 'appendEntry', page: 'topics/ptq', section: '未解决', date: '2026-08-25', text: '一条' }],
      })],
      ['wiki.update', () => store.updateWikiPage('topics/ptq', '## 问题\n改过。')],
      ['project.create', () => store.createProject('新项目')],
      ['project.update', () => store.updateProject(PROJECT, { focus: '换个焦点' })],
      ['project.createTask', () => store.createTask(PROJECT, {
        title: '新任务', start: '2026-08-25', end: '2026-08-31', state: 'act', priority: 'p1',
      })],
      ['project.updateTask', () => store.updateTask(PROJECT, 't2', { state: 'done' })],
      ['project.deleteTask', () => store.deleteTask(PROJECT, 't2')],
      ['project.createMilestone', () => store.createMilestone(PROJECT, {
        date: '2026-09-01', title: '新里程碑', done: false,
      })],
      ['project.updateMilestone', () => store.updateMilestone(PROJECT, 'm2', { done: true })],
      ['project.deleteMilestone', () => store.deleteMilestone(PROJECT, 'm2')],
      ['project.createRelation', () => store.createRelation(PROJECT, { group: 'Wiki', text: '新关联' })],
      ['project.deleteRelation', () =>
        store.deleteRelation(PROJECT, store.getProject(PROJECT).relations[0]!.items[0]!.id)],
      ['project.updateRelation', () =>
        store.updateRelation(PROJECT, store.getProject(PROJECT).relations[0]!.items[0]!.id, { text: '改名' })],
      ['project.createAttachment', () =>
        store.createAttachment(PROJECT, {
          name: '新附件.csv', size: '1 KB', path: resolve('新附件.csv'),
        })],
      ['project.deleteAttachment', () =>
        store.deleteAttachment(PROJECT, store.getProject(PROJECT).attachments[0]!.id)],
      ['project.createEvent', () => store.createEvent(PROJECT, '[对话] 来自对话的结论')],
      ['project.delete', () => store.deleteProject(PROJECT)],
    ]
    expect(writes).toHaveLength(26)

    for (const [method, write] of writes) {
      const before = store.listChanges().length
      write()
      expect(store.listChanges().length, `${method} 没有记进最近变动`).toBe(before + 1)
      expect(store.listChanges()[0], `${method} 记下的那条`).toMatchObject({
        source: '我', undone: false, undoable: true,
      })
    }
  })

  it('应用一条提案记一条,标题是提案的话,diff 一条 op 一行,撤销把碰到的页逐页写回', () => {
    const before = store.wikiAggregation('topics/ptq').body
    store.applyProposal({
      source: 'ingest', title: '给 PTQ 记一条',
      ops: [{ op: 'appendEntry', page: 'topics/ptq', section: '未解决', date: '2026-08-25', text: '一条' }],
    })
    const change = recorded()[0]!
    expect(change).toMatchObject({
      title: 'Wiki · 给 PTQ 记一条', source: '我', diff: ['+ topics/ptq § 未解决:一条'], undoable: true,
    })
    expect(store.wikiAggregation('topics/ptq').body).toBe(`${before}\n- 2026-08-25 · 一条`)
    store.undoChange(change.id)
    expect(store.wikiAggregation('topics/ptq').body).toBe(before)
    expect(() => store.undoChange(change.id)).toThrow(/已经撤销/)
  })

  it('撤销一条提案记下的那一条,diff 是写回的页,一页一行,不是页的全文', () => {
    store.applyProposal({
      source: 'ingest', title: '给 PTQ 记一条',
      ops: [{ op: 'appendEntry', page: 'topics/ptq', section: '未解决', date: '2026-08-25', text: '一条' }],
    })
    store.undoChange(recorded()[0]!.id)
    expect(store.listChanges()[0]).toMatchObject({
      title: '撤销：Wiki · 给 PTQ 记一条', diff: ['~ topics/ptq'],
    })
  })

  it('删掉一条笔记记一条,撤销把它原样放回原处;之后加的笔记与读到的页留着', () => {
    store.mutatePaperReading(READ, { kind: 'note.add', page: 2, text: '第一条' })
    const before = store.mutatePaperReading(READ, { kind: 'note.add', page: 5, text: '第二条' })
    store.mutatePaperReading(READ, { kind: 'note.delete', id: before.notes[0]!.id })
    const change = recorded()[0]!
    expect(change).toMatchObject({
      title: '论文「Mixtral of Experts」· 删掉笔记', diff: ['- 页码：2', '- 笔记：第一条'], undoable: true,
    })

    store.mutatePaperReading(READ, { kind: 'note.add', page: 7, text: '之后加的' })
    store.mutatePaperReading(READ, { kind: 'progress.set', page: 9 })
    store.undoChange(change.id)
    const after = store.paperReading(READ)
    expect(after.notes.slice(0, 2)).toEqual(before.notes)
    expect(after.notes.map((note) => note.text)).toEqual(['第一条', '第二条', '之后加的'])
    expect(after.lastPage).toBe(9)
    expect(store.getPaper(READ).noteCount).toBe(3)
    expect(store.listChanges()[0]).toMatchObject({ title: '撤销：论文「Mixtral of Experts」· 删掉笔记', undoable: false })
  })

  it('删掉一条高亮记一条,撤销把它连同批注放回原处', () => {
    store.mutatePaperReading(READ, { kind: 'highlight.add', page: 3, quote: '要删的那句', rects: RECTS, color: 'green' })
    const first = store.paperReading(READ).highlights[0]!
    store.mutatePaperReading(READ, { kind: 'highlight.update', id: first.id, note: '批注' })
    const before = store.mutatePaperReading(READ, { kind: 'highlight.add', page: 4, quote: '留着的那句', rects: RECTS, color: 'yellow' })
    store.mutatePaperReading(READ, { kind: 'highlight.delete', id: first.id })
    const change = recorded()[0]!
    expect(change).toMatchObject({
      title: '论文「Mixtral of Experts」· 删掉高亮',
      diff: ['- 页码：3', '- 高亮：要删的那句', '- 批注：批注'],
      undoable: true,
    })

    store.undoChange(change.id)
    expect(store.paperReading(READ).highlights).toEqual(before.highlights)
  })

  it('改随笔记一条,diff 是前后两段;撤销写回之前那段,较早的一条要先撤较新的', () => {
    store.mutatePaperReading(READ, { kind: 'remark.set', text: '旧的想法' })
    const first = recorded()[0]!
    expect(first).toMatchObject({
      title: '论文「Mixtral of Experts」· 改了随笔', diff: ['+ 随笔：旧的想法'], undoable: true,
    })
    store.mutatePaperReading(READ, { kind: 'remark.set', text: '新的想法' })
    const second = recorded()[0]!
    expect(second.diff).toEqual(['- 随笔：旧的想法', '+ 随笔：新的想法'])
    expect(() => store.undoChange(first.id)).toThrow('这条之后该实体又被改过 1 次，先撤销较新的那几条')

    store.mutatePaperReading(READ, { kind: 'note.add', page: 1, text: '不挡撤销' })
    store.undoChange(second.id)
    expect(store.getPaper(READ).remark).toBe('旧的想法')
    store.undoChange(first.id)
    expect(store.paperReading(READ)).toMatchObject({ remark: '', notes: [{ text: '不挡撤销' }] })
    expect(store.getPaper(READ)).not.toHaveProperty('remark')
  })

  it('改一条笔记记一条,撤销把之前那段原地写回;较早的一条要先撤较新的', () => {
    store.mutatePaperReading(READ, { kind: 'note.add', page: 2, text: '第一条' })
    const before = store.mutatePaperReading(READ, { kind: 'note.add', page: 5, text: '第二条' })
    const id = before.notes[0]!.id
    day = '2026-08-26'
    store.mutatePaperReading(READ, { kind: 'note.update', id, text: '改过一次' })
    const first = recorded()[0]!
    expect(first).toMatchObject({
      title: '论文「Mixtral of Experts」· 改了笔记', diff: ['- 笔记：第一条', '+ 笔记：改过一次'], undoable: true,
    })
    store.mutatePaperReading(READ, { kind: 'note.update', id, text: '改过两次' })
    expect(() => store.undoChange(first.id)).toThrow('这条之后该实体又被改过 1 次，先撤销较新的那几条')

    store.undoChange(recorded()[0]!.id)
    store.undoChange(first.id)
    expect(store.paperReading(READ).notes).toEqual(before.notes)
  })

  it('改一条高亮的批注记一条,撤销把之前的批注原地写回', () => {
    store.mutatePaperReading(READ, { kind: 'highlight.add', page: 3, quote: '第一句', rects: RECTS, color: 'green' })
    const before = store.mutatePaperReading(READ, { kind: 'highlight.add', page: 4, quote: '第二句', rects: RECTS, color: 'yellow' })
    store.mutatePaperReading(READ, { kind: 'highlight.update', id: before.highlights[0]!.id, note: '新批注' })
    const change = recorded()[0]!
    expect(change).toMatchObject({
      title: '论文「Mixtral of Experts」· 改了高亮批注', diff: ['+ 批注：新批注'], undoable: true,
    })

    store.undoChange(change.id)
    expect(store.paperReading(READ).highlights).toEqual(before.highlights)
  })

  it('改一条关联记下一条,撤销把它的名字和指向还原', () => {
    const before = store.getProject(PROJECT).relations
    const item = before[0]!.items[0]!
    store.updateRelation(PROJECT, item.id, { text: '改名', url: 'https://example.com' })
    expect(recorded()[0]).toMatchObject({ title: '项目「draft 效率」· 改了关联', undoable: true })
    store.undoChange(recorded()[0]!.id)
    expect(store.getProject(PROJECT).relations).toEqual(before)
  })

  it('新建的东西撤销之后就不在了,删掉的东西撤销之后回来了', () => {
    store.createProject('要撤销掉的项目')
    const created = store.listProjects()[0]!.id
    store.undoChange(recorded()[0]!.id)
    expect(store.listProjects().map((p) => p.id)).not.toContain(created)

    const paper = store.getPaper('Jiang-et-al-2024-Mixtral-of-Experts')
    store.deletePaper(paper.id)
    expect(() => store.getPaper(paper.id)).toThrow()
    store.undoChange(recorded()[0]!.id)
    expect(store.getPaper(paper.id)).toEqual(paper)
    // Restoration consumes the trash entry rather than leaving duplicate copies.
    expect(store.listTrash().filter((t) => t.kind === 'paper')).toHaveLength(0)
  })

  it('改论文把时间戳推到今天,撤销连时间戳一起还原', () => {
    const paper = store.getPaper('Jiang-et-al-2024-Mixtral-of-Experts')
    expect(paper.updated).not.toBe(store.today())
    store.updatePaper(paper.id, { readState: '在读' })
    expect(store.getPaper(paper.id).updated).toBe(store.today())

    store.undoChange(recorded()[0]!.id)
    expect(store.getPaper(paper.id)).toEqual(paper)
  })

  it('撤销一条任务的新增,项目回到没有那条任务的样子', () => {
    const before = store.getProject(PROJECT)
    store.createTask(PROJECT, {
      title: '要撤销的任务', start: '2026-08-25', end: '2026-08-31', state: 'act', priority: 'p1',
    })
    expect(store.getProject(PROJECT).tasks[0]!.title).toBe('要撤销的任务')
    store.undoChange(recorded()[0]!.id)
    expect(store.getProject(PROJECT)).toEqual({ ...before, lastProgress: day })
  })

  it('撤销一次任务备注的编辑,项目回到写备注之前的样子', () => {
    const task = store.getProject(PROJECT).tasks.find((t) => t.id === 't2')!
    expect(task.note).toBeUndefined()
    const before = store.getProject(PROJECT)
    store.updateTask(PROJECT, 't2', { note: '先确认基线,再改并发数' })
    expect(store.getProject(PROJECT).tasks.find((t) => t.id === 't2')!.note)
      .toBe('先确认基线,再改并发数')
    store.undoChange(recorded()[0]!.id)
    expect(store.getProject(PROJECT)).toEqual({ ...before, lastProgress: day })
    expect(store.getProject(PROJECT).tasks.find((t) => t.id === 't2')!.note).toBeUndefined()
  })

  it('同一条撤两次撤不动,库里没有的那条 id 也撤不动', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    const change = recorded()[0]!
    store.undoChange(change.id)
    expect(() => store.undoChange(change.id)).toThrow(/已经撤销过/)
    expect(() => store.undoChange('没有这一条')).toThrow(/没有这一条/)
  })

  it('取回的变动是副本,连 diff 那一层改了也渗不回库里', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    const rows = store.listChanges()
    rows[0]!.title = '篡改后的标题'
    rows[0]!.diff[0] = '篡改后的 diff'
    expect(store.listChanges()[0]!.title).not.toBe('篡改后的标题')
    expect(store.listChanges()[0]!.diff[0]).not.toBe('篡改后的 diff')
  })

  it('记录不跨边界带快照与指纹:界面只看得到能不能撤、归没归档', () => {
    store.updateProject(PROJECT, { focus: '改过的焦点' })
    expect(Object.keys(store.listChanges()[0]!).sort())
      .toEqual(['archived', 'date', 'diff', 'id', 'lines', 'meta', 'source', 'title', 'undoable', 'undone'])
  })

  it('删掉一列记一条,撤销把列放回,之后改过的显隐、分组与顺序留着,论文里那一格又看得见', () => {
    const column = { key: 'du-fa', label: '读法', type: 'select' as const, options: ['精读'] }
    store.setPaperColumns({ hidden: [], custom: [column], groups: ['topics', 'du-fa'], order: ['du-fa', 'y'] })
    store.updatePaper(READ, { custom: { 'du-fa': '精读' } })
    store.setPaperColumns({ hidden: [], custom: [], groups: ['topics'], order: ['y'] })
    const change = recorded()[0]!
    expect(change).toMatchObject({
      title: '论文表 · 删掉列「读法」',
      diff: ['- 列：读法'],
      undoable: true,
    })
    store.setPaperColumns({ hidden: ['topics'], custom: [], groups: ['topics'], order: ['y'] })

    store.undoChange(change.id)
    expect(store.paperColumns()).toEqual({ hidden: ['topics'], custom: [column], groups: ['topics'], order: ['y'] })
    expect(store.getPaper(READ).custom).toEqual({ 'du-fa': '精读' })
    expect(store.listChanges()[0]).toMatchObject({ title: '撤销：论文表 · 删掉列「读法」', undoable: false })
  })

  it('新建列、改列名、删选项各记一条,标题说的是改了什么;显隐、分组与列顺序不记;较早的一条要先撤较新的', () => {
    const column = { key: 'du-fa', label: '读法', type: 'select' as const, options: ['精读', '略读'] }
    store.setPaperColumns({ ...emptyColumns(), custom: [column] })
    const created = recorded()[0]!
    expect(created).toMatchObject({ title: '论文表 · 新建列「读法」', undoable: true })
    const count = store.listChanges().length
    store.setPaperColumns({ ...store.paperColumns(), hidden: ['topics'] })
    store.setPaperColumns({ ...store.paperColumns(), groups: ['topics', 'du-fa'] })
    store.setPaperColumns({ ...store.paperColumns(), order: ['du-fa', 'y'] })
    expect(store.listChanges()).toHaveLength(count)

    store.setPaperColumns({ ...store.paperColumns(), custom: [{ ...column, label: '读的方式' }] })
    expect(recorded()[0]).toMatchObject({ title: '论文表 · 列「读法」改名为「读的方式」', undoable: true })
    store.setPaperColumns({ ...store.paperColumns(), custom: [{ ...column, label: '读的方式', options: ['精读'] }] })
    expect(recorded()[0]).toMatchObject({ title: '论文表 · 列「读的方式」删掉选项「略读」', undoable: true })

    expect(() => store.undoChange(created.id)).toThrow('这条之后该实体又被改过 2 次，先撤销较新的那几条')
    for (const change of recorded().slice(0, 3)) store.undoChange(change.id)
    expect(store.paperColumns()).toEqual({ hidden: ['topics'], custom: [], groups: ['topics'], order: ['y'] })
  })

  it('撤销给列加的选项被拒:还有论文填着它,列设置一个字没动', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'du-fa', label: '读法', type: 'select', options: [] }] })
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }] })
    const added = recorded()[0]!
    store.updatePaper(READ, { custom: { 'du-fa': '精读' } })
    const held = store.paperColumns()

    expect(() => store.undoChange(added.id)).toThrow('列「读法」的选项「精读」还有论文在用，删不掉')
    expect(store.paperColumns()).toEqual(held)
    expect(store.listChanges().find((c) => c.id === added.id)).toMatchObject({ undone: false })
  })

  it('选项改名记一条 columns 型变动,撤销是反着再改一次', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }],
    })
    const id = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.updatePaper(id, { custom: { 'du-fa': '精读' } })
    store.renamePaperOption('du-fa', '精读', '细读')

    const top = store.listChanges()[0]!
    expect(top.title).toBe('论文表 · 列「读法」的选项 精读 → 细读')
    expect(top.diff).toEqual(['- 选项：精读', '+ 选项：细读'])
    expect(top.undoable).toBe(true)
    store.undoChange(top.id)
    expect(store.getPaper(id).custom['du-fa']).toBe('精读')
    expect(store.paperColumns().custom[0]!.options).toEqual(['精读'])
  })

  it('这一列之后又被改过时,选项改名撤不了', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }],
    })
    store.renamePaperOption('du-fa', '精读', '细读')
    const top = store.listChanges()[0]!
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法方式', type: 'select', options: ['细读'] }],
    })
    expect(() => store.undoChange(top.id)).toThrow('这一列之后又改过，撤销会盖掉那次改动')
  })

  it('同一列上还有更新的一条改名时,旧的那条报的是「又被改过 N 次」', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }],
    })
    store.renamePaperOption('du-fa', '精读', '细读')
    const older = store.listChanges()[0]!
    store.renamePaperOption('du-fa', '细读', '通读')

    expect(() => store.undoChange(older.id))
      .toThrow('这条之后该实体又被改过 1 次，先撤销较新的那几条')
    expect(store.listChanges().find((c) => c.id === older.id)).toMatchObject({ undone: false })
  })

  it('改类型记一条 columnType 型变动,撤销把列、分组里的位置与格子一起写回', () => {
    const tags = { key: 'tags', label: '标签', type: 'multi' as const, options: ['综述', '必读'] }
    store.setPaperColumns({ hidden: [], custom: [tags], groups: ['topics', 'tags', 'readState'] })
    const [a, b] = store.listPapers({ page: 1, size: 2 }).rows.map((r) => r.id)
    store.updatePaper(a!, { custom: { tags: ['综述'] } })
    store.updatePaper(b!, { custom: { tags: ['综述', '必读'] } })
    store.setPaperColumnType('tags', 'text')

    const top = store.listChanges()[0]!
    expect(top.title).toBe('论文表 · 列「标签」的类型 多选 → 文本')
    expect(top.diff).toEqual(['- 类型：多选', '+ 类型：文本'])
    expect(store.paperColumns().groups).toEqual(['topics', 'readState'])

    store.undoChange(top.id)
    expect(store.paperColumns()).toEqual({ hidden: [], custom: [tags], groups: ['topics', 'tags', 'readState'] })
    expect([a, b].map((id) => store.getPaper(id!).custom)).toEqual([{ tags: ['综述'] }, { tags: ['综述', '必读'] }])
    expect(store.listChanges()[0]).toMatchObject({
      title: '撤销：论文表 · 列「标签」的类型 多选 → 文本', diff: ['- 类型：文本', '+ 类型：多选'],
    })
  })

  it('改类型之后这一列又有格子被填过:撤销被拒,说的是这一列之后又改过,那一格留着', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
    const [a, b] = store.listPapers({ page: 1, size: 2 }).rows.map((r) => r.id)
    store.updatePaper(a!, { custom: { note: '读到一半' } })
    store.setPaperColumnType('note', 'multi')
    const top = store.listChanges()[0]!
    store.updatePaper(b!, { custom: { note: ['读到一半'] } })

    expect(() => store.undoChange(top.id)).toThrow('这一列之后又改过，撤销会盖掉那次改动')
    expect(store.getPaper(b!).custom).toEqual({ note: ['读到一半'] })
    expect(store.paperColumns().custom[0]!.type).toBe('multi')
  })

  it('同一列连着改两次类型:撤较早的那条报「又被改过 1 次」', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
    store.setPaperColumnType('note', 'select')
    const older = store.listChanges()[0]!
    store.setPaperColumnType('note', 'multi')
    expect(() => store.undoChange(older.id)).toThrow('这条之后该实体又被改过 1 次，先撤销较新的那几条')
  })

  it('选择改多选之后自己去掉了这一列的分组:撤销改类型不把分组加回来', () => {
    store.setPaperColumns({
      hidden: [], custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }], groups: ['topics', 'du-fa'],
    })
    store.setPaperColumnType('du-fa', 'multi')
    const change = store.listChanges()[0]!
    store.setPaperColumns({ ...store.paperColumns(), groups: ['topics'] })
    store.undoChange(change.id)
    expect(store.paperColumns().groups).toEqual(['topics'])
  })

  it('清空一格之后这一列改了类型:撤销那次清空被拒,格子仍空,列集合照样改得动', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
    const a = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.updatePaper(a, { custom: { note: 'x' } })
    store.updatePaper(a, { custom: { note: null } })
    const cleared = store.listChanges()[0]!
    store.setPaperColumnType('note', 'multi')

    expect(() => store.undoChange(cleared.id))
      .toThrow('这篇论文的「备注」列之后改过类型或选项，撤销会写进这一列现在放不下的值')
    expect(store.getPaper(a).custom).toEqual({})
    expect(() => store.setPaperColumns({ ...store.paperColumns(), hidden: ['topics'] })).not.toThrow()
  })

  it('选项改名之后:撤销一条更早的、快照里写着旧选项的论文改动被拒', () => {
    store.setPaperColumns({
      ...emptyColumns(), custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] }],
    })
    const a = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.updatePaper(a, { custom: { 'du-fa': '精读' } })
    store.updatePaper(a, { custom: { 'du-fa': '略读' } })
    const earlier = store.listChanges()[0]!
    store.renamePaperOption('du-fa', '精读', '细读')

    expect(() => store.undoChange(earlier.id))
      .toThrow('这篇论文的「读法」列之后改过类型或选项，撤销会写进这一列现在放不下的值')
    expect(store.getPaper(a).custom).toEqual({ 'du-fa': '略读' })
  })

  for (const via of ['从垃圾桶恢复', '撤销删除'] as const) {
    it(`删掉的论文在这一列改类型之后${via}:论文回来,放不下的格子清掉并记一条,列集合照样改得动`, () => {
      store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
      const [a, b] = store.listPapers({ page: 1, size: 2 }).rows.map((r) => r.id)
      store.updatePaper(a!, { custom: { note: 'x' } })
      store.updatePaper(b!, { custom: { note: 'y' } })
      const title = store.getPaper(a!).title
      store.deletePaper(a!)
      const deletion = store.listChanges()[0]!
      store.setPaperColumnType('note', 'multi')

      if (via === '撤销删除') store.undoChange(deletion.id)
      else store.restoreTrash(store.listTrash().find((t) => t.kind === 'paper' && t.title === title)!.id)

      expect(() => store.setPaperColumns({ ...store.paperColumns(), hidden: ['topics'] })).not.toThrow()
      expect(store.getPaper(a!).custom).toEqual({})
      expect(store.listChanges().find((c) => c.title === `论文「${title}」· 改了字段`)!.diff)
        .toContain('- 备注：x')
    })
  }

  it('删掉的论文在选项改名之后从垃圾桶恢复:写着旧选项的格子清掉并记一条,列集合照样改得动', () => {
    store.setPaperColumns({
      ...emptyColumns(), custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] }],
    })
    const a = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.updatePaper(a, { custom: { 'du-fa': '精读' } })
    const title = store.getPaper(a).title
    store.deletePaper(a)
    store.renamePaperOption('du-fa', '精读', '细读')
    store.restoreTrash(store.listTrash().find((t) => t.kind === 'paper' && t.title === title)!.id)

    expect(() => store.setPaperColumns({ ...store.paperColumns(), hidden: ['topics'] })).not.toThrow()
    expect(store.getPaper(a).custom).toEqual({})
    expect(store.listChanges().find((c) => c.title === `论文「${title}」· 改了字段`)!.diff)
      .toContain('- 读法：精读')
  })

  it('删掉的论文恢复时格子都放得下:不多写一格,也不多记一条', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
    const a = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.updatePaper(a, { custom: { note: 'x' } })
    const title = store.getPaper(a).title
    store.deletePaper(a)
    const changes = store.listChanges().length
    store.restoreTrash(store.listTrash().find((t) => t.kind === 'paper' && t.title === title)!.id)

    expect(store.listChanges().length).toBe(changes)
    expect(store.getPaper(a).custom).toEqual({ note: 'x' })
  })

  it('真的不在了的论文、项目和列才算不在:删掉的撤得回来,列移除之后的改动撤不了', () => {
    const paper = store.getPaper('Jiang-et-al-2024-Mixtral-of-Experts')
    store.deletePaper(paper.id)
    store.undoChange(recorded()[0]!.id)
    expect(store.getPaper(paper.id)).toEqual(paper)

    const project = store.getProject(PROJECT)
    store.deleteProject(PROJECT)
    store.undoChange(recorded()[0]!.id)
    expect(store.getProject(PROJECT)).toEqual(project)

    const column = { key: 'du-fa', label: '读法', type: 'select' as const, options: ['精读'] }
    store.setPaperColumns({ ...emptyColumns(), custom: [column] })
    store.renamePaperOption('du-fa', '精读', '细读')
    const renamed = recorded()[0]!
    store.setPaperColumns(emptyColumns())
    expect(() => store.undoChange(renamed.id)).toThrow('这一列之后又改过，撤销会盖掉那次改动')

    store.setPaperColumns({ ...emptyColumns(), custom: [column] })
    store.setPaperColumnType('du-fa', 'multi')
    const retyped = recorded()[0]!
    store.setPaperColumns(emptyColumns())
    expect(() => store.undoChange(retyped.id)).toThrow('这一列之后又改过，撤销会盖掉那次改动')
  })

  it('项目读不出来时,撤销和改动都报出读不出来的原因,不当它已经不在', () => {
    const fixture = createFixtureStore(today)
    const corruption = `科研图的边指向不存在的节点:${PROJECT}.a → ${PROJECT}.gone`
    let corrupt = false
    let rows: ChangeRecord[] = []
    const logged = withChangelog({
      ...fixture,
      getProject: (id) => {
        if (corrupt && id === PROJECT) throw new Error(corruption)
        return fixture.getProject(id)
      },
    }, { load: () => rows, save: (next) => { rows = next }, nextId: () => `change-${rows.length + 1}` })
    logged.updateProject(PROJECT, { focus: '改过的焦点' })
    const change = logged.listChanges()[0]!

    corrupt = true
    expect(() => logged.undoChange(change.id)).toThrow(corruption)
    expect(logged.listChanges()[0]).toMatchObject({ id: change.id, undone: false })
    expect(() => logged.updateProject(PROJECT, { focus: '再改一次' })).toThrow(corruption)
    expect(fixture.getProject(PROJECT).focus).toBe('改过的焦点')
  })
})

describe('change lines', () => {
  let store: VaultStore
  beforeEach(() => {
    store = createFixtureStore(() => '2026-08-25')
  })

  /** The change lines of the record `write` adds. */
  const linesOf = (write: () => unknown): string[] => {
    write()
    return store.listChanges()[0]!.diff
  }

  it('每个改动的字段一行,写的是字段名与读得懂的值', () => {
    expect(linesOf(() => store.updateProject(PROJECT, { priority: 'p1', due: '2026-09-30' })))
      .toEqual(['- 优先级：紧急', '+ 优先级：常规', '- 截止：9月15日', '+ 截止：9月30日'])
    expect(linesOf(() => store.updateProject(PROJECT, { focus: '改过的焦点' })))
      .toEqual(['- 当前目标：宽树实验补 B≥8 + 前缀复用配置', '+ 当前目标：改过的焦点'])
    expect(linesOf(() => store.updatePaper(READ, { readState: '在读' })))
      .toEqual(['- 阅读状态：未读', '+ 阅读状态：在读'])
  })

  it('库里早先建的自定义列已经叫阅读状态时,内置阅读状态的行写作它原来的名字状态,两列的行分得开', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'yuedu', label: '阅读状态', type: 'select', options: ['核心'] }] })
    expect(linesOf(() => store.updatePaper(READ, { readState: '在读', custom: { yuedu: '核心' } })))
      .toEqual(['- 状态：未读', '+ 状态：在读', '+ 阅读状态：核心'])
  })

  it('列表里的一项按名字记:新增、删掉一行,改了的那项每个字段一行', () => {
    expect(linesOf(() => store.createTask(PROJECT, {
      title: '新任务', start: '2026-08-25', end: '2026-08-31', state: 'act', priority: 'p1',
    }))).toEqual(['+ 任务：新任务'])
    expect(linesOf(() => store.updateTask(PROJECT, 't2', { end: '2026-09-02', state: 'done' }))).toEqual([
      '- 任务「宽树实验 B≥8」· 结束：8月28日', '+ 任务「宽树实验 B≥8」· 结束：9月2日',
      '- 任务「宽树实验 B≥8」· 状态：进行中', '+ 任务「宽树实验 B≥8」· 状态：已完成',
    ])
    expect(linesOf(() => store.deleteMilestone(PROJECT, 'm2'))).toEqual(['- 里程碑：宽树实验补 B≥8 + 前缀复用配置'])
    expect(linesOf(() => store.addPaper(PROJECT, '2210.17323')))
      .toEqual(['+ 关联论文：GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers'])
    expect(linesOf(() => store.createEvent(PROJECT, '记一笔'))).toEqual(['+ 科研记录：记一笔'])
  })

  it('建出或删掉整个项目、整篇论文是一行,写的是它的名字', () => {
    expect(linesOf(() => store.deleteProject(PROJECT))).toEqual(['- 项目：draft 效率'])
    expect(linesOf(() => store.deletePaper(READ))).toEqual(['- 论文：Mixtral of Experts'])
  })

  it('没有一行露出存储里的键或 JSON', () => {
    const column = { key: 'du-fa', label: '读法', type: 'select' as const, options: ['精读', '略读'] }
    const writes = [
      () => store.updateProject(PROJECT, { status: '搁置', block: '等数据', start: '2026-06-01' }),
      () => store.updateMilestone(PROJECT, 'm3', { done: true, date: '2026-09-06' }),
      () => store.createRelation(PROJECT, { group: 'Wiki', text: '新关联' }),
      () => store.updateRelation(PROJECT, store.getProject(PROJECT).relations[0]!.items[0]!.id, { text: '改名' }),
      () => store.createAttachment(PROJECT, { name: '新附件.csv', size: '1 KB', path: resolve('新附件.csv') }),
      () => store.updateTask(PROJECT, 't3', { window: { start: '08:00', end: '10:00' }, note: '先跑基线', priority: 'p0' }),
      () => store.updatePaper(READ, { rating: 4, authors: ['Albert Q. Jiang', 'Alexandre Sablayrolles'], year: 2023 }),
      () => store.setPaperColumns({ ...emptyColumns(), custom: [column] }),
      () => store.updatePaper(READ, { custom: { 'du-fa': '精读' } }),
      () => store.renamePaperOption('du-fa', '精读', '细读'),
      () => store.setPaperColumnType('du-fa', 'multi'),
      () => store.mutatePaperReading(READ, { kind: 'remark.set', text: '一段随笔' }),
      () => store.mutatePaperReading(READ, {
        kind: 'note.delete', id: store.mutatePaperReading(READ, { kind: 'note.add', page: 2, text: '要删的' }).notes[0]!.id,
      }),
    ]
    const lines = writes.flatMap(linesOf)
    expect(lines.length).toBeGreaterThan(writes.length)
    expect(lines.filter((line) => !/^[+-] [^:：{}"]+：/.test(line) || /[{}"]/.test(line))).toEqual([])
  })

  /** The display lines of the record `write` adds. */
  const shownOf = (write: () => unknown): ChangeEntry['lines'] => {
    write()
    return store.listChanges()[0]!.lines
  }
  const GPTQ = 'GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers'

  it('改动行里的论文名显示为论文文本', () => {
    expect(shownOf(() => store.addPaper(PROJECT, '2210.17323'))).toEqual([['+ 关联论文：', { paper: GPTQ }]])
    expect(shownOf(() => store.updatePaper(READ, { title: 'Mixtral of $2\\times$ Experts' }))).toEqual([
      ['- 标题：', { paper: 'Mixtral of Experts' }], ['+ 标题：', { paper: 'Mixtral of $2\\times$ Experts' }],
    ])
    expect(shownOf(() => store.deletePaper('2210.17323'))).toEqual([['- 论文：', { paper: GPTQ }]])
  })

  it('Wiki 的提案行与正文行按页名显示,论文页名是论文文本', () => {
    expect(shownOf(() => store.applyProposal({
      source: 'ingest', title: '给 PTQ 记一条',
      ops: [{ op: 'appendEntry', page: 'topics/ptq', section: '未解决', date: '2026-08-25', text: '一条' }],
    }))).toEqual([['+ PTQ § 未解决:一条']])
    expect(shownOf(() => store.updateWikiPage('papers/2210.17323', '## 这篇说了什么\n改过。'))).toEqual([['~ ', { paper: GPTQ }]])
  })

  it('早先记下的行同样按页名显示,结论按它所在的页;库里没有的页照写,存下的行一字不变', () => {
    const stored = ['+ papers/2210.17323 ∈ topics/ptq(1 格)', '~ topics/ptq#gone 冲突 topics/nope#x', '~ topics/gone']
    const rows: ChangeRecord[] = [{
      id: 'change-1', title: 'Wiki · 早先的一条', meta: null, source: '笔记', diff: [...stored], target: null, after: '',
      at: Date.UTC(2026, 7, 20), undone: false, archived: false, restore: null,
    }]
    const logged = withChangelog(store, { load: () => rows, save: () => {}, nextId: () => 'change-2' })
    expect(logged.listChanges()[0]).toMatchObject({
      diff: stored,
      lines: [['+ ', { paper: GPTQ }, ' ∈ PTQ(1 格)'], ['~ PTQ 冲突 topics/nope#x'], ['~ topics/gone']],
    })
  })

  it('变动标题里的动作和界面用同一个词:添加任务、里程碑、关联与附件,记入科研记录,新建列与选项', () => {
    const titleOf = (write: () => unknown): string => {
      write()
      return store.listChanges()[0]!.title
    }
    expect([
      titleOf(() => store.createTask(PROJECT, { title: '新任务', start: '2026-08-25', end: '2026-08-31', state: 'act', priority: 'p1' })),
      titleOf(() => store.createMilestone(PROJECT, { date: '2026-09-01', title: '新里程碑', done: false })),
      titleOf(() => store.createRelation(PROJECT, { group: 'Wiki', text: '新关联' })),
      titleOf(() => store.createAttachment(PROJECT, { name: '新附件.csv', size: '1 KB', path: resolve('新附件.csv') })),
      titleOf(() => store.createEvent(PROJECT, '记一笔')),
    ]).toEqual(['添加任务', '添加里程碑', '添加关联', '添加附件', '记入科研记录'].map((what) => `项目「draft 效率」· ${what}`))
    const column = { key: 'du-fa', label: '读法', type: 'select' as const, options: [] as string[] }
    expect(titleOf(() => store.setPaperColumns({ ...emptyColumns(), custom: [column] }))).toBe('论文表 · 新建列「读法」')
    expect(titleOf(() => store.setPaperColumns({ ...emptyColumns(), custom: [{ ...column, options: ['精读'] }] })))
      .toBe('论文表 · 列「读法」新建选项「精读」')
  })
})
