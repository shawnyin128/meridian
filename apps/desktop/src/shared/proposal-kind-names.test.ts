import { describe, expect, it } from 'vitest'
import { PAPER_WIKI_DRAFT_KINDS } from '../core/changelog.js'
import { PROPOSAL_KIND_NAMES } from '../core/wiki-proposals.js'
import { wiki } from '../renderer/messages/zh/wiki.js'

describe('应用提案后最近变动的标题', () => {
  it('每种改动的名字和审阅卡片第一行用中文写的一样', () => {
    expect(PROPOSAL_KIND_NAMES).toEqual(wiki.queue.kinds)
  })

  it('写入阅读器 Wiki 提案的名字和提案卡片第一行用中文写的一样', () => {
    expect(PAPER_WIKI_DRAFT_KINDS).toEqual({ create: wiki.ingest.newContent, update: wiki.ingest.updateContent })
  })
})
