// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatDesignPreview, ChatMessage, ExperimentDesign } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const DESIGN: ExperimentDesign = {
  "claim": {
    "text": "大 batch 下，按接受率动态调整草稿树宽度，端到端吞吐高于固定宽度。",
    "status": "hypothesis"
  },
  "explanations": {
    "m1": "动态宽度把验证预算投向接受率高的位置，少验证注定被拒的分支。",
    "m2": "收益只来自平均宽度变窄：同等平均宽度的固定窄树一样快。",
    "m0": "测量假象：batch 组成、预热或请求长度两组没有对齐。"
  },
  "predictions": [
    {
      "regime": "B 从 16 到 64，对照为等平均宽度的固定树",
      "m1": "差距随 B 增大",
      "m2": "差距消失",
      "m0": "差距不稳定",
      "metric": "吞吐 tok/s",
      "chosen": true
    },
    {
      "regime": "宽度与接受率脱钩，宽度分布不变",
      "m1": "收益消失",
      "m2": "收益保留",
      "m0": "无变化",
      "metric": "接受长度",
      "chosen": false
    },
    {
      "regime": "B = 1",
      "m1": "收益小或为负",
      "m2": "收益小",
      "m0": null,
      "metric": "单请求延迟",
      "chosen": false
    }
  ],
  "experiment": {
    "substrate": "component",
    "keeps": "真实 GPU 上随 batch 变化的验证开销，和真实的接受率分布",
    "untested": "到达流量、调度器与草稿头训练"
  },
  "decisions": [
    {
      "pattern": "输出分布偏离目标模型，或两组平均宽度相差超过 5%",
      "outcome": "invalid",
      "interpretation": "检验无效",
      "next": "修正对齐后重跑"
    },
    {
      "pattern": "等平均宽度的固定树与动态宽度相差不到 2%",
      "outcome": "alternative",
      "interpretation": "支持 M2：收益来自变窄",
      "next": "改写主张，另立 M2 节点"
    },
    {
      "pattern": "B ≥ 32 时吞吐高至少 8%，CI 不含 0，脱钩后收益消失",
      "outcome": "expand",
      "interpretation": "支持 M1",
      "next": "扩展到完整服务系统"
    },
    {
      "pattern": "B ≥ 32 时差距可辨但低于 8%",
      "outcome": "below-gate",
      "interpretation": "机制成立，收益不够",
      "next": "记结论，不扩展"
    },
    {
      "pattern": "B ≥ 32 时差距的 95% CI 落在 ±2% 内",
      "outcome": "kill",
      "interpretation": "排除所需效应",
      "next": "确认后关闭节点"
    },
    {
      "pattern": "CI 跨过 0 且宽于 ±8%",
      "outcome": "inconclusive",
      "interpretation": "无法判定",
      "next": "增加请求块"
    }
  ],
  "ledger": [
    {
      "statement": "加速比主要取决于草稿的接受率",
      "status": "source",
      "anchor": {
        "kind": "wiki",
        "ref": "topics/kv-cache-quantization#per-channel-keys"
      }
    },
    {
      "statement": "已有工作按接受率调整树宽",
      "status": "source",
      "anchor": {
        "kind": "wiki",
        "ref": "topics/kv-cache-quantization"
      }
    },
    {
      "statement": "大 batch 下验证开销成为主要成本",
      "status": "inference",
      "anchor": null
    },
    {
      "statement": "动态宽度的收益随 batch 增大",
      "status": "new-hypothesis",
      "anchor": null
    }
  ]
}
const api = vi.hoisted(() => ({
  preview: vi.fn<(id: string, messageId: string) => Promise<unknown>>(),
  save: vi.fn<(id: string, messageId: string, fingerprint: string) => Promise<unknown>>(),
  opened: vi.fn(),
}))
vi.mock('../../ipc.js', () => ({
  chat: { designPreview: api.preview, saveDesign: api.save },
  wiki: { cards: async () => [{ id: 'topics/kv-cache-quantization', title: 'KV cache 量化' }] },
}))
vi.mock('../../shell/AppShell.js', () => ({
  useJump: () => ({ jump: null, open: api.opened, returnTo: vi.fn(), enter: vi.fn() }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../../hooks/useVaultWrite.js', () => ({ useVaultWrite: () => async (op: Promise<unknown>) => { await op; return true } }))

const { ChatMessageView } = await import('./ChatMessage.js')

const PREVIEW: ChatDesignPreview = {
  idea: { title: DESIGN.claim.text, body: 'M1：一\nM2：二\nM0：三', project: { id: 'spec', name: '推测解码加速' } },
  file: { name: '实验设计-msg-9.md', markdown: '---\ntype: experiment-design\n---\n\n# 主张\n\n## Decision table\n\n| Result pattern | Node state |\n| --- | --- |\n| 无效 | repairable |\n' },
  nodes: {
    hypothesis: { title: DESIGN.claim.text, under: { id: 'b', label: '动态树宽' } },
    experiment: { title: 'B 从 16 到 64，对照为等平均宽度的固定树', history: '2026-10-27: declared decision table: 无效 → repairable' },
  },
  fingerprint: '0123456789abcdef',
  saved: null,
}

describe('the design card under an answer', () => {
  let root: Root
  let host: HTMLElement

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    api.preview.mockReset().mockResolvedValue(PREVIEW)
    api.save.mockReset().mockResolvedValue({ id: 'idea-7' })
  })
  afterEach(() => { act(() => root.unmount()) })

  const answer: ChatMessage = { id: 'msg-9', role: 'ai', runs: [{ kind: 'text', text: '可以测。' }], actions: [], design: DESIGN }
  const show = async (message: ChatMessage, chat: string | null = 'chat-3') => {
    await act(async () => root.render(<MessagesProvider><ChatMessageView chat={chat} message={message} onAct={() => {}} /></MessagesProvider>))
  }
  const headings = () => [...host.querySelectorAll('.design-card [role="heading"]')].map((heading) => heading.textContent)
  const tables = () => [...host.querySelectorAll<HTMLTableElement>('.design-card table')]
  const button = (name: string) => [...host.querySelectorAll('button')].find((held) => held.textContent === name)
  const writesToggle = () => [...host.querySelectorAll('button')].find((held) => held.textContent!.startsWith('将写入'))!

  it('shows the claim, explanations, predictions, smallest experiment, decisions and evidence under the answer text', async () => {
    await show(answer)

    expect(host.querySelector('.answer')!.textContent!.startsWith('可以测。')).toBe(true)
    expect(headings()).toEqual(['主张', '解释', '预测', '最小实验', '决策', '证据', '将写入'])
    expect(host.querySelector('.design-claim')!.textContent).toBe(`假设${DESIGN.claim.text}`)
    const [predictions, decisions, ledger] = tables()
    expect(predictions!.querySelectorAll('tbody tr')).toHaveLength(DESIGN.predictions.length)
    expect(predictions!.querySelector('tbody tr:last-child')!.textContent).toContain('未知')
    expect([...decisions!.querySelectorAll('tbody tr')].map((row) => row.lastElementChild!.textContent)).toEqual([
      '待修复', '待修复', '已验证', '已验证', '失败', '候选 / 搁置',
    ])
    expect(ledger!.querySelector('tbody tr')!.textContent).toBe('加速比主要取决于草稿的接受率来源KV cache 量化 · 断言')
  })

  it('wraps every table\'s cells and shows all six decision rows without scrolling inside the table', async () => {
    await show(answer)

    for (const table of tables()) {
      expect(table.classList.contains('table--wrap')).toBe(true)
      expect(table.closest<HTMLElement>('.table-scroll')!.style.maxHeight).toBe('')
    }
  })

  it('keeps 将写入 folded until it is opened, then shows the idea, its whole file and the two nodes, and confirms with the fingerprint shown', async () => {
    await show(answer)
    const toggle = writesToggle()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('.design-writes')).toBeNull()

    await act(async () => toggle.click())
    const writes = host.querySelector('.design-writes')!
    expect(api.preview).toHaveBeenCalledWith('chat-3', 'msg-9')
    for (const text of [
      DESIGN.claim.text, 'M1：一', 'M0：三', '推测解码加速', '实验设计-msg-9.md', '无效', 'repairable',
      '推测解码加速 · 动态树宽 之下', 'B 从 16 到 64，对照为等平均宽度的固定树', '2026-10-27: declared decision table: 无效 → repairable',
    ]) expect(writes.textContent).toContain(text)
    expect(writes.querySelector('.diff')).toBeNull()
    expect(writes.textContent).not.toContain('---')
    expect(writes.textContent).not.toContain('| Result pattern |')
    expect(writes.querySelector('h1')!.textContent).toBe('主张')
    expect([...writes.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual(['Result pattern', 'Node state'])
    expect([...writes.querySelectorAll('.property')].map((row) => row.textContent)).toContain('typeexperiment-design')

    await act(async () => button('确认写入')!.click())
    expect(api.save).toHaveBeenCalledWith('chat-3', 'msg-9', '0123456789abcdef')
  })

  it('shows a design already saved as its idea, with nothing left to confirm', async () => {
    api.preview.mockResolvedValue({ ...PREVIEW, saved: 'idea-7' })
    await show(answer)
    expect(host.textContent).toContain('已存为想法')

    await act(async () => writesToggle().click())
    expect(button('确认写入')).toBeUndefined()
    const idea = [...host.querySelectorAll<HTMLElement>('.design-writes a')].find((link) => link.textContent === DESIGN.claim.text)!
    await act(async () => idea.click())
    expect(api.opened).toHaveBeenCalledWith('ideas', 'idea-7')
  })

  it('shows no card under an answer without a design', async () => {
    await show({ ...answer, design: undefined })
    expect(host.querySelector('.design-card')).toBeNull()
    expect(api.preview).not.toHaveBeenCalled()
  })
})
