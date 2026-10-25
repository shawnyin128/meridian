// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOverview } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({ rows: [] as ProjectOverview[], open: vi.fn(), loading: false }))

vi.mock('../ipc.js', () => ({
  project: { overview: () => (api.loading ? new Promise(() => {}) : Promise.resolve(structuredClone(api.rows))) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useJump: () => ({ jump: null, open: api.open }),
  useToday: () => '2026-10-16',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

const { ResearchOverview } = await import('./ResearchOverview.js')

const row = (events: ProjectOverview['events']): ProjectOverview => ({
  id: 'spec', name: '推测解码加速', status: '进行中', priority: 'p0', topic: '推理加速', focus: '动态树宽度原型',
  start: '2026-09-26', due: '2026-11-10', conclusions: { verified: 0, pending: 0, conflicting: 0 },
  tasks: [], milestones: [], events, lastProgress: '2026-10-16',
  research: { pathState: 'empty', activeNodes: [], branches: { active: 0, supported: 0, failed: 0, shelved: 0 } },
})

describe('研究总览的项目推进', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    api.loading = false
  })

  it('项目推进、最近科研记录和接下来的里程碑是汇总出来的，没有内容时整节不显示', async () => {
    api.rows = [{ ...row([]), status: '已完成' }]
    await act(async () => { root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>) })
    const headings = [...host.querySelectorAll('.section-heading')].map((node) => node.textContent)
    expect(headings).not.toContain('项目推进')
    expect(headings).not.toContain('最近科研记录')
    expect(headings).not.toContain('接下来的里程碑')
    expect(host.querySelector('.empty-state')).toBeNull()
  })

  it('屏头只写总览，不带数', async () => {
    api.rows = [row([]), { ...row([]), id: 'other' }]
    await act(async () => { root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>) })
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('总览')
  })

  it('总览还没读到时页面里是载入占位，不是一片空白', async () => {
    api.loading = true
    await act(async () => { root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>) })
    expect(host.querySelector('.desk-body .loading-placeholder')).not.toBeNull()
  })

  it('同一天有几条科研记录时写最后写下的那条,和项目列表卡片取的是同一条', async () => {
    api.rows = [row([
      { date: '2026-09-26', text: '创建项目' },
      { date: '2026-10-16', text: '先写的记录' },
      { date: '2026-10-16', text: '后写的记录' },
    ])]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const cells = host.querySelectorAll('.ovpulse-row[data-proj="spec"] .ovpulse-cell')
    expect(cells[1]!.querySelector('.ovpulse-latest')!.textContent).toBe('后写的记录')
  })

  it('最近科研记录里同一天的记录和项目页一样按时间新的在前,没有时间的按写下的先后', async () => {
    api.rows = [
      row([
        { date: '2026-10-15', text: '昨天' },
        { date: '2026-10-16', text: '早上', at: '2026-10-16T08:00:00+08:00' },
        { date: '2026-10-16', text: '晚上', at: '2026-10-16T21:00:00+08:00' },
      ]),
      { ...row([
        { date: '2026-10-16', text: '中午', at: '2026-10-16T12:00:00+08:00' },
        { date: '2026-10-14', text: '先写的' },
        { date: '2026-10-14', text: '后写的' },
      ]), id: 'kv', name: 'KV cache 量化' },
    ]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    expect([...host.querySelectorAll('.ovcols .ovlist-row .ovlist-main')].map((main) => main.textContent))
      .toEqual(['晚上', '中午', '早上', '昨天', '后写的', '先写的'])
  })

  it('最近科研记录和项目推进里 agent 写的记录都在那一行的末尾带 agent 标签,我写的不带', async () => {
    api.rows = [row([
      { date: '2026-10-15', text: '我记的', kind: 'note' },
      { date: '2026-10-16', text: 'agent 记的', kind: 'result', origin: 'agent' },
    ])]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const recent = [...host.querySelectorAll('.ovcols .ovlist-row')]
      .map((line) => `${line.querySelector('.ovlist-main')!.textContent} ${line.querySelector('.ovlist-meta .source-label')?.textContent ?? '-'}`)
    expect(recent).toEqual(['agent 记的 agent', '我记的 -'])
    const latest = host.querySelectorAll('.ovpulse-row[data-proj="spec"] .ovpulse-cell')[1]!.firstElementChild!
    expect(latest.lastElementChild!.classList.contains('source-label')).toBe(true)
    expect(latest.textContent).toBe('agent 记的agent')
  })

  it('项目推进一行里每一格的每一行文字放不下时都同样淡出，字整句都在，不出省略号', async () => {
    const focus = '把动态树宽度原型在 13B 与 70B 两个尺寸上都跑通'
    const next = '跑一遍完整的接受率扫描并把每个宽度的结果写回科研记录'
    api.rows = [{
      ...row([{ date: '2026-10-15', text: '先在 7B 上确认宽度为 4 时接受率最高', kind: 'note' }]), focus,
      tasks: [{ id: 't1', title: next, start: '2026-10-12', end: '2026-10-20', state: 'act', priority: 'p0' }],
    }]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const rowElement = host.querySelector<HTMLElement>('.ovpulse-row[data-proj="spec"]')!
    const loose: string[] = []
    const walker = document.createTreeWalker(rowElement, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.textContent!.trim() !== '' && node.parentElement!.closest('.fade-text, .tag') === null) loose.push(node.textContent!)
    }
    expect(loose).toEqual([])
    expect(rowElement.textContent).toContain(focus)
    expect(rowElement.textContent).toContain(next)
  })

  it('需要注意、最近科研记录和接下来的里程碑的正文放不下时和项目页的科研记录一样就地展开整段,不弹 tooltip', async () => {
    api.rows = [{
      ...row([{ date: '2026-10-16', text: '宽度扫描：B=16 时动态树宽比固定宽度 4 快 2.6×，长回答上的接受率也更稳', kind: 'result' }]),
      block: '等 8 卡机器排期，排到之后先跑完 B=16 的宽度扫描再定树宽上限',
      milestones: [{ id: 'm1', date: '2026-10-18', title: '动态树原型：在 13B 与 70B 两个尺寸上都跑通并写完对比报告', done: false }],
    }]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const mains = [...host.querySelectorAll('.ovlist-row.attention, .ovlist-row.dated')].map((line) => line.querySelector('.ovlist-main')!)
    expect(mains.map((main) => [main.textContent, main.classList.contains('fade-expand'), main.querySelector('[data-state]')])).toEqual([
      ['等 8 卡机器排期，排到之后先跑完 B=16 的宽度扫描再定树宽上限', true, null],
      ['动态树原型：在 13B 与 70B 两个尺寸上都跑通并写完对比报告', true, null],
      ['宽度扫描：B=16 时动态树宽比固定宽度 4 快 2.6×，长回答上的接受率也更稳', true, null],
      ['动态树原型：在 13B 与 70B 两个尺寸上都跑通并写完对比报告', true, null],
    ])
  })

  it('最近科研记录给每条记录标上项目页科研记录的类型名，类型都是中性的标签，没有类型的旧记录标成记录', async () => {
    api.rows = [row([
      { date: '2026-10-13', text: '旧记录' },
      { date: '2026-10-14', text: '开工', kind: 'start' },
      { date: '2026-10-15', text: '换方案', kind: 'decision' },
      { date: '2026-10-16', text: '跑出结果', kind: 'result' },
    ])]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const kinds = [...host.querySelectorAll('.ovcols .ovlist-row .project-signal-kind .tag')]
      .map((tag) => `${tag.textContent} ${tag.className}`)
    expect(kinds).toEqual([
      '实验结果 tag tag--label tag--neutral', '决定 tag tag--label tag--neutral',
      '开始推进 tag tag--label tag--neutral', '记录 tag tag--label tag--neutral',
    ])
  })
})

