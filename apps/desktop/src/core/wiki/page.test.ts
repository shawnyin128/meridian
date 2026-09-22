import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { removeKey } from '../vault/page-lines.js'
import { readWikiPage } from './read.js'
import {
  appendEntry, createAggregationPage, fillGenerated, removeMembership, setBody, setColumns,
  setAggregationMetadata, setMembership, setParents, setUpdated,
} from './page.js'

const EXAMPLE = resolve(import.meta.dirname, '../fixtures/wiki-example-vault')

describe('wiki page writes', () => {
  let dir: string
  let staging: string
  const page = (name: string) => join(dir, name)
  const lines = (name: string) => readFileSync(page(name), 'utf8').split('\n')

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meridian-wp-'))
    staging = join(dir, '.staging')
    cpSync(join(EXAMPLE, 'papers'), join(dir, 'papers'), { recursive: true })
    cpSync(join(EXAMPLE, 'topics'), join(dir, 'topics'), { recursive: true })
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('换一条归属只换掉那一条的行,别的归属与页上其余字节不动', () => {
    const file = page('papers/2404.00456.md')
    const before = lines('papers/2404.00456.md')
    setMembership(file, { in: 'topics/kv-cache-quantization', cells: { kv_bits: { value: '3', at: { page: 2, quote: 'three bits' } } } }, staging)
    const after = lines('papers/2404.00456.md')
    const from = before.findIndex((row) => row.includes('- in: topics/kv-cache-quantization'))
    const to = before.findIndex((row, i) => i > from && row.startsWith('  - in:'))
    expect(after.slice(0, from)).toEqual(before.slice(0, from))
    expect(after.slice(from, from + 6)).toEqual([
      '  - in: "topics/kv-cache-quantization"',
      '    cells:',
      '      kv_bits:',
      '        value: "3"',
      '        at:',
      '          page: 2',
    ])
    expect(after[from + 6]).toBe('          quote: "three bits"')
    expect(after.slice(from + 7)).toEqual(before.slice(to))
  })

  it('加一条没有过的归属追在 memberships 末尾;页上没有 memberships 就在 frontmatter 末尾开一块', () => {
    const file = page('papers/2210.17323.md')
    const before = lines('papers/2210.17323.md')
    setMembership(file, { in: 'topics/qat', cells: {} }, staging)
    const after = lines('papers/2210.17323.md')
    const close = before.indexOf('---', 1)
    expect(after.slice(0, close)).toEqual(before.slice(0, close))
    expect(after.slice(close, close + 2)).toEqual(['  - in: "topics/qat"', '    cells: []'])
    expect(after.slice(close + 2)).toEqual(before.slice(close))

    const fresh = page('papers/fresh.md')
    writeFileSync(fresh, '---\ntitle: "Fresh"\nupdated: 2026-09-01\n---\n# Fresh\n', 'utf8')
    setMembership(fresh, { in: 'topics/qat', cells: {} }, staging)
    expect(readFileSync(fresh, 'utf8')).toBe(
      '---\ntitle: "Fresh"\nupdated: 2026-09-01\nmemberships:\n  - in: "topics/qat"\n    cells: []\n---\n# Fresh\n')
  })

  it('memberships 写成一行的流式列表,改不动就拒绝,页一个字节不动', () => {
    const file = page('papers/flow.md')
    const text = '---\ntitle: "Flow"\nmemberships: [{in: "topics/qat", cells: []}]\n---\n# Flow\n'
    writeFileSync(file, text, 'utf8')
    expect(() => setMembership(file, { in: 'topics/qat', cells: {} }, staging)).toThrow(/写法/)
    expect(readFileSync(file, 'utf8')).toBe(text)
  })

  it('归属的 in 写成单引号也认得出是同一条:换掉那一条,不再追一条', () => {
    const file = page('papers/quoted.md')
    writeFileSync(file, [
      '---', 'title: "Quoted"', 'memberships:', "  - in: 'topics/qat'", '    cells: []', '---', '# Quoted', '',
    ].join('\n'), 'utf8')
    setMembership(file, { in: 'topics/qat', cells: { bits: { value: 'W4', at: { page: 1, quote: '4-bit' } } } }, staging)
    expect(lines('papers/quoted.md').filter((row) => row.includes('- in:')))
      .toEqual(['  - in: "topics/qat"'])
  })

  it('去掉一条归属;去掉最后一条时 memberships 写成空列表', () => {
    const file = page('papers/2404.00456.md')
    const before = lines('papers/2404.00456.md')
    removeMembership(file, 'topics/kv-cache-quantization', staging)
    const after = lines('papers/2404.00456.md')
    expect(after).toHaveLength(before.length - 4)
    expect(after.some((row) => row.includes('kv-cache-quantization'))).toBe(false)
    const single = page('papers/2305.17888.md')
    removeMembership(single, 'topics/qat', staging)
    removeMembership(single, 'methods/distillation-qat', staging)
    expect(lines('papers/2305.17888.md')).toContain('memberships: []')
    expect(() => removeMembership(single, 'topics/qat', staging)).toThrow(/topics\/qat/)
  })

  it('追一条到追加区末尾;空的追加区追在标题下一行', () => {
    const file = page('topics/ptq-weight-only.md')
    const before = lines('topics/ptq-weight-only.md')
    appendEntry(file, '结论', '- 2026-09-10 · 新的一条', staging)
    appendEntry(file, '实验', '- 2026-09-10 · 第一条实验', staging)
    const after = lines('topics/ptq-weight-only.md')
    const conclusions = before.indexOf('## 结论')
    const experiments = before.indexOf('## 实验')
    expect(after.slice(0, experiments + 1)).toEqual([
      ...before.slice(0, experiments - 1), '- 2026-09-10 · 新的一条', '',
    ])
    expect(after[experiments + 1]).toBe('## 实验')
    expect(after[experiments + 2]).toBe('- 2026-09-10 · 第一条实验')
    expect(after.slice(experiments + 3)).toEqual(before.slice(experiments + 1))
    expect(conclusions).toBeGreaterThan(0)
  })

  it('换列只换 columns 那一块;updated 只换那一行', () => {
    const file = page('topics/ptq-weight-only.md')
    const before = lines('topics/ptq-weight-only.md')
    setColumns(file, [{ key: 'bits', label: '位宽' }], staging)
    setUpdated(file, '2026-09-10', staging)
    const after = lines('topics/ptq-weight-only.md')
    const from = before.indexOf('columns:')
    const to = before.indexOf('split_on: null')
    expect(after.slice(from, from + 3)).toEqual(['columns:', '  - key: "bits"', '    label: "位宽"'])
    expect(after[from + 3]).toBe('split_on: null')
    expect(after.slice(0, from)).toEqual(before.slice(0, from))
    expect(after.find((row) => row.startsWith('updated:'))).toBe('updated: "2026-09-10"')
    expect(after.length).toBe(before.length - (to - from) + 3)
  })

  it('换父页:页上一行的流式列表换成块状写法,别的字节不动;空列表写成 []', () => {
    const file = page('topics/ptq.md')
    const before = lines('topics/ptq.md')
    const at = before.findIndex((l) => l.startsWith('parents:'))
    expect(before[at]).toBe('parents: [topics/quantization]')
    setParents(file, ['topics/quantization', 'topics/long-context-inference'], staging)
    const after = lines('topics/ptq.md')
    expect(after.slice(at, at + 3)).toEqual(['parents:', '  - "topics/quantization"', '  - "topics/long-context-inference"'])
    expect(after.slice(0, at)).toEqual(before.slice(0, at))
    expect(after.slice(at + 3)).toEqual(before.slice(at + 1))
    setParents(file, [], staging)
    expect(lines('topics/ptq.md')[at]).toBe('parents: []')
    expect((readWikiPage(file, 'topic') as { fm: { parents: string[] } }).fm.parents).toEqual([])
  })

  it('修改聚合元数据只换 title 与 split_on,也能清空细分依据', () => {
    const file = page('topics/ptq-weight-only.md')
    setAggregationMetadata(file, { title: 'Weight-only PTQ', splitOn: '位宽' }, staging)
    let front = readWikiPage(file, 'topic').fm
    expect(front).toMatchObject({ title: 'Weight-only PTQ', split_on: '位宽' })
    setAggregationMetadata(file, { title: 'Weight-only PTQ', splitOn: null }, staging)
    front = readWikiPage(file, 'topic').fm
    expect(front.title).toBe('Weight-only PTQ')
    expect(front).not.toHaveProperty('split_on')
  })

  it('父页写成顶格的序列项:整块换成缩进的块状写法,旧项不留,别的字节不动', () => {
    const file = page('topics/ptq.md')
    const before = lines('topics/ptq.md')
    const at = before.findIndex((l) => l.startsWith('parents:'))
    writeFileSync(file, [...before.slice(0, at), 'parents:', '- topics/a', ...before.slice(at + 1)].join('\n'), 'utf8')
    setParents(file, ['topics/b'], staging)
    const after = lines('topics/ptq.md')
    expect(after.slice(at, at + 2)).toEqual(['parents:', '  - "topics/b"'])
    expect(after.slice(0, at)).toEqual(before.slice(0, at))
    expect(after.slice(at + 2)).toEqual(before.slice(at + 1))
    expect((readWikiPage(file, 'topic') as { fm: { parents: string[] } }).fm.parents).toEqual(['topics/b'])
  })

  it('列写成顶格的序列项:整块换成缩进的块状写法,旧项不留', () => {
    const file = page('topics/ptq-weight-only.md')
    const before = lines('topics/ptq-weight-only.md')
    const at = before.indexOf('columns:')
    const to = before.indexOf('split_on: null')
    writeFileSync(file, [
      ...before.slice(0, at), 'columns:', '- key: bits', '  label: 位宽', ...before.slice(to),
    ].join('\n'), 'utf8')
    setColumns(file, [{ key: 'bits', label: '位宽' }, { key: 'act', label: '激活' }], staging)
    const after = lines('topics/ptq-weight-only.md')
    expect(after.slice(at, at + 5)).toEqual([
      'columns:', '  - key: "bits"', '    label: "位宽"', '  - key: "act"', '    label: "激活"',
    ])
    expect(after.slice(0, at)).toEqual(before.slice(0, at))
    expect(after.slice(at + 5)).toEqual(before.slice(to))
  })

  it('删掉顶格序列项写成的一块:键与各项都不留在页上', () => {
    const file = page('topics/ptq.md')
    const before = lines('topics/ptq.md')
    const at = before.findIndex((l) => l.startsWith('parents:'))
    writeFileSync(file, [
      ...before.slice(0, at), 'parents:', '- topics/a', '- topics/b', ...before.slice(at + 1),
    ].join('\n'), 'utf8')
    removeKey(file, 'parents', staging)
    expect(lines('topics/ptq.md')).toEqual([...before.slice(0, at), ...before.slice(at + 1)])
  })

  it('memberships 写成顶格的序列项,改不动就拒绝,页一个字节不动', () => {
    const file = page('papers/indentless.md')
    const text = [
      '---', 'title: "Indentless"', 'memberships:', '- in: "topics/qat"', '  cells: []', '---', '# Indentless', '',
    ].join('\n')
    writeFileSync(file, text, 'utf8')
    expect(() => setMembership(file, { in: 'topics/qat', cells: {} }, staging)).toThrow(/不是本模块能改的写法/)
    expect(readFileSync(file, 'utf8')).toBe(text)
  })

  it('回填生成区:只换标记之间的行', () => {
    const file = page('topics/ptq-weight-only.md')
    const before = lines('topics/ptq-weight-only.md')
    fillGenerated(file, { children: '- 子', table: '| 表 |' }, staging)
    const after = lines('topics/ptq-weight-only.md')
    const c = before.indexOf('<!-- generated:children -->')
    const t = before.indexOf('<!-- generated:table -->')
    expect(after[c + 1]).toBe('- 子')
    expect(after[c + 2]).toBe('<!-- /generated -->')
    expect(after[after.indexOf('<!-- generated:table -->') + 1]).toBe('| 表 |')
    expect(after.slice(0, c + 1)).toEqual(before.slice(0, c + 1))
    expect(t).toBeGreaterThan(c)
  })

  it('换正文:只换最后一个生成区之后的行,frontmatter 与生成区逐字节不动', () => {
    const file = page('topics/ptq.md')
    const before = lines('topics/ptq.md')
    const close = before.lastIndexOf('<!-- /generated -->')
    setBody(file, '## 问题\n新写的。\n\n## 结论\n- 2026-09-10 · 一条', staging)
    const after = lines('topics/ptq.md')
    expect(after.slice(0, close + 1)).toEqual(before.slice(0, close + 1))
    expect(after.slice(close + 1)).toEqual(['', '## 问题', '新写的。', '', '## 结论', '- 2026-09-10 · 一条', ''])
    expect(readWikiPage(file, 'topic').body).toBe('## 问题\n新写的。\n\n## 结论\n- 2026-09-10 · 一条')
  })

  it('没有生成区的页:frontmatter 收口之后全换;空正文只留收口', () => {
    const file = page('papers/2210.17323.md')
    const before = lines('papers/2210.17323.md')
    const close = before.indexOf('---', 1)
    setBody(file, '## 这篇说了什么\n改过。', staging)
    const after = lines('papers/2210.17323.md')
    expect(after.slice(0, close + 1)).toEqual(before.slice(0, close + 1))
    expect(after.slice(close + 1)).toEqual(['## 这篇说了什么', '改过。', ''])
    setBody(file, '', staging)
    expect(lines('papers/2210.17323.md').slice(close)).toEqual(['---', ''])
  })

  it('读出来再写回去,示例库每一页一个字节不变', () => {
    for (const [dir, kind] of [['papers', null], ['topics', 'topic']] as const) {
      for (const name of readdirSync(page(dir))) {
        const file = page(`${dir}/${name}`)
        const text = readFileSync(file, 'utf8')
        setBody(file, readWikiPage(file, kind).body, staging)
        expect(readFileSync(file, 'utf8'), file).toBe(text)
      }
    }
  })

  it('CRLF 的页写完每一行还是 CRLF', () => {
    const crlf = (name: string): void => {
      writeFileSync(page(name), readFileSync(page(name), 'utf8').replace(/\n/g, '\r\n'), 'utf8')
    }
    const allCr = (name: string): boolean =>
      readFileSync(page(name), 'utf8').split('\n').slice(0, -1).every((l) => l.endsWith('\r'))

    crlf('papers/2404.00456.md')
    setMembership(page('papers/2404.00456.md'), { in: 'topics/qat', cells: {} }, staging)
    expect(allCr('papers/2404.00456.md')).toBe(true)

    crlf('topics/ptq-weight-only.md')
    appendEntry(page('topics/ptq-weight-only.md'), '结论', '- 2026-09-10 · 新的一条', staging)
    expect(allCr('topics/ptq-weight-only.md')).toBe(true)

    crlf('topics/ptq.md')
    setParents(page('topics/ptq.md'), ['topics/quantization'], staging)
    expect(allCr('topics/ptq.md')).toBe(true)
    expect(lines('topics/ptq.md').map((l) => l.replace(/\r$/, ''))).toContain('  - "topics/quantization"')
    setBody(page('topics/ptq.md'), '## 问题\n换行是 CRLF', staging)
    expect(allCr('topics/ptq.md')).toBe(true)
  })

  it('新建聚合页:frontmatter 齐全,生成区在页首,描述节与追加区照 schema 的次序', () => {
    const file = page('topics/new.md')
    createAggregationPage(file, {
      kind: 'topic', title: 'New', parents: ['topics/ptq'], columns: [{ key: 'bits', label: '位宽' }],
      splitOn: undefined, updated: '2026-09-10',
    }, { section: '问题', text: '新的。' }, ['结论', '实验', '未解决'], staging)
    expect(readFileSync(file, 'utf8')).toBe([
      '---', 'kind: "topic"', 'title: "New"', 'aliases: []', 'parents:', '  - "topics/ptq"',
      'columns:', '  - key: "bits"', '    label: "位宽"', 'updated: "2026-09-10"', '---',
      '<!-- generated:children -->', '<!-- /generated -->',
      '<!-- generated:table -->', '<!-- /generated -->', '',
      '## 问题', '新的。', '',
      '## 结论', '', '## 实验', '', '## 未解决', '',
    ].join('\n'))
  })
})
