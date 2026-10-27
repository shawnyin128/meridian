import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HttpGet } from '../net/http.js'
import {
  BUNDLED_PLUGIN_VERSION, createPluginVersionCheck, LATEST_PLUGIN_URL, PLUGIN_CHECK_EVERY_MS,
  PLUGIN_FIRST_CHECK_MS, PLUGIN_TICK_MS,
} from './latest.js'

const temporary: string[] = []
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** `BUNDLED_PLUGIN_VERSION` with its patch number moved by `step`. */
const patched = (step: number) => {
  const [major, minor, patch] = BUNDLED_PLUGIN_VERSION.split('.').map(Number) as [number, number, number]
  return `${major}.${minor}.${patch + step}`
}

function setup(answer: () => Promise<{ status: number; body: string }>) {
  const root = mkdtempSync(join(tmpdir(), 'meridian-plugin-latest-'))
  temporary.push(root)
  const file = join(root, 'config', 'plugin-latest.json')
  const urls: string[] = []
  const get: HttpGet = async (url) => {
    urls.push(url)
    const { status, body } = await answer()
    return { status, body: new TextEncoder().encode(body) }
  }
  let clock = Date.parse('2026-09-22T00:00:00Z')
  const seen: string[] = []
  const make = () => createPluginVersionCheck({ get, file, now: () => clock, onLatest: (v) => seen.push(v) })
  return { file, urls, seen, make, advance: (ms: number) => { clock += ms } }
}

describe('createPluginVersionCheck', () => {
  it('没查过时用打包时的插件版本', () => {
    const { make } = setup(async () => ({ status: 200, body: '' }))
    expect(make().latest()).toBe(BUNDLED_PLUGIN_VERSION)
    expect(make().checkedAt()).toBeNull()
  })

  it('读到 master 上更新的版本就用它，并且重启后还记得', async () => {
    const newer = patched(1)
    const { make, urls, seen } = setup(async () => ({ status: 200, body: `${newer}\n` }))
    expect(await make().check()).toBe(newer)
    expect(urls).toEqual([LATEST_PLUGIN_URL])
    expect(seen).toEqual([newer])
    expect(make().latest()).toBe(newer)
    expect(make().checkedAt()).toBe('2026-09-22T00:00:00.000Z')
  })

  it('master 上的版本比打包的旧时仍用打包的', async () => {
    const { make } = setup(async () => ({ status: 200, body: patched(-1) }))
    expect(await make().check()).toBe(BUNDLED_PLUGIN_VERSION)
  })

  it('断网、非 200 或读回来的不是版本号：保留已知版本，不写文件也不通知', async () => {
    for (const answer of [
      async () => { throw new Error('offline') },
      async () => ({ status: 404, body: 'Not Found' }),
      async () => ({ status: 200, body: '<html>' }),
    ]) {
      const { make, file, seen } = setup(answer)
      expect(await make().check()).toBe(BUNDLED_PLUGIN_VERSION)
      expect(existsSync(file)).toBe(false)
      expect(seen).toEqual([])
    }
  })

  it('新版本在文件里多写的键不影响读出已知版本,再查到新版本写回时原样留着', async () => {
    const newer = patched(2)
    const { make, file } = setup(async () => ({ status: 200, body: newer }))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ version: patched(1), checkedAt: '2026-09-21T00:00:00.000Z', source: { branch: 'master' } }))
    const check = make()
    expect(check.latest()).toBe(patched(1))
    expect(check.checkedAt()).toBe('2026-09-21T00:00:00.000Z')
    expect(await check.check()).toBe(newer)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      version: newer, checkedAt: '2026-09-22T00:00:00.000Z', source: { branch: 'master' },
    })
  })

  it('读不了的文件报出来,当作没查过,用打包时的插件版本', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const text of ['not json', JSON.stringify({ version: 2, checkedAt: '2026-09-21T00:00:00.000Z' })]) {
      const { make, file } = setup(async () => ({ status: 200, body: '' }))
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text)
      const check = make()
      expect(check.latest()).toBe(BUNDLED_PLUGIN_VERSION)
      expect(check.checkedAt()).toBeNull()
      expect(reported).toHaveBeenLastCalledWith(expect.stringContaining(file))
    }
  })

  it('启动后先查一次，之后每六小时查一次', async () => {
    vi.useFakeTimers()
    const { make, urls, advance } = setup(async () => ({ status: 200, body: BUNDLED_PLUGIN_VERSION }))
    const stop = make().arm()
    await vi.advanceTimersByTimeAsync(PLUGIN_FIRST_CHECK_MS)
    expect(urls).toHaveLength(1)
    advance(PLUGIN_CHECK_EVERY_MS - PLUGIN_TICK_MS)
    await vi.advanceTimersByTimeAsync(PLUGIN_TICK_MS)
    expect(urls).toHaveLength(1)
    advance(PLUGIN_TICK_MS)
    await vi.advanceTimersByTimeAsync(PLUGIN_TICK_MS)
    expect(urls).toHaveLength(2)
    stop()
  })
})
