import { describe, expect, it } from 'vitest'
import type { PaperRow } from '../../../shared/contract.js'
import { buildResearchMap } from './research-map.js'

const paper = (id: string, title: string, patch: Partial<PaperRow> = {}): PaperRow => ({
  id, title, venue: 'arXiv', topics: [], methods: [], datasets: [], metrics: [], pageState: 'draft',
  readState: '未读', projects: [], pageCount: 1, noteCount: 0, conclusionCount: 0,
  updated: '2026-09-21', custom: {}, ...patch,
})

describe('buildResearchMap', () => {
  it('keeps overlapping, explainable memberships without changing the input papers', () => {
    const rows = [
      paper('a', 'Fast speculative decoding with draft models', {
        topics: ['Speculative decoding'], projects: [{ id: 'p', name: 'Faster inference' }],
      }),
      paper('b', 'Speculative decoding through token distillation', {
        methods: ['Speculative decoding'], projects: [{ id: 'p', name: 'Faster inference' }],
      }),
      paper('c', 'Reliable speculative decoding at scale'),
      paper('d', 'Quantization for faster inference', { projects: [{ id: 'p', name: 'Faster inference' }] }),
      paper('e', 'Unrelated vision benchmark'),
    ]
    const before = structuredClone(rows)

    const map = buildResearchMap(rows)
    const speculative = map.groups.find((group) => group.label.toLocaleLowerCase() === 'speculative decoding')
    const project = map.groups.find((group) => group.kind === 'project')

    expect(speculative?.members.map((member) => member.paper.id)).toEqual(expect.arrayContaining(['a', 'b', 'c']))
    expect(speculative?.members.find((member) => member.paper.id === 'a')?.reasons)
      .toContainEqual({ kind: 'topic', label: 'Speculative decoding' })
    expect(project?.members.map((member) => member.paper.id)).toEqual(expect.arrayContaining(['a', 'b', 'd']))
    expect(map.overlapping).toBeGreaterThan(0)
    expect(rows).toEqual(before)
  })

  it('does not invent a group from a signal that appears only once', () => {
    const map = buildResearchMap([
      paper('a', 'Singular mechanism', { topics: ['Only once'] }),
      paper('b', 'Different subject'),
    ])
    expect(map.groups.some((group) => group.label === 'Only once')).toBe(false)
  })
})
