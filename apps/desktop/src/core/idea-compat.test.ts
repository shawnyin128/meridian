import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { readStoredList } from './vault/stored-records.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault the store opens. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** Git-managed repository root, whose `src` holds the Python package agents read workspaces with. */
const REPO = resolve(import.meta.dirname, '../../../..')

/**
 * The research-idea schema of App 0.0.15.4 (v0.0.15004), copied with the date shape it reused; App
 * 0.0.16.1 (v0.0.16001) has the same one.
 */
const IsoDate0154 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ResearchIdeaSchema0154 = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(20_000),
  source: z.object({
    chatId: z.string().optional(),
    chatTitle: z.string(),
    paperId: z.string().optional(),
    paperTitle: z.string().optional(),
    agent: z.literal(true).optional(),
  }).strict(),
  project: z.string().optional(),
  node: z.string().optional(),
  archived: z.boolean().default(false),
  created: IsoDate0154,
  updated: IsoDate0154,
}).strict()

describe('自己写下的想法存下的样子', () => {
  let vault: string
  let store: VaultStore

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-idea-compat-'))
    cpSync(VAULT, vault, { recursive: true })
    store = createVaultStore(vault)
  })

  afterEach(() => { rmSync(vault, { recursive: true, force: true }) })

  it('App 0.0.15.4 的想法 schema 一字不差地读出 ideas.json 里的这一条', () => {
    const created = store.createIdea(undefined, '我自己的想法', '先记下来,之后再验证')
    const stored = (JSON.parse(readFileSync(join(vault, '.meridian', 'ideas.json'), 'utf8')) as { id: string }[])
      .find((record) => record.id === created.id)
    expect(stored).toMatchObject({ source: { chatTitle: '手动添加' } })
    expect(ResearchIdeaSchema0154.parse(stored)).toEqual(stored)
  })

  it('关联到绑了工作区的项目后,写进工作区变动面的这一条 agent 用的 Python 读得出', async () => {
    const project = store.createProject('自己的想法项目')
    const repo = join(vault, 'own-idea-repo')
    mkdirSync(repo)
    await store.bindProjectWorkspace(project, { kind: 'local', root: repo })
    const created = store.createIdea(undefined, '我自己的想法', '先记下来,之后再验证')
    store.updateIdea(created.id, { project })
    const changes = JSON.parse(readFileSync(join(repo, '.meridian/control/changes.json'), 'utf8')) as { ideas: unknown[] }
    expect(changes.ideas).toEqual([expect.objectContaining({ id: created.id, source: { chat_title: '手动添加' } })])

    const script = [
      'import json, sys',
      'from pathlib import Path',
      'from meridian.workspace_protocol import read_workspace_changes, read_workspace_idea',
      'root = Path(sys.argv[1])',
      'print(json.dumps([read_workspace_changes(root)["status"], read_workspace_idea(root, sys.argv[2])["idea"]["source"]]))',
    ].join('\n')
    const output = execFileSync('python', ['-c', script, repo, created.id], {
      env: { ...process.env, PYTHONPATH: join(REPO, 'src') }, encoding: 'utf8',
    })
    expect(JSON.parse(output)).toEqual(['ready', { chat_title: '手动添加' }])
  })

  it('带来源项目、候选节点和关联的想法,0.0.16.1 的想法 schema 逐条读得出,新字段原样写回;放进绑了工作区的项目时,工作区里还是旧的样子', async () => {
    const project = store.createProject('来源项目')
    const repo = join(vault, 'source-project-repo')
    mkdirSync(join(repo, '.meridian/ideas'), { recursive: true })
    await store.bindProjectWorkspace(project, { kind: 'local', root: repo })
    writeFileSync(join(repo, '.meridian/ideas/ideas.json'), JSON.stringify({
      schema_version: 'meridian.workspace-agent-ideas.v1',
      ideas: [{ id: 'agent-idea', date: '2026-10-21', title: 'agent 记下的想法', body: '正文', node: 'thread.B' }],
    }))
    const arrived = store.listIdeas().find((idea) => idea.source.agent === true)!
    store.updateIdea(arrived.id, { relations: { projects: [project], pages: [] } })
    store.updateIdea(arrived.id, { project })
    const changes = JSON.parse(readFileSync(join(repo, '.meridian/control/changes.json'), 'utf8')) as { ideas: object[] }
    expect(changes.ideas.map((idea) => Object.keys(idea).sort()))
      .toEqual([['archived', 'body', 'created', 'id', 'source', 'title', 'updated']])
    const raw = JSON.parse(readFileSync(join(vault, '.meridian', 'ideas.json'), 'utf8')) as Record<string, unknown>[]
    const written = raw.find((record) => record.id === arrived.id)!
    expect(written).toMatchObject({ sourceProject: project, candidateNode: 'thread.B', relations: { projects: [project], pages: [] } })

    const read = readStoredList('ideas.json', raw, ResearchIdeaSchema0154, 'id')
    expect(read.unreadable).toEqual([])
    expect(read.rows.find((row) => row.id === arrived.id)).not.toHaveProperty('relations')
    expect(read.stored(read.rows)).toEqual(raw)
  })
})
