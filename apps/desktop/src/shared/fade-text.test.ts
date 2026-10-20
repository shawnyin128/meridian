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
  'idea-dialog-source': ['components/ideas/IdeaEditorDialog.tsx', /<FadeText className="idea-dialog-source" label=/],
  'idea-graph-dialog-idea': ['components/ideas/IdeaGraphDialog.tsx', /<FadeText className="idea-graph-dialog-idea" label=/],
  'cl': ['components/paper-table/ColumnMenu.tsx', /<FadeText className="cl" label=/g, 3],
  'read-state-filter': ['components/paper-table/PaperTable.tsx', /<FadeText>\{current \?\? name\}<\/FadeText><\/button>/],
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
})
