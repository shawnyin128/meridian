import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, posix } from 'node:path'
import { z } from 'zod'
import type {
  ProjectWorkspace, ProjectWorkspaceBinding, ResearchGraph, ResearchIdea,
} from '../../shared/contract.js'
import type { ProjectRecord } from './page.js'

export const WORKSPACE_SCHEMA = 'meridian.workspace.v1'
export const PROJECT_PLAN_SCHEMA = 'meridian.project-plan.v1'
export const WORKSPACE_EVENTS_SCHEMA = 'meridian.workspace-events.v1'
export const WORKSPACE_CHANGES_SCHEMA = 'meridian.workspace-changes.v1'

const MANIFEST = '.meridian/workspace.json'
const PLAN = '.meridian/control/plan.json'
const GRAPH = '.meridian/graph/graph.json'
const EVENTS = '.meridian/events/events.json'
const CHANGES = '.meridian/control/changes.json'
const AGENT_IDEAS = '.meridian/ideas/ideas.json'
const EXPERIMENTS_PREFIX = '.meridian/experiments/'
const WorkspaceEventKindSchema = z.enum(['start', 'reopen', 'result', 'decision', 'complete', 'note'])
export const WORKSPACE_AGENT_IDEAS_SCHEMA = 'meridian.workspace-agent-ideas.v1'
const REMOTE_FILES = [MANIFEST, PLAN, CHANGES, GRAPH, EVENTS] as const
const MAX_RETAINED_CHANGES = 500
const WorkspaceChangeKindSchema = z.enum([
  'project.snapshot',
  'project.updated',
  'idea.linked',
  'idea.unlinked',
  'idea.updated',
  'idea.node_linked',
  'idea.node_unlinked',
  'idea.node_changed',
])

const ManifestSchema = z.object({
  schema_version: z.literal(WORKSPACE_SCHEMA),
  project: z.object({ id: z.string(), name: z.string() }),
  surfaces: z.object({
    plan: z.object({ path: z.literal(PLAN), writer: z.literal('meridian-app') }),
    changes: z.object({ path: z.literal(CHANGES), writer: z.literal('meridian-app') }).optional(),
    graph: z.object({ path: z.literal(GRAPH), writer: z.literal('workspace') }),
    events: z.object({ path: z.literal(EVENTS), writer: z.literal('workspace') }),
    ideas: z.object({ path: z.literal(AGENT_IDEAS), writer: z.literal('workspace') }).optional(),
  }),
})

const IdeaProjectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  archived: z.boolean(),
  created: z.string(),
  updated: z.string(),
  node: z.string().optional(),
  source: z.object({
    chat_title: z.string(),
    paper_id: z.string().optional(),
    paper_title: z.string().optional(),
  }).strict(),
}).strict()

const ChangeRefSchema = z.object({
  kind: z.enum(['project', 'idea', 'node']),
  id: z.string(),
}).strict()

const WorkspaceChangeSchema = z.object({
  sequence: z.number().int().positive(),
  at: z.string(),
  kind: WorkspaceChangeKindSchema,
  summary: z.string(),
  refs: z.array(ChangeRefSchema),
}).strict()

const WorkspaceChangesSchema = z.object({
  schema_version: z.literal(WORKSPACE_CHANGES_SCHEMA),
  project_id: z.string(),
  epoch: z.string(),
  next_sequence: z.number().int().positive(),
  ideas: z.array(IdeaProjectionSchema),
  changes: z.array(WorkspaceChangeSchema).max(MAX_RETAINED_CHANGES),
}).strict().superRefine((value, context) => {
  if (new Set(value.ideas.map((idea) => idea.id)).size !== value.ideas.length) {
    context.addIssue({ code: 'custom', path: ['ideas'], message: 'Idea IDs must be unique' })
  }
  let previous = 0
  for (const [index, change] of value.changes.entries()) {
    if (change.sequence <= previous || change.sequence >= value.next_sequence) {
      context.addIssue({
        code: 'custom', path: ['changes', index, 'sequence'],
        message: 'Change sequences must increase and remain below next_sequence',
      })
    }
    previous = change.sequence
  }
})

type IdeaProjection = z.infer<typeof IdeaProjectionSchema>
type WorkspaceChange = z.infer<typeof WorkspaceChangeSchema>
type WorkspaceChanges = z.infer<typeof WorkspaceChangesSchema>

