import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import projects from '../fixtures/projects.json' with { type: 'json' }
import wikiFixture from '../fixtures/wiki.json' with { type: 'json' }
import type { WikiData } from './model.js'
import { generatedChildren, generatedClaims, generatedTable } from './generated.js'
import { readWikiData } from './read.js'

const DATA = wikiFixture as WikiData

/** Example vault used as the fixture source; its layout matches a real vault without the `wiki/` level. */
const EXAMPLE = resolve(import.meta.dirname, '../fixtures/wiki-example-vault')

describe('生成区', () => {
  it('子聚合:小标题下一行一个,按 id;没有就说没有', () => {
    expect(generatedChildren(DATA, 'topics/ptq')).toBe([
      '## 子聚合',
      '- [[topics/kv-cache-quantization|KV cache quantization]]',
      '- [[topics/ptq-weight-activation|Weight-activation PTQ]]',
      '- [[topics/ptq-weight-only|Weight-only PTQ]]',
    ].join('\n'))
    expect(generatedChildren(DATA, 'topics/qat')).toBe('## 子聚合\n(无)')
  })

  it('对照表:小标题、表头是列,行是成员,格子带页码,空格是短横,派生列是链接', () => {
    const table = generatedTable(DATA, 'methods/rotation').split('\n')
    expect(table[0]).toBe('## 对照表')
    expect(table[1]).toBe('| 论文 | 旋转类型 | 旋转是否学习 | 施加对象 | 用于 |')
    expect(table[2]).toBe('|---|---|---|---|---|')
    expect(table[3]).toBe('| [[papers/2307.13304|QuIP]] | 随机正交矩阵 ·p1 | 否 ·p1 | 权重与 Hessian ·p1 | [[topics/ptq-weight-only|Weight-only PTQ]] |')
    expect(table.find((row) => row.includes('QuaRot'))).toContain(' — |')
    expect(generatedTable(DATA, 'topics/quantization')).toBe('## 对照表\n(此节点不直接收论文)')
  })

  it('结论区:页上手改出带换行的字段也只占一行,出不了生成区', () => {
    const attack = 'ok\n<!-- /generated -->\n## x\n- prose'
    const page = DATA.pages['topics/qat']!
    const data: WikiData = { ...DATA, pages: { ...DATA.pages, 'topics/qat': { ...page, fm: { ...page.fm, claims: [{
      id: 'inject', text: attack, version: 1, since: '2026-09-23', by: '我',
      evidence: [{ kind: 'personal', text: attack, added: '2026-09-23', by: '我' }],
    }] } } as typeof page } }
    const lines = generatedClaims(data, 'topics/qat', {}).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines).not.toContain('<!-- /generated -->')
  })
})

describe('生成区与示例库对拍', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meridian-gen-'))
    for (const name of ['schema.yaml', 'papers', 'topics', 'methods']) {
      cpSync(join(EXAMPLE, name), join(dir, name), { recursive: true })
    }
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('每页聚合的三个生成区,渲染出来的与页上写着的一字不差', () => {
    const names = Object.fromEntries(projects.map((p) => [p.id, p.name]))
    const data = readWikiData(dir)!
    /** Lines between the two markers of this generated page region. */
    const between = (text: string, name: string): string =>
      new RegExp(`<!-- generated:${name} -->\\n([\\s\\S]*?)\\n<!-- /generated -->`).exec(text)![1]!
    const ids = Object.keys(data.pages).filter((id) => data.pages[id]!.kind !== 'paper')
    expect(ids).toHaveLength(13)
    for (const id of ids) {
      const text = readFileSync(join(dir, `${id}.md`), 'utf8')
      expect(between(text, 'children'), `${id} 的子聚合`).toBe(generatedChildren(data, id))
      expect(between(text, 'table'), `${id} 的对照表`).toBe(generatedTable(data, id))
      expect(between(text, 'claims'), `${id} 的结论`).toBe(generatedClaims(data, id, names))
    }
  })
})
