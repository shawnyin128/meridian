import { describe, expect, it } from 'vitest'
import type { PaperColumn, PaperColumns, PaperRow } from '../../shared/contract.js'
import {
  cellValues, checkColumns, checkCustom, checkGroupKey, columnCells, emptyColumns, patchedCustom,
  liveColumns, renamedCell, renamedOptions, restoredColumn, retypedColumn,
} from './columns.js'

/** Paper row with only `custom` populated; this test group ignores all other fields. */
const row = (custom: PaperRow['custom']): PaperRow => ({
  id: 'p1', title: 't', venue: '', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '未读', projects: [],
  pageCount: 1, noteCount: 0, conclusionCount: 0,
  updated: '2026-09-11', custom,
})

/** Configuration with one select column, "reading", and one multiselect column, "tags". */
const columns = (over: Partial<PaperColumns> = {}): PaperColumns => ({
  ...emptyColumns(),
  custom: [
    { key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读'] },
    { key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] },
  ],
  ...over,
})

/** Same as row, but with a test-supplied id so type changes can inspect each paper by id. */
const paper = (id: string, custom: PaperRow['custom']): PaperRow => ({ ...row(custom), id })

/** Configuration containing exactly one custom column. */
const only = (column: PaperColumn, groups: string[] = ['topics']): PaperColumns =>
  ({ hidden: [], custom: [column], groups })

const NOTE: PaperColumn = { key: 'note', label: '备注', type: 'text', options: [] }
const DU_FA: PaperColumn = { key: 'du-fa', label: '读法', type: 'select', options: ['精读', '略读', '泛读'] }
const TAGS: PaperColumn = { key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] }

