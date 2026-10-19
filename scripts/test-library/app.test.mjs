import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readsCannedNetFile } from './app.mjs'

const asar = createRequire(import.meta.url)('@electron/asar')

let home = ''
afterEach(() => rmSync(home, { recursive: true, force: true }))

/** Writes `text` to `path` under `home`, creating its folders, and returns the full path. */
const put = (path, text) => {
  mkdirSync(join(home, path, '..'), { recursive: true })
  writeFileSync(join(home, path), text)
  return join(home, path)
}

/** A macOS App bundle whose Info.plist states stored version `version`. */
const bundle = (version) => {
  put(`${version}/Meridian.app/Contents/Info.plist`, '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n  <dict>\n'
    + `    <key>CFBundleName</key>\n    <string>Meridian</string>\n    <key>CFBundleShortVersionString</key>\n    <string>${version}</string>\n`
    + '  </dict>\n</plist>\n')
  return join(home, version, 'Meridian.app')
}

describe('种子按 App 版本决定导入时是否联网', () => {
  it('0.0.16.0 之前的 App 读不了缓存文件，导入走网络；0.0.16.0 起从缓存回答', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-app-'))
    expect(readsCannedNetFile(bundle('0.0.14'))).toBe(false)
    expect(readsCannedNetFile(bundle('0.0.15004'))).toBe(false)
    expect(readsCannedNetFile(bundle('0.0.16000'))).toBe(true)
    expect(readsCannedNetFile(bundle('0.0.16001'))).toBe(true)
    expect(readsCannedNetFile(bundle('0.1.0'))).toBe(true)
  })

  it('从 checkout 的 App 文件夹的 package.json 读版本', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-app-'))
    put('old/package.json', JSON.stringify({ name: '@meridian/desktop', version: '0.0.15004' }))
    put('new/package.json', JSON.stringify({ name: '@meridian/desktop', version: '0.0.16000' }))
    expect(readsCannedNetFile(join(home, 'old'))).toBe(false)
    expect(readsCannedNetFile(join(home, 'new'))).toBe(true)
  })

  it('从 Meridian.exe 旁边 resources/app.asar 里的 package.json 读版本', async () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-app-'))
    for (const version of ['0.0.15004', '0.0.16000']) {
      put(`${version}/packed/package.json`, JSON.stringify({ name: '@meridian/desktop', version }))
      await asar.createPackage(join(home, version, 'packed'), join(home, version, 'win-unpacked', 'resources', 'app.asar'))
      put(`${version}/win-unpacked/Meridian.exe`, '')
    }
    expect(readsCannedNetFile(join(home, '0.0.15004', 'win-unpacked', 'Meridian.exe'))).toBe(false)
    expect(readsCannedNetFile(join(home, '0.0.16000', 'win-unpacked', 'Meridian.exe'))).toBe(true)
  })

  it('读不出版本时报错', () => {
    home = mkdtempSync(join(tmpdir(), 'meridian-test-library-app-'))
    put('broken/Meridian.app/Contents/Info.plist', '<plist version="1.0"><dict></dict></plist>')
    expect(() => readsCannedNetFile(join(home, 'broken', 'Meridian.app'))).toThrow(/version/)
  })
})
