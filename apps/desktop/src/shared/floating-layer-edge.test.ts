import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every rule of every renderer stylesheet, as `path: selector{body}`, comments removed. */
const RULES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))
  .flatMap((path) => [...readFileSync(join(RENDERER, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ where: `${path}: ${match[1]!.trim()}`, body: match[2]! })))

describe('浮层的边', () => {
  it('用 --sh-2 或 --sh-3 的浮层不再自画边框,边只来自阴影里的那一圈', () => {
    const framed = RULES
      .filter((rule) => /box-shadow:var\(--sh-[23]\)/.test(rule.body) && /(^|;)\s*border(-color)?:/.test(rule.body))
      .map((rule) => rule.where)
    expect(framed).toEqual([])
  })
})
