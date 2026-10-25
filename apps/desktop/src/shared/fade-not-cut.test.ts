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

/** The last step of every area that ScrollArea draws: it hands its element to useScrollFade. */
const SCROLL_AREA: [file: string, markup: RegExp][] = [['components/ScrollArea.tsx', /const fade = useScrollFade<HTMLDivElement>\(axis\)/]]

/**
 * Every scroll area of the audit, by the selector of its stylesheet rule: each component on the way to
 * useScrollFade with the markup that passes the area on; the last one calls the hook.
 */
const FADED: Record<string, [file: string, markup: RegExp][]> = {
  '.scroll-area--y': [['components/ScrollArea.tsx', /const fade = useScrollFade<HTMLDivElement>\(axis\)/]],
  '.scroll-area--x': [['components/ScrollArea.tsx', /const fade = useScrollFade<HTMLDivElement>\(axis\)/]],
  '.scroll-area--both': [['components/ScrollArea.tsx', /const fade = useScrollFade<HTMLDivElement>\(axis\)/]],
  '.nav-pane-rows': [['components/NavPane.tsx', /<ScrollArea axis="y" fill gutter className="nav-pane-rows">/], ...SCROLL_AREA],
  '.desk-body': [['components/PageShell.tsx', /<ScrollArea axis="y" fill gutter paint ref=\{ref\} className=\{classes\(own, className\)\}/], ...SCROLL_AREA],
  '.set-body': [['routes/Settings.tsx', /className="set-body" ref=\{paneFade\}/]],
  '.set-side': [['routes/Settings.tsx', /className="set-side" ref=\{sideFade\}/]],
  '.list--scrollable': [['components/List.tsx', /list\.current = node\n\s*fade\(node\)/]],
  '.list--fill': [['components/List.tsx', /list\.current = node\n\s*fade\(node\)/]],
  '.list-column': [['components/List.tsx', /<div ref=\{fade\} className=\{`list-column/]],
  '.modal-body': [['components/ModalDialog.tsx', /className="modal-body" ref=\{bodyFade\}/]],
  '.tblwrap': [['components/paper-table/PaperTable.tsx', /className="tblwrap" ref=\{tableFade\}/]],
  '.pdetail': [['components/paper-table/PaperTable.tsx', /className="pdetail" ref=\{detailFade\}/]],
  '.paper-meta-list': [['components/PaperMetadata.tsx', /className="paper-meta-list" ref=\{listFade\}/]],
  '.reading-list': [['components/reader/ReadingNotes.tsx', /<ScrollArea axis="y" fill>\s*<div className="reading-list">/], ...SCROLL_AREA],
  '.wiki-ingest-body': [['components/reader/PaperWikiIngest.tsx', /<ScrollArea axis="y" fill>\s*<div className="wiki-ingest-body">/], ...SCROLL_AREA],
  // Only the paper chat's stream scrolls; on the Chat and Feed screens it grows inside the page body, which fades it.
  '.paper-chat .msgs': [['components/chat/PaperChat.tsx', /<ScrollArea axis="y" fill ref=\{followRef\}>\s*<div className="msgs">/], ...SCROLL_AREA],
  '.idea-detail-panel': [['routes/Ideas.tsx', /className="idea-detail-panel node-document-pane" ref=\{panelFade\}/]],
  '.wkside': [['routes/Wiki.tsx', /className="wkside" ref=\{railFade\}/]],
  '.cmpwrap': [['routes/Wiki.tsx', /className="cmpwrap" ref=\{wrapFade\}/]],
  '.gwrap': [['components/timeline/TimelineBoard.tsx', /<ScrollArea axis="x" fill className="gwrap" ref=\{wrap\}>/], ...SCROLL_AREA],
  '.cmdk-list': [['shell/CommandPalette.tsx', /<ScrollArea axis="y" className="cmdk-list" ref=\{list\}>/], ...SCROLL_AREA],
  '.pickhits': [['components/PickerPopover.tsx', /<Popover\.Content\s+ref=\{listFade\}/]],
  '.pickhits--tall': [['components/PickerPopover.tsx', /<Popover\.Content\s+ref=\{listFade\}/]],
  '.ctxmenu.choice-picker-menu': [
    ['components/FieldPickers.tsx', /contentClassName: 'choice-picker-menu', scrolls: true/],
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

const PAPER_TABLE = 'components/paper-table/PaperTable.tsx'
/**
 * Every sticky element that content slides under, by the selector of its sticky rule: the markup that
 * names the edges it sticks to in data-stuck-fade, for the one stuck fade of ScrollArea.css.
 */
const STUCK: Record<string, [file: string, markup: RegExp][]> = {
  '.tblwrap .ptable thead th': [
    [PAPER_TABLE, /<th data-k="title" data-stuck-fade="top left"/],
    [PAPER_TABLE, /data-stuck-fade=\{columnDrop\?\.key === c\.k && columnDrop\.after \? undefined : 'top'\}/],
    ['components/paper-table/ColumnAdd.tsx', /<th className="th-new" ref=\{cell\} data-stuck-fade="top">/],
    [PAPER_TABLE, /<th className="th-add" data-stuck-fade="top right">/],
  ],
  '.ptable th:first-child,.ptable td:first-child': [
    [PAPER_TABLE, /<th data-k="title" data-stuck-fade="top left"/], [PAPER_TABLE, /<td className="pt-title" data-stuck-fade="left">/],
  ],
  '.ptable td.row-actions-cell,.tblwrap .ptable thead th.th-add': [
    [PAPER_TABLE, /<td className="row-actions-cell" data-stuck-fade="right">/], [PAPER_TABLE, /<th className="th-add" data-stuck-fade="top right">/],
  ],
  '.collapsible-group-head': [['components/CollapsibleGroup.tsx', /className="collapsible-group-head" \{\.\.\.\(variant === 'quiet' \? \{\} : \{ 'data-stuck-fade': 'top' \}\)\}/]],
  '.node-document-pane .node-document-head': ['project/ResearchGraph', 'project/ProjectConclusions', 'ideas/IdeaPanel', 'project/ProjectPlan']
    .map((name) => [`components/${name}.tsx`, /className="[\w -]*node-document-head" data-stuck-fade="top"/]),
  '.cmp th': [['routes/Wiki.tsx', /<th data-stuck-fade="top">\{m\.wiki\.paperKind\}<\/th>\n\s*\{agg\.columns\.map\(\(c\) => <th key=\{c\.key\} data-stuck-fade="top">/]],
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
      || !/useScrollFade(<\w+>)?\(/.test(source(places.at(-1)![0])))
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
    expect(source('routes/ProjectDetail.tsx')).toMatch(/<PageBody className="project-detail-body"[\s>]/)
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
    expect(Object.entries(STUCK).filter(([, places]) => places.some(([file, markup]) => !markup.test(source(file))))
      .map(([selector]) => selector)).toEqual([])
    const css = source('components/ScrollArea.css')
    expect(css).toContain('[data-stuck-fade]{container-type:scroll-state}')
    for (const [edge, pseudo] of [['top', 'after'], ['left', 'before'], ['right', 'before']]) {
      expect(css, edge).toContain(`@container scroll-state(stuck: ${edge}){[data-stuck-fade~="${edge}"]::${pseudo}{opacity:1}}`)
    }
  })

  it('吸住时的淡出只有一条规则，别的样式表不各自再写一份', () => {
    expect([...new Set(RULES.filter(({ body }) => /container-type:\s*scroll-state/.test(body)).map(({ path }) => path))])
      .toEqual(['components/ScrollArea.css'])
  })
})
