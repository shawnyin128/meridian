import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(process.cwd(), 'apps/desktop/src/renderer')
/** A selector part that reaches a native field or a FormControls element. */
const FIELD = /(^|[\s>+~(])(input|textarea|select)\b|\.form-(input|textarea|select|control|button)\b/
/** The properties that make up a field's box and its focus. */
const BOX = /^(border(-(top|right|bottom|left|color|width|style))?|border-radius|background(-color)?|height|padding(-(top|right|bottom|left))?|outline|box-shadow)$/
/**
 * The owners of a field's box: FormControls, the one focus rule in tokens.css, ClearableInput's room
 * for its icon and clear action, and the chat composer, whose box is drawn around its text.
 */
const OWNERS = new Set([
  'components/FormControls.css', 'shell/tokens.css', 'components/ClearableInput.css', 'components/chat/Chat.css',
])

describe('输入框的样式只有 FormControls 一处', () => {
  it('别的样式表都不给输入框画边框、底色、圆角、高度、内边距或焦点', () => {
    const copies = readdirSync(RENDERER, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
      .map((entry) => relative(RENDERER, join(entry.parentPath, entry.name)))
      .filter((file) => !OWNERS.has(file))
      .flatMap((file) => {
        const css = readFileSync(join(RENDERER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selector, body]) => {
          const fields = selector.split(',').map((part) => part.trim()).filter((part) => FIELD.test(part))
          const box = body.split(';').map((declaration) => declaration.split(':')[0].trim())
            .filter((property) => BOX.test(property))
          return fields.length > 0 && box.length > 0 ? [`${file}: ${fields.join(', ')} { ${box.join(' ')} }`] : []
        })
      })
    expect(copies).toEqual([])
  })
})
