import type { ColourTheme, ColourThemeModules } from './contract.js'

/** The appearance mode a set of colour tokens is for. */
export type ColourMode = 'light' | 'dark'
export type ColourModule = keyof ColourThemeModules

/** An sRGB colour: channels from 0 to 255, and alpha from 0 to 1. `css` is how a mix is written out. */
type Colour = { r: number; g: number; b: number; a: number; css?: string }
type Lab = { L: number; a: number; b: number }

export const COLOUR_THEME_SCHEMA = 'meridian.theme.v1'

const theme = (id: string, name: string, light: ColourThemeModules, dark: ColourThemeModules): ColourTheme =>
  ({ schema: COLOUR_THEME_SCHEMA, id, name, light, dark })

/** Today's palette; tokens.css holds its derived tokens, so a document without a theme already shows it. */
export const DEFAULT_COLOUR_THEME = theme('default', '默认', {
  ground: '#ffffff', sidebar: '#f8f8f8', card: '#ffffff', field: '#f2f2f2',
  ink: '#111111', inkSecondary: '#555555', inkTertiary: '#5b5b5b', separator: '#e3e3e3', accent: '#3568ff',
  error: '#e0453a', warning: '#b8860b', done: '#1f9d4d', highlight: '#f8d84a',
}, {
  ground: '#0d1b2d', sidebar: '#091526', card: '#12213a', field: '#16263f',
  ink: '#f5f7fb', inkSecondary: '#aab6c8', inkTertiary: '#94a0b2', separator: '#20324c', accent: '#558cff',
  error: '#ff453a', warning: '#ffd60a', done: '#30d158', highlight: '#f8d84a',
})

/** The built-in themes in the order Settings offers them: today's palette, then the four lacquer palettes. */
export const BUILT_IN_COLOUR_THEMES: readonly ColourTheme[] = [
  DEFAULT_COLOUR_THEME,
  theme('cinnabar', '朱漆', {
    ground: '#fcf7ee', sidebar: '#f7f0e4', card: '#fefbf4', field: '#f5eee1',
    ink: '#2e2a27', inkSecondary: '#54504d', inkTertiary: '#5a5552', separator: '#e4ddd0', accent: '#a64436',
    error: '#da3d61', warning: '#b38838', done: '#05893e', highlight: '#f8d84a',
  }, {
    ground: '#1f1915', sidebar: '#16100c', card: '#251f1b', field: '#29231f',
    ink: '#f8edd8', inkSecondary: '#cfc4b0', inkTertiary: '#bcb19d', separator: '#36302c', accent: '#b35041',
    error: '#fd406e', warning: '#d7aa5c', done: '#30d158', highlight: '#f8d84a',
  }),
  theme('luodian', '螺钿', {
    ground: '#faf7f3', sidebar: '#f4f1eb', card: '#fcfbf8', field: '#f2efe8',
    ink: '#1f2426', inkSecondary: '#4c5154', inkTertiary: '#515759', separator: '#e1ded7', accent: '#517d7b',
    error: '#e0453a', warning: '#b8860b', done: '#028f41', highlight: '#f8d84a',
  }, {
    ground: '#151c1f', sidebar: '#0c1316', card: '#1a2225', field: '#1e2629',
    ink: '#f3eee4', inkSecondary: '#cac5bb', inkTertiary: '#b7b2a8', separator: '#2b3336', accent: '#6d9a98',
    error: '#ff453a', warning: '#ffd60a', done: '#30d158', highlight: '#f8d84a',
  }),
  theme('chestnut', '秋叶', {
    ground: '#fdf7ec', sidebar: '#f9f0e0', card: '#fffbf3', field: '#f7eede',
    ink: '#482212', inkSecondary: '#6f4535', inkTertiary: '#754b3a', separator: '#e6ddcd', accent: '#ae5b26',
    error: '#d3365b', warning: '#ac8a55', done: '#038d40', highlight: '#f8d84a',
  }, {
    ground: '#26160f', sidebar: '#1d0d07', card: '#2d1c15', field: '#312019',
    ink: '#fbedd2', inkSecondary: '#d1c4aa', inkTertiary: '#beb197', separator: '#3f2d25', accent: '#c56f3c',
    error: '#fd406e', warning: '#cfac75', done: '#30d158', highlight: '#f8d84a',
  }),
  theme('xipi', '流霞', {
    ground: '#fef6ef', sidebar: '#faefe4', card: '#fffaf5', field: '#f8ede2',
    ink: '#483732', inkSecondary: '#5e4c46', inkTertiary: '#63514c', separator: '#e7dcd1', accent: '#a9514d',
    error: '#cc2e56', warning: '#bf823a', done: '#007f39', highlight: '#f8d84a',
  }, {
    ground: '#251612', sidebar: '#1c0d09', card: '#2b1c18', field: '#30201c',
    ink: '#fdebd9', inkSecondary: '#d3c2b1', inkTertiary: '#c0af9e', separator: '#3e2d28', accent: '#b85f5a',
    error: '#fd406e', warning: '#e3a45d', done: '#30d158', highlight: '#f8d84a',
  }),
]

