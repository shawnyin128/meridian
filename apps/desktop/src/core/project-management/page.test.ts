import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ProjectRecord } from './page.js'
import {
  dropProjectPageKeys, readProjectPage, projectPageText, writeProjectFields,
} from './page.js'
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

  it('不是项目页的一页读出来会抛,而不是给一个空项目', () => {
    const other = join(dir, 'other.md')
    writePage(other, '---\ntype: "paper"\ntitle: "x"\n---\n\n# x\n', staging)
    expect(() => readProjectPage(other, 'other')).toThrow()
  })
})
