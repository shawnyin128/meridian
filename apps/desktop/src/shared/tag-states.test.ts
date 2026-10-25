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

describe('冲突要注意，不是失败', () => {
  it('结论冲突处处是警告：Wiki 整理、实验结论、动态里的简报、Wiki 论断，以及项目需要决定的事和项目推进', () => {
    const states = {
      tidy: /'open-conflict': '(\w+)'/.exec(source('components/wiki/WikiTidy.tsx'))?.[1],
      conclusion: /conflicting: '(\w+)'/.exec(source('components/project/ProjectConclusions.tsx'))?.[1],
      brief: /<Tag state="(\w+)">\{item\.tag\}<\/Tag>/.exec(source('routes/Feed.tsx'))?.[1],
      claim: /<Tag state="(\w+)">\{c\.conflict\}<\/Tag>/.exec(source('components/wiki/WikiClaims.tsx'))?.[1],
    }
    const signals = readFileSync(join(import.meta.dirname, 'project-signals.ts'), 'utf8')
    expect({
      ...states,
      decision: /id: 'conflict', rank: 0, kind: m\.kind\.conflict, tone: '(\w+)'/.exec(signals)?.[1],
      pulse: /first\?\.id === 'conflict'\) return \{ tone: '(\w+)'/.exec(signals)?.[1],
    }).toEqual({ tidy: 'warning', conclusion: 'warning', brief: 'warning', claim: 'warning', decision: 'warn', pulse: 'warn' })
  })
})
