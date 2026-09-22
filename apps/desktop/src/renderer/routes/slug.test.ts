import { describe, expect, it } from 'vitest'
import { nextKey, slugOf } from '../lib/slug.js'

describe('slugOf', () => {
  it('字母数字留着,其余连续字符并成一个 -,ASCII 转小写', () => {
    expect(slugOf('QAT 蒸馏')).toBe('qat-蒸馏')
    expect(slugOf('量化')).toBe('量化')
  })

  it('全角先按 NFKC 归一', () => {
    expect(slugOf('ＱＡＴ')).toBe('qat')
  })

  it('首尾的标点不留成 -', () => {
    expect(slugOf('(a) b!')).toBe('a-b')
  })
})

describe('nextKey', () => {
  it('没撞上就用 slug 本身,撞上了依次往后加序号', () => {
    expect(nextKey('备注', [])).toBe('备注')
    expect(nextKey('备注', ['备注'])).toBe('备注-2')
    expect(nextKey('备注', ['备注', '备注-2'])).toBe('备注-3')
  })
})
