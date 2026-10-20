import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

/** Test vault for the real implementation: two paper pages, no projects and no app state. */
const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

describe('a vault write that fails', () => {
  let vault: string
  /** Directories a case made read-only, given relative to the vault. */
  let locked: string[] = []

  const open = (): VaultStore => createVaultStore(vault, () => '2026-09-10')
  /** Makes the vault directory `dir` read-only, so every write that replaces a file in it fails. */
  const lock = (dir: string): void => {
    chmodSync(join(vault, dir), 0o555)
    locked.push(dir)
  }
  const unlock = (): void => {
    for (const dir of locked) chmodSync(join(vault, dir), 0o755)
    locked = []
  }
  const projectNamed = (store: VaultStore, name: string): string =>
    store.listProjects().find((project) => project.name === name)!.id

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'meridian-write-failure-'))
    cpSync(VAULT, vault, { recursive: true })
  })

  afterEach(() => {
    unlock()
    rmSync(vault, { recursive: true, force: true })
  })

  it('项目页没写成时，项目仍是写之前的样子，与重开库读到的一样', () => {
    const store = open()
    store.createProject('写不进去')
    const id = projectNamed(store, '写不进去')
    const before = store.getProject(id).focus
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '没写进磁盘的目标' })).toThrow()
    expect(store.getProject(id).focus).toBe(before)
    expect(store.getProject(id)).toEqual(open().getProject(id))
  })

  it('论文页没写成时，论文仍是写之前的样子', () => {
    const store = open()
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!
    lock('wiki/papers')
    expect(() => store.updatePaper(paper.id, { readState: paper.readState === '在读' ? '已读' : '在读' })).toThrow()
    expect(store.getPaper(paper.id).readState).toBe(paper.readState)
  })

  it('新项目的页没写成时，项目列表里没有它', () => {
    const store = open()
    store.createProject('先有的')
    const before = store.listProjects()
    lock('wiki/projects')
    expect(() => store.createProject('写不进去')).toThrow()
    expect(store.listProjects()).toEqual(before)
    expect(store.listChanges().map((change) => change.title)).toEqual(['项目「先有的」· 新建'])
  })

  it('项目页没写成时，项目没有完成，它的想法没归档，它连着的计划面也没刷新', () => {
    const store = open()
    store.createProject('收尾')
    const id = projectNamed(store, '收尾')
    const repo = join(vault, 'bound-repo')
    mkdirSync(repo)
    store.bindProjectWorkspace(id, { kind: 'local', root: repo })
    const idea = store.createIdea(store.createChat('想法来源', true).id, '一个方向', '验证这个方向')
    store.updateIdea(idea.id, { project: id })
    const ideas = store.listIdeas()
    const plan = readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { status: '已完成' })).toThrow()
    expect(store.getProject(id).status).toBe('进行中')
    expect(store.listIdeas()).toEqual(ideas)
    expect(readFileSync(join(repo, '.meridian/control/plan.json'), 'utf8')).toBe(plan)
  })

  it('项目页没写成时，最近变动不多一条，之前记下的那一条照样撤得回去', () => {
    const store = open()
    store.createProject('撤得回去')
    const id = projectNamed(store, '撤得回去')
    store.updateProject(id, { focus: '落了盘的目标' })
    const changes = store.listChanges()
    const log = readFileSync(join(vault, '.meridian', 'changelog.json'), 'utf8')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '没写进磁盘的目标' })).toThrow()
    expect(store.listChanges()).toEqual(changes)
    expect(readFileSync(join(vault, '.meridian', 'changelog.json'), 'utf8')).toBe(log)
    unlock()
    store.undoChange(changes[0]!.id)
    expect(open().getProject(id).focus).toBe('定义第一步')
  })

  it('没写成的改动重来一次写成了，最近变动就记下它，撤销回到最初的样子', () => {
    const store = open()
    store.createProject('重来一次')
    const id = projectNamed(store, '重来一次')
    lock('wiki/projects')
    expect(() => store.updateProject(id, { focus: '第二次才写成' })).toThrow()
    unlock()
    store.updateProject(id, { focus: '第二次才写成' })
    const [change] = store.listChanges()
    expect(change!.diff).toEqual(['- focus: "定义第一步"', '+ focus: "第二次才写成"'])
    store.undoChange(change!.id)
    expect(open().getProject(id).focus).toBe('定义第一步')
  })
})
