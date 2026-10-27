// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { Table, TableCell, TableDraftHead, TableRow, type TableColumn } from './Table.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const render = (node: React.ReactNode) => act(() => root.render(<MessagesProvider>{node}</MessagesProvider>))
const cellsOf = (row: Element) => [...row.children].map((cell) => cell.className || cell.tagName.toLowerCase())

describe('Table', () => {
  it('每一列的表头都有调宽把手；只有给了排序的列有排序按钮，排着的那一列报出方向，按表头就排序', () => {
    const sort = vi.fn()
    const columns: TableColumn[] = [
      { key: 'title', label: '标题', width: 300, sort: { direction: undefined, onSort: sort } },
      { key: 'year', label: '年份', width: 100, sort: { direction: 'desc', onSort: () => {} } },
      { key: 'venue', label: '发表', width: 120 },
    ]
    render(<Table columns={columns}><TableRow><TableCell kind="title">EAGLE</TableCell><TableCell>2024</TableCell><TableCell>arXiv</TableCell></TableRow></Table>)
    const heads = [...host.querySelectorAll('thead th')]
    expect(heads.map((th) => [th.querySelector('.table-sort') !== null, th.getAttribute('aria-sort'), th.querySelector('[role="separator"]')?.getAttribute('aria-label')]))
      .toEqual([[true, null, '「标题」列宽'], [true, 'descending', '「年份」列宽'], [false, null, '「发表」列宽']])
    act(() => (heads[0] as HTMLElement).click())
    expect(sort).toHaveBeenCalledTimes(1)
  })

  it('有操作列时表头末格放表头的操作，每一行把自己的操作放进行尾的操作槽；建列草稿开着时每一行在它下面留一格', () => {
    const columns: TableColumn[] = [{ key: 'paper', label: '论文', width: 240 }, { key: 'bits', label: '比特', width: 180 }]
    render(
      <Table columns={columns} actions={<button type="button">新建列</button>} draft={<TableDraftHead className="th-new">名字</TableDraftHead>}>
        <TableRow actions={<button type="button">移出</button>}><TableCell kind="title">EAGLE</TableCell><TableCell>4</TableCell></TableRow>
        <TableRow><TableCell kind="title">KIVI</TableCell><TableCell kind="meta">—</TableCell></TableRow>
      </Table>,
    )
    expect(cellsOf(host.querySelector('thead tr')!)).toEqual(['th', 'th', 'table-draft th-new', 'table-actions'])
    expect([...host.querySelectorAll('tbody tr')].map(cellsOf)).toEqual([
      ['table-cell--title', 'td', 'td', 'table-actions'],
      ['table-cell--title', 'table-cell--meta', 'td', 'table-actions'],
    ])
    expect(host.querySelector('thead .table-actions .row-actions')!.textContent).toBe('新建列')
    expect([...host.querySelectorAll('tbody .table-actions')].map((cell) => cell.querySelector('.row-actions')?.textContent ?? null))
      .toEqual(['移出', null])
    expect([...host.querySelectorAll('tbody tr')].every((row) => row.hasAttribute('data-row-actions'))).toBe(true)
  })

  it('没有操作列的表，行里也不留操作格', () => {
    render(<Table columns={[{ key: 'project', label: '', name: '项目', width: 240 }]}><TableRow><TableCell kind="title">推测解码</TableCell></TableRow></Table>)
    expect(cellsOf(host.querySelector('tbody tr')!)).toEqual(['table-cell--title'])
  })

  it('一行有点开的去处时整行是指针的入口，选中的行有选中的样子', () => {
    render(
      <Table columns={[{ key: 'title', label: '标题', width: 300 }]}>
        <TableRow onClick={() => {}} selected><TableCell kind="title">EAGLE</TableCell></TableRow>
        <TableRow><TableCell kind="title">KIVI</TableCell></TableRow>
      </Table>,
    )
    expect([...host.querySelectorAll('tbody tr')].map((row) => row.className))
      .toEqual(['table-row table-row--opens table-row--selected', 'table-row'])
  })

  it('放不下的文字标成被切掉，放得下的不标；放不下的标签收进 +N，点开后收起', () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function (this: HTMLElement) { return this.textContent!.length > 4 ? 200 : 40 })
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 100)
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) { return DOMRect.fromRect({ x: 0, width: this.textContent === '推理' ? 40 : 80 }) })
    try {
      render(
        <Table columns={[{ key: 'title', label: '标题', width: 300 }, { key: 'year', label: '年份', width: 100 }, { key: 'topics', label: '主题', width: 100 }]}>
          <TableRow>
            <TableCell kind="title">Speculative Decoding</TableCell>
            <TableCell>2024</TableCell>
            <TableCell content="chips"><span className="tag">推理</span><span className="tag">量化</span><span className="tag">缓存</span></TableCell>
          </TableRow>
        </Table>,
      )
      expect([...host.querySelectorAll('.table-text')].map((text) => text.classList.contains('table-cut'))).toEqual([true, false])
      const more = host.querySelector<HTMLButtonElement>('.table-chips .morebadge')!
      expect([more.textContent, more.getAttribute('aria-label')]).toEqual(['+2', '展开其余 2 项'])
      act(() => more.click())
      expect([more.textContent, more.parentElement!.classList.contains('is-open')]).toEqual(['−', true])
    } finally {
      scrollWidth.mockRestore()
      clientWidth.mockRestore()
      rect.mockRestore()
    }
  })
})

describe('Table variants', () => {
  const rows = (count: number) => Array.from({ length: count }, (_, at) => (
    <TableRow key={at}><TableCell kind="title">{`第 ${at + 1} 行`}</TableCell></TableRow>
  ))
  const render = (node: React.ReactNode) => act(() => root.render(<MessagesProvider>{node}</MessagesProvider>))
  const scroll = () => host.querySelector<HTMLElement>('.table-scroll')!

  it('a capped table scrolls past five rows by default, and past its own limit when it names one', () => {
    render(<Table rows="capped" columns={[{ key: 'name', label: '名称', width: 200 }]}>{rows(6)}</Table>)
    expect(scroll().style.maxHeight).not.toBe('')
    render(<Table rows="capped" limit={8} columns={[{ key: 'name', label: '名称', width: 200 }]}>{rows(6)}</Table>)
    expect(scroll().style.maxHeight).toBe('')
  })

  it('a wrapping table lets its cells wrap instead of fading them', () => {
    render(<Table wrap rows="capped" columns={[{ key: 'name', label: '名称', width: 200 }]}>{rows(1)}</Table>)
    expect(host.querySelector('table')!.classList.contains('table--wrap')).toBe(true)
    render(<Table rows="capped" columns={[{ key: 'name', label: '名称', width: 200 }]}>{rows(1)}</Table>)
    expect(host.querySelector('table')!.classList.contains('table--wrap')).toBe(false)
  })
})
