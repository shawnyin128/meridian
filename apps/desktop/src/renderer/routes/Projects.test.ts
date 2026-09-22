import { describe, expect, it } from 'vitest'
import { zh } from '../messages/zh/index.js'
import { projectPaperCountLabel } from './Projects.js'

describe('projectPaperCountLabel', () => {
  it('explains the empty relationship instead of rendering a bare zero', () => {
    expect(projectPaperCountLabel(0, zh)).toBe('还没有关联论文。')
  })

  it('labels a non-empty count as linked papers', () => {
    expect(projectPaperCountLabel(3, zh)).toBe('关联论文 3 篇')
  })
})
