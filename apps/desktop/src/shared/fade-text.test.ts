import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const source = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** Each rule of every stylesheet under the renderer as its file, its selector list and its body, comments dropped. */
const RULES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.css'))
  .flatMap((path) => [...source(path).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ path, selector: selector!.trim().replace(/\s+/g, ' '), body: body! })))

/** Text that may still end in an ellipsis, and why. */
const ELLIPSIS_EXEMPT: Record<string, string> = {
  // A placeholder takes no mask of its own, and a mask on the field would fade the typed text and the caret too.
  '.cbox textarea::placeholder': 'placeholder',
}

/**
 * Every one-line text that ended in an ellipsis, by its class: the component that now renders it through
 * FadeText, the markup that does, and how many times it appears there when more than once.
 */
const ONE_LINE: Record<string, [file: string, markup: RegExp, count?: number]> = {
  'tag-text': ['components/Tag.tsx', /<FadeText className="tag-text" label=/g, 2],
  'status-dot-label': ['components/StatusDot.tsx', /<FadeText className="status-dot-label">/],
  'card-tray-summary': ['components/CardTray.tsx', /<FadeText className="card-tray-summary">/],
  'choice-picker-value': ['components/FieldPickers.tsx', /<FadeText className="choice-picker-value"/g, 2],
  'api-state': ['components/settings/ApiOverview.tsx', /<FadeText className="api-state">/],
  'extension-command-summary code': ['components/settings/ExtensionSettings.tsx', /<FadeText><code>\{command\}<\/code><\/FadeText>/],
  'paper-understanding-quote': ['components/paper/PaperUnderstanding.tsx', /<FadeText className="paper-understanding-quote">/],
  'project-identity-topic': ['components/project/ProjectIdentity.tsx', /<FadeText className="project-identity-topic" label=/g, 2],
  'idea-draft-source': ['components/ideas/IdeaDraft.tsx', /<FadeText className="idea-draft-source" label=/],
  'cl': ['components/paper-table/ColumnMenu.tsx', /<FadeText className="cl" label=/g, 3],
  'filter-menu': ['components/FilterMenu.tsx', /<FadeText>\{at < 0 \? name : options\[at\]!\.label\}<\/FadeText><\/button>/],
  'node-document-title': ['components/project/ResearchGraph.tsx', /<FadeText className="node-document-title" label=/],
  'node-document-title (task)': ['components/project/ProjectPlan.tsx', /<FadeText className="node-document-title" label=/],
  'node-document-title (conclusion)': ['components/project/ProjectConclusions.tsx', /<FadeText className="node-document-title" label=/],
  'node-document-title (idea)': ['components/ideas/IdeaPanel.tsx', /<FadeText className="node-document-title" label=/],
  'node-idea-title': ['components/project/ResearchGraph.tsx', /<FadeText className="node-idea-title" label=/],
  'node-idea-source': ['components/project/ResearchGraph.tsx', /<FadeText className="node-idea-source" label=/],
  'node-document-source': ['components/project/ResearchGraph.tsx', /<FadeText className="node-document-source" label=/],
  'attn-text': ['components/project/ProjectSignals.tsx', /<FadeText className="attn-text">/],
  'idea-card-title': ['routes/Ideas.tsx', /<FadeText className="idea-card-title" label=/],
  'idea-card-source': ['routes/Ideas.tsx', /<FadeText className="idea-card-source" label=/],
  'project-idea-title': ['routes/ProjectDetail.tsx', /<FadeText className="project-idea-title" label=/],
  'project-idea-source': ['routes/ProjectDetail.tsx', /<FadeText className="project-idea-source" label=/],
  'workspace-name': ['routes/ProjectDetail.tsx', /<FadeText className="workspace-name">/],
  'project-card-value': ['routes/Projects.tsx', /<FadeText className="project-card-value" label=/],
  'project-card-empty': ['routes/Projects.tsx', /<FadeText className="project-card-empty">/],
  'm': ['routes/Projects.tsx', /<FadeText className="m">/],
  'storage-backup-path': ['routes/Settings.tsx', /<FadeText className="storage-backup-path" label=/],
  'author-id-state': ['routes/Watches.tsx', /<FadeText className="author-id-state" label=/],
  'author-match-name': ['routes/Watches.tsx', /<FadeText className="author-match-name" label=/],
  'watch-suggestion-copy nm': ['routes/Watches.tsx', /<FadeText className="nm" label=\{item\.name\}>/g, 2],
  'wktoc': ['routes/Wiki.tsx', /<FadeText label=\{h\.text\}>\{h\.text\}<\/FadeText><\/button>/],
  'direction-seeds': ['components/settings/DiscoverySettings.tsx', /<FadeText className="direction-seeds" label=/],
}

