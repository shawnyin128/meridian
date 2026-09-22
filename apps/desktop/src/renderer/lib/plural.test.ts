import { describe, expect, it } from 'vitest'
import { pluralEn } from './plural.js'

describe('英文复数', () => {
  it('1 取单数，其他取复数', () => {
    expect(pluralEn(1, { one: 'item', other: 'items' })).toBe('item')
    expect(pluralEn(0, { one: 'item', other: 'items' })).toBe('items')
    expect(pluralEn(2, { one: 'item', other: 'items' })).toBe('items')
  })
})
