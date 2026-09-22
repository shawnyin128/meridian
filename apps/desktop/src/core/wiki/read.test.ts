import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wikiFixture from '../fixtures/wiki.json' with { type: 'json' }
import type { WikiData } from './model.js'
import { readWikiData } from './read.js'

/** Example vault used as the fixture source; its layout matches a real vault without the `wiki/` level. */
const EXAMPLE = resolve(import.meta.dirname, '../fixtures/wiki-example-vault')

/** Compares disk data with the fixture: structural fields and every example-vault page must match. */
const expectMatchesFixture = (data: WikiData): void => {
  const { pages, ...rest } = wikiFixture as WikiData
  expect({ ...data, pages: {} }).toEqual({ ...rest, pages: {} })
  for (const [id, page] of Object.entries(data.pages)) expect(page, id).toEqual(pages[id])
  expect(Object.keys(data.pages)).toHaveLength(23)
}

describe('readWikiData', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meridian-wiki-'))
    for (const name of ['schema.yaml', 'papers', 'topics', 'methods']) {
      cpSync(join(EXAMPLE, name), join(dir, name), { recursive: true })
    }
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('从磁盘读出来的与导出脚本给 fixture 的是同一份数据', () => {
    expectMatchesFixture(readWikiData(dir)!)
  })

  it('没有 schema.yaml 的目录读不了,报出缺的那个文件', () => {
    rmSync(join(dir, 'schema.yaml'))
    expect(() => readWikiData(dir)).toThrow(`库里没有 Wiki 结构文件:${join(dir, 'schema.yaml')}`)
  })

  it('CRLF 的页读出来与 LF 的一样', () => {
    const file = join(dir, 'papers', '2210.17323.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'), 'utf8')
    expectMatchesFixture(readWikiData(dir)!)
  })

  it('正文是最后一个生成区之后到页尾;没有生成区的页,frontmatter 之后全是正文', () => {
    const data = readWikiData(dir)!
    expect(data.pages['topics/ptq']!.body.startsWith('## 问题\n')).toBe(true)
    expect(data.pages['topics/ptq']!.body.endsWith('## 未解决')).toBe(true)
    expect(data.pages['topics/ptq']!.body).not.toContain('generated')
    expect(data.pages['papers/2210.17323']!.body.startsWith('## 这篇说了什么\n')).toBe(true)
  })

  it('页上的 kind 与目录对不上就抛出', () => {
    writeFileSync(join(dir, 'topics', 'bad.md'), '---\nkind: method\ntitle: Bad\nupdated: 2026-09-10\n---\n# Bad\n', 'utf8')
    expect(() => readWikiData(dir)).toThrow(/topics\/bad/)
  })
})
