import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packagedHarnessEnvironment } from './harness-sidecar.js'

describe('packaged Harness sidecar environment', () => {
  it('runs checkout development through the project Conda environment', () => {
    expect(packagedHarnessEnvironment(false, '/resources', 'darwin')).toEqual({
      MERIDIAN_HARNESS_CONDA_ENV: 'meridian',
    })
  })

  it('points installed macOS and Linux builds at the bundled executable', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      expect(packagedHarnessEnvironment(true, '/resources', platform)).toEqual({
        MERIDIAN_HARNESS_EXECUTABLE: join('/resources', 'harness', 'meridian-harness'),
      })
    }
  })

  it('uses the executable suffix required by Windows', () => {
    expect(packagedHarnessEnvironment(true, 'C:\\resources', 'win32')
      .MERIDIAN_HARNESS_EXECUTABLE).toMatch(/meridian-harness\.exe$/)
  })
})
