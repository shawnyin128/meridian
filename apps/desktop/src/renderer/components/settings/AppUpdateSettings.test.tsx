import { describe, expect, it } from 'vitest'
import type { AppUpdateStatus } from '../../../shared/app-update.js'
import { en } from '../../messages/en/index.js'
import { zh } from '../../messages/zh/index.js'
import { updateLine } from './AppUpdateSettings.js'

describe('updateLine', () => {
  it('一个开发版本和一个要手动装的新版本都只写短状态', () => {
    expect(updateLine({ phase: 'unsupported', current: '0.0.16.0' }, zh)).toBe('开发版本')
    expect(updateLine({ phase: 'available', version: '0.0.16.1', url: 'https://example.com', current: '0.0.16.0' }, zh))
      .toBe('有新版本 0.0.16.1 · 需手动安装')
    expect(updateLine({ phase: 'unsupported', current: '0.0.16.0' }, en)).toBe('Development build')
    expect(updateLine({ phase: 'available', version: '0.0.16.1', url: 'https://example.com', current: '0.0.16.0' }, en))
      .toBe('Version 0.0.16.1 available · install manually')
  })

  it('其余阶段也只写短状态，不以句号收尾', () => {
    const statuses: AppUpdateStatus[] = [
      { phase: 'idle', current: '0.0.16.0' }, { phase: 'checking', current: '0.0.16.0' },
      { phase: 'latest', current: '0.0.16.0' }, { phase: 'downloading', version: '0.0.16.1', percent: 40, current: '0.0.16.0' },
      { phase: 'ready', version: '0.0.16.1', current: '0.0.16.0' },
    ]
    expect(statuses.map((status) => updateLine(status, zh)))
      .toEqual(['尚未检查更新', '正在检查更新…', '已是最新版本', '正在下载 0.0.16.1（40%）', '0.0.16.1 已下载'])
    expect(statuses.map((status) => updateLine(status, en)))
      .toEqual(['Not checked yet', 'Checking for updates…', 'Up to date', 'Downloading 0.0.16.1 (40%)', '0.0.16.1 downloaded'])
  })
})
