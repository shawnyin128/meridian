import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExtensionStatus, FeedRun } from '../../shared/contract.js'
import { noteVersionChanges } from './notices.js'

const temporary: string[] = []
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function noticeFile(): string {
  const root = mkdtempSync(join(tmpdir(), 'meridian-notices-'))
  temporary.push(root)
  return join(root, 'version-notices.json')
}

const codex = (state: ExtensionStatus['state'], version?: string): ExtensionStatus => ({
  id: 'codex', name: 'Codex', state, installCommand: 'install', updateCommand: 'update',
  ...(version === undefined ? {} : { version }),
})

function run(file: string, appVersion: string, pluginVersion: string, extensions: ExtensionStatus[]): string[] {
  const posted: string[] = []
  noteVersionChanges({
    file, appVersion, pluginVersion, extensions,
    post: (runs: FeedRun[]) => posted.push(runs.map((part) => part.text).join('')),
  })
  return posted
}

describe('noteVersionChanges', () => {
  it('首次运行只记下版本，不报「已更新」；过期插件对同一个最新插件版本只提醒一次', () => {
    const file = noticeFile()
    expect(run(file, '0.0.3', '0.0.2', [codex('update-required', '0.0.1')])).toEqual([
      '扩展 Codex 还是 0.0.1，最新是 0.0.2。到设置 · 扩展复制更新命令，更新后重启 coding agent 会话。',
    ])
    expect(run(file, '0.0.3', '0.0.2', [codex('update-required', '0.0.1')])).toEqual([])
  })

  it('App 升级只报「已更新」，插件版本没变就不重提插件', () => {
    const file = noticeFile()
    run(file, '0.0.3', '0.0.2', [codex('update-required', '0.0.1')])
    expect(run(file, '0.0.4', '0.0.2', [codex('update-required', '0.0.1')])).toEqual(['Meridian 已更新到 0.0.4。'])
  })

  it('插件出了新版本就对仍过期的插件再提醒一次', () => {
    const file = noticeFile()
    run(file, '0.0.3', '0.0.2', [codex('installed', '0.0.2')])
    expect(run(file, '0.0.3', '0.0.3', [codex('update-required', '0.0.2')])).toEqual([
      '扩展 Codex 还是 0.0.2，最新是 0.0.3。到设置 · 扩展复制更新命令，更新后重启 coding agent 会话。',
    ])
  })

  it('配置目录还不存在时先建目录再记下版本', () => {
    const file = join(noticeFile(), '..', 'not-yet', 'version-notices.json')
    expect(run(file, '0.0.3', '0.0.1', [])).toEqual([])
    expect(run(file, '0.0.4', '0.0.1', [])).toEqual(['Meridian 已更新到 0.0.4。'])
  })

  it('未安装和已是最新的插件不提醒', () => {
    const file = noticeFile()
    expect(run(file, '0.0.3', '0.0.1', [codex('not-installed'), { ...codex('installed', '0.0.1'), id: 'claude-code' }]))
      .toEqual([])
  })

  it('新版本在文件里多写的键不影响读出记下的版本,写回时原样留着', () => {
    const file = noticeFile()
    writeFileSync(file, JSON.stringify({ appVersion: '0.0.3', extensions: ['codex@0.0.2'], seen: { feed: 3 } }))
    expect(run(file, '0.0.4', '0.0.2', [codex('update-required', '0.0.1')])).toEqual(['Meridian 已更新到 0.0.4。'])
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ appVersion: '0.0.4', extensions: ['codex@0.0.2'], seen: { feed: 3 } })
  })

  it('读不了的文件报出来,当作首次运行:不报「已更新」,记下现在的版本', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const text of ['[', JSON.stringify({ appVersion: '0.0.3', extensions: 'codex@0.0.2' })]) {
      const file = noticeFile()
      writeFileSync(file, text)
      expect(run(file, '0.0.4', '0.0.1', [])).toEqual([])
      expect(reported).toHaveBeenLastCalledWith(expect.stringContaining(file))
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ appVersion: '0.0.4', extensions: [] })
    }
  })
})
