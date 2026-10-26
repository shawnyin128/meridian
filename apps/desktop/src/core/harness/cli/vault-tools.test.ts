import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFixtureStore } from '../../fixture-store.js'
import { vaultTools } from './vault-tools.js'

const STAR = '13979-STAR-Speculative-Decodin'
const MIXTRAL = 'Jiang-et-al-2024-Mixtral-of-Experts'
/** A paper whose source PDF the fixture vault does not hold. */
const NO_SOURCE = 'A-ConvNet-for-the-2020s'

beforeEach(() => {
  vi.stubEnv('MERIDIAN_LIBRARY_ROOT', resolve(import.meta.dirname, '../../fixtures/vault'))
})
afterEach(() => {
  vi.unstubAllEnvs()
})

/** The answer of tool `name` to `args`, parsed when it is not an error. */
async function ask(tools: ReturnType<typeof vaultTools>, name: string, args: unknown) {
  const result = await tools.call(name, args)
  if (result === null) throw new Error(`no tool ${name}`)
  return result.isError ? { error: result.text } : JSON.parse(result.text) as Record<string, unknown>
}

describe('the internal MCP server\'s vault tools', () => {
  it('offer the paper tools only to a run about a paper, and nothing that writes', () => {
    const store = createFixtureStore()
    expect(vaultTools(store, {}).definitions.map((tool) => tool.name))
      .toEqual(['title_search', 'wiki_page', 'project_summary'])
    const tools = vaultTools(store, { paperId: STAR })
    expect(tools.definitions.map((tool) => tool.name))
      .toEqual(['paper_search', 'paper_page', 'title_search', 'wiki_page', 'project_summary'])
    expect(tools.call('write_page', { id: 'methods/rotation' })).toBeNull()
    for (const tool of tools.definitions) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
  })

  it('name no page the vault holds in their descriptions, so a model finds ids by searching', () => {
    const store = createFixtureStore()
    const pages = [...store.wikiCards().map((card) => card.id), `papers/${STAR}`, `papers/${MIXTRAL}`]
    const texts = vaultTools(store, { paperId: STAR }).definitions.flatMap((tool) => [
      tool.description,
      ...Object.values(tool.inputSchema['properties'] as Record<string, { description?: string }>)
        .map((property) => property.description ?? ''),
    ])
    for (const text of texts) for (const page of pages) expect(text).not.toContain(page)
  })

  it('give every tool a closed schema whose strings and numbers are bounded', () => {
    for (const tool of vaultTools(createFixtureStore(), { paperId: STAR }).definitions) {
      expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false })
      const properties = Object.values(tool.inputSchema['properties'] as Record<string, Record<string, unknown>>)
      expect(properties.length).toBeGreaterThan(0)
      for (const property of properties) {
        expect(property['type'] === 'string' ? property['maxLength'] : property['maximum']).toEqual(expect.any(Number))
      }
    }
  })

  it('read only the run\'s own paper, page by page and by search', async () => {
    const tools = vaultTools(createFixtureStore(), { paperId: STAR })

    expect(await ask(tools, 'paper_page', { page: 2 })).toEqual({ page: 2, pages: 2, text: 'Reader fixture page 2' })
    expect(await ask(tools, 'paper_search', { query: 'page 2' }))
      .toEqual({ passages: [{ page: 2, text: 'Reader fixture page 2' }, { page: 1, text: 'Reader fixture page 1' }] })
    expect(await ask(tools, 'paper_search', { query: 'Mixtral' })).toEqual({ passages: [] })
    expect(await ask(tools, 'paper_page', { page: 3 })).toEqual({ error: 'Page 3 does not exist; the paper has pages 1-2.' })
    expect(await ask(tools, 'paper_page', { page: 1, paperId: MIXTRAL })).toEqual({ error: expect.stringContaining('Invalid arguments') })
  })

  it('answer a paper whose source PDF the vault lacks with an error', async () => {
    const tools = vaultTools(createFixtureStore(), { paperId: NO_SOURCE })
    expect(await ask(tools, 'paper_page', { page: 1 })).toEqual({ error: 'The vault holds no source PDF for this paper.' })
  })

  it('search the titles of Wiki pages, papers and projects only', async () => {
    const tools = vaultTools(createFixtureStore(), {})

    expect(await ask(tools, 'title_search', { query: 'per-CHANNEL' })).toEqual({
      wiki: [{ id: 'methods/per-channel-scaling', kind: '方法', title: 'Per-channel scaling' }], papers: [], projects: [],
    })
    expect(await ask(tools, 'title_search', { query: 'mixtral experts' }))
      .toMatchObject({ wiki: [], papers: [{ id: `papers/${MIXTRAL}`, title: 'Mixtral of Experts' }], projects: [] })
    expect(await ask(tools, 'title_search', { query: 'EAGLE-2' }))
      .toMatchObject({ projects: [{ id: 'repro', name: '复现 EAGLE-2' }] })
    // A chat, a task and an idea are not looked up, even by their exact titles.
    for (const query of ['摊薄的前提是共享前缀吗', '宽树实验 B≥8', '动态分配 draft model 的蒸馏预算']) {
      expect(await ask(tools, 'title_search', { query })).toEqual({ wiki: [], papers: [], projects: [] })
    }
    expect((await ask(tools, 'title_search', { query: 'a' }))['papers']).toHaveLength(8)
  })

  it('read the Wiki pages and projects the vault holds, and refuse any other id', async () => {
    const tools = vaultTools(createFixtureStore(), {})

    expect(await ask(tools, 'wiki_page', { id: 'methods/rotation' })).toMatchObject({
      id: 'methods/rotation', kind: '方法', title: 'Rotation', summary: expect.stringContaining('正交矩阵'),
    })
    expect(await ask(tools, 'wiki_page', { id: `papers/${MIXTRAL}` })).toMatchObject({ title: 'Mixtral of Experts' })
    for (const id of ['../../../etc/passwd', 'papers/no-such-paper', 'chats/amortize']) {
      expect(await ask(tools, 'wiki_page', { id })).toEqual({ error: `The vault has no Wiki page ${id}.` })
    }
    expect(await ask(tools, 'project_summary', { id: 'repro' })).toMatchObject({
      name: '复现 EAGLE-2', topics: ['speculative decoding'], focus: '对齐官方实现的评测脚本',
      papers: [{ id: 'papers/2210.17323', title: 'GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers' }],
    })
    expect(await ask(tools, 'project_summary', { id: 'amortize' })).toEqual({ error: 'The vault has no project amortize.' })
  })
})
