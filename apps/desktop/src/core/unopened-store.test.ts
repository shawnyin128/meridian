import { describe, expect, it } from 'vitest'
import { callFailure } from './call-error.js'
import { createFixtureStore } from './fixture-store.js'
import { isUnopenedStore, unopenedStore } from './unopened-store.js'

describe('unopened store', () => {
  it('每个方法都抛出打不开库的原因', () => {
    const store = unopenedStore('库里没有论文页目录:D:\\x\\wiki\\papers', 'invalid')
    expect(() => store.today()).toThrow('库里没有论文页目录:D:\\x\\wiki\\papers')
    expect(() => store.listPapers({ page: 1, size: 1 })).toThrow('库里没有论文页目录')
    expect(() => store.listChats()).toThrow('库里没有论文页目录')
  })

  it('认得出自己替打不开的库站着的那一个,别的库不算', () => {
    expect(isUnopenedStore(unopenedStore('库里没有论文页目录', 'invalid'))).toBe(true)
    expect(isUnopenedStore(createFixtureStore())).toBe(false)
  })

  it('每个方法失败的原因都是打不开库的那一类', () => {
    const store = unopenedStore('.meridian/state.json 这个版本读不了', 'newer-version')
    let thrown: unknown
    try {
      store.listChats()
    } catch (error) {
      thrown = error
    }
    expect(callFailure(thrown)).toBe('newer-version')
  })

  // Core posts a startup version notice through appendFeed before any contract handler is ready;
  // this throw is why that call must be skipped rather than made, or Core crashes before it can
  // even answer library.location.
  it('appendFeed 同样抛出，调用方在库打不开时必须跳过而不是捕获', () => {
    const store = unopenedStore('库里没有论文页目录:D:\\x\\wiki\\papers', 'invalid')
    expect(() => store.appendFeed({ source: 'steward', body: { kind: 'runs', runs: [] } }))
      .toThrow('库里没有论文页目录')
  })
})
