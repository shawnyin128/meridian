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

/**
 * The surfaces text and tags sit on in either theme, bottom-to-top: the canvas, a card, a floating
 * layer, the window, a hovered card or sidebar row, and a selected card or sidebar row.
 */
const SURFACES: [string, string[]][] = [
  ['内容面', ['--content']], ['卡片面', ['--card']], ['浮层面', ['--raised']], ['窗口底', ['--window', '--sidebar']],
  ['悬停的卡片行', ['--card', '--hover']], ['悬停的侧栏行', ['--window', '--sidebar', '--hover']],
  ['选中的卡片行', ['--card', '--selected']], ['选中的侧栏行', ['--window', '--sidebar', '--selected']],
]

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
  // Danger buttons: solid, soft on a red tint, and ghost on a surface.
  { theme: 'light', label: '白字在实心红色按钮', fg: '--on-accent', ground: ['--bad-solid'], min: TEXT },
  { theme: 'dark', label: '白字在实心红色按钮', fg: '--on-accent', ground: ['--bad-solid'], min: TEXT },
  { theme: 'light', label: '白字在按下的实心红色按钮', fg: '--on-accent', ground: ['--bad-solid', '--press-solid'], min: TEXT },
  { theme: 'dark', label: '白字在按下的实心红色按钮', fg: '--on-accent', ground: ['--bad-solid', '--press-solid'], min: TEXT },
  { theme: 'light', label: '白字在悬停的实心红色按钮', fg: '--on-accent', ground: ['--bad-solid', '--hover-solid'], min: TEXT },
  { theme: 'dark', label: '白字在悬停的实心红色按钮', fg: '--on-accent', ground: ['--bad-solid', '--hover-solid'], min: TEXT },
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

/**
 * The tokens the fill and the text colour of the rule for `selector` in the renderer stylesheet `path`
 * read, as `<fill> <text>`; a rule listing several selectors counts for each of them.
 * @throws When no rule names `selector`.
 */
const lookOf = (path: string, selector: string): string => {
  const css = readFileSync(new URL(`../renderer/${path}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((match) => match[1]!.split(',').some((part) => part.trim() === selector))
  if (rule === undefined) throw new Error(`${path} 里没有 ${selector} 这条规则`)
  const token = (property: RegExp) => property.exec(rule[2]!)?.[1] ?? '无'
  return `${token(/(?:^|;)\s*background(?:-color)?:var\((--[\w-]+)\)/)} ${token(/(?:^|;)\s*color:var\((--[\w-]+)\)/)}`
}

describe('主操作', () => {
  /** The primary button and the composer's send: their fill and text tokens. */
  const PRIMARY = [['routes/shell.css', '.btn.pri'], ['components/chat/Chat.css', '.send']] as const

  it('主按钮和输入框的发送都是实心强调色配白字,两种主题一样', () => {
    expect(PRIMARY.map(([path, selector]) => lookOf(path, selector))).toEqual(['--accent-solid --on-accent', '--accent-solid --on-accent'])
  })

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme === 'dark' ? '暗色' : '亮色'}的主操作静止、悬停和按下时字都不低于 4.5:1,悬停和按下让底色至少变 1.1:1`, () => {
      for (const [path, selector] of PRIMARY) {
        const [fill, text] = lookOf(path, selector).split(' ') as [string, string]
        const rest = flatten(theme, [fill])
        for (const state of [[], ['--hover-solid'], ['--press-solid']]) {
          const ground = flatten(theme, [fill, ...state])
          const label = `${selector} ${state.join('') || '静止'}`
          expect(contrast(colour(theme, text), ground), label).toBeGreaterThanOrEqual(TEXT)
          if (state.length > 0) expect(contrast(rest, ground), label).toBeGreaterThanOrEqual(1.1)
        }
        for (const ground of ['--content', '--card', '--window']) {
          expect(contrast(rest, flatten(theme, [ground])), `${selector} 对 ${ground}`).toBeGreaterThanOrEqual(MARK)
        }
      }
    })
  }
})

