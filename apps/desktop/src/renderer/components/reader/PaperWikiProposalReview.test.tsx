// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessPaperWikiQuality, HarnessPaperWikiReview } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { TOOLTIP_DELAY } from '../Tooltip.js'
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
    expect(html).toContain('本提案没有提取到有原文依据的局限。')
    expect(html).not.toContain('structured-list')
  })

  /** The heading and empty statement of each section a review of `ids`, as Core stores it, shows in `language`. */
  const sectionTexts = (language: 'zh' | 'en', ids: string[]) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: ids.map((id) => ({ id, title: `Core 存下的「${id}」`, emptyLabel: `Core 存下的「${id}」空白`, groups: [] })),
    }
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={review} onJump={() => {}} /></MessagesProvider>,
    )
    return [...host.querySelectorAll('.paper-wiki-review-section')].map((section) => [
      section.querySelector('h4')!.textContent, section.querySelector('.empty-state')?.textContent,
    ])
  }

  it('names each section by its identifier in the catalog, in zh and en, whatever words Core stored', () => {
    const ids = [
      'remember', 'retrieve', 'mechanism', 'mechanism-details', 'evidence', 'implementation', 'limitations',
      'user-insights', 'open-questions',
    ]
    expect(sectionTexts('zh', ids).map(([title]) => title)).toEqual([
      '记住什么', '何时检索', '机制', '待核对的机制细节', '证据', '实现入口', '局限与不确定性', '你的阅读洞见', '开放问题',
    ])
    expect(sectionTexts('en', ids).map(([title]) => title)).toEqual([
      'What to remember', 'When to retrieve', 'Mechanism', 'Mechanism details to check', 'Evidence',
      'Implementation entry points', 'Limitations and uncertainty', 'Your reading insights', 'Open questions',
    ])
    for (const [title, empty] of sectionTexts('en', ids)) expect(`${title} ${empty}`).not.toMatch(/[\u3400-\u9fff]/)
  })

  it('names each group title by its id in the catalog, in zh and en, and keeps the stored words of a mechanism component and of an unknown id', () => {
    const groups = [
      ['problem', '论文问题'], ['takeaway-3', '核心要点 3'], ['retrieval-fit-2', '检索场景 2'], ['retrieval-scope', '适用边界'],
      ['evidence-1', '证据 1'], ['implementation-1', '实现入口 1'], ['mechanism-1', 'Feature drafter'], ['later-group-1', 'Core 存下的组'],
    ]
    const titles = (language: 'zh' | 'en') => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
      const review: HarnessPaperWikiReview = {
        schemaVersion: 'meridian.paper-wiki-review.v1',
        sections: [{
          id: 'remember', title: '记住什么', emptyLabel: '没有内容',
          groups: groups.map(([id, title]) => ({ id: id!, title: title!, provenance: 'wiki-synthesis' as const, anchors: [], rows: [{ text: '一句' }] })),
        }],
      }
      const host = document.createElement('div')
      host.innerHTML = renderToStaticMarkup(
        <MessagesProvider><PaperWikiProposalReview review={review} onJump={() => {}} /></MessagesProvider>,
      )
      return [...host.querySelectorAll('.paper-wiki-review-group-head > strong')].map((title) => title.textContent)
    }
    expect(titles('zh')).toEqual(groups.map(([, title]) => title))
    expect(titles('en')).toEqual([
      'Problem', 'Key point 3', 'Search scenario 2', 'Scope', 'Evidence 1', 'Implementation entry point 1',
      'Feature drafter', 'Core 存下的组',
    ])
  })

  it('names each row label by its group\'s kind and its position, in zh and en, and keeps the stored label of an unknown kind or a row past the known ones', () => {
    const rows = (labels: string[]) => labels.map((label) => ({ label, text: '一句' }))
    const groups = [
      ['retrieval-fit-1', ['问题', '适用原因']], ['retrieval-scope', ['主要适用', '相邻适用', '弱相关']],
      ['mechanism-1', ['输入', '变换', '输出', '依赖']], ['evidence-1', ['主张', '设置', '结果']],
      ['implementation-1', ['任务', '首先检查', 'Core 存下的第三行']], ['later-group-1', ['Core 存下的行']],
    ] as const
    const labels = (language: 'zh' | 'en') => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
      const review: HarnessPaperWikiReview = {
        schemaVersion: 'meridian.paper-wiki-review.v1',
        sections: [{
          id: 'retrieve', title: '何时检索', emptyLabel: '没有内容',
          groups: groups.map(([id, stored]) => ({ id, title: '组', provenance: 'wiki-synthesis' as const, anchors: [], rows: rows([...stored]) })),
        }],
      }
      const host = document.createElement('div')
      host.innerHTML = renderToStaticMarkup(
        <MessagesProvider><PaperWikiProposalReview review={review} onJump={() => {}} /></MessagesProvider>,
      )
      return [...host.querySelectorAll('.paper-wiki-review-group')].map((group) => [...group.querySelectorAll('.proposal-row dt')].map((dt) => dt.textContent))
    }
    expect(labels('zh')).toEqual(groups.map(([, stored]) => [...stored]))
    expect(labels('en')).toEqual([
      ['Question', 'Why it fits'], ['Primary fit', 'Adjacent fit', 'Weak fit'],
      ['Input', 'Transformation', 'Output', 'Dependency'], ['Claim', 'Setting', 'Result'],
      ['Task', 'First check', 'Core 存下的第三行'], ['Core 存下的行'],
    ])
  })

  it('keeps the words Core stored for a section this version does not know', () => {
    expect(sectionTexts('en', ['later-section'])).toEqual([['Core 存下的「later-section」', 'Core 存下的「later-section」空白']])
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
    expect(host.querySelector('.paper-wiki-quality')?.matches('.inline-message--box.inline-message--done[role="status"]')).toBe(true)
    expect(host.querySelector('.paper-wiki-quality p')).toBeNull()
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
    const host = document.createElement('div')
    host.innerHTML = html
    expect(host.querySelector('.paper-wiki-quality')?.matches('.inline-message--box.inline-message--warning[role="status"]')).toBe(true)
  })

  /** A report in which every path of `paths` has a finding of `code`. */
  const report = (paths: string[], code: string): HarnessPaperWikiQuality => ({
    schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: false,
    dimensions: dimensions.map((id) => ({ id, passed: id !== 'mechanism' })),
    findings: paths.map((path) => ({ dimension: 'mechanism', code, path, message: 'Required fixture pages were not cited.' })),
  })
  const emptyReview: HarnessPaperWikiReview = {
    schemaVersion: 'meridian.paper-wiki-review.v1',
    sections: [{ id: 'limitations', title: '局限', emptyLabel: '没有原文依据的局限。', groups: [] }],
  }

  /** The finding rows a report on `paths` shows in `language`: the texts of each row's lines, and its place. */
  const findingRows = (language: 'zh' | 'en', paths: string[], code = 'generic-contract') => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider><PaperWikiProposalReview review={emptyReview} quality={report(paths, code)} onJump={() => {}} /></MessagesProvider>,
    )
    return [...host.querySelectorAll('.paper-wiki-quality-finding')].map((row) => ({
      lines: [...row.children].map((line) => line.textContent!),
      place: row.querySelector('.paper-wiki-quality-place')?.textContent ?? '',
    }))
  }

  /** What the tooltip of the title of a finding of `code` says in `language` once the pointer rests on the title. */
  const findingTip = (language: 'zh' | 'en', code: string): string | null => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    vi.useFakeTimers()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    const root = createRoot(host)
    try {
      act(() => root.render(
        <MessagesProvider><PaperWikiProposalReview review={emptyReview} quality={report(['draft'], code)} onJump={() => {}} /></MessagesProvider>,
      ))
      const title = host.querySelector('.paper-wiki-quality-finding strong')!
      act(() => { title.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
      act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
      return document.querySelector('[role="tooltip"]')?.textContent ?? null
    } finally {
      act(() => root.unmount())
      vi.useRealTimers()
    }
  }

  it('shows a finding by its title and place alone, its detail only in the tooltip of its title, in zh and en', () => {
    expect(findingRows('zh', ['mechanism[0]']).map(({ lines }) => lines)).toEqual([['机制描述过于空泛', '机制 · 第 1 条']])
    expect(findingRows('en', ['mechanism[0]']).map(({ lines }) => lines)).toEqual([['Mechanism description is too generic', 'Mechanism · item 1']])
    expect(findingTip('zh', 'generic-contract')).toBe('输入、变换、输出或依赖仍是占位式表达。')
    expect(findingTip('en', 'generic-contract')).toBe('The input, transformation, output, or dependencies still use placeholder wording.')
  })

  it('names the place of each finding in the user\'s words, in zh and en, and never its field path', () => {
    const paths = [
      'problem', 'what_to_remember[2]', 'retrieval.fits[1].query', 'retrieval.fits', 'retrieval.scope_notes',
      'mechanism[0]', 'mechanism_details_to_verify[0]', 'evidence[1]', 'implementation_hooks[0]', 'limitations',
      'user_observations[0].text', 'draft', 'future_field[3]',
    ]
    const places = (language: 'zh' | 'en') => findingRows(language, paths).map(({ place }) => place)
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
    for (const line of [...findingRows('zh', paths), ...findingRows('en', paths)].flatMap(({ lines }) => lines)) {
      expect(line).not.toMatch(/[[\]_]|\w\.\w/)
    }
  })

  it('reports every finding it knows without an evaluation term, in zh and en', () => {
    for (const code of ['missing-case-page', 'missing-case-reading-ref', 'missing-case-limitation', 'unknown-page', 'generic-evidence']) {
      expect(`${findingRows('zh', ['draft'], code)[0]!.lines.join(' ')} ${findingTip('zh', code)}`).not.toMatch(/校准|样本|用例/)
      expect(`${findingRows('en', ['draft'], code)[0]!.lines.join(' ')} ${findingTip('en', code)}`).not.toMatch(/fixture|calibration|\bcase\b/i)
    }
  })
})
