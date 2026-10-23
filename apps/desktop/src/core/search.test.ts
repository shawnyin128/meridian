import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault: two paper pages with source PDFs, two topics and one method. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** The fixture paper page with a source PDF. */
const WITH_SOURCE = '13979-STAR-Speculative-Decodin'
const STAR = '论文：STAR: SPECULATIVE DECODING WITH SEARCHABLE DRAFTING AND TARGET-AWARE REFINEMENT FOR MULTIMODAL GENERATION'

/** A paper page with authors and no source PDF, written into each copy. */
const NO_PDF = 'Shazeer-2017-Outrageously-Large'

/** A read-later entry whose paper is not in the vault, shaped like `.meridian/later.json`. */
const LATER = {
  id: 'later-1', title: 'Rotation Revisited', source: '主题 · quantization', added: '2026-09-02',
  authors: 'Li et al.', venue: 'ICLR 2026', abstract: '……', paper: 'paper-pdf-000000000001',
}

/** A paper page as the vault stores it: `fields` as frontmatter lines, then `body`. */
const paperPage = (fields: string[], body: string): string =>
  ['---', 'type: "paper"', ...fields, 'created: "2026-05-20"', 'updated: "2026-05-20"', 'memberships: []', '---', body, ''].join('\n')

/** An aggregation page as the vault stores it, with no generated regions. */
const topicPage = (title: string, body: string): string =>
  ['---', 'kind: "topic"', `title: ${JSON.stringify(title)}`, 'aliases: []', 'parents: []', 'columns: []',
    'updated: "2026-05-20"', '---', body, ''].join('\n')

