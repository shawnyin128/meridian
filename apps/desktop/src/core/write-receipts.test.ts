import { describe, expect, it } from 'vitest'
import { createFixtureStore } from './fixture-store.js'
import { recordChange, trashedEntry } from './write-receipts.js'

/** A fixture paper whose topics are its Wiki topic memberships. */
const FILED = '2401.18079'

describe('写入回执', () => {
  it('记进最近变动的写入回给它记下的那一条,撤销那一条正好撤回这次写入', () => {
    const store = createFixtureStore(() => '2026-08-25')
    const before = store.getPaper(FILED).topics
    const { result, change } = recordChange(store, () => store.setPaperTopic(FILED, '新主题', true))
    expect(result).toBeUndefined()
    expect(change).toBe(store.listChanges()[0]!.id)
    store.undoChange(change)
    expect(store.getPaper(FILED).topics).toEqual(before)
  })

  it('没记进最近变动的写入不给回执,直接报错', () => {
    const store = createFixtureStore(() => '2026-08-25')
    expect(() => recordChange(store, () => store.setPaperColumns(store.paperColumns()))).toThrow('最近变动')
  })

  it('移进垃圾桶的写入回给垃圾桶里多出的那一条,恢复它正好放回这一项', () => {
    const store = createFixtureStore(() => '2026-08-25')
    const idea = store.createIdea('amortize', '待删的想法', '正文')
    const { trash } = trashedEntry(store, () => store.deleteIdea(idea.id))
    expect(store.listTrash()[0]).toMatchObject({ id: trash, kind: 'idea' })
    store.restoreTrash(trash)
    expect(store.listIdeas().map((held) => held.id)).toContain(idea.id)
  })

  it('垃圾桶里没多出一条时直接报错', () => {
    const store = createFixtureStore(() => '2026-08-25')
    expect(() => trashedEntry(store, () => {})).toThrow('垃圾桶')
  })
})
