import { describe, expect, it } from 'vitest'
import type { AuthorCandidate } from '../../shared/contract.js'
import { createAuthorSearch, firstAnswer, type AuthorSearchSource } from './scholar-sources.js'

const candidate = (source: AuthorCandidate['source'], id: string): AuthorCandidate => ({
  source, id, name: 'Song Han', affiliations: [], paperCount: 1, citationCount: 1, hIndex: 1,
})

const fakeSource = (name: string, search: (query: string) => Promise<AuthorCandidate[]>): AuthorSearchSource => ({
  name, searchAuthors: search,
})

describe('firstAnswer', () => {
  it('按顺序问，第一个成功的答案胜出；全失败时抛最后一个错误', async () => {
    await expect(firstAnswer([1, 2, 3], async (n) => {
      if (n < 2) throw new Error(`no ${n}`)
      return n
    })).resolves.toBe(2)
    await expect(firstAnswer([1, 2], async (n) => { throw new Error(`no ${n}`) })).rejects.toThrow('no 2')
    await expect(firstAnswer([], async () => 1)).rejects.toThrow('没有可用的学术数据源')
  })
})

describe('createAuthorSearch', () => {
  it('第一个来源失败时改用下一个来源', async () => {
    const search = createAuthorSearch({
      sources: () => [
        fakeSource('semantic-scholar', async () => { throw new Error('429') }),
        fakeSource('openalex', async () => [candidate('openalex', 'A1')]),
      ],
    })
    await expect(search.search('Song Han')).resolves.toEqual([candidate('openalex', 'A1')])
  })

  it('相同名字复用成功缓存，并合并同时发生的查询', async () => {
    let calls = 0
    let release: (() => void) | undefined
    const blocked = new Promise<void>((done) => { release = done })
    const source = fakeSource('openalex', async () => {
      calls += 1
      await blocked
      return [candidate('openalex', 'A1')]
    })
    const search = createAuthorSearch({ sources: () => [source], now: () => 100 })
    const one = search.search('Song  Han')
    const two = search.search(' song han ')
    release?.()
    await expect(Promise.all([one, two])).resolves.toHaveLength(2)
    await expect(search.search('SONG HAN')).resolves.toMatchObject([{ source: 'openalex', id: 'A1' }])
    expect(calls).toBe(1)
  })

  it('来源顺序变了就重新查，不复用另一个来源的缓存', async () => {
    let semanticCalls = 0
    let withKey = false
    const semantic = fakeSource('semantic-scholar', async () => {
      semanticCalls += 1
      return [candidate('semantic-scholar', '123')]
    })
    const openAlex = fakeSource('openalex', async () => [candidate('openalex', 'A1')])
    const search = createAuthorSearch({ sources: () => (withKey ? [semantic, openAlex] : [openAlex]) })
    await search.search('Song Han')
    withKey = true
    await expect(search.search('Song Han')).resolves.toMatchObject([{ source: 'semantic-scholar' }])
    expect(semanticCalls).toBe(1)
  })
})
