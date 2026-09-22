import { describe, expect, it } from 'vitest'
import { ProjectCreateRelationParamsSchema, RelationSchema } from './contract.js'

describe('web-address relations', () => {
  it('accepts http and https addresses and rejects every other scheme', () => {
    const item = (url: string) => RelationSchema.safeParse({ id: 'rel-1', text: 'x', url }).success
    expect(item('https://example.com/a?b=1')).toBe(true)
    expect(item('http://localhost:8080')).toBe(true)
    expect(item('javascript:alert(1)')).toBe(false)
    expect(item('file:///C:/secret.txt')).toBe(false)
    expect(item('example.com')).toBe(false)
  })

  it('validates the address on the create call too', () => {
    const create = (url: string) => ProjectCreateRelationParamsSchema.safeParse({
      projectId: 'p', relation: { group: 'links', text: 'x', url },
    }).success
    expect(create('https://example.com')).toBe(true)
    expect(create('javascript:alert(1)')).toBe(false)
  })
})