const parse = (hex: string, a = 1): Colour =>
  ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), a })
const alpha = (colour: Colour, a: number): Colour => ({ r: colour.r, g: colour.g, b: colour.b, a })
const WHITE = parse('#ffffff')
const BLACK = parse('#000000')

const linear = (c: number): number => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const encode = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** Björn Ottosson's OKLab of an sRGB colour. */
function oklab({ r, g, b }: Colour): Lab {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** The linear sRGB channels of an OKLab colour, unclamped. */
function linearOf({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const fits = (lab: Lab): boolean => linearOf(lab).every((v) => v >= -1e-4 && v <= 1 + 1e-4)

/** The opaque sRGB colour of OKLab `lab`, its chroma reduced at the same lightness and hue until it fits, in whole channels. */
function fromLab(lab: Lab): Colour {
  const L = Math.min(1, Math.max(0, lab.L))
  let [low, high] = [0, 1]
  if (!fits({ L, a: lab.a, b: lab.b })) {
    for (let step = 0; step < 30; step += 1) {
      const mid = (low + high) / 2
      if (fits({ L, a: lab.a * mid, b: lab.b * mid })) low = mid
      else high = mid
    }
  } else low = 1
  const [r, g, b] = linearOf({ L, a: lab.a * low, b: lab.b * low })
    .map((v) => Math.round(encode(Math.min(1, Math.max(0, v))))) as [number, number, number]
  return { r, g, b, a: 1 }
}

/** Below this OKLab chroma a reference colour has no hue to turn from. */
const HUED = 0.01

/**
 * Where `target` lands when `source` stands where `reference` stood: its OKLab lightness moves by
 * the same amount, unless `keepLightness`; its chroma scales and its hue turns with the source's, or,
 * when the reference is a grey, its a and b move by the source's.
 */
function follow(source: Colour, reference: Colour, target: Colour, keepLightness = false): Colour {
  const [s, r, t] = [oklab(source), oklab(reference), oklab(target)]
  const L = keepLightness ? t.L : t.L + s.L - r.L
  const chroma = Math.hypot(r.a, r.b)
  if (chroma < HUED) return fromLab({ L, a: t.a + s.a - r.a, b: t.b + s.b - r.b })
  const scale = Math.hypot(s.a, s.b) / chroma
  const turn = Math.atan2(s.b, s.a) - Math.atan2(r.b, r.a)
  return fromLab({
    L,
    a: scale * (t.a * Math.cos(turn) - t.b * Math.sin(turn)),
    b: scale * (t.a * Math.sin(turn) + t.b * Math.cos(turn)),
  })
}

/**
 * Where a colour the default theme pairs with one of its modules lands in another theme: it moves
 * with that module the way derived tokens do.
 * @param modules The theme's module colours in `mode`.
 * @param module The module the colour moves with.
 * @param target The colour, `#rrggbb`, beside the default theme's `module` in `mode`.
 * @returns The colour for `modules`, `#rrggbb`.
 */
export function colourFollowing(modules: ColourThemeModules, mode: ColourMode, module: ColourModule, target: string): string {
  return hexOf(follow(parse(modules[module]), parse(DEFAULT_COLOUR_THEME[mode][module]), parse(target)))
}

const TEXT_MODULES: ReadonlySet<ColourModule> = new Set(['ink', 'inkSecondary', 'inkTertiary'])

/**
 * A dark mode for the light module colours `light`, from the theme `base`: each module moves from
 * `base`'s dark one as `light`'s moves from `base`'s light one, as derived tokens move, except that
 * the three text modules keep the OKLab lightness of `base`'s dark text, which reads on dark surfaces.
 * @returns The thirteen dark module colours, `#rrggbb`; `base.dark` for `base.light`.
 */
export function deriveDarkModules(light: ColourThemeModules, base: ColourTheme): ColourThemeModules {
  const moved = (module: ColourModule) =>
    hexOf(follow(parse(light[module]), parse(base.light[module]), parse(base.dark[module]), TEXT_MODULES.has(module)))
  return Object.fromEntries((Object.keys(base.dark) as ColourModule[]).map((module) => [module, moved(module)])) as ColourThemeModules
}

/** `color-mix(in srgb, x p%, y)` of two opaque colours, written out as that expression. */
function mix(x: Colour, p: number, y: Colour): Colour {
  const at = (k: 'r' | 'g' | 'b') => x[k] * (p / 100) + y[k] * (1 - p / 100)
  return { r: at('r'), g: at('g'), b: at('b'), a: 1, css: `color-mix(in srgb,${hexOf(x)} ${p}%,${hexOf(y)})` }
}

/** A colour with its channels rounded to whole numbers, written out as hex or rgba(). */
const rounded = (c: Colour): Colour => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), a: c.a })

