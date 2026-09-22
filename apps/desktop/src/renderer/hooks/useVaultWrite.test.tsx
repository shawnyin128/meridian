// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVaultWrite } from './useVaultWrite.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useToast: () => toast,
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

type Write = ReturnType<typeof useVaultWrite>

/** The probe does not draw anything, but only gives the write rendered this time to external testing. */
function Probe({ onReady }: { onReady: (write: Write) => void }) {
  onReady(useVaultWrite())
  return null
}

/** Hang the probe into a real container and take out the write it renders this time. */
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
    toast.mockClear()
  })

  it('写成功且 notify 没抛时,收尾返回 true,不报 toast', async () => {
    const write = mount()
    await expect(write(Promise.resolve(), { note: '已保存', notify: vi.fn() })).resolves.toBe(true)
    expect(toast).not.toHaveBeenCalled()
  })

  it('写被拒时,core 的原话报成 toast 并返回 false', async () => {
    const write = mount()
    await expect(write(Promise.reject(new Error('列名重复:备注')))).resolves.toBe(false)
    expect(toast).toHaveBeenCalledWith('列名重复:备注')
  })

  it('写成功但 notify 自己抛出时,抛出的话报成 toast 并返回 false', async () => {
    const write = mount()
    await expect(write(Promise.resolve(), { note: '已保存', notify: () => { throw new Error('notify 炸了') } }))
      .resolves.toBe(false)
    expect(toast).toHaveBeenCalledWith('notify 炸了')
  })
})
