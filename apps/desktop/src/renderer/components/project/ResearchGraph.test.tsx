// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResearchGraph as Graph, ResearchIdea } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import {
  layoutResearchTree, ResearchGraph, ResearchNodePanel, splitNodeDocument,
} from './ResearchGraph.js'

const withMessages = (node: ReactNode) => <MessagesProvider>{node}</MessagesProvider>

const GRAPH: Graph = {
  nodes: [
    { id: 'root', label: '根节点', state: 'done', x: 0, y: 0, width: 180, writebacks: [] },
    { id: 'probe', label: '动态预算探针', state: 'act', x: 220, y: 0, width: 180, writebacks: [] },
  ],
  edges: [['root', 'probe']],
}

const IDEA: ResearchIdea = {
  id: 'idea-1', title: '用动态预算控制校准成本', body: '先做一个最小探针。',
  source: { chatId: 'chat-1', chatTitle: '论文讨论' }, project: 'draft', node: 'root',
  archived: false, created: '2026-09-17', updated: '2026-09-18',
}

describe('splitNodeDocument', () => {
  it('剥离节点文档开头的 metadata,只留下阅读面板需要的 Markdown 正文', () => {
    expect(splitNodeDocument([
      '- mode: `repairable`',
      '- active: true',
      '- parent: root',
      '',
      '#### Evidence',
      '',
      '结果正文。',
    ].join('\n'))).toEqual({
      metadata: [
        { key: 'mode', value: 'repairable' },
        { key: 'active', value: 'true' },
        { key: 'parent', value: 'root' },
      ],
      body: '#### Evidence\n\n结果正文。',
    })
  })

  it('没有开头 metadata 时保留完整正文', () => {
    expect(splitNodeDocument('#### Result\n\n完成。')).toEqual({
      metadata: [],
      body: '#### Result\n\n完成。',
    })
  })
})

describe('layoutResearchTree', () => {
  it('忽略旧的一字排开坐标,把同一父节点的两个子节点排成同列分叉', () => {
    const layout = layoutResearchTree({
      nodes: [
        { id: 'A', label: 'Root', state: 'done', x: 0, y: 0, width: 180, writebacks: [] },
        { id: 'B', label: 'Parent', state: 'done', x: 220, y: 0, width: 180, writebacks: [] },
        { id: 'D', label: 'Failed', state: 'idle', x: 440, y: 0, width: 180, writebacks: [] },
        { id: 'C', label: 'Active', state: 'act', x: 660, y: 0, width: 180, writebacks: [] },
        { id: 'E', label: 'Leaf', state: 'act', x: 880, y: 0, width: 180, writebacks: [] },
      ],
      edges: [['A', 'B'], ['B', 'C'], ['B', 'D'], ['D', 'C'], ['C', 'E']],
      activeNodes: ['E'],
    })
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    expect(byId.get('C')!.x).toBe(byId.get('D')!.x)
    expect(byId.get('C')!.y).not.toBe(byId.get('D')!.y)
    expect(byId.get('B')!.y).toBe((byId.get('C')!.y + byId.get('D')!.y) / 2)
    expect(layout.edges).toEqual([['A', 'B'], ['B', 'C'], ['B', 'D'], ['C', 'E']])
  })
})

