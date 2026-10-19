// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

/** The parts of the jsdom window this test reads; the tsconfig of shared code carries no DOM types. */
type Node = object
type Window = {
  document: { head: { innerHTML: string }; body: { innerHTML: string }; querySelector(selector: string): Node }
  getComputedStyle(element: Node): {
    borderTopWidth: string; borderRadius: string; backgroundColor: string; boxShadow: string
  }
}
const { document, getComputedStyle } = globalThis as unknown as Window

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** The settings cards, the discovery directions panel and the upload progress card. */
const CARDS = [
  'appearance-settings-card', 'language-settings-card', 'storage-card', 'delivery-settings-card', 'service-card',
  'extension-settings-card', 'extension-tutorial', 'direction-panel', 'upcard',
]
/** The properties that make up a card's surface. */
const SURFACE = /^(border(-(top|right|bottom|left|color|width|style))?|border-radius|background(-color)?|box-shadow)$/

describe('卡片只有一种面', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${readFileSync(join(RENDERER, 'shell/tokens.css'), 'utf8')}${readFileSync(join(RENDERER, 'components/Card.css'), 'utf8')}</style>`
  })

  it('设置里的卡片、发现方向面板和上传进度卡不在各自的样式表里另画边框、圆角、底色或阴影', () => {
    const copies = readdirSync(RENDERER, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
      .map((entry) => relative(RENDERER, join(entry.parentPath, entry.name)))
      .filter((file) => file !== join('components', 'Card.css'))
      .flatMap((file) => {
        const css = readFileSync(join(RENDERER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selector, body]) => {
          const cards = selector!.split(',').map((part) => part.trim())
            .filter((part) => CARDS.some((name) => new RegExp(`\\.${name}$`).test(part)))
          const surface = body!.split(';').map((declaration) => declaration.split(':')[0]!.trim())
            .filter((property) => SURFACE.test(property))
          return cards.length > 0 && surface.length > 0 ? [`${file}: ${cards.join(', ')} { ${surface.join(' ')} }`] : []
        })
      })
    expect(copies).toEqual([])
  })

  it('卡片面是一圈细边、卡片圆角和卡片底色；浮在页面上的卡片换成浮层的底色，用阴影画边', () => {
    document.body.innerHTML = '<div class="card-surface"></div><div class="card-surface card-surface--floating"></div>'
    const card = getComputedStyle(document.querySelector('.card-surface'))
    expect([card.borderTopWidth, card.borderRadius, card.backgroundColor]).toEqual(['1px', 'var(--r-card)', 'var(--card)'])
    const floating = getComputedStyle(document.querySelector('.card-surface--floating'))
    expect([floating.borderTopWidth, floating.borderRadius, floating.backgroundColor, floating.boxShadow])
      .toEqual(['0px', 'var(--r-card)', 'var(--raised)', 'var(--sh-3)'])
  })
})