/**
 * Every text of several lines that ended in an ellipsis: the component, the markup that fades its last
 * line, and the measurement that finds where that line ends.
 */
const LINES: Record<string, [file: string, markup: RegExp, measure: RegExp]> = {
  '.idea-card-summary': ['routes/Ideas.tsx', /className=\{`idea-card-summary fade-lines\$\{summaryCut \? ' clipped' : ''\}`\}/,
    /useClipped\(summary, idea\.body, true\)/],
  '.highlight-card blockquote': ['components/reader/ReadingNotes.tsx', /<blockquote ref=\{quote\} className=\{`fade-lines\$\{quoteCut \? ' clipped' : ''\}`\}>/,
    /useClipped\(quote, highlight\.quote, true\)/],
  '.wkcard .wm': ['routes/Wiki.tsx', /className=\{`wm fade-lines\$\{summaryCut \? ' clipped' : ''\}`\}/, /useClipped\(summary, card\.summary, true\)/],
  '.wkcard--paper .tt-lines': ['routes/Wiki.tsx', /className=\{`tt-lines fade-lines\$\{titleCut \? ' clipped' : ''\}`\}/,
    /useClipped\(title, paper\.title, true\)/],
  '.paper-abstract.is-folded': ['components/paper/PaperAbstract.tsx',
    /className=\{`paper-abstract pabs\$\{shut \? ' is-folded fade-lines' : ''\}\$\{overflows \? ' clipped' : ''\}`\}/, /useClipped\(body, text, true\)/],
}

/** A box marked as cut off: FadeText's `clipped`, and `trunc`, which the paper table sets on a cell it measured cut. */
const CUT = /\.(clipped|trunc)\b/

/**
 * Every rule that keeps its text on one line and hides what overflows, by its selector: the selector of
 * the clipped-only fade that the same element carries, or why it never cuts text on screen.
 */
const ONE_LINE_CLIP: Record<string, { fade: string } | { never: string }> = {
  '.fade-text': { fade: '.fade-text.clipped' },
  '.ptable td .ci': { fade: '.ptable td.trunc:not(:hover) .ci:not(:has(.tagchip)):not(:focus-visible)' },
  // The text box of a needs-attention row is a FadeText; a record row's holds one that takes its width.
  '.attn-text': { never: 'a FadeText or holds one' },
  // Its segments are FadeTexts with a cap that shrink and fade first; only the fixed separators keep their width.
  '.crumb': { never: 'segments fade' },
  // The palette's title is for assistive technology only: a 1px box clipped away.
  '.cmdk-title': { never: 'visually hidden' },
  // A placeholder takes no mask of its own, and a mask on the field would fade the typed text and the caret too.
  '.cbox textarea::placeholder': { never: 'placeholder' },
  // Its column is as wide as the widest date chip in it, and the chip's own text is a FadeText.
  '.milestone-row>.plan-date-button': { never: 'fits its column' },
  // Its label is a FadeText that shrinks and fades; the fold button, folded count and priority keep their width.
  '.glrow': { never: 'label fades' },
  // Its title is a FadeText that fades; a one-day bar too short for its title draws it beside the bar.
  '.gbar': { never: 'title fades' },
  // Its content is a .ci that fades when the table marks the cell trunc, or chips that hide whole behind a count.
  '.ptable td': { never: 'content fades' },
}

