import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFrontmatter } from './vault/frontmatter.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault for the real implementation: two paper pages, no projects and no app state. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

const json = (file: string, value: unknown) => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T

/** What a coding agent writes into one project space: a graph node, an event, an idea, an idea file, a task. */
function agentWrites(repo: string, folder: string, tag: string): void {
  json(join(repo, folder, 'graph/graph.json'), {
    schema: 'meridian.lab.graph.v1', edges: [], nodes: [{ id: `${tag}.A`, title: `${tag} node`, state: 'unresolved' }],
  })
  json(join(repo, folder, 'events/events.json'), {
    schema_version: 'meridian.workspace-events.v1',
    events: [{ id: `${tag}-e`, date: '2026-10-20', text: `${tag} event`, source: `${folder}/threads/t.md`, kind: 'note' }],
  })
  json(join(repo, folder, 'ideas/ideas.json'), {
    schema_version: 'meridian.workspace-agent-ideas.v1',
    ideas: [{ id: `${tag}-idea`, date: '2026-10-20', title: `${tag} idea`, body: 'body' }],
  })
  writeFileSync(join(repo, `${tag}.md`), `# ${tag}\n`)
  json(join(repo, folder, 'ideas/files.json'), {
    schema_version: 'meridian.workspace-agent-idea-files.v1',
    files: [{ id: `${tag}-file`, idea_id: `${tag}-idea`, path: `${tag}.md`, date: '2026-10-20' }],
  })
  json(join(repo, folder, 'tasks/tasks.json'), {
    schema_version: 'meridian.workspace-agent-tasks.v1', tasks: [{ id: `${tag}-task`, date: '2026-10-20', title: `${tag} task` }],
  })
}

