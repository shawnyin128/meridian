import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every component, route and shell source under the renderer, tests excluded, as paths relative to it. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

/** A refocus written by hand: a draft's element searched for a field that then takes focus. */
const HAND_REFOCUS = /\.querySelector(?:<[^>]+>)?\([^)]*\)\??\.focus\(\)/g

describe('就地起草的开法只有一种', () => {
  it('新建按钮打开草稿、草稿开着时把光标送回去，只由 useDraftSlot 写一次，没有哪一页自己去找草稿里的输入框', () => {
    const copies = SOURCES.flatMap((path) => [...readFileSync(join(RENDERER, path), 'utf8').matchAll(HAND_REFOCUS)]
      .map((match) => `${path}: ${match[0]}`))
    expect(copies).toEqual([])
  })
})
