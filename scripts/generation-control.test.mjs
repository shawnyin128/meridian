import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLES = join(process.cwd(), 'apps/desktop/src/renderer/components/GenerationControl.css')

describe('生成中的停止控件', () => {
  it('停止方块和转圈一直显示，不用悬停或聚焦才露出来', () => {
    const rules = readFileSync(STYLES, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^}]*\}/g) ?? []
    const hiding = rules.filter((rule) => /\.generation-stop|\.ring/.test(rule.split('{')[0]) && /display\s*:\s*none/.test(rule))
    expect(rules.some((rule) => rule.includes('.generation-stop'))).toBe(true)
    expect(hiding).toEqual([])
  })
})
