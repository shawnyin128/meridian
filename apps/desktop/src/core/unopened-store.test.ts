import { describe, expect, it } from 'vitest'
import { unopenedStore } from './unopened-store.js'

describe('unopened store', () => {
  it('每个方法都抛出打不开库的原因', () => {
    const store = unopenedStore('库里没有论文页目录:D:\\x\\wiki\\papers')
    expect(() => store.today()).toThrow('库里没有论文页目录:D:\\x\\wiki\\papers')
    expect(() => store.listPapers({ page: 1, size: 1 })).toThrow('库里没有论文页目录')
    expect(() => store.listChats()).toThrow('库里没有论文页目录')
  })

  // Core posts a startup version notice through appendFeed before any contract handler is ready;
  // this throw is why that call must be skipped rather than made, or Core crashes before it can
  // even answer library.location.
  it('appendFeed 同样抛出，调用方在库打不开时必须跳过而不是捕获', () => {
    const store = unopenedStore('库里没有论文页目录:D:\\x\\wiki\\papers')
    expect(() => store.appendFeed({ source: 'steward', body: { kind: 'runs', runs: [] } }))
      .toThrow('库里没有论文页目录')
  })
})
