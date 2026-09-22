// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { PaperColumns } from '../../shared/contract.js'
import { groupRows } from '../components/paper-table/GroupMenu.js'

const columns: PaperColumns = {
  hidden: [],
  custom: [
    { key: 'note', label: '备注', type: 'text', options: [] },
    { key: 'du-fa', label: '读法', type: 'select', options: ['精读'] },
    { key: 'tags', label: '标签', type: 'multi', options: [] },
  ],
  groups: ['topics'],
}
const groupNames = { none: '无', topics: '主题', projects: '项目', readState: '状态' }

describe('groupRows', () => {
  it('先内置可分组字段,再选择与多选列;文本列不在里面', () => {
    expect(groupRows(columns, groupNames)).toEqual([
      { key: 'topics', label: '主题' },
      { key: 'projects', label: '项目' },
      { key: 'readState', label: '状态' },
      { key: 'du-fa', label: '读法' },
      { key: 'tags', label: '标签' },
    ])
  })
})
