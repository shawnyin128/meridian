import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(new URL('../renderer/shell/tokens.css', import.meta.url), 'utf8')

/** An sRGB color with alpha; `a` equal to 1 is opaque. */
type Colour = { r: number; g: number; b: number; a: number }

/** A contrast case: foreground token, bottom-to-top background token stack, and required ratio. */
type Pair = { theme: 'light' | 'dark'; label: string; fg: string; ground: string[]; min: number }

/** Text combinations use the WCAG AA body-text threshold. */
const TEXT = 4.5
/** Indicator rings, strokes, and graphics use the WCAG non-text threshold. */
const MARK = 3

/**
 * Reads every custom property from a CSS block.
 * @param selector Exact block selector, such as `:root`.
 * @returns Map from property names to their raw values.
 * @throws When the block does not exist.
 */
const declarations = (selector: string): Map<string, string> => {
  const css = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
  const open = css.indexOf(`${selector}{`)
  if (open < 0) throw new Error(`tokens.css 里没有 ${selector} 这个块`)
  const body = css.slice(open + selector.length + 1, css.indexOf('}', open))
  const out = new Map<string, string>()
  for (const declaration of body.split(';')) {
    const colon = declaration.indexOf(':')
    const name = declaration.slice(0, colon).trim()
    if (name.startsWith('--')) out.set(name, declaration.slice(colon + 1).trim())
  }
  return out
}

const ROOT = declarations(':root')
const DARK = declarations('[data-theme="dark"]')

/**
 * Resolves a token to its final theme value, recursively following `var()`.
 * Dark mode falls back to `:root`, matching CSS cascading behavior.
 * @throws When neither theme block defines the token.
 */
const resolve = (theme: 'light' | 'dark', name: string): string => {
  const value = theme === 'dark' ? DARK.get(name) ?? ROOT.get(name) : ROOT.get(name)
  if (value === undefined) throw new Error(`tokens.css 的 ${theme} 里没有 ${name}`)
  const indirect = /^var\((--[\w-]+)\)$/.exec(value)
  return indirect ? resolve(theme, indirect[1]!) : value
}

/**
 * Parses a token as a color, accepting three- or six-digit hex and `rgb()` / `rgba()`.
 * @throws When the value uses an unsupported representation.
 */
const colour = (theme: 'light' | 'dark', name: string): Colour => {
  const value = resolve(theme, name)
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const digits = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    }
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(value)
  if (!fn) throw new Error(`${name} 在 ${theme} 下不是本测试认得的颜色:${value}`)
  const parts = fn[1]!.split(',').map((n) => Number(n))
  return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 }
}

/**
 * Alpha-composites a background stack from bottom to top into one opaque color.
 * @throws When the bottom layer is not opaque.
 */
const flatten = (theme: 'light' | 'dark', stack: string[]): Colour => {
  const floor = colour(theme, stack[0]!)
  if (floor.a !== 1) throw new Error(`${stack[0]} 不是不透明的背板,压在它上面的合成结果没有意义`)
  return stack.map((name) => colour(theme, name)).reduce((below, above) => ({
    r: above.r * above.a + below.r * (1 - above.a),
    g: above.g * above.a + below.g * (1 - above.a),
    b: above.b * above.a + below.b * (1 - above.a),
    a: 1,
  }))
}

const channel = (value: number): number => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (c: Colour): number =>
  0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)

/** WCAG 2.1 relative luminance ratio. */
const contrast = (fg: Colour, bg: Colour): number => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (hi! + 0.05) / (lo! + 0.05)
}

