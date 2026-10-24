import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every component and route source under the renderer, tests excluded, as paths relative to it. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

type Node = { type: string; start: number; end: number; [key: string]: unknown }

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

/**
 * The switches that do not swap what a section shows, by file and the source of their `label`, each
 * with the reason it is not a tab group.
 */
const NOT_TAB_GROUPS: Record<string, string> = {
  'components/Pager.tsx m.common.pager.perPage': 'sets how many rows one page of the same list holds',
  'components/TaskScheduleField.tsx m.research.schedule.modeLabel': "a field's mode: a task takes all day or a time window",
  'components/settings/ThemeEditor.tsx t.mode': 'picks which palette, light or dark, the one editor edits',
  'components/wiki/WikiClaims.tsx f.basisLabel': "a draft's field: what the new claim rests on",
  'components/project/ProjectSections.tsx m.project.links.groupLabel': "a draft's field: the group a new link joins",
  'components/ideas/IdeaRelations.tsx m.project.links.groupLabel': "a draft's field: the group a new link joins",
  'components/paper-table/PaperTable.tsx m.papers.views.aria': 'switches the whole Papers page between the table and the research map',
  'components/paper-table/PaperTable.tsx m.papers.toolbar.groupFieldAria': 'groups the rows of the one table',
  'components/timeline/TimelineScale.tsx m.timeline.scaleGroup': "the timeline's scale",
  'routes/Later.tsx m.later.groupBy': 'groups the entries of the one list',
  'routes/Feed.tsx m.feed.sourceFieldLabel': "filters the page's one stream by source",
  'routes/Watches.tsx m.watches.sourceLabel': "a field's mode: what the suggestions start from",
  'routes/ProjectDetail.tsx m.project.workspace.kindLabel': "a form's field: a local folder or an SSH host",
}

/** Each SegmentedControl outside TabbedSection, as its file and the source of its `label`. */
const switches = SOURCES.filter((path) => path !== join('components', 'TabbedSection.tsx')).flatMap((path) => {
  const text = readFileSync(join(RENDERER, path), 'utf8')
  const ast = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  return elements(ast.program)
    .filter((element) => ((element.openingElement as Node).name as Node).name === 'SegmentedControl')
    .map((element) => {
      const label = ((element.openingElement as Node).attributes as Node[])
        .find((attribute) => (attribute.name as Node | undefined)?.name === 'label')
      const value = (label?.value as Node | undefined)?.expression as Node | undefined
      return `${path} ${value === undefined ? '?' : text.slice(value.start, value.end)}`
    })
})

describe('标签页组', () => {
  it('切换一个板块内容的分段切换都由 TabbedSection 组装，别处的分段切换都不是标签页组', () => {
    expect(switches.filter((key) => !Object.hasOwn(NOT_TAB_GROUPS, key))).toEqual([])
    expect(Object.keys(NOT_TAB_GROUPS).filter((key) => !switches.includes(key))).toEqual([])
  })
})
