import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every stylesheet and source under the renderer, as paths relative to it. */
const FILES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(css|tsx?)$/.test(path) && !/\.test\.tsx?$/.test(path))
const STYLESHEETS = FILES.filter((path) => path.endsWith('.css'))

/**
 * The rules that write in the accent, each a selected or running state: the current sidebar row, the
 * picked segment, an on chip toggle, a list's selected row or card, the selected paper's title, the
 * selected highlight card, a checked menu item's mark and the running ring.
 */
const ACCENT_TEXT = [
  '.nav-row.on', '.segmented-control>button[data-state="on"]', '.chip-toggle[data-state="on"]', '.item--selected',
  '.table-row--selected>.table-cell--title', '.mi .ck', '.ring',
]

/** Each rule of `path` as its selectors and its declarations, comments dropped. */
const rules = (path: string) => [...readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors!.split(',').map((s) => s.trim()),
  declarations: body!.split(';').map((d) => d.trim()).filter(Boolean),
}))

describe('实体链接的样子', () => {
  it('不再有链接色:--link 既不定义也没人用', () => {
    expect(FILES.filter((path) => /--link\b/.test(readFileSync(join(RENDERER, path), 'utf8')))).toEqual([])
  })

  it('旧的链接类不再自己画颜色、下划线或指针,链接的样子只由 EntityLink 画', () => {
    const retired = /\.(wl|cite|wkclaim-link|node-tag|anc|about-link)(?![\w-])|#wktip/
    const offenders = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, declarations }) => {
      const drawn = declarations.filter((d) => /^(color|text-decoration|cursor|border-bottom|background)/.test(d))
      return drawn.length === 0 ? [] : selectors.filter((s) => retired.test(s)).map((s) => `${path}  ${s}`)
    }))
    expect(offenders).toEqual([])
  })

  it('强调色的字只标选中的和正在执行的:侧栏的当前行、选中的分段、开着的标签开关、列表里选中的行和卡片、选中的论文标题、选中的高亮卡片、勾和运行中的圈;链接、标签、计数和状态图标都不用', () => {
    const writers = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, declarations }) => (
      declarations.some((d) => /^color:var\(--accent[\w-]*\)$/.test(d)) ? selectors : []
    )))
    expect(writers.sort()).toEqual([...ACCENT_TEXT].sort())
  })

  it('链接和页码锚点的字跟着周围的字,悬停时是墨色,从不用强调色', () => {
    const link = rules('components/EntityLink.css')
    const colour = (selector: string) => link.find(({ selectors }) => selectors.includes(selector))?.declarations.find((d) => d.startsWith('color:'))
    expect([colour('.entity-link'), colour('.entity-link:hover')]).toEqual(['color:inherit', 'color:var(--ink)'])
    expect(readFileSync(join(RENDERER, 'components/SourceAnchor.tsx'), 'utf8')).toMatch(/className="entity-link source-anchor"/)
  })
})