describe('paper columns', () => {
  it('列配置里表上已经没有的内置列、分不了组的分组、找不到的列顺序都去掉,其余照旧', () => {
    expect(liveColumns({
      hidden: ['methods', 'venue'],
      custom: [NOTE, DU_FA],
      groups: ['metrics', 'readState', 'note', 'du-fa'],
      order: ['pages', 'note', 'y'],
    })).toEqual({
      hidden: ['venue'],
      custom: [NOTE, DU_FA],
      groups: ['readState', 'du-fa'],
      order: ['note', 'y'],
    })
    expect(liveColumns(emptyColumns()))
      .toEqual({ hidden: [], custom: [], groups: ['topics', 'projects', 'readState'] })
  })

  it('藏掉内置列、加上 key 与列名都不重样的自定义列,收下', () => {
    expect(() => checkColumns(emptyColumns(), [])).not.toThrow()
    expect(() => checkColumns({
      ...emptyColumns(),
      hidden: ['topics', 'venue'],
      custom: [
        { key: 'note', label: '备注', type: 'text', options: [] },
        { key: 'due-1', label: '截止', type: 'select', options: ['本周'] },
      ],
    }, [])).not.toThrow()
  })

  it('发表是内置列:藏得掉,自定义列的 key 不能叫 venue', () => {
    expect(() => checkColumns({ ...emptyColumns(), hidden: ['venue'] }, [])).not.toThrow()
    expect(() => checkColumns({
      ...emptyColumns(), custom: [{ key: 'venue', label: 'x', type: 'text', options: [] }],
    }, [])).toThrow('列的 key 与内置列重名:venue')
  })

  it('文本列的格子不拿选项对,填着什么都收下', () => {
    expect(() => checkColumns({
      ...emptyColumns(), custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
    }, [row({ note: '读到一半' })])).not.toThrow()
  })

  it('藏得掉的只有内置列,固定列藏不掉', () => {
    expect(() => checkColumns({ ...emptyColumns(), hidden: ['nope'] }, [])).toThrow(/内置列/)
    expect(() => checkColumns({ ...emptyColumns(), hidden: ['y'] }, [])).toThrow(/固定列/)
  })

  it('自定义列的 key 只收字母、数字、下划线与连字符,而且彼此不重样', () => {
    for (const key of ['', 'a b', '备注', 'a.b']) {
      expect(() => checkColumns({
        ...emptyColumns(), custom: [{ key, label: 'x', type: 'text', options: [] }],
      }, [])).toThrow(/key/)
    }
    expect(() => checkColumns({
      ...emptyColumns(),
      custom: [
        { key: 'note', label: 'a', type: 'text', options: [] },
        { key: 'note', label: 'b', type: 'text', options: [] },
      ],
    }, [])).toThrow(/key 重复/)
  })

  it('自定义列的 key 不能以 - 开头,也不能和内置列、标题列或可分组字段重名', () => {
    for (const key of ['-x', 'topics', 't', 'readState']) {
      expect(() => checkColumns({
        ...emptyColumns(), custom: [{ key, label: 'x', type: 'text', options: [] }],
      }, [])).toThrow(/key/)
    }
  })

  it('自定义列的 key 不能是分组栏的哨兵 none,也不能是 Object.prototype 的属性名', () => {
    for (const key of ['none', 'constructor', 'toString']) {
      expect(() => checkColumns({
        ...emptyColumns(), custom: [{ key, label: 'x', type: 'text', options: [] }],
      }, [])).toThrow(`列的 key 是保留字:${key}`)
    }
    expect(() => checkColumns({
      ...emptyColumns(), custom: [{ key: 'tostring', label: 'x', type: 'text', options: [] }],
    }, [])).not.toThrow()
  })

  it('列名不能为空,也不能与别的列同名', () => {
    expect(() => checkColumns({
      ...emptyColumns(), custom: [{ key: 'note', label: '  ', type: 'text', options: [] }],
    }, [])).toThrow(/列名不能为空/)
    expect(() => checkColumns({
      ...emptyColumns(),
      custom: [
        { key: 'a', label: '备注', type: 'text', options: [] },
        { key: 'b', label: '备注', type: 'text', options: [] },
      ],
    }, [])).toThrow(/列名重复/)
  })

  it('文本列不许带选项,选项不许为空、同一列里不许重样', () => {
    expect(() => checkColumns({
      ...emptyColumns(), custom: [{ key: 'a', label: '备注', type: 'text', options: ['x'] }],
    }, [])).toThrow(/文本列没有选项/)
    expect(() => checkColumns({
      ...emptyColumns(), custom: [{ key: 'a', label: '读法', type: 'select', options: [' '] }],
    }, [])).toThrow(/选项不能为空/)
    expect(() => checkColumns({
      ...emptyColumns(), custom: [{ key: 'a', label: '读法', type: 'select', options: ['x', 'x'] }],
    }, [])).toThrow(/选项重复/)
  })

  it('还有论文填着的选项删不掉,错误里说得出是哪一列的哪个选项', () => {
    const held = [row({ 'du-fa': '精读' }), row({ tags: ['综述'] })]
    expect(() => checkColumns(columns(), held)).not.toThrow()
    expect(() => checkColumns(columns({
      custom: [
        { key: 'du-fa', label: '读法', type: 'select', options: ['略读'] },
        { key: 'tags', label: '标签', type: 'multi', options: ['综述', '必读'] },
      ],
    }), held)).toThrow(/列「读法」的选项「精读」还有论文在用/)
  })

  it('格子的形状与列的类型对不上时改不了类型', () => {
    expect(() => checkColumns(columns({
      custom: [{ key: 'tags', label: '标签', type: 'select', options: ['综述'] }],
    }), [row({ tags: ['综述'] })])).toThrow('列「标签」不是多选列,有论文填着多个值')
    expect(() => checkColumns(columns({
      custom: [{ key: 'du-fa', label: '读法', type: 'multi', options: ['精读'] }],
    }), [row({ 'du-fa': '精读' })])).toThrow('列「读法」是多选列,有论文填着一段文本')
  })

  it('分组只收内置可分组字段与选择 / 多选列,而且不许重样', () => {
    expect(() => checkColumns(columns({ groups: ['topics', 'du-fa', 'tags'] }), [])).not.toThrow()
    expect(() => checkColumns(columns({ groups: ['topics', 'topics'] }), [])).toThrow(/分组重复/)
    expect(() => checkColumns(columns({ groups: ['y'] }), [])).toThrow(/不能按这一列分组/)
    expect(() => checkColumns({
      ...emptyColumns(),
      custom: [{ key: 'note', label: '备注', type: 'text', options: [] }],
      groups: ['note'],
    }, [])).toThrow(/不能按这一列分组/)
    expect(() => checkGroupKey('readState', emptyColumns())).not.toThrow()
    expect(() => checkGroupKey('nope', emptyColumns())).toThrow(/不能按这一列分组/)
  })

  it('删掉的列还留在分组里时,整份配置被拒', () => {
    expect(() => checkColumns(columns({ groups: ['du-fa'] }), [])).not.toThrow()
    expect(() => checkColumns(columns({ custom: [], groups: ['du-fa'] }), []))
      .toThrow('不能按这一列分组:du-fa')
  })

  it('写格子时,列要在、值的形状要对、选项要是这一列有的', () => {
    expect(() => checkCustom(columns(), { 'du-fa': '精读', tags: ['综述'] }, {})).not.toThrow()
    expect(() => checkCustom(columns(), { nope: 'x' }, {})).toThrow(/论文表里没有这一列/)
    expect(() => checkCustom(columns(), { 'du-fa': ['精读'] }, {}))
      .toThrow('列「读法」不是多选列,格子只要一个值')
    expect(() => checkCustom(columns(), { tags: '综述' }, {}))
      .toThrow('列「标签」是多选列,格子要一列取值')
    expect(() => checkCustom(columns(), { 'du-fa': '通读' }, {})).toThrow(/没有这个选项:通读/)
    expect(() => checkCustom(columns(), { tags: ['综述', '综述'] }, {})).toThrow(/重复的选项/)
  })

  it('只校验这次改了的格:没动的格原样放过,列已删、选项已没了也放过', () => {
    const orphan = { nope: 'x' }
    expect(() => checkCustom(columns(), orphan, orphan)).not.toThrow()
    expect(() => checkCustom(columns(), { nope: 'y' }, orphan)).toThrow(/论文表里没有这一列/)

    const stale = { 'du-fa': '通读' }
    expect(() => checkCustom(columns(), stale, stale)).not.toThrow()
    expect(() => checkCustom(columns(), { 'du-fa': '泛读' }, stale)).toThrow(/没有这个选项:泛读/)

    // Multiselect cells arrive as new arrays, so compare elements to detect an unchanged value.
    expect(() => checkCustom(columns(), { tags: ['综述', '旧的'] }, { tags: ['综述', '旧的'] }))
      .not.toThrow()

    expect(() => checkCustom(columns(), { ...orphan, 'du-fa': '精读' }, orphan)).not.toThrow()
  })

  it('写格子的补丁里 null 是清空:不看这一列在不在、选项在不在', () => {
    expect(() => checkCustom(columns(), { nope: null, 'du-fa': null }, { 'du-fa': '通读' })).not.toThrow()
  })

  it('补丁按格合进映射:null 去掉那一格,给了值的换掉,没提到的原样留着', () => {
    const held = { note: '读到一半', 'du-fa': '精读', tags: ['综述'] }
    expect(patchedCustom(held, { 'du-fa': null, tags: ['综述', '必读'] }))
      .toEqual({ note: '读到一半', tags: ['综述', '必读'] })
    expect(held).toEqual({ note: '读到一半', 'du-fa': '精读', tags: ['综述'] })
  })

  it('取格子的值:没填的没有值,多选的每个值各算一个', () => {
    expect(cellValues(row({}), 'du-fa')).toEqual([])
    expect(cellValues(row({ 'du-fa': '精读' }), 'du-fa')).toEqual(['精读'])
    expect(cellValues(row({ tags: ['综述', '必读'] }), 'tags')).toEqual(['综述', '必读'])
  })

  it('取 constructor 这类 Object.prototype 属性名当作没填,不管这份映射有没有原型', () => {
    expect(cellValues(row(Object.create(null)), 'constructor')).toEqual([])
    expect(cellValues(row({}), 'constructor')).toEqual([])
  })

  it('选项改名:算出新的 options 与每一行的新格子,坏入参都拒', () => {
    expect(renamedOptions(columns(), 'du-fa', '精读', '细读')).toEqual(['细读', '略读'])
    expect(() => renamedOptions(columns(), 'nope', 'a', 'b')).toThrow(/不是选择列/)
    expect(() => renamedOptions(columns(), 'du-fa', '通读', 'b')).toThrow(/没有这个选项/)
    expect(() => renamedOptions(columns(), 'du-fa', '精读', ' ')).toThrow(/选项不能为空/)
    expect(() => renamedOptions(columns(), 'du-fa', '精读', '略读')).toThrow(/已经有这个选项/)
    expect(renamedCell(row({ 'du-fa': '精读' }), 'du-fa', '精读', '细读')).toBe('细读')
    expect(renamedCell(row({ tags: ['综述', '必读'] }), 'tags', '综述', '概览'))
      .toEqual(['概览', '必读'])
    expect(renamedCell(row({ 'du-fa': '略读' }), 'du-fa', '精读', '细读')).toBeUndefined()
    expect(renamedCell(row({}), 'du-fa', '精读', '细读')).toBeUndefined()
  })
})

