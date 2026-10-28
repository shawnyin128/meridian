import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  existsSync, globSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, posix, resolve } from 'node:path'
import { z } from 'zod'
import { WorkspaceSpaceIdSchema } from '../../shared/contract.js'
import type {
  ProjectWorkspace, ProjectWorkspaceBinding, ResearchGraph, ResearchIdea, SshFolders, WorkspaceSpace,
} from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { readRecord, readStoredList, withUnknownFields, type UnknownField } from '../vault/stored-records.js'
import type { ProjectRecord } from './page.js'

export const WORKSPACE_SCHEMA = 'meridian.workspace.v1'
export const PROJECT_PLAN_SCHEMA = 'meridian.project-plan.v1'
export const WORKSPACE_EVENTS_SCHEMA = 'meridian.workspace-events.v1'
export const WORKSPACE_CHANGES_SCHEMA = 'meridian.workspace-changes.v1'

export const WORKSPACE_AGENT_IDEA_FILES_SCHEMA = 'meridian.workspace-agent-idea-files.v1'
export const WORKSPACE_AGENT_TASKS_SCHEMA = 'meridian.workspace-agent-tasks.v1'
const WorkspaceEventKindSchema = z.enum(['start', 'reopen', 'result', 'decision', 'complete', 'note'])
export const WORKSPACE_AGENT_IDEAS_SCHEMA = 'meridian.workspace-agent-ideas.v1'
/** The first project's space; later projects' spaces are folders of NESTED_SPACES. */
const ROOT_SPACE = '.meridian'
const NESTED_SPACES = '.meridian/projects'

/** The files of one project space, relative to the workspace root, with `/` between their parts. */
type SpacePaths = {
  folder: string
  manifest: string
  plan: string
  graph: string
  events: string
  changes: string
  ideas: string
  ideaFiles: string
  tasks: string
  experiments: string
  /** The files a read of the space's state takes, in the order an SSH read prints them. */
  read: readonly string[]
}

/** The files of the root space when `space` is undefined, else of the nested space `space`. */
function spacePaths(space: string | undefined): SpacePaths {
  const folder = space === undefined ? ROOT_SPACE : `${NESTED_SPACES}/${WorkspaceSpaceIdSchema.parse(space)}`
  const manifest = `${folder}/workspace.json`
  const plan = `${folder}/control/plan.json`
  const changes = `${folder}/control/changes.json`
  const graph = `${folder}/graph/graph.json`
  const events = `${folder}/events/events.json`
  return {
    folder, manifest, plan, graph, events, changes,
    ideas: `${folder}/ideas/ideas.json`,
    // Not declared in the manifest, as the tasks file is not.
    ideaFiles: `${folder}/ideas/files.json`,
    // Not declared in the manifest: a 0.0.14 plugin rejects a manifest naming a surface it does not know.
    tasks: `${folder}/tasks/tasks.json`,
    experiments: `${folder}/experiments/`,
    read: [manifest, plan, changes, graph, events],
  }
}
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

/** The manifest of the space whose files `paths` names: its surfaces lie in that space's folder. */
function manifestSchema(paths: SpacePaths) {
  return z.object({
    schema_version: z.literal(WORKSPACE_SCHEMA),
    project: z.object({ id: z.string(), name: z.string() }),
    surfaces: z.object({
      plan: z.object({ path: z.literal(paths.plan), writer: z.literal('meridian-app') }),
      changes: z.object({ path: z.literal(paths.changes), writer: z.literal('meridian-app') }).optional(),
      graph: z.object({ path: z.literal(paths.graph), writer: z.literal('workspace') }),
      events: z.object({ path: z.literal(paths.events), writer: z.literal('workspace') }),
      ideas: z.object({ path: z.literal(paths.ideas), writer: z.literal('workspace') }).optional(),
    }),
  })
}
type Manifest = z.infer<ReturnType<typeof manifestSchema>>

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
  task_ids: z.array(z.string().min(1)).optional(),
  milestone_ids: z.array(z.string().min(1)).optional(),
}).strict()

const WorkspaceChangesSchema = z.object({
  schema_version: z.literal(WORKSPACE_CHANGES_SCHEMA),
  project_id: z.string(),
  epoch: z.string(),
  next_sequence: z.number().int().positive(),
  ideas: z.array(IdeaProjectionSchema),
  /** Changes as written; parsedChanges reads each one on its own with WorkspaceChangeSchema. */
  changes: z.array(z.unknown()).max(MAX_RETAINED_CHANGES),
}).strict().superRefine((value, context) => {
  if (new Set(value.ideas.map((idea) => idea.id)).size !== value.ideas.length) {
    context.addIssue({ code: 'custom', path: ['ideas'], message: 'Idea IDs must be unique' })
  }
})

type IdeaProjection = z.infer<typeof IdeaProjectionSchema>
type WorkspaceChange = z.infer<typeof WorkspaceChangeSchema>
type WorkspaceChanges = z.infer<typeof WorkspaceChangesSchema>

const WorkspaceEventSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().trim().min(1),
  source: z.string().trim().min(1),
  node: z.string().optional(),
  kind: WorkspaceEventKindSchema.optional(),
  detail: z.string().trim().min(1).max(300).optional(),
  at: z.string().optional(),
})

const WorkspaceEventFileSchema = z.object({
  schema_version: z.literal(WORKSPACE_EVENTS_SCHEMA),
  events: z.array(z.unknown()),
})

/** Why a surface or record that does not match this version's schema cannot be read. */
const UNKNOWN_FORMAT = '格式是这个版本的 Meridian 不认识的，请更新 App'

