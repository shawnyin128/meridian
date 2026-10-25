import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(process.cwd(), 'apps/desktop/src/renderer')
/**
 * A selector part that reaches a native field, a FormControls element or a text editor, which show
 * focus with their frame.
 */
const FIELD = /(^|[\s>+~(])(input|textarea|select)\b|\.form-(input|textarea|select|control|button)\b|contenteditable|\.md\.src\b|\.chat-composer\b/
/** The properties a focus rule may set: the ones that reveal a control, or lift a fold over what has focus. */
const REVEAL = new Set(['opacity', 'pointer-events', 'display', 'visibility', 'max-height', 'mask-image'])
/** The ring a host draws for a control inside it whose fade mask hides the control's own ring. */
const HOST_RING = ['outline:var(--ring-width) solid var(--ring)', 'outline-offset:var(--ring-offset)']
/**
 * The rules that keep a focus look of their own: a menu or dialog surface focused only to hand focus
 * to its content, and a Radix menu item whose highlight is the menu's focus, draw no ring; the resize
 * grip's glyph takes the ring colour instead of ringing the pane's full height.
 */
const NOT_A_RING = new Set([
  'components/ModalDialog.css .modal:focus-visible',
  'components/AboutDialog.css .about-pop:focus',
  'components/ActionMenu.css .ctxmenu:focus-visible',
  'components/ActionMenu.css .mi[data-highlighted]:focus-visible',
  'components/Grip.css .grip',
  'components/Grip.css .grip-edge',
  'components/Grip.css .grip:focus-visible::after',
  'components/Grip.css .grip-edge:focus-visible::after',
])

/** Every rule of every renderer stylesheet except tokens.css, which owns the ring: [file, selector part, declarations]. */
function rules() {
  return readdirSync(RENDERER, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => relative(RENDERER, join(entry.parentPath, entry.name)))
    .filter((file) => file !== 'shell/tokens.css')
    .flatMap((file) => {
      const css = readFileSync(join(RENDERER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selector, body]) => {
        const declarations = body.split(';').map((declaration) => declaration.trim().replace(/\s*:\s*/, ':'))
          .filter(Boolean)
        return selector.split(',').map((part) => [file, part.trim(), declarations])
      })
    })
    .filter(([file, part]) => !NOT_A_RING.has(`${file} ${part}`) && !FIELD.test(part))
}

describe('键盘焦点只有 tokens.css 里的那一圈', () => {
  it('别的样式表不给焦点换样子：焦点规则只用来显出控件，替控件画圈的宿主只画那一圈', () => {
    const overrides = rules()
      .filter(([, part]) => /:focus(-visible)?(?![-\w])/.test(part))
      .flatMap(([file, part, declarations]) => {
        const host = /:has\([^)]*:focus/.test(part)
        const own = declarations.filter((declaration) => !REVEAL.has(declaration.split(':')[0]))
        const fine = own.length === 0 || (host && JSON.stringify(own) === JSON.stringify(HOST_RING))
        return fine ? [] : [`${file} ${part} { ${own.join('; ')} }`]
      })
    expect(overrides).toEqual([])
  })

  it('别的样式表也不在平时把焦点圈去掉', () => {
    const removed = rules()
      .filter(([, , declarations]) => declarations.some((declaration) => /^outline(-style)?:(0|none)\b|^outline-width:0\b/.test(declaration)))
      .map(([file, part]) => `${file} ${part}`)
    expect(removed).toEqual([])
  })
})
