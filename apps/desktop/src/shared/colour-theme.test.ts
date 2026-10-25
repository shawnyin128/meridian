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

  it('就地提示的四种语气的字都按中性框底检查:窗口底和画布一明一暗、哪种亮度都不够时,框底上的不足照样报出来', () => {
    const split = { ...DEFAULT_COLOUR_THEME.light, sidebar: '#000000' }
    const onBox = contrastShortfalls(split, 'light')
      .filter(({ ground }) => ground.join(' + ') === '--window + --sidebar + --tint-mut').map(({ fg }) => fg)
    expect(onBox.sort()).toEqual(['--bad-text', '--good-text', '--sec', '--warn-text'])
  })

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

describe('自定义主题的强调色', () => {
  /** An opaque or translucent sRGB colour of a derived token: `#rrggbb`, `rgba()` or `color-mix(in srgb,#x p%,#y)`. */
  const parse = (value: string): { r: number; g: number; b: number; a: number } => {
    const mix = /^color-mix\(in srgb,(#[0-9a-f]{6}) (\d+)%,(#[0-9a-f]{6})\)$/.exec(value)
    if (mix) {
      const [x, y, p] = [parse(mix[1]!), parse(mix[3]!), Number(mix[2]) / 100]
      return { r: x.r * p + y.r * (1 - p), g: x.g * p + y.g * (1 - p), b: x.b * p + y.b * (1 - p), a: 1 }
    }
    const rgba = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(value)
    if (rgba) return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: Number(rgba[4]) }
    return { r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16), a: 1 }
  }
  const linear = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  /** The WCAG ratio of token `fg` over the bottom-to-top stack `ground` of `tokens`. */
  const ratio = (tokens: Record<string, string>, fg: string, ground: string[]) => {
    const flat = ground.map((name) => parse(tokens[name]!)).reduce((below, above) => ({
      r: above.r * above.a + below.r * (1 - above.a), g: above.g * above.a + below.g * (1 - above.a),
      b: above.b * above.a + below.b * (1 - above.a), a: 1,
    }))
    const [high, low] = [luminance(parse(tokens[fg]!)), luminance(flat)].sort((x, y) => y - x) as [number, number]
    return (high + 0.05) / (low + 0.05)
  }
  /** A dark custom theme whose accent, the cinnabar theme's dark one on today's dark surfaces, is too dim for marks on hovered rows. */
  const dim = { ...DEFAULT_COLOUR_THEME.dark, accent: '#b35041' }

  it('自定义主题也在运行时推导出勾和运行中的圈的记号色:强调色在悬停的行上不到 3:1 时提亮到 3:1,色相不变;够亮时就是强调色本身', () => {
    const tokens = deriveColourTokens(dim, 'dark')
    expect(ratio({ ...tokens, '--mark': dim.accent }, '--mark', ['--card', '--hover'])).toBeLessThan(3)
    for (const ground of [['--card', '--hover'], ['--raised', '--hover'], ['--card', '--accent-soft', '--hover'], ['--window', '--sidebar', '--accent-soft', '--hover']]) {
      expect(ratio(tokens, '--accent-mark', ground), ground.join(' + ')).toBeGreaterThanOrEqual(3)
    }
    expect(Math.abs(hue(tokens['--accent-mark']!) - hue(dim.accent)), tokens['--accent-mark']).toBeLessThan(5)
    expect(deriveColourTokens(DEFAULT_COLOUR_THEME.light, 'light')['--accent-mark']).toBe(DEFAULT_COLOUR_THEME.light.accent)
  })

  it('自定义主题的强调色的字在选中的行、卡片和标签开关上,静止和悬停时都不低于 4.5:1', () => {
    const tokens = deriveColourTokens(dim, 'dark')
    for (const surface of ['--content', '--card', '--raised']) {
      for (const ground of [[surface, '--accent-soft'], [surface, '--accent-soft', '--hover']]) {
        expect(ratio(tokens, '--accent-text', ground), ground.join(' + ')).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(contrastShortfalls(dim, 'dark').filter(({ fg }) => fg === '--accent-text' || fg === '--accent-mark')).toEqual([])
  })
})
