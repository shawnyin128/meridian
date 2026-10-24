import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_COLOUR_THEMES, DEFAULT_COLOUR_THEME, contrastShortfalls, deriveColourTokens,
} from './colour-theme.js'
import { ColourThemeSchema } from './contract.js'

/** The OKLCH hue in degrees of a `#rrggbb` colour. */
const hue = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return (Math.atan2(bb, a) * 180) / Math.PI
}

describe('内置外观主题', () => {
  it('默认、朱漆、螺钿、秋叶、流霞按这个顺序排列,每个都是一份能读的主题文件', () => {
    expect(BUILT_IN_COLOUR_THEMES.map((theme) => [theme.id, theme.name]))
      .toEqual([['default', '默认'], ['cinnabar', '朱漆'], ['luodian', '螺钿'], ['chestnut', '秋叶'], ['xipi', '流霞']])
    for (const theme of BUILT_IN_COLOUR_THEMES) expect(ColourThemeSchema.parse(theme), theme.id).toEqual(theme)
  })

  for (const theme of BUILT_IN_COLOUR_THEMES) {
    it(`${theme.name}在浅色和深色下推导出的颜色都达到每个对比度目标`, () => {
      expect(contrastShortfalls(theme.light, 'light')).toEqual([])
      expect(contrastShortfalls(theme.dark, 'dark')).toEqual([])
    })
  }
})

describe('对比度不足', () => {
  const pale = { ...DEFAULT_COLOUR_THEME.light, ink: '#8a8a8a' }

  it('正文色太浅时,对比度不足只记在正文这个模块上', () => {
    expect([...new Set(contrastShortfalls(pale, 'light').map((shortfall) => shortfall.module))]).toEqual(['ink'])
  })

  it('警告色和浅正文混出的标签字达不到 4.5:1 时,推导只调暗警告色本身,色相不变', () => {
    const tokens = deriveColourTokens(pale, 'light')
    expect(tokens['--warn-text']).toMatch(/^#[0-9a-f]{6}$/)
    expect(Math.abs(hue(tokens['--warn-text']) - hue(pale.warning))).toBeLessThan(2)
    expect(contrastShortfalls(pale, 'light').filter((shortfall) => shortfall.module === 'warning')).toEqual([])
  })
})
