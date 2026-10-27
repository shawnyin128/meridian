import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, resolve } from 'node:path'
import type { ResearchIdea } from '../../shared/contract.js'
import type { ProjectRecord } from './page.js'
import {
  PROJECT_PLAN_SCHEMA, WORKSPACE_CHANGES_SCHEMA, WORKSPACE_SCHEMA, projectWorkspaceRoot,
  projectWorkspaceSsh, readProjectWorkspace, sshConfigHosts, sshFolders, writeProjectWorkspace,
  writeProjectWorkspaceState, type SshCommand, type SshExecutor,
} from './workspace.js'

/** Repository root, whose `src` holds the Python package an agent plugin runs. */
const REPO = resolve(import.meta.dirname, '../../../../..')

const roots: string[] = []

function temporary(): string {
  const root = mkdtempSync(join(tmpdir(), 'meridian-workspace-'))
  roots.push(root)
  return root
}

function project(root: string): ProjectRecord {
  return {
    id: 'project-1',
    created: '2026-09-15',
    name: 'Shared research',
    status: '进行中',
    priority: 'p1',
    topic: 'speculative decoding',
    focus: 'run the latency probe',
    start: '2026-09-15',
    due: '2026-10-15',
    memo: '',
    conclusionList: [],
    papers: [],
    tasks: [{
      id: 'task-1', title: 'Probe', start: '2026-09-15', end: '2026-09-15',
      window: { start: '14:00', end: '16:00' }, state: 'act', priority: 'p0',
    }],
    milestones: [{ id: 'ms-1', date: '2026-09-20', title: 'Decision', done: false }],
    events: [],
    relations: [],
    attachments: [],
    graph: { nodes: [], edges: [] },
    agentSessions: [],
    workspaceRoot: root,
  }
}

function sshProject(): ProjectRecord {
  const held = project('/unused')
  delete held.workspaceRoot
  held.workspaceSsh = { host: 'gpu-lab', path: '/srv/research/shared', port: 2222 }
  return held
}

