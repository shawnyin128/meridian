import { describe, expect, it } from 'vitest'
import { claimId, colourThemeId, nextKey, slugOf } from '../lib/slug.js'

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

describe('claimId', () => {
  it('只留 a-z、0-9 与 -,截到 40 个字符;撞上了加序号;没有这些字符就用 c 加序号', () => {
    expect(claimId('Wide trees win at B ≥ 8', [])).toBe('wide-trees-win-at-b-8')
    expect(claimId('4 bit 权重量化', [])).toBe('4-bit')
    expect(claimId('a'.repeat(50), [])).toHaveLength(40)
    expect(claimId('knee', ['knee', 'knee-2'])).toBe('knee-3')
    expect(claimId('拐点', ['c1'])).toBe('c2')
    expect(claimId('x - y', [])).toBe('x-y')
  })
})

describe('colourThemeId', () => {
  it('只留 a-z、0-9 与 -,截到 40 个字符;撞上了加序号;名字里没有这些字符就用 theme', () => {
    expect(colourThemeId('My Theme', [])).toBe('my-theme')
    expect(colourThemeId('My Theme', ['my-theme', 'my-theme-2'])).toBe('my-theme-3')
    expect(colourThemeId('Default', ['default'])).toBe('default-2')
    expect(colourThemeId('青瓷', [])).toBe('theme')
    expect(colourThemeId('青瓷 2', ['theme'])).toBe('2')
    expect(colourThemeId('雨过天青', ['theme'])).toBe('theme-2')
    expect(colourThemeId('a'.repeat(80), [])).toHaveLength(40)
  })
})
