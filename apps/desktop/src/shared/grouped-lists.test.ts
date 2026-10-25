import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'
// @ts-expect-error The screen-stylesheet guard is plain JavaScript without type declarations.
import { rendererFiles, screenViolations } from '../../../../scripts/check-screen-css.mjs'

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const FILES: Map<string, string> = rendererFiles()
const SOURCES = [...FILES.keys()].filter((path) => path.endsWith('.tsx'))

type Node = { type: string; [key: string]: unknown }

/** The names of every JSX element `source` renders. */
function rendered(source: string): string[] {
  const names: string[] = []
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const held = node as Node
    if (held.type === 'JSXOpeningElement' && (held.name as Node).type === 'JSXIdentifier') names.push((held.name as Node).name as string)
    for (const [key, value] of Object.entries(held)) if (key !== 'loc' && key !== 'start' && key !== 'end') walk(value)
  }
  walk(parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program)
  return names
}

/** Every screen that lists items in groups by day, source, status or archive with its own heading or fold. */
const GROUPING_SCREENS = [
  'routes/Ideas.tsx', 'routes/Feed.tsx', 'routes/Later.tsx', 'routes/Changelog.tsx', 'routes/Inbox.tsx',
  'components/project/ProjectPlan.tsx',
]

describe('分组列表', () => {
  it('每个分组列表都用同一个 Group：没有一屏再画按天的灰色小字或自己的可折叠分组', () => {
    const own = SOURCES.flatMap((path) => rendered(FILES.get(path)!)
      .filter((name) => name === 'DayHeading' || name === 'CollapsibleGroup')
      .map((name) => `${path} <${name}>`))
    expect(own).toEqual([])
    expect(GROUPING_SCREENS.filter((path) => !rendered(FILES.get(path)!).includes('Group'))).toEqual([])
  })

  it('一组排在一列分组里时，不能折叠的分组放在 GroupedList 里，第一组贴着列表顶', () => {
    const loose = GROUPING_SCREENS.filter((path) => path !== 'components/project/ProjectPlan.tsx')
      .filter((path) => !rendered(FILES.get(path)!).includes('GroupedList'))
    expect(loose).toEqual([])
  })

  it('分组的标题、计数、折叠和钉住只画在共享组件里：分组自己的样式表不写字号、字重、颜色或分隔线，屏幕样式表不改分组标题', () => {
    const sheet = join(RENDERER, 'components', 'GroupedList.css')
    expect(existsSync(sheet), 'GroupedList.css').toBe(true)
    const css = readFileSync(sheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css.match(/(?:^|[;{])\s*(font-size|font-weight|color|border-bottom)\s*:/gm) ?? []).toEqual([])
    const restyled = (screenViolations(FILES) as { file: string; line: number; selector: string; property: string }[])
      .filter((violation) => /\.collapsible-group-head(?![\w-])/.test(violation.selector))
      .map((violation) => `${violation.file}:${violation.line} ${violation.selector} { ${violation.property} }`)
    expect(restyled).toEqual([])
  })
})
