import { describe, expect, it } from 'vitest'
import {
  HARNESS_CAPABILITIES, HARNESS_PROTOCOL_VERSION, parseHarnessMessage, parseHarnessReadyData,
} from './protocol.js'

describe('Harness protocol parser', () => {
  it('accepts the versioned ready event', () => {
    expect(parseHarnessMessage(JSON.stringify({
      type: 'event', id: 0, event: 'ready',
      data: { protocol: HARNESS_PROTOCOL_VERSION, capabilities: [...HARNESS_CAPABILITIES] },
    }))).toMatchObject({ type: 'event', id: 0, event: 'ready' })
    expect(parseHarnessReadyData({
      protocol: HARNESS_PROTOCOL_VERSION,
      capabilities: [...HARNESS_CAPABILITIES],
    })).toEqual({
      protocol: HARNESS_PROTOCOL_VERSION,
      capabilities: [...HARNESS_CAPABILITIES],
    })
  })

  it('rejects malformed or duplicate capability declarations', () => {
    expect(() => parseHarnessReadyData({
      protocol: HARNESS_PROTOCOL_VERSION,
      capabilities: ['chat', 'chat'],
    })).toThrow('unique non-empty strings')
    expect(() => parseHarnessReadyData({
      protocol: HARNESS_PROTOCOL_VERSION,
      capabilities: 'chat',
    })).toThrow('unique non-empty strings')
  })

  it('rejects stdout text and unknown error categories', () => {
    expect(() => parseHarnessMessage('debug output')).toThrow('invalid JSON')
    expect(() => parseHarnessMessage(JSON.stringify({
      type: 'error', id: 1, ok: false,
      error: { kind: 'whatever', message: 'failed' },
    }))).toThrow('Unknown Harness error kind')
  })

  it('rejects protocol drift hidden in extra envelope or ready fields', () => {
    expect(() => parseHarnessMessage(JSON.stringify({
      type: 'response', id: 1, ok: true, result: {}, extra: 'drift',
    }))).toThrow('unknown fields')
    expect(() => parseHarnessReadyData({
      protocol: HARNESS_PROTOCOL_VERSION,
      capabilities: [...HARNESS_CAPABILITIES],
      extra: 'drift',
    })).toThrow('unknown fields')
  })
})
