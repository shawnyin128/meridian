import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ProjectRecord } from './page.js'
import {
  dropProjectPageKeys, readProjectPage, projectPageText, writeProjectFields,
} from './page.js'
import { DEFAULT_PROJECT_TOPIC } from '../../shared/vocabulary.js'
import { readFrontmatter } from '../vault/frontmatter.js'
import { writePage } from '../vault/writer.js'

const Day14 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * The project-page frontmatter schema of 0.0.14.x (v0.0.14002), copied with the contract shapes it
 * reused: its top level ignores unknown keys, while every nested object is strict.
 */
const PageSchema0014 = z.object({
  type: z.literal('project'), name: z.string(), created: Day14, status: z.string(),
  priority: z.enum(['p0', 'p1', 'p2']), topic: z.string(), focus: z.string(), block: z.string().optional(),
  conflict_page: z.string().optional(), workspace_root: z.string().min(1).optional(),
  workspace_ssh: z.object({ host: z.string(), path: z.string(), port: z.number().optional() }).strict().optional(),
  start: Day14, due: Day14, papers: z.array(z.string()).default([]),
  conclusion_list: z.array(z.object({
    id: z.string(), text: z.string(), state: z.enum(['pending', 'verified', 'conflicting']), date: Day14,
    source: z.string(), paper: z.string().optional(),
  }).strict()).default([]),
  tasks: z.array(z.object({
    id: z.string(), title: z.string(), start: Day14, end: Day14,
    window: z.object({ start: z.string(), end: z.string() }).strict().optional(),
    state: z.enum(['act', 'plan', 'done']), priority: z.enum(['p0', 'p1', 'p2']),
  }).strict()),
  milestones: z.array(z.object({ id: z.string(), date: Day14, title: z.string(), done: z.boolean() }).strict()),
  relations: z.array(z.object({
    group: z.string(),
    items: z.array(z.object({ id: z.string(), text: z.string(), page: z.string().optional(), url: z.string().optional() }).strict()),
  }).strict()),
  attachments: z.array(z.object({ id: z.string(), name: z.string(), size: z.string(), path: z.string().optional() }).strict()),
  graph: z.object({
    nodes: z.array(z.object({
      id: z.string(), label: z.string(), state: z.enum(['act', 'done', 'idle']),
      mode: z.enum(['unresolved', 'repairable', 'supported', 'dead']).optional(), nextAction: z.string().optional(),
      x: z.number(), y: z.number(), width: z.number(), markdown: z.string().optional(),
      markdownPath: z.string().optional(), markdownAnchor: z.string().optional(),
      writebacks: z.array(z.object({ page: z.string(), text: z.string(), date: Day14 }).strict()),
    }).strict()),
    edges: z.array(z.object({ from: z.string(), to: z.string() }).strict()),
    active_nodes: z.array(z.string()).optional(),
    active_path: z.array(z.string()).optional(),
  }).strict(),
  agent_sessions: z.array(z.object({
    id: z.string(), title: z.string(), when: Day14,
    steps: z.array(z.object({ time: z.string(), text: z.string() }).strict()), outcome: z.string(),
  }).strict()),
})

/** The frontmatter of the page at `file`, as a 0.0.14.x App would read it. */
const readAs0014 = (file: string) => {
  const rows = readFileSync(file, 'utf8').split('\n')
  return PageSchema0014.safeParse(readFrontmatter(rows.slice(1, rows.indexOf('---', 1))))
}

/**
 * The project-page frontmatter schema of 0.0.15.3 (v0.0.15003), copied the same way on top of
 * 0.0.14's: its tasks ignore unknown keys, it reads the task maps and verified conclusions, and its
 * graph nodes carry the tasks and conclusion a coding agent linked.
 */
const PageSchema0015003 = PageSchema0014.extend({
  verified_conclusions: z.array(z.unknown()).optional(),
  tasks: z.array(PageSchema0014.shape.tasks.element.passthrough()),
  task_notes: z.record(z.string(), z.string()).optional(),
  task_origins: z.record(z.string(), z.string()).optional(),
  agent_tasks: z.record(z.string(), z.string()).optional(),
  graph: PageSchema0014.shape.graph.extend({
    nodes: z.array(PageSchema0014.shape.graph.shape.nodes.element.extend({
      tasks: z.array(z.string()).optional(),
      conclusion: z.object({
        text: z.string(), date: Day14.optional(),
        evidence: z.array(z.object({ id: z.string(), title: z.string() }).strict()), revision: z.string().optional(),
      }).strict().optional(),
    })),
  }),
})

/** The frontmatter of the page at `file`, as App 0.0.15.3 would read it. */
const readAs0015003 = (file: string) => {
  const rows = readFileSync(file, 'utf8').split('\n')
  return PageSchema0015003.safeParse(readFrontmatter(rows.slice(1, rows.indexOf('---', 1))))
}

