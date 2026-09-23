import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import papersFixture from './fixtures/papers.json' with { type: 'json' }
import { createFixtureStore } from './fixture-store.js'
import { minimalPdf } from './net/minimal-pdf.js'
import { emptyColumns } from './paper-library/index.js'
import {
  CONTRACT_METHODS, PaperRowSchema, ProjectDetailSchema, ProjectOverviewSchema,
  ProjectSummarySchema,
} from '../shared/contract.js'
import { SEARCH_LIMIT, TRASH_RETENTION_DAYS } from '../shared/vocabulary.js'
import type { VaultStore } from './vault.js'

/** Only source PDFs touch disk, so tests use a vault containing a single source file. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')
/** Paper page backed by that source. Its id is the page filename; the source is `<source_id>-<slug>.pdf`. */
const WITH_SOURCE = '13979-STAR-Speculative-Decodin'

/**
 * Fixture epoch around which all fixture dates are arranged before shifting to vault today. These
 * tests set today to the epoch so the shift is zero and assertions can use fixture dates verbatim.
 */
const EPOCH = '2026-08-25'

/** Date `days` after the fixture epoch. */
const afterEpoch = (days: number) =>
  new Date(Date.parse(`${EPOCH}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Current system date in ISO format, used when `vault.today` supplies no override. */
const systemDate = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Number of days between two ISO dates. */
const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000

/**
 * Store whose current day can advance. Deletion records vault today and retention uses the same clock,
 * so deleting and then calling `advance(days)` makes the entry `days` old.
 */
function movableStore() {
  let day = EPOCH
  return {
    store: createFixtureStore(() => day),
    advance: (days: number) => { day = afterEpoch(days) },
  }
}

describe('fixture store', () => {
  let store: VaultStore

  beforeEach(() => {
    vi.stubEnv('MERIDIAN_LIBRARY_ROOT', VAULT)
    store = createFixtureStore(() => EPOCH)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('不给今天时,库里的今天是系统日期,不是编排 fixture 用的那一天', () => {
    expect(createFixtureStore().today()).toBe(systemDate())
    expect(createFixtureStore().today()).not.toBe(EPOCH)
    expect(createFixtureStore(() => '2027-01-31').today()).toBe('2027-01-31')
  })

  it('fixture 的日期跟着库里的今天走:换一天建库,每个日期平移同样多天', () => {
    const days = 100
    const moved = createFixtureStore(() => afterEpoch(days))
    const before = store.getProject('draft')
    const after = moved.getProject('draft')

    expect(daysBetween(before.start, after.start)).toBe(days)
    expect(daysBetween(before.due, after.due)).toBe(days)
    expect(after.tasks.map((t, i) => daysBetween(before.tasks[i]!.start, t.start)))
      .toEqual(before.tasks.map(() => days))
    expect(after.tasks.map((t, i) => daysBetween(before.tasks[i]!.end, t.end)))
      .toEqual(before.tasks.map(() => days))
    expect(after.milestones.map((m, i) => daysBetween(before.milestones[i]!.date, m.date)))
      .toEqual(before.milestones.map(() => days))
    expect(after.events.map((e, i) => daysBetween(before.events[i]!.date, e.date)))
      .toEqual(before.events.map(() => days))
    expect(moved.listLater().map((e, i) => daysBetween(store.listLater()[i]!.added, e.added)))
      .toEqual(store.listLater().map(() => days))

    // Each date keeps the same distance from today, so buckets are stable regardless of execution day.
    expect(moved.listLater().map((e) => e.day)).toEqual(store.listLater().map((e) => e.day))
  })

  it('连着 400 天每天照系统日期建一次库,分段与每个日期离今天的距离都不变', () => {
    const shapes = new Set<string>()
    const days: string[] = []
    for (let i = 0; i < 400; i++) {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 12) + i * 86_400_000))
      const day = createFixtureStore()
      days.push(day.today())
      shapes.add(JSON.stringify({
        later: day.listLater().map((e) => [e.id, e.day, daysBetween(day.today(), e.added)]),
        projects: day.overviewProjects().flatMap((p) => [
          daysBetween(day.today(), p.start), daysBetween(day.today(), p.due),
          ...p.milestones.map((m) => daysBetween(day.today(), m.date)),
          ...p.events.map((e) => daysBetween(day.today(), e.date)),
        ]),
        tasks: day.getProject('draft').tasks
          .map((t) => [daysBetween(day.today(), t.start), daysBetween(day.today(), t.end)]),
      }))
      vi.useRealTimers()
    }
    // Four hundred days cross month ends, year ends, and February; every day is unique while the fixture shape remains stable.
    expect(new Set(days).size).toBe(400)
    expect(shapes.size).toBe(1)
    expect([...shapes][0]).toContain('["upsurvey","今天",0]')
    expect([...shapes][0]).toContain('["mixtral","更早",-13]')
  })

  it('分页返回论文并给出总数', () => {
    const first = store.listPapers({ page: 1, size: 20 })
    expect(first.rows).toHaveLength(20)
    expect(first.total).toBe(291)
  })

  it('最后一页不足一屏时只返回剩下的', () => {
    const last = store.listPapers({ page: 15, size: 20 })
    expect(last.rows).toHaveLength(11)
  })

  it('筛选匹配标题或主题', () => {
    const hit = store.listPapers({ page: 1, size: 200, filter: 'quantization' })
    expect(hit.total).toBeGreaterThan(0)
    const matches = (r: { title: string; topics: string[] }) =>
      `${r.title}${r.topics.join()}`.toLowerCase().includes('quantization')
    expect(hit.rows.every(matches)).toBe(true)
    // Include topic-only matches or the filter would be only a title search.
    expect(hit.rows.some((r) => !r.title.toLowerCase().includes('quantization'))).toBe(true)
  })

  it('排序方向翻转后首行换人', () => {
    const asc = store.listPapers({ page: 1, size: 1, sort: 'title', direction: 'asc' })
    const desc = store.listPapers({ page: 1, size: 1, sort: 'title', direction: 'desc' })
    expect(asc.rows[0]!.id).not.toBe(desc.rows[0]!.id)
  })

  it('按字段分组给出全部取值与各自计数', () => {
    // Vault pages omit reading state, so all 291 papers appear with the unread default.
    const byReadState = store.facetPapers('readState')
    expect(byReadState).toEqual([{ value: '未读', count: 291, newestTitle: expect.any(String) }])

    const byTopic = store.facetPapers('topics')
    const spec = byTopic.find((f) => f.value === 'speculative decoding')
    expect(spec?.count).toBe(32)
    // Facet counts must match list totals for the same value or index and table views diverge.
    expect(store.listPapers({
      page: 1, size: 10, facet: { field: 'topics', value: 'speculative decoding' },
    }).total).toBe(32)
  })

  it('带筛选词的分组只算筛选命中的论文,计数与列表总数一致', () => {
    const filter = 'quantization'
    const total = store.listPapers({ page: 1, size: 1, filter }).total
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThan(291)

    // Each paper has one read state, so read-state facet counts sum to the filtered paper count.
    const byReadState = store.facetPapers('readState', filter)
    expect(byReadState.reduce((n, f) => n + f.count, 0)).toBe(total)

    // Every facet value must match its filtered list total or the chip count disagrees with the result count.
    const topic = store.facetPapers('topics', filter)[0]!
    expect(store.listPapers({
      page: 1, size: 1, filter, facet: { field: 'topics', value: topic.value },
    }).total).toBe(topic.count)
  })

  it('取一篇论文的原文,拿到的是 vault 里那个 PDF 文件本身', () => {
    const bytes = store.paperSource(WITH_SOURCE)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(bytes.length).toBe(870)
  })

  it('库里没有原文的那一篇会抛出而不是返回空', () => {
    const other = store.listPapers({ page: 1, size: 200 }).rows
      .find((r) => r.id !== WITH_SOURCE)!
    expect(() => store.paperSource(other.id)).toThrow(new RegExp(other.id))
  })

  it('删除论文后列表与分组里都读不到它', () => {
    const id = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.deletePaper(id)
    const after = store.listPapers({ page: 1, size: 200 })
    expect(after.total).toBe(290)
    expect(after.rows.some((r) => r.id === id)).toBe(false)
    expect(() => store.getPaper(id)).toThrow(new RegExp(id))
    expect(store.facetPapers('readState')[0]!.count).toBe(290)
  })

  it('删不存在的论文会抛出而不是静默无事发生', () => {
    expect(() => store.deletePaper('no-such-paper')).toThrow(/no-such-paper/)
  })

  it('删掉的论文进垃圾桶,恢复后又回到列表', () => {
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    store.deletePaper(paper.id)

    const entries = store.listTrash()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      id: expect.any(String), kind: 'paper', title: paper.title, deletedAt: expect.any(Number),
      restorable: true,
    })

    store.restoreTrash(entries[0]!.id)
    expect(store.listTrash()).toEqual([])
    expect(store.listPapers({ page: 1, size: 1 }).total).toBe(291)
    expect(store.getPaper(paper.id).title).toBe(paper.title)
  })

  it('删掉的附件进垃圾桶,恢复后又回到项目', () => {
    const attachment = store.getProject('draft').attachments[0]!
    store.deleteAttachment('draft', attachment.id)

    const entries = store.listTrash()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.kind).toBe('attachment')
    expect(entries[0]!.title).toBe(attachment.name)

    store.restoreTrash(entries[0]!.id)
    expect(store.listTrash()).toEqual([])
    expect(store.getProject('draft').attachments).toContainEqual(attachment)
  })

  it('原项目也被删掉时那条附件恢复不了,项目恢复回来它跟着能恢复', () => {
    const attachment = store.getProject('draft').attachments[0]!
    store.deleteAttachment('draft', attachment.id)
    store.deleteProject('draft')

    const orphan = store.listTrash().find((e) => e.kind === 'attachment')!
    expect(orphan.restorable).toBe(false)
    expect(() => store.restoreTrash(orphan.id)).toThrow(/draft/)
    // A failed restoration must not silently remove the item from trash.
    expect(store.listTrash().map((e) => e.id)).toContain(orphan.id)

    store.restoreTrash(store.listTrash().find((e) => e.kind === 'project')!.id)
    expect(store.listTrash().find((e) => e.id === orphan.id)!.restorable).toBe(true)
    store.restoreTrash(orphan.id)
    expect(store.getProject('draft').attachments).toContainEqual(attachment)
  })

  it('垃圾桶里最新删掉的排在最前', () => {
    const [first, second] = store.listPapers({ page: 1, size: 2 }).rows
    store.deletePaper(first!.id)
    store.deletePaper(second!.id)
    expect(store.listTrash().map((e) => e.title)).toEqual([second!.title, first!.title])
  })

  it('删除时刻记的是库里的今天,不是本机的系统时钟', () => {
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    store.deletePaper(paper.id)
    expect(store.listTrash()[0]!.deletedAt).toBe(Date.parse(`${EPOCH}T00:00:00Z`))
    // The epoch is historical and precedes the system clock; equality would mean the clocks were conflated.
    expect(Date.parse(`${EPOCH}T00:00:00Z`)).toBeLessThan(Date.now())
  })

  it('库里的今天往后挪一天,同一下删除记的时刻跟着挪一天', () => {
    const { store: movable, advance } = movableStore()
    const [first, second] = movable.listPapers({ page: 1, size: 2 }).rows
    movable.deletePaper(first!.id)
    advance(1)
    movable.deletePaper(second!.id)
    const stamps = movable.listTrash().map((e) => e.deletedAt)
    expect(stamps).toEqual([
      Date.parse(`${afterEpoch(1)}T00:00:00Z`), Date.parse(`${EPOCH}T00:00:00Z`),
    ])
  })

  // Each of the next three tests starts from one entry point. Listing first would sweep expired items,
  // leaving later entry points unable to prove that they perform their own sweep.
  it('删了 8 天的那一条不再列出,它存着的内容一并没了', () => {
    const { store: movable, advance } = movableStore()
    const paper = movable.listPapers({ page: 1, size: 1 }).rows[0]!
    movable.deletePaper(paper.id)
    expect(movable.listTrash()[0]!.title).toBe(paper.title)

    advance(8)
    expect(movable.listTrash()).toEqual([])
    expect(() => movable.getPaper(paper.id)).toThrow(new RegExp(paper.id))
    expect(movable.listPapers({ page: 1, size: 1 }).total).toBe(290)
  })

  it('删了 8 天的那一条恢复不回来', () => {
    const { store: movable, advance } = movableStore()
    const paper = movable.listPapers({ page: 1, size: 1 }).rows[0]!
    movable.deletePaper(paper.id)
    const entry = movable.listTrash()[0]!

    advance(8)
    expect(() => movable.restoreTrash(entry.id)).toThrow(new RegExp(entry.id))
    expect(() => movable.getPaper(paper.id)).toThrow(new RegExp(paper.id))
  })

  it('删满保留期那一天的条目已经出局,边界日算在外', () => {
    const { store: movable, advance } = movableStore()
    const paper = movable.listPapers({ page: 1, size: 1 }).rows[0]!
    movable.deletePaper(paper.id)
    const entry = movable.listTrash()[0]!

    advance(TRASH_RETENTION_DAYS)
    expect(movable.listTrash()).toEqual([])
    expect(() => movable.restoreTrash(entry.id)).toThrow(new RegExp(entry.id))
    expect(() => movable.getPaper(paper.id)).toThrow(new RegExp(paper.id))
  })

  it('删了 6 天的那一条还在垃圾桶里,仍然恢复得回来', () => {
    const { store: movable, advance } = movableStore()
    const paper = movable.listPapers({ page: 1, size: 1 }).rows[0]!
    movable.deletePaper(paper.id)
    const entry = movable.listTrash()[0]!

    advance(6)
    expect(movable.listTrash().map((e) => e.id)).toEqual([entry.id])
    movable.restoreTrash(entry.id)
    expect(movable.getPaper(paper.id).title).toBe(paper.title)
    expect(movable.listPapers({ page: 1, size: 1 }).total).toBe(291)
  })

  it('过了保留期的那一条清掉,没到期的留下', () => {
    const { store: movable, advance } = movableStore()
    const [old, fresh] = movable.listPapers({ page: 1, size: 2 }).rows
    movable.deletePaper(old!.id)
    const expired = movable.listTrash()[0]!
    advance(8)
    movable.deletePaper(fresh!.id)

    expect(() => movable.purgeTrash(expired.id)).toThrow(new RegExp(expired.id))
    expect(movable.listTrash().map((e) => e.title)).toEqual([fresh!.title])
  })

  it('恢复或彻底删除不存在的条目会抛出而不是静默无事发生', () => {
    expect(() => store.restoreTrash('no-such-entry')).toThrow(/no-such-entry/)
    expect(() => store.purgeTrash('no-such-entry')).toThrow(/no-such-entry/)
  })

  it('彻底删掉的一条既不在垃圾桶里,也恢复不回来', () => {
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    store.deletePaper(paper.id)
    const entryId = store.listTrash()[0]!.id

    store.purgeTrash(entryId)
    expect(store.listTrash()).toEqual([])
    expect(() => store.restoreTrash(entryId)).toThrow(new RegExp(entryId))
    expect(() => store.getPaper(paper.id)).toThrow(new RegExp(paper.id))
    expect(store.listPapers({ page: 1, size: 1 }).total).toBe(290)
  })

  it('清空垃圾桶后一条不剩,清掉的东西也恢复不回来', () => {
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    const attachment = store.getProject('draft').attachments[0]!
    store.deletePaper(paper.id)
    store.deleteAttachment('draft', attachment.id)
    const ids = store.listTrash().map((e) => e.id)
    expect(ids).toHaveLength(2)

    store.clearTrash()
    expect(store.listTrash()).toEqual([])
    for (const id of ids) expect(() => store.restoreTrash(id)).toThrow(new RegExp(id))
    expect(() => store.getPaper(paper.id)).toThrow(new RegExp(paper.id))
    expect(store.getProject('draft').attachments.some((a) => a.id === attachment.id)).toBe(false)
  })

  it('垃圾桶的返回值与恢复出来的东西都不与 store 里的共用对象', () => {
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    store.deletePaper(paper.id)
    const entries = store.listTrash()
    entries[0]!.title = '篡改后的标题'
    expect(store.listTrash()[0]!.title).toBe(paper.title)

    store.restoreTrash(store.listTrash()[0]!.id)
    const restored = store.getPaper(paper.id)
    restored.topics.push('篡改的话题')
    expect(store.getPaper(paper.id).topics).not.toContain('篡改的话题')

    const attachment = store.getProject('draft').attachments[0]!
    store.deleteAttachment('draft', attachment.id)
    store.restoreTrash(store.listTrash()[0]!.id)
    const project = store.getProject('draft')
    project.attachments.at(-1)!.name = '篡改后的附件'
    expect(store.getProject('draft').attachments.at(-1)!.name).toBe(attachment.name)
  })

  it('新建的任务带上了 id 并进入项目', () => {
    const before = store.getProject('draft').tasks.length
    const after = store.createTask('draft', {
      title: '宽树实验补 B≥8', start: '2026-08-25', end: '2026-08-31', state: 'act', priority: 'p1',
    })
    expect(after.tasks).toHaveLength(before + 1)
    const created = after.tasks.at(-1)!
    expect(created.id).not.toBe('')
    expect(created.title).toBe('宽树实验补 B≥8')
    expect(store.getProject('draft').tasks.at(-1)?.id).toBe(created.id)
  })

  it('新建的里程碑带上了 id 并进入项目', () => {
    const before = store.getProject('draft').milestones.length
    const after = store.createMilestone('draft', { date: '2026-09-01', title: '补齐基线', done: false })
    expect(after.milestones).toHaveLength(before + 1)
    const created = after.milestones.at(-1)!
    expect(created.id).not.toBe('')
    expect(store.getProject('draft').milestones.at(-1)?.title).toBe('补齐基线')
  })

  it('两次新建拿到的 id 不相同', () => {
    const fields = { title: '同名任务', start: '2026-08-25', end: '2026-08-31', state: 'act', priority: 'p1' } as const
    const first = store.createTask('draft', fields).tasks.at(-1)!.id
    const second = store.createTask('draft', fields).tasks.at(-1)!.id
    expect(second).not.toBe(first)
  })

  it('删除任务后项目里没有它', () => {
    const after = store.deleteTask('draft', 't2')
    expect(after.tasks.some((t) => t.id === 't2')).toBe(false)
    expect(store.getProject('draft').tasks.some((t) => t.id === 't2')).toBe(false)
  })

  it('删不存在的任务会抛出而不是静默无事发生', () => {
    expect(() => store.deleteTask('draft', 'no-such-task')).toThrow(/no-such-task/)
  })

  it('删除里程碑后项目里没有它', () => {
    const after = store.deleteMilestone('draft', 'm2')
    expect(after.milestones.some((m) => m.id === 'm2')).toBe(false)
    expect(store.getProject('draft').milestones.some((m) => m.id === 'm2')).toBe(false)
  })

  it('删不存在的里程碑会抛出而不是静默无事发生', () => {
    expect(() => store.deleteMilestone('draft', 'no-such-milestone')).toThrow(/no-such-milestone/)
  })

  it('新建的关联条目带上了 id 并进入既有的那一组', () => {
    const before = store.getProject('draft').relations.find((r) => r.group === 'Wiki')!.items.length
    const after = store.createRelation('draft', { group: 'Wiki', text: '前缀读取与验证共调度' })
    const group = after.relations.find((r) => r.group === 'Wiki')!
    expect(group.items).toHaveLength(before + 1)
    expect(group.items.at(-1)!.id).not.toBe('')
    expect(group.items.at(-1)!.text).toBe('前缀读取与验证共调度')
    expect(store.getProject('draft').relations.find((r) => r.group === 'Wiki')?.items.at(-1)?.text)
      .toBe('前缀读取与验证共调度')
  })

  it('关联 Wiki 条目带上的页要是 wiki 里的一页聚合', () => {
    const page = store.wikiCards()[0]!
    const after = store.createRelation('draft', { group: 'Wiki', text: page.title, page: page.id })
    expect(after.relations.find((relation) => relation.group === 'Wiki')!.items.at(-1)!.page)
      .toBe(page.id)
    expect(() => store.createRelation('draft', {
      group: 'Wiki', text: 'x', page: 'topics/nope',
    })).toThrow(/topics\/nope/)
  })

  it('关联可以指向一个链接,显示名和地址一起留下;同时指向 Wiki 页和链接会被拒绝', () => {
    const after = store.createRelation('draft', {
      group: 'links', text: '实验看板', url: 'https://wandb.ai/team/draft',
    })
    expect(after.relations.find((relation) => relation.group === 'links')!.items).toEqual([
      { id: expect.any(String), text: '实验看板', url: 'https://wandb.ai/team/draft' },
    ])
    const page = store.wikiCards()[0]!
    expect(() => store.createRelation('draft', {
      group: 'links', text: 'x', page: page.id, url: 'https://example.com',
    })).toThrow(/同时/)
  })

  it('关联里的一项可以挪到同一行的别的位置,越界就贴到末尾;论文也一样', () => {
    const wiki = store.getProject('draft').relations.find((r) => r.group === 'Wiki')!
    expect(wiki.items.length).toBeGreaterThan(1)
    const last = wiki.items.at(-1)!
    const after = store.createRelation('draft', { group: '实验', text: '别的组' })
    const moved = store.moveRelation('draft', last.id, 0)
    expect(moved.relations.find((r) => r.group === 'Wiki')!.items[0]!.id).toBe(last.id)
    expect(moved.relations.find((r) => r.group === '实验')).toEqual(after.relations.find((r) => r.group === '实验'))

    const papers = store.getProject('draft').papers
    const first = papers[0]!
    expect(store.moveRelation('draft', first, 99).papers.at(-1)).toBe(first)
    expect(() => store.moveRelation('draft', 'rel-nope', 0)).toThrow(/rel-nope/)
  })

  it('关联条目落在没见过的组名上时新开一组,排在最后', () => {
    const before = store.getProject('draft').relations.length
    const after = store.createRelation('draft', { group: '实验', text: '宽树 B≥8' })
    expect(after.relations).toHaveLength(before + 1)
    expect(after.relations.at(-1)!.group).toBe('实验')
    expect(after.relations.at(-1)!.items.map((i) => i.text)).toEqual(['宽树 B≥8'])
  })

  it('删除关联条目后项目里没有它,空掉的那一组还在', () => {
    const id = store.getProject('draft').relations.find((r) => r.group === '论文')!.items[0]!.id
    const after = store.deleteRelation('draft', id)
    const group = after.relations.find((r) => r.group === '论文')
    expect(group?.items.some((i) => i.id === id)).toBe(false)
    expect(group).toBeDefined()
    expect(store.getProject('draft').relations.flatMap((r) => r.items).some((i) => i.id === id)).toBe(false)
  })

  it('删不存在的关联条目会抛出而不是静默无事发生', () => {
    expect(() => store.deleteRelation('draft', 'no-such-relation')).toThrow(/no-such-relation/)
  })

  it('新建的附件带上了 id 并进入项目', () => {
    const before = store.getProject('draft').attachments.length
    const path = resolve(VAULT, 'sweep.csv')
    const after = store.createAttachment('draft', { name: 'sweep.csv', size: '12 KB', path })
    expect(after.attachments).toHaveLength(before + 1)
    expect(after.attachments.at(-1)!.id).not.toBe('')
    expect(store.getProject('draft').attachments.at(-1)?.name).toBe('sweep.csv')
    expect(store.getProject('draft').attachments.at(-1)?.path).toBe(path)
  })

  it('附件的路径要是绝对路径', () => {
    expect(() => store.createAttachment('draft', {
      name: 'y.csv', size: '1 KB', path: 'y.csv',
    })).toThrow(/绝对路径/)
  })

  it('删除附件后项目里没有它', () => {
    const id = store.getProject('draft').attachments[0]!.id
    const after = store.deleteAttachment('draft', id)
    expect(after.attachments.some((a) => a.id === id)).toBe(false)
    expect(store.getProject('draft').attachments.some((a) => a.id === id)).toBe(false)
  })

  it('删不存在的附件会抛出而不是静默无事发生', () => {
    expect(() => store.deleteAttachment('draft', 'no-such-attachment')).toThrow(/no-such-attachment/)
  })

  it('改项目随笔后读回的是新原文', () => {
    expect(store.getProject('draft').memo).not.toBe('')
    expect(store.updateProject('draft', { memo: '新的随笔' }).memo).toBe('新的随笔')
    expect(store.getProject('draft').memo).toBe('新的随笔')
  })

  it('项目带着 agent 已完成的会话,步骤与产出都在', () => {
    const sessions = store.getProject('draft').agentSessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.title).toBe('实验 #3 · 分桶统计脚本固化')
    expect(sessions[0]!.when).toBe('2026-08-05')
    expect(sessions[0]!.steps).toHaveLength(4)
    expect(sessions[0]!.steps[0]).toEqual({
      time: '16:10', text: '接到任务:把分支浪费按深度分桶的统计固化成可复跑脚本',
    })
    expect(sessions[0]!.outcome).toBe('2 个文件改动 · 结果与手工分析一致 · 共 31 分钟')
  })

  it('单条读取符合契约', () => {
    const id = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    expect(() => PaperRowSchema.parse(store.getPaper(id))).not.toThrow()
  })

  it('读不存在的论文会抛出而不是返回 undefined', () => {
    expect(() => store.getPaper('no-such-paper')).toThrow(/no-such-paper/)
  })

  it('项目详情符合契约', () => {
    expect(() => ProjectDetailSchema.parse(store.getProject('draft'))).not.toThrow()
  })

  it('列出项目给出 fixture 里的每一个,次序与 fixture 一致', () => {
    const projects = store.listProjects()
    expect(projects.length).toBeGreaterThan(1)
    expect(projects.map((p) => p.id)).toEqual(['draft', 'timeline-demo', 'repro', 'sched', 'moe', 'fa'])
    for (const summary of projects) expect(() => ProjectSummarySchema.parse(summary)).not.toThrow()
  })

  it('设了手动顺序后,点到的项目排到前面;没点到的照旧序排在后面,坏 id 不算数', () => {
    store.reorderProjects(['moe', 'nope', 'draft'])
    expect(store.listProjects().map((p) => p.id))
      .toEqual(['moe', 'draft', 'timeline-demo', 'repro', 'sched', 'fa'])
  })

  it('列出来的每个项目都读得到详情,详情也符合契约', () => {
    for (const { id } of store.listProjects()) {
      expect(() => ProjectDetailSchema.parse(store.getProject(id)), id).not.toThrow()
    }
  })

  it('概要里的里程碑只留日期与完成与否,科研记录只留末三条、与详情同序', () => {
    const summary = store.listProjects().find((p) => p.id === 'draft')!
    const full = store.getProject('draft')
    expect(full.events.length).toBeGreaterThan(3)
    expect(summary.milestones).toEqual(full.milestones.map(({ date, done }) => ({ date, done })))
    // Summary events carry date, text, and origin (for the overview's "agent" tag); node
    // linkage, kind, detail, and at remain in details only.
    expect(summary.recentEvents).toEqual(full.events.slice(-3).map(({ date, text, origin }) => ({
      date, text, ...(origin === undefined ? {} : { origin }),
    })))
  })

  it('新记一条科研记录之后,概要的末位与详情的末位都是它', () => {
    store.createEvent('draft', '[对话] 最新的一条')
    const summary = store.listProjects().find((p) => p.id === 'draft')!
    expect(store.getProject('draft').events.at(-1)?.text).toBe('[对话] 最新的一条')
    expect(summary.recentEvents.at(-1)?.text).toBe('[对话] 最新的一条')
  })

  it('概要带上被阻塞项目的阻塞原因,没被阻塞的不带这一项', () => {
    const byId = new Map(store.listProjects().map((p) => [p.id, p]))
    expect(byId.get('repro')?.block).toBe('等 A100 机时(周四释放)')
    expect(byId.get('draft')).not.toHaveProperty('block')
  })

  it('总览列出每个项目,带计划、科研记录与紧凑科研图投影', () => {
    const rows = store.overviewProjects()
    expect(rows.map((p) => p.id)).toEqual(['draft', 'timeline-demo', 'repro', 'sched', 'moe', 'fa'])
    for (const row of rows) expect(() => ProjectOverviewSchema.parse(row), row.id).not.toThrow()

    const draft = rows.find((p) => p.id === 'draft')!
    const full = store.getProject('draft')
    expect(full.milestones.length).toBeGreaterThan(1)
    expect(full.events.length).toBeGreaterThan(3)
    expect(draft.tasks).toEqual(full.tasks)
    expect(draft.milestones).toEqual(full.milestones)
    expect(draft.events).toEqual(full.events)
    expect(draft.research.activeNodes.map((node) => node.id)).toEqual(full.graph.activeNodes)
    expect(draft.research.branches).toEqual({ active: 2, supported: 2, failed: 1, shelved: 1 })
    expect(draft).toMatchObject({ start: full.start, due: full.due, priority: full.priority })
  })

  it('总览带上被阻塞项目的阻塞原因,没被阻塞的不带这一项', () => {
    const byId = new Map(store.overviewProjects().map((p) => [p.id, p]))
    expect(byId.get('repro')?.block).toBe('等 A100 机时(周四释放)')
    expect(byId.get('draft')).not.toHaveProperty('block')
  })

  it('阻塞可以清掉,也可以写上;总览读到的跟着变', () => {
    expect('block' in store.updateProject('repro', { block: null })).toBe(false)
    expect(store.overviewProjects().find((project) => project.id === 'repro')!.block)
      .toBeUndefined()
    expect(store.updateProject('draft', { block: '等数据集' }).block).toBe('等数据集')
  })

  it('新建的项目进总览,删掉的离开总览', () => {
    store.createProject('宽树消融')
    const id = store.listProjects().at(-1)!.id
    const added = store.overviewProjects().find((p) => p.id === id)
    expect(added).toMatchObject({ name: '宽树消融', status: '进行中' })
    expect(added?.events).toEqual(store.getProject(id).events)

    store.deleteProject(id)
    expect(store.overviewProjects().map((p) => p.id)).not.toContain(id)
  })

  it('取回的总览是副本,任务、里程碑与科研记录改了也渗不回库里', () => {
    const before = JSON.stringify(store.overviewProjects())
    const rows = store.overviewProjects()
    rows[0]!.name = '篡改后的名字'
    rows[0]!.tasks[0]!.title = '篡改后的任务'
    rows[0]!.milestones[0]!.title = '篡改后的标题'
    rows[0]!.events[0]!.text = '篡改后的记录'
    rows[0]!.research.activeNodes[0]!.label = '篡改后的节点'
    rows[0]!.conclusions.verified = 99
    expect(JSON.stringify(store.overviewProjects())).toBe(before)
  })

  it('新建的项目带上了 id、进入列表,其余各项是新项目的起始值', () => {
    const before = store.listProjects().length
    store.createProject('宽树消融')

    expect(store.listProjects().map((p) => p.id)).toHaveLength(before + 1)
    const id = store.listProjects().at(-1)!.id
    expect(id).not.toBe('')
    const created = store.getProject(id)
    expect(() => ProjectDetailSchema.parse(created)).not.toThrow()
    expect(created).toMatchObject({
      name: '宽树消融',
      status: '进行中',
      priority: 'p1',
      topic: '未分主题',
      focus: '定义第一步',
      start: '2026-08-25',
      due: '2026-09-24',
      memo: '',
      conclusions: { verified: 0, pending: 0, conflicting: 0 },
      conclusionList: [],
      paperCount: 0,
      papers: [],
      paperTitles: {},
      tasks: [],
      milestones: [],
      events: [{ date: '2026-08-25', text: '创建项目' }],
      relations: [],
      attachments: [],
      graph: { nodes: [], edges: [] },
      agentSessions: [],
    })
  })

  it('两次新建拿到的项目 id 不相同,也不与 fixture 里的相撞', () => {
    const fixtureIds = new Set(store.listProjects().map((p) => p.id))
    store.createProject('甲')
    store.createProject('乙')
    const added = store.listProjects().slice(-2).map((p) => p.id)
    expect(new Set(added).size).toBe(2)
    expect(added.some((id) => fixtureIds.has(id))).toBe(false)
  })

  it('fixture 项目的论文数按记着的论文 id 数,进了垃圾桶的那一篇不算', () => {
    const draft = store.getProject('draft')
    expect(draft.papers).toHaveLength(4)
    expect(draft.paperCount).toBe(4)
    store.deletePaper(draft.papers[0]!)
    expect(store.getProject('draft').paperCount).toBe(3)
    expect(store.listProjects().find((p) => p.id === 'draft')!.paperCount).toBe(3)
    expect(store.getProject('draft').papers).toEqual(draft.papers)
  })

  it('fixture 论文行的项目由项目那一侧记着的论文得出', () => {
    expect(store.getPaper('2401.18079').projects.map((project) => project.id))
      .toEqual(['draft', 'sched'])
    expect(store.getPaper('13979-STAR-Speculative-Decodin').conclusionCount)
      .toBe(papersFixture.find(
        (paper) => paper.id === '13979-STAR-Speculative-Decodin',
      )!.conclusionCount + 1)
    expect(store.facetPapers('projects').find((facet) => facet.value === 'draft 效率')!.count)
      .toBe(4)
  })

  it('fixture 项目的结论分档与结论列表一致', () => {
    expect(store.getProject('draft').conclusions)
      .toEqual({ verified: 1, pending: 0, conflicting: 1 })
    expect(store.getProject('draft').conclusionList.map((conclusion) => conclusion.state))
      .toEqual(['verified', 'conflicting'])
    expect(store.listProjects().find((project) => project.id === 'repro')!.conclusions)
      .toEqual({ verified: 0, pending: 1, conflicting: 0 })
    expect(store.overviewProjects().find((project) => project.id === 'fa')!.conclusions)
      .toEqual({ verified: 1, pending: 0, conflicting: 0 })
  })

  it('照快照写回项目不碰结论列表', () => {
    const snapshot = store.getProject('draft')
    store.putProject({ ...snapshot, conclusionList: [], focus: '快照里的下一步' })
    expect(store.getProject('draft').conclusionList).toEqual(snapshot.conclusionList)
    expect(store.getProject('draft').focus).toBe('快照里的下一步')
  })

  it('结论的新建、改档与删除都改到项目上,分档跟着变', () => {
    const session = store.listChats()[0]!
    const made = store.createConclusion('draft', '新的一条', { chat: session.id })
    const item = made.conclusionList.at(-1)!
    expect(item).toMatchObject({
      state: 'pending', date: EPOCH, source: `对话「${session.title}」`,
    })
    expect(made.conclusions).toEqual({ verified: 1, pending: 1, conflicting: 1 })
    expect(store.setConclusionState('draft', item.id, 'verified').conclusions)
      .toEqual({ verified: 2, pending: 0, conflicting: 1 })
    expect(store.deleteConclusion('draft', item.id).conclusionList.some(
      (conclusion) => conclusion.id === item.id,
    )).toBe(false)
    expect(() => store.createConclusion('nope', 'x', {})).toThrow(/nope/)
  })

  it('存下结论之后,项目上更早那一笔仍撤得动,撤销也不带走那条结论', () => {
    const focus = store.getProject('draft').focus
    store.updateProject('draft', { focus: '改过的下一步' })
    const change = store.listChanges()[0]!
    store.createConclusion('draft', '撤销之后还在', {})
    store.undoChange(change.id)
    expect(store.getProject('draft').focus).toBe(focus)
    expect(store.getProject('draft').conclusionList.at(-1)!.text).toBe('撤销之后还在')
  })

  it('项目关联一篇论文、再移除,论文数跟着变;进了垃圾桶的那一篇仍然移除得掉', () => {
    const before = store.getProject('repro').paperCount
    expect(store.addPaper('repro', '2305.17888').paperCount).toBe(before + 1)
    store.deletePaper('2305.17888')
    expect(store.removePaper('repro', '2305.17888').papers).not.toContain('2305.17888')
    expect(() => store.addPaper('repro', 'no-such-paper')).toThrow(/no-such-paper/)
  })

  it('论文改了标题不挡住项目上更早那一笔的撤销', () => {
    const draft = store.getProject('draft')
    store.updateProject('draft', { focus: '改过的下一步' })
    const change = store.listChanges()[0]!
    store.updatePaper(draft.papers[1]!, { title: '换了标题的论文' })
    expect(store.getProject('draft').paperTitles[draft.papers[1]!]).toBe('换了标题的论文')
    store.undoChange(change.id)
    expect(store.getProject('draft').focus).toBe(draft.focus)
  })

  it('删除项目后列表与详情里都读不到它', () => {
    store.deleteProject('moe')
    expect(store.listProjects().map((p) => p.id)).not.toContain('moe')
    expect(() => store.getProject('moe')).toThrow('moe')
  })

  it('删不存在的项目会抛出而不是静默无事发生', () => {
    expect(() => store.deleteProject('nope')).toThrow('nope')
    expect(store.listProjects().map((p) => p.id)).toContain('moe')
  })

  it('删掉的项目进垃圾桶,恢复后又回到列表', () => {
    const before = store.getProject('moe')
    store.deleteProject('moe')

    const entry = store.listTrash()[0]!
    expect(entry.kind).toBe('project')
    expect(entry.title).toBe(before.name)

    store.restoreTrash(entry.id)
    expect(store.listTrash()).toHaveLength(0)
    expect(store.getProject('moe')).toEqual(before)
  })

  it('恢复项目拿到的不是 store 里的那份对象', () => {
    store.deleteProject('moe')
    store.restoreTrash(store.listTrash()[0]!.id)
    const restored = store.getProject('moe')
    restored.milestones.push({ id: 'm9', date: '2026-09-01', title: '篡改的里程碑', done: false })
    expect(store.getProject('moe').milestones).not.toContainEqual(
      { id: 'm9', date: '2026-09-01', title: '篡改的里程碑', done: false },
    )
  })

  it('改过项目属性之后列表里读到的是新值', () => {
    store.updateProject('repro', { status: '已完成', focus: '改过的下一步' })
    const summary = store.listProjects().find((p) => p.id === 'repro')
    expect(summary?.status).toBe('已完成')
    expect(summary?.focus).toBe('改过的下一步')
  })

  it('新建里程碑之后概要里的里程碑跟着多一格', () => {
    const before = store.listProjects().find((p) => p.id === 'sched')!.milestones.length
    store.createMilestone('sched', { date: '2026-09-20', title: '新里程碑', done: false })
    expect(store.listProjects().find((p) => p.id === 'sched')!.milestones)
      .toHaveLength(before + 1)
  })

  it('改论文主题后列表里读到的是新主题', () => {
    const row = store.listPapers({ page: 1, size: 1 }).rows[0]!
    store.updatePaper(row.id, { topics: [...row.topics, 'kv cache'] })
    expect(store.getPaper(row.id).topics).toEqual([...row.topics, 'kv cache'])
    expect(store.listPapers({ page: 1, size: 1 }).rows[0]!.topics)
      .toEqual([...row.topics, 'kv cache'])
  })

  it('库里没记下阅读状态的按未读呈现,改过之后列表与分组都读到新的那一档', () => {
    const row = store.listPapers({ page: 1, size: 1 }).rows[0]!
    expect(row.readState).toBe('未读')

    store.updatePaper(row.id, { readState: '在读' })
    expect(store.getPaper(row.id).readState).toBe('在读')
    expect(store.listPapers({ page: 1, size: 1 }).rows[0]!.readState).toBe('在读')
    // Page state is independent and must not change with read state.
    expect(store.getPaper(row.id).pageState).toBe('draft')
    const facets = store.facetPapers('readState')
    expect(facets.find((f) => f.value === '在读'))
      .toEqual({ value: '在读', count: 1, newestTitle: row.title })
    expect(facets.find((f) => f.value === '未读')?.count).toBe(290)
    expect(store.listPapers({
      page: 1, size: 10, facet: { field: 'readState', value: '在读' },
    }).rows.map((r) => r.id)).toEqual([row.id])
  })

  it('列配置改完就读得到;固定列藏不了,坏 key 拒', () => {
    expect(store.paperColumns())
      .toEqual({ hidden: [], custom: [], groups: ['topics', 'projects', 'readState'] })
    store.setPaperColumns({
      hidden: ['topics'],
      custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: ['topics'],
    })
    expect(store.paperColumns()).toEqual({
      hidden: ['topics'],
      custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: ['topics'],
    })
    expect(() => store.setPaperColumns({ ...emptyColumns(), hidden: ['y'] })).toThrow(/固定列/)
    expect(() => store.setPaperColumns({ ...emptyColumns(), hidden: ['nope'] })).toThrow(/内置列/)
    expect(() => store.setPaperColumns({
      ...emptyColumns(), custom: [{ key: 'a b', label: 'x', type: 'text', options: [] }],
    })).toThrow(/key/)
    expect(() => store.setPaperColumns({
      ...emptyColumns(),
      custom: [
        { key: 'a', label: 'x', type: 'text', options: [] },
        { key: 'b', label: 'x', type: 'text', options: [] },
      ],
    })).toThrow(/列名重复/)
  })

  it('按选择列分组、筛选;文本列分不了组', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [
        { key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] },
        { key: 'note', label: '备注', type: 'text', options: [] },
      ],
      groups: ['topics', 'du-fa'],
    })
    const id = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.updatePaper(id, { custom: { 'du-fa': '精读' } })
    expect(store.facetPapers('du-fa').map((f) => [f.value, f.count])).toEqual([['精读', 1]])
    expect(store.listPapers({ page: 1, size: 10, facet: { field: 'du-fa', value: '精读' } })
      .rows.map((r) => r.id)).toEqual([id])
    expect(() => store.facetPapers('note')).toThrow(/不能按这一列分组/)
    expect(() => store.updatePaper(id, { custom: { 'du-fa': '通读' } })).toThrow(/没有这个选项/)
  })

  it('选项改名把填着它的每一篇一起改,只记一条变动,撤销把论文与列都还原', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] }],
    })
    const ids = store.listPapers({ page: 1, size: 10 }).rows.map((r) => r.id)
    for (const id of ids) store.updatePaper(id, { custom: { 'du-fa': '精读' } })
    const before = store.listChanges().length

    store.renamePaperOption('du-fa', '精读', '细读')
    expect(ids.map((id) => store.getPaper(id).custom['du-fa'])).toEqual(ids.map(() => '细读'))
    expect(store.paperColumns().custom[0]!.options).toEqual(['细读', '略读'])
    expect(store.listChanges().length).toBe(before + 1)
    expect(store.listChanges()[0]!.title).toBe('论文表 · 列「读法」的选项 精读 → 细读')

    store.undoChange(store.listChanges()[0]!.id)
    expect(ids.map((id) => store.getPaper(id).custom['du-fa'])).toEqual(ids.map(() => '精读'))
    expect(store.paperColumns().custom[0]!.options).toEqual(['精读', '略读'])
  })

  it('还有论文填着的选项删不掉,列配置一项不变', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] }],
    })
    const id = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.updatePaper(id, { custom: { 'du-fa': '精读' } })
    const held = store.paperColumns()
    expect(() => store.setPaperColumns({
      ...emptyColumns(),
      custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['略读'] }],
    })).toThrow(/选项「精读」还有论文在用/)
    expect(store.paperColumns()).toEqual(held)
  })

  it('自定义格写在那一行上,列表里读得到,撤销还原', () => {
    const row = store.listPapers({ page: 1, size: 1 }).rows[0]!
    expect(row.custom).toEqual({})
    store.setPaperColumns({
      ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
    })
    store.updatePaper(row.id, { custom: { note: '读到一半' } })
    expect(store.getPaper(row.id).custom).toEqual({ note: '读到一半' })
    expect(store.listPapers({ page: 1, size: 1 }).rows[0]!.custom).toEqual({ note: '读到一半' })
    store.undoChange(store.listChanges()[0]!.id)
    expect(store.getPaper(row.id).custom).toEqual({})
  })

  it('自定义格按格写:后一次只带自己那一格,前一格留着;null 只清那一格', () => {
    store.setPaperColumns({
      ...emptyColumns(),
      custom: [
        { key: 'note', label: '备注', type: 'text', options: [] },
        { key: 'du-fa', label: '读法', type: 'select', options: ['精读'] },
      ],
    })
    const id = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    store.updatePaper(id, { custom: { 'du-fa': '精读' } })
    store.updatePaper(id, { custom: { note: '读到一半' } })
    expect(store.getPaper(id).custom).toEqual({ 'du-fa': '精读', note: '读到一半' })
    store.updatePaper(id, { custom: { 'du-fa': null } })
    expect(store.getPaper(id).custom).toEqual({ note: '读到一半' })
  })

  it('改类型:列与全库的格子一起换,只记一条变动,撤销把列、分组与格子都还原', () => {
    const { store: movable, advance } = movableStore()
    const tags = { key: 'tags', label: '标签', type: 'multi' as const, options: ['综述', '必读'] }
    movable.setPaperColumns({ hidden: [], custom: [tags], groups: ['topics', 'tags'] })
    const [a, b, c] = movable.listPapers({ page: 1, size: 3 }).rows.map((r) => r.id)
    movable.updatePaper(a!, { custom: { tags: ['综述', '必读'] } })
    movable.updatePaper(b!, { custom: { tags: [] } })
    movable.updatePaper(c!, { custom: { tags: ['必读'] } })
    const before = movable.listChanges().length

    advance(1)
    movable.setPaperColumnType('tags', 'text')
    expect([a, b, c].map((id) => movable.getPaper(id!).custom)).toEqual([{ tags: '综述, 必读' }, {}, { tags: '必读' }])
    expect([a, b, c].map((id) => movable.getPaper(id!).updated)).toEqual([afterEpoch(1), afterEpoch(1), afterEpoch(1)])
    expect(movable.paperColumns()).toEqual({
      hidden: [], custom: [{ ...tags, type: 'text', options: [] }], groups: ['topics'],
    })
    expect(movable.listChanges().length).toBe(before + 1)
    expect(movable.listChanges()[0]).toMatchObject({
      title: '论文表 · 列「标签」的类型 多选 → 文本', diff: ['- tags: "多选"', '+ tags: "文本"'], undoable: true,
    })

    advance(2)
    movable.undoChange(movable.listChanges()[0]!.id)
    expect([a, b, c].map((id) => movable.getPaper(id!).custom))
      .toEqual([{ tags: ['综述', '必读'] }, { tags: [] }, { tags: ['必读'] }])
    expect([a, b, c].map((id) => movable.getPaper(id!).updated)).toEqual([afterEpoch(2), afterEpoch(2), afterEpoch(2)])
    expect(movable.paperColumns()).toEqual({ hidden: [], custom: [tags], groups: ['topics', 'tags'] })
  })

  it('文本列改成单选后按它分组:撤销那次改类型把它从分组里摘掉,列集合照样改得动', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
    store.setPaperColumnType('note', 'select')
    const change = store.listChanges()[0]!
    store.setPaperColumns({ ...store.paperColumns(), groups: [...store.paperColumns().groups, 'note'] })

    store.undoChange(change.id)

    expect(store.paperColumns()).toEqual({
      hidden: [], custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: ['topics', 'projects', 'readState'],
    })
    expect(() => store.setPaperColumns({ ...store.paperColumns(), hidden: ['rating'] })).not.toThrow()
  })

  it('多选改选择时有论文填着多个值:整次拒绝,说清几篇,列、格子与最近变动都不动', () => {
    const tags = { key: 'tags', label: '标签', type: 'multi' as const, options: ['综述', '必读'] }
    store.setPaperColumns({ hidden: [], custom: [tags], groups: ['topics'] })
    const [a, b] = store.listPapers({ page: 1, size: 2 }).rows.map((r) => r.id)
    store.updatePaper(a!, { custom: { tags: ['综述', '必读'] } })
    store.updatePaper(b!, { custom: { tags: ['综述'] } })
    const changes = store.listChanges().length

    expect(() => store.setPaperColumnType('tags', 'select')).toThrow('列「标签」有 1 篇论文填着多个值,改不成单选列')
    expect(store.paperColumns().custom).toEqual([tags])
    expect(store.getPaper(a!).custom).toEqual({ tags: ['综述', '必读'] })
    expect(store.getPaper(b!).custom).toEqual({ tags: ['综述'] })
    expect(store.listChanges().length).toBe(changes)
  })

  it('文本列里有空白格时改成选择:空白格清掉,之后照样能改列集合;撤销把空白格写回', () => {
    store.setPaperColumns({ ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }] })
    const [a, b] = store.listPapers({ page: 1, size: 2 }).rows.map((r) => r.id)
    store.updatePaper(a!, { custom: { note: '  ' } })
    store.updatePaper(b!, { custom: { note: '略读' } })
    store.setPaperColumnType('note', 'select')
    const change = store.listChanges()[0]!

    expect(() => store.setPaperColumns({ ...store.paperColumns(), hidden: ['rating'] })).not.toThrow()
    expect(store.paperColumns().custom).toEqual([{ key: 'note', label: '备注', type: 'select', options: ['略读'] }])
    expect(store.getPaper(a!).custom).toEqual({})

    store.undoChange(change.id)
    expect(store.getPaper(a!).custom).toEqual({ note: '  ' })
  })

  it('改任务后返回的项目里该任务已更新', () => {
    const after = store.updateTask('draft', 't2', { priority: 'p1' })
    expect(after.tasks.find((t) => t.id === 't2')?.priority).toBe('p1')
  })

  it('分时任务可创建、修改窗口并清回全天,同日倒置窗口整次拒绝', () => {
    const made = store.createTask('timeline-demo', {
      title: '新增分时任务', start: EPOCH, end: EPOCH,
      window: { start: '14:00', end: '16:00' }, state: 'act', priority: 'p1',
    })
    const task = made.tasks.at(-1)!
    expect(task.window).toEqual({ start: '14:00', end: '16:00' })
    expect(() => store.updateTask('timeline-demo', task.id, {
      window: { start: '18:00', end: '16:00' },
    })).toThrow(/结束时间/)
    expect(store.updateTask('timeline-demo', task.id, { window: null }).tasks.at(-1)!.window)
      .toBeUndefined()
  })

  it('新建结束早于开始的任务被拒绝', () => {
    const before = store.getProject('draft').tasks.length
    expect(() => store.createTask('draft', {
      title: '倒着排的任务', start: '2026-08-31', end: '2026-08-25', state: 'act', priority: 'p1',
    })).toThrow(/2026-08-31/)
    expect(store.getProject('draft').tasks).toHaveLength(before)
  })

  it('只改结束日期时按合并后的结果判断,越过开始就被拒绝', () => {
    // t2 spans 2026-08-18 through 2026-08-28; an end-only patch must validate against the stored start.
    expect(() => store.updateTask('draft', 't2', { end: '2026-08-01' })).toThrow(/2026-08-18/)
    const kept = store.getProject('draft').tasks.find((t) => t.id === 't2')
    expect(kept?.end).toBe('2026-08-28')
  })

  it('只改开始日期时按合并后的结果判断,越过结束就被拒绝', () => {
    expect(() => store.updateTask('draft', 't2', { start: '2026-09-30' })).toThrow(/2026-08-28/)
    expect(store.getProject('draft').tasks.find((t) => t.id === 't2')?.start).toBe('2026-08-18')
  })

  it('只改一个端点但没越界的更新照常通过', () => {
    const after = store.updateTask('draft', 't2', { start: '2026-08-28' })
    expect(after.tasks.find((t) => t.id === 't2')?.start).toBe('2026-08-28')
  })

  it('改里程碑后返回的项目里该里程碑已更新', () => {
    const after = store.updateMilestone('draft', 'm2', { done: true })
    expect(after.milestones.find((m) => m.id === 'm2')?.done).toBe(true)
    expect(store.getProject('draft').milestones.find((m) => m.id === 'm2')?.done).toBe(true)
  })

  it('改不存在的里程碑会抛出而不是静默无事发生', () => {
    expect(() => store.updateMilestone('draft', 'no-such-milestone', { done: true })).toThrow(/no-such-milestone/)
  })

  it('改项目属性后读回的是新值', () => {
    expect(store.updateProject('draft', { status: '搁置' }).status).toBe('搁置')
    expect(store.getProject('draft').status).toBe('搁置')
  })

  it('改不存在的项目会抛出而不是静默无事发生', () => {
    expect(() => store.updateProject('no-such-project', { status: '搁置' })).toThrow(/no-such-project/)
  })

  it('只改项目截止日期时按合并后的结果判断,越过开始就被拒绝', () => {
    // draft spans 2026-06-02 through 2026-09-15; a due-only patch must validate against the stored start.
    expect(() => store.updateProject('draft', { due: '2026-05-01' })).toThrow(/2026-06-02/)
    expect(store.getProject('draft').due).toBe('2026-09-15')
  })

  it('只改项目开始日期时按合并后的结果判断,越过截止就被拒绝', () => {
    expect(() => store.updateProject('draft', { start: '2026-12-01' })).toThrow(/2026-09-15/)
    expect(store.getProject('draft').start).toBe('2026-06-02')
  })

  it('两个端点一起改时按合并后的结果判断', () => {
    expect(() => store.updateProject('draft', { start: '2026-10-01', due: '2026-09-30' })).toThrow(/2026-10-01/)
    const after = store.updateProject('draft', { start: '2026-07-01', due: '2026-10-30' })
    expect(after.start).toBe('2026-07-01')
    expect(after.due).toBe('2026-10-30')
  })

  it('只改项目一个端点但没越界的更新照常通过', () => {
    expect(store.updateProject('draft', { due: '2026-10-30' }).due).toBe('2026-10-30')
  })

  it('改返回值不会影响 store 后续返回的内容,包括嵌套字段', () => {
    const project = store.getProject('draft')
    project.milestones[0]!.title = '篡改后的标题'
    expect(store.getProject('draft').milestones[0]!.title).not.toBe('篡改后的标题')

    const paperId = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    const paper = store.getPaper(paperId)
    paper.topics.push('篡改的话题')
    expect(store.getPaper(paperId).topics).not.toContain('篡改的话题')

    const row = store.listPapers({ page: 1, size: 1 }).rows[0]!
    row.topics.push('篡改的话题')
    expect(store.listPapers({ page: 1, size: 1 }).rows[0]!.topics).not.toContain('篡改的话题')

    const updated = store.updateTask('draft', 't2', { priority: 'p1' })
    updated.tasks.find((t) => t.id === 't2')!.priority = 'p2'
    expect(store.getProject('draft').tasks.find((t) => t.id === 't2')?.priority).toBe('p1')

    const withMilestone = store.updateMilestone('draft', 'm2', { done: true })
    withMilestone.milestones.find((m) => m.id === 'm2')!.title = '篡改后的标题'
    expect(store.getProject('draft').milestones.find((m) => m.id === 'm2')?.title).not.toBe('篡改后的标题')

    const withStatus = store.updateProject('draft', { status: '搁置' })
    withStatus.milestones[0]!.title = '篡改后的标题'
    withStatus.tasks[0]!.title = '篡改后的标题'
    expect(store.getProject('draft').milestones[0]!.title).not.toBe('篡改后的标题')
    expect(store.getProject('draft').tasks[0]!.title).not.toBe('篡改后的标题')

    const withTask = store.createTask('draft', {
      title: '新任务', start: '2026-08-25', end: '2026-08-31', state: 'act', priority: 'p1',
    })
    const newTaskId = withTask.tasks.at(-1)!.id
    withTask.tasks.at(-1)!.title = '篡改后的标题'
    withTask.milestones[0]!.title = '篡改后的标题'
    expect(store.getProject('draft').tasks.find((t) => t.id === newTaskId)?.title).toBe('新任务')
    expect(store.getProject('draft').milestones[0]!.title).not.toBe('篡改后的标题')

    const withMs = store.createMilestone('draft', { date: '2026-09-01', title: '新里程碑', done: false })
    const newMsId = withMs.milestones.at(-1)!.id
    withMs.milestones.at(-1)!.date = '2030-01-01'
    expect(store.getProject('draft').milestones.find((m) => m.id === newMsId)?.date).toBe('2026-09-01')

    const afterDelete = store.deleteTask('draft', newTaskId)
    afterDelete.milestones[0]!.title = '篡改后的标题'
    expect(store.getProject('draft').milestones[0]!.title).not.toBe('篡改后的标题')

    const withRelation = store.createRelation('draft', { group: 'Wiki', text: '新关联' })
    withRelation.relations[0]!.items[0]!.text = '篡改后的关联'
    withRelation.graph.nodes[0]!.label = '篡改后的节点'
    withRelation.conclusions.verified = -1
    expect(store.getProject('draft').relations[0]!.items[0]!.text).not.toBe('篡改后的关联')
    expect(store.getProject('draft').graph.nodes[0]!.label).not.toBe('篡改后的节点')
    expect(store.getProject('draft').conclusions.verified).not.toBe(-1)

    const withAttachment = store.createAttachment('draft', {
      name: '新附件.csv', size: '1 KB', path: resolve(VAULT, '新附件.csv'),
    })
    withAttachment.attachments[0]!.name = '篡改后的附件'
    withAttachment.graph.edges[0]![0] = '篡改后的起点'
    withAttachment.agentSessions[0]!.steps[0]!.text = '篡改后的步骤'
    expect(store.getProject('draft').attachments[0]!.name).not.toBe('篡改后的附件')
    expect(store.getProject('draft').graph.edges[0]![0]).not.toBe('篡改后的起点')
    expect(store.getProject('draft').agentSessions[0]!.steps[0]!.text).not.toBe('篡改后的步骤')

    const read = store.getProject('draft')
    read.relations[0]!.items[0]!.text = '篡改后的关联'
    read.attachments[0]!.name = '篡改后的附件'
    read.graph.nodes[0]!.label = '篡改后的节点'
    read.agentSessions[0]!.steps[0]!.text = '篡改后的步骤'
    expect(store.getProject('draft').relations[0]!.items[0]!.text).not.toBe('篡改后的关联')
    expect(store.getProject('draft').attachments[0]!.name).not.toBe('篡改后的附件')
    expect(store.getProject('draft').graph.nodes[0]!.label).not.toBe('篡改后的节点')
    expect(store.getProject('draft').agentSessions[0]!.steps[0]!.text).not.toBe('篡改后的步骤')

    const summaries = store.listProjects()
    const draftSummary = summaries.find((p) => p.id === 'draft')!
    draftSummary.milestones[0]!.done = !draftSummary.milestones[0]!.done
    draftSummary.recentEvents[0]!.text = '篡改后的记录'
    draftSummary.conclusions.verified = -1
    const reread = store.listProjects().find((p) => p.id === 'draft')!
    expect(reread.milestones[0]!.done).toBe(store.getProject('draft').milestones[0]!.done)
    expect(reread.recentEvents[0]!.text).not.toBe('篡改后的记录')
    expect(reread.conclusions.verified).not.toBe(-1)

    const facets = store.facetPapers('topics')
    facets[0]!.count = -1
    facets[0]!.value = '篡改后的取值'
    expect(store.facetPapers('topics')[0]!.count).toBeGreaterThan(0)
    expect(store.facetPapers('topics')[0]!.value).not.toBe('篡改后的取值')
  })

  it('建库时论文的数组一层也复制,改 fixture 模块渗不进已经建好的库', () => {
    const fixture = papersFixture[0]!
    fixture.topics.push('篡改的话题')
    try {
      expect(store.getPaper(fixture.id).topics).not.toContain('篡改的话题')
      expect(createFixtureStore().getPaper(fixture.id).topics).toContain('篡改的话题')
    } finally {
      fixture.topics.pop()
    }
  })

  it('一个 store 的写不会渗到另一个 store', () => {
    const other = createFixtureStore()
    const milestonesBefore = other.getProject('draft').milestones.length
    const id = store.listPapers({ page: 1, size: 1 }).rows[0]!.id

    store.updatePaper(id, { topics: ['篡改的话题'] })
    store.createMilestone('draft', { date: '2026-09-01', title: '新里程碑', done: false })
    store.deletePaper(id)

    expect(other.getPaper(id).topics).not.toContain('篡改的话题')
    expect(other.getProject('draft').milestones).toHaveLength(milestonesBefore)
    expect(other.listPapers({ page: 1, size: 1 }).total).toBe(291)
  })

  it('最近变动按 fixture 的次序返回,新的在前', () => {
    expect(store.listChanges().map((c) => c.source)).toEqual(['笔记', '实验', 'Meridian', 'Meridian'])
    expect(store.listChanges()[1]!.title).toBe('你的结论「分支浪费」 · v2 → v3')
  })

  it('fixture 那几条的日期照纪元平移:最新一条落在库里的今天,其余三条是前一天', () => {
    expect(store.listChanges().map((c) => c.date))
      .toEqual([afterEpoch(0), afterEpoch(-1), afterEpoch(-1), afterEpoch(-1)])
  })

  it('取回的变动是副本,连 diff 那一层改了也渗不回库里', () => {
    const rows = store.listChanges()
    rows[0]!.title = '篡改后的标题'
    rows[0]!.diff[0] = '篡改后的 diff'
    expect(store.listChanges()[0]!.title).not.toBe('篡改后的标题')
    expect(store.listChanges()[0]!.diff[0]).not.toBe('篡改后的 diff')
  })

  it('动态最新的在前,日期分段跟着条目走', () => {
    expect(store.listFeed().map((e) => e.source)).toEqual(['steward', 'inbox', 'steward', 'lab', 'me'])
    expect(store.listFeed().map((e) => e.day)).toEqual(['今天', '今天', '昨天', '昨天', '昨天'])
    expect(store.listFeed()[0]!.time).toBe('早报')
  })

  it('取回的动态是副本,连正文分段与简报条目那一层改了也渗不回库里', () => {
    const before = JSON.stringify(store.listFeed())
    const rows = store.listFeed()
    rows[4]!.time = '篡改后的时刻'
    const runs = rows[4]!.body
    const brief = rows[0]!.body
    expect(runs.kind).toBe('runs')
    expect(brief.kind).toBe('brief')
    if (runs.kind === 'runs') runs.runs[0]!.text = '篡改后的分段'
    if (brief.kind === 'brief') brief.items[0]!.tag = '篡改后的标'
    expect(JSON.stringify(store.listFeed())).toBe(before)
  })

  it('收件按 fixture 的次序返回,同一条关注带进来的排在一起', () => {
    expect(store.listInbox().map((e) => e.id))
      .toEqual(['specdec', 'longspec', 'sequoia2', 'drafterlite', 'fa3', 'thunderkv'])
    expect(store.listInbox().map((e) => e.watch))
      .toEqual(['spec', 'spec', 'spec', 'spec', 'dao', 'dao'])
    expect(store.listInbox().every((e) => !e.downloaded)).toBe(true)
    expect(store.listInbox().map((e) => e.source)).toEqual([
      '主题 · speculative decoding', '主题 · speculative decoding', '主题 · speculative decoding',
      '主题 · speculative decoding', '作者 · T. Dao', '作者 · T. Dao',
    ])
    expect(store.listInbox().filter((e) => e.pdf !== '').map((e) => e.id)).toHaveLength(6)
  })

  it('取回的收件是副本,入库时才用得上的那几项不跨边界', () => {
    const before = JSON.stringify(store.listInbox())
    const rows = store.listInbox()
    rows[0]!.title = '篡改后的标题'
    rows[0]!.downloaded = true
    expect(JSON.stringify(store.listInbox())).toBe(before)
    expect(Object.keys(rows[0]!)).not.toContain('vault')
  })

  it('划走一条:它离开收件、进垃圾桶,恢复后回到原来的位置', () => {
    const order = store.listInbox().map((e) => e.id)
    store.dismissInbox('longspec')
    expect(store.listInbox().map((e) => e.id)).toEqual(order.filter((id) => id !== 'longspec'))
    expect(store.listTrash()[0]).toEqual({
      id: expect.any(String), kind: 'inbox',
      title: 'LongSpec: Long-Context Lossless Speculative Decoding',
      deletedAt: expect.any(Number), restorable: true,
    })

    store.restoreTrash(store.listTrash()[0]!.id)
    expect(store.listInbox().map((e) => e.id)).toEqual(order)
    expect(store.listTrash()).toHaveLength(0)
  })

  it('存入稍后阅读:离开收件、排到队首,已经在队列里的不重复入队', () => {
    const paper = store.listInbox().find((e) => e.id === 'specdec')!.paper
    expect(store.readLater('specdec')).toBe(true)
    expect(store.listInbox().map((e) => e.id)).not.toContain('specdec')
    expect(store.listLater()[0]).toMatchObject({
      id: 'specdec', source: '主题 · speculative decoding', added: '2026-08-25', day: '今天', paper,
    })

    // thunderkv already exists in the fixture queue; saving it again only removes it from inbox.
    const queued = store.listLater().length
    expect(store.readLater('thunderkv')).toBe(false)
    expect(store.listLater()).toHaveLength(queued)
    expect(store.listInbox().map((e) => e.id)).not.toContain('thunderkv')
  })

  it('稍后阅读按入队日期从新到旧,分段按库里的今天算', () => {
    expect(store.listLater().map((e) => e.added))
      .toEqual(['2026-08-25', '2026-08-24', '2026-08-21', '2026-08-12'])
    expect(store.listLater().map((e) => e.day)).toEqual(['今天', '昨天', '本周', '更早'])

    store.removeLater('kvpress')
    expect(store.listLater().map((e) => e.id)).toEqual(['upsurvey', 'thunderkv', 'mixtral'])
  })

  it('队列里指着库外那几条标成未入库,收件下载入库之后跟着变', () => {
    expect(store.listLater().filter((e) => e.downloaded).map((e) => e.id)).toEqual(['mixtral'])

    store.completeInboxDownload('thunderkv', minimalPdf({ lines: ['ThunderKV'] }))
    expect(store.listLater().filter((e) => e.downloaded).map((e) => e.id))
      .toEqual(['thunderkv', 'mixtral'])
  })

  it('取回的稍后阅读是副本,改了渗不回库里', () => {
    const before = JSON.stringify(store.listLater())
    const rows = store.listLater()
    rows[0]!.title = '篡改后的标题'
    rows[0]!.source = '篡改后的来源'
    expect(JSON.stringify(store.listLater())).toBe(before)
  })

  it('下载入库:论文按标题落成库里的一页,收件那条留在原处并记下已入库', () => {
    const before = store.listPapers({ page: 1, size: 1 }).total
    // The inbox entry stores a source id and no page references it yet, so that source id is returned.
    expect(store.listInbox().find((e) => e.id === 'specdec')!.paper)
      .toMatch(/^paper-pdf-[0-9a-f]{12}$/)
    const added = store.completeInboxDownload('specdec', minimalPdf({ lines: ['Speculative Decoding'] }))
    const paper = added.paper
    expect(added).toEqual({ kind: 'added', paper: 'Fast-Inference-from-Transformers-via-Speculative-Decoding' })

    expect(store.listPapers({ page: 1, size: 1 }).total).toBe(before + 1)
    expect(store.getPaper(paper)).toMatchObject({
      id: paper,
      title: 'Fast Inference from Transformers via Speculative Decoding',
      topics: ['speculative decoding'],
      // A downloaded paper starts unread; its Wiki page remains unauthored.
      pageState: 'draft', readState: '未读',
    })
    // A recommendation id identifies the inbox entry, not a paper, so no paper appears under it.
    expect(() => store.getPaper('specdec')).toThrow(/specdec/)
    expect(store.listInbox().find((e) => e.id === 'specdec')?.downloaded).toBe(true)
    expect(() => store.prepareInboxDownload('specdec')).toThrow(/specdec/)
  })

  it('入库时把远端元数据一次写进论文页', () => {
    const entry = store.listInbox().find((e) => e.id === 'specdec')!
    expect(entry.venue).not.toBe('')
    const paper = store.getPaper(store.completeInboxDownload('specdec', minimalPdf({ lines: ['Speculative Decoding'] })).paper)
    expect(paper.year).toBe(2022)
    expect(paper.venue).toBe('ICML 2023')
    expect(paper.identifier).toBe('arXiv:2211.17192')
  })

  it('入库撞上库里已有的那一篇时不重复入库,给出的是那一篇的落点', () => {
    // The longspec recommendation points to an existing paper; the same source derives the same paper id.
    const paper = store.listInbox().find((e) => e.id === 'longspec')!.paper
    const before = store.listPapers({ page: 1, size: 1 }).total
    expect(store.prepareInboxDownload('longspec'))
      .toEqual({ kind: 'existing', paper, title: store.getPaper(paper).title })
    expect(store.listPapers({ page: 1, size: 1 }).total).toBe(before)
    expect(store.listInbox().find((e) => e.id === 'longspec')?.downloaded).toBe(false)
  })

  it('入库的论文能按它那一页的 id 取到原文', () => {
    const added = store.completeInboxDownload('specdec', minimalPdf({ lines: ['Speculative Decoding'] }))
    expect(store.paperSource(added.paper).length).toBeGreaterThan(0)
  })

  it('fixture vault 备着原文的,正是收件里给了原文地址的那两条', () => {
    for (const entry of store.listInbox()) {
      // Source retrieval uses the library page id, so import first and then check for a source.
      const plan = store.prepareInboxDownload(entry.id)
      if (plan.kind === 'existing') continue
      const { paper } = store.completeInboxDownload(entry.id, minimalPdf({ lines: [entry.title] }))
      if (entry.pdf === undefined) {
        expect(() => store.paperSource(paper)).toThrow(`库里没有这一篇的原文:${paper}`)
      } else {
        expect(store.paperSource(paper).length).toBeGreaterThan(0)
      }
    }
  })

  it('关注:新建的排在最后且是启用的,暂停只改启停', () => {
    expect(store.listWatches().map((w) => w.id)).toEqual(['spec', 'moe', 'dao'])

    store.createWatch({ type: 'author', name: 'A. Gu' })
    expect(store.listWatches().at(-1)).toMatchObject({ type: 'author', name: 'A. Gu', active: true })
    expect(store.listWatches().at(-1)!.id).not.toBe('')

    store.setWatchActive('spec', false)
    expect(store.listWatches()[0]).toMatchObject({ id: 'spec', name: 'speculative decoding', active: false })
    // Pausing stops future fetches but keeps already fetched entries.
    expect(store.listInbox().filter((e) => e.watch === 'spec')).toHaveLength(4)
  })

  it('修改关注保留 id、启停与既有推送，作者身份可以重新确认或清除', () => {
    const before = store.listInbox().filter((entry) => entry.watch === 'spec').map((entry) => entry.id)
    store.setWatchActive('spec', false)
    store.updateWatch('spec', { type: 'topic', name: 'speculative sampling' })
    expect(store.listWatches()[0]).toEqual({
      id: 'spec', type: 'topic', name: 'speculative sampling', active: false,
    })
    expect(store.listInbox().filter((entry) => entry.watch === 'spec').map((entry) => entry.id)).toEqual(before)

    store.updateWatch('dao', {
      type: 'author', name: 'Tri Dao',
      identity: { source: 'semantic-scholar', id: 'new-dao', affiliations: ['Princeton'] },
    })
    expect(store.listWatches().find((item) => item.id === 'dao')).toMatchObject({
      identity: { id: 'new-dao', affiliations: ['Princeton'] },
    })
    store.updateWatch('dao', { type: 'author', name: 'Tri Dao Jr.' })
    expect(store.listWatches().find((item) => item.id === 'dao')).not.toHaveProperty('identity')
    expect(() => store.updateWatch('spec', { type: 'author', name: 'Wrong type' })).toThrow('不能把')
  })

  it('移除关注:同步清掉它带进来的推送,已进稍后阅读与论文库的内容不受影响', () => {
    const papers = store.listPapers({ page: 1, size: 100 }).total
    expect(store.readLater('specdec')).toBe(true)
    store.dismissInbox('longspec')

    store.deleteWatch('spec')
    expect(store.listWatches().map((w) => w.id)).toEqual(['moe', 'dao'])
    expect(store.listInbox().every((e) => e.watch !== 'spec')).toBe(true)
    expect(store.listTrash()).toEqual([])
    expect(store.listLater()[0]!.source).toBe('主题 · speculative decoding')
    expect(store.listPapers({ page: 1, size: 100 }).total).toBe(papers)
  })

  it('收件、稍后阅读与关注的写入口都拒绝不存在的 id', () => {
    expect(() => store.dismissInbox('nope')).toThrow(/nope/)
    expect(() => store.readLater('nope')).toThrow(/nope/)
    expect(() => store.prepareInboxDownload('nope')).toThrow(/nope/)
    expect(() => store.removeLater('nope')).toThrow(/nope/)
    expect(() => store.setWatchActive('nope', false)).toThrow(/nope/)
    expect(() => store.deleteWatch('nope')).toThrow(/nope/)
    // An entry that already left inbox is no longer considered an inbox item.
    store.dismissInbox('longspec')
    expect(() => store.dismissInbox('longspec')).toThrow(/longspec/)
  })

  it('wiki 首页:每种聚合的计数与根节点', () => {
    const home = store.wikiHome()
    expect(home.aggregationCount).toBe(13)
    expect(home.kinds).toEqual([
      { key: 'topic', label: '主题', dir: 'topics', count: 7 },
      { key: 'method', label: '方法', dir: 'methods', count: 6 },
    ])
    expect(home.roots.map((c) => c.id)).toEqual([
      'topics/long-context-inference', 'topics/quantization',
      'methods/distillation-qat', 'methods/error-compensated-rounding',
      'methods/non-uniform-quantization', 'methods/outlier-suppression',
    ])
    expect(home.roots[1]).toMatchObject({
      kindLabel: '主题', title: 'Quantization', childCount: 2, memberCount: 0, parentCount: 0,
    })
  })

  it('聚合页:子聚合、对照表的行与格子、派生列、追加区与关联', () => {
    const ptq = store.wikiAggregation('topics/ptq')
    expect(ptq.children.map((c) => c.id))
      .toEqual(['topics/kv-cache-quantization', 'topics/ptq-weight-activation', 'topics/ptq-weight-only'])
    // The KV-cache page belongs to both PTQ and long-context inference.
    expect(ptq.children[0]!.parentCount).toBe(2)
    expect(ptq.rows).toEqual([])
    expect(ptq.splitOn).toBe('量化对象')
    expect(ptq.parents).toEqual([{ id: 'topics/quantization', title: 'Quantization' }])

    const wo = store.wikiAggregation('topics/ptq-weight-only')
    expect(wo.columns.map((c) => c.key)).toEqual(['bits', 'needs_calib', 'backprop', 'claim'])
    expect(wo.rows[0]!.paper.fullTitle).toMatch(/^GPTQ: /)
    expect(wo.rows.map((r) => ({ id: r.paper.id, title: r.paper.title }))).toEqual([
      { id: 'papers/2210.17323', title: 'GPTQ' },
      { id: 'papers/2306.00978', title: 'AWQ' },
      { id: 'papers/2306.07629', title: 'SqueezeLLM' },
      { id: 'papers/2307.13304', title: 'QuIP' },
      { id: 'papers/2308.13137', title: 'OmniQuant' },
    ])
    expect(wo.rows[0]!.cells['bits'])
      .toEqual({ value: 'W3/W4 · A16', page: 1, quote: 'reducing the bitwidth down to 3 or 4 bits per weight' })
    // The SqueezeLLM abstract does not specify backpropagation, so the cell remains empty.
    expect(wo.rows[2]!.cells['backprop']).toBeUndefined()
    expect(wo.body).toContain('## 结论\n- 2026-09-09 · ')
    expect(wo.body).toMatch(/## 未解决\n- /)
    expect(wo.body).not.toContain('generated')
    expect(wo.titles).toMatchObject(Object.fromEntries(['2210.17323', '2306.07629', '2307.13304'].map((id) => (
      [`papers/${id}`, store.getPaper(id).title]
    ))))
    expect(wo.titles['papers/2210.17323']).toMatch(/^GPTQ: /)
    expect(wo.related).toEqual([{
      label: '方法',
      links: [
        { id: 'methods/error-compensated-rounding', title: 'Error-compensated rounding' },
        { id: 'methods/non-uniform-quantization', title: 'Non-uniform quantization' },
        { id: 'methods/per-channel-scaling', title: 'Per-channel scaling' },
        { id: 'methods/rotation', title: 'Rotation' },
      ],
    }])

    const rotation = store.wikiAggregation('methods/rotation')
    expect(rotation.derivedColumns).toEqual([{ key: 'used_for', label: '用于' }])
    expect(rotation.rows.find((r) => r.paper.title === 'QuaRot')!.derived['used_for']).toEqual([
      { id: 'topics/ptq-weight-activation', title: 'Weight-activation PTQ' },
      { id: 'topics/kv-cache-quantization', title: 'KV cache quantization' },
    ])
  })

  it('论文页:正文原样,归属按聚合分组、格子带引句', () => {
    const quarot = store.wikiPaper('papers/2404.00456')
    expect(quarot).toMatchObject({ short: 'QuaRot', year: 2024, venue: 'NeurIPS 2024', pdf: 'sources/2404.00456.pdf' })
    expect(quarot.body!.startsWith('## 这篇说了什么\n')).toBe(true)
    expect(quarot.body).toContain('(p.1)')
    expect(quarot.memberships.map((m) => [m.kindLabel, m.aggregation.title, m.cells.length])).toEqual([
      ['主题', 'Weight-activation PTQ', 4], ['主题', 'KV cache quantization', 2], ['方法', 'Rotation', 2],
    ])
    expect(quarot.memberships[1]!.cells[0])
      .toEqual({ label: 'KV 位宽', cell: { value: '4', page: 1, quote: 'KV cache in 4 bits' } })
  })

  it('论文表里的每一篇都有页:没编过的正文是空串', () => {
    const legacy = store.listPapers({ page: 1, size: 50 }).rows.find((r) => !/^\d{4}\.\d{5}$/.test(r.id))!
    expect(legacy).toBeDefined()
    expect(store.wikiPaper(`papers/${legacy.id}`))
      .toMatchObject({ id: `papers/${legacy.id}`, title: legacy.title, body: '', memberships: [] })
    expect(() => store.wikiPaper('papers/nope')).toThrow(/nope/)
    expect(() => store.wikiAggregation('nope')).toThrow(/nope/)
  })

  it('入库就有页;删掉论文那一页也没了,恢复回来还是原来那一页', () => {
    const entry = store.listInbox().find((e) => !e.downloaded)!
    const made = store.completeInboxDownload(
      entry.id, minimalPdf({ lines: [entry.title] }),
    ) as { kind: string; paper: string }
    expect(made.kind).toBe('added')
    const id = `papers/${made.paper}`
    expect(store.wikiPaper(id)).toMatchObject({ body: '' })
    expect(store.wikiPaper(id).memberships.map((m) => m.aggregation.title))
      .toContain('speculative decoding')
    store.updateWikiPage(id, '## 读后\n第一笔。')
    store.deletePaper(made.paper)
    expect(() => store.wikiPaper(id)).toThrow(/不存在/)
    store.restoreTrash(store.listTrash()[0]!.id)
    expect(store.wikiPaper(id).body).toBe('## 读后\n第一笔。')
  })

  it('取回的 wiki 首页与聚合页都是副本,改了渗不回库里', () => {
    const before = JSON.stringify(store.wikiAggregation('topics/ptq-weight-only'))
    const agg = store.wikiAggregation('topics/ptq-weight-only')
    agg.rows[0]!.cells['bits']!.value = '篡改'
    agg.columns[0]!.label = '篡改'
    agg.children.length = 0
    expect(JSON.stringify(store.wikiAggregation('topics/ptq-weight-only'))).toBe(before)
    const home = store.wikiHome()
    home.roots[0]!.title = '篡改'
    expect(store.wikiHome().roots[0]!.title).toBe('Long-context inference')
  })

  it('应用提案:加一条归属之后对照表多一行,论文表那一行的主题跟着改;两个 store 实例互不影响', () => {
    const other = createFixtureStore(() => EPOCH)
    store.applyProposal({
      source: 'ingest', title: '把 KVQuant 归进 Weight-only PTQ',
      ops: [{
        op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-weight-only',
        cells: { bits: { value: 'W3', page: 1, quote: '3-bit quantization' } },
      }],
    })
    const rows = store.wikiAggregation('topics/ptq-weight-only').rows
    expect(rows.map((r) => r.paper.title)).toContain('KVQuant')
    expect(rows.find((r) => r.paper.title === 'KVQuant')!.cells['bits'])
      .toEqual({ value: 'W3', page: 1, quote: '3-bit quantization' })
    expect(store.getPaper('2401.18079').topics).toEqual(['KV cache quantization', 'Weight-only PTQ'])
    expect(other.wikiAggregation('topics/ptq-weight-only').rows.map((r) => r.paper.title)).not.toContain('KVQuant')
    expect(() => store.applyProposal({
      source: 'ingest', title: 'x',
      ops: [{ op: 'setMembership', paper: 'papers/nope', in: 'topics/ptq-weight-only', cells: {} }],
    })).toThrow(/papers\/nope/)
  })

  it('撤销一条改了归属的提案之后,论文表那一行的主题也回去', () => {
    const before = store.getPaper('2401.18079')
    store.applyProposal({
      source: 'ingest', title: '把 KVQuant 归进 Weight-only PTQ',
      ops: [{
        op: 'setMembership', paper: 'papers/2401.18079', in: 'topics/ptq-weight-only',
        cells: { bits: { value: 'W3', page: 1, quote: '3-bit quantization' } },
      }],
    })
    expect(store.getPaper('2401.18079').topics).toEqual(['KV cache quantization', 'Weight-only PTQ'])
    store.undoChange(store.listChanges()[0]!.id)
    expect(store.getPaper('2401.18079')).toEqual(before)
    expect(store.wikiAggregation('topics/ptq-weight-only').rows.map((r) => r.paper.title)).not.toContain('KVQuant')
  })

  it('改正文:聚合页与论文页都改得了,updated 推到今天,论文表的行跟着;没有的页拒绝', () => {
    const store = createFixtureStore(() => '2026-09-10')
    store.updateWikiPage('topics/ptq', '## 问题\n改过的。')
    expect(store.wikiAggregation('topics/ptq')).toMatchObject({ body: '## 问题\n改过的。', summary: '改过的。', updated: '2026-09-10' })
    store.updateWikiPage('papers/2210.17323', '## 这篇说了什么\n改过。')
    expect(store.wikiPaper('papers/2210.17323').body).toBe('## 这篇说了什么\n改过。')
    expect(store.getPaper('2210.17323').updated).toBe('2026-09-10')
    expect(() => store.updateWikiPage('topics/nope', 'x')).toThrow(/topics\/nope/)
    expect(() => store.updateWikiPage('topics/ptq', '## 问题\n<!-- /generated -->')).toThrow(/生成区的标记/)
    expect(store.wikiAggregation('topics/ptq').body).toBe('## 问题\n改过的。')
    const change = store.listChanges()[0]!
    expect(change).toMatchObject({
      title: `Wiki · 「${store.getPaper('2210.17323').title}」· 改了正文`, diff: ['~ papers/2210.17323'], undoable: true,
    })
    expect(change.title).toMatch(/「GPTQ: /)
    store.undoChange(change.id)
    expect(store.wikiPaper('papers/2210.17323').body).not.toBe('## 这篇说了什么\n改过。')
    expect(store.getPaper('2210.17323').updated).toBe('2026-09-01')
  })

  it('改正文不动行上的主题与方法,只推 updated', () => {
    const store = createFixtureStore(() => '2026-09-10')
    const row = store.listPapers({ page: 1, size: 50 }).rows
      .find((r) => !/^\d{4}\.\d{5}$/.test(r.id) && r.topics.length > 0)!
    expect(row).toBeDefined()
    store.updateWikiPage(`papers/${row.id}`, '## 读后\n一笔。')
    const after = store.getPaper(row.id)
    expect(after.topics).toEqual(row.topics)
    expect(after.methods).toEqual(row.methods)
    expect(after.updated).toBe('2026-09-10')
  })

  it('applyPaperWikiDraft 一次写下正文和两个信任字段,updateWikiPage 只改正文不碰它们', () => {
    store.applyPaperWikiDraft('papers/2210.17323', '## 概览\nHarness 生成的正文。')
    const applied = JSON.parse(store.readPages(['papers/2210.17323'])[0]!.text!)
    expect(applied.fm.validation_state).toBe('text_converged')
    expect(applied.fm.trust_state).toBe('source_grounded_text')
    expect(applied.body).toBe('## 概览\nHarness 生成的正文。')

    store.updateWikiPage('papers/2210.17323', '## 概览\n人工改过一次。')
    const manuallyEdited = JSON.parse(store.readPages(['papers/2210.17323'])[0]!.text!)
    expect(manuallyEdited.fm.validation_state).toBe('text_converged')
    expect(manuallyEdited.fm.trust_state).toBe('source_grounded_text')
    expect(manuallyEdited.body).toBe('## 概览\n人工改过一次。')
  })

  it('导入的论文页不带信任字段', () => {
    const added = store.importPaper('No Trust.pdf', minimalPdf({ lines: ['import-no-trust'] })).paper
    const record = JSON.parse(store.readPages([`papers/${added.id}`])[0]!.text!)
    expect(record.fm.validation_state).toBeUndefined()
    expect(record.fm.trust_state).toBeUndefined()
  })

  it('旧库迁移:提案落地过且正文没变的页补上信任字段,改过的跳过,重复迁移结果一样', () => {
    const matchedBody = store.wikiPaper('papers/2210.17323').body
    const appliedBodies = new Map([
      ['2210.17323', matchedBody],
      [WITH_SOURCE, '## 已经不是这一版了'],
    ])
    const migrated = createFixtureStore(() => EPOCH, () => new Date(), appliedBodies)
    const matched = JSON.parse(migrated.readPages(['papers/2210.17323'])[0]!.text!)
    expect(matched.fm.validation_state).toBe('text_converged')
    expect(matched.fm.trust_state).toBe('source_grounded_text')
    const skipped = JSON.parse(migrated.readPages([`papers/${WITH_SOURCE}`])[0]!.text!)
    expect(skipped.fm.validation_state).toBeUndefined()
    expect(skipped.fm.trust_state).toBeUndefined()

    const migratedAgain = createFixtureStore(() => EPOCH, () => new Date(), appliedBodies)
    expect(JSON.parse(migratedAgain.readPages(['papers/2210.17323'])[0]!.text!)).toEqual(matched)
  })

  it('项目把界面上那几处 wiki 跳转的目标一起带过来', () => {
    const draft = store.getProject('draft')
    expect(draft.conflictPage).toBe('topics/ptq-weight-activation')
    expect(draft.graph.nodes.filter((n) => n.writebacks.length > 0)
      .map((n) => [n.id, n.writebacks.map((w) => w.page)]))
      .toEqual([['knee', ['topics/ptq-weight-activation']], ['bucket', ['methods/rotation']]])
    expect(draft.relations[0]!.items.map((i) => i.page))
      .toEqual(['topics/ptq-weight-activation', 'methods/rotation'])
    // The LongSpec chip opens a chat thread in the demo, not a Wiki page.
    expect(draft.relations[1]!.items[0]!.page).toBeUndefined()
    expect(store.listProjects().find((p) => p.id === 'draft')!.conflictPage).toBe('topics/ptq-weight-activation')
    expect(store.listProjects().find((p) => p.id === 'sched')!.conflictPage).toBeUndefined()
  })

  it('科研记录往后追一行,日期是库里的今天', () => {
    const before = store.getProject('draft').events.length
    const after = store.createEvent('draft', '[对话] 来自对话的结论')
    expect(after.events).toHaveLength(before + 1)
    expect(after.events.at(-1)).toEqual({ date: '2026-08-25', text: '[对话] 来自对话的结论', kind: 'note' })
    expect(store.getProject('draft').events.at(-1)!.text).toBe('[对话] 来自对话的结论')
    expect(() => store.createEvent('nope', '不存在的项目')).toThrow()
  })

  it('建了节点之后,项目上更早那一笔仍撤得动,撤销也不带走节点', () => {
    store.updateProject('sched', { focus: '改过的下一步' })
    const change = store.listChanges()[0]!
    store.createNode('sched', '新节点', null)
    store.undoChange(change.id)
    expect(store.getProject('sched').graph.nodes.map((node) => node.label)).toEqual(['新节点'])
  })

  it('科研记录的正文带换行时被拒,一个字都不写进去', () => {
    const before = store.getProject('draft').events
    for (const text of ['第一行\n第二行', '\n开头就换行', '结尾换行\n']) {
      expect(() => store.createEvent('draft', text)).toThrow(/换行/)
    }
    expect(store.getProject('draft').events).toEqual(before)
  })

  it('新记的动态排在最前,落在今天这一段', () => {
    store = createFixtureStore(
      () => EPOCH,
      () => new Date('2026-08-25T14:03:02.001Z'),
    )
    const before = store.listFeed().length
    store.appendFeed({
      source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '闪念:「新想法」' }] },
    })
    const feed = store.listFeed()
    expect(feed).toHaveLength(before + 1)
    expect(feed[0]).toMatchObject({
      source: 'me', day: '今天', time: '刚刚',
      createdAt: '2026-08-25T14:03:02.001Z',
      body: { kind: 'runs', runs: [{ kind: 'text', text: '闪念:「新想法」' }] },
    })
    expect(new Set(feed.map((e) => e.id)).size).toBe(feed.length)
  })

  it('会话列表带消息条数,归档与否也在里面', () => {
    expect(store.listChats()).toEqual([
      { id: 'amortize', title: '摊薄的前提是共享前缀吗', archived: false, messageCount: 2 },
      { id: 'widthknee', title: '宽树在我们集群上还成立吗', archived: true, messageCount: 2 },
    ])
    expect(store.chatMessages('amortize').map((m) => m.role)).toEqual(['you', 'status'])
    expect(() => store.chatMessages('nope')).toThrow()
  })

  it('新建的会话排在最前,一条消息都没有', () => {
    const created = store.createChat('新对话', false)
    expect(created).toEqual({
      id: created.id, title: '新对话', archived: false, messageCount: 0,
    })
    expect(store.listChats()[0]!.id).toBe(created.id)
    expect(store.chatMessages(created.id)).toEqual([])
    expect(new Set(store.listChats().map((s) => s.id)).size).toBe(3)
  })

  it('一篇论文只有一条上下文会话,说过话之后才进入全局对话列表', () => {
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    const first = store.chatForPaper(paper.id)
    const again = store.chatForPaper(paper.id)
    expect(again).toEqual(first)
    expect(first).toMatchObject({ title: paper.title, paperId: paper.id, messageCount: 0 })
    expect(store.listChats().some((held) => held.id === first.id)).toBe(false)

    store.appendChatMessages(first.id, [
      { role: 'you', runs: [{ kind: 'text', text: '这篇论文的假设是什么?' }], actions: [] },
    ])
    expect(store.listChats()[0]).toMatchObject({ id: first.id, paperId: paper.id, messageCount: 1 })
    expect(() => store.chatForPaper('missing-paper')).toThrow(/论文不存在/)
  })

  it('没定下标题的会话按第一条你说的话取名,取前 12 个字', () => {
    const created = store.createChat('新对话', false)
    store.appendChatMessages(created.id, [
      { role: 'you', runs: [{ kind: 'mention', text: '@draft 效率' }, { kind: 'text', text: ' 这条线还剩什么' }], actions: [] },
      { role: 'ai', runs: [{ kind: 'text', text: '已加载项目《draft 效率》' }], actions: [] },
    ])
    const named = store.listChats().find((s) => s.id === created.id)!
    expect(named.title).toBe('@draft 效率 这条')
    expect(named.messageCount).toBe(2)
    // Once finalized, later messages do not rename the chat.
    store.appendChatMessages(created.id, [
      { role: 'you', runs: [{ kind: 'text', text: '换个问题问问' }], actions: [] },
    ])
    expect(store.listChats().find((s) => s.id === created.id)!.title).toBe('@draft 效率 这条')
  })

  it('追加的消息接在原有消息后面,id 各不相同', () => {
    store.appendChatMessages('amortize', [
      { role: 'you', runs: [{ kind: 'text', text: '再问一句' }], actions: [] },
    ])
    const messages = store.chatMessages('amortize')
    expect(messages).toHaveLength(3)
    expect(messages.at(-1)!.runs[0]!.text).toBe('再问一句')
    expect(new Set(messages.map((m) => m.id)).size).toBe(3)
    expect(() => store.appendChatMessages('nope', [])).toThrow()
  })

  it('想法保存用户整理后的正文并保留来源对话，可继续编辑', () => {
    const created = store.createIdea('amortize', '  新方向  ', '  验证新的机制假设  ')
    expect(created).toMatchObject({
      title: '新方向', body: '验证新的机制假设', source: { chatId: 'amortize' },
    })
    expect(store.listIdeas().find((idea) => idea.id === created.id)?.id).toBe(created.id)
    expect(store.updateIdea(created.id, { body: '加入消融实验' })).toMatchObject({
      title: '新方向', body: '加入消融实验', source: { chatId: 'amortize' },
    })
    expect(() => store.updateIdea('no-such', { title: 'x' })).toThrow(/想法不存在/)
  })

  it('设了手动顺序后,点到的想法排到前面;没点到的仍按更新时间排在后面', () => {
    const created = store.createIdea('amortize', '排序用的新想法', '仅用于验证手动顺序')
    const before = store.listIdeas().map((idea) => idea.id)
    expect(before[0]).not.toBe(created.id)
    store.reorderIdeas([created.id])
    const after = store.listIdeas().map((idea) => idea.id)
    expect(after[0]).toBe(created.id)
    expect(new Set(after)).toEqual(new Set(before))
  })

  it('示例想法可关联项目，项目完成后自动归档，并可删除恢复', () => {
    const seeded = store.listIdeas().find((idea) => idea.id === 'idea-dynamic-tree-budget')!
    expect(seeded).toMatchObject({ project: 'draft', archived: false })
    store.updateProject('draft', { status: '已完成' })
    expect(store.listIdeas().find((idea) => idea.id === seeded.id)?.archived).toBe(true)
    store.updateProject('draft', { status: '进行中' })
    expect(store.listIdeas().find((idea) => idea.id === seeded.id)?.archived).toBe(true)
    expect(store.updateIdea(seeded.id, { project: null, archived: false })).toMatchObject({
      archived: false,
    })
    store.deleteIdea(seeded.id)
    const deleted = store.listTrash().find((entry) => entry.kind === 'idea')!
    expect(deleted.title).toBe(seeded.title)
    store.restoreTrash(deleted.id)
    expect(store.listIdeas().find((idea) => idea.id === seeded.id)?.title).toBe(seeded.title)
  })

  it('记入科研记录只记一次', () => {
    const session = store.createChat('想法', true)
    store.appendChatMessages(session.id, [{
      role: 'ai', runs: [],
      actions: [{ kind: 'writeBack', label: '记入科研记录', project: 'draft', text: '一句' }],
    }])
    const message = store.chatMessages(session.id).at(-1)!
    expect(store.recordAction(session.id, message.id).events.at(-1)!.text).toBe('[对话] 一句')
    expect(() => store.recordAction(session.id, message.id)).toThrow(/已经记入/)
  })

  it('归档与取消归档只动这一条会话,消息留着', () => {
    store.setChatArchived('amortize', true)
    expect(store.listChats().filter((s) => s.archived).map((s) => s.id))
      .toEqual(['amortize', 'widthknee'])
    expect(store.chatMessages('amortize')).toHaveLength(2)
    store.setChatArchived('amortize', false)
    expect(store.listChats().filter((s) => s.archived).map((s) => s.id)).toEqual(['widthknee'])
    expect(() => store.setChatArchived('nope', true)).toThrow()
  })

  it('取出来的消息与会话是深拷贝,改它不动库', () => {
    const messages = store.chatMessages('amortize')
    messages[0]!.runs[0]!.text = '改过了'
    expect(store.chatMessages('amortize')[0]!.runs[0]!.text).toBe('摊薄的前提是共享前缀吗?')
    const home = store.wikiHome()
    home.roots[0]!.title = '改过了'
    expect(store.wikiHome().roots[0]!.title).toBe('Long-context inference')
  })

  it('搜索空查询一条不给', () => {
    expect(store.search('')).toEqual([])
    expect(store.search('   ')).toEqual([])
  })

  it('搜索一次跨四类,每一类给出它那一屏的落点', () => {
    expect(store.search('EAGLE-2')).toEqual([
      { kind: 'project', target: 'repro', title: '项目:复现 EAGLE-2', meta: '进行中 · speculative decoding' },
      {
        kind: 'paper',
        target: 'EAGLE-2: Faster Inference of Language Models with Dynamic Draft Trees',
        title: '论文:EAGLE-2: Faster Inference of Language Models with Dynamic Draft Trees',
        meta: '2026 arXiv',
      },
    ])
    // Aggregations rank first; SpinQuant also matches "rotations" in its title and appears with papers after them.
    const rotation = store.search('Rotation')
    expect(rotation[0]).toEqual({ kind: 'aggregation', target: 'methods/rotation', title: '方法:Rotation', meta: 'Wiki' })
    expect(rotation.slice(1).every((h) => h.kind === 'paper')).toBe(true)
    expect(store.search('Distillation-based'))
      .toEqual([{ kind: 'aggregation', target: 'methods/distillation-qat', title: '方法:Distillation-based QAT', meta: 'Wiki' }])
    expect(store.search('摊薄')).toEqual([
      { kind: 'chat', target: 'amortize', title: '对话:摊薄的前提是共享前缀吗', meta: '对话' },
    ])
  })

  it('类别前缀也在被搜的那句话里', () => {
    expect(store.search('对话:').map((h) => h.kind)).toEqual(['chat', 'chat'])
    expect(store.search('主题:').map((h) => h.target)).toEqual([
      'topics/kv-cache-quantization', 'topics/long-context-inference', 'topics/ptq',
      'topics/ptq-weight-activation', 'topics/ptq-weight-only', 'topics/qat', 'topics/quantization',
    ])
  })

  it('搜索不分大小写', () => {
    expect(store.search('eagle-2')).toEqual(store.search('EAGLE-2'))
  })

  it('一次最多给 SEARCH_LIMIT 条,靠后的类别被挤掉', () => {
    const all = ['draft', 'DRAFT'].map((q) => store.search(q))
    for (const hits of all) {
      expect(hits).toHaveLength(SEARCH_LIMIT)
      expect(hits.map((h) => h.kind)).toEqual([
        'project', 'paper', 'paper', 'paper', 'paper', 'paper', 'paper', 'paper',
      ])
    }
  })

  it('删掉的论文与项目不再被搜到', () => {
    const eagle = store.search('EAGLE-2')
    expect(eagle.map((h) => h.kind)).toContain('paper')
    store.deletePaper('Li-et-al-2024-EAGLE-2-Faster-Inference-of-Language-Models-with-Dynamic-Draft-Trees')
    store.deleteProject('repro')
    expect(store.search('EAGLE-2')).toEqual([])
  })

  describe('上传与补全元数据', () => {
    it('上传的论文是未读、不进稍后阅读;补全只填空项', () => {
      const store = createFixtureStore(() => EPOCH)
      const queued = store.listLater().map((entry) => entry.id)
      const added = store.importPaper('Uploaded Paper.pdf', minimalPdf({ lines: ['Uploaded paper body'] }))
      expect(added.paper.readState).toBe('未读')
      expect(store.listLater().map((entry) => entry.id)).toEqual(queued)
      expect(store.fillPaperMetadata(added.paper.id, {
        title: 'Parsed', authors: ['Mei Lin'], year: 2025, venue: 'arXiv', abstract: 'Summary.',
      }, 'Uploaded Paper')).toEqual(['title', 'authors', 'year', 'venue', 'abstract'])
      expect(store.getPaper(added.paper.id)).toMatchObject({
        title: 'Parsed', authors: ['Mei Lin'], year: 2025, venue: 'arXiv', abstract: 'Summary.',
      })
      expect(store.fillPaperMetadata(added.paper.id, { authors: ['Someone Else'] }, 'Uploaded Paper')).toEqual([])
    })

    it('补全同步到稍后阅读里指着同一份原文的那一条', () => {
      const store = createFixtureStore(() => EPOCH)
      expect(store.readLater('specdec')).toBe(true)
      const made = store.completeInboxDownload('specdec', minimalPdf({ lines: ['Speculative Decoding'] }))
      const held = store.getPaper(made.paper).title
      expect(store.fillPaperMetadata(made.paper, { title: 'Parsed Title' }, held)).toEqual(['title'])
      expect(store.listLater().find((entry) => entry.id === 'specdec')).toMatchObject({ title: 'Parsed Title' })
    })

    it('重复上传不重复入队,补全不记进最近变动', () => {
      const store = createFixtureStore(() => EPOCH)
      const bytes = minimalPdf({ lines: ['Uploaded twice'] })
      const added = store.importPaper('Twice.pdf', bytes)
      const queued = store.listLater().length
      const changes = store.listChanges().length
      expect(store.importPaper('Twice again.pdf', bytes).kind).toBe('existing')
      expect(store.listLater()).toHaveLength(queued)
      store.fillPaperMetadata(added.paper.id, { year: 2025 }, null)
      expect(store.listChanges()).toHaveLength(changes)
    })
  })

  it('论文行的随笔取自阅读记录,列表里的那一行也带着;清空之后行上没有这一项', () => {
    const store = createFixtureStore(() => EPOCH)
    store.mutatePaperReading(WITH_SOURCE, { kind: 'remark.set', text: '整篇的随想' })
    expect(store.getPaper(WITH_SOURCE).remark).toBe('整篇的随想')
    const title = store.getPaper(WITH_SOURCE).title
    expect(store.listPapers({ page: 1, size: 10, filter: title }).rows
      .find((row) => row.id === WITH_SOURCE)?.remark).toBe('整篇的随想')
    store.mutatePaperReading(WITH_SOURCE, { kind: 'remark.set', text: '' })
    expect(store.getPaper(WITH_SOURCE)).not.toHaveProperty('remark')
  })

  it('契约里的每个 vault 数据方法在 store 上都有对应实现', () => {
    const covered: Record<string, () => unknown> = {
      'vault.today': () => store.today(),
      'papers.list': () => store.listPapers({ page: 1, size: 1 }),
      'papers.facets': () => store.facetPapers('topics'),
      'papers.get': () => store.getPaper(store.listPapers({ page: 1, size: 1 }).rows[0]!.id),
      'papers.update': () => store.updatePaper(store.listPapers({ page: 1, size: 1 }).rows[0]!.id, {}),
      'papers.delete': () => store.deletePaper(store.listPapers({ page: 1, size: 1 }).rows[0]!.id),
      'project.list': () => store.listProjects(),
      'project.overview': () => store.overviewProjects(),
      'project.create': () => store.createProject('新项目'),
      'project.get': () => store.getProject('draft'),
      'project.bindWorkspace': () => store.bindProjectWorkspace('draft', { kind: 'local', root: VAULT }),
      'project.update': () => store.updateProject('draft', {}),
      'project.delete': () => store.deleteProject('fa'),
      'project.createTask': () => store.createTask('draft', {
        title: '新任务', start: '2026-08-25', end: '2026-08-31', state: 'act', priority: 'p1',
      }),
      'project.updateTask': () => store.updateTask('draft', 't2', {}),
      'project.deleteTask': () => store.deleteTask('draft', 't2'),
      'project.createMilestone': () => store.createMilestone('draft', {
        date: '2026-09-01', title: '新里程碑', done: false,
      }),
      'project.updateMilestone': () => store.updateMilestone('draft', 'm2', {}),
      'project.deleteMilestone': () => store.deleteMilestone('draft', 'm2'),
      'project.createRelation': () => store.createRelation('draft', { group: 'Wiki', text: '新关联' }),
      'project.deleteRelation': () =>
        store.deleteRelation('draft', store.getProject('draft').relations[0]!.items[0]!.id),
      'project.createAttachment': () => store.createAttachment('draft', {
        name: '新附件.csv', size: '1 KB', path: resolve(VAULT, '新附件.csv'),
      }),
      'project.deleteAttachment': () =>
        store.deleteAttachment('draft', store.getProject('draft').attachments[0]!.id),
      'project.createEvent': () => store.createEvent('draft', '[对话] 来自对话的结论'),
      'project.createNode': () => store.createNode('draft', '新节点', null),
      'project.updateNode': () => store.updateNode('draft', 'knee', { state: 'done' }),
      'project.deleteNode': () => store.deleteNode('draft', 'bucket'),
      'inbox.list': () => store.listInbox(),
      'inbox.dismiss': () => store.dismissInbox('drafterlite'),
      'inbox.readLater': () => store.readLater('sequoia2'),
      'inbox.download': () => store.completeInboxDownload('fa3', minimalPdf({ lines: ['fa3'] })),
      'discovery.profiles': () => store.listDiscoveryProfiles(),
      'discovery.intent': () => {
        const intent = store.listDiscoveryProfiles()
          .find((profile) => profile.id === 'draft')?.intents[0]
        if (intent) store.setDiscoveryIntent('draft', intent.id, 'set-core')
      },
      'discovery.feedback': () => {
        store.addDiscoveryEntries('draft', [{
          semanticId: 'semantic-test', id: '2609.99991', title: 'Discovery Contract Test',
          authors: [], abstract: '', submitted: '2026-09-01', journalRef: null,
          pdf: 'https://arxiv.org/pdf/2609.99991',
        }])
        const entry = store.listInbox({ kind: 'discovery' })[0]!
        store.feedbackDiscovery(entry.id, 'more')
      },
      'later.list': () => store.listLater(),
      'later.remove': () => store.removeLater('mixtral'),
      'watch.list': () => store.listWatches(),
      'watch.create': () => store.createWatch({ type: 'topic', name: 'kv cache' }),
      'watch.update': () => store.updateWatch('spec', { type: 'topic', name: 'speculative sampling' }),
      'watch.setActive': () => store.setWatchActive('moe', false),
      'watch.delete': () => store.deleteWatch('moe'),
      'wiki.home': () => store.wikiHome(),
      'wiki.aggregation': () => store.wikiAggregation('topics/ptq'),
      'wiki.paper': () => store.wikiPaper('papers/2404.00456'),
      'wiki.cards': () => store.wikiCards(),
      'wiki.apply': () => store.applyProposal({
        source: 'chat', title: '测试',
        ops: [{ op: 'appendEntry', page: 'topics/ptq', section: '未解决', date: EPOCH, text: '一条' }],
      }),
      'wiki.update': () => store.updateWikiPage('topics/ptq', '## 问题\n改过的。'),
      'wiki.signals': () => store.wikiSignals(),
      'trash.list': () => store.listTrash(),
      'trash.restore': () => {
        store.deletePaper(store.listPapers({ page: 1, size: 1 }).rows[0]!.id)
        store.restoreTrash(store.listTrash()[0]!.id)
      },
      'trash.purge': () => {
        store.deletePaper(store.listPapers({ page: 1, size: 1 }).rows[0]!.id)
        store.purgeTrash(store.listTrash()[0]!.id)
      },
      'trash.clear': () => store.clearTrash(),
      'changelog.list': () => store.listChanges(),
      'changelog.undo': () => {
        store.updateProject('draft', { focus: '撤销要用的那一笔' })
        store.undoChange(store.listChanges()[0]!.id)
      },
      'changelog.archive': () => {
        store.updateProject('draft', { focus: '归档要用的那一笔' })
        store.archiveChange(store.listChanges()[0]!.id)
      },
      'changelog.archiveAll': () => store.archiveAllChanges(),
      'changelog.delete': () => {
        store.updateProject('draft', { focus: '删除变动记录所用的一笔' })
        store.deleteChange(store.listChanges()[0]!.id)
      },
      'changelog.clearArchived': () => {
        store.updateProject('draft', { focus: '清空归档记录所用的一笔' })
        store.archiveChange(store.listChanges()[0]!.id)
        store.clearArchivedChanges()
      },
      'feed.list': () => store.listFeed(),
      'feed.append': () => store.appendFeed({
        source: 'me', body: { kind: 'runs', runs: [{ kind: 'text', text: '闪念:「新想法」' }] },
      }),
      'chat.list': () => store.listChats(),
      'chat.messages': () => store.chatMessages('amortize'),
      'chat.create': () => store.createChat('新对话', false),
      'chat.forPaper': () => store.chatForPaper(
        store.listPapers({ page: 1, size: 1 }).rows[0]!.id,
      ),
      'chat.append': () => store.appendChatMessages('amortize', [
        { role: 'you', runs: [{ kind: 'text', text: '再问一句' }], actions: [] },
      ]),
      'idea.list': () => store.listIdeas(),
      'idea.create': () => store.createIdea('amortize', '新方向', '需要验证的机制'),
      'idea.update': () => {
        const created = store.createIdea('amortize', '待修改', '正文')
        return store.updateIdea(created.id, { title: '已修改' })
      },
      'idea.promote': () => {
        const created = store.createIdea('amortize', '转为项目', '项目起点')
        store.createProject(created.title)
        const made = store.listProjects().find((project) => project.name === created.title)!
        return store.updateIdea(created.id, { project: made.id })
      },
      'idea.delete': () => {
        const created = store.createIdea('amortize', '待删除', '正文')
        return store.deleteIdea(created.id)
      },
      'idea.reorder': () => store.reorderIdeas(store.listIdeas().map((idea) => idea.id)),
      'chat.recordAction': () => {
        const session = store.createChat('记录会话', true)
        store.appendChatMessages(session.id, [{
          role: 'ai', runs: [], actions: [{
            kind: 'writeBack', label: '记入科研记录', project: 'draft', text: '一句',
          }],
        }])
        return store.recordAction(session.id, store.chatMessages(session.id).at(-1)!.id)
      },
      'chat.setArchived': () => store.setChatArchived('amortize', true),
      'papers.source': () => store.paperSource(WITH_SOURCE),
      'papers.import': () => store.importPaper('uploaded.pdf', Uint8Array.from(Buffer.from('%PDF-1.7\n%%EOF'))),
      'papers.reading': () => store.paperReading(WITH_SOURCE),
      'papers.mutateReading': () => store.mutatePaperReading(WITH_SOURCE, {
        kind: 'note.add', page: 1, text: '阅读笔记',
      }),
      'papers.columns': () => store.paperColumns(),
      'papers.setColumns': () => store.setPaperColumns(emptyColumns()),
      'papers.renameOption': () => {
        store.setPaperColumns({
          ...emptyColumns(),
          custom: [{ key: 'du-fa', label: '读法', type: 'select', options: ['精读'] }],
        })
        store.renamePaperOption('du-fa', '精读', '细读')
      },
      'papers.setColumnType': () => {
        store.setPaperColumns({
          ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
        })
        store.setPaperColumnType('note', 'select')
      },
      'project.addPaper': () => store.addPaper('draft', '2305.17888'),
      'project.removePaper': () => store.removePaper('draft', '13979-STAR-Speculative-Decodin'),
      'project.moveRelation': () => store.moveRelation('draft', store.getProject('draft').relations[0]!.items[0]!.id, 1),
      'project.reorder': () => store.reorderProjects(store.listProjects().map((p) => p.id)),
      'project.createConclusion': () => store.createConclusion('draft', '新结论', {}),
      'project.setConclusionState': () => store.setConclusionState('draft', 'c1', 'pending'),
      'project.deleteConclusion': () => store.deleteConclusion('draft', 'c2'),
      'delivery.settings': () => store.deliverySettings(),
      'delivery.updateSettings': () => store.setDeliverySettings({ maxItemsPerRun: 12 }),
      'search.query': () => store.search('draft'),
    }
    // Library location and background tasks are Core process configuration, not state of one opened VaultStore.
    const coreMethods = new Set([
      'library.location', 'library.configure', 'library.reset', 'library.backups',
      'library.switchBackup', 'library.deleteBackup', 'extensions.status', 'extensions.checkLatest', 'extensions.pluginVersion', 'delivery.semanticKey', 'delivery.setSemanticKey', 'delivery.checkSemanticKey', 'jobs.status', 'inbox.fetch',
      'discovery.fetch', 'author.search', 'watch.suggest', 'harness.prepare', 'harness.pendingPaperWiki',
      'harness.start', 'harness.cancel',
      'harness.modelSettings', 'harness.updateModelSettings', 'harness.checkModelConnection',
      'harness.applyPaperWiki',
      'harness.rejectPaperWiki', 'chat.send', 'chat.cancel',
      'idea.placeOnGraph', 'wiki.propose', 'wiki.proposals', 'wiki.decide',
    ])
    for (const method of CONTRACT_METHODS.filter((candidate) => !coreMethods.has(candidate))) {
      expect(covered[method], `契约方法 ${method} 没有实现`).toBeDefined()
      expect(() => covered[method]!()).not.toThrow()
    }
  })
})
