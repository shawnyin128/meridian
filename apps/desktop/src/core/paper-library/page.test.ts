import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writePaperFields } from './page.js'

/**
 * Paper page whose key order matches the 283 pages in the vault: `topics` follows `tags`, while page
 * state stays in the leading block. `my_own_key` and its comment are user additions and writes must
 * preserve them even though ordinary vault pages do not contain them.
 */
const PAGE = [
  '---',
  'type: "paper"',
  'title: "STAR"',
  'status: "draft"',
  'created: "2026-05-20"',
  'updated: "2026-05-20"',
  'source_id: "paper-pdf-a6b750e25a61"',
  'page_count: 17',
  'my_own_key: "留着"',
  'tags:',
  '  - "llm-wiki"',
  '  - "paper"',
  '# 主题是我一条条挑过的',
  'topics:',
  '  - "speculative decoding"',
  '  - "draft acceptance"',
  'methods: []',
  'claims:',
  '  - "claim-001"',
  '---',
  '',
  '# STAR',
  '',
].join('\n')

describe('paper page', () => {
  let dir: string
  let file: string
  /** Partial writes land here rather than beside the page. */
  let staging: string

  /** Current page lines with trailing CR preserved for byte-for-byte comparisons. */
  const rows = (): string[] => readFileSync(file, 'utf8').split('\n')

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meridian-paper-'))
    staging = join(dir, 'staging')
    file = join(dir, 'STAR.md')
    writeFileSync(file, PAGE, 'utf8')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('改主题只换掉 topics 那一块,页上别的行一个字节不动', () => {
    const before = rows()
    writePaperFields(file, { topics: ['kv cache'] }, staging)
    const after = rows()
    const at = before.indexOf('topics:')
    expect(after.slice(0, at)).toEqual(before.slice(0, at))
    expect(after.slice(at, at + 2)).toEqual(['topics:', '  - "kv cache"'])
    expect(after.slice(at + 2)).toEqual(before.slice(at + 3))
  })

  it('书目校正逐项写 frontmatter,清空可选项只删自己的行', () => {
    writePaperFields(file, {
      title: 'STAR Revised', shortTitle: 'STAR', authors: ['A. Author', 'B. Author'],
      year: 2026, venue: 'ICLR', rating: 4, identifier: 'arXiv:2601.00001',
      submitted: '2026-01-02',
    }, staging)
    expect(rows()).toEqual(expect.arrayContaining([
      'title: "STAR Revised"', 'short: "STAR"', 'authors:', '  - "A. Author"',
      'year: 2026', 'venue: "ICLR"', 'rating: 4', 'identifier: "arXiv:2601.00001"',
      'submitted: "2026-01-02"', 'my_own_key: "留着"',
    ]))
    writePaperFields(file, {
      shortTitle: null, authors: [], year: null, rating: null, identifier: null, submitted: null,
    }, staging)
    const text = rows().join('\n')
    expect(text).not.toMatch(/^(short|authors|year|rating|identifier|submitted):/m)
    expect(text).toContain('venue: "ICLR"')
    expect(text).toContain('my_own_key: "留着"')
  })

  it('第一次写阅读状态把 read_state 插在 topics 之前,别处不动', () => {
    const before = rows()
    expect(before.some((row) => row.startsWith('read_state:'))).toBe(false)
    writePaperFields(file, { readState: '在读' }, staging)
    const after = rows()
    const at = before.indexOf('topics:')
    expect(after).toHaveLength(before.length + 1)
    expect(after.slice(0, at)).toEqual(before.slice(0, at))
    expect(after[at]).toBe('read_state: "在读"')
    expect(after.slice(at + 1)).toEqual(before.slice(at))
  })

  it('再写一次阅读状态换掉原地那一行,不会插出第二个 read_state', () => {
    writePaperFields(file, { readState: '在读' }, staging)
    const before = rows()
    writePaperFields(file, { readState: '已读' }, staging)
    const after = rows()
    expect(after).toHaveLength(before.length)
    expect(after.filter((row, i) => row !== before[i])).toEqual(['read_state: "已读"'])
    expect(after.filter((row) => row.startsWith('read_state:'))).toHaveLength(1)
  })

  it('阅读状态写成 null 时把那一行从页上去掉,页回到没有这一项的样子', () => {
    const before = rows()
    writePaperFields(file, { readState: '在读' }, staging)
    expect(rows()).not.toEqual(before)
    writePaperFields(file, { readState: null }, staging)
    expect(rows()).toEqual(before)
  })

  it('页上本来就没有阅读状态时,写成 null 一个字节都不动', () => {
    const before = rows()
    writePaperFields(file, { readState: null }, staging)
    expect(rows()).toEqual(before)
  })

  it('写更新日期换掉原地那一行,不会插出第二个 updated', () => {
    const before = rows()
    writePaperFields(file, { updated: '2026-09-08' }, staging)
    const after = rows()
    expect(after.filter((row, i) => row !== before[i])).toEqual(['updated: "2026-09-08"'])
    expect(after.filter((row) => row.startsWith('updated:'))).toHaveLength(1)
  })

  it('custom 整块换:写成键下的块,空映射把键去掉,别的字节不动', () => {
    const before = rows()
    writePaperFields(file, { custom: { note: '读到一半', due: '9 月' } }, staging)
    const lines = rows()
    const at = lines.indexOf('custom:')
    expect(lines.slice(at, at + 3)).toEqual(['custom:', '  note: "读到一半"', '  due: "9 月"'])
    writePaperFields(file, { custom: {} }, staging)
    expect(rows()).toEqual(before)
  })

  it('custom 里的多选值写成键下的列表,空列表写成 []', () => {
    writePaperFields(file, { custom: { tags: ['综述', '必读'], kong: [] } }, staging)
    const lines = rows()
    const at = lines.indexOf('custom:')
    expect(lines.slice(at, at + 5))
      .toEqual(['custom:', '  tags:', '    - "综述"', '    - "必读"', '  kong: []'])
  })

  it('用户自己加的键、注释、既有的键序与页面状态,写完之后都还是原样', () => {
    writePaperFields(file, { topics: ['kv cache'], readState: '已读' }, staging)
    const after = rows()
    expect(after).toContain('my_own_key: "留着"')
    expect(after).toContain('# 主题是我一条条挑过的')
    expect(after.filter((row) => /^[a-z_]+:/.test(row))).toEqual([
      'type: "paper"', 'title: "STAR"', 'status: "draft"', 'created: "2026-05-20"',
      'updated: "2026-05-20"', 'source_id: "paper-pdf-a6b750e25a61"', 'page_count: 17',
      'my_own_key: "留着"', 'tags:', 'read_state: "已读"', 'topics:', 'methods: []', 'claims:',
    ])
  })

  it('CRLF 的页写进去的行也带 CR,行尾风格不变', () => {
    writeFileSync(file, PAGE.split('\n').join('\r\n'), 'utf8')
    writePaperFields(file, { topics: ['kv cache'], readState: '在读' }, staging)
    const text = readFileSync(file, 'utf8')
    expect(text.split('\n').slice(0, -1).every((row) => row.endsWith('\r'))).toBe(true)
    expect(text).toContain('\r\nread_state: "在读"\r\ntopics:\r\n  - "kv cache"\r\n')
  })

  it('页上没有 topics 也没有 memberships 时,阅读状态插在 frontmatter 末尾', () => {
    writeFileSync(file, '---\ntype: "paper"\ntitle: "STAR"\n---\n\n# STAR\n', 'utf8')
    const before = rows()
    writePaperFields(file, { readState: '在读' }, staging)
    const after = rows()
    const at = before.indexOf('---', 1)
    expect(after).toHaveLength(before.length + 1)
    expect(after.slice(0, at)).toEqual(before.slice(0, at))
    expect(after[at]).toBe('read_state: "在读"')
    expect(after.slice(at + 1)).toEqual(before.slice(at))
  })

  it('不是一页收口的 frontmatter 就抛出,而不是往正文里写', () => {
    writeFileSync(file, '# STAR\n\ntopics:\n', 'utf8')
    expect(() => writePaperFields(file, { readState: '在读' }, staging)).toThrow(/frontmatter/)
  })
})
