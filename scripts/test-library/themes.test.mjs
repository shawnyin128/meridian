import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listColourThemes } from '../../apps/desktop/src/core/colour-themes.ts'
import { contrastShortfalls } from '../../apps/desktop/src/shared/colour-theme.ts'
import { CELADON, seedColourTheme } from './themes.mjs'

const temporary = []
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('测试库里的自定义主题', () => {
  it('种子写进配置目录的青瓷主题文件,App 读得出来,浅色和深色都达到每个对比度目标', () => {
    const out = mkdtempSync(join(tmpdir(), 'meridian-seed-theme-'))
    temporary.push(out)
    seedColourTheme(out)
    expect(listColourThemes(join(out, 'config'))).toEqual([{ state: 'readable', file: 'celadon.json', theme: CELADON }])
    expect([...contrastShortfalls(CELADON.light, 'light'), ...contrastShortfalls(CELADON.dark, 'dark')]).toEqual([])
  })
})
