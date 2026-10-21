import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every component and route source under the renderer, tests excluded, as paths relative to it. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

type Node = { type: string; [key: string]: unknown }

/** Every JSX attribute in `node`. */
function attributes(node: unknown, found: Node[] = []): Node[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) attributes(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXAttribute') found.push(held)
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') attributes(value, found)
  }
  return found
}

/** Is `node` a value written in the source: a number, a string, or a template without expressions? */
const constant = (node: Node): boolean => node.type === 'NumericLiteral' || node.type === 'StringLiteral'
  || (node.type === 'TemplateLiteral' && (node.expressions as Node[]).length === 0)
  || (node.type === 'UnaryExpression' && node.operator === '-' && constant(node.argument as Node))

const line = (node: Node) => (node.loc as { start: { line: number } }).start.line

describe('行内样式', () => {
  it('style={{…}} 里只放运行时算出来的值，写死的值都在样式表里取 token', () => {
    const offenders = SOURCES.flatMap((path) => {
      const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      return attributes(ast.program)
        .filter((attr) => (attr.name as Node).name === 'style')
        .flatMap((attr) => {
          const value = attr.value as Node | null
          const object = value?.type === 'JSXExpressionContainer' ? value.expression as Node : null
          if (object?.type !== 'ObjectExpression') return []
          return (object.properties as Node[])
            .filter((property) => property.type === 'ObjectProperty' && constant(property.value as Node))
            .map((property) => `${path}:${line(property)} ${String(((property.key as Node).name ?? (property.key as Node).value))}`)
        })
    })
    expect(offenders).toEqual([])
  })
})
