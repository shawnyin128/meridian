import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault the store opens. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** Git-managed repository root, whose `src` holds the Python package agents read workspaces with. */
const REPO = resolve(import.meta.dirname, '../../../..')

/** The research-idea schema of App 0.0.15.4 (v0.0.15004), copied with the date shape it reused. */
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

  it('关联到绑了工作区的项目后,写进工作区变动面的这一条 agent 用的 Python 读得出', () => {
    const project = store.createProject('自己的想法项目')
    const repo = join(vault, 'own-idea-repo')
    mkdirSync(repo)
    store.bindProjectWorkspace(project, { kind: 'local', root: repo })
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
})
