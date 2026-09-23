import { describe, expect, it } from 'vitest'
import { parseChangeRecords } from './changelog.js'
import { createFixtureStore } from './fixture-store.js'

/** A project change record shaped the way 0.0.13 wrote it: graphs carried `activePath`, not `activeNodes`. */
function legacyProjectRecord(): Record<string, unknown> {
  const project = createFixtureStore(() => '2026-08-25').getProject('draft') as unknown as Record<string, unknown>
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
    const [record] = parseChangeRecords([legacyProjectRecord()])
    expect(record?.restore).toMatchObject({
      kind: 'project',
      project: { graph: { activeNodes: ['draft.b'] }, workspace: { graph: { activeNodes: ['x.a'] } } },
    })
    expect(record?.restore?.kind === 'project' && 'activePath' in record.restore.project.graph).toBe(false)
  })

  it('撤销数据读不了的一条留作历史、不能撤销;整条读不了的跳过;其余照常', () => {
    const broken = { ...legacyProjectRecord(), id: 'change-8', restore: { kind: 'project', project: { name: 3 } } }
    const garbage = { id: 9 }
    const records = parseChangeRecords([legacyProjectRecord(), broken, garbage])
    expect(records.map((record) => [record.id, record.restore === null])).toEqual([
      ['change-7', false], ['change-8', true],
    ])
  })
})
