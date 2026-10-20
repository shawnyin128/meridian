// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CallError } from '../call-error.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { useVaultWrite } from './useVaultWrite.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const { notice, bump } = vi.hoisted(() => ({ notice: { success: vi.fn(), refusal: vi.fn() }, bump: vi.fn() }))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => notice,
  useVaultRevision: () => ({ revision: 0, bump }),
}))

type Write = ReturnType<typeof useVaultWrite>

/** Renders nothing; only hands the write function from this render to the test. */
function Probe({ onReady }: { onReady: (write: Write) => void }) {
  onReady(useVaultWrite())
  return null
}

/** Mount the probe into a real container and return the write function it rendered. */
function mount(): Write {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let write: Write | undefined
  act(() => { createRoot(host).render(<MessagesProvider><Probe onReady={(w) => { write = w }} /></MessagesProvider>) })
  return write!
}

describe('useVaultWrite', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    notice.success.mockClear()
    notice.refusal.mockClear()
    bump.mockReset()
  })

  it('写成功时,说明报成成功提示,收尾返回 true', async () => {
    const write = mount()
    await expect(write(Promise.resolve(), { note: '已保存' })).resolves.toBe(true)
    expect(notice.success).toHaveBeenCalledWith('已保存', undefined)
    expect(notice.refusal).not.toHaveBeenCalled()
  })

  it('写成功时,提示带上按写的结果做出的那一个操作', async () => {
    const write = mount()
    const onAction = vi.fn()
    await write(Promise.resolve({ id: 'idea-1' }), {
      note: '想法已保存', action: (idea) => ({ label: '打开', onAction: () => onAction(idea.id) }),
    })
    const [text, action] = notice.success.mock.calls[0]!
    expect([text, action.label]).toEqual(['想法已保存', '打开'])
    action.onAction()
    expect(onAction).toHaveBeenCalledWith('idea-1')
  })

  it('写被拒时,拒绝原因的标签报成拒绝提示并返回 false', async () => {
    const write = mount()
    await expect(write(Promise.reject(new CallError('papers.setColumns', 'invalid')))).resolves.toBe(false)
    expect(notice.refusal).toHaveBeenCalledWith('内容无效')
    expect(notice.success).not.toHaveBeenCalled()
  })

  it('写库失败时报写不进论文库,不报带路径的原话', async () => {
    const write = mount()
    await expect(write(Promise.reject(new CallError('papers.update', 'write')))).resolves.toBe(false)
    expect(notice.refusal).toHaveBeenCalledWith('没能写入论文库')
  })

  it('认不出的错误只报通用标签,原话与路径记进日志而不上屏', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = "EPERM: operation not permitted, rename '/Users/me/vault/wiki/papers/x.md'"
    bump.mockImplementation(() => { throw new Error(raw) })
    const write = mount()
    await expect(write(Promise.resolve(), { note: '已保存' })).resolves.toBe(false)
    expect(notice.refusal).toHaveBeenCalledWith('出了点问题')
    expect(JSON.stringify(notice.refusal.mock.calls)).not.toContain('/Users/me/vault')
    expect(log).toHaveBeenCalledWith(expect.stringContaining(raw))
    log.mockRestore()
  })
})
