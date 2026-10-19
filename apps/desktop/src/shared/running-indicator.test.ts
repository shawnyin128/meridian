import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every renderer stylesheet as one string per file, comments removed. */
const SHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))
  .map((path) => ({ path, css: readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))

/** The names of the keyframes that turn something a full circle. */
const TURNS = SHEETS.flatMap(({ path, css }) => [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([^{}]*\{[^{}]*\})*[^{}]*\}/g)]
  .filter((match) => /rotate\(360deg\)/.test(match[0]))
  .map((match) => `${path}: ${match[1]}`))

describe('运行中的指示', () => {
  it('全 App 只有一种转圈，转一圈用 --t-spin', () => {
    expect(TURNS).toHaveLength(1)
    const name = TURNS[0]!.split(': ')[1]!
    const uses = SHEETS.flatMap(({ path, css }) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((match) => new RegExp(`animation:[^;]*\\b${name}\\b`).test(match[2]!))
      .map((match) => `${path}: ${match[1]!.trim()} { ${match[2]!.trim()} }`))
    expect(uses).toHaveLength(1)
    expect(uses[0]).toMatch(/animation:ringspin var\(--t-spin\) linear infinite/)
  })

  it('减少动态效果时没有哪处单独把它停下', () => {
    const stops = SHEETS.flatMap(({ path, css }) => [...css.matchAll(/@media \(prefers-reduced-motion:reduce\)\{([^{}]*\{[^{}]*\})*\}/g)]
      .filter((match) => /\.ring|spinner/.test(match[0]))
      .map((match) => `${path}: ${match[0]}`))
    expect(stops.filter((stop) => !stop.startsWith('shell/tokens.css'))).toEqual([])
  })
})
