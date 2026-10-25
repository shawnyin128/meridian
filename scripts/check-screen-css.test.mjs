import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RATCHET, parseRatchet, ratchetDiff, ratchetEntry, ratchetKey, rendererFiles, screenViolations, stylesheetLayer,
} from './check-screen-css.mjs'

const files = (entries) => new Map(Object.entries(entries))
const check = (entries) => screenViolations(files(entries)).map(ratchetEntry)

describe('屏幕样式表只摆放共享组件', () => {
  it('颜色、底色、边框、圆角、阴影、内外边距、字体、透明度和动效都算违规，带文件、行号、选择器和属性', () => {
    const found = screenViolations(files({
      'routes/Feed.css': [
        '.feed-entry{',
        '  color:var(--ink);background:var(--card);',
        '  border:1px solid var(--sep);border-radius:var(--r-card);box-shadow:var(--sh-1);outline:0;',
        '  padding:var(--sp-12) var(--sp-16);margin-bottom:var(--sp-12);',
        '  font-size:var(--fs-sm);line-height:var(--lh-ui);white-space:nowrap;',
        '  opacity:.5;transition:opacity var(--t) var(--e-out);cursor:pointer;--entry-w:var(--sp-24)}',
      ].join('\n'),
    }))
    expect(found.map(ratchetEntry)).toEqual([
      'routes/Feed.css:2: .feed-entry { color }',
      'routes/Feed.css:2: .feed-entry { background }',
      'routes/Feed.css:3: .feed-entry { border }',
      'routes/Feed.css:3: .feed-entry { border-radius }',
      'routes/Feed.css:3: .feed-entry { box-shadow }',
      'routes/Feed.css:3: .feed-entry { outline }',
      'routes/Feed.css:4: .feed-entry { padding }',
      'routes/Feed.css:4: .feed-entry { margin-bottom }',
      'routes/Feed.css:5: .feed-entry { font-size }',
      'routes/Feed.css:5: .feed-entry { line-height }',
      'routes/Feed.css:5: .feed-entry { white-space }',
      'routes/Feed.css:6: .feed-entry { opacity }',
      'routes/Feed.css:6: .feed-entry { transition }',
      'routes/Feed.css:6: .feed-entry { cursor }',
      'routes/Feed.css:6: .feed-entry { --entry-w }',
    ])
    expect([...new Set(found.map((violation) => violation.group))]).toEqual([
      'colour and background', 'border, outline, radius and shadow', 'padding and margin', 'font and text',
      'opacity, motion and effects', 'other', 'custom property',
    ])
  })

  it('只做摆放的屏幕样式表通过：网格和弹性布局、取 token 的宽高和间距、定位、容器和容器查询里隐藏整列', () => {
    expect(check({
      'components/project/ProjectPlan.css': [
        '.project-plan{display:grid;grid-template-columns:minmax(0,1fr) var(--detailw);grid-template-areas:"list panel";',
        '  gap:var(--sp-16) var(--sp-24);grid-auto-flow:row}',
        '.project-plan-list{grid-area:list;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start}',
        '.project-plan-panel{position:sticky;top:0;order:2;flex:0 0 auto;width:var(--detailw);max-height:100%;z-index:1;align-self:start}',
        '.project-plan-wrap{container-type:inline-size;container-name:plan;place-items:start;inset:0;left:50%}',
        '@container plan (max-width:720px){.project-plan{grid-template-columns:minmax(0,1fr)}.project-plan-panel{display:none}}',
      ].join('\n'),
    })).toEqual([])
  })

  it('宽高、间距、偏移和网格轨道写死长度算违规；0、百分比、fr、视口单位、关键字和不带回退值的 var() 不算', () => {
    expect(check({
      'routes/Ideas.css': [
        '.idea-grid{gap:12px;width:240px;grid-template-columns:88px 1fr;top:4px;flex:0 0 200px}',
        '.idea-side{width:var(--w,320px);min-height:calc(100% - 2px);max-width:60ch}',
        '.idea-ok{width:100%;height:50vh;max-width:none;min-width:0;flex:1;grid-template-columns:repeat(2,minmax(0,1fr));row-gap:0}',
      ].join('\n'),
    })).toEqual([
      'routes/Ideas.css:1: .idea-grid { gap }',
      'routes/Ideas.css:1: .idea-grid { width }',
      'routes/Ideas.css:1: .idea-grid { grid-template-columns }',
      'routes/Ideas.css:1: .idea-grid { top }',
      'routes/Ideas.css:1: .idea-grid { flex }',
      'routes/Ideas.css:2: .idea-side { width }',
      'routes/Ideas.css:2: .idea-side { min-height }',
      'routes/Ideas.css:2: .idea-side { max-width }',
    ])
  })

  it('悬停、焦点、按下和 aria-*、data-state 这类状态下的规则整条算违规，哪怕只是摆放；结构伪类不算状态', () => {
    expect(check({
      'routes/Trash.css': [
        '.trash-row:hover .trash-actions{display:flex}',
        '.trash-row:focus-within{grid-column:2}',
        '.trash-tab[aria-selected="true"]{order:-1}',
        '.trash-menu[data-state="open"]{z-index:2}',
        '.trash-row:not(:disabled){width:100%}',
        '.trash-row:first-child,.trash-row:nth-child(2n){grid-row:1}',
        '.trash-row:active{flex:1}',
      ].join('\n'),
    })).toEqual([
      'routes/Trash.css:1: .trash-row:hover .trash-actions { display }',
      'routes/Trash.css:2: .trash-row:focus-within { grid-column }',
      'routes/Trash.css:3: .trash-tab[aria-selected="true"] { order }',
      'routes/Trash.css:4: .trash-menu[data-state="open"] { z-index }',
      'routes/Trash.css:5: .trash-row:not(:disabled) { width }',
      'routes/Trash.css:7: .trash-row:active { flex }',
    ])
  })

  it('伪元素和 @keyframes 里的声明整条算违规', () => {
    expect(check({
      'components/timeline/TimelineBoard.css': '.today::after{position:absolute;inset:0}\n@keyframes pulse{from{opacity:0}to{width:100%}}\n.lane:before{content:""}',
    })).toEqual([
      'components/timeline/TimelineBoard.css:1: .today::after { position }',
      'components/timeline/TimelineBoard.css:1: .today::after { inset }',
      'components/timeline/TimelineBoard.css:2: @keyframes pulse from { opacity }',
      'components/timeline/TimelineBoard.css:2: @keyframes pulse to { width }',
      'components/timeline/TimelineBoard.css:3: .lane:before { content }',
    ])
  })

  it('display 只能是 grid 或 flex；display:none 只在容器查询里允许，媒体查询里不行', () => {
    expect(check({
      'routes/Wiki.css': [
        '.wk-a{display:block}',
        '.wk-b{display:none}',
        '@media (max-width:900px){.wk-c{display:none}}',
        '@container (max-width:900px){.wk-d{display:none}}',
        '.wk-e{display:inline-grid}.wk-f{display:inline-flex}',
      ].join('\n'),
    })).toEqual([
      'routes/Wiki.css:1: .wk-a { display }',
      'routes/Wiki.css:2: .wk-b { display }',
      'routes/Wiki.css:3: @media (max-width:900px) .wk-c { display }',
    ])
  })

  it('以共享组件的类为目标的规则只能摆放它：改它的 display、gap、对齐或内部网格都算违规；共享样式表里的祖先类和排在后面的修饰类不算', () => {
    expect(check({
      'components/StructuredList.css': '.structured-list{border:1px solid var(--sep)}\n.structured-row{display:flex;gap:var(--sp-8)}',
      'components/Notice.css': '.main.sbhide>.notice-host{left:0}\n.notice-host.is-open{opacity:1}',
      'components/StructuredList.tsx': 'export function StructuredRow() { return <div className="structured-row-title" /> }',
      'routes/Projects.css': [
        '.projects .structured-row{display:grid;gap:var(--sp-4);grid-column:1 / -1;order:1;width:100%}',
        '.projects .structured-row-title{align-self:center;justify-content:end}',
        '.projects>.structured-list{grid-area:list;position:relative}',
        '.structured-row .project-meta{display:flex;gap:var(--sp-4)}',
        '.projects :is(.structured-list){flex-direction:column}',
        '.projects .project-x:not(.structured-row){display:flex}',
        '.projects .project-y:has(.structured-row){display:flex}',
        '.main{display:flex}',
        '.project-tab.is-open{display:flex}',
        '.notice-host.project-notice{gap:var(--sp-4)}',
      ].join('\n'),
    })).toEqual([
      'routes/Projects.css:1: .projects .structured-row { display }',
      'routes/Projects.css:1: .projects .structured-row { gap }',
      'routes/Projects.css:2: .projects .structured-row-title { justify-content }',
      'routes/Projects.css:5: .projects :is(.structured-list) { flex-direction }',
      'routes/Projects.css:10: .notice-host.project-notice { gap }',
    ])
  })

  it('屏幕经 className 交给共享组件的类也算共享组件的类；交给功能组件或原生元素的不算', () => {
    expect(check({
      'components/StructuredList.tsx': 'export function StructuredRow({ className }) { return <div className={`structured-row ${className}`} /> }',
      'routes/Settings.tsx': [
        "import { StructuredRow } from '../components/StructuredList'",
        "import { ServiceCard } from '../components/settings/ServiceCard'",
        'export const A = () => <><StructuredRow className="wrow" contentClassName="wrow-body" /><ServiceCard className="svc" /><div className="plain" /></>',
      ].join('\n'),
      'components/settings/ApiOverview.tsx': [
        "import * as List from '../StructuredList'",
        "export const B = (on) => <List.StructuredRow className={on ? 'api-row api-row--on' : 'api-row'} />",
      ].join('\n'),
      'routes/Settings.css': '.wrow{display:flex}\n.svc{display:flex}\n.plain{display:flex}\n.api-row--on{gap:var(--sp-8)}\n.wrow-body{display:grid}',
    })).toEqual([
      'routes/Settings.css:1: .wrow { display }',
      'routes/Settings.css:4: .api-row--on { gap }',
      'routes/Settings.css:5: .wrow-body { display }',
    ])
  })

  it('components/ 下一层和 tokens.css 是共享样式表，不查；routes/、components/<功能>/ 和 shell/AppShell.css 是屏幕样式表', () => {
    expect([
      'components/Tag.css', 'shell/tokens.css', 'routes/shell.css', 'components/wiki/WikiTidy.css', 'shell/AppShell.css',
      'components/paper-table/PaperTable.css', 'routes/Feed.tsx',
    ].map(stylesheetLayer)).toEqual(['shared', 'shared', 'screen', 'screen', 'screen', 'screen', null])
    expect(check({
      'components/Tag.css': '.tag{padding:var(--sp-2) var(--sp-8);color:var(--sec)}',
      'shell/tokens.css': 'body{margin:0;color:var(--ink)}',
      'shell/AppShell.css': '.titlebar{background:var(--sidebar)}',
    })).toEqual(['shell/AppShell.css:1: .titlebar { background }'])
  })

  it('注释里的声明不算；@media 和 @supports 里的照查，条目带上它们；选择器列表一条选择器一条', () => {
    expect(check({
      'routes/Reader.css': [
        '/* .old{color:red} */',
        '.reader{display:grid;/* padding:9px */}',
        '@media (min-width:1600px){',
        '  .reader-pane{margin:0 auto}',
        '}',
        '@supports (display:grid){.reader-x,',
        '.reader-y{color:var(--ink)}}',
      ].join('\n'),
    })).toEqual([
      'routes/Reader.css:4: @media (min-width:1600px) .reader-pane { margin }',
      'routes/Reader.css:7: @supports (display:grid) .reader-x { color }',
      'routes/Reader.css:7: @supports (display:grid) .reader-y { color }',
    ])
  })
})

