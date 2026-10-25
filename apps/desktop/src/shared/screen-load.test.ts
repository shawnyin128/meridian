import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every renderer source, tests excluded, as its path relative to the renderer and its text. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map((path) => ({ path, source: readFileSync(join(RENDERER, path), 'utf8') }))

/**
 * Every screen: each route and Settings pane that calls Core and each source that shows a page
 * error; a section that shows the error its screen hands it is not one.
 */
const SCREENS = SOURCES
  .filter(({ path, source }) => (path.startsWith('routes/') && source.includes("from '../ipc.js'"))
    || (path.startsWith('components/settings/') && source.includes("from '../../ipc.js'"))
    || /<PageError(?![^>]*variant="section")/.test(source))

/** The screens whose error is not a screen load's, each with what its error is. */
const OWN_ERROR: Record<string, string> = {
  'components/PageShell.tsx': 'defines the page error and the page failure that shows one',
  'components/settings/AppearanceSettings.tsx': 'reads nothing; hands a failed theme deletion to Settings',
  'components/settings/ThemeEditor.tsx': 'reads nothing; shows why the last save failed until the next one starts',
}

/** A hand-written load error: a caught error put into the screen's own error state. */
const HAND_WRITTEN = [/\.catch\(reportError\)/, /setError\(errorLabel\(/]

type Node = { type: string; start: number; end: number; [key: string]: unknown }

/**
 * Every loading placeholder in the source file `path` that no condition naming a failure (an
 * `error`, `failed` or `failure` value) guards, as `<path>:<line>`.
 */
function unguardedPlaceholders(path: string, source: string): string[] {
  const found: string[] = []
  const visit = (node: unknown, guards: string[]) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach((item) => visit(item, guards)); return }
    const held = node as Node
    const name = held.type === 'JSXElement' ? ((held['openingElement'] as Node)['name'] as Node)['name'] : null
    if (name === 'LoadingPlaceholder' && !guards.some((test) => /(error|Error|failed|[fF]ailure)\b/.test(test))) {
      found.push(`${path}:${(held['loc'] as { start: { line: number } }).start.line}`)
    }
    const test = held.type === 'ConditionalExpression' || held.type === 'IfStatement' ? held['test'] as Node
      : held.type === 'LogicalExpression' && held['operator'] === '&&' ? held['left'] as Node : null
    const inner = test === null ? guards : [...guards, source.slice(test.start, test.end)]
    for (const [key, value] of Object.entries(held)) if (key !== 'loc') visit(value, inner)
  }
  visit(parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program, [])
  return found
}

/** The sources whose placeholder ends by another flag, each with what ends it. */
const ENDS_OTHERWISE: Record<string, string> = {
  'components/AboutDialog.tsx': 'a running update check ends in another phase, a failed one in the error phase',
  'components/paper-table/ResearchMap.tsx': 'loading ends when the map read settles, failed or not',
  'components/SshFolderPicker.tsx': 'loading ends when the folder listing settles, failed or not',
  'routes/Reader.tsx': 'loading is false once the screen load has failed',
}

describe('屏的读取错误', () => {
  it('屏上不手写读取错误：没有 .catch(reportError)，也没有 setError(errorLabel(', () => {
    const copies = SCREENS.filter(({ path }) => !(path in OWN_ERROR)).flatMap(({ path, source }) => source.split('\n').flatMap((line, at) => (
      HAND_WRITTEN.some((pattern) => pattern.test(line)) ? [`${path}:${at + 1}`] : []
    )))
    expect(copies).toEqual([])
  })

  it('每个屏都从 useScreenLoad 取它的读取和错误', () => {
    expect(SCREENS.filter(({ path, source }) => !(path in OWN_ERROR) && !source.includes('useScreenLoad('))
      .map(({ path }) => path).sort()).toEqual([])
  })

  it('读取占位都有失败的分支：读失败时不一直停在占位上', () => {
    expect(SOURCES.filter(({ path }) => !(path in ENDS_OTHERWISE))
      .flatMap(({ path, source }) => (path.endsWith('.tsx') ? unguardedPlaceholders(path, source) : []))).toEqual([])
  })

  it('点名靠别的标志收起占位的文件都还有占位', () => {
    expect(Object.keys(ENDS_OTHERWISE).filter((path) => !SOURCES.some((file) => file.path === path && file.source.includes('<LoadingPlaceholder'))))
      .toEqual([])
  })

  it('点名自带错误的文件都还是屏', () => {
    expect(Object.keys(OWN_ERROR).filter((path) => !SCREENS.some((screen) => screen.path === path))).toEqual([])
  })
})