describe('全局搜索', () => {
  let vault: string
  let store: VaultStore

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-search-'))
    cpSync(VAULT, vault, { recursive: true })
    writeFileSync(join(vault, 'wiki', 'papers', `${NO_PDF}.md`), paperPage(
      ['title: "Outrageously Large Neural Networks"', 'authors:', '  - "Noam Shazeer"', '  - "Azalia Mirhoseini"', 'year: 2017'],
      '## 这篇说了什么\n这篇**论文**把专家混合层扩到上千亿参数，见 [[topics/speculative-decoding|投机解码]]。',
    ))
    mkdirSync(join(vault, '.meridian'))
    writeFileSync(join(vault, '.meridian', 'later.json'), JSON.stringify([LATER]))
    store = createVaultStore(vault)
  })

  afterEach(() => { rmSync(vault, { recursive: true, force: true }) })

  it('按作者搜到论文,命中处是作者那一行;库里没有原文的那篇注明没有 PDF', () => {
    expect(store.search('Mirhoseini')).toEqual([{
      kind: 'paper', target: NO_PDF, title: '论文：Outrageously Large Neural Networks', meta: '2017',
      snippet: 'Noam Shazeer, Azalia Mirhoseini', pdf: false,
    }])
    expect(store.search('STAR')[0]).toEqual({ kind: 'paper', target: WITH_SOURCE, title: STAR, meta: '', pdf: true })
  })

  it('笔记与高亮里记得的半句话搜得到那篇论文,落点是那条笔记或高亮和它的页', () => {
    const note = store.mutatePaperReading(WITH_SOURCE, {
      kind: 'note.add', page: 3, text: '草稿头只用一层 decoder，参数量不到目标模型的 1%。',
    }).notes[0]!
    const highlight = store.mutatePaperReading(WITH_SOURCE, {
      kind: 'highlight.add', page: 2, quote: 'searchable drafting retrieves candidate tokens', color: 'yellow',
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    }).highlights[0]!

    expect(store.search('一层 decoder')).toEqual([{
      kind: 'paper', target: WITH_SOURCE, title: STAR, meta: '',
      snippet: '草稿头只用一层 decoder，参数量不到目标模型的 1%。', anchor: { note: note.id, page: 3 }, pdf: true,
    }])
    expect(store.search('retrieves tokens')).toEqual([{
      kind: 'paper', target: WITH_SOURCE, title: STAR, meta: '',
      snippet: 'searchable drafting retrieves candidate tokens', anchor: { highlight: highlight.id, page: 2 }, pdf: true,
    }])
  })

  it('想法、任务、Wiki 正文与稍后阅读里的论文都搜得到,各带打开它要的目标', () => {
    const chat = store.createChat('显存讨论', true)
    const idea = store.createIdea(chat.id, 'KV 显存预算按层分配', '浅层少给，深层多给。')
    store.createProject('压缩实验')
    const project = store.listProjects().find((p) => p.name === '压缩实验')!.id
    const task = store.createTask(project, {
      title: '跑 2bit 基线', start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p1',
      note: '## 要求\n- 先测**显存**峰值，再测吞吐',
    }).tasks[0]!

    expect(store.search('显存')).toEqual([
      { kind: 'chat', target: chat.id, title: '对话：显存讨论', meta: '对话' },
      { kind: 'idea', target: idea.id, title: '想法：KV 显存预算按层分配', meta: '' },
      {
        kind: 'aggregation', target: 'methods/kv-compression', title: '方法：KV-cache compression', meta: 'Wiki',
        snippet: '压缩或裁掉 KV cache,让长序列与多路草稿放得进显存。',
      },
      {
        kind: 'task', target: project, title: '任务：跑 2bit 基线', meta: '压缩实验',
        snippet: '先测显存峰值，再测吞吐', anchor: { task: task.id },
      },
    ])
    expect(store.search('深层多给')).toEqual([
      { kind: 'idea', target: idea.id, title: '想法：KV 显存预算按层分配', meta: '', snippet: '浅层少给，深层多给。' },
    ])
    expect(store.search('Rotation Revisited')).toEqual([
      { kind: 'later', target: 'later-1', title: '稍后阅读：Rotation Revisited', meta: 'ICLR 2026' },
    ])
    expect(store.search('Li et al')).toEqual([
      { kind: 'later', target: 'later-1', title: '稍后阅读：Rotation Revisited', meta: 'ICLR 2026', snippet: 'Li et al.' },
    ])
  })

  it('类别名不参与匹配:搜「论文」不列出每一篇,标题里有它的排在正文里有它的前面', () => {
    const chat = store.createChat('路由', true)
    const idea = store.createIdea(chat.id, '论文里的路由实验', '换成熵正则。')
    expect(store.search('论文')).toEqual([
      { kind: 'idea', target: idea.id, title: '想法：论文里的路由实验', meta: '' },
      {
        kind: 'paper', target: NO_PDF, title: '论文：Outrageously Large Neural Networks', meta: '2017',
        snippet: '这篇论文把专家混合层扩到上千亿参数，见 投机解码。', pdf: false,
      },
    ])
    expect(store.search('项目：')).toEqual([])
  })

  it('新项目存的默认领域在搜索结果里写成未分领域', () => {
    store.createProject('压缩实验')
    expect(store.search('压缩实验')[0]).toMatchObject({ kind: 'project', meta: '进行中 · 未分领域' })
  })

  it('项目有几个领域时,搜索结果的说明按次序全列出来', () => {
    const id = store.createProject('压缩实验')
    store.updateProject(id, { topics: ['KV cache', '量化'] })
    expect(store.search('压缩实验')[0]).toMatchObject({ kind: 'project', meta: '进行中 · KV cache、量化' })
  })

  it('论文和与它同名的对话一样好地命中时,论文排在对话前面', () => {
    const chat = store.createChat('Mixtral of Experts', true)
    expect(store.search('Mixtral').map((h) => [h.kind, h.target])).toEqual([
      ['paper', 'Jiang-et-al-2024-Mixtral-of-Experts'], ['chat', chat.id],
    ])
  })

  it('标题以查询开头的排最前,词首命中的其次,词中间命中的再次,不论类别', () => {
    store.createProject('复现 Mixtral 路由')
    const project = store.listProjects().find((p) => p.name === '复现 Mixtral 路由')!.id
    expect(store.search('m').slice(0, 4)).toEqual([
      expect.objectContaining({ kind: 'paper', title: '论文：Mixtral of Experts' }),
      expect.objectContaining({ kind: 'project', target: project }),
      expect.objectContaining({ kind: 'paper', title: STAR }),
      expect.objectContaining({ kind: 'aggregation', title: '方法：KV-cache compression' }),
    ])
  })
})

/** Words the synthetic vault's titles and bodies are drawn from. */
const WORDS = [
  'attention', 'sparse', 'decoding', 'speculative', 'quantization', 'kernel', 'cache', 'routing', 'expert',
  'latency', 'throughput', 'memory', 'distillation', 'pruning', 'retrieval', 'context', 'benchmark', 'tokens',
  '显存', '吞吐', '延迟', '草稿', '量化', '路由', '专家', '蒸馏', '剪枝', '检索', '上下文', '基准',
]

/** The `n`th pseudo-random sentence of `size` words, the same on every run. */
const sentence = (n: number, size: number): string =>
  Array.from({ length: size }, (_, at) => WORDS[(n * 7 + at * 13 + (n >> 3)) % WORDS.length]).join(' ')