type JsonObject = Record<string, unknown>
type SshBinding = Extract<ProjectWorkspaceBinding, { kind: 'ssh' }>

/** Where an SSH command connects: a host name or `Host` alias, and the port when it is not the default. */
export type SshTarget = Pick<SshBinding, 'host' | 'port'>

/**
 * Injectable seam for protocol tests: runs `command` on `target` with `input` on its standard input,
 * without blocking Core, and settles to its standard output. Production uses the user's system
 * OpenSSH client.
 */
export type SshExecutor = (target: SshTarget, command: string, input?: Buffer) => Promise<Buffer>

/** Injectable seam for listing folders: runs one command on an SSH host without blocking Core. */
export type SshCommand = (target: SshTarget, command: string) => Promise<Buffer>

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

function manifestOf(project: ProjectRecord, paths: SpacePaths): Manifest {
  return {
    schema_version: WORKSPACE_SCHEMA,
    project: { id: project.id, name: project.name },
    surfaces: {
      plan: { path: paths.plan, writer: 'meridian-app' },
      changes: { path: paths.changes, writer: 'meridian-app' },
      graph: { path: paths.graph, writer: 'workspace' },
      events: { path: paths.events, writer: 'workspace' },
      ideas: { path: paths.ideas, writer: 'workspace' },
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
      ...(project.topics === undefined ? {} : { topics: project.topics }),
      focus: project.focus,
      ...(project.block === undefined ? {} : { block: project.block }),
      start: project.start,
      due: project.due,
    },
    tasks: project.tasks.map((task) => {
      const node = project.taskNodes?.[task.id]
      return node === undefined ? task : { ...task, node }
    }),
    milestones: project.milestones,
    ...agentTasksOf(project),
  }
}

