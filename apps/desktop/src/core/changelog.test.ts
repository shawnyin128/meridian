import { beforeEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import type { ChangeEntry } from '../shared/contract.js'
import { TRASH_RETENTION_DAYS } from '../shared/vocabulary.js'
import { createFixtureStore } from './fixture-store.js'
import { minimalPdf } from './net/minimal-pdf.js'
import { emptyColumns } from './paper-library/index.js'
import type { VaultStore } from './vault.js'

/** Seeded fixture history predates this feature and lacks restoration data. */
const SEEDED = 4

/** Fixture project and one of its papers. */
const PROJECT = 'draft'

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
      diff: ['- focus: "宽树实验补 B≥8 + 前缀复用配置"', '+ focus: "改过的焦点"'],
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
    expect(store.getProject(PROJECT)).toEqual(before)

    const rows = recorded()
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ id: change.id, undone: true, undoable: false })
    expect(rows[0]).toMatchObject({
      title: '撤销:项目「draft 效率」· 改了字段', source: '我', undone: false,
    })
    // This is history, not an undo stack; the undo action cannot itself be undone.
    expect(rows[0]!.undoable).toBe(false)
    expect(rows[0]!.diff).toEqual([
      '- status: "搁置"', '+ status: "进行中"',
      '- focus: "改过的焦点"', '+ focus: "宽树实验补 B≥8 + 前缀复用配置"',
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
    expect(rows[0]).toMatchObject({ title: '撤销:项目「draft 效率」· 改了字段', archived: false })
  })

  it('归一条库里没有的,说清是哪一条', () => {
    expect(() => store.archiveChange('chg-没有这一条')).toThrow(/最近变动里没有这一条/)
  })

  it('删除一条只清掉记录与撤销快照,不改被记录的知识内容', () => {
    store.updateProject(PROJECT, { focus: '删除记录也保留的改动' })
    const change = recorded()[0]!
    const project = store.getProject(PROJECT)

    store.deleteChange(change.id)

    expect(store.listChanges().some((row) => row.id === change.id)).toBe(false)
    expect(store.getProject(PROJECT)).toEqual(project)
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
    // Trash is already a restoration mechanism; logging it again would create an "undo restore" entry.
    store.restoreTrash(store.listTrash().find((t) => t.kind === 'inbox')!.id)
    store.dismissInbox('drafterlite')
    store.purgeTrash(store.listTrash()[0]!.id)
    store.clearTrash()

    expect(store.listChanges()).toEqual(before)
  })

  it('改变持久知识的那 19 个写各记一条', () => {
    const writes: [string, () => unknown][] = [
      ['papers.update', () => store.updatePaper('Jiang-et-al-2024-Mixtral-of-Experts', { readState: '在读' })],
      ['papers.setColumnType', () => {
        store.setPaperColumns({
          ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
        })
        store.setPaperColumnType('note', 'select')
      }],
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
      ['project.createAttachment', () =>
        store.createAttachment(PROJECT, {
          name: '新附件.csv', size: '1 KB', path: resolve('新附件.csv'),
        })],
      ['project.deleteAttachment', () =>
        store.deleteAttachment(PROJECT, store.getProject(PROJECT).attachments[0]!.id)],
      ['project.createEvent', () => store.createEvent(PROJECT, '[对话] 来自对话的结论')],
      ['project.delete', () => store.deleteProject(PROJECT)],
    ]
    expect(writes).toHaveLength(19)

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
      title: '撤销:Wiki · 给 PTQ 记一条', diff: ['~ topics/ptq'],
    })
  })

  it('新建的东西撤销之后就不在了,删掉的东西撤销之后回来了', () => {
    store.createProject('要撤销掉的项目')
    const created = store.listProjects().at(-1)!.id
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
    expect(store.getProject(PROJECT).tasks.at(-1)!.title).toBe('要撤销的任务')
    store.undoChange(recorded()[0]!.id)
    expect(store.getProject(PROJECT)).toEqual(before)
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
      .toEqual(['archived', 'date', 'diff', 'id', 'meta', 'source', 'title', 'undoable', 'undone'])
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
    expect(top.diff).toEqual(['- du-fa: "精读"', '+ du-fa: "细读"'])
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
    expect(() => store.undoChange(top.id)).toThrow('这一列之后又改过,撤销会盖掉那次改动')
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
      .toThrow('这条之后该实体又被改过 1 次,先撤销较新的那几条')
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
    expect(top.diff).toEqual(['- tags: "多选"', '+ tags: "文本"'])
    expect(store.paperColumns().groups).toEqual(['topics', 'readState'])

    store.undoChange(top.id)
    expect(store.paperColumns()).toEqual({ hidden: [], custom: [tags], groups: ['topics', 'tags', 'readState'] })
    expect([a, b].map((id) => store.getPaper(id!).custom)).toEqual([{ tags: ['综述'] }, { tags: ['综述', '必读'] }])
    expect(store.listChanges()[0]).toMatchObject({
      title: '撤销:论文表 · 列「标签」的类型 多选 → 文本', diff: ['- tags: "文本"', '+ tags: "多选"'],
    })
  })

  it('改类型之后这一列又有格子被填过:撤销被拒,说的是这一列之后又改过,那一格留着', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
    const [a, b] = store.listPapers({ page: 1, size: 2 }).rows.map((r) => r.id)
    store.updatePaper(a!, { custom: { note: '读到一半' } })
    store.setPaperColumnType('note', 'multi')
    const top = store.listChanges()[0]!
    store.updatePaper(b!, { custom: { note: ['读到一半'] } })

    expect(() => store.undoChange(top.id)).toThrow('这一列之后又改过,撤销会盖掉那次改动')
    expect(store.getPaper(b!).custom).toEqual({ note: ['读到一半'] })
    expect(store.paperColumns().custom[0]!.type).toBe('multi')
  })

  it('同一列连着改两次类型:撤较早的那条报「又被改过 1 次」', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
    store.setPaperColumnType('note', 'select')
    const older = store.listChanges()[0]!
    store.setPaperColumnType('note', 'multi')
    expect(() => store.undoChange(older.id)).toThrow('这条之后该实体又被改过 1 次,先撤销较新的那几条')
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
      .toThrow('这篇论文的「备注」列之后改过类型或选项,撤销会写进这一列现在放不下的值')
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
      .toThrow('这篇论文的「读法」列之后改过类型或选项,撤销会写进这一列现在放不下的值')
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
        .toContain('- custom: {"note":"x"}')
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
      .toContain('- custom: {"du-fa":"精读"}')
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
})
