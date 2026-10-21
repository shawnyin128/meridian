import { describe, expect, it } from 'vitest'
import { PROPOSAL_KIND_NAMES } from '../core/wiki-proposals.js'
import { wiki } from '../renderer/messages/zh/wiki.js'

describe('应用提案后最近变动的标题', () => {
  it('每种改动的名字和审阅卡片第一行用中文写的一样', () => {
    expect(PROPOSAL_KIND_NAMES).toEqual(wiki.queue.kinds)
  })
})
