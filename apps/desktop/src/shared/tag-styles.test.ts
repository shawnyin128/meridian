import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every stylesheet under the renderer, as paths relative to it. */
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))

/**
 * The private chip, pill, badge and dot styles that became a Tag, a CountBadge or a StatusDot. Each is
 * a class that may still name an element, optionally inside a scope class, but no longer draws it.
 */
const RETIRED: { cls: string; scope?: string }[] = [
  { cls: 'storage-source' }, { cls: 'service-status-pill' }, { cls: 'extension-state' },
  { cls: 'n', scope: 'srow' }, { cls: 'n', scope: 'gxrow' }, { cls: 'review-entry-count' },
  { cls: 'collapsible-group-count' }, { cls: 'research-map-count' }, { cls: 'stchip' },
]

/** Properties that draw a tag: its fill, text colour, border, radius, padding and type. */
const LOOK = /^(background|color|border|padding|font|line-height)/

/** The last compound of a selector, the element it styles, with the arguments of :has() and the like dropped. */
const subject = (selector: string): string => {
  let flat = selector
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '')
  return flat.trim().split(/[\s>+~]+/).at(-1)!
}

const hasClass = (text: string, cls: string): boolean => new RegExp(`\\.${cls}(?![\\w-])`).test(text)

describe('标签、计数徽标和状态点', () => {
  it('收编进共享组件的旧 chip、pill、计数和点样式都不再自画填充、颜色、边框、圆角、内边距或字型', () => {
    const offenders = STYLESHEETS.flatMap((path) => {
      const css = readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body]) => {
        const drawn = body!.split(';').map((d) => d.slice(0, d.indexOf(':')).trim()).filter((p) => LOOK.test(p))
        if (drawn.length === 0) return []
        return selectors!.split(',').map((s) => s.trim())
          .filter((s) => RETIRED.some(({ cls, scope }) => hasClass(subject(s), cls) && (scope === undefined || hasClass(s, scope))))
          .map((s) => `${path}  ${s}  { ${drawn.join(', ')} }`)
      })
    })
    expect(offenders).toEqual([])
  })
})