/**
 * The project-page frontmatter schema of 0.0.21.4 (v0.0.21004), copied the same way on top of
 * 0.0.15.3's: it reads every area in `topics` and the research node a task was given by hand.
 */
const PageSchema0021004 = PageSchema0015003.extend({
  topics: z.array(z.string()).optional(),
  task_nodes: z.record(z.string(), z.string()).optional(),
})

/** The frontmatter of the page at `file`, as App 0.0.21.4 would read it. */
const readAs0021004 = (file: string) => {
  const rows = readFileSync(file, 'utf8').split('\n')
  return PageSchema0021004.safeParse(readFrontmatter(rows.slice(1, rows.indexOf('---', 1))))
}

/** Project exercising every page shape: sequences, nesting, and optional values. */
const PROJECT: ProjectRecord = {
  id: 'project-1',
  created: '2026-06-01',
  name: 'draft 效率',
  status: '进行中',
  priority: 'p0',
  topic: 'speculative decoding',
  focus: '宽树实验补 B≥8',
  conflictPage: 'claims/knee',
  start: '2026-06-02',
  due: '2026-09-15',
  memo: '拐点不是一个数,是 batch size 的函数。\n\n- 重跑一遍 `width-sweep.csv`\n- ## 不是小标题,是随笔里的一行',
  conclusionList: [
    { id: 'concl-1', text: '拐点是 batch size 的函数', state: 'verified', date: '2026-06-25', source: '手动添加' },
    { id: 'concl-2', text: '宽树 B≥8 仍净赚', state: 'pending', date: '2026-08-20', source: '对话「宽树」', paper: '2404.00456' },
  ],
  papers: ['2404.00456', '2405.16406'],
  tasks: [{
    id: 'task-1', title: '宽树实验 B≥8', start: '2026-08-18', end: '2026-08-28',
    window: { start: '14:00', end: '18:00' }, state: 'act', priority: 'p0',
  }],
  milestones: [{ id: 'ms-1', date: '2026-08-28', title: '宽树实验', done: false }],
  events: [
    { date: '2026-06-02', text: '开始这条研究线' },
    { date: '2026-08-05', text: '实验 #3:分支浪费按深度分桶 → 结论升 v3', origin: 'agent' },
  ],
  relations: [{
    group: 'Wiki',
    items: [{ id: 'rel-1', text: '树宽收益拐点', page: 'claims/knee' }, { id: 'rel-2', text: '没有页的那一条' }],
  }],
  attachments: [{ id: 'att-1', name: 'width-sweep.csv', size: '412 KB' }],
  graph: {
    nodes: [
      { id: 'n1', label: '起点', state: 'done', x: 10, y: 20, width: 120, writebacks: [] },
      { id: 'n2', label: '终点', state: 'idle', x: 10, y: 90, width: 120, writebacks: [] },
    ],
    edges: [['n1', 'n2']],
  },
  agentSessions: [{
    id: 'as-1',
    title: '实验 #3 复算',
    when: '2026-08-05',
    steps: [{ time: '14:02', text: '读了 4 篇论文' }, { time: '14:31', text: '写回结论' }],
    outcome: '2 个文件改动 · 共 31 分钟',
  }],
}

