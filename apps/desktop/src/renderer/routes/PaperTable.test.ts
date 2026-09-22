// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { PaperColumns } from '../../shared/contract.js'
import { papers as papersZh } from '../messages/zh/papers.js'
import { columnsNote, movedColumnOrder } from './PaperTable.js'

const notices = papersZh.notices
const base: PaperColumns = {
  hidden: [],
  custom: [
    { key: 'note', label: '备注', type: 'text', options: [] },
    { key: 'level', label: '读法', type: 'select', options: ['精读', '略读'] },
  ],
  groups: ['topics', 'level'],
}

/** Replace the string of custom columns on base. */
const withCustom = (custom: PaperColumns['custom']): PaperColumns => ({ ...base, custom })

describe('columnsNote', () => {
  it('删了一列时报那一列的名字', () => {
    expect(columnsNote(base, withCustom([base.custom[0]!]), notices)).toBe('已删除列「读法」')
  })

  it('加了一列时报全库可用', () => {
    const added = withCustom([...base.custom, { key: 'own', label: '自评', type: 'text', options: [] }])
    expect(columnsNote(base, added, notices)).toBe('已新建列 · 全库可用')
  })

  it('改了列名时报重命名', () => {
    const renamed = withCustom([{ ...base.custom[0]!, label: '批注' }, base.custom[1]!])
    expect(columnsNote(base, renamed, notices)).toBe('已重命名列')
  })

  it('只动了分组时报更新分组', () => {
    expect(columnsNote(base, { ...base, groups: ['topics'] }, notices)).toBe('已更新分组')
  })

  it('只动了选项时报删除选项', () => {
    const fewer = withCustom([base.custom[0]!, { ...base.custom[1]!, options: ['精读'] }])
    expect(columnsNote(base, fewer, notices)).toBe('已删除选项')
  })

  it('什么都没动时没有可报的', () => {
    expect(columnsNote(base, { ...base }, notices)).toBeUndefined()
  })

  it('标题不进顺序,其余内置列与自定义列可以持久化换位', () => {
    const order = movedColumnOrder(base, 'topics', 'short')
    expect(order[0]).toBe('topics')
    expect(order.indexOf('short')).toBeLessThan(order.indexOf('rating'))
    expect(order).toContain('note')
    expect(order).not.toContain('t')
  })

  it('拖到列的右半边时放到该列之后', () => {
    const order = movedColumnOrder(base, 'topics', 'short', true)
    expect(order.indexOf('topics')).toBe(order.indexOf('short') + 1)
  })

  it('删列压过同一次里的改名', () => {
    const goneAndRenamed = withCustom([{ ...base.custom[0]!, label: '批注' }])
    expect(columnsNote(base, goneAndRenamed, notices)).toBe('已删除列「读法」')
  })
})
