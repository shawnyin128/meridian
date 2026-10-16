import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every stylesheet under the renderer, as paths relative to it. */
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))

/** Tells whether a selector puts `:has()` inside the argument of another `:has()`. */
const nestsHas = (selector: string): boolean => {
  // One entry per unclosed parenthesis: whether it opened a :has().
  const open: boolean[] = []
  for (let at = 0; at < selector.length; at++) {
    if (selector.startsWith(':has(', at)) {
      if (open.includes(true)) return true
      open.push(true)
      at += ':has('.length - 1
    } else if (selector[at] === '(') open.push(false)
    else if (selector[at] === ')') open.pop()
  }
  return false
}

describe('渲染层样式表的选择器', () => {
  it('没有一条在 :has() 里再套 :has(),Chromium 会把这样的整条规则丢掉', () => {
    const offenders = STYLESHEETS.flatMap((path) => readFileSync(join(RENDERER, path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Cutting at braces leaves selectors, at-rule preludes and declaration blocks; only a selector holds :has().
      .split(/[{}]/)
      .filter(nestsHas)
      .map((selector) => `${path}  ${selector.trim()}`))
    expect(offenders).toEqual([])
  })
})