/** `{ agent_tasks }` mapping each agent task request to the plan task it became and still is, or nothing. */
function agentTasksOf(project: ProjectRecord): JsonObject {
  const ids = new Set(project.tasks.map((task) => task.id))
  const held = Object.entries(project.agentTasks ?? {}).filter(([, task]) => ids.has(task))
  return held.length === 0 ? {} : { agent_tasks: Object.fromEntries(held) }
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
  prior: { value: WorkspaceChanges; unknown: UnknownField[] } | undefined,
  ideas: readonly ResearchIdea[],
  adopt: boolean,
): WorkspaceChanges {
  const projected = ideaProjections(project, ideas)
  const held: WorkspaceChanges = prior?.value ?? {
    schema_version: WORKSPACE_CHANGES_SCHEMA,
    project_id: project.id,
    epoch: randomUUID(),
    next_sequence: 1,
    ideas: [],
    changes: [],
  }
  if (held.project_id !== project.id && !adopt) throw new Error('变动列表不属于当前项目')
  const base = { ...held, project_id: project.id }
  const at = new Date().toISOString()
  const additions = pendingChanges(project, priorPlan, nextPlan, base.ideas, projected)
    .map((change, index): WorkspaceChange => ({
      sequence: base.next_sequence + index,
      at,
      ...change,
    }))
  return withUnknownFields({
    ...base,
    next_sequence: base.next_sequence + additions.length,
    ideas: projected,
    changes: [...base.changes, ...additions].slice(-MAX_RETAINED_CHANGES),
  }, prior?.unknown ?? []) as WorkspaceChanges
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

/** OpenSSH's arguments for running `command` on `target` without asking for a password or a host key. */
function sshArgs(target: SshTarget, command: string): string[] {
  return [
    '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5',
    ...(target.port === undefined ? [] : ['-p', String(target.port)]),
    target.host, command,
  ]
}

const SSH_MAX_BUFFER = 32 * 1024 * 1024
const SSH_TIMEOUT_MS = 15_000

const systemSsh: SshExecutor = (target, command, input) => new Promise((done, fail) => {
  const child = execFile('ssh', sshArgs(target, command), {
    encoding: 'buffer', maxBuffer: SSH_MAX_BUFFER, timeout: SSH_TIMEOUT_MS,
  }, (error, stdout, stderr) => {
    if (error === null) done(stdout)
    // A start that failed and output past maxBuffer carry a code naming why; the timeout's kill carries none.
    else if (typeof error.code === 'string') fail(new Error(error.message))
    else if (error.killed === true) fail(new CallError('timeout', 'SSH 连接超时'))
    else fail(new Error(sshError(stderr)))
  })
  child.stdin?.end(input)
})

/** The SSH calls of each project still running or waiting, by project id; each starts once the one before it settles. */
const sshTurns = new Map<string, Promise<unknown>>()

/** Runs `call`, an SSH call of project `id`, after every SSH call of that project made before it has settled. */
function inTurn<T>(id: string, call: () => Promise<T>): Promise<T> {
  const turn = (sshTurns.get(id) ?? Promise.resolve()).then(call, call)
  const settled = turn.then(() => {}, () => {})
  sshTurns.set(id, settled)
  void settled.then(() => { if (sshTurns.get(id) === settled) sshTurns.delete(id) })
  return turn
}

const systemSshCommand: SshCommand = (target, command) => new Promise((done, fail) => {
  const child = execFile('ssh', sshArgs(target, command), {
    encoding: 'buffer', maxBuffer: SSH_MAX_BUFFER, timeout: SSH_TIMEOUT_MS,
  }, (error, stdout, stderr) => {
    if (error === null) done(stdout)
    else if (error.killed === true) fail(new CallError('timeout', 'SSH 连接超时'))
    else fail(new Error(typeof error.code === 'number' ? sshError(stderr) : error.message))
  })
  child.stdin?.end()
})

/** Resolves and validates a directory before it is stored on a project page. */
export function projectWorkspaceRoot(root: string): string {
  if (!isAbsolute(root)) throw new CallError('invalid', '项目目录必须是绝对路径')
  const canonical = realpathSync(root)
  if (!statSync(canonical).isDirectory()) throw new CallError('invalid', '项目目录不是文件夹')
  return canonical
}

/** A host name or alias that OpenSSH cannot read as an option. */
const SSH_HOST = /^(?!-)[A-Za-z0-9._@%+:[\]-]+$/

/** Validates where an SSH command connects. */
function sshTarget(target: SshTarget): SshTarget {
  const host = target.host.trim()
  if (!SSH_HOST.test(host)) throw new CallError('invalid', 'SSH 主机或别名无效')
  if (target.port !== undefined && (!Number.isInteger(target.port) || target.port < 1 || target.port > 65_535)) {
    throw new CallError('invalid', 'SSH 端口无效')
  }
  return { host, ...(target.port === undefined ? {} : { port: target.port }) }
}

/** Validates an absolute remote path and normalizes it, without a trailing slash except at `/`. */
function remotePath(path: string): string {
  const trimmed = path.trim()
  if (trimmed.includes('\0') || trimmed.includes('\n') || trimmed.includes('\r') || !posix.isAbsolute(trimmed)) {
    throw new CallError('invalid', '远端项目目录必须是绝对路径')
  }
  const normalized = posix.normalize(trimmed)
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}

/** Validates the non-secret part of an SSH binding. Credentials remain in OpenSSH. */
export function projectWorkspaceSsh(binding: Omit<SshBinding, 'kind'>): SshBinding {
  const { host, port } = sshTarget(binding)
  return { kind: 'ssh', host, path: remotePath(binding.path), ...(port === undefined ? {} : { port }) }
}

/** How deep `Include` nests before ssh stops reading, as OpenSSH's own limit. */
const SSH_INCLUDE_DEPTH = 16

/** The arguments of one ssh_config line, unquoted, up to a `#` that starts a comment. */
function configWords(text: string): string[] {
  const words: string[] = []
  for (const [whole, double, single, bare] of text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    if (bare?.startsWith('#') === true) break
    words.push(double ?? single ?? bare ?? whole)
  }
  return words
}

/**
 * The `Host` aliases of the user's OpenSSH client config, `.ssh/config` under `home`, in the order
 * ssh reads them and each once: the patterns of its `Host` lines that name one host, without
 * wildcards or negations. `Include` is followed as ssh follows it: wildcards in its paths expand in
 * lexical order, a path starting with `~/` starts at `home` and any other relative path at
 * `home/.ssh`, and files nested deeper than OpenSSH reads are left out. Nothing but the aliases is
 * read into the result. A missing file has none.
 */
export function sshConfigHosts(home: string): string[] {
  const sshDir = join(home, '.ssh')
  const hosts = new Set<string>()
  const included = (path: string): string[] => {
    const [cwd, pattern] = path.startsWith('~/') ? [home, path.slice(2)] : [sshDir, path]
    return globSync(pattern, { cwd }).map((match) => resolve(cwd, match)).filter((file) => statSync(file).isFile()).sort()
  }
  const read = (file: string, depth: number): void => {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const directive = /^\s*(host|include)(?:\s*=\s*|\s+)(.*)$/i.exec(line)
      if (directive === null) continue
      for (const word of configWords(directive[2]!)) {
        if (directive[1]!.toLowerCase() === 'host') {
          if (SSH_HOST.test(word)) hosts.add(word)
        } else if (depth < SSH_INCLUDE_DEPTH) {
          for (const file of included(word)) read(file, depth + 1)
        }
      }
    }
  }
  const config = join(sshDir, 'config')
  if (existsSync(config)) read(config, 0)
  return [...hosts]
}

/**
 * The `cd` lines that enter `path`: an absolute path, or `~` and a path under `~/`, which start at
 * the remote home, as does no path at all. Throws `invalid` for any other path.
 */
function enterFolder(path: string | undefined): string[] {
  const trimmed = path?.trim() ?? '~'
  if (trimmed !== '~' && !trimmed.startsWith('~/')) return [`cd -- ${quoteShell(remotePath(trimmed))}`]
  const under = trimmed.slice(2)
  if (/[\0\n\r]/.test(under)) throw new CallError('invalid', '远端项目目录必须是绝对路径')
  const normalized = posix.normalize(under || '.').replace(/(.)\/+$/, '$1')
  return normalized === '.' ? ['cd'] : ['cd', `cd -- ${quoteShell(normalized)}`]
}

/**
 * Prints the folder `path` resolves to (see `enterFolder`), then `./` and the name of each of its
 * entries that is a folder or a link to one, each ended by NUL.
 */
function listFoldersCommand(path: string | undefined): string {
  return [
    'set -eu',
    ...enterFolder(path),
    "printf '%s\\0' \"$PWD\"",
    // Not a glob: a zsh login shell fails a glob that matches nothing, as in an empty folder.
    'find -L . -mindepth 1 -maxdepth 1 -type d -print0',
  ].join('\n')
}

