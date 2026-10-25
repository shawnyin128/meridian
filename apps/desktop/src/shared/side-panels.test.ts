// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Style = { whiteSpace: string; overflow: string; textOverflow: string; maskImage: string; overflowWrap: string }
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): object }
  getComputedStyle(element: object): Style
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const read = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** Every panel that opens beside a page body: the source that renders it and the class that places it. */
const PANELS: Record<string, [file: string, placement: string]> = {
  'paper detail': ['components/paper-table/PaperTable.tsx', 'paper-detail-slot'],
  'idea detail': ['routes/Ideas.tsx', 'idea-detail-panel'],
  'project detail': ['routes/ProjectDetail.tsx', 'project-detail-panel'],
  'reader metadata': ['components/reader/ReaderSidePanel.tsx', 'reader-meta'],
  'reader notes': ['components/reader/ReadingNotes.tsx', 'reading-notes'],
  'reader remark': ['components/reader/ReadingRemark.tsx', 'reading-remark'],
  'reader wiki': ['components/reader/PaperWikiIngest.tsx', 'wiki-ingest'],
}

/** Every panel head: the source that renders it. */
const HEADS: Record<string, string> = {
  paper: 'components/paper-table/PaperTable.tsx',
  task: 'components/project/ProjectPlan.tsx',
  idea: 'components/ideas/IdeaPanel.tsx',
  conclusion: 'components/project/ProjectConclusions.tsx',
  node: 'components/project/ResearchGraph.tsx',
}

/** Classes that place a panel, or did before SidePanel: their rules may place it but not size, draw or move it. */
const PANEL_CLASSES = [...Object.values(PANELS).map(([, placement]) => placement), 'detail-panel', 'detail-panel__content',
  'detail-panel--inline', 'detail-panel--overlay', 'detail-panel--resize', 'idea-detail-slot', 'node-document-pane', 'pdetail',
  'reader-side']

/** Declarations that give a panel its width, its surface or its motion. */
const OWN = /^(--detail-panel-(width|gap)|(min-|max-)?width|flex-basis|border(-[a-z-]+)?|background(-[a-z-]+)?|box-shadow|padding(-[a-z-]+)?|animation(-[a-z-]+)?|transition(-[a-z-]+)?|transform)$/
/** A `flex` shorthand that sets a basis length. */
const FLEX_LENGTH = /\d(px|%|vw|em|rem)/

const stylesheets = () => readdirSync(RENDERER, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
  .map((entry) => relative(RENDERER, join(entry.parentPath, entry.name)).split('\\').join('/'))
  .filter((file) => file !== 'components/SidePanel.css')

describe('侧面板只有一种', () => {
  it('每个在页面旁打开的面板都是共享的 SidePanel', () => {
    const handBuilt = Object.entries(PANELS)
      .filter(([, [file, placement]]) => !new RegExp(`<SidePanel\\b[^>]*className=\\{?["\`][^"\`]*\\b${placement}\\b`).test(read(file)))
      .map(([name, [file]]) => `${name}: ${file}`)
    expect(handBuilt).toEqual([])
  })

  it('每个面板头都是共享的 PanelHead,标题、动作和收起钮都由它摆放', () => {
    const handBuilt = Object.entries(HEADS).filter(([, file]) => !/<PanelHead\b/.test(read(file))).map(([name, file]) => `${name}: ${file}`)
    expect(handBuilt).toEqual([])
    const copies = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
      .filter((file) => /\bPanelClose\b|\bDetailPanel\b|className="(pd-h|[^"]*\bnode-document-head)\b/.test(read(file)))
    expect(copies).toEqual([])
  })

  it('面板的宽度、面和动效只在 SidePanel 里写一次,屏幕只摆放它', () => {
    const owned = stylesheets().flatMap((file) => [...read(file).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .flatMap(([, prelude, body]) => {
        const selectors = prelude!.split(',').map((part) => part.trim().replace(/\s+/g, ' '))
          .filter((selector) => {
            const subject = selector.split(/[\s>+~]+/).at(-1)!.replace(/:not\([^)]*\)/g, '')
            return PANEL_CLASSES.some((name) => new RegExp(`\\.${name}(?![\\w-])`).test(subject))
          })
        const declared = body!.split(';').map((declaration) => declaration.split(':').map((part) => part.trim()))
          .filter(([property, value]) => property !== undefined && value !== undefined
            && (OWN.test(property) || (property === 'flex' && FLEX_LENGTH.test(value))))
          .map(([property, value]) => `${property}:${value}`)
        return selectors.length > 0 && declared.length > 0 ? [`${file}: ${selectors.join(', ')} { ${declared.join('; ')} }`] : []
      }))
    expect(owned).toEqual([])
  })

  it('面板头的标题放不下时换行,整段露出,不淡出也不截断', () => {
    document.head.innerHTML = `<style>${['shell/tokens.css', ...stylesheets(), 'components/SidePanel.css'].map(read).join('\n')}</style>`
    document.body.innerHTML = Object.values(PANELS).map(([, placement]) => `<aside class="side-panel ${placement}">`
      + `<div class="side-panel-content"><header class="panel-head"><div class="panel-head-title">${placement}</div></header></div></aside>`).join('')
    const looks = Object.values(PANELS).map(([, placement]) => {
      const title = getComputedStyle(document.querySelector(`.${placement} .panel-head-title`))
      return [title.whiteSpace, title.overflow, title.textOverflow, title.maskImage, title.overflowWrap].join(' | ')
    })
    // No stylesheet keeps the title on one line or hides what overflows; it breaks anywhere rather than run out of the head.
    expect(new Set(looks)).toEqual(new Set([' |  | clip | none | anywhere']))
  })
})
