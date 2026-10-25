// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { PaperColumns } from '../../shared/contract.js'
import { papers as papersZh } from '../messages/zh/papers.js'
import { columnsNote } from './PaperTable.js'

const notices = papersZh.notices
const base: PaperColumns = {
  hidden: [],
  custom: [
    { key: 'note', label: '备注', type: 'text', options: [] },
    { key: 'level', label: '读法', type: 'select', options: ['精读', '略读'] },
  ],
  groups: ['topics', 'level'],
}

/** Returns `base` with its custom columns replaced. */
const withCustom = (custom: PaperColumns['custom']): PaperColumns => ({ ...base, custom })

describe('columnsNote', () => {
  it('删了一列时报那一列的名字', () => {
    expect(columnsNote(base, withCustom([base.custom[0]!]), notices)).toBe('已删除列「读法」')
  })

  it('加了一列、改了列名、动了分组或加了选项都显示在表上，没有通知', () => {
    const added = withCustom([...base.custom, { key: 'own', label: '自评', type: 'text', options: [] }])
    const renamed = withCustom([{ ...base.custom[0]!, label: '批注' }, base.custom[1]!])
    const more = withCustom([base.custom[0]!, { ...base.custom[1]!, options: ['精读', '略读', '泛读'] }])
    expect([added, renamed, { ...base, groups: ['topics'] }, more].map((next) => columnsNote(base, next, notices)))
      .toEqual([undefined, undefined, undefined, undefined])
  })

  it('只动了选项时报删除选项', () => {
    const fewer = withCustom([base.custom[0]!, { ...base.custom[1]!, options: ['精读'] }])
    expect(columnsNote(base, fewer, notices)).toBe('已删除选项')
  })

  it('什么都没动时没有可报的', () => {
    expect(columnsNote(base, { ...base }, notices)).toBeUndefined()
  })

  it('删列压过同一次里的改名', () => {
    const goneAndRenamed = withCustom([{ ...base.custom[0]!, label: '批注' }])
    expect(columnsNote(base, goneAndRenamed, notices)).toBe('已删除列「读法」')
  })
})