const hexOf = (c: Colour): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const cssOf = (c: Colour): string =>
  c.css ?? (c.a === 1 ? hexOf(c) : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a})`)

/**
 * The colour of the overlays (hover, press, chips, selection) in `mode`: the ink, which light overlays
 * darken to no more than the default ink's OKLab lightness, as they darken what they cover.
 */
function shadeOf(modules: ColourThemeModules, mode: ColourMode): Colour {
  const ink = oklab(parse(modules.ink))
  const darkest = oklab(parse(DEFAULT_COLOUR_THEME[mode].ink)).L
  return mode === 'light' && ink.L > darkest ? fromLab({ ...ink, L: darkest }) : parse(modules.ink)
}

/** The colour tokens of tokens.css that hold one colour, from the module colours of one mode, before contrast repair. */
function colours(modules: ColourThemeModules, mode: ColourMode) {
  const light = mode === 'light'
  const reference = DEFAULT_COLOUR_THEME[mode]
  const own = (key: ColourModule) => parse(modules[key])
  const moved = (key: ColourModule, target: string) => follow(own(key), parse(reference[key]), parse(target))
  const [ink, accent, error, warning, done] = [own('ink'), own('accent'), own('error'), own('warning'), own('done')]
  const shade = shadeOf(modules, mode)
  const desktop = moved('ground', light ? '#eaeaea' : '#040b14')
  const tintMut = alpha(shade, light ? 0.04 : 0.05)
  return {
    '--desktop': desktop, '--window': moved('sidebar', light ? '#f8f8f8' : '#07111f'),
    '--content': own('ground'), '--sidebar': alpha(own('sidebar'), 0.85),
    '--ink': ink, '--sec': own('inkSecondary'), '--ter': own('inkTertiary'),
    '--sep': own('separator'), '--sep2': alpha(own('separator'), 0.6),
    '--sep-strong': rounded(mix(own('separator'), light ? 85 : 82, own('inkSecondary'))),
    '--accent': accent, '--accent-soft': alpha(accent, 0.12), '--on-accent': WHITE,
    '--accent-solid': moved('accent', '#3568ff'), '--accent-text': mix(accent, 70, ink), '--accent-mark': accent, '--ring': accent,
    '--card': own('card'), '--raised': own('card'), '--field': own('field'),
    '--hover': alpha(shade, 0.05), '--press': alpha(shade, light ? 0.06 : 0.09),
    '--chip': alpha(shade, light ? 0.07 : 0.08), '--track': light ? alpha(shade, 0.07) : alpha(BLACK, 0.45),
    '--sel': alpha(shade, light ? 0.14 : 0.18), '--selected': alpha(shade, 0.1), '--on-selected': ink,
    '--selected-strong': alpha(shade, 0.18), '--tint-mut': tintMut, '--mslane': tintMut,
    '--sbthumb': alpha(shade, 0.28), '--sbthumb-h': alpha(shade, 0.45),
    '--q-bg': light ? alpha(shade, 0.06) : alpha(desktop, 0.4),
    '--press-solid': alpha(BLACK, 0.18), '--hover-solid': alpha(BLACK, 0.08),
    '--good': done, '--warn': warning, '--bad': error,
    '--good-text': light ? mix(done, 60, ink) : done, '--warn-text': light ? mix(warning, 55, ink) : warning,
    '--bad-text': mix(error, light ? 60 : 50, ink), '--bad-solid': moved('error', '#d1372c'),
    '--star': moved('warning', '#e3a520'),
    '--tint-good': light ? alpha(moved('done', '#30d158'), 0.14) : alpha(done, 0.2),
    '--tint-warn': light ? alpha(moved('warning', '#ffd60a'), 0.14) : alpha(warning, 0.2),
    '--tint-bad': alpha(error, light ? 0.12 : 0.1),
    '--diff-add': light ? alpha(moved('done', '#28a745'), 0.12) : alpha(done, 0.14),
    '--diff-del': alpha(error, light ? 0.1 : 0.12),
    '--hl': alpha(moved('highlight', '#ffd60a'), light ? 0.45 : 0.35),
    '--paper': light ? WHITE : parse('#1f1f1f'), '--scrim': light ? alpha(shadowOf(modules), 0.42) : alpha(desktop, 0.55),
    '--hl-yellow': own('highlight'), '--hl-green': parse('#87d99a'), '--hl-blue': parse('#82c7f2'),
    '--hl-pink': parse('#f0a0be'),
    // Dark themes invert the page (tokens.css --paper-filter), so the ink drawn on it turns light.
    '--hl-note': light ? parse('#111111', 0.55) : parse('#e0e0e0', 0.55),
    '--hl-sel': light ? parse('#111111', 0.14) : parse('#e0e0e0', 0.2),
  } satisfies Record<string, Colour>
}

type ColourValues = ReturnType<typeof colours>
/** A colour token of tokens.css that holds one colour. */
export type ColourToken = keyof ColourValues
/** A shadow token of tokens.css, a list of shadows in the theme's colours. */
export type ShadowToken = '--sh-1' | '--sh-2' | '--sh-3' | '--sh-paper'

/** The colour of light shadows and the light scrim: the light overlay colour, lifted as the default's is. */
const shadowOf = (modules: ColourThemeModules): Colour =>
  follow(shadeOf(modules, 'light'), parse(DEFAULT_COLOUR_THEME.light.ink), parse('#171717'))

/** The elevation shadows: in light in one colour, in dark black casts edged with the ink. */
function shadows(modules: ColourThemeModules, mode: ColourMode): Record<ShadowToken, string> {
  const at = (colour: Colour, a: number) => cssOf(alpha(colour, a))
  if (mode === 'light') {
    const s = shadowOf(modules)
    return {
      '--sh-1': `0 1px 2px ${at(s, 0.06)}, 0 0 0 1px ${at(s, 0.04)}`,
      '--sh-2': `0 0 0 1px ${at(s, 0.1)}, 0 6px 16px ${at(s, 0.12)}, 0 2px 5px ${at(s, 0.06)}`,
      '--sh-3': `0 0 0 1px ${at(s, 0.08)}, 0 24px 60px ${at(s, 0.2)}, 0 6px 18px ${at(s, 0.1)}`,
      '--sh-paper': `0 4px 22px ${at(s, 0.22)}`,
    }
  }
  const edge = parse(modules.ink)
  return {
    '--sh-1': `0 1px 2px ${at(BLACK, 0.5)}, 0 0 0 1px ${at(edge, 0.05)}`,
    '--sh-2': `0 0 0 1px ${at(edge, 0.08)}, 0 8px 24px ${at(BLACK, 0.55)}, 0 2px 6px ${at(BLACK, 0.4)}`,
    '--sh-3': `0 0 0 1px ${at(edge, 0.07)}, 0 28px 70px ${at(BLACK, 0.66)}, 0 8px 24px ${at(BLACK, 0.5)}`,
    '--sh-paper': `0 4px 22px ${at(BLACK, 0.5)}`,
  }
}

const TEXT = 4.5
const MARK = 3

/** One layer of a ground: a token, or a token laid at an opacity over the layers below it. */
type Layer = ColourToken | readonly [ColourToken, number]
/** A contrast target: `fg` over the bottom-to-top `ground` stack reaches `min`; a shortfall belongs to `module`. */
export type ContrastCheck = { module: ColourModule; fg: ColourToken; ground: readonly Layer[]; min: number }

/** The grounds text and tags sit on: canvas, card, floating layer, window, and hovered and selected rows. */
const SURFACES: readonly (readonly ColourToken[])[] = [
  ['--content'], ['--card'], ['--raised'], ['--window', '--sidebar'],
  ['--card', '--hover'], ['--window', '--sidebar', '--hover'],
  ['--card', '--selected'], ['--window', '--sidebar', '--selected'],
]
const CHIPS = SURFACES.map((ground) => [...ground, '--chip'] as const)

/** The neutral box of an in-place message on the canvas, a card and the window. */
const MESSAGE_BOX = [['--content', '--tint-mut'], ['--card', '--tint-mut'], ['--window', '--sidebar', '--tint-mut']] as const

const over = (module: ColourModule, fg: ColourToken, grounds: readonly (readonly Layer[])[], min = TEXT): ContrastCheck[] =>
  grounds.map((ground) => ({ module, fg, ground, min }))

/** The reading highlight as the Reader fills a highlighted passage: the highlight at 30% (Reader.css). */
const HIGHLIGHTED: Layer = ['--hl-yellow', 0.3]

/** Every contrast target of one mode: what derivation repairs toward and `contrastShortfalls` reports. */
function contrastChecks(mode: ColourMode): ContrastCheck[] {
  const solid = (fill: ColourToken): (readonly ColourToken[])[] => [[fill], [fill, '--hover-solid'], [fill, '--press-solid']]
  const current = [['--window', '--sidebar', '--accent-soft'], ['--window', '--sidebar', '--accent-soft', '--hover']] as const
  /** A list's selected row or card, on the canvas, a card or a floating layer, at rest and hovered. */
  const selectedRow = (['--content', '--card', '--raised'] as const)
    .flatMap((surface) => [[surface, '--accent-soft'], [surface, '--accent-soft', '--hover']] as const)
  /** A picked small control on every surface: a pressed toggle, a picked day or tab, and a current page or applied filter. */
  const pickedControl = SURFACES.slice(0, 4).flatMap((ground) => [[...ground, '--selected'], [...ground, '--selected-strong']] as const)
  /**
   * Where an accent mark (a check mark, the running ring, a progress line) sits: every surface, hovered,
   * a selected or current row, and a progress line's track on a card, a floating layer or a message box.
   */
  const boxes: readonly (readonly ColourToken[])[] = [...MESSAGE_BOX, ['--raised', '--tint-mut']]
  const marked: readonly (readonly ColourToken[])[] = [...SURFACES.slice(0, 4), ['--card', '--hover'], ['--raised', '--hover'],
    ['--window', '--sidebar', '--hover'], ...selectedRow, ...current, ['--card', '--track'], ['--raised', '--track'],
    ...boxes.map((box): readonly ColourToken[] => [...box, '--track'])]
  return [
    ...over('ink', '--ink', [...SURFACES, ...CHIPS, ['--field'], ['--content', '--sel'], ['--card', '--selected', '--hover']]),
    ...over('ink', '--window', [['--ink']]),
    ...over('inkSecondary', '--sec', [...SURFACES, ...CHIPS, ['--field'], ...MESSAGE_BOX]),
    ...over('inkSecondary', '--sec', mode === 'light' ? [[...current[0], '--chip']] : []),
    ...over('inkTertiary', '--ter', mode === 'light' ? [...SURFACES, ...CHIPS] : [...SURFACES, ...CHIPS.slice(0, 4)]),
    ...over('accent', '--ring', [['--content'], ['--window'], ['--field'], ['--card']], MARK),
    ...over('accent', '--accent', [['--content'], ['--card'], ['--raised']], MARK),
    ...over('accent', '--on-accent', [['--accent']], MARK),
    ...over('accent', '--on-accent', solid('--accent-solid')),
    ...over('accent', '--accent-solid', [['--content'], ['--card'], ['--window']], MARK),
    ...over('accent', '--accent-text', [...current, ...selectedRow, ...pickedControl]),
    ...over('accent', '--accent-mark', marked, MARK),
    ...over('error', '--bad', [['--content'], ['--card']], MARK),
    ...over('error', '--on-accent', solid('--bad-solid')),
    ...over('error', '--bad-text', [
      ...CHIPS, ['--content', '--tint-bad'], ['--card', '--tint-bad'], ['--card'], ['--raised'], ['--raised', '--hover'], ...MESSAGE_BOX,
    ]),
    ...over('warning', '--warn-text', [...CHIPS, ...MESSAGE_BOX]),
    ...over('done', '--good-text', [...CHIPS, ...MESSAGE_BOX]),
    ...over('highlight', '--ink', [['--card', HIGHLIGHTED], ['--content', HIGHLIGHTED]]),
  ]
}

/** One layer over another, by source-over compositing; the result is opaque when the lower one is. */
const composite = (below: Colour, above: Colour): Colour => ({
  r: above.r * above.a + below.r * (1 - above.a),
  g: above.g * above.a + below.g * (1 - above.a),
  b: above.b * above.a + below.b * (1 - above.a),
  a: 1,
})

const luminance = ({ r, g, b }: Colour): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)

/** The WCAG 2.1 contrast ratio of two opaque colours. */
function contrastRatio(x: Colour, y: Colour): number {
  const [high, low] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number]
  return (high + 0.05) / (low + 0.05)
}

const layerOf = (values: ColourValues, layer: Layer): Colour =>
  (typeof layer === 'string' ? values[layer] : alpha(values[layer[0]], layer[1]))

/** The ratio `check` reaches; every foreground a check names is opaque, and so is its bottom layer. */
const ratioOf = (values: ColourValues, check: ContrastCheck): number => contrastRatio(
  values[check.fg],
  check.ground.slice(1).reduce((below, layer) => composite(below, layerOf(values, layer)), layerOf(values, check.ground[0]!)),
)

/**
 * The tokens whose recipe may miss a contrast target in another theme, each with the module whose
 * chroma and hue it keeps when only its lightness moves to meet it.
 */
const REPAIRED: readonly [ColourToken, ColourModule | null][] = [
  ['--accent-solid', null], ['--bad-solid', null], ['--accent-text', 'accent'], ['--accent-mark', 'accent'],
  ['--good-text', 'done'], ['--warn-text', 'warning'], ['--bad-text', 'error'],
]

/**
 * Every token for `modules` with its contrast repaired: a repaired token keeps its recipe when that
 * meets every check it appears in; otherwise it takes the OKLab lightness nearest the recipe's that
 * meets them all, keeping the chroma and hue of its module, or its own when it has none. A token no
 * lightness repairs keeps its recipe, and `contrastShortfalls` reports it.
 */
function repaired(modules: ColourThemeModules, mode: ColourMode): ColourValues {
  const values = colours(modules, mode)
  const checks = contrastChecks(mode)
  for (const [token, module] of REPAIRED) {
    const own = checks.filter((check) => check.fg === token || check.ground.includes(token))
    const meets = (candidate: Colour) => {
      const trial = { ...values, [token]: candidate }
      return own.every((check) => ratioOf(trial, check) >= check.min)
    }
    const recipe = values[token]
    if (meets(recipe)) continue
    const start = oklab(recipe)
    const { a, b } = module === null ? start : oklab(parse(modules[module]))
    for (let step = 1; step <= 1000; step += 1) {
      const found = [start.L - step / 1000, start.L + step / 1000]
        .filter((L) => L >= 0 && L <= 1).map((L) => fromLab({ L, a, b })).find(meets)
      if (found !== undefined) {
        values[token] = found
        break
      }
    }
  }
  return values
}

/**
 * Derives every colour token tokens.css defines from the thirteen module colours of one mode, as
 * CSS values. For the default theme's modules the result equals tokens.css.
 * @param modules The module colours, each `#RRGGBB`.
 * @param mode The appearance mode they are for, which picks the recipes.
 * @returns Every colour token name, `--sh-*` shadows included, mapped to its CSS value.
 */
