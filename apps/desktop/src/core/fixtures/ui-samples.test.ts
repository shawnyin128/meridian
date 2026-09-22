import { describe, expect, it } from 'vitest'
import type { JobsStatus } from '../../shared/contract.js'
import { withUiSampleUpload } from './ui-samples.js'

const status: JobsStatus = {
  writes: 2,
  uploads: [{
    id: 'real', batch: 1, paperId: 'paper', title: 'Paper', bytes: 10,
    step: 'detect', found: null, error: null,
  }],
  downloads: [],
  fetch: { state: 'idle', checkedAt: null, error: null },
}

describe('withUiSampleUpload', () => {
  it.each([
    [0, 'read'], [2_000, 'detect'], [4_000, 'lookup'], [6_000, 'write'], [8_000, 'read'],
  ] as const)('cycles the visible sample at %i milliseconds', (now, expected) => {
    expect(withUiSampleUpload(status, now).uploads[0]?.step).toBe(expected)
  })

  it('preserves actual jobs without mutating the background snapshot', () => {
    const shown = withUiSampleUpload(status, 0)

    expect(shown.uploads[1]).toBe(status.uploads[0])
    expect(status.uploads).toHaveLength(1)
    expect(shown.writes).toBe(2)
  })
})