describe('研究总览按领域筛', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('页面工具栏里的领域筛选让每一块都只算那个领域的项目,再选全部领域就全回来', async () => {
    api.rows = [
      { ...row([{ date: '2026-10-15', text: '推测解码的记录' }]), milestones: [{ id: 'm1', date: '2026-10-20', title: '推测解码的里程碑', done: false }] },
      { ...row([{ date: '2026-10-14', text: 'KV 的记录' }]), id: 'kv', name: 'KV cache 量化', topic: 'KV cache', topics: ['KV cache', '量化'],
        milestones: [{ id: 'm2', date: '2026-10-21', title: 'KV 的里程碑', done: false }] },
      { ...row([]), id: 'shelf', name: '搁置的项目', status: '搁置', topic: '未分主题' },
    ]
    await act(async () => { root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>) })
    const filter = () => host.querySelector<HTMLButtonElement>('.desk-body .page-toolbar .filter-menu')!
    const pick = async (label: string) => {
      await act(async () => { filter().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
      const item = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]')].find((option) => option.textContent === label)!
      await act(async () => { item.click() })
    }
    const stats = () => [...host.querySelectorAll('.stat-tile-value')].map((value) => value.textContent)
    expect(stats()).toEqual(['2', '1', '2', '2'])

    await pick('量化')
    expect(stats()).toEqual(['1', '0', '1', '1'])
    expect(host.querySelector('.ovcols')!.textContent).toContain('KV 的记录')
    expect(host.querySelector('.ovcols')!.textContent).not.toContain('推测解码')
    expect([...host.querySelectorAll('.ovpulse [data-proj]')].map((item) => item.getAttribute('data-proj'))).toEqual(['kv'])

    await pick('未分领域')
    expect(stats()).toEqual(['0', '1', '0', '0'])
    await pick('全部领域')
    expect(stats()).toEqual(['2', '1', '2', '2'])
  })
})

