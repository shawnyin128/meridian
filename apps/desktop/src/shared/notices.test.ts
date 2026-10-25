import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every renderer source, tests excluded, as its path relative to the renderer and its text. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map((path) => ({ path, source: readFileSync(join(RENDERER, path), 'utf8') }))

/** The success notices that may show without an action, each with why it is not a visible change. */
const WITHOUT_ACTION: Record<string, string> = {
  'm.papers.upload.alreadyInLibrary': 'an import that added nothing changes nothing on screen',
}

type Node = { type?: string; start?: number; end?: number; loc?: { start: { line: number } }; [key: string]: unknown }

/**
 * The success notices of `source` that offer no action: a `notice.success` or `notify.success` call
 * with one argument, and the options of a `write` call (either branch of a conditional) with a `note`
 * but no `action`. Each is named by its file, line and the text of its note.
 */
function bareNotices(path: string, source: string): string[] {
  const found: string[] = []
  const text = (node: Node) => source.slice(node.start, node.end)
  const visit = (node: unknown) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    const held = node as Node
    if (held.type === 'CallExpression') {
      const callee = held['callee'] as Node
      const args = held['arguments'] as Node[]
      if (callee.type === 'MemberExpression' && /^(notice|notify)\.success$/.test(text(callee)) && args.length === 1) {
        found.push(`${path}:${held.loc!.start.line} ${text(args[0]!)}`)
      }
      const options = callee.type === 'Identifier' && callee['name'] === 'write' ? args[1] : undefined
      const branches = options?.type === 'ConditionalExpression' ? [options['consequent'] as Node, options['alternate'] as Node] : [options]
      for (const object of branches) {
        if (object?.type !== 'ObjectExpression') continue
        const properties = object['properties'] as Node[]
        const named = (key: string) => properties.find((property) => (property['key'] as Node | undefined)?.['name'] === key)
        if (named('note') !== undefined && named('action') === undefined) {
          found.push(`${path}:${object.loc!.start.line} ${text(named('note')!['value'] as Node)}`)
        }
      }
    }
    for (const [key, value] of Object.entries(held)) if (key !== 'loc') visit(value)
  }
  visit(parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program)
  return found
}

describe('通知', () => {
  it('成功的通知都带撤销或打开：只确认一个屏上看得到的变化的通知不再弹', () => {
    const bare = SOURCES.flatMap(({ path, source }) => bareNotices(path, source))
      .filter((found) => !Object.keys(WITHOUT_ACTION).some((note) => found.endsWith(` ${note}`)))
    expect(bare).toEqual([])
  })

  it('点名可以不带操作的通知都还在弹', () => {
    const shown = SOURCES.flatMap(({ path, source }) => bareNotices(path, source))
    expect(Object.keys(WITHOUT_ACTION).filter((note) => !shown.some((found) => found.endsWith(` ${note}`)))).toEqual([])
  })
})