function remotePayload(files: Record<string, string | undefined>): Buffer {
  const parts: Buffer[] = []
  for (const name of [
    '.meridian/workspace.json', '.meridian/control/plan.json',
    '.meridian/control/changes.json',
    '.meridian/graph/graph.json', '.meridian/events/events.json',
  ]) {
    const body = files[name]
    if (body === undefined) parts.push(Buffer.from(`${name} -1\n`))
    else parts.push(Buffer.from(`${name} ${Buffer.byteLength(body)}\n${body}\n`))
  }
  return Buffer.concat(parts)
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('project workspace protocol', () => {
  it('materializes only the App-owned manifest and planning surface', async () => {
    const root = temporary()
    const revision = await writeProjectWorkspace(project(root))
    const manifest = JSON.parse(readFileSync(join(root, '.meridian/workspace.json'), 'utf8')) as {
      schema_version: string
      surfaces: {
        plan: { writer: string }; changes: { writer: string }
        graph: { writer: string }; events: { writer: string }
      }
    }
    const plan = JSON.parse(readFileSync(join(root, '.meridian/control/plan.json'), 'utf8')) as {
      schema_version: string
      revision: string
      tasks: { title: string }[]
      milestones: { title: string }[]
    }
    expect(manifest.schema_version).toBe(WORKSPACE_SCHEMA)
    expect(manifest.surfaces).toEqual({
      plan: { path: '.meridian/control/plan.json', writer: 'meridian-app' },
      changes: { path: '.meridian/control/changes.json', writer: 'meridian-app' },
      graph: { path: '.meridian/graph/graph.json', writer: 'workspace' },
      events: { path: '.meridian/events/events.json', writer: 'workspace' },
      ideas: { path: '.meridian/ideas/ideas.json', writer: 'workspace' },
    })
    expect(plan).toMatchObject({
      schema_version: PROJECT_PLAN_SCHEMA,
      revision,
      tasks: [{ title: 'Probe' }],
      milestones: [{ title: 'Decision' }],
    })
    expect(JSON.parse(readFileSync(join(root, '.meridian/control/changes.json'), 'utf8'))).toMatchObject({
      schema_version: WORKSPACE_CHANGES_SCHEMA,
      project_id: 'project-1',
      next_sequence: 2,
      ideas: [],
      changes: [{ sequence: 1, kind: 'project.snapshot' }],
    })
  })

  it('手动设的任务节点写在计划面的那条任务上;0.0.15.3 的 App 与 0.0.4 插件的 Python 照样读这份计划', async () => {
    const root = temporary()
    const held = { ...project(root), taskNodes: { 'task-1': 'direction.B', 'task-gone': 'direction.A' } }
    const revision = await writeProjectWorkspace(held)
    const plan = JSON.parse(readFileSync(join(root, '.meridian/control/plan.json'), 'utf8')) as { tasks: unknown[] }
    expect(plan.tasks).toEqual([{ ...held.tasks[0], node: 'direction.B' }])
    expect((await readProjectWorkspace(held))?.planRevision).toBe(revision)

    const script = [
      'import json, sys',
      'from pathlib import Path',
      'from meridian.workspace_protocol import inspect_project_workspace, read_project_plan',
      'root = Path(sys.argv[1])',
      'plan = read_project_plan(root)',
      'print(json.dumps([inspect_project_workspace(root)["status"], [task["id"] for task in plan["tasks"]]]))',
    ].join('\n')
    const output = execFileSync('python', ['-c', script, root], {
      env: { ...process.env, PYTHONPATH: join(REPO, 'src') }, encoding: 'utf8',
    })
    expect(JSON.parse(output)).toEqual(['ready', ['task-1']])
  })

  it('项目有几个主题时计划面的项目带上全部主题,插件的 Python 读得出;只有一个时计划面与原来一样,不记一条变动', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    const planFile = join(root, '.meridian/control/plan.json')
    const single = JSON.parse(readFileSync(planFile, 'utf8')) as { revision: string; project: Record<string, unknown> }
    expect('topics' in single.project).toBe(false)
    await writeProjectWorkspace(held)
    expect((JSON.parse(readFileSync(planFile, 'utf8')) as { revision: string }).revision).toBe(single.revision)

    await writeProjectWorkspace({ ...held, topics: ['speculative decoding', 'KV cache'] })
    const script = [
      'import json, sys',
      'from pathlib import Path',
      'from meridian.mcp.server import MeridianMCPServer, _call_workspace_plan',
      'plan = _call_workspace_plan(MeridianMCPServer(), {"workspace_root": sys.argv[1]})',
      'print(json.dumps([plan["project"]["topic"], plan["project"]["topics"]]))',
    ].join('\n')
    const output = execFileSync('python', ['-c', script, root], {
      env: { ...process.env, PYTHONPATH: join(REPO, 'src') }, encoding: 'utf8',
    })
    expect(JSON.parse(output)).toEqual(['speculative decoding', ['speculative decoding', 'KV cache']])
    const changes = JSON.parse(readFileSync(join(root, '.meridian/control/changes.json'), 'utf8')) as { changes: { kind: string }[] }
    expect(changes.changes.map((change) => change.kind)).toEqual(['project.snapshot', 'project.updated'])
  })

  it('keeps current linked ideas and records only incremental association changes', async () => {
    const root = temporary()
    const held = project(root)
    const base: ResearchIdea = {
      id: 'idea-1', title: 'Dynamic threshold', body: 'Calibrate the threshold per batch.',
      source: { chatId: 'chat-1', chatTitle: 'Threshold discussion' },
      project: held.id, archived: false, created: '2026-09-16', updated: '2026-09-16',
    }
    await writeProjectWorkspaceState(held, [base])
    await writeProjectWorkspaceState(held, [{ ...base, node: 'direction.B', updated: '2026-09-18' }])

    const changes = JSON.parse(readFileSync(join(root, '.meridian/control/changes.json'), 'utf8')) as {
      ideas: { id: string; node?: string }[]
      changes: { kind: string; refs: { kind: string; id: string }[] }[]
    }
    expect(changes.ideas).toMatchObject([{ id: 'idea-1', node: 'direction.B' }])
    expect(changes.changes.map((change) => change.kind)).toEqual([
      'project.snapshot', 'idea.linked', 'idea.node_linked',
    ])
    expect(changes.changes.at(-1)?.refs).toContainEqual({ kind: 'node', id: 'direction.B' })
  })

  it('records a change into a journal a newer App wrote and keeps every field it does not know where it was', async () => {
    const root = temporary()
    const held = project(root)
    const idea: ResearchIdea = {
      id: 'idea-1', title: 'Dynamic threshold', body: 'Calibrate the threshold per batch.',
      source: { chatId: 'chat-1', chatTitle: 'Threshold discussion' },
      project: held.id, archived: false, created: '2026-09-16', updated: '2026-09-16',
    }
    await writeProjectWorkspaceState(held, [idea])
    type Journal = {
      next_sequence: number
      ideas: Record<string, unknown>[]
      changes: (Record<string, unknown> & { sequence: number; kind: string })[]
    }
    const file = join(root, '.meridian/control/changes.json')
    const journal = JSON.parse(readFileSync(file, 'utf8')) as Journal
    const retained = Array.from({ length: 500 }, (_, index) => ({
      sequence: index + 1,
      at: '2026-09-16T00:00:00.000Z',
      kind: 'project.updated',
      summary: 'Project tasks updated: Shared research',
      refs: [{ kind: 'project', id: 'project-1', ...(index === 1 ? { title: 'Shared research' } : {}) }],
      ...(index === 1 ? { added_by: { app: '0.0.99.0' } } : {}),
    }))
    const newer = {
      ...journal,
      next_sequence: 501,
      ideas: journal.ideas.map((item) => ({
        ...item, source: { ...(item['source'] as object), chat_id: 'chat-1' }, tags: ['latency'],
      })),
      changes: retained,
      written_by: 'meridian-app 0.0.99.0',
    }
    writeFileSync(file, `${JSON.stringify(newer, null, 2)}\n`)

    const renamed = { ...held, tasks: [{ ...held.tasks[0]!, title: 'Probe latency' }] }
    await writeProjectWorkspaceState(renamed, [idea])

    const plan = JSON.parse(readFileSync(join(root, '.meridian/control/plan.json'), 'utf8')) as { tasks: { title: string }[] }
    expect(plan.tasks.map((task) => task.title)).toEqual(['Probe latency'])
    const next = JSON.parse(readFileSync(file, 'utf8')) as Journal & { written_by?: string }
    expect(next.written_by).toBe('meridian-app 0.0.99.0')
    expect(JSON.stringify(next.ideas)).toBe(JSON.stringify(newer.ideas))
    expect(next.next_sequence).toBe(502)
    expect(next.changes.map((change) => change.sequence)).toEqual(
      Array.from({ length: 500 }, (_, index) => index + 2),
    )
    expect(JSON.stringify(next.changes[0])).toBe(JSON.stringify(retained[1]))
    expect(JSON.stringify(next.changes.slice(1, -1))).toBe(JSON.stringify(retained.slice(2)))
    expect(next.changes.at(-1)).toMatchObject({ sequence: 501, kind: 'project.updated' })
  })

  it('keeps syncing past a change of a kind it does not know, keeps that change as written, and the plugin reports it unreadable', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspaceState(held, [])
    const file = join(root, '.meridian/control/changes.json')
    const journal = JSON.parse(readFileSync(file, 'utf8')) as { next_sequence: number; changes: unknown[] }
    const newer = {
      sequence: 2, at: '2026-09-17T00:00:00.000Z', kind: 'project.archived', summary: 'Project archived by a newer App',
      refs: [{ kind: 'project', id: 'project-1' }, { kind: 'run', id: 'run-7' }], reason: { by: 'agent' },
    }
    const known = {
      sequence: 3, at: '2026-09-17T01:00:00.000Z', kind: 'project.updated', summary: 'Project tasks updated: Shared research',
      refs: [{ kind: 'project', id: 'project-1' }],
    }
    writeFileSync(file, `${JSON.stringify({ ...journal, next_sequence: 4, changes: [...journal.changes, newer, known] }, null, 2)}\n`)

    await writeProjectWorkspaceState({ ...held, tasks: [{ ...held.tasks[0]!, title: 'Probe latency' }] }, [])

    const plan = JSON.parse(readFileSync(join(root, '.meridian/control/plan.json'), 'utf8')) as { tasks: { title: string }[] }
    expect(plan.tasks.map((task) => task.title)).toEqual(['Probe latency'])
    const next = JSON.parse(readFileSync(file, 'utf8')) as { next_sequence: number; changes: { sequence: number; kind: string }[] }
    expect(next.changes.map((change) => [change.sequence, change.kind])).toEqual([
      [1, 'project.snapshot'], [2, 'project.archived'], [3, 'project.updated'], [4, 'project.updated'],
    ])
    expect(next.next_sequence).toBe(5)
    expect(JSON.stringify(next.changes[1])).toBe(JSON.stringify(newer))
    expect(reported).toHaveBeenCalledWith(expect.stringMatching(/change 2 cannot be read by this version/))

    const script = [
      'import json, sys',
      'from pathlib import Path',
      'from meridian.workspace_protocol import read_workspace_changes',
      'page = read_workspace_changes(Path(sys.argv[1]))',
      'print(json.dumps([[change["sequence"] for change in page["changes"]], page["unreadable_changes"]]))',
    ].join('\n')
    const output = execFileSync('python', ['-c', script, root], {
      env: { ...process.env, PYTHONPATH: join(REPO, 'src') }, encoding: 'utf8',
    })
    const [readable, unreadable] = JSON.parse(output) as [number[], string[]]
    expect(readable).toEqual([1, 3, 4])
    expect(unreadable).toHaveLength(1)
    expect(unreadable[0]).toContain('kind is unknown: project.archived')
  })

  it('reads generated Lab graph and workspace events without rewriting either', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    mkdirSync(join(root, '.meridian/graph'), { recursive: true })
    writeFileSync(join(root, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1',
      generated_at: '2026-09-15T18:00:00Z',
      active_path: ['thread.A', 'thread.B'],
      nodes: [
        {
          id: 'thread.A', label: 'Hypothesis', title: 'Hypothesis', state: 'supported', active: false,
          markdown: 'Supported by the width sweep.', markdown_path: '.meridian/threads/thread.md',
          markdown_anchor: 'node-a-hypothesis',
        },
        {
          id: 'thread.B', label: 'Probe', title: 'Probe', state: 'repairable', active: true,
          markdown: 'Run the latency probe.', markdown_path: '.meridian/threads/thread.md',
          markdown_anchor: 'node-b-probe',
        },
      ],
      node_details: {
        'thread.B': { next_action: 'Run the latency matrix.' },
      },
      edges: [{ source: 'thread.A', target: 'thread.B' }],
      health: { status: 'pass' },
    }), 'utf8')
    mkdirSync(join(root, '.meridian/events'), { recursive: true })
    writeFileSync(join(root, '.meridian/events/events.json'), JSON.stringify({
      schema_version: 'meridian.workspace-events.v1',
      events: [{
        id: 'event-1', date: '2026-09-15', text: 'Probe passed', node: 'thread.B',
        source: '.meridian/experiments/probe.md',
      }],
    }), 'utf8')

    expect(await readProjectWorkspace(held)).toMatchObject({
      state: 'ready',
      graphGeneratedAt: '2026-09-15T18:00:00Z',
      graphHealth: 'ok',
      graph: {
        nodes: [
          {
            id: 'thread.A', state: 'done', mode: 'supported', x: 20, y: 20,
            markdown: 'Supported by the width sweep.', markdownPath: '.meridian/threads/thread.md',
            markdownAnchor: 'node-a-hypothesis',
          },
          {
            id: 'thread.B', state: 'act', mode: 'repairable', x: 240, y: 20,
            markdown: 'Run the latency probe.', nextAction: 'Run the latency matrix.',
          },
        ],
        edges: [['thread.A', 'thread.B']],
        // Legacy graph.json exports only `active_path`; the App reads it as its last valid id.
        activeNodes: ['thread.B'],
      },
      events: [{ date: '2026-09-15', text: 'Probe passed', node: 'thread.B', kind: 'result', origin: 'agent' }],
    })
  })

  it('读出节点关联的任务和结论,证据按实验标题显示;0.0.14 导出的节点两样都没有', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    mkdirSync(join(root, '.meridian/graph'), { recursive: true })
    const node = (id: string, state: string) => ({ id, title: id, state, markdown: '' })
    writeFileSync(join(root, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1',
      nodes: [node('t.A', 'supported'), node('t.B', 'unresolved')],
      edges: [],
      node_details: {
        't.A': {
          tasks: ['task-1'],
          conclusion: { text: 'Width 8 wins at B>=8', date: '2026-09-20', evidence: ['exp-1', 'exp-9'], revision: 'r1' },
        },
        't.B': { next_action: 'Run it.' },
      },
      supporting_artifacts: {
        't.A': [{ type: 'experiment', id: 'exp-1', title: 'Width sweep', path: '.meridian/experiments/exp-1.md' }],
      },
    }), 'utf8')

    const [concluded, open] = (await readProjectWorkspace(held))!.graph!.nodes
    expect(concluded).toMatchObject({
      tasks: ['task-1'],
      conclusion: {
        text: 'Width 8 wins at B>=8', date: '2026-09-20',
        evidence: [{ id: 'exp-1', title: 'Width sweep' }, { id: 'exp-9', title: 'exp-9' }],
        revision: 'r1',
      },
    })
    expect(open).not.toHaveProperty('tasks')
    expect(open).not.toHaveProperty('conclusion')
  })

  it('新版本写进清单与科研记录的新增字段被忽略,科研图与记录照常显示', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    const manifestFile = join(root, '.meridian/workspace.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as { surfaces: Record<string, unknown> }
    manifest.surfaces['notebooks'] = { path: '.meridian/notebooks/index.json', writer: 'workspace' }
    writeFileSync(manifestFile, JSON.stringify(manifest), 'utf8')
    mkdirSync(join(root, '.meridian/graph'), { recursive: true })
    writeFileSync(join(root, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1', active_nodes: ['thread.A'],
      nodes: [{ id: 'thread.A', label: 'Hypothesis', state: 'unresolved', active: true, color: 'blue' }],
      edges: [], health: { status: 'pass' },
    }), 'utf8')
    mkdirSync(join(root, '.meridian/events'), { recursive: true })
    writeFileSync(join(root, '.meridian/events/events.json'), JSON.stringify({
      schema_version: 'meridian.workspace-events.v1',
      events: [{
        id: 'event-1', date: '2026-09-15', text: 'Probe passed', source: '.meridian/threads/t.md',
        weight: 3,
      }],
    }), 'utf8')

    const workspace = await readProjectWorkspace(held)
    expect(workspace).toMatchObject({
      state: 'ready', graph: { nodes: [{ id: 'thread.A' }] }, events: [{ text: 'Probe passed' }],
    })
    expect(workspace?.issue).toBeUndefined()
  })

  it('科研记录文件整份读不了时,科研图照常显示,并写明哪个文件读不了、为什么', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    mkdirSync(join(root, '.meridian/graph'), { recursive: true })
    writeFileSync(join(root, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1',
      active_nodes: ['thread.A'],
      nodes: [{ id: 'thread.A', label: 'Hypothesis', state: 'unresolved', active: true }],
      edges: [],
      health: { status: 'pass' },
    }), 'utf8')
    mkdirSync(join(root, '.meridian/events'), { recursive: true })
    writeFileSync(join(root, '.meridian/events/events.json'), JSON.stringify({
      schema_version: 'meridian.workspace-events.v2',
      events: [{ id: 'event-1', when: '2026-09-15T10:00:00Z', text: 'Probe passed' }],
    }), 'utf8')

    const workspace = await readProjectWorkspace(held)
    expect(workspace).toMatchObject({ state: 'ready', events: [], graph: { nodes: [{ id: 'thread.A' }] } })
    expect(workspace?.issue).toBe('科研记录读不了：格式是这个版本的 Meridian 不认识的，请更新 App')
  })

  it('科研记录里一条读不了时,其余照常显示,写明第几条读不了、为什么,文件一字不改', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    mkdirSync(join(root, '.meridian/events'), { recursive: true })
    const file = join(root, '.meridian/events/events.json')
    const text = JSON.stringify({
      schema_version: 'meridian.workspace-events.v1',
      events: [
        { id: 'event-1', date: '2026-09-15', text: 'Probe passed', source: '.meridian/threads/t.md', kind: 'result' },
        { id: 'event-2', date: '9月16日', text: 'Date written by hand', source: '.meridian/threads/t.md' },
      ],
    })
    writeFileSync(file, text, 'utf8')

    const workspace = await readProjectWorkspace(held)
    expect(workspace?.events.map((event) => event.text)).toEqual(['Probe passed'])
    expect(workspace?.issue).toBe('科研记录第 2 条读不了：格式是这个版本的 Meridian 不认识的，请更新 App')
    expect(readFileSync(file, 'utf8')).toBe(text)
  })

  it('科研图里读不了的节点和端点不在图里的关系不显示,逐条写明第几个、为什么;上级不在图里的节点照常显示,文件一字不改', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    mkdirSync(join(root, '.meridian/graph'), { recursive: true })
    const file = join(root, '.meridian/graph/graph.json')
    const text = JSON.stringify({
      schema: 'meridian.lab.graph.v1',
      active_nodes: ['t.B'],
      nodes: [
        { id: 't.A', label: 'Root', state: 'unresolved' },
        { id: 't.B', label: 'Child', state: 'unresolved' },
        { label: 'No id' },
        { id: 't.A', label: 'Duplicate' },
        { id: 't.C', label: 'Parent missing', state: 'unresolved' },
      ],
      edges: [
        { source: 't.A', target: 't.B', kind: 'continues' },
        { source: 't.Z', target: 't.C', kind: 'continues' },
        'not an edge',
      ],
      health: { status: 'fail' },
    })
    writeFileSync(file, text, 'utf8')

    const workspace = await readProjectWorkspace(held)
    expect(workspace?.graph?.nodes.map((node) => [node.id, node.label, node.x])).toEqual([
      ['t.A', 'Root', 20], ['t.B', 'Child', 240], ['t.C', 'Parent missing', 20],
    ])
    expect(workspace?.graph?.edges).toEqual([['t.A', 't.B']])
    expect(workspace?.issue?.split(';')).toEqual([
      '科研图第 3 个节点读不了：没有可用的 id',
      '科研图第 4 个节点读不了：id「t.A」与第 1 个节点重复',
      '科研图第 2 条关系读不了：节点「t.Z」不在科研图里',
      '科研图第 3 条关系读不了：没有起点或终点',
    ])
    expect(readFileSync(file, 'utf8')).toBe(text)
  })

  it('reads active_nodes directly, marking every listed id act and leaving ancestors and other repairable nodes idle', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    mkdirSync(join(root, '.meridian/graph'), { recursive: true })
    writeFileSync(join(root, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1',
      active_nodes: ['thread.B', 'thread.C'],
      nodes: [
        { id: 'thread.A', label: 'Hypothesis', state: 'repairable' },
        { id: 'thread.B', label: 'Probe one', state: 'unresolved' },
        { id: 'thread.C', label: 'Probe two', state: 'repairable' },
      ],
      edges: [
        { source: 'thread.A', target: 'thread.B' },
        { source: 'thread.A', target: 'thread.C' },
      ],
      health: { status: 'ok' },
    }), 'utf8')

    // thread.A is the shared ancestor and is itself `repairable`, but it is not in active_nodes,
    // so it must stay idle: being on the route, and being repairable, no longer imply act.
    expect(await readProjectWorkspace(held)).toMatchObject({
      graph: {
        activeNodes: ['thread.B', 'thread.C'],
        nodes: [
          { id: 'thread.A', state: 'idle', mode: 'repairable' },
          { id: 'thread.B', state: 'act', mode: 'unresolved' },
          { id: 'thread.C', state: 'act', mode: 'repairable' },
        ],
      },
    })
  })

  it('lays out parent branches as siblings and does not turn semantic relations into parent edges', async () => {
    const root = temporary()
    const held = project(root)
    await writeProjectWorkspace(held)
    mkdirSync(join(root, '.meridian/graph'), { recursive: true })
    writeFileSync(join(root, '.meridian/graph/graph.json'), JSON.stringify({
      schema: 'meridian.lab.graph.v1',
      nodes: [
        { id: 'thread.A', label: 'Root', state: 'supported' },
        { id: 'thread.B', label: 'Parent', state: 'supported' },
        { id: 'thread.C', label: 'Useful branch', state: 'repairable' },
        { id: 'thread.D', label: 'Failed branch', state: 'dead' },
      ],
      edges: [
        { source: 'thread.A', target: 'thread.B', kind: 'continues' },
        { source: 'thread.B', target: 'thread.C', kind: 'continues' },
        { source: 'thread.B', target: 'thread.D', kind: 'continues' },
        { source: 'thread.D', target: 'thread.C', kind: 'contradicts' },
      ],
    }), 'utf8')

    const workspace = await readProjectWorkspace(held)
    expect(workspace).toBeDefined()
    const graph = workspace!.graph!
    expect(graph.edges).toEqual([
      ['thread.A', 'thread.B'],
      ['thread.B', 'thread.C'],
      ['thread.B', 'thread.D'],
    ])
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))
    expect(byId.get('thread.C')!.x).toBe(byId.get('thread.D')!.x)
    expect(byId.get('thread.C')!.y).not.toBe(byId.get('thread.D')!.y)
  })

  it('does not replace an unknown workspace manifest', async () => {
    const root = temporary()
    mkdirSync(join(root, '.meridian'), { recursive: true })
    const manifest = join(root, '.meridian/workspace.json')
    writeFileSync(manifest, '{"schema_version":"someone.else.v1"}\n', 'utf8')
    await expect(writeProjectWorkspace(project(root))).rejects.toThrow()
    expect(readFileSync(manifest, 'utf8')).toBe('{"schema_version":"someone.else.v1"}\n')
  })

  it('stores only canonical absolute directories', () => {
    const root = temporary()
    expect(projectWorkspaceRoot(root)).toBe(realpathSync(root))
    expect(() => projectWorkspaceRoot('relative/repo')).toThrow('绝对路径')
  })

  it('validates SSH aliases, ports, and absolute remote paths without storing credentials', () => {
    expect(projectWorkspaceSsh({ host: 'gpu-lab', path: '/srv/research/', port: 2222 })).toEqual({
      kind: 'ssh', host: 'gpu-lab', path: '/srv/research', port: 2222,
    })
    expect(() => projectWorkspaceSsh({ host: '-oProxyCommand=bad', path: '/repo' }))
      .toThrow('主机')
    expect(() => projectWorkspaceSsh({ host: 'gpu-lab', path: 'relative/repo' }))
      .toThrow('绝对路径')
  })

  it('materializes the same protocol over SSH with one staged App-owned transaction', async () => {
    const calls: { command: string; input?: Buffer }[] = []
    const ssh: SshExecutor = async (_target, command, input) => {
      calls.push({ command, ...(input === undefined ? {} : { input }) })
      return calls.length === 1 ? remotePayload({}) : Buffer.alloc(0)
    }
    const revision = await writeProjectWorkspace(sshProject(), ssh)
    expect(revision).toHaveLength(16)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.command).toContain('wc -c')
    expect(calls[1]!.command).toContain('mv "$plan_tmp"')
    expect(calls[1]!.command).toContain('mv "$changes_tmp"')
    expect(calls[1]!.command).not.toContain('.meridian/graph/graph.json')
    expect(calls[1]!.input?.toString('utf8')).toContain(`"schema_version": "${PROJECT_PLAN_SCHEMA}"`)
    expect(calls[1]!.input?.toString('utf8')).toContain(`"schema_version": "${WORKSPACE_SCHEMA}"`)
    expect(calls[1]!.input?.toString('utf8')).toContain(`"schema_version": "${WORKSPACE_CHANGES_SCHEMA}"`)
  })

  it('reads graph and source-backed events over one SSH connection', async () => {
    const manifest = JSON.stringify({
      schema_version: WORKSPACE_SCHEMA,
      project: { id: 'project-1', name: 'Shared research' },
      surfaces: {
        plan: { path: '.meridian/control/plan.json', writer: 'meridian-app' },
        graph: { path: '.meridian/graph/graph.json', writer: 'workspace' },
        events: { path: '.meridian/events/events.json', writer: 'workspace' },
      },
    })
    const payload = remotePayload({
      '.meridian/workspace.json': manifest,
      '.meridian/control/plan.json': JSON.stringify({ revision: 'remote-revision' }),
      '.meridian/graph/graph.json': JSON.stringify({
        schema: 'meridian.lab.graph.v1', active_path: ['A'],
        nodes: [{ id: 'A', label: 'Remote probe', state: 'repairable', active: true, markdown: 'Remote body' }],
        edges: [], health: { status: 'ok' },
      }),
      '.meridian/events/events.json': JSON.stringify({
        schema_version: 'meridian.workspace-events.v1',
        events: [{ id: 'e1', date: '2026-09-15', text: 'Remote result', source: 'run.md' }],
      }),
    })
    let calls = 0
    const workspace = await readProjectWorkspace(sshProject(), async () => { calls += 1; return payload })
    expect(calls).toBe(1)
    expect(workspace).toMatchObject({
      kind: 'ssh', host: 'gpu-lab', port: 2222, root: '/srv/research/shared',
      state: 'ready', planRevision: 'remote-revision', graphHealth: 'ok',
      graph: {
        nodes: [{ id: 'A', label: 'Remote probe', state: 'act', mode: 'repairable', markdown: 'Remote body' }],
        activeNodes: ['A'],
      },
      events: [{ date: '2026-09-15', text: 'Remote result', kind: 'note', origin: 'agent' }],
    })
  })
})

