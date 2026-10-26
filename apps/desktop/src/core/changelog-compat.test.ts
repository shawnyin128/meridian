import { describe, expect, it } from 'vitest'
import { ProjectDetailSchema } from '../shared/contract.js'
import { type ChangeRecord, parseChangeRecords, withChangelog } from './changelog.js'
import { createFixtureStore } from './fixture-store.js'
import { readRecord } from './vault/stored-records.js'

/** A project change record shaped the way 0.0.13 wrote it: graphs carried `activePath`, not `activeNodes`. */
function legacyProjectRecord(): Record<string, unknown> {
  const project = createFixtureStore(() => '2026-08-25').heldProject('draft') as unknown as Record<string, unknown>
  const graph = { ...(project['graph'] as Record<string, unknown>) }
  delete graph['activeNodes']
  return {
    id: 'change-7', title: '改了项目', meta: null, source: '我', diff: ['~ 焦点'], undone: false, archived: false,
    target: { kind: 'project', id: 'draft' }, after: '0123456789abcdef', at: Date.UTC(2026, 8, 20),
    restore: {
      kind: 'project',
      project: {
        ...project,
        graph: { ...graph, activePath: ['draft.a', 'draft.b'] },
        workspace: {
          kind: 'local', root: 'D:/research/x', state: 'ready', planPath: 'D:/research/x/.meridian/control/plan.json',
          graph: { nodes: [], edges: [], activePath: ['x.a'] }, events: [],
        },
      },
    },
  }
}

describe('reading change logs older versions wrote', () => {
  it('0.0.13 写的项目快照照常读出:activePath 换成最后一个节点的 activeNodes,仍可撤销', () => {
    const [record] = parseChangeRecords([legacyProjectRecord()]).rows
    expect(record?.restore).toMatchObject({
      kind: 'project',
      project: { graph: { activeNodes: ['draft.b'] }, workspace: { graph: { activeNodes: ['x.a'] } } },
    })
    expect(record?.restore?.kind === 'project' && 'activePath' in record.restore.project.graph).toBe(false)
  })

  it('0.0.15.4 应用提案时按提案自己的标题记下的变动,标题照原样读出,仍可撤销', () => {
    const applied = {
      id: 'change-4', title: 'Wiki · 宽树实验的结论', meta: null, source: '实验', diff: ['+ topics/qat#c1:结论 c1'],
      undone: false, archived: false, target: { kind: 'pages', id: 'topics/qat', paths: ['topics/qat'] },
      after: '0123456789abcdef', at: Date.UTC(2026, 9, 1),
      restore: { kind: 'pages', pages: [{ path: 'topics/qat', text: '---\nkind: topic\n---\n' }] },
    }
    const [record] = parseChangeRecords([applied]).rows
    expect(record).toMatchObject({ title: 'Wiki · 宽树实验的结论', restore: { kind: 'pages' } })
  })

  it('这个版本记下的几个领域的项目快照,0.0.16.1 的项目形状照样读得出,只是不认识 topics', async () => {
    let saved: ChangeRecord[] = []
    const store = withChangelog(createFixtureStore(() => '2026-08-25'), {
      load: () => saved, save: (rows) => { saved = rows }, nextId: () => `change-${saved.length + 1}`,
      atomically: (write) => write(),
    })
    await store.updateProject('draft', { topics: ['speculative decoding', 'KV cache'] })
    await store.updateProject('draft', { focus: '改过的焦点' })
    const snapshot = JSON.parse(JSON.stringify(saved[0]!.restore)) as { project: Record<string, unknown> }
    expect(snapshot.project['topics']).toEqual(['speculative decoding', 'KV cache'])
    // 0.0.16.1's project shape is this version's without `topics`.
    const read = readRecord(ProjectDetailSchema.omit({ topics: true }).strict(), snapshot.project)
    expect('error' in read).toBe(false)
    expect('error' in read ? [] : read.unknown.map((field) => field.key)).toEqual(['topics'])
    expect('error' in read ? undefined : read.value.topic).toBe('speculative decoding')
  })

  it('撤销数据读不了的一条留作历史、不能撤销;整条读不了的跳过;其余照常', () => {
    const broken = { ...legacyProjectRecord(), id: 'change-8', restore: { kind: 'project', project: { name: 3 } } }
    const garbage = { id: 9 }
    const records = parseChangeRecords([legacyProjectRecord(), broken, garbage]).rows
    expect(records.map((record) => [record.id, record.restore === null])).toEqual([
      ['change-7', false], ['change-8', true],
    ])
  })
})
