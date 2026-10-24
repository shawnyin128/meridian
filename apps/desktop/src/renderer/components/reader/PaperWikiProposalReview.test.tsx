// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessPaperWikiQuality, HarnessPaperWikiReview } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { PaperWikiProposalReview } from './PaperWikiProposalReview.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const dimensions = [
  'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
] as const

describe('PaperWikiProposalReview', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('keeps provenance explicit, its text in body type, and its fields and the pages it rests on in one aligned list, each page an anchor that opens the reader there', () => {
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{
        id: 'mechanism', title: '机制', emptyLabel: '没有机制', groups: [{
          id: 'm1', title: '校准器', provenance: 'paper-source', anchors: ['page:2', 'highlight:h1'],
          rows: [{ text: '一句话' }, { label: '输入', text: '原始分数' }, { label: '输出', text: '校准分数' }],
        }],
      }],
    }
    const jump = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><PaperWikiProposalReview review={review} onJump={jump} /></MessagesProvider>))
    const group = host.querySelector('.structured-list--embedded .paper-wiki-review-group')!
    expect(group.querySelector('.tag')!.textContent).toBe('论文原文')
    expect([...group.querySelectorAll('.proposal-text')].map((text) => text.textContent)).toEqual(['一句话'])
    expect([...group.querySelectorAll('.proposal-row')].map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]))
      .toEqual([['输入', '原始分数'], ['输出', '校准分数'], ['原文', 'p.2'], ['你的笔记', '高亮批注']])
    expect(group.querySelectorAll('.proposal-rows')).toHaveLength(1)
    const anchor = group.querySelector<HTMLButtonElement>('.source-anchor')!
    act(() => anchor.click())
    expect(jump).toHaveBeenCalledWith(2)
    act(() => root.unmount())
  })

  it('shows an explicit empty statement instead of inventing missing content', () => {
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{ id: 'limitations', title: '局限', emptyLabel: '没有原文依据的局限。', groups: [] }],
    }
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={review} onJump={() => {}} /></MessagesProvider>,
    )
    expect(html).toContain('没有原文依据的局限。')
    expect(html).not.toContain('structured-list')
  })

  it('states a passing deterministic report by its title alone, with no note about what it means', () => {
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{ id: 'limitations', title: '局限', emptyLabel: '没有原文依据的局限。', groups: [] }],
    }
    const quality: HarnessPaperWikiQuality = {
      schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: true,
      dimensions: dimensions.map((id) => ({ id, passed: true })), findings: [],
    }
    const html = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={review} quality={quality} onJump={() => {}} /></MessagesProvider>,
    )
    expect(html).toContain('7 项规则检查未发现问题')
    const host = document.createElement('div')
    host.innerHTML = html
    expect(host.querySelector('.paper-wiki-quality > p')).toBeNull()
    expect(host.querySelector('.paper-wiki-review-legend')).toBeNull()
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
      <MessagesProvider><PaperWikiProposalReview review={review} quality={quality} onJump={() => {}} /></MessagesProvider>,
    )
    expect(html).toContain('发现 1 项需要核对')
    expect(html).toContain('机制描述过于空泛')
    expect(html).toContain('structured-list--embedded')
  })

  /** The finding rows a report on `paths` shows in `language`, each as the texts of its lines. */
  const findingRows = (language: 'zh' | 'en', paths: string[], code = 'generic-contract') => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{ id: 'limitations', title: '局限', emptyLabel: '没有原文依据的局限。', groups: [] }],
    }
    const quality: HarnessPaperWikiQuality = {
      schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: false,
      dimensions: dimensions.map((id) => ({ id, passed: id !== 'mechanism' })),
      findings: paths.map((path) => ({ dimension: 'mechanism', code, path, message: 'Required fixture pages were not cited.' })),
    }
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={review} quality={quality} onJump={() => {}} /></MessagesProvider>,
    )
    return [...host.querySelectorAll('.paper-wiki-quality-finding')].map((row) => [...row.children].map((line) => line.textContent!))
  }

  it('names the place of each finding in the user\'s words, in zh and en, and never its field path', () => {
    const paths = [
      'problem', 'what_to_remember[2]', 'retrieval.fits[1].query', 'retrieval.fits', 'retrieval.scope_notes',
      'mechanism[0]', 'mechanism_details_to_verify[0]', 'evidence[1]', 'implementation_hooks[0]', 'limitations',
      'user_observations[0].text', 'draft', 'future_field[3]',
    ]
    const places = (language: 'zh' | 'en') => findingRows(language, paths).map((lines) => lines[2] ?? '')
    expect(places('zh')).toEqual([
      '论文问题', '核心要点 · 第 3 条', '检索场景 · 第 2 条', '检索场景', '适用边界', '机制 · 第 1 条',
      '待核对的机制细节 · 第 1 条', '证据 · 第 2 条', '实现入口 · 第 1 条', '局限与不确定性', '你的阅读洞见 · 第 1 条',
      '整份提案', '',
    ])
    expect(places('en')).toEqual([
      'Problem', 'Key points · item 3', 'Search scenarios · item 2', 'Search scenarios', 'Scope', 'Mechanism · item 1',
      'Mechanism details to check · item 1', 'Evidence · item 2', 'Implementation entry points · item 1',
      'Limitations and uncertainty', 'Your reading insights · item 1', 'Whole proposal', '',
    ])
    for (const line of [...findingRows('zh', paths), ...findingRows('en', paths)].flat()) expect(line).not.toMatch(/[[\]_]|\w\.\w/)
  })

  it('reports every finding it knows without an evaluation term, in zh and en', () => {
    for (const code of ['missing-case-page', 'missing-case-reading-ref', 'missing-case-limitation', 'unknown-page', 'generic-evidence']) {
      expect(findingRows('zh', ['draft'], code)[0]!.join(' ')).not.toMatch(/校准|样本|用例/)
      expect(findingRows('en', ['draft'], code)[0]!.join(' ')).not.toMatch(/fixture|calibration|\bcase\b/i)
    }
  })
})