describe('研究总览的需要注意', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    api.open.mockClear()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('逾期的任务和里程碑那一行打开项目并定位到那一条，阻塞那一行只打开项目', async () => {
    api.rows = [{
      ...row([]), block: '等 8 卡机器',
      tasks: [{ id: 't-late', title: '画路由热力图', start: '2026-09-24', end: '2026-09-28', state: 'plan', priority: 'p2' }],
      milestones: [{ id: 'm-late', date: '2026-10-13', title: '负载分析初稿', done: false }],
    }]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const decision = (text: string) => [...host.querySelectorAll<HTMLElement>('.ovlist-row.attention')]
      .find((item) => item.textContent?.includes(text))!
    await act(async () => { decision('1 条任务已过计划时间').click() })
    expect(api.open).toHaveBeenLastCalledWith('project', 'spec', { task: 't-late' })
    await act(async () => { decision('负载分析初稿').click() })
    expect(api.open).toHaveBeenLastCalledWith('project', 'spec', { milestone: 'm-late' })
    await act(async () => { decision('等 8 卡机器').click() })
    expect(api.open).toHaveBeenLastCalledWith('project', 'spec')
  })

  it('需要注意的一行只有项目、日期、类型和内容，不写下一步该做什么', async () => {
    api.rows = [{
      ...row([]), block: '等 8 卡机器', lastProgress: '2026-10-01',
      research: { ...row([]).research, pathState: 'broken' },
    }]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    expect([...host.querySelectorAll('.ovlist-row.attention')].map((line) => [
      line.querySelector('.ovlist-kind')!.textContent, line.querySelector('.ovlist-main')!.textContent, line.querySelector('.ovlist-meta'),
    ])).toEqual([['阻塞', '等 8 卡机器', null], ['科研路径', '已断裂', null], ['推进停滞', '已 15 天无推进', null]])
  })

  it('还没有科研记录的项目，项目推进里记录那一格下面写 —，不写等待回传', async () => {
    api.rows = [row([])]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    expect(host.querySelectorAll('.ovpulse-row .ovpulse-cell')[1]!.querySelector('.ovpulse-sub')!.textContent).toBe('—')
  })

  it('搁置的项目在项目推进里只有它的状态标签，下面不再写一句不计入', async () => {
    api.rows = [{ ...row([]), status: '搁置' }]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const signal = host.querySelector('.ovpulse-cell.signal')!
    expect([signal.querySelector('.tag')!.textContent, signal.querySelector('.ovpulse-sub')]).toEqual(['搁置', null])
  })

  it('推进停滞在需要注意和项目推进里都是警示色', async () => {
    api.rows = [{ ...row([]), lastProgress: '2026-10-01' }]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const tone = (tag: Element) => tag.className.split(' ').find((name) => /^tag--(?!label$|chip$)/.test(name))
    expect([...host.querySelectorAll('.ovlist-row.attention .tag--label')].map((tag) => [tag.textContent, tone(tag)]))
      .toEqual([['推进停滞', 'tag--warning']])
    expect([...host.querySelectorAll('.ovpulse-cell.signal .tag')].map((tag) => [tag.textContent, tone(tag)]))
      .toEqual([['推进停滞', 'tag--warning']])
  })

  it('阻塞在需要决策和项目进展里都是警示色,逾期仍是红色', async () => {
    api.rows = [{
      ...row([]), block: '等 8 卡机器',
      milestones: [{ id: 'm-late', date: '2026-10-13', title: '负载分析初稿', done: false }],
    }]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const tone = (tag: Element) => tag.className.split(' ').find((name) => /^tag--(?!label$|chip$)/.test(name))
    const kinds = [...host.querySelectorAll('.ovlist-row.attention .tag--label')]
      .map((tag) => [tag.textContent, tone(tag)])
    expect(kinds).toEqual([['阻塞', 'tag--warning'], ['里程碑逾期', 'tag--error']])
    const pulse = [...host.querySelectorAll('.ovpulse-cell.signal .tag')]
    expect(pulse.map((tag) => [tag.textContent, tone(tag)])).toEqual([['受阻', 'tag--warning']])
  })
})