describe('亮色的文字', () => {
  for (const text of ['--ink', '--sec', '--ter']) {
    it(`亮色的 ${text} 铺在每种底面上、也压在这些底面上的中性标签底上,都不低于 4.5:1`, () => {
      for (const [where, ground] of SURFACES) {
        for (const [on, stack] of [['', ground], ['的标签底', [...ground, '--chip']]] as [string, string[]][]) {
          const got = contrast(colour('light', text), flatten('light', stack))
          expect(got, `${text} 压在${where}${on}上是 ${got.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT)
        }
      }
    })
  }
})

describe('暗色的三级文字', () => {
  it('暗色的 --ter 铺在每种底面上不低于 4.5:1,压在画布、卡片、浮层和窗口底上的标签底上也不低于 4.5:1', () => {
    for (const [where, ground] of SURFACES) {
      const got = contrast(colour('dark', '--ter'), flatten('dark', ground))
      expect(got, `--ter 压在${where}上是 ${got.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT)
    }
    for (const [where, ground] of SURFACES.slice(0, 4)) {
      const got = contrast(colour('dark', '--ter'), flatten('dark', [...ground, '--chip']))
      expect(got, `--ter 压在${where}的标签底上是 ${got.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT)
    }
  })
})

describe('出错的提示框', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme === 'dark' ? '暗色' : '亮色'}的错误提示框里的红字压在它自己的浅红底上,铺在画布和卡片上都不低于 4.5:1`, () => {
      const [fill, text] = lookOf('components/PageShell.css', '.ipcerror').split(' ') as [string, string]
      for (const ground of ['--content', '--card']) {
        const got = contrast(colour(theme, text), flatten(theme, [ground, fill]))
        expect(got, `${text} 压在 ${ground} + ${fill} 上是 ${got.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT)
      }
    })
  }
})

/** Every tone of the shared Tag but the dashed ghost slot, and the text colour each one writes in. */
const TAG_TEXT = {
  neutral: '--sec', accent: '--sec', info: '--sec', paper: '--sec', wiki: '--sec',
  good: '--good-text', warn: '--warn-text', bad: '--bad-text',
} as const

describe('标签', () => {
  it('每种标签都是中性的标签底,只有 good、warn、bad 三种需要注意的状态给字上自己的颜色', () => {
    expect(Object.fromEntries(Object.keys(TAG_TEXT).map((tone) => [tone, lookOf('components/Tag.css', `.tag--${tone}`)])))
      .toEqual(Object.fromEntries(Object.entries(TAG_TEXT).map(([tone, text]) => [tone, `--chip ${text}`])))
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const tone of Object.keys(TAG_TEXT)) {
      it(`${theme === 'dark' ? '暗色' : '亮色'}的 ${tone} 标签的字压在它自己的底上,铺在每种底面上都不低于 4.5:1`, () => {
        const [fill, text] = lookOf('components/Tag.css', `.tag--${tone}`).split(' ') as [string, string]
        for (const [where, ground] of SURFACES) {
          const got = contrast(colour(theme, text), flatten(theme, [...ground, fill]))
          expect(got, `${text} 压在${where}的 ${fill} 上是 ${got.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT)
        }
      })
    }
  }
})

describe('强调色的字', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme === 'dark' ? '暗色' : '亮色'}侧栏当前行的字,静止和悬停时都不低于 4.5:1`, () => {
      const [fill, text] = lookOf('shell/AppShell.css', '.srow.on').split(' ') as [string, string]
      for (const ground of [['--window', '--sidebar', fill], ['--window', '--sidebar', fill, '--hover']]) {
        const got = contrast(colour(theme, text), flatten(theme, ground))
        expect(got, `${text} 压在 ${ground.join(' + ')} 上是 ${got.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT)
      }
    })
  }

  it('亮色侧栏当前行上的计数,字压在它的标签底上不低于 4.5:1', () => {
    const [row] = lookOf('shell/AppShell.css', '.srow.on').split(' ') as [string]
    const [fill, text] = lookOf('components/Tag.css', '.count-badge').split(' ') as [string, string]
    const ground = ['--window', '--sidebar', row, fill]
    const got = contrast(colour('light', text), flatten('light', ground))
    expect(got, `${text} 压在 ${ground.join(' + ')} 上是 ${got.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT)
  })
})

describe('选中、当前、已应用和按下的状态', () => {
  const STATES = [
    ['components/StructuredList.css', '.structured-row--selected'],
    ['components/ResearchObjectCard.css', '.research-object-card.selected'],
    ['components/FieldPickers.css', '.cd.sel'],
    ['routes/Reader.css', '.reader-rail button.on'],
    ['components/ChipToggles.css', '.chip-toggle[data-state="on"]'],
    ['routes/shell.css', '.btn:not(.danger)[aria-pressed="true"]'],
    ['components/IconButton.css', '.icbtn[aria-pressed="true"]'],
  ] as const

  it('只有侧栏的当前行用浅强调色配强调色的字;选中的行、当前页、选中的日期、已应用的筛选和按下的开关都是中性的 --selected 配 --on-selected', () => {
    expect(Object.fromEntries([['shell/AppShell.css', '.srow.on'] as const, ...STATES].map(([path, selector]) => [selector, lookOf(path, selector)])))
      .toEqual(Object.fromEntries([['.srow.on', '--accent-soft --accent-text'], ...STATES.map(([, selector]) => [selector, '--selected --on-selected'])]))
    expect(lookOf('components/SegmentedControl.css', '.segmented-thumb')).toBe('--raised 无')
  })

  /** The on states of controls that already have a fill at rest: the current page, the applied filter, the picked column type. */
  const FILLED_ON = [
    ['components/Pager.css', '.pgbtn.on'], ['routes/shell.css', '.filter-menu.on'],
    ['components/paper-table/PaperTable.css', '.ctbtn.on'],
  ] as const

  it('当前页、已应用的筛选和选中的列类型用深一级的中性底配 --on-selected 的字', () => {
    expect(FILLED_ON.map(([path, selector]) => lookOf(path, selector)))
      .toEqual(FILLED_ON.map(() => '--selected-strong --on-selected'))
  })

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme === 'dark' ? '暗色' : '亮色'}的这些开着的样子对关着的输入底至少 1.2:1,对悬停至少 1.15:1,字不低于 4.5:1`, () => {
      const off = flatten(theme, ['--field'])
      const hover = flatten(theme, ['--field', '--hover'])
      for (const ground of [['--content'], ['--card'], ['--raised'], ['--window', '--sidebar']]) {
        const on = flatten(theme, [...ground, '--selected-strong'])
        const where = `${theme} ${ground.join(' + ')}`
        expect(contrast(on, off), `${where} 开对关`).toBeGreaterThanOrEqual(1.2)
        expect(contrast(on, hover), `${where} 开对悬停`).toBeGreaterThanOrEqual(1.15)
        expect(contrast(colour(theme, '--on-selected'), on), `${where} 字`).toBeGreaterThanOrEqual(TEXT)
      }
    })
  }
})

