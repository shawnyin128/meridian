import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every selector of every renderer stylesheet with its rule body, as `path: selector`, comments removed. */
const SELECTORS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css'))
  .flatMap((path) => [...readFileSync(join(RENDERER, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .flatMap((match) => match[1]!.split(',').map((selector) => ({
      path, selector: selector.trim(), body: match[2]!,
    }))))

/** A selector that styles a row, a heading or a group label of a candidate list. */
const CANDIDATE = /\.rrow\b|\.pickhits li\b|\.(pickhits|sres|cres) \.r[hg]\b/

describe('菜单与候选列表的条目', () => {
  it('候选行只按当前行高亮,指针悬停不另画一行', () => {
    const hovered = SELECTORS
      .filter((rule) => CANDIDATE.test(rule.selector) && rule.selector.includes(':hover'))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(hovered).toEqual([])
  })

  it('候选行的高度、内边距、分隔线与高亮只来自共享的菜单条目规则', () => {
    const copies = SELECTORS
      .filter((rule) => rule.path !== join('routes', 'shell.css') && CANDIDATE.test(rule.selector)
        && /(^|;)\s*(padding|height|min-height|border-bottom|border-radius|background)\s*:/.test(rule.body))
      .map((rule) => `${rule.path}: ${rule.selector}`)
    expect(copies).toEqual([])
  })
})
