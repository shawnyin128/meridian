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
 * Parses a token as a color, accepting three- or six-digit hex, `rgb()` / `rgba()`, `transparent`,
 * and `color-mix(in srgb, A P%, B)` whose parts are any of these or a `var()`.
 * @throws When the value uses an unsupported representation.
 */
const colour = (theme: 'light' | 'dark', name: string): Colour => parse(theme, name, resolve(theme, name))

const parse = (theme: 'light' | 'dark', name: string, value: string): Colour => {
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const token = /^var\((--[\w-]+)\)$/.exec(value)
  if (token) return colour(theme, token[1]!)
  const mix = /^color-mix\(in srgb,(.+) (\d+)%,(.+)\)$/.exec(value)
  if (mix) {
    const p = Number(mix[2]) / 100
    const [x, y] = [parse(theme, name, mix[1]!), parse(theme, name, mix[3]!)]
    const a = x.a * p + y.a * (1 - p)
    const mixed = (k: 'r' | 'g' | 'b'): number => (x[k] * x.a * p + y[k] * y.a * (1 - p)) / a
    return { r: mixed('r'), g: mixed('g'), b: mixed('b'), a }
  }
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
  { theme: 'light', label: '正文在卡片面', fg: '--ink', ground: ['--card'], min: TEXT },
  { theme: 'light', label: '次级文字在卡片面', fg: '--sec', ground: ['--card'], min: TEXT },
  { theme: 'light', label: '次级文字在浮层面', fg: '--sec', ground: ['--raised'], min: TEXT },
  { theme: 'light', label: 'toast 的字在墨底', fg: '--window', ground: ['--ink'], min: TEXT },
  { theme: 'dark', label: '正文在内容面', fg: '--ink', ground: ['--content'], min: TEXT },
  { theme: 'dark', label: '正文在卡片面', fg: '--ink', ground: ['--card'], min: TEXT },
  { theme: 'dark', label: '正文在窗口底', fg: '--ink', ground: ['--window'], min: TEXT },
  { theme: 'dark', label: '正文在输入底', fg: '--ink', ground: ['--field'], min: TEXT },
  { theme: 'dark', label: '次级文字在内容面', fg: '--sec', ground: ['--content'], min: TEXT },
  { theme: 'dark', label: '次级文字在窗口底', fg: '--sec', ground: ['--window'], min: TEXT },
  { theme: 'dark', label: '正文在浮层面', fg: '--ink', ground: ['--raised'], min: TEXT },
  { theme: 'dark', label: '次级文字在浮层面', fg: '--sec', ground: ['--raised'], min: TEXT },
  { theme: 'dark', label: '三级文字在内容面', fg: '--ter', ground: ['--content'], min: TEXT },
  { theme: 'dark', label: 'toast 的字在墨底', fg: '--window', ground: ['--ink'], min: TEXT },
  // Solid accent surfaces.
  { theme: 'light', label: '白字在实心 accent', fg: '--on-accent', ground: ['--accent-solid'], min: TEXT },
  { theme: 'dark', label: '白字在实心 accent', fg: '--on-accent', ground: ['--accent-solid'], min: TEXT },
  { theme: 'light', label: '白字在按下的实心 accent', fg: '--on-accent', ground: ['--accent-solid', '--press-solid'], min: TEXT },
  { theme: 'dark', label: '白字在按下的实心 accent', fg: '--on-accent', ground: ['--accent-solid', '--press-solid'], min: TEXT },
  { theme: 'light', label: '白字在悬停的实心 accent', fg: '--on-accent', ground: ['--accent-solid', '--hover-solid'], min: TEXT },
  { theme: 'dark', label: '白字在悬停的实心 accent', fg: '--on-accent', ground: ['--accent-solid', '--hover-solid'], min: TEXT },
  // Danger buttons: solid, soft on a red tint, and ghost on a surface.
  { theme: 'light', label: '白字在实心红色按钮', fg: '--on-accent', ground: ['--bad-solid'], min: TEXT },
  { theme: 'dark', label: '白字在实心红色按钮', fg: '--on-accent', ground: ['--bad-solid'], min: TEXT },
  { theme: 'light', label: '白字在按下的实心红色按钮', fg: '--on-accent', ground: ['--bad-solid', '--press-solid'], min: TEXT },
  { theme: 'dark', label: '白字在按下的实心红色按钮', fg: '--on-accent', ground: ['--bad-solid', '--press-solid'], min: TEXT },
  { theme: 'light', label: '浅红按钮的字在内容面', fg: '--bad-text', ground: ['--content', '--tint-bad'], min: TEXT },
  { theme: 'light', label: '浅红按钮的字在卡片面', fg: '--bad-text', ground: ['--card', '--tint-bad'], min: TEXT },
  { theme: 'dark', label: '浅红按钮的字在内容面', fg: '--bad-text', ground: ['--content', '--tint-bad'], min: TEXT },
  { theme: 'dark', label: '浅红按钮的字在卡片面', fg: '--bad-text', ground: ['--card', '--tint-bad'], min: TEXT },
  { theme: 'light', label: '幽灵红色按钮的字在卡片面', fg: '--bad-text', ground: ['--card'], min: TEXT },
  { theme: 'light', label: '幽灵红色按钮的字在浮层面', fg: '--bad-text', ground: ['--raised'], min: TEXT },
  { theme: 'dark', label: '幽灵红色按钮的字在卡片面', fg: '--bad-text', ground: ['--card'], min: TEXT },
  { theme: 'dark', label: '幽灵红色按钮的字在浮层面', fg: '--bad-text', ground: ['--raised'], min: TEXT },
  // Text on light accent surfaces.
  { theme: 'light', label: '选中侧栏行的字', fg: '--on-selected', ground: ['--window', '--sidebar', '--selected'], min: TEXT },
  { theme: 'dark', label: '选中侧栏行的字', fg: '--on-selected', ground: ['--window', '--sidebar', '--selected'], min: TEXT },
  { theme: 'light', label: '选中列表行的字', fg: '--on-selected', ground: ['--content', '--selected'], min: TEXT },
  { theme: 'dark', label: '选中列表行的字', fg: '--on-selected', ground: ['--content', '--selected'], min: TEXT },
  { theme: 'light', label: '选中卡片和科研图节点的字', fg: '--on-selected', ground: ['--card', '--selected'], min: TEXT },
  { theme: 'dark', label: '选中卡片和科研图节点的字', fg: '--on-selected', ground: ['--card', '--selected'], min: TEXT },
  { theme: 'light', label: '悬停的选中列表行的字', fg: '--on-selected', ground: ['--card', '--selected', '--hover'], min: TEXT },
  { theme: 'dark', label: '悬停的选中列表行的字', fg: '--on-selected', ground: ['--card', '--selected', '--hover'], min: TEXT },
  { theme: 'light', label: '设置里选中外观的名字', fg: '--on-selected', ground: ['--raised'], min: TEXT },
  { theme: 'dark', label: '设置里选中外观的名字', fg: '--on-selected', ground: ['--raised'], min: TEXT },
  { theme: 'light', label: '会场徽标的字', fg: '--ink', ground: ['--card', '--accent-soft'], min: TEXT },
  { theme: 'dark', label: '会场徽标的字', fg: '--ink', ground: ['--card', '--accent-soft'], min: TEXT },
  { theme: 'light', label: '信息标签的字', fg: '--ink', ground: ['--content', '--tint-info'], min: TEXT },
  { theme: 'dark', label: '信息标签的字', fg: '--ink', ground: ['--content', '--tint-info'], min: TEXT },
  { theme: 'light', label: '文本选中底上的正文', fg: '--ink', ground: ['--content', '--sel'], min: TEXT },
  { theme: 'dark', label: '文本选中底上的正文', fg: '--ink', ground: ['--content', '--sel'], min: TEXT },
  { theme: 'light', label: '中性标签的字', fg: '--sec', ground: ['--content', '--tint-mut'], min: TEXT },
  { theme: 'dark', label: '中性标签的字', fg: '--sec', ground: ['--content', '--tint-mut'], min: TEXT },
  { theme: 'light', label: '中性标签的字在悬停的卡片行上', fg: '--sec', ground: ['--card', '--hover', '--chip'], min: TEXT },
  { theme: 'dark', label: '中性标签的字在悬停的卡片行上', fg: '--sec', ground: ['--card', '--hover', '--chip'], min: TEXT },
  // Indicators.
  { theme: 'light', label: '焦点环在内容面', fg: '--ring', ground: ['--content'], min: MARK },
  { theme: 'light', label: '焦点环在窗口底', fg: '--ring', ground: ['--window'], min: MARK },
  { theme: 'light', label: '焦点环在输入底', fg: '--ring', ground: ['--field'], min: MARK },
  { theme: 'light', label: '焦点环在卡片面', fg: '--ring', ground: ['--card'], min: MARK },
  { theme: 'dark', label: '焦点环在内容面', fg: '--ring', ground: ['--content'], min: MARK },
  { theme: 'dark', label: '焦点环在卡片面', fg: '--ring', ground: ['--card'], min: MARK },
  { theme: 'dark', label: '焦点环在输入底', fg: '--ring', ground: ['--field'], min: MARK },
  { theme: 'dark', label: '焦点环在窗口底', fg: '--ring', ground: ['--window'], min: MARK },
  { theme: 'light', label: '红色焦点环在内容面', fg: '--bad', ground: ['--content'], min: MARK },
  { theme: 'light', label: '红色焦点环在卡片面', fg: '--bad', ground: ['--card'], min: MARK },
  { theme: 'dark', label: '红色焦点环在内容面', fg: '--bad', ground: ['--content'], min: MARK },
  { theme: 'dark', label: '红色焦点环在卡片面', fg: '--bad', ground: ['--card'], min: MARK },
  { theme: 'light', label: '选中侧栏行的图标', fg: '--on-selected', ground: ['--window', '--sidebar', '--selected'], min: MARK },
  { theme: 'dark', label: '选中侧栏行的图标', fg: '--on-selected', ground: ['--window', '--sidebar', '--selected'], min: MARK },
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

describe('选中的筛选项和开关项', () => {
  /** The token of the `color:var(…)` declaration in the rule for `selector` in the renderer stylesheet `path`. */
  const textOf = (path: string, selector: string): string => {
    const css = readFileSync(new URL(`../renderer/${path}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const body = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((match) => match[1]!.trim() === selector)![2]!
    return /(?:^|;)color:var\((--[\w-]+)\)/.exec(body)![1]!
  }
  const PICKED = [
    ['components/ChipToggles.css', '.chip-toggle[data-state="on"]'],
    ['routes/shell.css', '.read-state-filter.on'],
  ] as const

  it('字在浅 accent 底上不低于 4.5:1,铺在内容面或卡片面上都是,和选中的行用同一个字色', () => {
    for (const [path, selector] of PICKED) {
      const fg = textOf(path, selector)
      for (const theme of ['light', 'dark'] as const) {
        for (const ground of [['--content', '--accent-soft'], ['--card', '--accent-soft']]) {
          const got = contrast(colour(theme, fg), flatten(theme, ground))
          expect(got, `${theme} ${selector} 的 ${fg} 压在 ${ground.join(' + ')} 上是 ${got.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT)
        }
      }
      expect(fg, selector).toBe('--on-selected')
    }
  })
})

