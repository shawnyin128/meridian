import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WikiAggregationRecord, WikiClaimRecord } from './model.js'
import { appendEntry, fillGenerated, generatedMissing, removeClaim, setClaim } from './page.js'
import { readWikiPage } from './read.js'

const EXAMPLE = resolve(import.meta.dirname, '../fixtures/wiki-example-vault')

describe('claims block writes', () => {
  let dir: string
  let staging: string
  const file = (name: string) => join(dir, name)
  const read = (name: string) => readFileSync(file(name), 'utf8')
  const claimsOn = (name: string) => (readWikiPage(file(name), 'topic') as WikiAggregationRecord).fm.claims

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meridian-claims-'))
    staging = join(dir, '.staging')
    cpSync(join(EXAMPLE, 'topics'), join(dir, 'topics'), { recursive: true })
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const fresh: WikiClaimRecord = {
    id: 'fresh', text: '新的一条 "带引号"', version: 1, since: '2026-09-22', by: 'ai:skill.meridian',
    evidence: [{ kind: 'experiment', project: 'draft', node: 'wide', added: '2026-09-22', by: 'ai:skill.meridian' }],
  }

  it('读出来再原样写回,整页一个字节不变', () => {
    const name = 'topics/kv-cache-quantization.md'
    const before = read(name)
    for (const claim of claimsOn(name)!) setClaim(file(name), claim, staging)
    expect(read(name)).toBe(before)
  })

  it('改一条只换那一条的行;加一条接在最后一条后面;删掉一条只少它的行', () => {
    const name = 'topics/kv-cache-quantization.md'
    const before = read(name).split('\n')
    const [first, second] = claimsOn(name)!
    setClaim(file(name), { ...second!, text: '改过的写法' }, staging)
    const changed = read(name).split('\n')
    expect(changed).toHaveLength(before.length)
    expect(changed.filter((row, i) => row !== before[i])).toEqual(['    text: "改过的写法"'])
    setClaim(file(name), fresh, staging)
    expect(claimsOn(name)!.map((c) => c.id)).toEqual([first!.id, second!.id, 'fresh'])
    expect(claimsOn(name)![2]).toEqual(fresh)
    removeClaim(file(name), 'fresh', staging)
    expect(read(name).split('\n')).toEqual(changed)
    expect(() => removeClaim(file(name), 'gone', staging)).toThrow(/gone/)
  })

  it('没有 claims 的页在收口 --- 上面开一个块,CRLF 的页写进去的行也是 CRLF;删掉最后一条留下 claims: []', () => {
    const name = 'topics/qat.md'
    writeFileSync(file(name), read(name).replace(/\n/g, '\r\n'), 'utf8')
    const before = read(name)
    const close = before.indexOf('\r\n---\r\n')
    setClaim(file(name), fresh, staging)
    const after = read(name)
    expect(after.slice(0, close)).toBe(before.slice(0, close))
    expect(after).toContain('\r\nclaims:\r\n  - id: "fresh"\r\n')
    expect(after.slice(after.indexOf('\r\n---\r\n'))).toBe(before.slice(close))
    expect(claimsOn(name)).toEqual([fresh])
    removeClaim(file(name), 'fresh', staging)
    expect(read(name)).toBe(`${before.slice(0, close)}\r\nclaims: []${before.slice(close)}`)
  })

  it('旧页没有结论生成区:回填时在对照表后面补上,别的字节不动;缺的区查得出来', () => {
    const name = 'topics/qat.md'
    const rows = read(name).split('\n')
    const open = rows.indexOf('<!-- generated:claims -->')
    const old = [...rows.slice(0, open), ...rows.slice(rows.indexOf('<!-- /generated -->', open) + 1)]
    writeFileSync(file(name), old.join('\n'), 'utf8')
    expect(generatedMissing(file(name))).toEqual(['claims'])
    const region = (name: string): string => {
      const at = old.indexOf(`<!-- generated:${name} -->`)
      return old.slice(at + 1, old.indexOf('<!-- /generated -->', at)).join('\n')
    }
    fillGenerated(file(name), { children: region('children'), table: region('table'), claims: '## 结论\n(暂无结论)' }, staging)
    expect(read(name).split('\n')).toEqual([
      ...old.slice(0, open), '<!-- generated:claims -->', '## 结论', '(暂无结论)', '<!-- /generated -->', ...old.slice(open),
    ])
    expect(generatedMissing(file(name))).toEqual([])
  })

  it('旧库的追加区条目不会追进生成区里的「## 结论」小标题下,而是追到正文那一节', () => {
    const name = 'topics/ptq-weight-activation.md'
    appendEntry(file(name), '结论', '- 2026-09-22 · 旧库的一条', staging)
    const rows = read(name).split('\n')
    expect(rows.indexOf('- 2026-09-22 · 旧库的一条')).toBeGreaterThan(rows.lastIndexOf('<!-- /generated -->'))
    expect(rows[rows.indexOf('<!-- generated:claims -->') + 1]).toBe('## 结论')
  })
})
