import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const source = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** Each rule of every screen stylesheet as its file and selector list, comments dropped. */
const SCREEN_RULES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.css') && !/^components\/[^/]+\.css$/.test(path) && path !== 'shell/tokens.css')
  .flatMap((path) => [...source(path).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map(([, selector]) => `${path}  ${selector!.trim().replace(/\s+/g, ' ')}`))

describe('阅读器和科研图的缩放是同一个控件', () => {
  it('两处都用共享的 ZoomControl，屏幕的样式表不再各画一份', () => {
    expect(['routes/Reader.tsx', 'components/project/ResearchGraph.tsx'].map((file) => /<ZoomControl\b/.test(source(file))))
      .toEqual([true, true])
    expect(SCREEN_RULES.filter((rule) => /\.(zoomctl|zoom-reset|graph-view-controls|graph-zoom-reset)(?![\w-])/.test(rule))).toEqual([])
  })
})

describe('总览的统计格是共享的 StatTile', () => {
  it('总览用 StatTile 画每一格，屏幕的样式表不再画统计格', () => {
    expect(/<StatTile\b/.test(source('routes/ResearchOverview.tsx'))).toBe(true)
    expect(SCREEN_RULES.filter((rule) => /\.ovstat(?![\w-])/.test(rule))).toEqual([])
  })
})
