import { describe, expect, it } from 'vitest'
import {
  ProjectCreateRelationParamsSchema, ProjectUpdateRelationParamsSchema, RelationSchema,
} from './contract.js'

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

  it('validates the address on the update call too, and the update cannot move the item to another group', () => {
    const update = (relation: object) => ProjectUpdateRelationParamsSchema.safeParse({
      projectId: 'p', relationId: 'rel-1', relation,
    }).success
    expect(update({ text: 'x', url: 'https://example.com' })).toBe(true)
    expect(update({ text: 'x', url: 'javascript:alert(1)' })).toBe(false)
    expect(update({ group: 'links', text: 'x' })).toBe(false)
  })
})