describe('tokens.css 的决定值', () => {
  it('两端按钮只剩一条不分方向的隐藏规则,没有逐个画箭头的 :single-button / :double-button', () => {
    const rules = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/:(single|double)-button/)
    expect(rules).toMatch(/::-webkit-scrollbar-button\{display:none;width:0;height:0\}/)
  })

  it('亮色的画布与卡片落在不同的台阶上,窗口底在画布之下,浮层在最上', () => {
    const level = (name: string): number => luminance(flatten('light', [name]))
    expect(level('--content')).not.toBe(level('--card'))
    expect(level('--window')).toBeLessThan(level('--content'))
    expect(level('--raised')).toBeGreaterThanOrEqual(Math.max(level('--content'), level('--card')))
  })

  it('浮层的每档阴影在两种主题下都以一圈 1px 的边开头,浮层不必再自画边框', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const name of ['--sh-2', '--sh-3']) expect(resolve(theme, name), `${theme} ${name}`).toMatch(/^0 0 0 1px rgba\(/)
    }
  })

  it('全局焦点环的颜色、粗细和间距都取自 --ring 一组变量', () => {
    const rules = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).toContain(':focus-visible{outline:var(--ring-width) solid var(--ring);outline-offset:var(--ring-offset)}')
    expect(resolve('light', '--ring-width')).toBe('2px')
    expect(resolve('light', '--ring-offset')).toBe('2px')
  })

  it('减弱动态效果时停下所有关键帧动画,只留运行中的转圈', () => {
    const rules = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    const reduced = rules.slice(rules.indexOf('@media (prefers-reduced-motion:reduce){'))
    expect(reduced.slice(0, reduced.indexOf('\n}'))).toContain(':not(.ring.spin),::before,::after{animation:none!important}')
  })

  it('中性标签的底在悬停的行上仍高出一级:亮色更深、暗色更亮,对比至少 1.1:1', () => {
    const CHIP = '--chip'
    const grounds = [['--content'], ['--card'], ['--window', '--sidebar']]
    for (const theme of ['light', 'dark'] as const) {
      for (const ground of grounds) {
        const row = flatten(theme, [...ground, '--hover'])
        const chip = flatten(theme, [...ground, '--hover', CHIP])
        const away = theme === 'light' ? luminance(chip) < luminance(row) : luminance(chip) > luminance(row)
        const label = `${theme} ${ground.join(' + ')} 悬停行上的 ${CHIP}`
        expect(away, `${label} 朝错了方向`).toBe(true)
        expect(contrast(chip, row), label).toBeGreaterThanOrEqual(1.1)
      }
    }
  })

  it('分段控件的轨道在两种主题下都比它所在的面深一级,滑块在轨道上浅一级,对比都至少 1.1:1', () => {
    const segmented = readFileSync(new URL('../renderer/components/SegmentedControl.css', import.meta.url), 'utf8')
    expect(segmented).toMatch(/\.segmented-control\{[^}]*background:var\(--track\)/)
    for (const theme of ['light', 'dark'] as const) {
      for (const ground of ['--content', '--card', '--raised']) {
        const surface = flatten(theme, [ground])
        const track = flatten(theme, [ground, '--track'])
        const thumb = flatten(theme, ['--raised'])
        const label = `${theme} ${ground} 上的 --track`
        expect(luminance(track) < luminance(surface), `${label} 不比面深`).toBe(true)
        expect(contrast(track, surface), label).toBeGreaterThanOrEqual(1.1)
        expect(luminance(thumb) > luminance(track), `${label} 上的滑块不比轨道浅`).toBe(true)
        expect(contrast(thumb, track), `${label} 上的滑块`).toBeGreaterThanOrEqual(1.1)
      }
    }
  })

  it('亮色的 --info / --tint-info 是青色,且与 --on-selected 解出来的颜色分开', () => {
    expect(colour('light', '--info')).toEqual({ r: 14, g: 154, b: 167, a: 1 })
    expect(colour('light', '--tint-info')).toEqual({ r: 14, g: 154, b: 167, a: .14 })
    expect(colour('light', '--info')).not.toEqual(colour('light', '--on-selected'))
  })

  it('暗色的 --info / --tint-info 是青色,且与 --on-selected 解出来的颜色分开', () => {
    expect(colour('dark', '--info')).toEqual({ r: 46, g: 196, b: 214, a: 1 })
    expect(colour('dark', '--tint-info')).toEqual({ r: 46, g: 196, b: 214, a: .2 })
    expect(colour('dark', '--info')).not.toEqual(colour('dark', '--on-selected'))
  })
})
