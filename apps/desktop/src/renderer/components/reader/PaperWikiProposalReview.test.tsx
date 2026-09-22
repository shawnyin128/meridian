// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HarnessPaperWikiQuality, HarnessPaperWikiReview } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { PaperWikiProposalReview } from './PaperWikiProposalReview.js'

const dimensions = [
  'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
] as const

describe('PaperWikiProposalReview', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('keeps provenance, fields, and anchors explicit in an embedded list', () => {
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{
        id: 'mechanism', title: '机制', emptyLabel: '没有机制', groups: [{
          id: 'm1', title: '校准器', provenance: 'paper-source', anchors: ['page:2'],
          rows: [{ label: '输入', text: '原始分数' }, { label: '输出', text: '校准分数' }],
        }],
      }],
    }
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={review} /></MessagesProvider>,
    )
    expect(html).toContain('structured-list--embedded')
    expect(html).toContain('论文原文')
    expect(html).toContain('第 2 页')
    expect(html).toContain('原始分数')
  })

  it('shows an explicit empty statement instead of inventing missing content', () => {
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{ id: 'limitations', title: '局限', emptyLabel: '没有原文依据的局限。', groups: [] }],
    }
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={review} /></MessagesProvider>,
    )
    expect(html).toContain('没有原文依据的局限。')
    expect(html).not.toContain('structured-list')
  })

  it('states the limit of a passing deterministic report instead of predicting correctness', () => {
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{ id: 'limitations', title: '局限', emptyLabel: '没有原文依据的局限。', groups: [] }],
    }
    const quality: HarnessPaperWikiQuality = {
      schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: true,
      dimensions: dimensions.map((id) => ({ id, passed: true })), findings: [],
    }
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={review} quality={quality} /></MessagesProvider>,
    )
    expect(html).toContain('7 项规则检查未发现问题')
    expect(html).toContain('不代表内容正确')
  })

  it('renders actionable findings in the shared embedded-list pattern', () => {
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{ id: 'limitations', title: '局限', emptyLabel: '没有原文依据的局限。', groups: [] }],
    }
    const quality: HarnessPaperWikiQuality = {
      schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: false,
      dimensions: dimensions.map((id) => ({ id, passed: id !== 'mechanism' })),
      findings: [{
        dimension: 'mechanism', code: 'generic-contract', path: 'mechanism[0]',
        message: 'Mechanism fields are placeholders.',
      }],
    }
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={review} quality={quality} /></MessagesProvider>,
    )
    expect(html).toContain('发现 1 项需要核对')
    expect(html).toContain('机制描述过于空泛')
    expect(html).toContain('structured-list--embedded')
    expect(html).toContain('mechanism[0]')
  })
})
