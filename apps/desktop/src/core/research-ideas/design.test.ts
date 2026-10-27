import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExperimentDesign } from '../../shared/contract.js'
import { createFixtureStore } from '../fixture-store.js'
import experimentDesign from '../fixtures/experiment-design.json' with { type: 'json' }
import type { VaultStore } from '../vault.js'
import { createVaultStore } from '../vault-store.js'
import { designPreview, designSections, saveDesignAsIdea } from './index.js'

const DESIGN = experimentDesign as ExperimentDesign

/** A chat in `store` whose answer carries `design`, after a question that mentions `project` when given. */
function designChat(store: VaultStore, design: ExperimentDesign = DESIGN, project?: string) {
  const chat = store.createChat('动态树宽', true).id
  store.appendChatMessages(chat, [
    {
      role: 'you', actions: [],
      runs: project === undefined ? [{ kind: 'text', text: '设计实验' }]
        : [{ kind: 'mention', text: '@效率', target: { kind: 'project', id: project } }, { kind: 'text', text: ' 设计实验' }],
    },
    { role: 'ai', runs: [{ kind: 'text', text: '可以测。' }], actions: [], design },
  ])
  return { chat, message: store.chatMessages(chat).at(-1)!.id }
}

describe('saving a chat\'s experiment design as an idea', () => {
  it('previews the idea titled by the claim, its Markdown file, and the two nodes under the mentioned project\'s active node', () => {
    const store = createFixtureStore()
    const { chat, message } = designChat(store, DESIGN, 'draft')
    const preview = designPreview(store, chat, message, 'zh')

    expect(preview.idea).toEqual({
      title: DESIGN.claim.text,
      body: `M1：${DESIGN.explanations.m1}\nM2：${DESIGN.explanations.m2}\nM0：${DESIGN.explanations.m0}`,
      project: { id: 'draft', name: 'draft 效率' },
    })
    expect(preview.nodes).toEqual({
      hypothesis: { title: DESIGN.claim.text, under: { id: 'wide', label: '宽树补 B≥8' } },
      experiment: { title: 'B 从 16 到 64，对照为等平均宽度的固定树', history: expect.stringMatching(/：声明决策表：/) },
    })
    expect(preview.file.name).toBe(`实验设计-${message}.md`)
    expect(preview.file.markdown).toContain('type: experiment-design')
    expect(preview.file.markdown).toContain(designSections(DESIGN, 'zh'))
    expect(preview.file.markdown).toContain('放在项目「draft 效率」的节点「宽树补 B≥8」之下')
    expect(preview.file.markdown).toContain(`   ${preview.nodes.experiment.history}`)
    expect(preview.file.markdown).toContain('不为 M2 或 M0 建节点')
    expect(preview.fingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(preview.saved).toBeNull()
  })

  it('places the hypothesis as a root when the chat mentions no project', () => {
    const store = createFixtureStore()
    const { chat, message } = designChat(store)
    const preview = designPreview(store, chat, message, 'zh')

    expect(preview.idea.project).toBeNull()
    expect(preview.nodes.hypothesis.under).toBeNull()
    expect(preview.file.markdown).toContain('1. 假设节点「大 batch 下，按接受率动态调整草稿树宽度，端到端吞吐高于固定宽度。」，作为根节点。')
    expect(preview.file.markdown).not.toContain('parent_project:')
    expect(preview.file.markdown).not.toContain('parent_node:')
  })

  it('declares every decision row with the node state it sets on one history line', () => {
    const store = createFixtureStore()
    const { chat, message } = designChat(store)
    const { history } = designPreview(store, chat, message, 'zh').nodes.experiment

    expect(history.split('\n')).toHaveLength(1)
    expect(history).toContain('输出分布偏离目标模型，或两组平均宽度相差超过 5% → repairable')
    expect(history).toContain('B ≥ 32 时差距的 95% CI 落在 ±2% 内 → dead')
    expect(history).toContain('CI 跨过 0 且宽于 ±8% → unresolved')
  })

  it('keeps pipes, a leading heading mark and a leading list mark from changing the file\'s structure', () => {
    const tricky: ExperimentDesign = {
      ...DESIGN,
      claim: { text: '# 不是标题', status: 'hypothesis' },
      explanations: { ...DESIGN.explanations, m1: '- mode: dead' },
      decisions: DESIGN.decisions.map((decision, at) => (at === 0 ? { ...decision, pattern: 'a | b \\ c' } : decision)),
    }
    const store = createFixtureStore()
    const { chat, message } = designChat(store, tricky)
    const markdown = designPreview(store, chat, message, 'zh').file.markdown

    expect(markdown.split('\n').filter((line) => /^#+ /.test(line))).toEqual([
      '# \\# 不是标题', '## 解释', '## 预测', '## 最小实验', '## 决策', '## 证据', '## Lab 节点',
    ])
    expect(markdown).toContain('- M1: \\- mode: dead')
    expect(markdown).toContain('hypothesis_node: "# 不是标题"')
    const table = markdown.split('## 决策')[1]!.split('##')[0]!.trim().split('\n')
    expect(table).toHaveLength(2 + DESIGN.decisions.length)
    expect(table[2]).toBe('| a \\| b \\\\ c | 检验无效 | 修正对齐后重跑 | repairable |')
    expect(table[2]!.split(/(?<!\\)\|/)).toHaveLength(6)
  })

  it('writes the file a person reads in the App language and keeps the frontmatter the Lab skill reads the same in both', () => {
    const store = createFixtureStore()
    const { chat, message } = designChat(store, DESIGN, 'draft')
    const zh = designPreview(store, chat, message, 'zh')
    const en = designPreview(store, chat, message, 'en')
    const headings = (markdown: string) => markdown.split('\n').filter((line) => /^## /.test(line))
    const frontmatter = (markdown: string) => markdown.split('\n---\n')[0]!.split('\n').slice(1)
      .filter((line) => !line.startsWith('decision_table_history:'))

    expect(headings(zh.file.markdown)).toEqual(['## 解释', '## 预测', '## 最小实验', '## 决策', '## 证据', '## Lab 节点'])
    expect(headings(en.file.markdown)).toEqual([
      '## Explanations', '## Predictions', '## Smallest experiment', '## Decisions', '## Evidence', '## Lab nodes',
    ])
    expect(frontmatter(zh.file.markdown)).toEqual([
      'type: experiment-design', 'claim_status: hypothesis', `hypothesis_node: ${JSON.stringify(DESIGN.claim.text)}`,
      'parent_project: "draft"', 'parent_node: "wide"', `experiment_node: ${JSON.stringify('B 从 16 到 64，对照为等平均宽度的固定树')}`,
    ])
    expect(frontmatter(en.file.markdown)).toEqual(frontmatter(zh.file.markdown))
    expect(zh.file.markdown).toContain(`decision_table_history: ${JSON.stringify(zh.nodes.experiment.history)}`)
    expect([zh.file.name, en.file.name]).toEqual([`实验设计-${message}.md`, `experiment-design-${message}.md`])
    expect(en.fingerprint).not.toBe(zh.fingerprint)
  })

  it('refuses a confirmation whose fingerprint is not that of the preview as it stands, and writes nothing', () => {
    const store = createFixtureStore()
    const { chat, message } = designChat(store, DESIGN, 'draft')
    const before = store.listIdeas().length

    expect(() => saveDesignAsIdea(store, chat, message, '0000000000000000', 'zh')).toThrow(expect.objectContaining({ reason: 'refused' }))
    expect(store.listIdeas()).toHaveLength(before)
  })

  it('fingerprints what the preview shows, so a change of the related project\'s active node changes it', () => {
    const store = createFixtureStore()
    const { chat, message } = designChat(store, DESIGN, 'draft')
    const mentioning = designPreview(store, chat, message, 'zh').fingerprint
    const other = createFixtureStore()
    const plain = designChat(other)

    expect(designPreview(other, plain.chat, plain.message, 'zh').fingerprint).not.toBe(mentioning)
  })

  it('refuses an answer without a design', () => {
    const store = createFixtureStore()
    const chat = store.createChat('无设计', true).id
    store.appendChatMessages(chat, [{ role: 'ai', runs: [{ kind: 'text', text: '答' }], actions: [] }])
    const message = store.chatMessages(chat).at(-1)!.id

    expect(() => designPreview(store, chat, message, 'zh')).toThrow(expect.objectContaining({ reason: 'not-found' }))
  })
})

describe('a saved design in the vault', () => {
  let vault: string
  afterEach(() => { rmSync(vault, { recursive: true, force: true }) })

  it('writes the idea from the chat, its Markdown under .meridian/designs as its file, and refuses saving it twice', () => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-design-save-'))
    cpSync(resolve(import.meta.dirname, '../fixtures/vault'), vault, { recursive: true })
    const store = createVaultStore(vault, () => '2026-10-27')
    const { chat, message } = designChat(store)
    const preview = designPreview(store, chat, message, 'zh')

    const idea = saveDesignAsIdea(store, chat, message, preview.fingerprint, 'zh')

    expect(idea).toMatchObject({ title: DESIGN.claim.text, body: preview.idea.body, source: { chatId: chat } })
    const path = join(vault, '.meridian', 'designs', `${chat}-${message}.md`)
    expect(readFileSync(path, 'utf8')).toBe(preview.file.markdown)
    expect(createVaultStore(vault).listIdeaFiles()).toEqual([{
      idea: idea.id, attachment: { id: expect.any(String), name: preview.file.name, size: expect.stringMatching(/KB$/), path },
    }])
    const again = designPreview(store, chat, message, 'zh')
    expect(again.saved).toBe(idea.id)
    expect(() => saveDesignAsIdea(store, chat, message, again.fingerprint, 'zh')).toThrow(expect.objectContaining({ reason: 'refused' }))
    expect(store.listIdeas().filter((held) => held.title === DESIGN.claim.text)).toHaveLength(1)
  })

  it('stores the design file relative to the vault, so a moved vault still finds it and knows it is saved', () => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-design-save-'))
    cpSync(resolve(import.meta.dirname, '../fixtures/vault'), join(vault, 'before'), { recursive: true })
    const store = createVaultStore(join(vault, 'before'), () => '2026-10-27')
    const { chat, message } = designChat(store)
    const idea = saveDesignAsIdea(store, chat, message, designPreview(store, chat, message, 'zh').fingerprint, 'zh')
    const stored = JSON.parse(readFileSync(join(vault, 'before', '.meridian', 'idea-files.json'), 'utf8')) as Array<{ path: string }>
    expect(stored.map((file) => file.path)).toEqual([`.meridian/designs/${chat}-${message}.md`])

    cpSync(join(vault, 'before'), join(vault, 'after'), { recursive: true })
    rmSync(join(vault, 'before'), { recursive: true, force: true })
    const moved = createVaultStore(join(vault, 'after'), () => '2026-10-27')
    const path = join(vault, 'after', '.meridian', 'designs', `${chat}-${message}.md`)
    expect(moved.listIdeaFiles().map((file) => file.attachment.path)).toEqual([path])
    expect(readFileSync(path, 'utf8')).toContain('type: experiment-design')
    expect(designPreview(moved, chat, message, 'zh').saved).toBe(idea.id)
  })
})
