import { chmodSync, cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectCreateParamsSchema, type CallFailure } from '../shared/contract.js'
import { callFailure } from './call-error.js'
import { createFixtureStore } from './fixture-store.js'
import { HttpStatusError } from './net/http.js'
import type { VaultStore } from './vault.js'
import { createVaultStore } from './vault-store.js'

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
})

describe.each([
  ['测试数据', () => createFixtureStore()],
  ['真实论文库', () => createVaultStore(vault, () => '2026-09-10')],
] as const)('%s里调用失败的原因', (_name, open) => {
  let store: VaultStore

  beforeEach(() => {
    store = open()
  })

  it('要的实体不在库里:not-found', () => {
    expect(thrownFailure(() => store.getPaper('no-such-paper'))).toBe('not-found')
    expect(thrownFailure(() => store.getProject('no-such-project'))).toBe('not-found')
    expect(thrownFailure(() => store.undoChange('no-such-change'))).toBe('not-found')
    expect(thrownFailure(() => store.restoreTrash('no-such-entry'))).toBe('not-found')
    expect(thrownFailure(() => store.removeLater('no-such-entry'))).toBe('not-found')
  })
})

describe('Core 按错误本身分出的原因', () => {
  it('文件系统拒绝写论文页:write', () => {
    const store = createVaultStore(vault, () => '2026-09-10')
    const paper = store.listPapers({ page: 1, size: 1 }).rows[0]!.id
    chmodSync(join(vault, 'wiki', 'papers'), 0o555)
    expect(thrownFailure(() => store.updatePaper(paper, { readState: '在读' }))).toBe('write')
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
