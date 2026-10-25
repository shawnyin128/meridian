import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'
// @ts-expect-error The screen-stylesheet guard is plain JavaScript without type declarations.
import { rendererFiles, screenViolations } from '../../../../scripts/check-screen-css.mjs'

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const FILES: Map<string, string> = rendererFiles()
/** Every component and route source under the renderer, tests excluded, as paths relative to it. */
const SOURCES = [...FILES.keys()].filter((path) => path.endsWith('.tsx'))

type Node = { type: string; [key: string]: unknown }

/** Every JSX opening element in `node`. */
function openings(node: unknown, found: Node[] = []): Node[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) openings(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXOpeningElement') found.push(held)
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') openings(value, found)
  }
  return found
}

const nameOf = (opening: Node): string => {
  const name = opening.name as Node
  return name.type === 'JSXIdentifier' ? name.name as string : ''
}
const lineOf = (node: Node): number => (node.loc as { start: { line: number } }).start.line

/** Every JSX opening element of every source, with the source it is in. */
const ELEMENTS = SOURCES.flatMap((path) => openings(parse(FILES.get(path)!, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program)
  .map((opening) => ({ path, opening })))

/** The declarations of the rule for exactly `selector` in the shared heading stylesheet, as property: value. */
function declared(selector: string): Record<string, string> {
  const css = readFileSync(join(RENDERER, 'components', 'PageShell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((match) => match[1]!.trim() === selector)
  if (rule === undefined) throw new Error(`PageShell.css has no rule for ${selector}`)
  return Object.fromEntries(rule[2]!.split(';').map((part) => part.trim()).filter(Boolean)
    .map((part) => [part.slice(0, part.indexOf(':')).trim(), part.slice(part.indexOf(':') + 1).trim().replace(/\s+/g, ' ')]))
}

describe('标题的级别', () => {
  it('小节标题只有两级，小节和分组；每处都写明级别，不再有页面、侧栏之类的变体', () => {
    const offenders = ELEMENTS
      .filter(({ opening }) => ['SectionHeading', 'TabbedSection'].includes(nameOf(opening)))
      .flatMap(({ path, opening }) => (opening.attributes as Node[]).flatMap((attribute) => {
        if (attribute.type !== 'JSXAttribute') return []
        const name = (attribute.name as Node).name as string
        const value = attribute.value as Node | null
        if (name === 'variant') return [`${path}:${lineOf(opening)} variant`]
        if (name !== 'level') return []
        // A shared component such as TabbedSection hands on the level its own caller chose.
        const forwarded = /^components\/[^/]+\.tsx$/.test(path) && value?.type === 'JSXExpressionContainer'
          && ((value.expression as Node).type === 'Identifier') && (value.expression as Node).name === 'level'
        return forwarded || (value?.type === 'StringLiteral' && ['section', 'group'].includes(value.value as string))
          ? [] : [`${path}:${lineOf(opening)} level`]
      }))
    expect(offenders).toEqual([])
  })

  it('每一级的字号、字重、颜色、行高和上下的间距都定在共享样式里，阅读排版的行高进不来', () => {
    expect(declared('.section-heading')).toEqual(expect.objectContaining({
      'font-size': 'var(--fs-section)', 'font-weight': 'var(--fw-title)', color: 'var(--ink)', 'line-height': 'var(--lh-ui)',
      margin: 'var(--section-gap) 0 var(--sp-10)', 'padding-top': 'var(--sp-16)', 'border-top': '1px solid var(--sep2)',
    }))
    expect(declared('.section-heading--group')).toEqual({
      'font-size': 'var(--fs-group)', margin: 'var(--sp-20) 0 var(--sp-8)', 'padding-top': '0', 'border-top': '0',
    })
    const css = readFileSync(join(RENDERER, 'components', 'PageShell.css'), 'utf8')
    expect([...new Set(css.match(/\.section-heading--[\w-]+/g))], '只有分组这一级的修饰').toEqual(['.section-heading--group'])
  })

  it('标题右端的操作不把标题撑高：带按钮的标题和不带的一样高，按钮在标题的一行里居中', () => {
    expect(declared('.section-heading-actions')).toEqual(expect.objectContaining({ height: '1lh', 'align-items': 'center' }))
  })

  it('屏幕样式表不改标题的样子，最多摆它的位置', () => {
    const restyled = (screenViolations(FILES) as { file: string; line: number; selector: string; property: string }[])
      .filter((violation) => /\.section-heading(-actions)?(?![\w-])/.test(violation.selector.split(/[\s>+~]+(?![^(]*\))/).at(-1)!))
      .map((violation) => `${violation.file}:${violation.line} ${violation.selector} { ${violation.property} }`)
    expect(restyled).toEqual([])
  })

  it('没有手搭的标题：小节、卡片、审阅分段和教程里的标题都是 SectionHeading，不是 h1–h6 或自己的类', () => {
    const raw = ELEMENTS
      .filter(({ opening }) => /^h[1-6]$/.test(nameOf(opening)))
      // A paper card names its paper in an h3: an item title, the level below the headings.
      .filter(({ path, opening }) => !(path === 'components/paper/PaperCard.tsx' && nameOf(opening) === 'h3'))
      .map(({ path, opening }) => `${path}:${lineOf(opening)} <${nameOf(opening)}>`)
    expect(raw).toEqual([])
    const handBuilt = ['af-h', 'extension-head', 'storage-head', 'service-status-head', 'paper-wiki-review-section-head']
    const found = SOURCES.flatMap((path) => handBuilt
      .filter((name) => new RegExp(`className="[^"]*(?<![\\w-])${name}(?![\\w-])`).test(FILES.get(path)!))
      .map((name) => `${path} .${name}`))
    expect(found).toEqual([])
  })
})
