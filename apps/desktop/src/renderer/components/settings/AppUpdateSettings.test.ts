import { describe, expect, it } from 'vitest'
import { catalogFor } from '../../messages/catalog.js'
import { updateLine } from './AppUpdateSettings.js'

describe('updateLine', () => {
  it('names a failed update check by its reason, in either language', () => {
    expect(updateLine({ phase: 'error', reason: 'unavailable', current: '0.0.16.0' }, catalogFor('zh')))
      .toBe('检查更新失败：网络不可用')
    expect(updateLine({ phase: 'error', reason: 'server', current: '0.0.16.0' }, catalogFor('en')))
      .toBe('Update check failed: Server error')
  })
})
