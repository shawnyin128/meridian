// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { PaperColumns } from '../../shared/contract.js'
import { columnKey, takenLabel } from '../components/paper-table/column-key.js'

const columns: PaperColumns = {
  hidden: [],
  custom: [
    { key: 'note', label: '备注', type: 'text', options: [] },
    { key: 'du-fa', label: '读法', type: 'select', options: [] },
  ],
  groups: [],
}

describe('columnKey', () => {
  it('英文列名折成小写连字符串', () => {
    expect(columnKey('Read Level', columns)).toBe('read-level')
  })

  it('中文列名一个合法字符都不剩,落到 col', () => {
    expect(columnKey('读法', columns)).toBe('col')
    expect(columnKey('、、', columns)).toBe('col')
  })

  it('与已有自定义列的 key 撞了就接 -2', () => {
    expect(columnKey('note', columns)).toBe('note-2')
  })

  it('避开分组栏的哨兵与内置列的 key', () => {
    expect(columnKey('none', columns)).toBe('none-2')
    expect(columnKey('topics', columns)).toBe('topics-2')
  })

  it('避开标题列的保留 key t', () => {
    expect(columnKey('t', columns)).toBe('t-2')
  })

  it('避开只在内置列列表里的 key', () => {
    expect(columnKey('st', columns)).toBe('st-2')
  })

  it('避开内置列发表的 key venue', () => {
    expect(columnKey('venue', columns)).toBe('venue-2')
  })
})

// The labels a caller would read from the active catalog: the title column plus the built-in columns.
const builtinLabels = ['标题', '短标题', '评分', '作者', '年份', '发表', '主题', '状态', '随笔']

describe('takenLabel', () => {
  it('与标题列、内置列、已有自定义列同名都算占了', () => {
    expect(takenLabel('标题', columns, builtinLabels)).toBe(true)
    expect(takenLabel('年份', columns, builtinLabels)).toBe(true)
    expect(takenLabel('备注', columns, builtinLabels)).toBe(true)
  })

  it('没人用过的名字不算占', () => {
    expect(takenLabel('批注', columns, builtinLabels)).toBe(false)
  })

  it('内置列「发表」也算占了', () => {
    expect(takenLabel('发表', columns, builtinLabels)).toBe(true)
  })
})