describe('改类型', () => {
  it('文本 → 选择:全库不同的值按论文的次序收成选项,格子不动', () => {
    const papers = [paper('a', { note: '精读' }), paper('b', {}), paper('c', { note: '略读' }), paper('d', { note: '精读' })]
    const { columns: next, cells } = retypedColumn(only(NOTE), papers, 'note', 'select')
    expect(next.custom).toEqual([{ ...NOTE, type: 'select', options: ['精读', '略读'] }])
    expect([...cells]).toEqual([])
  })

  it('文本 → 多选:选项同上,每格包成一项', () => {
    const papers = [paper('a', { note: '精读' }), paper('b', {}), paper('c', { note: '略读' }), paper('d', { note: '精读' })]
    const { columns: next, cells } = retypedColumn(only(NOTE), papers, 'note', 'multi')
    expect(next.custom).toEqual([{ ...NOTE, type: 'multi', options: ['精读', '略读'] }])
    expect([...cells]).toEqual([['a', ['精读']], ['c', ['略读']], ['d', ['精读']]])
  })

  it('文本 → 选择 / 多选:空串与只有空白的格子不收成选项,那几格清空', () => {
    const papers = [paper('a', { note: '' }), paper('b', { note: '略读' }), paper('c', { note: '  ' })]
    const select = retypedColumn(only(NOTE), papers, 'note', 'select')
    expect(select.columns.custom).toEqual([{ ...NOTE, type: 'select', options: ['略读'] }])
    expect([...select.cells]).toEqual([['a', undefined], ['c', undefined]])
    const multi = retypedColumn(only(NOTE), papers, 'note', 'multi')
    expect(multi.columns.custom).toEqual([{ ...NOTE, type: 'multi', options: ['略读'] }])
    expect([...multi.cells]).toEqual([['a', undefined], ['b', ['略读']], ['c', undefined]])
  })

  it('选择 → 多选:选项不动(没人用的也留着),每格包成一项', () => {
    const { columns: next, cells } = retypedColumn(
      only(DU_FA, ['topics', 'du-fa']), [paper('a', { 'du-fa': '精读' }), paper('b', {})], 'du-fa', 'multi')
    expect(next).toEqual(only({ ...DU_FA, type: 'multi' }, ['topics', 'du-fa']))
    expect([...cells]).toEqual([['a', ['精读']]])
  })

  it('选择 → 文本:清空选项,格子里的字留着,分组里摘掉这一列', () => {
    const { columns: next, cells } = retypedColumn(
      only(DU_FA, ['topics', 'du-fa', 'readState']), [paper('a', { 'du-fa': '精读' })], 'du-fa', 'text')
    expect(next).toEqual(only({ ...DU_FA, type: 'text', options: [] }, ['topics', 'readState']))
    expect([...cells]).toEqual([])
  })

  it('多选 → 选择:一个值的直接转,空列表的格子空着,选项不动', () => {
    const papers = [paper('a', { tags: ['综述'] }), paper('b', { tags: [] }), paper('c', { tags: ['必读'] })]
    const { columns: next, cells } = retypedColumn(only(TAGS, ['topics', 'tags']), papers, 'tags', 'select')
    expect(next).toEqual(only({ ...TAGS, type: 'select' }, ['topics', 'tags']))
    expect([...cells]).toEqual([['a', '综述'], ['b', undefined], ['c', '必读']])
  })

  it('多选 → 选择:有格子填着多个值时整次拒绝,说清几篇', () => {
    const papers = [
      paper('a', { tags: ['综述', '必读'] }), paper('b', { tags: ['综述', '必读'] }), paper('c', { tags: ['综述'] }),
    ]
    expect(() => retypedColumn(only(TAGS), papers, 'tags', 'select'))
      .toThrow('列「标签」有 2 篇论文填着多个值,改不成单选列')
  })

  it('多选 → 文本:多个值用「, 」连成一段,空列表的格子空着,清空选项,分组里摘掉这一列', () => {
    const papers = [paper('a', { tags: ['综述', '必读'] }), paper('b', { tags: [] }), paper('c', { tags: ['必读'] })]
    const { columns: next, cells } = retypedColumn(only(TAGS, ['topics', 'tags']), papers, 'tags', 'text')
    expect(next).toEqual(only({ ...TAGS, type: 'text', options: [] }, ['topics']))
    expect([...cells]).toEqual([['a', '综述, 必读'], ['b', undefined], ['c', '必读']])
  })

  it('没人填过的列三档之间怎么换都不拒,也没有格子要动', () => {
    const cases: [PaperColumn, PaperColumn['type']][] = [
      [NOTE, 'select'], [NOTE, 'multi'], [DU_FA, 'multi'], [DU_FA, 'text'], [TAGS, 'select'], [TAGS, 'text'],
    ]
    for (const [column, type] of cases) {
      expect([...retypedColumn(only(column), [paper('a', {})], column.key, type).cells]).toEqual([])
    }
  })

  it('没有这一列、或已经是这一档,拒', () => {
    expect(() => retypedColumn(only(NOTE), [], 'nope', 'select')).toThrow('论文表里没有这一列:nope')
    expect(() => retypedColumn(only(NOTE), [], 'note', 'text')).toThrow('列「备注」已经是文本列')
  })

  it('取一列的格子:按论文 id,没填的不在里面', () => {
    expect(columnCells([paper('a', { tags: ['综述'] }), paper('b', {})], 'tags')).toEqual({ a: ['综述'] })
  })

  it('写回一列:换回那一列,只动与记下的格子不同的那几篇,分组放回原位置', () => {
    const now = only({ ...TAGS, type: 'text', options: [] }, ['topics', 'readState'])
    const papers = [
      paper('a', { tags: '综述, 必读' }), paper('b', {}), paper('c', { tags: '必读' }), paper('d', { tags: ['必读'] }),
    ]
    const { columns: back, cells } = restoredColumn(
      now, papers, TAGS, 1, { a: ['综述', '必读'], b: [], c: ['必读'], d: ['必读'] })
    expect(back).toEqual(only(TAGS, ['topics', 'tags', 'readState']))
    expect([...cells]).toEqual([['a', ['综述', '必读']], ['b', []], ['c', ['必读']]])
    expect(restoredColumn(now, [], TAGS, null, {}).columns.groups).toEqual(['topics', 'readState'])
    expect(restoredColumn(only(TAGS, ['topics', 'tags']), [], TAGS, 0, {}).columns.groups).toEqual(['topics', 'tags'])
    expect(() => restoredColumn(only(NOTE), [], TAGS, null, {})).toThrow('论文表里没有这一列:tags')
  })

  it('写回一列到文本:即使分组里此刻还留着它,也把它摘掉——文本列不能分组', () => {
    const grouped = only({ ...NOTE, type: 'select' }, ['topics', 'note'])
    expect(restoredColumn(grouped, [], NOTE, null, {}).columns.groups).toEqual(['topics'])
  })
})
