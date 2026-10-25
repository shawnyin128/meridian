import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'
// @ts-expect-error The screen-stylesheet guard is plain JavaScript without type declarations.
import { rendererFiles, screenViolations } from '../../../../scripts/check-screen-css.mjs'

/** The shared components that draw a list item or the list around it. */
const ITEM_COMPONENTS = new Set(['Item', 'List'])
/** The classes those components draw themselves. */
const OWN_CLASS = /^(item|list)(--[\w-]+)?$/
/** The list items the inventory found built by hand: the paper card, the feed entry, the agent run card and the reader's note card. */
const HAND_BUILT = ['paper-card', 'fitem', 'agcard', 'reading-card']
/** The declarations that give an item its inset, edge, fill, type and pointer: Item and List own them. */
const LOOK = /^(padding|margin|border|background|box-shadow|outline|font|line-height|color|opacity|cursor)/

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
  for (const [key, value] of Object.entries(held)) if (key !== 'loc' && key !== 'start' && key !== 'end') openings(value, found)
  return found
}

/** Every string literal inside `node`: class names written as literals or picked by a ternary. */
const strings = (node: unknown): string[] => {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(strings)
  const held = node as Node
  if (held.type === 'StringLiteral') return [held.value as string]
  if (held.type === 'TemplateElement') return [(held.value as { raw: string }).raw]
  return Object.entries(held).filter(([key]) => key !== 'loc').flatMap(([, value]) => strings(value))
}

const FILES = rendererFiles() as Map<string, string>
const ELEMENTS = [...FILES].filter(([file]) => file.endsWith('.tsx'))
  .map(([file, text]) => ({ file, found: openings(parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program) }))
const nameOf = (element: Node) => ((element.name as Node).name as string | undefined) ?? ''
const classWords = (element: Node) => (element.attributes as Node[])
  .filter((attr) => attr.type === 'JSXAttribute' && (attr.name as Node).name === 'className')
  .flatMap((attr) => strings(attr.value)).flatMap((value) => value.split(/\s+/)).filter((word) => /^-?[_a-zA-Z][\w-]*$/.test(word))

/** Every class written on an element that is no item or list: a state word such as `done` that other elements wear too. */
const ELSEWHERE = new Set(ELEMENTS.flatMap(({ found }) => found.filter((element) => !ITEM_COMPONENTS.has(nameOf(element)))).flatMap(classWords))
/** Every class a screen hands an item or a list through `className` and no other element wears, with the hand-built items. */
const HOSTS = new Set([...HAND_BUILT, ...ELEMENTS.filter(({ file }) => !/^components\/[^/]+\.tsx$/.test(file))
  .flatMap(({ found }) => found.filter((element) => ITEM_COMPONENTS.has(nameOf(element)))).flatMap(classWords)
  .filter((word) => !ELSEWHERE.has(word))])

/** The first class of the element a selector selects, outside `:not()` and `:has()`. */
const subjectClass = (selector: string) => /\.(-?[_a-zA-Z][\w-]*)/
  .exec(selector.split(/\s*[\s>+~]\s*(?![^(]*\))/).at(-1)!.replace(/:(not|has)\((?:[^()]|\([^()]*\))*\)/g, ''))?.[1]

describe('列表项只有一种', () => {
  it('屏幕样式表不给列表项另画内缩、边框、底色、字、指针、悬停和选中的样子：都只来自 Item 和 List', () => {
    const offenders = (screenViolations(FILES) as { file: string; line: number; selector: string; property: string; reason: string }[])
      .filter((violation) => {
        const subject = subjectClass(violation.selector.replace(/^@[^{]*?\)\s*/, '')) ?? ''
        return (HOSTS.has(subject) || OWN_CLASS.test(subject)) && (violation.reason === 'state' || LOOK.test(violation.property))
      })
      .map((violation) => `${violation.file}:${violation.line}: ${violation.selector} { ${violation.property} }`)
    expect(offenders).toEqual([])
  })
})

