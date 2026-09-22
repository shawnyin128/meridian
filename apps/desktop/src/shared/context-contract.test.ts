import { describe, expect, it } from 'vitest'
import fixture from './fixtures/meridian-context-v1.json' with { type: 'json' }
import { CONTEXT_SCHEMA_VERSION, ContextPacketSchema } from './context-contract.js'


describe('context contract', () => {
  it('accepts the cross-runtime v1 fixture', () => {
    const packet = ContextPacketSchema.parse(fixture)

    expect(packet.schema_version).toBe(CONTEXT_SCHEMA_VERSION)
    expect(packet.results[0]?.id).toBe('wiki:papers/example')
    expect(packet.results[0]?.memberships[0]?.id).toBe('topics/speculative-decoding')
  })

  it('keeps physical roots and writable operations outside the packet', () => {
    expect(() => ContextPacketSchema.parse({ ...fixture, wiki_root: '/private/library/wiki' })).toThrow()
    expect(() => ContextPacketSchema.parse({ ...fixture, operations: [{ op: 'setBody' }] })).toThrow()
  })
})
