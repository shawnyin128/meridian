import { describe, expect, it } from 'vitest'
import { unopenedStore } from './unopened-store.js'

describe('unopened store', () => {
  it('每个方法都抛出打不开库的原因', () => {
    const store = unopenedStore('库里没有论文页目录:D:\\x\\wiki\\papers')
    expect(() => store.today()).toThrow('库里没有论文页目录:D:\\x\\wiki\\papers')
    expect(() => store.listPapers({ page: 1, size: 1 })).toThrow('库里没有论文页目录')
    expect(() => store.listChats()).toThrow('库里没有论文页目录')
  })
})