/**
 * Lists one folder of the SSH host `target` over one connection, in a child process: the folder at
 * `path`, an absolute path or one starting at `~`, or the remote home when `path` is undefined.
 * Resolves it `ready` with its path as the remote shell resolved it, its parent (null at `/`) and its
 * subfolders by name, leaving out hidden ones and those whose path a binding cannot hold; or
 * `failed` with the reason SSH or the remote shell gave. Rejects with `invalid` for a host, port or
 * path that cannot be used, without connecting.
 */
export async function sshFolders(
  target: SshTarget, path: string | undefined, ssh: SshCommand = systemSshCommand,
): Promise<SshFolders> {
  const remote = sshTarget(target)
  const command = listFoldersCommand(path)
  let payload: Buffer
  try {
    payload = await ssh(remote, command)
  } catch (error) {
    return { state: 'failed', issue: error instanceof Error ? error.message : String(error) }
  }
  const [folder = '', ...entries] = payload.toString('utf8').split('\0')
  const names = entries.slice(0, -1)
  if (!posix.isAbsolute(folder) || entries.at(-1) !== '' || !names.every((entry) => entry.startsWith('./'))) {
    return { state: 'failed', issue: 'SSH 文件夹响应无效' }
  }
  return {
    state: 'ready',
    path: folder,
    parent: folder === '/' ? null : posix.dirname(folder),
    folders: names.map((entry) => entry.slice(2))
      // A binding's path is trimmed and holds no line break, so such a name could not be bound.
      .filter((name) => !name.startsWith('.') && !/[\n\r]|\s$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => ({ name, path: posix.join(folder, name) })),
  }
}

function sshBindingOf(project: ProjectRecord): SshBinding | undefined {
  return project.workspaceSsh === undefined ? undefined : projectWorkspaceSsh(project.workspaceSsh)
}