describe('project page', () => {
  let dir: string
  /** Partial writes land here rather than beside the page. */
  let staging: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meridian-project-'))
    staging = join(dir, 'staging')
    file = join(dir, 'project-1.md')
    writePage(file, projectPageText(PROJECT), staging)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('写出去再读回来,与写进去的那个项目一模一样', () => {
    expect(readProjectPage(file, 'project-1')).toEqual(PROJECT)
  })

  it('SSH 工作区只把地址写进项目页，写出再读回保持一致', () => {
    const remote: ProjectRecord = {
      ...PROJECT,
      workspaceSsh: { host: 'gpu-lab', path: '/srv/research/project', port: 2222 },
    }
    writePage(file, projectPageText(remote), staging)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('workspace_ssh:\n  host: "gpu-lab"\n  path: "/srv/research/project"\n  port: 2222')
    expect(text).not.toContain('password')
    expect(readProjectPage(file, remote.id)).toEqual(remote)
  })

  it('页的写法与库里其余页一致:frontmatter 加正文,标量带引号,成列的缩进两格', () => {
    const text = readFileSync(file, 'utf8')
    expect(text.startsWith('---\ntype: "project"\n')).toBe(true)
    expect(text).toContain('\nname: "draft 效率"\n')
    expect(text).toContain('\npapers:\n  - "2404.00456"\n  - "2405.16406"\n')
    expect(text).toContain('\ntasks:\n  - id: "task-1"\n    title: "宽树实验 B≥8"\n')
    expect(text).toContain('    window:\n      start: "14:00"\n      end: "18:00"\n')
    expect(text).toContain('\n# draft 效率\n')
    expect(text).toContain('\n## 科研记录\n\n- 2026-06-02 开始这条研究线\n')
    expect(text.endsWith('\n')).toBe(true)
  })

  it('改一个字段,页里只有那一行变了', () => {
    const before = readFileSync(file, 'utf8').split('\n')
    writeProjectFields(file, { ...PROJECT, status: '搁置' }, ['status'], staging)
    const after = readFileSync(file, 'utf8').split('\n')
    expect(after.length).toBe(before.length)
    expect(after.filter((row, i) => row !== before[i])).toEqual(['status: "搁置"'])
  })

  it('旧页上的 paper_count 读的时候丢掉,没有 papers 这一项时读成空列表', () => {
    const text = readFileSync(file, 'utf8').replace(
      /^papers:\n(?: {2}- .*\n)+/m, 'paper_count: 4\n',
    )
    writePage(file, text, staging)
    const read = readProjectPage(file, 'project-1')
    expect(read.papers).toEqual([])
    expect('paperCount' in read).toBe(false)
  })

  it('旧页上按档记数的 conclusions 读的时候丢掉,没有 conclusion_list 时读成空列表', () => {
    const text = readFileSync(file, 'utf8').replace(
      /^conclusion_list:\n(?: {2}.*\n)+/m,
      'conclusions:\n  verified: 1\n  pending: 0\n  conflicting: 1\n',
    )
    writePage(file, text, staging)
    const read = readProjectPage(file, 'project-1')
    expect(read.conclusionList).toEqual([])
    expect('conclusions' in read).toBe(false)
  })

  it('验证过的结论单独成一项加在 frontmatter 末尾,别的字节不动;读不了的一条跳过', () => {
    const before = readFileSync(file, 'utf8')
    const verified = [{ node: 't.wide', fingerprint: '0123456789abcdef', date: '2026-09-21' }]
    writeProjectFields(file, { ...PROJECT, verifiedConclusions: verified }, ['verifiedConclusions'], staging)
    const entry = 'verified_conclusions:\n  - node: "t.wide"\n    fingerprint: "0123456789abcdef"\n    date: "2026-09-21"\n'
    expect(readFileSync(file, 'utf8')).toBe(before.replace('\n---\n\n# ', `\n${entry}---\n\n# `))
    expect(readProjectPage(file, 'project-1').verifiedConclusions).toEqual(verified)

    writePage(file, readFileSync(file, 'utf8').replace(entry, `${entry}  - node: "t.bad"\n    fingerprint: "nope"\n    date: "2026-09-21"\n`), staging)
    expect(readProjectPage(file, 'project-1').verifiedConclusions).toEqual(verified)
  })

  it('这个版本写出的项目页,0.0.14 的 App 照样读得出:新数据只放在 frontmatter 顶层', () => {
    const verified = [{ node: 't.wide', fingerprint: '0123456789abcdef', date: '2026-09-21' }]
    writePage(file, projectPageText({ ...PROJECT, verifiedConclusions: verified }), staging)
    const whole = readAs0014(file)
    expect(whole.error).toBeUndefined()
    writeProjectFields(file, { ...PROJECT, verifiedConclusions: [] }, ['verifiedConclusions'], staging)
    expect(readAs0014(file).success).toBe(true)
  })

  it('agent 加的任务:来源与请求记录各放在顶层一项,任务项本身不多字段;读回来一样,0.0.14 照样读得出', () => {
    const agentTask = { ...PROJECT.tasks[0]!, id: 'task-2', origin: 'agent' as const }
    const project = { ...PROJECT, tasks: [...PROJECT.tasks, agentTask], agentTasks: { 'rerun-sweep': 'task-2' } }
    writePage(file, projectPageText(project), staging)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('task_origins:\n  task-2: "agent"\n')
    expect(text).toContain('agent_tasks:\n  rerun-sweep: "task-2"\n')
    expect(text).not.toMatch(/tasks:\n(?: {2}.*\n)*? {4}origin:/)
    expect(readProjectPage(file, 'project-1')).toEqual(project)
    expect(readAs0014(file).error).toBeUndefined()

    writeProjectFields(file, { ...project, tasks: PROJECT.tasks }, ['tasks'], staging)
    expect(readFileSync(file, 'utf8')).not.toContain('task_origins:')
  })

  it('手动设的科研节点单独放在顶层 task_nodes,任务项本身不多字段;读回来一样,0.0.15.3 的 App 照样读得出', () => {
    const project = { ...PROJECT, taskNodes: { 'task-1': 'n2' } }
    writePage(file, projectPageText(project), staging)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('task_nodes:\n  task-1: "n2"\n')
    expect(text).not.toMatch(/tasks:\n(?: {2}.*\n)*? {4}node:/)
    expect(readProjectPage(file, 'project-1')).toEqual(project)
    expect(readAs0015003(file).error).toBeUndefined()
    expect(readAs0014(file).error).toBeUndefined()

    writeProjectFields(file, { ...project, tasks: [] }, ['tasks'], staging)
    expect(readFileSync(file, 'utf8')).toContain('task_nodes:\n  task-1: "n2"\n')
    writeProjectFields(file, PROJECT, ['taskNodes'], staging)
    expect(readFileSync(file, 'utf8')).not.toContain('task_nodes:')
  })

  it('只改 papers 那几行,别的字节不动', () => {
    const before = readFileSync(file, 'utf8')
    writeProjectFields(file, { ...PROJECT, papers: ['2401.18079'] }, ['papers'], staging)
    expect(readFileSync(file, 'utf8')).toBe(before.replace(
      'papers:\n  - "2404.00456"\n  - "2405.16406"\n',
      'papers:\n  - "2401.18079"\n',
    ))
  })

  it('改名字动的是 frontmatter 那一行与正文的标题行,别的不动', () => {
    const before = readFileSync(file, 'utf8').split('\n')
    writeProjectFields(file, { ...PROJECT, name: '改过的名字' }, ['name'], staging)
    const after = readFileSync(file, 'utf8').split('\n')
    expect(after.filter((row, i) => row !== before[i])).toEqual(['name: "改过的名字"', '# 改过的名字'])
  })

  it('加一条任务只动 tasks 那一块,别处一个字节不动', () => {
    const before = readFileSync(file, 'utf8').split('\n')
    const task = { id: 'task-2', title: '前缀复用', start: '2026-08-22', end: '2026-09-01', state: 'plan', priority: 'p1' } as const
    writeProjectFields(file, { ...PROJECT, tasks: [...PROJECT.tasks, task] }, ['tasks'], staging)
    const after = readFileSync(file, 'utf8').split('\n')
    expect(after.length).toBe(before.length + 6)
    // Apart from the six inserted lines, the preceding and following sections remain identical.
    const at = before.indexOf('milestones:')
    expect(after.slice(0, at)).toEqual(before.slice(0, at))
    expect(after.slice(at + 6)).toEqual(before.slice(at))
    expect(readProjectPage(file, 'project-1').tasks.map((t) => t.id)).toEqual(['task-1', 'task-2'])
  })

  it('任务带上备注,写出再读回保持一致;备注单独存放,不进任务本身那一块', () => {
    const withNote = { ...PROJECT.tasks[0]!, note: '先跑 A/B 两组,再看结论' }
    writeProjectFields(file, { ...PROJECT, tasks: [withNote] }, ['tasks'], staging)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('task_notes:\n  task-1: "先跑 A/B 两组,再看结论"\n')
    expect(text).not.toMatch(/tasks:\n(?: {2}.*\n)*? {4}note:/)
    expect(readProjectPage(file, 'project-1').tasks[0]!.note).toBe(withNote.note)
  })

  it('旧页上的任务没有 note 也没有 task_notes,读出来 note 是 undefined,不补空字符串', () => {
    // PROJECT.tasks[0] already has no note and the beforeEach-written page has no task_notes key,
    // so the file it wrote is itself an old-format sample; this only asserts what reading it gives.
    const read = readProjectPage(file, 'project-1')
    expect('note' in read.tasks[0]!).toBe(false)
    expect(read.tasks[0]!.note).toBeUndefined()
  })

  it('这个版本写出带备注的任务,0.0.14 的 App 整页照样读得出', () => {
    const withNote = { ...PROJECT.tasks[0]!, note: '先跑 A/B 两组,再看结论' }
    writePage(file, projectPageText({ ...PROJECT, tasks: [withNote] }), staging)
    // 0.0.14's per-task shape is strict; the page's own top level is not, so it ignores the
    // unrecognized `task_notes` key entirely, and the task item itself never carried `note`.
    const whole = readAs0014(file)
    expect(whole.error).toBeUndefined()
    expect(readFileSync(file, 'utf8')).not.toMatch(/note:/)
  })

  it('多行、带引号反斜杠和 --- 的备注写出再读回一字不差,frontmatter 仍然收得住口', () => {
    const tricky = [
      '先确认基线,再改并发数。',
      '',
      '- 引号 "quoted" 和反斜杠 C:\\temp\\run.log',
      '---',
      '上面那行 --- 不是 frontmatter 的收口',
    ].join('\n')
    const withNote = { ...PROJECT.tasks[0]!, note: tricky }
    writeProjectFields(file, { ...PROJECT, tasks: [withNote] }, ['tasks'], staging)
    const rows = readFileSync(file, 'utf8').split('\n')
    expect(rows[0]).toBe('---')
    // The note is a single quoted-and-escaped scalar, so none of its own newlines or `---` lines
    // land in the file as real lines that could end the frontmatter early.
    const taskNotesAt = rows.indexOf('task_notes:')
    expect(taskNotesAt).toBeGreaterThan(0)
    expect(rows[taskNotesAt + 1]).toMatch(/^ {2}task-1: ".*"$/)
    expect(readProjectPage(file, 'project-1').tasks[0]!.note).toBe(tricky)
  })

  it('记一条科研记录只多出那一行', () => {
    const before = readFileSync(file, 'utf8').split('\n')
    const events = [...PROJECT.events, { date: '2026-09-08', text: '记一笔' }]
    writeProjectFields(file, { ...PROJECT, events }, ['events'], staging)
    const after = readFileSync(file, 'utf8').split('\n')
    expect(after.length).toBe(before.length + 1)
    expect(after.filter((row) => !before.includes(row))).toEqual(['- 2026-09-08 记一笔'])
  })

  it('随笔里以 #、## 或 ### 开头的行一行不少:写出、改过、再记一条科研记录之后读回来都一字不差', () => {
    const memo = '开头一段\n# 一级标题\n## 小结\n小结下面的话\n### 三级标题\n- 最后一行'
    writePage(file, projectPageText({ ...PROJECT, memo }), staging)
    expect(readProjectPage(file, 'project-1').memo).toBe(memo)

    const edited = '改过的开头\n## 科研记录\n- 2026-09-09 不是一条科研记录\n## 随笔\n## 新的小结\n结尾'
    writeProjectFields(file, { ...PROJECT, memo: edited }, ['memo'], staging)
    expect(readFileSync(file, 'utf8')).not.toContain('小结下面的话')
    const events = [...PROJECT.events, { date: '2026-09-08', text: '记一笔' }]
    writeProjectFields(file, { ...PROJECT, memo: edited, events }, ['events'], staging)
    const read = readProjectPage(file, 'project-1')
    expect(read.memo).toBe(edited)
    expect(read.events).toEqual(events)
  })

  it('旧版本藏在随笔里 ## 行之后的那一截读得出来,改随笔时连同它一起换掉', () => {
    // The page 0.0.16.1 leaves after a memo holding a `## ` line is edited: it replaced only the
    // lines above that heading, so the heading and the lines below it stayed on the page unseen.
    writePage(file, `${projectPageText({ ...PROJECT, memo: '改过的上半段' })}\n## 小结\n下半段\n`, staging)
    expect(readProjectPage(file, 'project-1').memo).toBe('改过的上半段\n\n## 小结\n下半段')

    writeProjectFields(file, { ...PROJECT, memo: '整段重写' }, ['memo'], staging)
    expect(readFileSync(file, 'utf8').endsWith('\n## 随笔\n\n整段重写\n')).toBe(true)
    expect(readProjectPage(file, 'project-1').memo).toBe('整段重写')
  })

  it('用户自己往 frontmatter 里加的键,改别的字段之后还在', () => {
    const rows = readFileSync(file, 'utf8').split('\n')
    writePage(file, [...rows.slice(0, 1), 'my_own_key: "留着"', ...rows.slice(1)].join('\n'), staging)
    writeProjectFields(file, { ...PROJECT, focus: '换个焦点' }, ['focus'], staging)
    expect(readFileSync(file, 'utf8')).toContain('\nmy_own_key: "留着"\n')
    expect(readProjectPage(file, 'project-1').focus).toBe('换个焦点')
  })

  it('去掉页上几个键占的行,别的字节不动,页上没有的键跳过', () => {
    const before = readFileSync(file, 'utf8')
    const text = before.replace(
      'papers:\n',
      'block: "等机时"\nconclusions:\n  verified: 1\n  pending: 0\npapers:\n',
    )
    writePage(file, text, staging)
    expect(dropProjectPageKeys(file, ['block', 'conclusions', 'paper_count'], staging))
      .toEqual(['block', 'conclusions'])
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('事件行的 [node:x] 标记读得出、写得回,与 [agent] 同在时按 [agent] [node:x] 的次序;writebacks 写成块', () => {
    const project: ProjectRecord = {
      ...PROJECT,
      events: [
        { date: '2026-06-09', text: '结论「树宽收益拐点」', node: 'knee' },
        { date: '2026-08-05', text: '实验 #3', node: 'bucket', origin: 'agent' },
        { date: '2026-08-14', text: '解决冲突' },
      ],
      graph: {
        nodes: [
          {
            id: 'knee', label: '拐点', state: 'done', x: 0, y: 0, width: 100,
            writebacks: [{ page: 'topics/ptq', text: '拐点不是一个数', date: '2026-06-25' }],
          },
          { id: 'stop', label: '停止', state: 'idle', x: 0, y: 50, width: 100, writebacks: [] },
        ],
        edges: [['knee', 'stop']],
      },
    }
    const text = projectPageText(project)
    expect(text).toContain('- 2026-06-09 [node:knee] 结论「树宽收益拐点」')
    expect(text).toContain('- 2026-08-05 [agent] [node:bucket] 实验 #3')
    expect(text).toContain('- 2026-08-14 解决冲突')
    expect(text).toContain('      writebacks:\n        - page: "topics/ptq"')
    expect(text).toContain('      writebacks: []')
    writePage(file, text, staging)
    expect(readProjectPage(file, project.id)).toEqual(project)
    // Accept the legacy [node:x] [agent] ordering as well.
    writePage(file, text.replace('[agent] [node:bucket]', '[node:bucket] [agent]'), staging)
    expect(readProjectPage(file, project.id).events[1])
      .toEqual({ date: '2026-08-05', text: '实验 #3', node: 'bucket', origin: 'agent' })
  })

  it('正文当中的 [node:x] 是正文不是标记:读回来不带节点,正文一个字不少,写回去逐字节一样', () => {
    const project: ProjectRecord = {
      ...PROJECT,
      events: [
        { date: '2026-06-09', text: '照 [node:knee] 的说法' },
        { date: '2026-06-10', text: '  padded  ', node: 'knee' },
      ],
      graph: {
        nodes: [{ id: 'knee', label: '拐点', state: 'done', x: 0, y: 0, width: 100, writebacks: [] }],
        edges: [],
      },
    }
    const text = projectPageText(project)
    expect(text).toContain('\n- 2026-06-09 照 [node:knee] 的说法\n')
    // With a node marker, body text follows its single separator space and preserves its own padding.
    expect(text).toContain('\n- 2026-06-10 [node:knee]   padded  \n')
    writePage(file, text, staging)
    const read = readProjectPage(file, project.id)
    expect(read.events).toEqual(project.events)
    expect(projectPageText(read)).toBe(text)
  })

  it('旧页上节点那个 page 键读的时候丢掉,没写 writebacks 的节点补成空的', () => {
    const rows = readFileSync(file, 'utf8').split('\n')
    const at = rows.indexOf('      writebacks: []')
    expect(at).toBeGreaterThan(0)
    writePage(file, [...rows.slice(0, at), '      page: "claims/knee"', ...rows.slice(at + 1)].join('\n'), staging)
    expect(readProjectPage(file, 'project-1').graph.nodes[0]).toEqual(PROJECT.graph.nodes[0])
  })

  it('几个主题:第一个照旧写在 topic,全部按次序写在顶层 topics;读回来一样', () => {
    const project = { ...PROJECT, topics: ['speculative decoding', 'KV cache', '推理加速'] }
    writePage(file, projectPageText(project), staging)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('\ntopic: "speculative decoding"\n')
    expect(text).toContain('\ntopics:\n  - "speculative decoding"\n  - "KV cache"\n  - "推理加速"\n')
    expect(readProjectPage(file, 'project-1')).toEqual(project)
  })

  it('主题加到两个只在 frontmatter 末尾多出 topics 一块,减回一个时这一块去掉,别的字节不动', () => {
    const before = readFileSync(file, 'utf8')
    writeProjectFields(file, { ...PROJECT, topics: ['speculative decoding', 'KV cache'] }, ['topic', 'topics'], staging)
    const block = 'topics:\n  - "speculative decoding"\n  - "KV cache"\n'
    expect(readFileSync(file, 'utf8')).toBe(before.replace('\n---\n\n# ', `\n${block}---\n\n# `))
    writeProjectFields(file, PROJECT, ['topic', 'topics'], staging)
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('几个领域的页,0.0.14 与 0.0.15.3 的 App 照样读得出,读到的领域是第一个', () => {
    writePage(file, projectPageText({ ...PROJECT, topics: ['speculative decoding', 'KV cache'] }), staging)
    expect(readAs0014(file).data?.topic).toBe('speculative decoding')
    expect(readAs0015003(file).data?.topic).toBe('speculative decoding')
  })

  it('旧版 App 只改了 topic:topics 里的第一个换成它,其余的留着,重复的只留一个', () => {
    const project = { ...PROJECT, topics: ['speculative decoding', 'KV cache', '推理加速'] }
    writePage(file, projectPageText(project), staging)
    // An older App writes `topic` from a record that has no `topics`, the way this version writes any other field.
    writeProjectFields(file, { ...PROJECT, topic: '量化' }, ['topic'], staging)
    expect(readFileSync(file, 'utf8')).toContain('\ntopics:\n  - "speculative decoding"\n  - "KV cache"\n  - "推理加速"\n')
    expect(readProjectPage(file, 'project-1')).toMatchObject({ topic: '量化', topics: ['量化', 'KV cache', '推理加速'] })
    writeProjectFields(file, { ...PROJECT, topic: '推理加速' }, ['topic'], staging)
    expect(readProjectPage(file, 'project-1')).toMatchObject({ topic: '推理加速', topics: ['推理加速', 'KV cache'] })
  })

  it('旧版 App 把 topic 改回新项目的默认值:剩下的主题里第一个顶上,只剩一个时不再有 topics', () => {
    writePage(file, projectPageText({ ...PROJECT, topics: ['speculative decoding', 'KV cache'] }), staging)
    writeProjectFields(file, { ...PROJECT, topic: DEFAULT_PROJECT_TOPIC }, ['topic'], staging)
    const read = readProjectPage(file, 'project-1')
    expect(read.topic).toBe('KV cache')
    expect('topics' in read).toBe(false)
  })

  it('主题里带换行、引号、冒号、--- 和 - evidence: 也只是一项的字,写出再读回一字不差,页的结构不变', () => {
    const topics = ['多行\n### Node x', '- evidence: "引号" C:\\temp', 'a: b', '---']
    const project = { ...PROJECT, topic: topics[0]!, topics }
    writePage(file, projectPageText(project), staging)
    const rows = readFileSync(file, 'utf8').split('\n')
    const at = rows.indexOf('topics:')
    expect(rows.slice(at + 1, at + 1 + topics.length).every((row) => /^ {2}- ".*"$/.test(row))).toBe(true)
    expect(readProjectPage(file, 'project-1')).toEqual(project)
  })

  it('主题的页按次序写在 frontmatter 末尾的 topic_pages,每项带写下时的标题;读回来一样', () => {
    const project: ProjectRecord = {
      ...PROJECT, topics: ['speculative decoding', 'KV cache'],
      topicPins: [{ page: 'topics/speculative-decoding', title: 'speculative decoding' }, { page: 'topics/kv-cache', title: 'KV cache' }],
    }
    writePage(file, projectPageText(project), staging)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain([
      'topic_pages:', '  - page: "topics/speculative-decoding"', '    title: "speculative decoding"',
      '  - page: "topics/kv-cache"', '    title: "KV cache"', '---',
    ].join('\n'))
    expect(readProjectPage(file, 'project-1')).toEqual(project)
  })

  it('有 topic_pages 的页,0.0.21.4 的 App 照样读得出,读到的领域是 topic 与 topics 里的标题', () => {
    writePage(file, projectPageText({
      ...PROJECT, topics: ['speculative decoding', 'KV cache'],
      topicPins: [{ page: 'topics/speculative-decoding', title: 'speculative decoding' }, { page: 'topics/kv-cache', title: 'KV cache' }],
    }), staging)
    const read = readAs0021004(file)
    expect(read.error).toBeUndefined()
    expect(read.data).toMatchObject({ topic: 'speculative decoding', topics: ['speculative decoding', 'KV cache'] })
  })

  it('旧版 App 只改 topic 与 topics:topic_pages 一字不动,读回来的主题跟着旧版写的标题', () => {
    const pins = [{ page: 'topics/speculative-decoding', title: 'speculative decoding' }]
    writePage(file, projectPageText({ ...PROJECT, topicPins: pins }), staging)
    const block = 'topic_pages:\n  - page: "topics/speculative-decoding"\n    title: "speculative decoding"\n'
    // An older App writes from a record without `topicPins`, naming only the fields it knows.
    writeProjectFields(file, { ...PROJECT, topic: '量化', topics: ['量化', 'speculative decoding'] }, ['topic', 'topics'], staging)
    expect(readFileSync(file, 'utf8')).toContain(block)
    expect(readProjectPage(file, 'project-1')).toMatchObject({ topic: '量化', topics: ['量化', 'speculative decoding'], topicPins: pins })
  })

  it('topic_pages 里读不了的一项跳过,多出来的键不管,项目照常读出', () => {
    writePage(file, projectPageText(PROJECT), staging)
    const rows = readFileSync(file, 'utf8').split('\n')
    const close = rows.indexOf('---', 1)
    writePage(file, [
      ...rows.slice(0, close),
      'topic_pages:', '  - title: "没有页"', '  - page: "topics/speculative-decoding"', '    title: "speculative decoding"', '    since: "2027-01-01"',
      ...rows.slice(close),
    ].join('\n'), staging)
    expect(readProjectPage(file, 'project-1').topicPins).toEqual([{ page: 'topics/speculative-decoding', title: 'speculative decoding' }])
  })

  it('新版本在嵌套对象里加的键读的时候不管,重写那几项时原样留在原处,别的字节不动', () => {
    const held: ProjectRecord = {
      ...PROJECT,
      workspaceSsh: { host: 'gpu-lab', path: '/srv/research' },
      verifiedConclusions: [{ node: 'n1', fingerprint: '0123456789abcdef', date: '2026-09-21' }],
      topicPins: [{ page: 'topics/speculative-decoding', title: 'speculative decoding' }],
    }
    const newer = projectPageText(held)
      .replace('  path: "/srv/research"\n', '  path: "/srv/research"\n  user: "lab"\n')
      .replace('    date: "2026-09-21"\n', '    date: "2026-09-21"\n    by: "我"\n')
      .replace('    source: "手动添加"\n', '    source: "手动添加"\n    weight: 2\n')
      .replace('      end: "18:00"\n', '      end: "18:00"\n      tz: "UTC"\n')
      .replace('    done: false\n', '    done: false\n    color: "red"\n')
      .replace('        text: "没有页的那一条"\n', '        text: "没有页的那一条"\n        note: "待补"\n')
      .replace('    size: "412 KB"\n', '    size: "412 KB"\n    kind: "csv"\n')
      .replace('      writebacks: []\n', '      writebacks: []\n      icon: "flag"\n')
      .replace('      to: "n2"\n', '      to: "n2"\n      label: "next"\n  layout: "dag"\n')
      .replace('        text: "写回结论"\n', '        text: "写回结论"\n        tool: "edit"\n')
      .replace('    title: "speculative decoding"\n', '    title: "speculative decoding"\n    since: "2027-01-01"\n')
    writePage(file, newer, staging)

    expect(readProjectPage(file, 'project-1')).toEqual(held)
    writeProjectFields(file, held, [
      'workspaceSsh', 'verifiedConclusions', 'conclusionList', 'tasks', 'milestones', 'relations', 'attachments',
      'graph', 'agentSessions', 'topicPins',
    ], staging)
    expect(readFileSync(file, 'utf8')).toBe(newer)

    const renamed = { ...held, milestones: [{ ...held.milestones[0]!, title: '宽树实验收尾' }] }
    writeProjectFields(file, renamed, ['milestones'], staging)
    expect(readFileSync(file, 'utf8')).toBe(newer.replace('    title: "宽树实验"\n', '    title: "宽树实验收尾"\n'))
  })

  it('读不了的一条任务或一个节点单独报出来,项目其余部分照常读出;重写时那一条原样留着', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const task = ['  - id: "task-9"', '    title: "新版本的状态"', '    start: "2026-08-18"', '    end: "2026-08-18"', '    state: "blocked"', '    priority: "p1"']
    const node = ['    - id: "n9"', '      label: "新版本的节点"', '      state: "paused"', '      x: 0', '      y: 0', '      width: 120', '      writebacks: []']
    const text = readFileSync(file, 'utf8')
      .replace('\nmilestones:\n', `\n${task.join('\n')}\nmilestones:\n`)
      .replace('\n  edges:\n', `\n${node.join('\n')}\n  edges:\n`)
    writePage(file, text, staging)

    expect(readProjectPage(file, 'project-1')).toEqual(PROJECT)
    const reasons = reported.mock.calls.map((call) => String(call[0]))
    expect(reasons.some((reason) => reason.includes('tasks') && reason.includes('record 2'))).toBe(true)
    expect(reasons.some((reason) => reason.includes('graph.nodes') && reason.includes('record 3'))).toBe(true)

    const added = { id: 'task-2', title: '再加一条', start: '2026-08-20', end: '2026-08-21', state: 'plan', priority: 'p2' } as const
    writeProjectFields(file, { ...PROJECT, tasks: [added, ...PROJECT.tasks] }, ['tasks', 'graph'], staging)
    const after = readFileSync(file, 'utf8')
    expect(after).toContain(`\n${task.join('\n')}\nmilestones:\n`)
    expect(after).toContain(`\n${node.join('\n')}\n  edges:\n`)
    expect(readProjectPage(file, 'project-1').tasks).toEqual([added, ...PROJECT.tasks])
  })

  it('不是项目页的一页读出来会抛,而不是给一个空项目', () => {
    const other = join(dir, 'other.md')
    writePage(other, '---\ntype: "paper"\ntitle: "x"\n---\n\n# x\n', staging)
    expect(() => readProjectPage(other, 'other')).toThrow()
  })
})
