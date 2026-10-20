// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  act(() => { createRoot(host).render(<Probe onReady={(w) => { write = w }} />) })
  return write!
}

describe('useVaultWrite', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
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

  it('写被拒时,core 的原话报成拒绝提示并返回 false', async () => {
    const write = mount()
    await expect(write(Promise.reject(new Error('列名重复:备注')))).resolves.toBe(false)
    expect(notice.refusal).toHaveBeenCalledWith('列名重复:备注')
    expect(notice.success).not.toHaveBeenCalled()
  })

  it('写成功但刷新抛出时,抛出的话报成拒绝提示并返回 false', async () => {
    bump.mockImplementation(() => { throw new Error('刷新炸了') })
    const write = mount()
    await expect(write(Promise.resolve(), { note: '已保存' })).resolves.toBe(false)
    expect(notice.refusal).toHaveBeenCalledWith('刷新炸了')
  })
})
