import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_COLOUR_THEMES, DEFAULT_COLOUR_THEME, contrastShortfalls, deriveColourTokens, deriveDarkModules,
} from './colour-theme.js'
import { ColourThemeSchema } from './contract.js'

/** The OKLab lightness and the OKLCH hue in degrees of a `#rrggbb` colour. */
const oklch = (hex: string): { L: number; hue: number } => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, hue: (Math.atan2(bb, a) * 180) / Math.PI }
}
const hue = (hex: string): number => oklch(hex).hue
const lightness = (hex: string): number => oklch(hex).L

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

describe('推导色跟着模块走', () => {
  it('浅色的警告浅底随警告色走:默认的警告色还是今天的浅黄,换成红色或蓝色,浅底也变成那个色调', () => {
    const tint = (warning: string) => deriveColourTokens({ ...DEFAULT_COLOUR_THEME.light, warning }, 'light')['--tint-warn']
    const channels = (rgba: string) => rgba.slice(5, -1).split(',').slice(0, 3).map(Number) as [number, number, number]
    expect(tint('#b8860b')).toBe('rgba(255,214,10,0.14)')
    const [r, g, b] = channels(tint('#c0392b'))
    expect(r > g && g > b, `红色警告色的浅底 ${tint('#c0392b')}`).toBe(true)
    const [r2, g2, b2] = channels(tint('#2f6fbf'))
    expect(b2 > g2 && g2 > r2, `蓝色警告色的浅底 ${tint('#2f6fbf')}`).toBe(true)
  })
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

describe('阅读高亮的对比度', () => {
  it('正文压在铺了阅读高亮的卡片上不到 4.5:1 时,对比度不足记在阅读高亮上;换回默认的黄色就没有', () => {
    const grey = { ...DEFAULT_COLOUR_THEME.light, ink: '#555555' }
    expect(contrastShortfalls(grey, 'light')).toEqual([])
    expect([...new Set(contrastShortfalls({ ...grey, highlight: '#000000' }, 'light').map((shortfall) => shortfall.module))])
      .toEqual(['highlight'])
  })
})

describe('由浅色生成深色', () => {
  const cinnabar = BUILT_IN_COLOUR_THEMES.find((theme) => theme.id === 'cinnabar')!

  for (const theme of BUILT_IN_COLOUR_THEMES) {
    it(`${theme.name}自己的浅色生成的深色就是它自己的深色`, () => {
      expect(deriveDarkModules(theme.light, theme)).toEqual(theme.dark)
    })
  }

  it('浅色里改过的主题色带到深色,色相跟着改;没改的模块还是基于的主题的深色', () => {
    const dark = deriveDarkModules({ ...cinnabar.light, accent: '#2f6fbf' }, cinnabar)
    expect(Math.abs(hue(dark.accent) - hue('#2f6fbf')), dark.accent).toBeLessThan(5)
    expect({ ...dark, accent: cinnabar.dark.accent }).toEqual(cinnabar.dark)
  })

  it('浅色里正文的明暗不带到深色:深色的三种文字保留基于的主题深色文字的明度,只有色相跟着浅色走', () => {
    expect(deriveDarkModules({ ...DEFAULT_COLOUR_THEME.light, ink: '#555555' }, DEFAULT_COLOUR_THEME).ink)
      .toBe(DEFAULT_COLOUR_THEME.dark.ink)
    const dark = deriveDarkModules({ ...cinnabar.light, inkSecondary: '#2a3f6b' }, cinnabar)
    expect(Math.abs(lightness(dark.inkSecondary) - lightness(cinnabar.dark.inkSecondary)), dark.inkSecondary).toBeLessThan(0.005)
    expect(Math.abs(hue(dark.inkSecondary) - hue('#2a3f6b')), dark.inkSecondary).toBeLessThan(5)
  })

  for (const theme of BUILT_IN_COLOUR_THEMES.slice(1)) {
    it(`以默认为基础,${theme.name}的浅色生成的深色达到每个对比度目标`, () => {
      expect(contrastShortfalls(deriveDarkModules(theme.light, DEFAULT_COLOUR_THEME), 'dark')).toEqual([])
    })
  }
})
