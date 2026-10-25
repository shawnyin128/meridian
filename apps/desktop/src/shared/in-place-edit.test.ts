import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every renderer file under the renderer with one of `endings`, tests excluded, as paths with `/` separators. */
const files = (...endings: string[]) => readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .map((path) => path.split('\\').join('/'))
  .filter((path) => endings.some((ending) => path.endsWith(ending)) && !/\.test\.tsx?$/.test(path))

/** Whether a `.tsx` source is a screen: `routes/*`, `shell/*` or a feature folder `components/<feature>/*`. */
const isScreen = (path: string) => /^(routes|shell)\//.test(path) || /^components\/[^/]+\//.test(path)

/** The screens that run an inline draft of their own, each with the reason it is no in-place edit of a value. */
const OWN_DRAFTS: Record<string, string> = {
  'components/project/ProjectSections.tsx': 'the address and name of a new link, a draft of an item that does not exist yet',
  'components/paper-table/CellPicker.tsx': "the query of a cell's picker, which picks a value rather than editing one",
}

describe('就地编辑只有 InlineField 一种', () => {
  it('屏幕不自己拼就地编辑:改一个已有的值都交给 InlineField,自己跑草稿的屏幕各有理由', () => {
    const own = files('.tsx').filter((path) => isScreen(path) && readFileSync(join(RENDERER, path), 'utf8').includes('useInlineDraft'))
    expect(own.filter((path) => !Object.hasOwn(OWN_DRAFTS, path))).toEqual([])
    expect(Object.keys(OWN_DRAFTS).filter((path) => !own.includes(path))).toEqual([])
  })

  it('改名在原处改:弹出的短文本编辑器只给时间线上的里程碑用,别处不弹', () => {
    const popovers = files('.tsx').filter((path) => path !== 'components/FloatingTextEditor.tsx'
      && /<ShortTextEditor\b/.test(readFileSync(join(RENDERER, path), 'utf8')))
    expect(popovers).toEqual([])
  })

  it('就地编辑静息时和编辑时的样子只在 InlineField.css 和 FormControls 里,别的样式表不改它', () => {
    const restyled = files('.css').filter((path) => path !== 'components/InlineField.css').flatMap((path) => {
      const css = readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      return [...css.matchAll(/([^{}]+)\{/g)].map(([, selector]) => selector!.trim())
        // A host may place a field by whether it holds the editor (`:has`), which does not style it.
        .filter((selector) => /\.(metadata-(field|editable|input)|plan-name-input)\b/.test(selector.replace(/:has\([^)]*\)/g, '')))
        .map((selector) => `${path}: ${selector}`)
    })
    expect(restyled).toEqual([])
  })
})