describe('tokens.css 的决定值', () => {
  it('两端按钮只剩一条不分方向的隐藏规则,没有逐个画箭头的 :single-button / :double-button', () => {
    const rules = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/:(single|double)-button/)
    expect(rules).toMatch(/::-webkit-scrollbar-button\{display:none;width:0;height:0\}/)
  })

  it('亮色的画布、卡片和浮层都是白色,窗口底和侧栏是中性的浅灰', () => {
    // The owner's decision on #157 (2026-10-20): a clean light theme, white canvas and a neutral light grey frame.
    expect(['--content', '--card', '--raised', '--window', '--sidebar'].map((name) => resolve('light', name)))
      .toEqual(['#ffffff', '#ffffff', '#ffffff', '#f8f8f8', 'rgba(248,248,248,.85)'])
  })

  it('亮色的面、文字、分隔线、输入底、悬停和按下的叠层、标签底、选中、滚动条、遮罩和阴影都不带色相', () => {
    const greys = ['--desktop', '--window', '--sidebar', '--content', '--card', '--raised', '--ink', '--sec', '--ter',
      '--sep', '--sep2', '--sep-strong', '--field', '--hover', '--press', '--chip', '--track', '--tint-mut',
      '--selected', '--sel', '--sbthumb', '--sbthumb-h', '--scrim', '--q-bg', '--hl-note', '--mslane']
    const tinted = greys.filter((name) => { const { r, g, b } = colour('light', name); return r !== g || g !== b })
    const shadows = ['--sh-1', '--sh-2', '--sh-3', '--sh-paper'].filter((name) => [...resolve('light', name)
      .matchAll(/rgba\((\d+),(\d+),(\d+),/g)].some(([, r, g, b]) => r !== g || g !== b))
    expect([...tinted, ...shadows]).toEqual([])
  })

  it('暗色时间线的里程碑行和别的叠层一样是中性的,不带黄色', () => {
    const { r, g, b } = colour('dark', '--mslane')
    const ink = colour('dark', '--ink')
    expect({ r, g, b }).toEqual({ r: ink.r, g: ink.g, b: ink.b })
  })

  it('选中是一块中性的底配 --ink 的字,在两种主题下都比悬停和输入底深一级,对比至少 1.1:1', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(colour(theme, '--on-selected'), theme).toEqual(colour(theme, '--ink'))
      const selected = flatten(theme, ['--card', '--selected'])
      for (const [label, ground] of [['悬停', ['--card', '--hover']], ['输入底', ['--field']]] as const) {
        expect(contrast(selected, flatten(theme, [...ground])), `${theme} 选中对${label}`).toBeGreaterThanOrEqual(1.1)
      }
    }
  })

  it('开着的开关是强调色的轨道,关着的是 --sep-strong,滑块都是白色;两种主题下开着的轨道对所在面、滑块对开着的轨道都不低于 3:1', () => {
    const fill = (selector: string) => lookOf('components/Switch.css', selector).split(' ')[0]!
    const [off, on] = [fill('.switch'), fill('.switch[data-state="checked"]')]
    const thumbs = [fill('.switch-thumb'), fill('.switch-thumb[data-state="checked"]')]
    expect([off, on, ...thumbs]).toEqual(['--sep-strong', '--accent', '--on-accent', '--on-accent'])
    for (const theme of ['light', 'dark'] as const) {
      for (const ground of ['--content', '--card', '--raised']) {
        expect(contrast(colour(theme, on), flatten(theme, [ground])), `${theme} ${ground}`).toBeGreaterThanOrEqual(MARK)
      }
      expect(contrast(colour(theme, thumbs[1]!), colour(theme, on)), theme).toBeGreaterThanOrEqual(MARK)
    }
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

  it('评分星的颜色来自 --star,两种主题下都解得出颜色', () => {
    expect(lookOf('components/PaperMetadata.css', '.rating-stars button.rated')).toBe('无 --star')
    for (const theme of ['light', 'dark'] as const) expect(colour(theme, '--star').a, theme).toBe(1)
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
})