describe('idea and graph association', () => {
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('explains active-path and current-node emphasis with matching legend marks', () => {
    const markup = renderToStaticMarkup(withMessages(
      <ResearchGraph
        graph={{ ...GRAPH, activeNodes: ['probe'] }}
        selected={null} onSelect={vi.fn()}
      />,
    ))
    const host = document.createElement('div')
    host.innerHTML = markup

    expect(host.querySelector('.glegend')?.textContent)
      .toContain('当前研究路径推进中')
    expect(host.querySelector('.legend-path')).not.toBeNull()
    expect(host.querySelector('.legend-node.current')).not.toBeNull()
    expect(host.querySelector('.legend-node.idea')).toBeNull()
  })

  it('marks every active node in progress and every route active, without promoting the ancestor', () => {
    const multi: Graph = {
      nodes: [
        { id: 'root', label: '根节点', state: 'idle', x: 0, y: 0, width: 180, writebacks: [] },
        { id: 'a', label: '分支 A', state: 'act', x: 220, y: 0, width: 180, writebacks: [] },
        { id: 'b', label: '分支 B', state: 'act', x: 220, y: 60, width: 180, writebacks: [] },
      ],
      edges: [['root', 'a'], ['root', 'b']],
      activeNodes: ['a', 'b'],
    }
    const markup = renderToStaticMarkup(withMessages(
      <ResearchGraph graph={multi} selected={null} onSelect={vi.fn()} />,
    ))
    const host = document.createElement('div')
    host.innerHTML = markup

    expect(host.querySelectorAll('.rgn.active-leaf')).toHaveLength(2)
    expect(host.querySelector('[data-node="a"]')?.classList.contains('active-leaf')).toBe(true)
    expect(host.querySelector('[data-node="b"]')?.classList.contains('active-leaf')).toBe(true)
    expect(host.querySelector('[data-node="root"]')?.classList.contains('active-leaf')).toBe(false)
    expect(host.querySelector('[data-node="root"]')?.classList.contains('active-path-node-graph')).toBe(true)
    expect(host.querySelectorAll('.redges path.active')).toHaveLength(2)
    expect(host.querySelectorAll('.active-edge-flows path')).toHaveLength(2)
  })

  it('lets the keyboard reach every node and select it with Enter or Space', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const onSelect = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(withMessages(<ResearchGraph graph={GRAPH} selected={null} onSelect={onSelect} />)))
    const nodes = [...host.querySelectorAll<SVGGElement>('.rgn')]
    expect(nodes.map((node) => [node.getAttribute('role'), node.getAttribute('tabindex')]))
      .toEqual([['button', '0'], ['button', '0']])
    act(() => { nodes[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    act(() => { nodes[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    act(() => { nodes[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })) })
    expect(onSelect.mock.calls).toEqual([['probe'], ['root']])
    act(() => root.unmount())
  })

  it('pans a node that takes keyboard focus outside the view into it, and leaves the view alone for a pointer', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const wide: Graph = {
      nodes: Array.from({ length: 8 }, (_, at) => ({
        id: `n${at}`, label: `节点 ${at}`, state: 'done' as const, x: 0, y: 0, width: 180, writebacks: [],
      })),
      edges: Array.from({ length: 7 }, (_, at) => [`n${at}`, `n${at + 1}`] as [string, string]),
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(withMessages(<ResearchGraph graph={wide} selected={null} onSelect={vi.fn()} />)))
    const view = () => host.querySelector('svg > g')!.getAttribute('transform')
    const last = host.querySelector<SVGGElement>('[data-node="n7"]')!
    const start = view()
    const keyboard = vi.spyOn(Element.prototype, 'matches').mockReturnValue(false)
    act(() => last.focus())
    expect(view()).toBe(start)
    last.blur()
    keyboard.mockImplementation((selector) => selector === ':focus-visible')
    act(() => last.focus())
    keyboard.mockRestore()
    const [, x] = /translate\((-?[\d.]+),/.exec(view()!)!
    expect(Number(x)).toBeLessThan(0)
    act(() => root.unmount())
    host.remove()
  })

  describe('opening the graph', () => {
    const chain: Graph = {
      nodes: ['甲', '乙', '丙'].map((label, at) => ({
        id: `n${at}`, label, state: 'done' as const, x: 0, y: 0, width: 180, writebacks: [],
      })),
      edges: [['n0', 'n1'], ['n1', 'n2']],
    }
    /** Renders `graph` in a viewport `width` px wide and returns the view's translation and zoom. */
    const open = (graph: Graph, width: number) => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      act(() => root.render(withMessages(<ResearchGraph graph={graph} selected={null} onSelect={vi.fn()} />)))
      const view = () => {
        const [, x, y, zoom] = /translate\((-?[\d.]+),(-?[\d.]+)\) scale\(([\d.]+)\)/
          .exec(host.querySelector('svg > g')!.getAttribute('transform')!)!
        return { x: Number(x), y: Number(y), zoom: Number(zoom) }
      }
      const shown = () => host.querySelector('.graph-zoom-reset')!.textContent
      return { host, root, view, shown }
    }
    afterEach(() => { vi.restoreAllMocks() })

    it('zooms a graph wider than its view out until every node shows, and centres it', () => {
      const { root, view, shown } = open(chain, 600)
      const right = Math.max(...layoutResearchTree(chain).nodes.map((node) => node.x + node.width))
      const { x, zoom } = view()
      expect(zoom).toBeLessThan(1)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x + right * zoom).toBeLessThanOrEqual(600)
      expect(Math.abs(x - (600 - (x + right * zoom)))).toBeLessThanOrEqual(1)
      expect(shown()).toBe(`${Math.round(zoom * 100)}%`)
      act(() => root.unmount())
    })

    it('opens a graph that fits at 100%', () => {
      const { root, view } = open(chain, 1200)
      expect(view().zoom).toBe(1)
      act(() => root.unmount())
    })

    it('puts the view it opened with back when the view is reset', () => {
      const { host, root, view } = open(chain, 600)
      const opened = view()
      act(() => host.querySelector<HTMLButtonElement>('[aria-label="放大科研图"]')!.click())
      expect(view().zoom).toBeGreaterThan(opened.zoom)
      act(() => host.querySelector<HTMLButtonElement>('.graph-zoom-reset')!.click())
      expect(view()).toEqual(opened)
      act(() => root.unmount())
    })
  })

  it('adds a still hatch only to nodes linked to the open idea', () => {
    const markup = renderToStaticMarkup(withMessages(
      <ResearchGraph graph={GRAPH} selected={null} ideaNodeIds={['root']} onSelect={vi.fn()} />,
    ))
    const host = document.createElement('div')
    host.innerHTML = markup

    expect(host.querySelector('[data-node="root"]')?.classList.contains('idea-related')).toBe(true)
    expect(host.querySelector('[data-node="probe"]')?.classList.contains('idea-related')).toBe(false)
    expect(markup).not.toContain('<animate')
    expect(host.querySelector('[data-node="root"] rect')?.getAttribute('style')).toContain('url(#idea-node-hatch-')
    expect(host.querySelector('.glegend')?.textContent).toContain('当前想法关联')
    expect(host.querySelector('.legend-node.idea')).not.toBeNull()
  })

  it('lists the tasks of the node, then linked ideas, between branches and research events and opens each in place', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const onSelectIdea = vi.fn()
    const onSelectTask = vi.fn()
    const task = { id: 'task-7', title: '重跑延迟矩阵', start: '2026-09-14', end: '2026-09-14', state: 'plan' as const, priority: 'p1' as const, origin: 'agent' as const }
    act(() => root.render(withMessages(
      <ResearchNodePanel
        graph={GRAPH} events={[]} ideas={[IDEA]} tasks={[task]} node={GRAPH.nodes[0]!}
        onClose={vi.fn()} onSelect={vi.fn()} onSelectIdea={onSelectIdea} onSelectTask={onSelectTask}
      />,
    )))

    const headings = [...host.querySelectorAll('.section-heading')].map((heading) => heading.textContent)
    expect(headings.slice(1, 5)).toEqual(['分支 · 1', '任务 · 1', '关联想法 · 1', '科研记录 · 0'])
    expect(host.querySelector('.node-task-row')?.textContent).toBe('重跑延迟矩阵agent')
    act(() => (host.querySelector('.node-task-row') as HTMLButtonElement).click())
    expect(onSelectTask).toHaveBeenCalledWith('task-7')
    expect(host.querySelector('.node-idea-row')?.textContent)
      .toContain('用动态预算控制校准成本')
    expect(host.querySelector('.node-ideas')?.classList.contains('structured-list--embedded')).toBe(true)

    act(() => (host.querySelector('.node-idea-row') as HTMLButtonElement).click())
    expect(onSelectIdea).toHaveBeenCalledWith('idea-1')
    act(() => root.unmount())
  })

  it('uses the shared Markdown surface for node tables', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const node = {
      ...GRAPH.nodes[0]!,
      markdown: '| 指标 | 结果 |\n| --- | --- |\n| 延迟 | 下降 |',
    }
    act(() => root.render(withMessages(
      <ResearchNodePanel
        graph={{ ...GRAPH, nodes: [node, GRAPH.nodes[1]!] }} events={[]} ideas={[]} node={node}
        tasks={[]} onClose={vi.fn()} onSelect={vi.fn()} onSelectIdea={vi.fn()} onSelectTask={vi.fn()}
      />,
    )))

    expect(host.querySelector('.node-markdown > .md table')).not.toBeNull()
    expect(host.querySelectorAll('.node-markdown > .md th')).toHaveLength(2)
    expect(host.querySelectorAll('.node-markdown > .md td')).toHaveLength(2)
    act(() => root.unmount())
  })

  it('renders a structured record row with a kind chip, title, and who, and no node tag', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(withMessages(
      <ResearchNodePanel
        graph={GRAPH}
        events={[{
          date: '2026-09-14', text: '跑通延迟测量', node: 'root', kind: 'result', origin: 'agent',
        }]}
        ideas={[]} node={GRAPH.nodes[0]!}
        tasks={[]} onClose={vi.fn()} onSelect={vi.fn()} onSelectIdea={vi.fn()} onSelectTask={vi.fn()}
      />,
    )))

    const row = host.querySelector('.record-row')
    expect(row?.querySelector('.record-line')?.textContent).toBe('跑通延迟测量')
    expect(row?.querySelector('.project-signal-kind')?.textContent).toBe('实验结果')
    expect(row?.querySelector('.record-who')?.textContent).toBe('agent')
    expect(row?.querySelector('.node-tag')).toBeNull()
    act(() => root.unmount())
  })
})
