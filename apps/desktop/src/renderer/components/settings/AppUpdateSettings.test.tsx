import { describe, expect, it } from 'vitest'
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
})