describe('全局搜索的耗时', () => {
  let vault: string

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-search-500-'))
    mkdirSync(join(vault, 'wiki', 'papers'), { recursive: true })
    mkdirSync(join(vault, 'wiki', 'topics'))
    mkdirSync(join(vault, 'sources', 'papers'), { recursive: true })
    mkdirSync(join(vault, '.meridian'))
    cpSync(join(VAULT, 'wiki', 'schema.yaml'), join(vault, 'wiki', 'schema.yaml'))
    const readings = []
    for (let n = 0; n < 500; n += 1) {
      const source = `paper-pdf-${String(n).padStart(12, '0')}`
      writeFileSync(join(vault, 'wiki', 'papers', `p${n}.md`), paperPage(
        [`title: "Paper ${n}: ${sentence(n, 6)}"`, 'authors:', `  - "Author ${n} Alpha"`, `  - "Author ${n} Beta"`,
          `year: ${2015 + (n % 11)}`, 'venue: "arXiv"', `source_id: "${source}"`],
        Array.from({ length: 12 }, (_, line) => `${line % 4 === 0 ? '## ' : ''}${sentence(n + line, 18)}`).join('\n'),
      ))
      writeFileSync(join(vault, 'sources', 'papers', `${source}-p${n}.pdf`), '')
      if (n % 2 === 0) {
        readings.push({
          paperId: `p${n}`,
          highlights: Array.from({ length: 3 }, (_, at) => ({
            id: `highlight-${n}-${at}`, page: at + 1, quote: sentence(n + at, 14), color: 'yellow',
            rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }], note: sentence(n + at + 1, 8),
            created: '2026-09-01', updated: '2026-09-01',
          })),
          notes: Array.from({ length: 2 }, (_, at) => ({
            id: `note-${n}-${at}`, page: at + 1, text: sentence(n + at + 2, 16), created: '2026-09-01', updated: '2026-09-01',
          })),
          remark: '',
        })
      }
    }
    for (let n = 0; n < 40; n += 1) {
      writeFileSync(join(vault, 'wiki', 'topics', `t${n}.md`), topicPage(`Topic ${n} ${sentence(n, 2)}`,
        Array.from({ length: 20 }, (_, line) => sentence(n * 3 + line, 20)).join('\n')))
    }
    writeFileSync(join(vault, '.meridian', 'paper-readings.json'), JSON.stringify(readings))
    writeFileSync(join(vault, '.meridian', 'ideas.json'), JSON.stringify(Array.from({ length: 100 }, (_, n) => ({
      id: `idea-${n}`, title: `Idea ${n} ${sentence(n, 4)}`, body: sentence(n + 5, 30),
      source: { chatTitle: 'synthetic' }, archived: false, created: '2026-09-01', updated: '2026-09-01',
    }))))
    writeFileSync(join(vault, '.meridian', 'later.json'), JSON.stringify(Array.from({ length: 100 }, (_, n) => ({
      ...LATER, id: `later-${n}`, title: `Later ${n} ${sentence(n, 5)}`, paper: `paper-pdf-9${String(n).padStart(11, '0')}`,
    }))))
  })

  afterEach(() => { rmSync(vault, { recursive: true, force: true }) })

  it('500 篇论文、各带笔记与高亮的库里,短词、长句、中文与搜不到的词每次都在预算内返回', () => {
    const store = createVaultStore(vault)
    for (let n = 0; n < 5; n += 1) {
      store.createProject(`Project ${n}`)
      const id = store.listProjects().find((p) => p.name === `Project ${n}`)!.id
      for (let t = 0; t < 10; t += 1) {
        store.createTask(id, {
          title: `Task ${t} ${sentence(t, 3)}`, start: '2026-09-10', end: '2026-09-10', state: 'plan', priority: 'p1',
          note: sentence(n + t, 12),
        })
      }
    }
    const queries = ['a', 'p', 'attention', 'Author 250', 'sparse routing memory', '显存', '草稿 延迟', 'no-such-word']
    const medians = Object.fromEntries(queries.map((query) => {
      store.search(query)
      const runs = Array.from({ length: 7 }, () => {
        const start = performance.now()
        store.search(query)
        return performance.now() - start
      }).sort((a, b) => a - b)
      return [query, Math.round(runs[3]! * 10) / 10]
    }))
    console.log(`500 篇论文的库里每次搜索的中位耗时(毫秒) ${JSON.stringify(medians)}`)
    expect(store.search('Author 250')[0]).toMatchObject({ kind: 'paper', target: 'p250', snippet: 'Author 250 Alpha, Author 250 Beta' })
    for (const ms of Object.values(medians)) expect(ms).toBeLessThan(100)
  }, 30_000)
})