describe('屏幕样式表违规清单只减不增', () => {
  const listed = ['routes/Feed.css:1: .feed { color }', 'routes/Feed.css:1: .feed { padding }']

  it('清单里已经修掉的违规让棘轮失败', () => {
    const fixed = check({ 'routes/Feed.css': '.feed{color:var(--ink)}' })
    expect(ratchetDiff(fixed, listed)).toEqual({ added: [], fixed: ['routes/Feed.css:1: .feed { padding }'] })
  })

  it('清单之外的新违规让棘轮失败', () => {
    const grown = check({ 'routes/Feed.css': '.feed{color:var(--ink);padding:var(--sp-8)}\n.feed-x{font-size:var(--fs-sm)}' })
    expect(ratchetDiff(grown, listed)).toEqual({ added: ['routes/Feed.css:2: .feed-x { font-size }'], fixed: [] })
  })

  it('现状和清单一致时通过；只是行号移动时，去掉行号后也一致', () => {
    expect(ratchetDiff(check({ 'routes/Feed.css': '.feed{color:var(--ink);padding:var(--sp-8)}' }), listed))
      .toEqual({ added: [], fixed: [] })
    const moved = check({ 'routes/Feed.css': '\n\n.feed{color:var(--ink);padding:var(--sp-8)}' })
    expect(ratchetDiff(moved, listed).fixed).toHaveLength(2)
    expect(ratchetDiff(moved.map(ratchetKey), listed.map(ratchetKey))).toEqual({ added: [], fixed: [] })
  })

  it('清单文件里的空行和 # 注释不算条目', () => {
    expect(parseRatchet('# header\r\n\r\nroutes/Feed.css:1: .feed { color }\r\n')).toEqual(['routes/Feed.css:1: .feed { color }'])
  })
})

describe('屏幕样式表守卫', () => {
  const found = screenViolations(rendererFiles()).map(ratchetEntry)
  const { added, fixed } = ratchetDiff(found, parseRatchet(fs.readFileSync(RATCHET, 'utf8')))
  console.log(`Screen stylesheets hold ${found.length} declarations that are not placement, listed in ${path.basename(RATCHET)}.`)

  it('屏幕样式表没有清单之外的新视觉声明', () => {
    expect(added).toEqual([])
  })

  it('清单里的每一条都还在：修掉的违规从清单里删掉', () => {
    expect(fixed).toEqual([])
  })
})
