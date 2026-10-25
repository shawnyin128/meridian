import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'
import { zh } from '../renderer/messages/zh/index.js'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every renderer source file as `path` and text, stylesheet comments removed. */
const FILES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(css|tsx)$/.test(path) && !/\.test\./.test(path))
  .map((path) => ({ path, text: readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))

const sectionRule = FILES.find((file) => file.path.endsWith('EmptyState.css'))!.text
  .match(/\.empty-state--section\{([^}]*)\}/)![1]!

describe('空态', () => {
  it('分节空态与上面的标题齐平、高一行列表行，切换同一位置的标签页时不跳', () => {
    expect(sectionRule).toContain('min-height:var(--row-list-h)')
    expect(sectionRule).not.toMatch(/padding/)
  })

  it('列表的每一行和空着的分节一样，都是一行列表行高，标签页里也是', () => {
    const item = FILES.find((file) => file.path.endsWith(join('components', 'Item.css')))!.text
    const rowRule = item.match(/(?:^|\})\s*\.item--row\{([^}]*)\}/)?.[1] ?? ''
    expect(rowRule).toContain('min-height:var(--row-list-h)')
  })

  it('没有哪一页再手搭空态', () => {
    const handBuilt = FILES.flatMap(({ path, text }) => ['direction-empty', 'paper-wiki-review-empty', 'rgempty', 'className="lm"']
      .filter((mark) => text.includes(mark)).map((mark) => `${path}: ${mark}`))
    expect(handBuilt).toEqual([])
  })

  it('空态不写句子：每个 EmptyState 都不带文字，只有一个共享的空值和一个无结果', () => {
    const worded = FILES.filter(({ path }) => path.endsWith('.tsx')).flatMap(({ path, text }) => {
      const found: string[] = []
      const visit = (node: unknown): void => {
        if (node === null || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(visit); return }
        const held = node as { type?: string; openingElement?: { name?: { name?: string } }; children?: unknown[]; loc?: { start: { line: number } } }
        if (held.type === 'JSXElement' && held.openingElement?.name?.name === 'EmptyState' && (held.children ?? []).length > 0) {
          found.push(`${path}:${held.loc!.start.line}`)
        }
        for (const [key, value] of Object.entries(held)) if (key !== 'loc') visit(value)
      }
      visit(parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program)
      return found
    })
    expect([worded, zh.common.empty, zh.common.noResults]).toEqual([[], '—', '无结果'])
  })
})
