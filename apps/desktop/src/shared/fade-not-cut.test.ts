import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const source = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** Every stylesheet under the renderer, as paths relative to it. */
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.css'))

/** Each rule of every stylesheet as its file, its selector list and its body, comments dropped. */
const RULES = STYLESHEETS.flatMap((path) => [...source(path).replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ path, selector: selector!.trim().replace(/\s+/g, ' '), body: body! })))

/**
 * Every scroll area of the audit, by the selector of its stylesheet rule: each component on the way to
 * useScrollFade with the markup that passes the area on; the last one calls the hook.
 */
const FADED: Record<string, [file: string, markup: RegExp][]> = {
  '.sb-top': [['shell/Sidebar.tsx', /className="sb-top" ref=\{navFade\}/]],
  '.desk-body': [['components/PageShell.tsx', /ref=\{attach\} className=\{classes\('desk-body', className\)\}/]],
  '.set-body': [['routes/Settings.tsx', /className="set-body" ref=\{paneFade\}/]],
  '.set-side': [['routes/Settings.tsx', /className="set-side" ref=\{sideFade\}/]],
  '.structured-list--scrollable': [['components/StructuredList.tsx', /list\.current = node\n\s*fade\(node\)/]],
  '.modal-body': [['components/ModalDialog.tsx', /className="modal-body" ref=\{bodyFade\}/]],
  '.tblwrap': [['components/paper-table/PaperTable.tsx', /className="tblwrap" ref=\{tableFade\}/]],
  '.pdetail': [['components/paper-table/PaperTable.tsx', /className="pdetail" ref=\{detailFade\}/]],
  '.research-map': [['components/paper-table/ResearchMap.tsx', /className="research-map" ref=\{mapFade\}/]],
  '.paper-meta-list': [['components/PaperMetadata.tsx', /className="paper-meta-list" ref=\{listFade\}/]],
  '.reading-list': [['components/reader/ReadingNotes.tsx', /className="reading-list" ref=\{listFade\}/]],
  '.wiki-ingest': [['components/reader/PaperWikiIngest.tsx', /className="wiki-ingest" ref=\{ingestFade\}/]],
  // On the Chat and Feed screens the stream grows with its content inside the page body, which fades it.
  '.msgs': [['components/chat/PaperChat.tsx', /streamFade\(area\)[\s\S]*className="msgs" ref=\{stream\}/]],
  '.idea-detail-panel': [['routes/Ideas.tsx', /className="idea-detail-panel node-document-pane" ref=\{panelFade\}/]],
  '.wkside': [['routes/Wiki.tsx', /className="wkside" ref=\{railFade\}/]],
  '.cmpwrap': [['routes/Wiki.tsx', /className="cmpwrap" ref=\{wrapFade\}/]],
  '.gwrap': [['components/timeline/TimelineBoard.tsx', /className="gwrap" ref=\{wrapFade\}/]],
  '.cmdk-list': [['shell/CommandPalette.tsx', /className="cmdk-list" ref=\{listFade\}/]],
  '.pickhits': [['components/PickerPopover.tsx', /<Popover\.Content\s+ref=\{listFade\}/]],
  '.pickhits.cres': [['components/PickerPopover.tsx', /<Popover\.Content\s+ref=\{listFade\}/]],
  '.ctxmenu.choice-picker-menu': [
    ['components/FieldPickers.tsx', /contentClassName: 'ctxmenu choice-picker-menu', scrolls: true/],
    ['components/ActionMenu.tsx', /\{\.\.\.\(scrolls \? \{ ref: fade, 'data-fade-paint': '' \} : \{\}\)\}/],
  ],
  '.md pre': [['components/Markdown.tsx', /pre: \(\{ children \}\) => <Sideways as="pre">/]],
  '.md table': [['components/Markdown.tsx', /table: \(\{ children \}\) => <Sideways as="table">/]],
}

/** Scroll areas that never cut content off, and why. */
const EXEMPT: Record<string, string> = {
  // The reader's pages are sheets on the desk; a page reaching past the view is not a cut line of text.
  '.pdfwrap': 'reader pages',
  // Fading a text input would hide the caret and the selection at its edges.
  '.chat-composer .cm-scroller': 'text input',
  // The command wraps at any character, so nothing is ever hidden past its edges.
  '.extension-command-code': 'wraps',
}

/**
 * Every sticky element that content slides under, by the selector of its sticky rule: the rule that
 * makes it a scroll-state container, and the pseudo-element that fades the content while it is stuck.
 */
const STUCK: Record<string, [container: string, fade: string]> = {
  '.tblwrap .ptable thead th': ['.tblwrap .ptable thead th', '.tblwrap .ptable thead th:not(.column-drop-after)::after'],
  '.ptable th:first-child,.ptable td:first-child': ['.ptable :is(th,td):first-child', '.ptable :is(th,td):first-child::before'],
  '.ptable td.row-actions-cell,.tblwrap .ptable thead th.th-add': ['.ptable td.row-actions-cell', '.ptable :is(td.row-actions-cell,th.th-add)::before'],
  '.collapsible-group-head': ['.collapsible-group-head', '.collapsible-group-head::after'],
  '.node-document-pane .node-document-head': ['.node-document-pane .node-document-head', '.node-document-pane .node-document-head::after'],
  '.cmp th': ['.cmp th', '.cmp th::after'],
}

