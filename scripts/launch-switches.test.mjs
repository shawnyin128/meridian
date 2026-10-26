import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const E2E = readdirSync(join(ROOT, 'e2e')).filter((name) => name.endsWith('.ts')).map((name) => `e2e/${name}`)

describe('自动化启动的开关', () => {
  it('e2e 和测试库的启动都用模拟钥匙串，不碰登录钥匙串', () => {
    expect(read('e2e/app.ts')).toMatch(/export const MOCK_KEYCHAIN = '--use-mock-keychain'/)
    expect(read('e2e/app.ts')).toMatch(/export const LAUNCH_SWITCHES = \[[^\]]*MOCK_KEYCHAIN[^\]]*\]/)
    expect(read('scripts/test-library/app.mjs')).toMatch(/const appArgs = \(out\) => \[[^\]]*'--use-mock-keychain'[^\]]*\]/)
  })

  it('e2e 里每一次启动 App 都带上这些开关', () => {
    const bare = E2E.flatMap((path) => read(path).split('\n')
      .map((line, at) => ({ line, at: at + 1 }))
      .filter(({ line }) => /\bargs: \[|spawnSync\(ELECTRON, \[/.test(line))
      .filter(({ line }) => !/LAUNCH_SWITCHES|MOCK_KEYCHAIN|zhArgs\(/.test(line))
      .map(({ at }) => `${path}:${at}`))
    expect(bare).toEqual([])
  })
})