describe('放不下的文字淡出,不以省略号结尾', () => {
  it('样式表里没有省略号,写明的例外除外', () => {
    const ellipses = RULES.filter(({ selector, body }) => /text-overflow:\s*ellipsis/.test(body) && !(selector in ELLIPSIS_EXEMPT))
    expect(ellipses.map(({ path, selector }) => `${path}  ${selector}`)).toEqual([])
  })

  it('原来以省略号结尾的一行文字都交给 FadeText,放不下才淡出', () => {
    const missing = Object.entries(ONE_LINE).filter(([, [file, markup, count = 1]]) => [...source(file).matchAll(new RegExp(markup, 'g'))].length !== count)
    expect(missing.map(([name]) => name)).toEqual([])
  })

  it('多行文字不再用 line-clamp 画省略号,而是放不下时在最后一行文字的末尾淡出', () => {
    expect(RULES.filter(({ body }) => /line-clamp/.test(body)).map(({ path, selector }) => `${path}  ${selector}`)).toEqual([])
    const fade = RULES.find(({ path, selector }) => path === 'components/FadeText.css' && selector === '.fade-lines.clipped')
    expect(fade?.body.replace(/\s+/g, '')).toBe('mask:linear-gradient(#000,#000)00/100%calc(100%-1lh)no-repeat,linear-gradient(toright,#000'
      + 'calc(var(--line-end,100%)-var(--clipfade-width)),transparentvar(--line-end,100%))0100%/100%1lhno-repeat')
    const missing = Object.entries(LINES).filter(([, [file, markup, measure]]) => !markup.test(source(file)) || !measure.test(source(file)))
    expect(missing.map(([selector]) => selector)).toEqual([])
  })

  it('总览列表的正文交给 FadeText,放得下时不淡出', () => {
    const own = RULES.filter(({ path, selector, body }) => path === 'routes/ResearchOverview.css' && /\.ovlist-main\b/.test(selector)
      && /(^|;)\s*mask(-image)?:/.test(body))
    expect(own.map(({ selector }) => selector)).toEqual([])
    expect(source('routes/ResearchOverview.tsx')).toMatch(/<FadeText className="ovlist-main"/)
  })

  it('文字只在放不下时淡出:每条给文字加遮罩的规则都只落在标明被切掉的元素上', () => {
    // A sticky cell's or head's pseudo-element fades the content under it, and [data-fade] fades a scroll area's edge.
    const masked = RULES.filter(({ selector, body }) => /(^|;)\s*(-webkit-)?mask(-image)?:(?!\s*none\s*(;|$))/.test(body)
      && !/::(before|after)|\[data-fade/.test(selector))
    const always = masked.filter(({ selector }) => selector.split(',').some((one) => !CUT.test(one)))
    expect(always.map(({ path, selector }) => `${path}  ${selector}`)).toEqual([])
  })

  it('只留一行、藏起溢出部分的规则都在放不下时淡出,或写明它在屏幕上切不到文字的原因', () => {
    const clips = RULES.filter(({ body }) => /(^|;)\s*overflow(-x)?:\s*hidden/.test(body) && /(^|;)\s*white-space:\s*nowrap/.test(body))
    expect(clips.filter(({ selector }) => !(selector in ONE_LINE_CLIP)).map(({ path, selector }) => `${path}  ${selector}`)).toEqual([])
    const fades = Object.entries(ONE_LINE_CLIP).flatMap(([selector, why]) => ('fade' in why ? [[selector, why.fade]] : []))
    const missing = fades.filter(([, fade]) => !RULES.some(({ selector, body }) => selector === fade && CUT.test(selector)
      && /(^|;)\s*mask(-image)?:\s*var\(--clipfade\)/.test(body)))
    expect(missing.map(([selector]) => selector)).toEqual([])
  })

  it('放不下的文字只有两种淡出:一行的用 --clipfade,多行的用共用的 .fade-lines', () => {
    // A sticky cell's or head's pseudo-element fades the content under it, and [data-fade] fades a scroll area's edge.
    const own = RULES.filter(({ selector, body }) => /(^|;)\s*mask(-image)?:/.test(body) && !/::(before|after)|\[data-fade/.test(selector))
    const other = own.filter(({ path, selector, body }) => !(path === 'components/FadeText.css' && selector === '.fade-lines.clipped')
      && !/(^|;)\s*mask(-image)?:\s*(var\(--clipfade\)|none)\s*(;|$)/.test(body))
    expect(other.map(({ path, selector }) => `${path}  ${selector}`)).toEqual([])
  })
})