const WorkspaceEventFileSchema = z.object({
  schema_version: z.literal(WORKSPACE_EVENTS_SCHEMA),
  events: z.array(z.object({
    id: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    text: z.string().trim().min(1),
    source: z.string().trim().min(1),
    node: z.string().optional(),
    kind: WorkspaceEventKindSchema.optional(),
    detail: z.string().trim().min(1).max(300).optional(),
    at: z.string().optional(),
  })),
})

type JsonObject = Record<string, unknown>
type SshBinding = Extract<ProjectWorkspaceBinding, { kind: 'ssh' }>

/** Injectable seam for protocol tests; production uses the user's system OpenSSH client. */
export type SshExecutor = (binding: SshBinding, command: string, input?: Buffer) => Buffer

/** Writes beside the destination and renames over it, so readers never observe half a JSON file. */
function atomicJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = join(dirname(file), `.${randomUUID()}.tmp`)
  writeFileSync(temporary, jsonBytes(value))
  renameSync(temporary, file)
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function manifestOf(project: ProjectRecord): z.infer<typeof ManifestSchema> {
  return {
    schema_version: WORKSPACE_SCHEMA,
    project: { id: project.id, name: project.name },
    surfaces: {
      plan: { path: PLAN, writer: 'meridian-app' },
      changes: { path: CHANGES, writer: 'meridian-app' },
      graph: { path: GRAPH, writer: 'workspace' },
      events: { path: EVENTS, writer: 'workspace' },
      ideas: { path: AGENT_IDEAS, writer: 'workspace' },
    },
  }
}

function planBody(project: ProjectRecord): JsonObject {
  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      priority: project.priority,
      topic: project.topic,
      focus: project.focus,
      ...(project.block === undefined ? {} : { block: project.block }),
      start: project.start,
      due: project.due,
    },
    tasks: project.tasks,
    milestones: project.milestones,
  }
}

function ideaProjections(project: ProjectRecord, ideas: readonly ResearchIdea[]): IdeaProjection[] {
  return ideas
    .filter((idea) => idea.project === project.id)
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))
    .map((idea) => ({
      id: idea.id,
      title: idea.title,
      body: idea.body,
      archived: idea.archived,
      created: idea.created,
      updated: idea.updated,
      ...(idea.node === undefined ? {} : { node: idea.node }),
      source: {
        chat_title: idea.source.chatTitle,
        ...(idea.source.paperId === undefined ? {} : { paper_id: idea.source.paperId }),
        ...(idea.source.paperTitle === undefined ? {} : { paper_title: idea.source.paperTitle }),
      },
    }))
}

function changedProjectFields(prior: JsonObject | undefined, next: JsonObject): string[] {
  if (prior === undefined) return ['project', 'tasks', 'milestones']
  return ['project', 'tasks', 'milestones'].filter((key) => (
    JSON.stringify(prior[key]) !== JSON.stringify(next[key])
  ))
}

