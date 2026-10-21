import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every component and route source under the renderer, tests excluded, as paths relative to it. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

type Node = { type: string; [key: string]: unknown }

const nameOf = (element: Node): string => {
  const name = (element.openingElement as Node).name as Node
  return name.type === 'JSXIdentifier' ? name.name as string : ''
}

/** Every JSX element in `node`, outermost first. */
function elements(node: unknown, found: Node[] = []): Node[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) elements(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXElement') found.push(held)
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') elements(value, found)
  }
  return found
}

/** The JSX elements in `node` that no other JSX element in it holds. */
function outermost(node: unknown, found: Node[] = []): Node[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) outermost(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXElement') {
    found.push(held)
    return found
  }
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') outermost(value, found)
  }
  return found
}

/** The JSX attribute `name` of `element`, if it has one. */
const attribute = (element: Node, name: string): Node | undefined =>
  ((element.openingElement as Node).attributes as Node[])
    .find((attr) => attr.type === 'JSXAttribute' && (attr.name as Node).name === name)

/** Every string literal inside `node`: class names written as literals or picked by a ternary. */
const strings = (node: unknown): string[] => {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(strings)
  const held = node as Node
  if (held.type === 'StringLiteral') return [held.value as string]
  if (held.type === 'TemplateElement') return [(held.value as { raw: string }).raw]
  return Object.entries(held).filter(([key]) => key !== 'loc').flatMap(([, value]) => strings(value))
}

const line = (node: Node) => (node.loc as { start: { line: number } }).start.line

const headers = SOURCES.flatMap((path) => {
  const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  return elements(ast.program).filter((element) => nameOf(element) === 'PageHeader').map((header) => ({ path, header }))
})

describe('屏头的按钮', () => {
  it('屏头里只有返回、标题和 actions 槽:页级操作和视图切换都不直接放在标题旁边', () => {
    const offenders = headers.flatMap(({ path, header }) => outermost(header.children)
      .filter((child) => !['PageTitle', 'BackButton'].includes(nameOf(child)))
      .map((child) => `${path}:${line(child)} <${nameOf(child) || 'element'}>`))
    expect(offenders).toEqual([])
  })

  it('页级操作一种尺寸:actions 槽里没有小号按钮或小号添加', () => {
    const offenders = headers.flatMap(({ path, header }) => {
      const actions = attribute(header, 'actions')
      if (actions === undefined) return []
      return elements(actions).flatMap((element) => {
        const name = nameOf(element)
        const classes = strings(attribute(element, 'className')).flatMap((value) => value.split(/\s+/))
        const variant = strings(attribute(element, 'variant'))
        const small = classes.includes('sm') || strings(attribute(element, 'size')).some((size) => ['sm', 'nested', 'inline'].includes(size))
          || (name === 'AddAction' && !variant.includes('page'))
        return small ? [`${path}:${line(element)} <${name}>`] : []
      })
    })
    expect(offenders).toEqual([])
  })
})
