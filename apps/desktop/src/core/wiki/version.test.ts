import { describe, expect, it } from 'vitest'
import cases from '../fixtures/wiki-version-cases.json' with { type: 'json' }
import type { WikiAggregationRecord } from './model.js'
import { pageVersion, recordText } from './version.js'

describe('page version', () => {
  it('与共享用例文件逐条一致(Python 那边断言同一份期望值)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(4)
    for (const c of cases) expect(pageVersion(c.text), c.name).toEqual({ fm: c.fm, body: c.body })
  })

  it('没有 frontmatter 的页 fm 是空串的指纹;不存在的页是 null', () => {
    expect(pageVersion('# x\n')!.fm).toBe('e3b0c44298fc1c14')
    expect(pageVersion(null)).toBeNull()
  })

  it('只改 updated、只改行尾或只改生成区时版本不变;改正文只动 body,改 frontmatter 只动 fm', () => {
    const base = cases[0]!.text
    const same = pageVersion(base)
    expect(pageVersion(base.replace('(无)', '- [[topics/x|X]]'))).toEqual(same)
    const body = pageVersion(base.replace('小模型起草', '小模型先起草'))!
    expect(body.fm).toBe(same!.fm)
    expect(body.body).not.toBe(same!.body)
    const fm = pageVersion(base.replace('title: "Speculative decoding"', 'title: "SD"'))!
    expect(fm.body).toBe(same!.body)
    expect(fm.fm).not.toBe(same!.fm)
  })

  it('记录的页文本:kind 先写,空值的键不写,之后是正文', () => {
    const page: WikiAggregationRecord = {
      kind: 'topic', fm: { title: 'T', aliases: [], split_on: null, updated: '2026-09-01' }, body: '## 问题\n正文',
    }
    expect(recordText(page)).toBe('---\nkind: "topic"\ntitle: "T"\naliases: []\nupdated: "2026-09-01"\n---\n## 问题\n正文')
  })
})
