import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readsCannedNetFile } from './app.mjs'

let home = ''
afterEach(() => rmSync(home, { recursive: true, force: true }))

/** Writes `contents` to `path` under `home`, creating its folders, and returns the full path. */
const put = (path, contents) => {
  mkdirSync(join(home, path, '..'), { recursive: true })
  writeFileSync(join(home, path), contents)
  return join(home, path)
}

const reading = "const cannedFile = process.env['MERIDIAN_CANNED_NET_FILE']"
const older = "const canned = vaultRoot === undefined || process.env['MERIDIAN_CANNED_NET'] === '1'"
/** Bytes laid out like an asar archive: a binary header, then the packed scripts as plain text. */
const asar = (script) => Buffer.concat([Buffer.from([4, 0, 0, 0, 0xc8, 0x01, 0, 0]), Buffer.from(`{"files":{}}${script}`)])

describe('种子按 App 的代码决定导入时是否联网', () => {
  it('checkout 构建的代码读取缓存文件时从缓存回答，否则走网络', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-app-'))
    for (const [name, core] of [['new', reading], ['old', older]]) {
      put(`${name}/package.json`, JSON.stringify({ version: '0.0.15004' }))
      put(`${name}/out/main/index.js`, 'require("electron")')
      put(`${name}/out/core/index.js`, core)
    }
    expect(readsCannedNetFile(join(home, 'new'))).toBe(true)
    expect(readsCannedNetFile(join(home, 'old'))).toBe(false)
  })

  it('打包的 macOS App 和 Windows App 看 app.asar 里有没有读取缓存文件的代码', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-app-'))
    put('mac-new/Meridian.app/Contents/Resources/app.asar', asar(reading))
    put('mac-old/Meridian.app/Contents/Resources/app.asar', asar(older))
    put('win-new/resources/app.asar', asar(reading))
    put('win-old/resources/app.asar', asar(older))
    expect(readsCannedNetFile(join(home, 'mac-new', 'Meridian.app'))).toBe(true)
    expect(readsCannedNetFile(join(home, 'mac-old', 'Meridian.app'))).toBe(false)
    expect(readsCannedNetFile(put('win-new/Meridian.exe', ''))).toBe(true)
    expect(readsCannedNetFile(put('win-old/Meridian.exe', ''))).toBe(false)
  })

  it('找不到 App 的代码时报错', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-app-'))
    mkdirSync(join(home, 'empty', 'Meridian.app', 'Contents'), { recursive: true })
    expect(() => readsCannedNetFile(join(home, 'empty', 'Meridian.app'))).toThrow(/ENOENT/)
  })
})