const PAIRS: Pair[] = [
  // Body text and surfaces.
  { theme: 'light', label: '正文在内容面', fg: '--ink', ground: ['--content'], min: TEXT },
  { theme: 'light', label: '正文在窗口底', fg: '--ink', ground: ['--window'], min: TEXT },
  { theme: 'light', label: '正文在输入底', fg: '--ink', ground: ['--field'], min: TEXT },
  { theme: 'light', label: '次级文字在内容面', fg: '--sec', ground: ['--content'], min: TEXT },
  { theme: 'light', label: '次级文字在窗口底', fg: '--sec', ground: ['--window'], min: TEXT },
  { theme: 'light', label: '次级文字在输入底', fg: '--sec', ground: ['--field'], min: TEXT },
  { theme: 'light', label: 'toast 的字在墨底', fg: '--window', ground: ['--ink'], min: TEXT },
  { theme: 'dark', label: '正文在内容面', fg: '--ink', ground: ['--content'], min: TEXT },
  { theme: 'dark', label: '正文在卡片面', fg: '--ink', ground: ['--card'], min: TEXT },
  { theme: 'dark', label: '正文在窗口底', fg: '--ink', ground: ['--window'], min: TEXT },
  { theme: 'dark', label: '正文在输入底', fg: '--ink', ground: ['--field'], min: TEXT },
  { theme: 'dark', label: '次级文字在内容面', fg: '--sec', ground: ['--content'], min: TEXT },
  { theme: 'dark', label: '次级文字在窗口底', fg: '--sec', ground: ['--window'], min: TEXT },
  { theme: 'dark', label: '三级文字在内容面', fg: '--ter', ground: ['--content'], min: TEXT },
  { theme: 'dark', label: 'toast 的字在墨底', fg: '--window', ground: ['--ink'], min: TEXT },
  // Solid accent surfaces.
  { theme: 'light', label: '白字在实心 accent', fg: '--on-accent', ground: ['--accent-solid'], min: TEXT },
  { theme: 'dark', label: '白字在实心 accent', fg: '--on-accent', ground: ['--accent-solid'], min: TEXT },
  { theme: 'light', label: '白字在按下的实心 accent', fg: '--on-accent', ground: ['--accent-solid', '--press-solid'], min: TEXT },
  { theme: 'dark', label: '白字在按下的实心 accent', fg: '--on-accent', ground: ['--accent-solid', '--press-solid'], min: TEXT },
  // Links.
  { theme: 'light', label: '链接在内容面', fg: '--link', ground: ['--content'], min: TEXT },
  { theme: 'dark', label: '链接在内容面', fg: '--link', ground: ['--content'], min: TEXT },
  { theme: 'dark', label: '链接在卡片面', fg: '--link', ground: ['--card'], min: TEXT },
  // Text on light accent surfaces.
  { theme: 'light', label: '选中侧栏行的字', fg: '--ink', ground: ['--window', '--sidebar', '--accent-soft'], min: TEXT },
  { theme: 'dark', label: '选中侧栏行的字', fg: '--ink', ground: ['--window', '--sidebar', '--accent-soft'], min: TEXT },
  { theme: 'light', label: '会场徽标的字', fg: '--ink', ground: ['--card', '--accent-soft'], min: TEXT },
  { theme: 'dark', label: '会场徽标的字', fg: '--ink', ground: ['--card', '--accent-soft'], min: TEXT },
  { theme: 'light', label: '信息标签的字', fg: '--ink', ground: ['--content', '--tint-info'], min: TEXT },
  { theme: 'dark', label: '信息标签的字', fg: '--ink', ground: ['--content', '--tint-info'], min: TEXT },
  { theme: 'light', label: '文本选中底上的正文', fg: '--ink', ground: ['--content', '--sel'], min: TEXT },
  { theme: 'dark', label: '文本选中底上的正文', fg: '--ink', ground: ['--content', '--sel'], min: TEXT },
  { theme: 'light', label: '中性标签的字', fg: '--sec', ground: ['--content', '--tint-mut'], min: TEXT },
  { theme: 'dark', label: '中性标签的字', fg: '--sec', ground: ['--content', '--tint-mut'], min: TEXT },
  // Indicators.
  { theme: 'light', label: '焦点环在内容面', fg: '--ring', ground: ['--content'], min: MARK },
  { theme: 'light', label: '焦点环在窗口底', fg: '--ring', ground: ['--window'], min: MARK },
  { theme: 'light', label: '焦点环在输入底', fg: '--ring', ground: ['--field'], min: MARK },
  { theme: 'dark', label: '焦点环在内容面', fg: '--ring', ground: ['--content'], min: MARK },
  { theme: 'dark', label: '焦点环在卡片面', fg: '--ring', ground: ['--card'], min: MARK },
  { theme: 'dark', label: '焦点环在输入底', fg: '--ring', ground: ['--field'], min: MARK },
  { theme: 'dark', label: '焦点环在窗口底', fg: '--ring', ground: ['--window'], min: MARK },
  { theme: 'light', label: '选中侧栏行的图标', fg: '--accent', ground: ['--window', '--sidebar', '--accent-soft'], min: MARK },
  { theme: 'dark', label: '选中侧栏行的图标', fg: '--accent', ground: ['--window', '--sidebar', '--accent-soft'], min: MARK },
  { theme: 'light', label: '实心 accent 面对内容面', fg: '--accent-solid', ground: ['--content'], min: MARK },
  { theme: 'dark', label: '实心 accent 面对内容面', fg: '--accent-solid', ground: ['--content'], min: MARK },
  { theme: 'dark', label: '实心 accent 面对卡片面', fg: '--accent-solid', ground: ['--card'], min: MARK },
  { theme: 'light', label: '实心 accent 面对窗口底', fg: '--accent-solid', ground: ['--window'], min: MARK },
  { theme: 'dark', label: '实心 accent 面对窗口底', fg: '--accent-solid', ground: ['--window'], min: MARK },
  // Recompute semantic-label contrast after changing its background.
  { theme: 'dark', label: '成功标签的字', fg: '--good', ground: ['--content', '--tint-good'], min: TEXT },
  { theme: 'dark', label: '警示标签的字', fg: '--warn', ground: ['--content', '--tint-warn'], min: TEXT },
  { theme: 'dark', label: '冲突标签的字', fg: '--bad', ground: ['--content', '--tint-bad'], min: TEXT },
  // Entity-type labels use a brand-derived light background with `--sec` text.
  { theme: 'light', label: '论文类型标签的字', fg: '--sec', ground: ['--card', '--tint-paper'], min: TEXT },
  { theme: 'light', label: 'wiki 类型标签的字', fg: '--sec', ground: ['--card', '--tint-wiki'], min: TEXT },
  { theme: 'dark', label: '论文类型标签的字', fg: '--sec', ground: ['--card', '--tint-paper'], min: TEXT },
  { theme: 'dark', label: 'wiki 类型标签的字', fg: '--sec', ground: ['--card', '--tint-wiki'], min: TEXT },
]

