// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { optionRows } from '../components/paper-table/CellPicker.js'

describe('optionRows', () => {
  it('没打字时列出全部选项,不多新建那一行', () => {
    expect(optionRows(['精读', '略读'], '')).toEqual({ hits: ['精读', '略读'], isNew: false })
  })

  it('打的字按小写子串筛,大小写不计', () => {
    expect(optionRows(['Survey', 'must-read'], 'sur').hits).toEqual(['Survey'])
    expect(optionRows(['Survey', 'must-read'], 'READ').hits).toEqual(['must-read'])
  })

  it('与某个选项全等就不给新建那一行,只是它的子串才给', () => {
    expect(optionRows(['精读', '精读笔记'], '精读'))
      .toEqual({ hits: ['精读', '精读笔记'], isNew: false })
    expect(optionRows(['精读笔记'], '精读')).toEqual({ hits: ['精读笔记'], isNew: true })
  })

  it('只差大小写算同一个选项,不给新建那一行', () => {
    expect(optionRows(['Survey'], 'survey')).toEqual({ hits: ['Survey'], isNew: false })
    expect(optionRows(['Survey'], 'SURVEY')).toEqual({ hits: ['Survey'], isNew: false })
  })

  it('一个选项都没有时:打了字只剩新建那一行,没打字就一行都没有', () => {
    expect(optionRows([], '精读')).toEqual({ hits: [], isNew: true })
    expect(optionRows([], '')).toEqual({ hits: [], isNew: false })
  })
})