export function deriveColourTokens(modules: ColourThemeModules, mode: ColourMode): Record<ColourToken | ShadowToken, string> {
  const values = Object.entries(repaired(modules, mode)).map(([token, colour]) => [token, cssOf(colour)])
  return { ...Object.fromEntries(values) as Record<ColourToken, string>, ...shadows(modules, mode) }
}

/** The colour tokens the system's Increase Contrast changes. */
export type IncreasedContrastToken = '--sep' | '--sep2' | '--sep-strong' | '--ter'

/**
 * The colour tokens that change while the system's Increase Contrast is on, from the module colours of
 * one mode: the separator steps toward the secondary ink until it reaches 3:1 on the canvas, a card and
 * the window, the focused field's border until it reaches 4.5:1 there, the translucent separator
 * becomes that separator, and tertiary text becomes the secondary.
 * @returns Each of those tokens mapped to its CSS value.
 */
export function increasedContrastTokens(modules: ColourThemeModules, mode: ColourMode): Record<IncreasedContrastToken, string> {
  const values = repaired(modules, mode)
  const grounds = [values['--content'], values['--card'], values['--window']]
  const toward = (min: number): Colour => {
    for (let p = 100; p >= 0; p -= 1) {
      const candidate = rounded(mix(parse(modules.separator), p, parse(modules.inkSecondary)))
      if (grounds.every((ground) => contrastRatio(candidate, ground) >= min)) return candidate
    }
    return parse(modules.inkSecondary)
  }
  const separator = cssOf(toward(MARK))
  return { '--sep': separator, '--sep2': separator, '--sep-strong': cssOf(toward(TEXT)), '--ter': cssOf(values['--sec']) }
}

/** A contrast target the derived tokens miss, with the ratio they reach. */
export type ContrastShortfall = ContrastCheck & { ratio: number }

/**
 * Lists every contrast target the derived tokens of `modules` miss in `mode`, after repair. A target
 * over a layer laid at an opacity counts only when its foreground meets it on the surface without
 * that layer; otherwise the foreground's own targets report the shortfall.
 * @returns The missed targets in `contrastChecks` order; empty when every one is met.
 */
export function contrastShortfalls(modules: ColourThemeModules, mode: ColourMode): ContrastShortfall[] {
  const values = repaired(modules, mode)
  const surface = (check: ContrastCheck): ContrastCheck => ({ ...check, ground: check.ground.filter((layer) => typeof layer === 'string') })
  return contrastChecks(mode).map((check) => ({ ...check, ratio: ratioOf(values, check) }))
    .filter((check) => check.ratio < check.min
      && (check.ground.every((layer) => typeof layer === 'string') || ratioOf(values, surface(check)) >= check.min))
}