describe('tokens.css 的对比度', () => {
  for (const pair of PAIRS) {
    it(`${pair.theme === 'dark' ? '暗色' : '亮色'}的${pair.label}不低于 ${pair.min}:1`, () => {
      const got = contrast(colour(pair.theme, pair.fg), flatten(pair.theme, pair.ground))
      expect(got, `${pair.fg} 压在 ${pair.ground.join(' + ')} 上是 ${got.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(pair.min)
    })
  }
})

describe('tokens.css 的决定值', () => {
  it('两端按钮只剩一条不分方向的隐藏规则,没有逐个画箭头的 :single-button / :double-button', () => {
    const rules = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/:(single|double)-button/)
    expect(rules).toMatch(/::-webkit-scrollbar-button\{display:none;width:0;height:0\}/)
  })

  it('亮色的 --info / --tint-info 是青色,且与 --link 解出来的颜色分开', () => {
    expect(colour('light', '--info')).toEqual({ r: 14, g: 154, b: 167, a: 1 })
    expect(colour('light', '--tint-info')).toEqual({ r: 14, g: 154, b: 167, a: .14 })
    expect(colour('light', '--info')).not.toEqual(colour('light', '--link'))
  })

  it('暗色的 --info / --tint-info 是青色,且与 --link 解出来的颜色分开', () => {
    expect(colour('dark', '--info')).toEqual({ r: 46, g: 196, b: 214, a: 1 })
    expect(colour('dark', '--tint-info')).toEqual({ r: 46, g: 196, b: 214, a: .2 })
    expect(colour('dark', '--info')).not.toEqual(colour('dark', '--link'))
  })
})
