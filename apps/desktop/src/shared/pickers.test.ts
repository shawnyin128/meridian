import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every component and route source under the renderer, tests excluded, with its text. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))
  .map((path) => [path.split('\\').join('/'), readFileSync(join(RENDERER, path), 'utf8')] as const)

describe('挑一个值,新建和已有的一样', () => {
  it('日期从同一个日历挑:没有原生日期框', () => {
    expect(SOURCES.filter(([, text]) => /type="date"/.test(text)).map(([path]) => path)).toEqual([])
  })

  it('优先级和状态从菜单里挑:没有点一下换下一个值的循环表', () => {
    expect(SOURCES.filter(([, text]) => /\bconst NEXT_[A-Z_]+\b/.test(text)).map(([path]) => path)).toEqual([])
  })

  it('开始和结束只有 DateRangeField 一条规则:没有屏幕自己拦结束早于开始', () => {
    expect(SOURCES.filter(([path, text]) => path !== 'components/FieldPickers.tsx'
      && /dnum\([^)]*\b(start|due|end)\b[^)]*\)\s*[<>]\s*dnum\(/.test(text) && /<DateButton\b/.test(text)).map(([path]) => path))
      .toEqual([])
  })
})
