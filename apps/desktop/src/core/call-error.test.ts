import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectCreateParamsSchema, type CallFailure } from '../shared/contract.js'
import { callFailure } from './call-error.js'
import { createFixtureStore } from './fixture-store.js'
import { HttpStatusError } from './net/http.js'
import { emptyColumns } from './paper-library/index.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'
import { validateLibrary } from './workspace-layout.js'

const VAULT = resolve(import.meta.dirname, 'fixtures/vault')

/** The failure Core gives a call that runs `act`; the test fails when `act` does not throw. */
function thrownFailure(act: () => unknown): CallFailure {
  try {
    act()
  } catch (error) {
    return callFailure(error)
  }
  throw new Error('the call did not throw')
}

let vault: string

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'meridian-call-error-'))
  cpSync(VAULT, vault, { recursive: true })
})

afterEach(() => {
  chmodSync(join(vault, 'wiki', 'papers'), 0o755)
  rmSync(vault, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe.each([
  ['测试数据', () => createFixtureStore()],
  ['真实论文库', () => createVaultStore(vault, () => '2026-09-10')],
] as const)('%s里调用失败的原因', (_name, open) => {
  let store: VaultStore
  let project: string
  let paper: string

  beforeEach(() => {
    store = open()
    store.createProject('原因')
    project = store.listProjects().find((p) => p.name === '原因')!.id
    paper = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
  })

  it('要的实体不在库里:not-found', () => {
    expect(thrownFailure(() => store.getPaper('no-such-paper'))).toBe('not-found')
    expect(thrownFailure(() => store.getProject('no-such-project'))).toBe('not-found')
    expect(thrownFailure(() => store.undoChange('no-such-change'))).toBe('not-found')
    expect(thrownFailure(() => store.restoreTrash('no-such-entry'))).toBe('not-found')
    expect(thrownFailure(() => store.removeLater('no-such-entry'))).toBe('not-found')
  })

  it('已经关联过的论文再关联一次:refused', async () => {
    await store.addPaper(project, paper)
    expect(thrownFailure(() => store.addPaper(project, paper))).toBe('refused')
  })

  it('撤销一条之后又被改过的变动:newer-changes', () => {
    store.updatePaper(paper, { readState: '在读' })
    store.updatePaper(paper, { readState: '已读' })
    const older = store.listChanges()[1]!
    expect(thrownFailure(() => store.undoChange(older.id))).toBe('newer-changes')
  })

  it('按界面上已经过时的任务顺序重排:changed', () => {
    expect(thrownFailure(() => store.reorderTasks(project, ['no-such-task']))).toBe('changed')
  })

  it('删掉还有论文在用的选项:in-use', () => {
    const custom = { key: 'du-fa', label: '读法', type: 'select' as const }
    store.setPaperColumns({ ...emptyColumns(), custom: [{ ...custom, options: ['精读', '略读'] }] })
    store.updatePaper(paper, { custom: { 'du-fa': '精读' } })
    expect(thrownFailure(() => store.setPaperColumns({ ...emptyColumns(), custom: [{ ...custom, options: ['略读'] }] })))
      .toBe('in-use')
  })

  it('一条科研记录里带换行:invalid', () => {
    expect(thrownFailure(() => store.createEvent(project, '第一行\n第二行'))).toBe('invalid')
  })

  it('上传的文件不是 PDF:not-pdf', () => {
    expect(thrownFailure(() => store.importPaper('notes.pdf', new TextEncoder().encode('plain text'))))
      .toBe('not-pdf')
  })
})

describe('Core 按错误本身分出的原因', () => {
  it('文件系统拒绝写论文页:write', () => {
    const store = createVaultStore(vault, () => '2026-09-10')
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    chmodSync(join(vault, 'wiki', 'papers'), 0o555)
    expect(thrownFailure(() => store.updatePaper(paper, { readState: '在读' }))).toBe('write')
  })

  it('空目录不是 Meridian 论文库:not-library', () => {
    const bare = mkdtempSync(join(tmpdir(), 'meridian-call-error-bare-'))
    try {
      expect(thrownFailure(() => createVaultStore(bare))).toBe('not-library')
      expect(thrownFailure(() => validateLibrary(bare))).toBe('not-library')
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it('新版本写的 Wiki 页这个版本改不了:newer-version', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const topic = join(vault, 'wiki', 'topics', 'speculative-decoding.md')
    writeFileSync(topic, readFileSync(topic, 'utf8').replace(/^kind: "topic"$/m, 'kind: "method"'))
    const store = createVaultStore(vault, () => '2026-09-10')
    expect(thrownFailure(() => store.updateWikiPage('topics/speculative-decoding', '## 问题\n新的')))
      .toBe('newer-version')
  })

  it('参数没通过契约校验:invalid', () => {
    expect(thrownFailure(() => ProjectCreateParamsSchema.parse({}))).toBe('invalid')
  })

  it('服务器回了限流或别的错误状态:沿用网络失败的原因', () => {
    expect(callFailure(new HttpStatusError(429))).toBe('rate-limit')
    expect(callFailure(new HttpStatusError(503))).toBe('server')
  })

  it('认不出的错误是 unknown,程序自己的 TypeError 不算网络不可用', () => {
    expect(callFailure(new Error('没有分类的错误'))).toBe('unknown')
    expect(callFailure(new TypeError('Cannot read properties of undefined'))).toBe('unknown')
    expect(callFailure('不是 Error')).toBe('unknown')
  })
})
