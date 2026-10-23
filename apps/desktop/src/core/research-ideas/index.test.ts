import { describe, expect, it } from 'vitest'
import { createResearchIdea, readResearchIdea, updateResearchIdea } from './index.js'

describe('research ideas', () => {
  it('keeps explicit text and source provenance separate', () => {
    const idea = createResearchIdea(
      'idea-1', '  一个方向  ', '  需要验证的机制  ',
      { chatId: 'chat-1', chatTitle: '论文讨论', paperId: 'p1', paperTitle: 'Paper' },
      '2026-09-17',
    )
    expect(idea).toMatchObject({
      title: '一个方向', body: '需要验证的机制', archived: false, created: '2026-09-17',
      source: { chatId: 'chat-1', paperId: 'p1' },
    })
    expect(updateResearchIdea(idea, { body: '进一步验证' }, '2026-09-18')).toMatchObject({
      title: '一个方向', body: '进一步验证', created: '2026-09-17', updated: '2026-09-18',
    })
    const linked = updateResearchIdea(idea, { project: 'project-1', archived: true }, '2026-09-18')
    expect(linked).toMatchObject({ project: 'project-1', archived: true })
    const placed = updateResearchIdea(linked, { node: 'node-1' }, '2026-09-18')
    expect(placed.node).toBe('node-1')
    expect(updateResearchIdea(placed, { node: null }, '2026-09-19').node).toBeUndefined()
    expect(updateResearchIdea(linked, { project: null }, '2026-09-19').project).toBeUndefined()
  })

  it('reads an agent idea an older version attached to its workspace project as sparked there, and nothing else', () => {
    const agent = createResearchIdea('idea-2', '旧 agent 想法', '正文', { chatTitle: '讨论', agent: true }, '2026-10-20')
    expect(readResearchIdea({ ...agent, project: 'project-1' })).toMatchObject({ sourceProject: 'project-1', project: 'project-1' })
    expect(readResearchIdea({ ...agent, project: 'project-1', sourceProject: 'project-2' }).sourceProject).toBe('project-2')
    expect(readResearchIdea(agent)).not.toHaveProperty('sourceProject')
    const chat = createResearchIdea('idea-3', '对话想法', '正文', { chatId: 'chat-1', chatTitle: '讨论' }, '2026-10-20')
    expect(readResearchIdea({ ...chat, project: 'project-1' })).not.toHaveProperty('sourceProject')
  })
})
