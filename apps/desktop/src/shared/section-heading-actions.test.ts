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

describe('小标题的操作', () => {
  it('每种小标题都有自己的字号,右端动作只有一个槽', () => {
    const css = readFileSync(join(RENDERER, 'components', 'PageShell.css'), 'utf8')
    const rule = (selector: string) => new RegExp(`(?:^|\\n)${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\{([^}]*)\\}`).exec(css)?.[1]
    expect(rule('.section-heading')).toMatch(/font-size:var\(--fs-section\);font-weight:var\(--fw-title\)/)
    expect(rule('.section-heading--group')).toMatch(/font-size:var\(--fs-group\)/)
    expect(rule('.section-heading--rail')).toMatch(/font-size:var\(--fs-group\)/)
    expect(rule('.section-heading-actions')).toMatch(/margin-left:auto/)
    expect(css).not.toMatch(/\.flexh|\.section-actions/)
  })

  it('每个小标题的子内容只有标题文字(一个 span 或淡出的 FadeText),按钮、切换和菜单都放进 actions 槽', () => {
    const offenders = SOURCES.flatMap((path) => {
      const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      return elements(ast.program).filter((element) => nameOf(element) === 'SectionHeading').flatMap((heading) => (
        elements(heading.children)
          .filter((child) => nameOf(child) !== 'span' && nameOf(child) !== 'FadeText')
          .map((child) => `${path}:${(child.loc as { start: { line: number } }).start.line} <${nameOf(child) || 'element'}>`)
      ))
    })
    expect(offenders).toEqual([])
  })
})