describe('several projects in one workspace', () => {
  let vault: string
  let repo: string
  let store: VaultStore
  const allow = () => undefined

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-vault-'))
    cpSync(VAULT, vault, { recursive: true })
    repo = join(vault, 'shared-repo')
    mkdirSync(repo)
    repo = realpathSync(repo)
    vi.stubEnv('MERIDIAN_LIBRARY_ROOT', vault)
    store = createVaultStore(vault)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(vault, { recursive: true, force: true })
  })

  /** Creates project `name` with one task titled after it, and returns its id. */
  const project = async (name: string): Promise<string> => {
    const id = store.createProject(name)
    await store.createTask(id, { title: `${name} task`, start: '2026-10-20', end: '2026-10-21', state: 'plan', priority: 'p1' })
    return id
  }

  /** Binds `first` and then `second` to the shared repository, each as a new project space. */
  const bindBoth = async () => {
    const first = await project('First')
    const second = await project('Second')
    await store.bindProjectWorkspace(first, { kind: 'local', root: repo }, { kind: 'new' }, allow)
    await store.bindProjectWorkspace(second, { kind: 'local', root: repo }, { kind: 'new' }, allow)
    return { first, second, nested: `.meridian/projects/${second}` }
  }

  it('a second project gets its own space under .meridian/projects/<id>/, and the first keeps .meridian/ as it was', async () => {
    const first = await project('First')
    await store.bindProjectWorkspace(first, { kind: 'local', root: repo }, { kind: 'new' }, allow)
    const rootPlan = readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')
    const rootManifest = readFileSync(join(repo, '.meridian/workspace.json'), 'utf8')
    const second = await project('Second')
    await store.bindProjectWorkspace(second, { kind: 'local', root: repo }, { kind: 'new' }, allow)

    expect(readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')).toBe(rootPlan)
    expect(readFileSync(join(repo, '.meridian/workspace.json'), 'utf8')).toBe(rootManifest)
    const manifest = readJson<{ project: { id: string }; surfaces: { plan: { path: string } } }>(
      join(repo, `.meridian/projects/${second}/workspace.json`))
    expect(manifest.project.id).toBe(second)
    expect(manifest.surfaces.plan.path).toBe(`.meridian/projects/${second}/control/plan.json`)
    expect((await store.getProject(second)).workspace).toMatchObject({
      state: 'ready', root: repo, planPath: join(repo, `.meridian/projects/${second}/control/plan.json`),
    })
  })

  it('neither project sees the other one\'s plan, change journal, graph, events, ideas, idea files or tasks', async () => {
    const { first, second, nested } = await bindBoth()
    agentWrites(repo, '.meridian', 'root')
    agentWrites(repo, nested, 'nested')

    const plan = (folder: string) => readJson<{ project: { id: string }; tasks: { title: string }[] }>(join(repo, folder, 'control/plan.json'))
    expect(plan('.meridian')).toMatchObject({ project: { id: first }, tasks: [{ title: 'First task' }] })
    expect(plan(nested)).toMatchObject({ project: { id: second }, tasks: [{ title: 'Second task' }] })
    const journal = (folder: string) => readJson<{ project_id: string; epoch: string }>(join(repo, folder, 'control/changes.json'))
    expect(journal('.meridian').project_id).toBe(first)
    expect(journal(nested).project_id).toBe(second)
    expect(journal(nested).epoch).not.toBe(journal('.meridian').epoch)

    const firstDetail = await store.getProject(first)
    const secondDetail = await store.getProject(second)
    expect(firstDetail.workspace?.graph?.nodes.map((node) => node.id)).toEqual(['root.A'])
    expect(secondDetail.workspace?.graph?.nodes.map((node) => node.id)).toEqual(['nested.A'])
    expect(firstDetail.workspace?.events.map((event) => event.text)).toEqual(['root event'])
    expect(secondDetail.workspace?.events.map((event) => event.text)).toEqual(['nested event'])

    expect(store.agentTaskRequests(first).map(({ request }) => request.title)).toEqual(['root task'])
    expect(store.agentTaskRequests(second).map(({ request }) => request.title)).toEqual(['nested task'])
    const ideas = store.listIdeas().filter((idea) => idea.source.agent === true)
    expect(ideas.map((idea) => [idea.title, idea.sourceProject]).sort())
      .toEqual([['nested idea', second], ['root idea', first]])
    const files = store.listIdeaFiles()
    expect(files.map((file) => [file.attachment.name, ideas.find((idea) => idea.id === file.idea)?.title]).sort())
      .toEqual([['nested.md', 'nested idea'], ['root.md', 'root idea']])
  })

  it('the nested binding lives under shared_workspace on the page, where an older App reads no binding', async () => {
    const { first, second } = await bindBoth()
    const page = (id: string) => {
      const rows = readFileSync(join(vault, 'wiki/projects', `${id}.md`), 'utf8').split('\n')
      return readFrontmatter(rows.slice(1, rows.indexOf('---', 1))) as Record<string, unknown>
    }
    expect(page(first)).toMatchObject({ workspace_root: repo })
    expect(page(first)['shared_workspace']).toBeUndefined()
    expect(page(second)).toMatchObject({ shared_workspace: { root: repo, space: second } })
    expect(page(second)['workspace_root']).toBeUndefined()
    expect((await createVaultStore(vault).getProject(second)).workspace?.planPath)
      .toBe(join(repo, `.meridian/projects/${second}/control/plan.json`))
  })

  it('an old plugin on this machine refuses a new space beside an existing one, and nothing is written', async () => {
    const first = await project('First')
    await store.bindProjectWorkspace(first, { kind: 'local', root: repo }, { kind: 'new' }, () => 'too old')
    const second = await project('Second')
    await expect(store.bindProjectWorkspace(second, { kind: 'local', root: repo }, { kind: 'new' }, () => 'too old'))
      .rejects.toMatchObject({ reason: 'plugin-outdated', message: 'too old' })
    expect(existsSync(join(repo, '.meridian/projects'))).toBe(false)
    expect((await store.getProject(second)).workspace).toBeUndefined()
  })

  it('choosing an existing space binds to it: the project takes it over and the journal keeps its changes', async () => {
    const { second, nested } = await bindBoth()
    await store.bindProjectWorkspace(second, null)
    const before = readJson<{ changes: unknown[]; epoch: string }>(join(repo, nested, 'control/changes.json'))
    const third = await project('Third')
    const spaces = await store.bindProjectWorkspace(third, { kind: 'local', root: repo }, { kind: 'nested', id: second }, allow)
    expect(spaces.workspace?.planPath).toBe(join(repo, nested, 'control/plan.json'))
    const after = readJson<{ project_id: string; changes: unknown[]; epoch: string }>(join(repo, nested, 'control/changes.json'))
    expect(after.project_id).toBe(third)
    expect(after.epoch).toBe(before.epoch)
    expect(after.changes.slice(0, before.changes.length)).toEqual(before.changes)
    expect(readJson<{ project: { id: string } }>(join(repo, nested, 'workspace.json')).project.id).toBe(third)
  })

  it('a space another project of this vault is bound to cannot be chosen', async () => {
    const { first } = await bindBoth()
    const third = await project('Third')
    await expect(store.bindProjectWorkspace(third, { kind: 'local', root: repo }, { kind: 'root' }, allow))
      .rejects.toThrow('这个项目空间属于项目「First」')
    expect(readJson<{ project: { id: string } }>(join(repo, '.meridian/workspace.json')).project.id).toBe(first)
  })

  it('a project disconnected and bound again to its own space finds its records there', async () => {
    const { second, nested } = await bindBoth()
    agentWrites(repo, nested, 'nested')
    await store.bindProjectWorkspace(second, null)
    await store.bindProjectWorkspace(second, { kind: 'local', root: repo }, { kind: 'nested', id: second }, allow)
    expect((await store.getProject(second)).workspace?.graph?.nodes.map((node) => node.id)).toEqual(['nested.A'])
  })
})
