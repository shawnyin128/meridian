import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every stylesheet and source under the renderer, as paths relative to it. */
const FILES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(css|tsx?)$/.test(path) && !/\.test\.tsx?$/.test(path))
const STYLESHEETS = FILES.filter((path) => path.endsWith('.css'))

/** Each rule of `path` as its selectors and its declarations, comments dropped. */
const rules = (path: string) => [...readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors!.split(',').map((s) => s.trim()),
  declarations: body!.split(';').map((d) => d.trim()).filter(Boolean),
}))

/** The states that may write text in the accent colour: a picked or current item, and a status icon. */
const ACCENT_TEXT_STATES = new Set([
  '.srow.on .ic', '.update-row .ic', '.directory-field-action:focus-visible', '.tag--accent',
  '.about-status.is-ready svg', '.about-status.is-checking svg', '.about-status.is-downloading svg', '.reader-rail button.on',
  '.icbtn[aria-pressed="true"]',
])

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

  it('不是链接的标签不用强调色写字,强调色的字只留给选中和状态', () => {
    const offenders = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, declarations }) => (
      declarations.some((d) => /^color:var\(--accent\)$/.test(d))
        ? selectors.filter((s) => !ACCENT_TEXT_STATES.has(s)).map((s) => `${path}  ${s}`)
        : []
    )))
    expect(offenders).toEqual([])
  })
})