function changeRefs(
  projectId: string,
  ...refs: { kind: 'idea' | 'node'; id?: string | undefined }[]
): WorkspaceChange['refs'] {
  const seen = new Set<string>()
  return [
    { kind: 'project' as const, id: projectId },
    ...refs.flatMap((ref) => {
      if (ref.id === undefined) return []
      const key = `${ref.kind}:${ref.id}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ kind: ref.kind, id: ref.id }]
    }),
  ]
}

function pendingChanges(
  project: ProjectRecord,
  priorPlan: JsonObject | undefined,
  nextPlan: JsonObject,
  priorIdeas: readonly IdeaProjection[],
  nextIdeas: readonly IdeaProjection[],
): Omit<WorkspaceChange, 'sequence' | 'at'>[] {
  const changes: Omit<WorkspaceChange, 'sequence' | 'at'>[] = []
  const fields = changedProjectFields(priorPlan, nextPlan)
  if (priorPlan === undefined) {
    changes.push({
      kind: 'project.snapshot',
      summary: `Project snapshot created: ${project.name}`,
      refs: changeRefs(project.id),
    })
  } else if (fields.length > 0) {
    changes.push({
      kind: 'project.updated',
      summary: `Project ${fields.join(', ')} updated: ${project.name}`,
      refs: changeRefs(project.id),
    })
  }

  const before = new Map(priorIdeas.map((idea) => [idea.id, idea]))
  const after = new Map(nextIdeas.map((idea) => [idea.id, idea]))
  for (const idea of nextIdeas) {
    const prior = before.get(idea.id)
    if (prior === undefined) {
      changes.push({
        kind: 'idea.linked',
        summary: `Idea linked to project: ${idea.title}`,
        refs: changeRefs(project.id, { kind: 'idea', id: idea.id }, { kind: 'node', id: idea.node }),
      })
      continue
    }
    if (JSON.stringify(prior) === JSON.stringify(idea)) continue
    const kind = prior.node === idea.node
      ? 'idea.updated'
      : prior.node === undefined
        ? 'idea.node_linked'
        : idea.node === undefined
          ? 'idea.node_unlinked'
          : 'idea.node_changed'
    changes.push({
      kind,
      summary: kind === 'idea.updated'
        ? `Idea updated: ${idea.title}`
        : `Idea node association changed: ${idea.title}`,
      refs: changeRefs(
        project.id,
        { kind: 'idea', id: idea.id },
        { kind: 'node', id: prior.node },
        { kind: 'node', id: idea.node },
      ),
    })
  }
  for (const idea of priorIdeas) {
    if (after.has(idea.id)) continue
    changes.push({
      kind: 'idea.unlinked',
      summary: `Idea unlinked from project: ${idea.title}`,
      refs: changeRefs(project.id, { kind: 'idea', id: idea.id }, { kind: 'node', id: idea.node }),
    })
  }
  return changes
}

function changesOf(
  project: ProjectRecord,
  priorPlan: JsonObject | undefined,
  nextPlan: JsonObject,
  prior: WorkspaceChanges | undefined,
  ideas: readonly ResearchIdea[],
): WorkspaceChanges {
  const projected = ideaProjections(project, ideas)
  const base: WorkspaceChanges = prior ?? {
    schema_version: WORKSPACE_CHANGES_SCHEMA,
    project_id: project.id,
    epoch: randomUUID(),
    next_sequence: 1,
    ideas: [],
    changes: [],
  }
  if (base.project_id !== project.id) throw new Error('变动列表不属于当前项目')
  const at = new Date().toISOString()
  const additions = pendingChanges(project, priorPlan, nextPlan, base.ideas, projected)
    .map((change, index): WorkspaceChange => ({
      sequence: base.next_sequence + index,
      at,
      ...change,
    }))
  return {
    ...base,
    next_sequence: base.next_sequence + additions.length,
    ideas: projected,
    changes: [...base.changes, ...additions].slice(-MAX_RETAINED_CHANGES),
  }
}

function planOf(project: ProjectRecord): { revision: string; value: JsonObject } {
  const body = planBody(project)
  const revision = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)
  return {
    revision,
    value: {
      schema_version: PROJECT_PLAN_SCHEMA,
      revision,
      updated_at: new Date().toISOString(),
      ...body,
    },
  }
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function sshError(stderr: Buffer | string | null | undefined): string {
  const message = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : (stderr ?? '')
  return message.trim().split('\n').at(-1) || 'SSH 连接失败'
}

const systemSsh: SshExecutor = (binding, command, input) => {
  const args = [
    '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5',
    ...(binding.port === undefined ? [] : ['-p', String(binding.port)]),
    binding.host, command,
  ]
  const result = spawnSync('ssh', args, {
    input,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 15_000,
  })
  if (result.error) {
    throw new Error(result.error.message.includes('ETIMEDOUT') ? 'SSH 连接超时' : result.error.message)
  }
  if (result.status !== 0) throw new Error(sshError(result.stderr))
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '')
}

/** Resolves and validates a directory before it is stored on a project page. */
export function projectWorkspaceRoot(root: string): string {
  if (!isAbsolute(root)) throw new Error('项目目录必须是绝对路径')
  const canonical = realpathSync(root)
  if (!statSync(canonical).isDirectory()) throw new Error('项目目录不是文件夹')
  return canonical
}

/** Validates the non-secret part of an SSH binding. Credentials remain in OpenSSH. */
export function projectWorkspaceSsh(binding: Omit<SshBinding, 'kind'>): SshBinding {
  const host = binding.host.trim()
  const path = binding.path.trim()
  if (!/^(?!-)[A-Za-z0-9._@%+:[\]-]+$/.test(host)) throw new Error('SSH 主机或别名无效')
  if (path.includes('\0') || path.includes('\n') || path.includes('\r') || !posix.isAbsolute(path)) {
    throw new Error('远端项目目录必须是绝对路径')
  }
  if (binding.port !== undefined && (!Number.isInteger(binding.port) || binding.port < 1 || binding.port > 65_535)) {
    throw new Error('SSH 端口无效')
  }
  const normalized = posix.normalize(path)
  return {
    kind: 'ssh', host, path: normalized === '/' ? normalized : normalized.replace(/\/+$/, ''),
    ...(binding.port === undefined ? {} : { port: binding.port }),
  }
}

function sshBindingOf(project: ProjectRecord): SshBinding | undefined {
  return project.workspaceSsh === undefined ? undefined : projectWorkspaceSsh(project.workspaceSsh)
}

function readRemoteCommand(root: string): string {
  const files = REMOTE_FILES.map(quoteShell).join(' ')
  return [
    'set -eu',
    `root=${quoteShell(root)}`,
    '[ -d "$root" ] || { printf "%s\\n" "远端项目目录不存在" >&2; exit 44; }',
    `for rel in ${files}; do`,
    '  file="$root/$rel"',
    '  if [ -f "$file" ]; then',
    "    bytes=$(wc -c < \"$file\" | tr -d '[:space:]')",
    '    printf "%s %s\\n" "$rel" "$bytes"',
    '    cat "$file"',
    '    printf "\\n"',
    '  else',
    '    printf "%s -1\\n" "$rel"',
    '  fi',
    'done',
  ].join('\n')
}

function parseRemoteFiles(payload: Buffer): Map<string, string> {
  const files = new Map<string, string>()
  let offset = 0
  for (const expected of REMOTE_FILES) {
    const lineEnd = payload.indexOf(10, offset)
    if (lineEnd < 0) throw new Error('SSH 工作区响应不完整')
    const header = payload.subarray(offset, lineEnd).toString('utf8')
    const split = header.lastIndexOf(' ')
    const name = split < 0 ? '' : header.slice(0, split)
    const size = split < 0 ? Number.NaN : Number(header.slice(split + 1))
    if (name !== expected || !Number.isInteger(size) || size < -1) {
      throw new Error('SSH 工作区响应无效')
    }
    offset = lineEnd + 1
    if (size === -1) continue
    const end = offset + size
    if (end > payload.length || payload[end] !== 10) throw new Error('SSH 工作区响应不完整')
    files.set(name, payload.subarray(offset, end).toString('utf8'))
    offset = end + 1
  }
  if (offset !== payload.length) throw new Error('SSH 工作区响应带有多余内容')
  return files
}

function readRemoteFiles(binding: SshBinding, ssh: SshExecutor): Map<string, string> {
  return parseRemoteFiles(ssh(binding, readRemoteCommand(binding.path)))
}

function writeRemoteFiles(
  binding: SshBinding, plan: Buffer, changes: Buffer, manifest: Buffer, ssh: SshExecutor,
): void {
  const token = randomUUID()
  const command = [
    'set -eu',
    `root=${quoteShell(binding.path)}`,
    '[ -d "$root" ] || { printf "%s\\n" "远端项目目录不存在" >&2; exit 44; }',
    'umask 077',
    'mkdir -p "$root/.meridian/control"',
    `plan_tmp="$root/.meridian/control/.${token}.tmp"`,
    `changes_tmp="$root/.meridian/control/.${token}.changes.tmp"`,
    `manifest_tmp="$root/.meridian/.${token}.tmp"`,
    'trap \'rm -f "$plan_tmp" "$changes_tmp" "$manifest_tmp"\' 0 1 2 3 15',
    `dd bs=1 count=${plan.byteLength} of="$plan_tmp" 2>/dev/null`,
    `dd bs=1 count=${changes.byteLength} of="$changes_tmp" 2>/dev/null`,
    `dd bs=1 count=${manifest.byteLength} of="$manifest_tmp" 2>/dev/null`,
    'mv "$plan_tmp" "$root/.meridian/control/plan.json"',
    'mv "$changes_tmp" "$root/.meridian/control/changes.json"',
    'mv "$manifest_tmp" "$root/.meridian/workspace.json"',
    'trap - 0 1 2 3 15',
  ].join('\n')
  ssh(binding, command, Buffer.concat([plan, changes, manifest]))
}

function parsedObject(text: string | undefined): JsonObject | undefined {
  if (text === undefined) return undefined
  const value: unknown = JSON.parse(text)
  return obj(value)
}

function parsedChanges(text: string | undefined): WorkspaceChanges | undefined {
  if (text === undefined) return undefined
  return WorkspaceChangesSchema.parse(JSON.parse(text))
}

/**
 * Materializes the App-owned control surface. Existing external graph and event files are never
 * opened for writing. An unknown manifest is refused rather than silently replaced.
 */
export function writeProjectWorkspace(project: ProjectRecord, ssh: SshExecutor = systemSsh): string {
  return writeProjectWorkspaceState(project, [], ssh)
}

/** Materializes the App-owned plan, linked-idea index, and incremental change journal. */
export function writeProjectWorkspaceState(
  project: ProjectRecord,
  ideas: readonly ResearchIdea[],
  ssh: SshExecutor = systemSsh,
): string {
  const planned = planOf(project)
  const manifest = manifestOf(project)
  const remote = sshBindingOf(project)
  if (remote !== undefined) {
    const files = readRemoteFiles(remote, ssh)
    const prior = files.get(MANIFEST)
    if (prior !== undefined) ManifestSchema.parse(JSON.parse(prior))
    const changes = changesOf(
      project,
      parsedObject(files.get(PLAN)),
      planned.value,
      parsedChanges(files.get(CHANGES)),
      ideas,
    )
    writeRemoteFiles(
      remote, jsonBytes(planned.value), jsonBytes(changes), jsonBytes(manifest), ssh,
    )
    return planned.revision
  }

  if (project.workspaceRoot === undefined) throw new Error('项目尚未连接工作区')
  const root = projectWorkspaceRoot(project.workspaceRoot)
  const manifestFile = join(root, MANIFEST)
  if (existsSync(manifestFile)) ManifestSchema.parse(JSON.parse(readFileSync(manifestFile, 'utf8')))
  const planFile = join(root, PLAN)
  const changesFile = join(root, CHANGES)
  const changes = changesOf(
    project,
    existsSync(planFile) ? parsedObject(readFileSync(planFile, 'utf8')) : undefined,
    planned.value,
    existsSync(changesFile) ? parsedChanges(readFileSync(changesFile, 'utf8')) : undefined,
    ideas,
  )
  atomicJson(planFile, planned.value)
  atomicJson(changesFile, changes)
  atomicJson(manifestFile, manifest)
  return planned.revision
}

function obj(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function graphHealth(value: unknown): NonNullable<ProjectWorkspace['graphHealth']> {
  if (value === 'pass' || value === 'ok') return 'ok'
  if (value === 'warning') return 'warning'
  if (value === 'fail' || value === 'error') return 'error'
  return 'unknown'
}

const LAB_NODE_MODES = new Set(['unresolved', 'repairable', 'supported', 'dead'])
const LAB_BRANCH_EDGE_KINDS = new Set(['continues', 'branches_from'])

/** Adapts the generated Lab graph into the small, layout-bearing graph the desktop already draws. */
function readGraphJson(text: string | undefined): {
  graph: ResearchGraph
  generatedAt?: string
  health: NonNullable<ProjectWorkspace['graphHealth']>
} | undefined {
  if (text === undefined) return undefined
  const raw = obj(JSON.parse(text))
  if (raw === undefined || raw['schema'] !== 'meridian.lab.graph.v1') {
    throw new Error('科研图不是 meridian.lab.graph.v1')
  }
  const sourceNodes = Array.isArray(raw['nodes']) ? raw['nodes'].map(obj).filter((n) => n !== undefined) : []
  const ids = new Set(sourceNodes.flatMap((node) => {
    const id = str(node['id'])
    return id === undefined ? [] : [id]
  }))
  const sourceEdges = (Array.isArray(raw['edges']) ? raw['edges'] : []).flatMap((edge) => {
    const row = obj(edge)
    const source = str(row?.['source'])
    const target = str(row?.['target'])
    return source !== undefined && target !== undefined && ids.has(source) && ids.has(target)
      ? [{ source, target, kind: str(row?.['kind']) }]
      : []
  })
  // The project graph is an approach tree. Semantic relations such as `contradicts`
  // remain in the node document until the UI can label them; treating them as parent
  // edges turns sibling branches into a false linear chain.
  const branchEdges = sourceEdges
    .filter((edge) => edge.kind === undefined || LAB_BRANCH_EDGE_KINDS.has(edge.kind))
    .map(({ source, target }): [string, string] => [source, target])
  // `active_nodes` is the current source of truth; a legacy export that still carries only
  // `active_path` is read as its last valid id, per the shared on-disk contract.
  const activeNodes = Array.isArray(raw['active_nodes'])
    ? raw['active_nodes'].flatMap((value) => typeof value === 'string' && ids.has(value) ? [value] : [])
    : (Array.isArray(raw['active_path']) ? raw['active_path'] : [])
      .flatMap((value) => typeof value === 'string' && ids.has(value) ? [value] : [])
      .slice(-1)
  const activeSet = new Set(activeNodes)
  const nodeDetails = obj(raw['node_details']) ?? {}

  const depth = new Map([...ids].map((id) => [id, 0]))
  for (let pass = 0; pass < ids.size; pass += 1) {
    let changed = false
    for (const [source, target] of branchEdges) {
      const next = Math.min(ids.size - 1, (depth.get(source) ?? 0) + 1)
      if (next > (depth.get(target) ?? 0)) {
        depth.set(target, next)
        changed = true
      }
    }
    if (!changed) break
  }
  const lane = new Map<number, number>()
  const nodes = sourceNodes.flatMap((node) => {
    const id = str(node['id'])
    if (id === undefined) return []
    const column = depth.get(id) ?? 0
    const row = lane.get(column) ?? 0
    lane.set(column, row + 1)
    const externalState = str(node['state'])
    const nextAction = str(obj(nodeDetails[id])?.['next_action'])
    const mode = externalState !== undefined && LAB_NODE_MODES.has(externalState)
      ? externalState as 'unresolved' | 'repairable' | 'supported' | 'dead'
      : undefined
    const state = externalState === 'supported'
      ? 'done' as const
      : activeSet.has(id)
        ? 'act' as const
        : 'idle' as const
    return [{
      id,
      label: str(node['label']) ?? str(node['title']) ?? id,
      state,
      ...(mode === undefined ? {} : { mode }),
      ...(nextAction === undefined ? {} : { nextAction }),
      x: 20 + column * 220,
      y: 20 + row * 56,
      width: 180,
      ...(str(node['markdown']) === undefined ? {} : { markdown: str(node['markdown'])! }),
      ...(str(node['markdown_path']) === undefined ? {} : { markdownPath: str(node['markdown_path'])! }),
      ...(str(node['markdown_anchor']) === undefined ? {} : { markdownAnchor: str(node['markdown_anchor'])! }),
      writebacks: [],
    }]
  })
  const health = obj(raw['health'])
  const generatedAt = str(raw['generated_at'])
  return {
    graph: { nodes, edges: branchEdges, activeNodes },
    ...(generatedAt === undefined ? {} : { generatedAt }),
    health: graphHealth(health?.['status']),
  }
}

/**
 * Legacy rule for a workspace event written before `kind` existed: source evidence under
 * `.meridian/experiments/` is a result, anything else is a general note.
 */
function legacyEventKind(source: string): 'result' | 'note' {
  return source.startsWith(EXPERIMENTS_PREFIX) ? 'result' : 'note'
}

function readEventsJson(text: string | undefined): ProjectWorkspace['events'] {
  if (text === undefined) return []
  const parsed = WorkspaceEventFileSchema.parse(JSON.parse(text))
  return parsed.events.map((event) => ({
    date: event.date,
    text: event.text,
    origin: 'agent' as const,
    ...(event.node === undefined ? {} : { node: event.node }),
    kind: event.kind ?? legacyEventKind(event.source),
    ...(event.detail === undefined ? {} : { detail: event.detail }),
    ...(event.at === undefined ? {} : { at: event.at }),
  }))
}

function projectWorkspaceFromFiles(
  base: Pick<ProjectWorkspace, 'kind' | 'root' | 'host' | 'port' | 'planPath'>,
  files: Map<string, string>,
): ProjectWorkspace {
  const manifestText = files.get(MANIFEST)
  if (manifestText === undefined) throw new Error('工作区尚未初始化')
  const manifest = ManifestSchema.parse(JSON.parse(manifestText))
  const planText = files.get(manifest.surfaces.plan.path)
  if (planText === undefined) throw new Error('工作区缺少项目计划')
  const plan = obj(JSON.parse(planText))
  const revision = str(plan?.['revision'])
  const issues: string[] = []
  const external = readSurface('科研图', () => readGraphJson(files.get(manifest.surfaces.graph.path)), issues)
  const events = readSurface('科研记录', () => readEventsJson(files.get(manifest.surfaces.events.path)), issues)
  return {
    ...base,
    state: 'ready',
    ...(revision === undefined ? {} : { planRevision: revision }),
    ...(external === undefined ? {} : {
      graph: external.graph,
      ...(external.generatedAt === undefined ? {} : { graphGeneratedAt: external.generatedAt }),
      graphHealth: external.health,
    }),
    events: events ?? [],
    ...(issues.length === 0 ? {} : { issue: issues.join(';') }),
  }
}

/**
 * Reads one agent-written surface on its own, so a surface this App version cannot parse is reported
 * in `issues` as one line naming `label` and the reason, instead of hiding the surfaces that did parse.
 */
function readSurface<T>(label: string, read: () => T, issues: string[]): T | undefined {
  try {
    return read()
  } catch (error) {
    const why = error instanceof z.ZodError
      ? '格式是这个版本的 Meridian 不认识的,请更新 App'
      : error instanceof Error ? error.message : String(error)
    issues.push(`${label}读不了:${why}`)
    return undefined
  }
}

function localFiles(root: string): Map<string, string> {
  return new Map(REMOTE_FILES.flatMap((name) => {
    const file = join(root, name)
    return existsSync(file) ? [[name, readFileSync(file, 'utf8')]] : []
  }))
}

const AgentIdeasFileSchema = z.object({
  schema_version: z.literal(WORKSPACE_AGENT_IDEAS_SCHEMA),
  ideas: z.array(z.object({
    id: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(20_000),
    context: z.string().trim().min(1).optional(),
    node: z.string().min(1).optional(),
  })),
})

/** One idea a coding agent recorded in a project workspace. */
export type WorkspaceAgentIdea = z.infer<typeof AgentIdeasFileSchema>['ideas'][number]

/**
 * Returns the ideas coding agents recorded in the local workspace at `root`, in file order. It is
 * empty when `root` is undefined (unbound or SSH) and when the file is absent; a file that breaks
 * the schema is reported on stderr and read as empty, so one bad file does not block the idea list.
 */
export function readWorkspaceAgentIdeas(root: string | undefined): WorkspaceAgentIdea[] {
  if (root === undefined) return []
  const file = join(root, AGENT_IDEAS)
  if (!existsSync(file)) return []
  try {
    return AgentIdeasFileSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).ideas
  } catch (error) {
    console.error(`[workspace] ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

/** Reads external surfaces afresh; callers can refresh without importing or copying project data. */
export function readProjectWorkspace(
  project: ProjectRecord, ssh: SshExecutor = systemSsh,
): ProjectWorkspace | undefined {
  const remote = sshBindingOf(project)
  if (remote !== undefined) {
    const planPath = `${remote.host}:${posix.join(remote.path, PLAN)}`
    const base = {
      kind: 'ssh' as const,
      root: remote.path,
      host: remote.host,
      ...(remote.port === undefined ? {} : { port: remote.port }),
      planPath,
    }
    try {
      return projectWorkspaceFromFiles(base, readRemoteFiles(remote, ssh))
    } catch (error) {
      return {
        ...base,
        state: 'invalid',
        events: [],
        issue: error instanceof Error ? error.message : String(error),
      }
    }
  }

  if (project.workspaceRoot === undefined) return undefined
  const root = project.workspaceRoot
  const base = { kind: 'local' as const, root, planPath: join(root, PLAN) }
  if (!existsSync(root)) return { ...base, state: 'missing', events: [], issue: '项目目录不存在' }
  try {
    return projectWorkspaceFromFiles(base, localFiles(root))
  } catch (error) {
    return {
      ...base,
      state: 'invalid',
      events: [],
      issue: error instanceof Error ? error.message : String(error),
    }
  }
}
