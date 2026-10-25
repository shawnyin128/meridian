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

  it('names a failure of the update files as such, never as a library write', () => {
    expect(updateLine({ phase: 'error', reason: 'update-files', current: '0.0.19.0' }, catalogFor('zh')))
      .toBe('检查更新失败：没能读写更新文件')
    expect(updateLine({ phase: 'error', reason: 'update-files', current: '0.0.19.0' }, catalogFor('en')))
      .toBe('Update check failed: Could not access the update files')
  })
})