/** The shells a remote host may run the listing command in as its login shell, of those this machine has. */
const REMOTE_SHELLS = process.platform === 'win32'
  ? []
  : ['sh', 'bash', 'zsh'].filter((shell) => spawnSync(shell, ['-c', 'true']).status === 0)

/** A listing of `path` as the remote shell prints it: the folder's path, then `./` and each folder entry's name, each ended by NUL. */
function remoteListing(path: string, names: readonly string[]): Buffer {
  return Buffer.from([path, ...names.map((name) => `./${name}`)].map((part) => `${part}\0`).join(''))
}

describe('choosing a folder on an SSH host', () => {
  it('SSH 配置里只读出 Host 别名：通配、否定、HostName 与其余配置都不算，同名只出现一次，没有配置文件就是空的', () => {
    const home = temporary()
    mkdirSync(join(home, '.ssh'))
    writeFileSync(join(home, '.ssh', 'config'), [
      '# Host commented-out',
      'Host gpu-lab cluster',
      '  HostName 10.0.0.2',
      '  IdentityFile ~/.ssh/id_lab',
      '  User researcher',
      'Host *',
      '  ForwardAgent no',
      'Host *.internal !bastion login?',
      'host=jump # the jump host',
      '  Host "quoted" gpu-lab',
      'Match host cluster',
      'HostKeyAlias ignored',
      '',
    ].join('\r\n'), 'utf8')
    expect(sshConfigHosts(home)).toEqual(['gpu-lab', 'cluster', 'jump', 'quoted'])
    expect(sshConfigHosts(temporary())).toEqual([])
  })

  it('SSH 配置的 Include 像 ssh 一样跟进去：通配按字典序展开，相对路径从 ~/.ssh 起，~ 是主目录，引号里的路径带空格，套着的也跟，自己套自己有层数上限', () => {
    const home = temporary()
    const ssh = (path: string, lines: string[]) => {
      mkdirSync(join(home, path, '..'), { recursive: true })
      writeFileSync(join(home, path), `${lines.join('\n')}\n`, 'utf8')
    }
    ssh('.ssh/config', [
      'Host gpu-lab',
      'Include config.d/*.conf',
      '  Include ~/extra/ssh_config "with space"',
      'include=/nowhere/at/all missing.conf',
      'Include loop',
      'Host last',
    ])
    ssh('.ssh/config.d/b.conf', ['Host beta'])
    ssh('.ssh/config.d/a.conf', ['Host alpha', 'Include nested'])
    ssh('.ssh/config.d/skipped.txt', ['Host skipped'])
    ssh('.ssh/nested', ['Host nested-host gpu-lab'])
    ssh('extra/ssh_config', ['Match host *', '  Host extra'])
    ssh('.ssh/with space', ['Host spaced'])
    ssh('.ssh/loop', ['Host looped', 'Include loop'])
    expect(sshConfigHosts(home)).toEqual(['gpu-lab', 'alpha', 'nested-host', 'beta', 'extra', 'spaced', 'looped', 'last'])
  })

  it('连接时列出远端主目录：主目录的上一级、按名字排好的子文件夹，隐藏文件夹不显示，连的是给定主机与端口', async () => {
    const calls: { target: Parameters<SshCommand>[0]; command: string }[] = []
    const ssh: SshCommand = async (target, command) => {
      calls.push({ target, command })
      return remoteListing('/home/researcher', ['projects', '.cache', 'notes 10', 'Data', 'notes 2', '.ssh'])
    }
    expect(await sshFolders({ host: 'gpu-lab', port: 2222 }, undefined, ssh)).toEqual({
      state: 'ready',
      path: '/home/researcher',
      parent: '/home',
      folders: [
        { name: 'Data', path: '/home/researcher/Data' },
        { name: 'notes 2', path: '/home/researcher/notes 2' },
        { name: 'notes 10', path: '/home/researcher/notes 10' },
        { name: 'projects', path: '/home/researcher/projects' },
      ],
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.target).toEqual({ host: 'gpu-lab', port: 2222 })
    expect(calls[0]!.command.split('\n')).toContain('cd')
  })

  it('打开一个文件夹时只列它这一层；根目录没有上一级；名字里带换行或以空白结尾的文件夹不列出，因为它存不成工作区', async () => {
    const commands: string[] = []
    const ssh: SshCommand = async (_target, command) => {
      commands.push(command)
      return remoteListing('/', ['srv', 'line\nbreak', 'home', 'trailing ', ' leading'])
    }
    expect(await sshFolders({ host: 'gpu-lab' }, '/srv/../', ssh)).toEqual({
      state: 'ready', path: '/', parent: null,
      folders: [{ name: ' leading', path: '/ leading' }, { name: 'home', path: '/home' }, { name: 'srv', path: '/srv' }],
    })
    expect(commands[0]!.split('\n')).toContain("cd -- '/'")
  })

  it('输入的目录可以从 ~ 起：~ 是远端主目录，~/ 后面的路径从主目录进去，也能进隐藏文件夹；别的相对路径不收', async () => {
    const entered: string[][] = []
    const ssh: SshCommand = async (_target, command) => {
      entered.push(command.split('\n').filter((line) => line.startsWith('cd')))
      return remoteListing('/home/researcher', [])
    }
    for (const path of ['~', '~/', '~/.config', '~/a/../b/']) await sshFolders({ host: 'gpu-lab' }, path, ssh)
    expect(entered).toEqual([['cd'], ['cd'], ['cd', "cd -- '.config'"], ['cd', "cd -- 'b'"]])
    for (const path of ['projects', '~bob/x', '~/a\nrm -rf ~']) {
      await expect(sshFolders({ host: 'gpu-lab' }, path, ssh)).rejects.toThrow('绝对路径')
    }
    expect(entered).toHaveLength(4)
  })

  it("远端命令把目录当作一个带引号的参数，目录里的引号、$() 和换行改不了命令", async () => {
    const commands: string[] = []
    const ssh: SshCommand = async (_target, command) => {
      commands.push(command)
      return remoteListing("/srv/it's $(touch pwned)", [])
    }
    await sshFolders({ host: 'gpu-lab' }, "/srv/it's $(touch pwned)", ssh)
    expect(commands[0]!.split('\n')).toContain(`cd -- '/srv/it'"'"'s $(touch pwned)'`)
    await expect(sshFolders({ host: 'gpu-lab' }, '/srv/a\nrm -rf ~', ssh)).rejects.toThrow('绝对路径')
    expect(commands).toHaveLength(1)
  })

  it.each(REMOTE_SHELLS)('远端登录 shell 是 %s 时列出真实目录：主目录、空格、指向文件夹的链接、空文件夹、~ 下的隐藏文件夹都照常列出，文件不列出', async (shell) => {
    const home = realpathSync(temporary())
    for (const folder of ['projects/spec decoding', 'empty', '.hidden/inside']) mkdirSync(join(home, folder), { recursive: true })
    writeFileSync(join(home, 'notes.md'), 'not a folder\n', 'utf8')
    symlinkSync(join(home, 'projects'), join(home, 'linked'))
    const local: SshCommand = async (_target, command) => execFileSync(shell, ['-c', command], {
      env: { HOME: home, PATH: process.env['PATH'] ?? '' }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(await sshFolders({ host: 'gpu-lab' }, undefined, local)).toEqual({
      state: 'ready', path: home, parent: posix.dirname(home),
      folders: ['empty', 'linked', 'projects'].map((name) => ({ name, path: `${home}/${name}` })),
    })
    expect(await sshFolders({ host: 'gpu-lab' }, join(home, 'linked'), local)).toMatchObject({
      state: 'ready', path: join(home, 'linked'), folders: [{ name: 'spec decoding', path: join(home, 'linked', 'spec decoding') }],
    })
    expect(await sshFolders({ host: 'gpu-lab' }, join(home, 'empty'), local)).toMatchObject({ state: 'ready', folders: [] })
    expect(await sshFolders({ host: 'gpu-lab' }, '~/.hidden', local)).toMatchObject({
      state: 'ready', path: join(home, '.hidden'), folders: [{ name: 'inside' }],
    })
  })

  it('连不上或文件夹打不开时给出 SSH 自己说的原因，而不是抛错；主机或端口无效时不连接', async () => {
    let calls = 0
    const failing: SshCommand = async () => {
      calls += 1
      throw new Error('ssh: Could not resolve hostname nope: nodename nor servname provided, or not known')
    }
    expect(await sshFolders({ host: 'nope' }, undefined, failing)).toEqual({
      state: 'failed', issue: 'ssh: Could not resolve hostname nope: nodename nor servname provided, or not known',
    })
    expect(await sshFolders({ host: 'gpu-lab' }, undefined, async () => Buffer.from('relative\0'))).toMatchObject({ state: 'failed' })
    await expect(sshFolders({ host: '-oProxyCommand=bad' }, undefined, failing)).rejects.toThrow('主机')
    await expect(sshFolders({ host: 'gpu-lab', port: 70_000 }, undefined, failing)).rejects.toThrow('端口')
    await expect(sshFolders({ host: 'gpu-lab' }, 'relative/path', failing)).rejects.toThrow('绝对路径')
    expect(calls).toBe(1)
  })

  it.runIf(REMOTE_SHELLS.includes('sh'))('列文件夹时 ssh 在子进程里跑，Core 不被卡住；连的是 BatchMode 与给定端口，连不上时给出 ssh 写在 stderr 的最后一行', async () => {
    const bin = temporary()
    const home = realpathSync(temporary())
    mkdirSync(join(home, 'projects'))
    // A stand-in for OpenSSH: it records its arguments, takes a moment as a round trip does, then runs
    // the command as the remote login shell would, in FAKE_SSH_HOME, or fails as OpenSSH does.
    writeFileSync(join(bin, 'ssh'), [
      '#!/bin/sh',
      'printf "%s\\n" "$@" > "$FAKE_SSH_ARGS"',
      'sleep 0.3',
      'for last; do :; done',
      'case "$*" in *" refused "*) printf "%s\\n" "debug1: trying" "ssh: connect to host refused port 22: Connection refused" >&2; exit 255;; esac',
      'HOME="$FAKE_SSH_HOME" exec sh -c "$last"',
      '',
    ].join('\n'), { mode: 0o755 })
    const saved = { PATH: process.env['PATH'], FAKE_SSH_ARGS: process.env['FAKE_SSH_ARGS'], FAKE_SSH_HOME: process.env['FAKE_SSH_HOME'] }
    Object.assign(process.env, { PATH: `${bin}:${saved.PATH ?? ''}`, FAKE_SSH_ARGS: join(bin, 'args'), FAKE_SSH_HOME: home })
    try {
      const order: string[] = []
      setTimeout(() => order.push('another call'), 50)
      const listed = await sshFolders({ host: 'gpu-lab', port: 2222 }, undefined).then((folders) => {
        order.push('listing')
        return folders
      })
      expect(order).toEqual(['another call', 'listing'])
      expect(listed).toEqual({ state: 'ready', path: home, parent: posix.dirname(home), folders: [{ name: 'projects', path: `${home}/projects` }] })
      expect(readFileSync(join(bin, 'args'), 'utf8').split('\n').slice(0, 8))
        .toEqual(['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-p', '2222', 'gpu-lab'])
      expect(await sshFolders({ host: 'refused' }, undefined))
        .toEqual({ state: 'failed', issue: 'ssh: connect to host refused port 22: Connection refused' })
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
