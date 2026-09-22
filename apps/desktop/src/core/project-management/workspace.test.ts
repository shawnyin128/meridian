import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResearchIdea } from '../../shared/contract.js'
import type { ProjectRecord } from './page.js'
import {
  PROJECT_PLAN_SCHEMA, WORKSPACE_CHANGES_SCHEMA, WORKSPACE_SCHEMA, projectWorkspaceRoot,
  projectWorkspaceSsh, readProjectWorkspace, writeProjectWorkspace, writeProjectWorkspaceState,
} from './workspace.js'

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
})

describe('project workspace protocol', () => {
  it('materializes only the App-owned manifest and planning surface', () => {
    const root = temporary()
    const revision = writeProjectWorkspace(project(root))
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

  it('keeps current linked ideas and records only incremental association changes', () => {
    const root = temporary()
    const held = project(root)
    const base: ResearchIdea = {
      id: 'idea-1', title: 'Dynamic threshold', body: 'Calibrate the threshold per batch.',
      source: { chatId: 'chat-1', chatTitle: 'Threshold discussion' },
      project: held.id, archived: false, created: '2026-09-16', updated: '2026-09-16',
    }
    writeProjectWorkspaceState(held, [base])
    writeProjectWorkspaceState(held, [{ ...base, node: 'direction.B', updated: '2026-09-18' }])

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

  it('reads generated Lab graph and workspace events without rewriting either', () => {
    const root = temporary()
    const held = project(root)
    writeProjectWorkspace(held)
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

    expect(readProjectWorkspace(held)).toMatchObject({
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
        activePath: ['thread.A', 'thread.B'],
      },
      events: [{ date: '2026-09-15', text: '[agent] Probe passed', node: 'thread.B' }],
    })
  })

  it('lays out parent branches as siblings and does not turn semantic relations into parent edges', () => {
    const root = temporary()
    const held = project(root)
    writeProjectWorkspace(held)
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

    const workspace = readProjectWorkspace(held)
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

  it('does not replace an unknown workspace manifest', () => {
    const root = temporary()
    mkdirSync(join(root, '.meridian'), { recursive: true })
    const manifest = join(root, '.meridian/workspace.json')
    writeFileSync(manifest, '{"schema_version":"someone.else.v1"}\n', 'utf8')
    expect(() => writeProjectWorkspace(project(root))).toThrow()
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

  it('materializes the same protocol over SSH with one staged App-owned transaction', () => {
    const calls: { command: string; input?: Buffer }[] = []
    const ssh = (_binding: Parameters<typeof projectWorkspaceSsh>[0] & { kind: 'ssh' }, command: string, input?: Buffer) => {
      calls.push({ command, ...(input === undefined ? {} : { input }) })
      return calls.length === 1 ? remotePayload({}) : Buffer.alloc(0)
    }
    const revision = writeProjectWorkspace(sshProject(), ssh)
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

  it('reads graph and source-backed events over one SSH connection', () => {
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
    const workspace = readProjectWorkspace(sshProject(), () => { calls += 1; return payload })
    expect(calls).toBe(1)
    expect(workspace).toMatchObject({
      kind: 'ssh', host: 'gpu-lab', port: 2222, root: '/srv/research/shared',
      state: 'ready', planRevision: 'remote-revision', graphHealth: 'ok',
      graph: {
        nodes: [{ id: 'A', label: 'Remote probe', state: 'act', mode: 'repairable', markdown: 'Remote body' }],
        activePath: ['A'],
      },
      events: [{ date: '2026-09-15', text: '[agent] Remote result' }],
    })
  })
})