function readRemoteCommand(root: string, names: readonly string[]): string {
  const files = names.map(quoteShell).join(' ')
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

function parseRemoteFiles(payload: Buffer, names: readonly string[]): Map<string, string> {
  const files = new Map<string, string>()
  let offset = 0
  for (const expected of names) {
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

async function readRemoteFiles(binding: SshBinding, names: readonly string[], ssh: SshExecutor): Promise<Map<string, string>> {
  return parseRemoteFiles(await ssh(binding, readRemoteCommand(binding.path, names)), names)
}

async function writeRemoteFiles(
  binding: SshBinding, paths: SpacePaths, plan: Buffer, changes: Buffer, manifest: Buffer, ssh: SshExecutor,
): Promise<void> {
  const token = randomUUID()
  const command = [
    'set -eu',
    `root=${quoteShell(binding.path)}`,
    `space="$root"/${quoteShell(paths.folder)}`,
    '[ -d "$root" ] || { printf "%s\\n" "远端项目目录不存在" >&2; exit 44; }',
    'umask 077',
    'mkdir -p "$space/control"',
    `plan_tmp="$space/control/.${token}.tmp"`,
    `changes_tmp="$space/control/.${token}.changes.tmp"`,
    `manifest_tmp="$space/.${token}.tmp"`,
    'trap \'rm -f "$plan_tmp" "$changes_tmp" "$manifest_tmp"\' 0 1 2 3 15',
    `dd bs=1 count=${plan.byteLength} of="$plan_tmp" 2>/dev/null`,
    `dd bs=1 count=${changes.byteLength} of="$changes_tmp" 2>/dev/null`,
    `dd bs=1 count=${manifest.byteLength} of="$manifest_tmp" 2>/dev/null`,
    'mv "$plan_tmp" "$space/control/plan.json"',
    'mv "$changes_tmp" "$space/control/changes.json"',
    'mv "$manifest_tmp" "$space/workspace.json"',
    'trap - 0 1 2 3 15',
  ].join('\n')
  await ssh(binding, command, Buffer.concat([plan, changes, manifest]))
}

function parsedObject(text: string | undefined): JsonObject | undefined {
  if (text === undefined) return undefined
  const value: unknown = JSON.parse(text)
  return obj(value)
}

/**
 * The change journal `file` holds as `text`, with the fields this version does not know, or nothing.
 * Its changes stay as written; each one this version cannot read is reported on stderr. Throws when
 * the journal cannot be read, or the sequences of the changes it reads do not increase below
 * `next_sequence`.
 */
function parsedChanges(
  file: string, text: string | undefined,
): { value: WorkspaceChanges; unknown: UnknownField[] } | undefined {
  if (text === undefined) return undefined
  const read = readRecord(WorkspaceChangesSchema, JSON.parse(text))
  if ('error' in read) throw new Error(read.error)
  let previous = 0
  for (const [index, raw] of read.value.changes.entries()) {
    const change = readRecord(WorkspaceChangeSchema, raw)
    if ('error' in change) {
      console.error(`[workspace] ${file}: change ${index + 1} cannot be read by this version and is kept as it is (the App may need an update): ${change.error}`)
      continue
    }
    if (change.value.sequence <= previous || change.value.sequence >= read.value.next_sequence) {
      throw new Error(`${file}: change sequences must increase and remain below next_sequence`)
    }
    previous = change.value.sequence
  }
  return read
}

/**
 * Materializes the App-owned control surface. Existing external graph and event files are never
 * opened for writing. An unknown manifest is refused rather than silently replaced.
 */
export function writeProjectWorkspace(project: ProjectRecord, ssh: SshExecutor = systemSsh): Promise<string> {
  return writeProjectWorkspaceState(project, [], ssh)
}

/**
 * Materializes the App-owned plan, linked-idea index, and incremental change journal in the project's
 * space, and settles to the plan's revision. A local workspace is written at once; an SSH one is read
 * and written after the project's SSH calls made before it. `adopt` lets the project take over a
 * space whose change journal another project wrote, keeping that journal's changes; otherwise such
 * a space is refused.
 */
export async function writeProjectWorkspaceState(
  project: ProjectRecord,
  ideas: readonly ResearchIdea[],
  ssh: SshExecutor = systemSsh,
  adopt = false,
): Promise<string> {
  const paths = spacePaths(project.workspaceSpace)
  const planned = planOf(project)
  const manifest = manifestOf(project, paths)
  const remote = sshBindingOf(project)
  if (remote !== undefined) {
    return inTurn(project.id, async () => {
      const files = await readRemoteFiles(remote, paths.read, ssh)
      const prior = files.get(paths.manifest)
      if (prior !== undefined) manifestSchema(paths).parse(JSON.parse(prior))
      const changes = changesOf(
        project,
        parsedObject(files.get(paths.plan)),
        planned.value,
        parsedChanges(`${remote.host}:${paths.changes}`, files.get(paths.changes)),
        ideas,
        adopt,
      )
      await writeRemoteFiles(
        remote, paths, jsonBytes(planned.value), jsonBytes(changes), jsonBytes(manifest), ssh,
      )
      return planned.revision
    })
  }

  if (project.workspaceRoot === undefined) throw new CallError('refused', '项目尚未连接工作区')
  const root = projectWorkspaceRoot(project.workspaceRoot)
  const manifestFile = join(root, paths.manifest)
  if (existsSync(manifestFile)) manifestSchema(paths).parse(JSON.parse(readFileSync(manifestFile, 'utf8')))
  const planFile = join(root, paths.plan)
  const changesFile = join(root, paths.changes)
  const changes = changesOf(
    project,
    existsSync(planFile) ? parsedObject(readFileSync(planFile, 'utf8')) : undefined,
    planned.value,
    existsSync(changesFile) ? parsedChanges(changesFile, readFileSync(changesFile, 'utf8')) : undefined,
    ideas,
    adopt,
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
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const LAB_BRANCH_EDGE_KINDS = new Set(['continues', 'branches_from'])

/**
 * Adapts the generated Lab graph into the small, layout-bearing graph the desktop already draws,
 * record by record: a node without a usable id or repeating an earlier id, and a relation whose end
 * is not a readable node, are left out and reported in `issues` with their position. A node whose
 * parent is left out stays, as a root. Throws when `text` is not a Lab graph.
 */
function readGraphJson(text: string | undefined, issues: string[]): {
  graph: ResearchGraph
  generatedAt?: string
  health: NonNullable<ProjectWorkspace['graphHealth']>
} | undefined {
  if (text === undefined) return undefined
  const raw = obj(JSON.parse(text))
  if (raw === undefined || raw['schema'] !== 'meridian.lab.graph.v1') {
    throw new Error('科研图不是 meridian.lab.graph.v1')
  }
  const positions = new Map<string, number>()
  const sourceNodes = (Array.isArray(raw['nodes']) ? raw['nodes'] : []).flatMap((value, index) => {
    const node = obj(value)
    const id = str(node?.['id'])
    if (node === undefined || id === undefined) {
      issues.push(`科研图第 ${index + 1} 个节点读不了：没有可用的 id`)
      return []
    }
    const first = positions.get(id)
    if (first !== undefined) {
      issues.push(`科研图第 ${index + 1} 个节点读不了：id「${id}」与第 ${first} 个节点重复`)
      return []
    }
    positions.set(id, index + 1)
    return [{ node, id }]
  })
  const ids = new Set(positions.keys())
  const sourceEdges = (Array.isArray(raw['edges']) ? raw['edges'] : []).flatMap((edge, index) => {
    const row = obj(edge)
    const source = str(row?.['source'])
    const target = str(row?.['target'])
    if (source === undefined || target === undefined) {
      issues.push(`科研图第 ${index + 1} 条关系读不了：没有起点或终点`)
      return []
    }
    const missing = [source, target].find((end) => !ids.has(end))
    if (missing !== undefined) {
      issues.push(`科研图第 ${index + 1} 条关系读不了：节点「${missing}」不在科研图里`)
      return []
    }
    return [{ source, target, kind: str(row?.['kind']) }]
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
  const artifacts = obj(raw['supporting_artifacts']) ?? {}

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
  const nodes = sourceNodes.map(({ node, id }) => {
    const column = depth.get(id) ?? 0
    const row = lane.get(column) ?? 0
    lane.set(column, row + 1)
    const externalState = str(node['state'])
    const detail = obj(nodeDetails[id])
    const nextAction = str(detail?.['next_action'])
    const tasks = Array.isArray(detail?.['tasks']) ? detail['tasks'].flatMap((task) => str(task) ?? []) : []
    const conclusion = obj(detail?.['conclusion'])
    const conclusionText = str(conclusion?.['text'])
    const conclusionDate = str(conclusion?.['date'])
    const revision = str(conclusion?.['revision'])
    const titles = new Map((Array.isArray(artifacts[id]) ? artifacts[id] : []).flatMap((artifact) => {
      const row = obj(artifact)
      const artifactId = str(row?.['id'])
      return artifactId === undefined ? [] : [[artifactId, str(row?.['title']) ?? artifactId] as const]
    }))
    const mode = externalState !== undefined && LAB_NODE_MODES.has(externalState)
      ? externalState as 'unresolved' | 'repairable' | 'supported' | 'dead'
      : undefined
    const state = externalState === 'supported'
      ? 'done' as const
      : activeSet.has(id)
        ? 'act' as const
        : 'idle' as const
    return {
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
      ...(tasks.length === 0 ? {} : { tasks }),
      ...(conclusionText === undefined ? {} : {
        conclusion: {
          text: conclusionText,
          ...(conclusionDate !== undefined && ISO_DATE.test(conclusionDate) ? { date: conclusionDate } : {}),
          evidence: (Array.isArray(conclusion?.['evidence']) ? conclusion['evidence'] : [])
            .flatMap((evidence) => str(evidence) ?? [])
            .map((evidence) => ({ id: evidence, title: titles.get(evidence) ?? evidence })),
          ...(revision === undefined ? {} : { revision }),
        },
      }),
    }
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
 * Legacy rule for a workspace event written before `kind` existed: source evidence under the space's
 * `experiments/` folder, `experiments` here, is a result, anything else is a general note.
 */
function legacyEventKind(source: string, experiments: string): 'result' | 'note' {
  return source.startsWith(experiments) ? 'result' : 'note'
}

/**
 * Reads the events file `text` event by event: each event this version cannot read is reported in
 * `issues` with its position and skipped. Throws when `text` is not an events file.
 */
function readEventsJson(text: string | undefined, experiments: string, issues: string[]): ProjectWorkspace['events'] {
  if (text === undefined) return []
  const parsed = WorkspaceEventFileSchema.parse(JSON.parse(text))
  return parsed.events.flatMap((raw, index) => {
    const read = WorkspaceEventSchema.safeParse(raw)
    if (!read.success) {
      issues.push(`科研记录第 ${index + 1} 条读不了：${UNKNOWN_FORMAT}`)
      return []
    }
    const event = read.data
    return [{
      date: event.date,
      text: event.text,
      origin: 'agent' as const,
      ...(event.node === undefined ? {} : { node: event.node }),
      kind: event.kind ?? legacyEventKind(event.source, experiments),
      ...(event.detail === undefined ? {} : { detail: event.detail }),
      ...(event.at === undefined ? {} : { at: event.at }),
    }]
  })
}

function projectWorkspaceFromFiles(
  base: Pick<ProjectWorkspace, 'kind' | 'root' | 'host' | 'port' | 'planPath'>,
  paths: SpacePaths,
  files: Map<string, string>,
): ProjectWorkspace {
  const manifestText = files.get(paths.manifest)
  if (manifestText === undefined) throw new Error('工作区尚未初始化')
  const manifest = manifestSchema(paths).parse(JSON.parse(manifestText))
  const planText = files.get(manifest.surfaces.plan.path)
  if (planText === undefined) throw new Error('工作区缺少项目计划')
  const plan = obj(JSON.parse(planText))
  const revision = str(plan?.['revision'])
  const issues: string[] = []
  const external = readSurface('科研图', () => readGraphJson(files.get(manifest.surfaces.graph.path), issues), issues)
  const events = readSurface('科研记录', () => readEventsJson(files.get(manifest.surfaces.events.path), paths.experiments, issues), issues)
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
      ? UNKNOWN_FORMAT
      : error instanceof Error ? error.message : String(error)
    issues.push(`${label}读不了：${why}`)
    return undefined
  }
}

function localFiles(root: string, names: readonly string[]): Map<string, string> {
  return new Map(names.flatMap((name) => {
    const file = join(root, name)
    return existsSync(file) ? [[name, readFileSync(file, 'utf8')]] : []
  }))
}

const AgentIdeaSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(20_000),
  context: z.string().trim().min(1).optional(),
  node: z.string().min(1).optional(),
})

const AgentIdeasFileSchema = z.object({
  schema_version: z.literal(WORKSPACE_AGENT_IDEAS_SCHEMA),
  ideas: z.array(z.unknown()),
})

const AgentTaskSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(160),
  note: z.string().trim().min(1).max(20_000).optional(),
})

const AgentTasksFileSchema = z.object({
  schema_version: z.literal(WORKSPACE_AGENT_TASKS_SCHEMA),
  tasks: z.array(z.unknown()),
})

/** One next step a coding agent asked to add to a project's plan. */
export type WorkspaceAgentTask = z.infer<typeof AgentTaskSchema>

/**
 * Returns the tasks coding agents asked to add in the space `space` (the root space when undefined) of the local
 * workspace at `root` that this version can read, in file order. It is empty when `root` is undefined (unbound or SSH) and when the file is
 * absent. A task that breaks the schema is reported on stderr with its position and reason and
 * skipped; a file that is not a tasks file is reported and read as empty. The file is never written.
 */
export function readWorkspaceAgentTasks(root: string | undefined, space?: string): WorkspaceAgentTask[] {
  if (root === undefined) return []
  const file = join(root, spacePaths(space).tasks)
  if (!existsSync(file)) return []
  try {
    const { tasks } = AgentTasksFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    return readStoredList(file, tasks, AgentTaskSchema, 'id').rows
  } catch (error) {
    console.error(`[workspace] ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

/** One idea a coding agent recorded in a project workspace. */
export type WorkspaceAgentIdea = z.infer<typeof AgentIdeaSchema>

/**
 * Returns the ideas coding agents recorded in the space `space` (the root space when undefined) of the local
 * workspace at `root` that this version can read, in file order. It is empty when `root` is undefined (unbound or SSH) and when the file is
 * absent. An idea that breaks the schema is reported on stderr with its position and reason and
 * skipped; a file that is not an ideas file is reported and read as empty. The file is never written.
 */
export function readWorkspaceAgentIdeas(root: string | undefined, space?: string): WorkspaceAgentIdea[] {
  if (root === undefined) return []
  const file = join(root, spacePaths(space).ideas)
  if (!existsSync(file)) return []
  try {
    const { ideas } = AgentIdeasFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    return readStoredList(file, ideas, AgentIdeaSchema, 'id').rows
  } catch (error) {
    console.error(`[workspace] ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

const AgentIdeaFileSchema = z.object({
  id: z.string().min(1),
  idea_id: z.string().min(1),
  path: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const AgentIdeaFilesFileSchema = z.object({
  schema_version: z.literal(WORKSPACE_AGENT_IDEA_FILES_SCHEMA),
  files: z.array(z.unknown()),
})

/** One file a coding agent attached to an idea in a project workspace; `path` is relative to the workspace root. */
export type WorkspaceAgentIdeaFile = z.infer<typeof AgentIdeaFileSchema>

/**
 * Returns the idea files coding agents attached in the space `space` (the root space when undefined)
 * of the local workspace at `root` that this version can read, in file order, as readWorkspaceAgentIdeas reads ideas: empty when `root` is undefined or
 * the file is absent, a file that breaks the schema reported on stderr and skipped. The file is never
 * written.
 */
export function readWorkspaceAgentIdeaFiles(root: string | undefined, space?: string): WorkspaceAgentIdeaFile[] {
  if (root === undefined) return []
  const file = join(root, spacePaths(space).ideaFiles)
  if (!existsSync(file)) return []
  try {
    const { files } = AgentIdeaFilesFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    return readStoredList(file, files, AgentIdeaFileSchema, 'id').rows
  } catch (error) {
    console.error(`[workspace] ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

/**
 * Reads external surfaces afresh; callers can refresh without importing or copying project data. An
 * SSH workspace is read after the project's SSH calls made before it; a remote failure is the
 * workspace's `invalid` state with its reason.
 */
export async function readProjectWorkspace(
  project: ProjectRecord, ssh: SshExecutor = systemSsh,
): Promise<ProjectWorkspace | undefined> {
  const remote = sshBindingOf(project)
  if (remote === undefined) return readLocalProjectWorkspace(project)
  const paths = spacePaths(project.workspaceSpace)
  const planPath = `${remote.host}:${posix.join(remote.path, paths.plan)}`
  const base = {
    kind: 'ssh' as const,
    root: remote.path,
    host: remote.host,
    ...(remote.port === undefined ? {} : { port: remote.port }),
    planPath,
  }
  try {
    return projectWorkspaceFromFiles(base, paths, await inTurn(project.id, () => readRemoteFiles(remote, paths.read, ssh)))
  } catch (error) {
    return {
      ...base,
      state: 'invalid',
      events: [],
      issue: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Reads a local workspace's external surfaces afresh, as readProjectWorkspace does; undefined when the project has no local workspace. */
export function readLocalProjectWorkspace(project: ProjectRecord): ProjectWorkspace | undefined {
  if (project.workspaceRoot === undefined) return undefined
  const root = project.workspaceRoot
  const paths = spacePaths(project.workspaceSpace)
  const base = { kind: 'local' as const, root, planPath: join(root, paths.plan) }
  if (!existsSync(root)) return { ...base, state: 'missing', events: [], issue: '项目目录不存在' }
  try {
    return projectWorkspaceFromFiles(base, paths, localFiles(root, paths.read))
  } catch (error) {
    return {
      ...base,
      state: 'invalid',
      events: [],
      issue: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * A new nested space id for project `projectId`: the project id, `-` and six random hex digits, none
 * of `taken`, so one project can hold several spaces in one workspace. Throws `invalid` when the
 * project id cannot start a folder name.
 */
export function newSpaceId(projectId: string, taken: readonly string[]): string {
  for (;;) {
    const id = WorkspaceSpaceIdSchema.safeParse(`${projectId}-${randomBytes(3).toString('hex')}`)
    if (!id.success) throw new CallError('invalid', `项目 id 不能用作项目空间的文件夹名：${projectId}`)
    if (!taken.includes(id.data)) return id.data
  }
}

/**
 * When a space was last updated and how many tasks its plan holds, as far as `plan`, its plan's
 * text, tells: the plan's last write, else `created`, when the space was made; a plan that cannot
 * be read tells neither.
 */
function planMeta(plan: string | undefined, created: string | undefined): Pick<WorkspaceSpace, 'updated' | 'tasks'> {
  if (plan === undefined) return created === undefined ? {} : { updated: created }
  try {
    const value = obj(JSON.parse(plan))
    const updated = str(value?.['updated_at'])
    const tasks = value?.['tasks']
    return {
      ...(updated === undefined ? {} : { updated }),
      ...(Array.isArray(tasks) ? { tasks: tasks.length } : {}),
    }
  } catch {
    return {}
  }
}

/** The space a manifest found at `space` (the root space when undefined) describes, given its `text`. */
function spaceOf(space: string | undefined, text: string, plan: string | undefined, created: string | undefined): WorkspaceSpace {
  const ref = space === undefined ? { kind: 'root' as const } : { kind: 'nested' as const, id: space }
  try {
    const { project } = manifestSchema(spacePaths(space)).parse(JSON.parse(text))
    return { space: ref, project: { id: project.id, name: project.name }, ...planMeta(plan, created) }
  } catch (error) {
    const why = error instanceof z.ZodError ? UNKNOWN_FORMAT : error instanceof Error ? error.message : String(error)
    return { space: ref, issue: why }
  }
}

const NESTED_MANIFEST = /^\.meridian\/projects\/([^/]+)\/workspace\.json$/

/**
 * The space a manifest at workspace-relative `name` belongs to: undefined for the root space, the
 * folder id for a nested one, or null when `name` is no space's manifest this version can use.
 */
function spaceAt(name: string): string | undefined | null {
  if (name === spacePaths(undefined).manifest) return undefined
  const id = NESTED_MANIFEST.exec(name)?.[1]
  return id !== undefined && WorkspaceSpaceIdSchema.safeParse(id).success ? id : null
}

/** Lists the project spaces of the local workspace at `root`; see readWorkspaceSpaces. */
function localWorkspaceSpaces(root: string): WorkspaceSpace[] {
  const canonical = projectWorkspaceRoot(root)
  const names = [spacePaths(undefined).manifest]
  const nested = join(canonical, NESTED_SPACES)
  if (existsSync(nested) && statSync(nested).isDirectory()) {
    names.push(...readdirSync(nested, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${NESTED_SPACES}/${entry.name}/workspace.json`)
      .sort())
  }
  return names.flatMap((name) => {
    const file = join(canonical, name)
    if (!existsSync(file)) return []
    const space = spaceAt(name)
    if (space === null) {
      console.error(`[workspace] ${file}: the folder name cannot name a project space and is left out`)
      return []
    }
    const plan = join(canonical, spacePaths(space).plan)
    return [spaceOf(space, readFileSync(file, 'utf8'), existsSync(plan) ? readFileSync(plan, 'utf8') : undefined,
      statSync(file).birthtime.toISOString())]
  })
}

/**
 * Prints, for each space manifest of the remote workspace `root` and then its plan when it has one,
 * the file's relative path and size, then its bytes.
 */
function listRemoteSpacesCommand(root: string): string {
  return [
    'set -eu',
    `cd -- ${quoteShell(root)} 2>/dev/null || { printf "%s\\n" "远端项目目录不存在" >&2; exit 44; }`,
    'emit() {',
    "  bytes=$(wc -c < \"$1\" | tr -d '[:space:]')",
    '  printf "%s %s\\n" "$1" "$bytes"',
    '  cat "$1"',
    '  printf "\\n"',
    '}',
    `if [ -f ${quoteShell(spacePaths(undefined).manifest)} ]; then emit ${quoteShell(spacePaths(undefined).manifest)}; fi`,
    `if [ -f ${quoteShell(spacePaths(undefined).plan)} ]; then emit ${quoteShell(spacePaths(undefined).plan)}; fi`,
    // Not a glob: a zsh login shell fails a glob that matches nothing.
    `if [ -d ${quoteShell(NESTED_SPACES)} ]; then`,
    `  find ${quoteShell(NESTED_SPACES)} -mindepth 2 -maxdepth 2 -type f -name workspace.json | LC_ALL=C sort | while IFS= read -r file; do`,
    '    emit "$file"',
    '    plan="${file%/workspace.json}/control/plan.json"',
    '    if [ -f "$plan" ]; then emit "$plan"; fi',
    '  done',
    'fi',
  ].join('\n')
}

/** The manifests `payload`, as listRemoteSpacesCommand prints them, holds, by relative path. Throws on a malformed payload. */
function parseRemoteSpaces(payload: Buffer): [string, string][] {
  const found: [string, string][] = []
  let offset = 0
  while (offset < payload.length) {
    const lineEnd = payload.indexOf(10, offset)
    if (lineEnd < 0) throw new Error('SSH 工作区响应不完整')
    const header = payload.subarray(offset, lineEnd).toString('utf8')
    const split = header.lastIndexOf(' ')
    const size = split < 0 ? Number.NaN : Number(header.slice(split + 1))
    if (!Number.isInteger(size) || size < 0) throw new Error('SSH 工作区响应无效')
    const end = lineEnd + 1 + size
    if (end > payload.length || payload[end] !== 10) throw new Error('SSH 工作区响应不完整')
    found.push([header.slice(0, split), payload.subarray(lineEnd + 1, end).toString('utf8')])
    offset = end + 1
  }
  return found
}

/**
 * Reads the project spaces the workspace `binding` names already holds, without writing to it: the
 * root space when `.meridian/workspace.json` exists, then each `.meridian/projects/<id>/` with a
 * manifest, by folder name. Each names the project its manifest names, or, when that manifest cannot
 * be read, the reason; one unreadable space never hides the others. A folder whose name cannot name
 * a space is reported on stderr and left out. Each readable space also tells when it was last
 * updated, its plan's last write or, locally, when its manifest was made, and its plan's task
 * count, when it can. Rejects when the folder is missing or, over SSH, cannot be read.
 */
export async function readWorkspaceSpaces(
  binding: ProjectWorkspaceBinding, ssh: SshExecutor = systemSsh,
): Promise<WorkspaceSpace[]> {
  if (binding.kind === 'local') return localWorkspaceSpaces(binding.root)
  const remote = projectWorkspaceSsh(binding)
  const files = parseRemoteSpaces(await ssh(remote, listRemoteSpacesCommand(remote.path)))
  const plans = new Map(files.filter(([name]) => name.endsWith('/control/plan.json')))
  return files.filter(([name]) => !name.endsWith('/control/plan.json')).flatMap(([name, text]) => {
    const space = spaceAt(name)
    if (space === null) {
      console.error(`[workspace] ${remote.host}:${name}: the folder name cannot name a project space and is left out`)
      return []
    }
    return [spaceOf(space, text, plans.get(spacePaths(space).plan), undefined)]
  })
}