/** Sticky elements nothing slides under, and why. */
const UNDER_NOTHING: Record<string, string> = {
  // Both rails stand beside the content they pin next to, not over it.
  '.wkside': 'rail beside the page',
  '.idea-detail-slot': 'rail beside the board',
  // The layer that paints a fade over the edge of a scroll area.
  '[data-fade~="top"][data-fade-paint]::before,[data-fade~="bottom"][data-fade-paint]::after': 'the fade itself',
}

/** A 1px box-shadow in a separator colour, the hairline that stood in for a fade. */
const HAIRLINE = /box-shadow:[^;]*\b-?1px 0 0 var\(--sep2?\)|box-shadow:[^;]*\b0 -?1px 0 var\(--sep2?\)/

describe('滚动区和吸住的部分都淡出而不是硬切', () => {
  it('每个滚动区都在审计表里:要么交给 useScrollFade 淡出,要么写明为什么不会切掉内容', () => {
    const scrollers = RULES.filter(({ body }) => /overflow(-x|-y)?:\s*(auto|scroll)/.test(body)).map(({ selector }) => selector)
    expect(scrollers.filter((selector) => !(selector in FADED) && !(selector in EXEMPT))).toEqual([])
  })

  it('审计表里要淡出的每个滚动区都把元素交给 useScrollFade', () => {
    const missing = Object.entries(FADED).filter(([, places]) => places.some(([file, markup]) => !markup.test(source(file)))
      || !/useScrollFade\(/.test(source(places.at(-1)![0])))
    expect(missing.map(([selector]) => selector)).toEqual([])
  })

  it('滚动区和吸住的元素都不画代替淡出的细线,也不各自另画遮罩', () => {
    const sticky = RULES.filter(({ body }) => /position:\s*sticky/.test(body))
    const watched = RULES.filter(({ selector }) => selector in FADED).concat(sticky)
    expect(watched.filter(({ body }) => HAIRLINE.test(body) || /(^|;)\s*mask(-image)?:/.test(body))
      .map(({ path, selector }) => `${path}  ${selector}`)).toEqual([])
  })

  it('Wiki 的侧栏和项目节点面板的高度取自页面主体内的可见高度,不论窗口多高都止于页面主体之内', () => {
    const body = (path: string, selector: string) => RULES.filter((rule) => rule.path === path && rule.selector === selector)
      .map((rule) => rule.body).join(';')
    expect(body('routes/shell.css', '.wiki-body,.project-detail-body')).toMatch(/container-type:\s*size/)
    expect(source('routes/Wiki.tsx')).toMatch(/<PageBody className="wiki-body"[\s>]/)
    expect(source('routes/ProjectDetail.tsx')).toMatch(/<PageBody className="project-detail-body">/)
    expect(body('routes/shell.css', '.wkside')).toMatch(/max-height:\s*100cqh/)
    expect(body('routes/ProjectDetail.css', '.wkside.node-document-pane')).toMatch(/(^|;)\s*height:\s*100cqh/)
    for (const [path, selector] of [['routes/shell.css', '.wkside'], ['routes/ProjectDetail.css', '.wkside.node-document-pane']] as const) {
      expect(body(path, selector), selector).not.toMatch(/vh\b/)
    }
  })

  it('想法详情面板的高度取自页面主体内的可见高度,不论窗口多高都止于页面主体之内', () => {
    const body = (selector: string) => RULES.filter((rule) => rule.path === 'routes/Ideas.css' && rule.selector === selector)
      .map((rule) => rule.body).join(';')
    expect(body('.ideas-body')).toMatch(/container-type:\s*size/)
    for (const selector of ['.idea-detail-slot', '.idea-detail-panel']) {
      expect(body(selector), selector).toMatch(/max-height:\s*100cqh/)
      expect(body(selector), selector).not.toMatch(/vh\b/)
    }
  })

  it('内容会滑到下面的吸住元素,吸住时在自己的边上淡出内容', () => {
    const sticky = RULES.filter(({ body }) => /position:\s*sticky/.test(body)).map(({ selector }) => selector)
    expect(sticky.filter((selector) => !(selector in STUCK) && !(selector in UNDER_NOTHING))).toEqual([])
    const css = STYLESHEETS.map((path) => source(path)).join('\n')
    const fading = Object.entries(STUCK).filter(([, [container, fade]]) =>
      RULES.some(({ selector, body }) => selector.split(/,(?![^(]*\))/).includes(container) && /container-type:\s*scroll-state/.test(body))
      && css.includes(`{${fade}{opacity:1}}`) && /@container scroll-state\(stuck: (top|left|right)\)$/.test(css.slice(0, css.indexOf(`{${fade}{opacity:1}}`))))
    expect(fading.map(([selector]) => selector)).toEqual(Object.keys(STUCK))
  })
})
