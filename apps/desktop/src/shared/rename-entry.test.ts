import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every renderer source, tests and the message catalogs excluded, as paths relative to the renderer. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith(`messages${'/'}`) && !path.startsWith('messages\\'))

/** The keys of the zh catalog that name a rename as an action, from the classes copy.test.ts keeps in step with it. */
const RENAME_ACTIONS = readFileSync(join(RENDERER, 'messages', 'copy-classes.txt'), 'utf8').split('\n')
  .map((line) => line.trim().split(/\s+/))
  .filter(([key, kind]) => kind === 'action' && /(^|\.)rename\w*$/.test(key ?? ''))
  .map(([key]) => key!)

type Node = { type: string; [key: string]: unknown }

/** Every JSX opening element in `node`. */
function elements(node: unknown, found: Node[] = []): Node[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) elements(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXOpeningElement') found.push(held)
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') elements(value, found)
  }
  return found
}

/** The attribute `name` written on `element`, if it is written by name rather than spread. */
const attribute = (element: Node, name: string) => (element.attributes as Node[])
  .find((held) => held.type === 'JSXAttribute' && (held.name as Node).name === name)

describe('改名只有一个入口:共用「更多」菜单里的重命名', () => {
  it('文案里只有一个重命名的动作,只有「更多」菜单读它', () => {
    expect(RENAME_ACTIONS).toEqual(['common.rename'])
    const readers = SOURCES.filter((path) => RENAME_ACTIONS.some((key) => {
      const [parent, last] = key.split('.').slice(-2)
      return new RegExp(`\\b${parent}\\.${last}\\b`).test(readFileSync(join(RENDERER, path), 'utf8'))
    }))
    expect(readers).toEqual([join('components', 'FieldPickers.tsx')])
  })

  it('行和卡片上的名字不自己开编辑:屏上的每个 InlineField 要么是表格格子的编辑框,要么静止时就是名字本身,只从菜单打开', () => {
    // TitleField is the one name a click renames: a page's or a panel's title, which the next case pins down.
    const opening = SOURCES.filter((path) => path !== join('components', 'InlineField.tsx') && path !== join('components', 'TitleField.tsx')).flatMap((path) => {
      const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      return elements(ast.program).flatMap((element) => {
        const name = (element.name as Node).name
        const rest = attribute(element, 'rest')
        const value = rest?.value as Node | null | undefined
        const expression = value?.type === 'JSXExpressionContainer' ? value.expression as Node : undefined
        // A rest handed a callback gets the field's edit, which some other control of the name would call.
        const handsEdit = expression !== undefined && /FunctionExpression$/.test(expression.type) && (expression.params as Node[]).length > 0
        const opensOnClick = name === 'InlineField' && rest === undefined && attribute(element, 'cell') === undefined
        return handsEdit || opensOnClick ? [`${path}:${(element.loc as { start: { line: number } }).start.line}`] : []
      })
    })
    expect(opening).toEqual([])
  })

  it('每个改名的入口打开时都选中整个名字:从菜单打开的名字和点着改名的标题都带 selectAll', () => {
    const missing = SOURCES.flatMap((path) => {
      const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      return elements(ast.program).flatMap((element) => {
        if ((element.name as Node).name !== 'InlineField') return []
        const renames = path === join('components', 'TitleField.tsx') || attribute(element, 'rest') !== undefined
        return renames && attribute(element, 'selectAll') === undefined
          ? [`${path}:${(element.loc as { start: { line: number } }).start.line}`] : []
      })
    })
    expect(missing).toEqual([])
  })

  it('点名字就改名的只有对话页、项目页和 Wiki 页的标题和想法详情的头:TitleField 只经 PageTitle 和 PanelHead 的 rename 用', () => {
    const uses = (component: string, prop?: string) => SOURCES.flatMap((path) => {
      const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      return elements(ast.program).some((element) => (element.name as Node).name === component
        && (prop === undefined || attribute(element, prop) !== undefined)) ? [path] : []
    })
    expect(uses('TitleField')).toEqual([join('components', 'PageShell.tsx'), join('components', 'SidePanel.tsx')])
    expect(uses('PageTitle', 'rename')).toEqual([join('routes', 'Chat.tsx'), join('routes', 'ProjectDetail.tsx'), join('routes', 'Wiki.tsx')])
    expect(uses('PanelHead', 'rename')).toEqual([join('components', 'ideas', 'IdeaPanel.tsx')])
  })
})
