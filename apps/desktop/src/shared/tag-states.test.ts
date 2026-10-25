import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')
const source = (path: string) => readFileSync(join(RENDERER, path), 'utf8')

/** Every component source under the renderer, tests excluded. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

/** The states a tag's text may take a colour for; every other tag is neutral. */
const STATES = ['error', 'warning', 'done', 'p0', 'p1']

describe('标签只给状态着色', () => {
  it('标签只认状态，没有别的色调:哪个屏都不给标签传 tone', () => {
    const toned = SOURCES.flatMap((path) => [...source(path).matchAll(/<(Tag|TagButton|ProjectSignalKind|NoModelTag)\b[^>]*?\btone=/g)]
      .map((match) => `${path}  <${match[1]} tone=…>`))
    expect(toned).toEqual([])
  })

  it('标签的样式表只给错误、警告、完成、P0 和 P1 写字的颜色，底色处处是同一种中性色', () => {
    const rules = [...source('components/Tag.css').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    const coloured = rules.filter(([, , body]) => /(^|;)\s*color:var\(--(bad|warn|good)-text\)/.test(body!))
      .flatMap(([, selector]) => selector!.split(',').map((part) => /^\.tag--([\w-]+)$/.exec(part.trim())?.[1] ?? part.trim()))
    expect(coloured.sort()).toEqual([...STATES].sort())
    const fills = rules.filter(([, , body]) => /(^|;)\s*background:/.test(body!)).map(([, selector]) => selector!.trim())
    expect(fills).toEqual(['.tag'])
  })
})
