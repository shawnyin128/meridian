// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appMenu, chat, extensions, idea, library, papers, project } from './ipc.js'
import type { ContractMethod } from '../shared/contract.js'

describe('renderer ipc client', () => {
  beforeEach(() => {
    vi.stubGlobal('meridian', {
      call: vi.fn((method: ContractMethod, params: unknown) =>
        Promise.resolve({ method, params, rows: [], total: 0 })),
    })
  })

  it('list 把参数原样送到契约方法上', async () => {
    await papers.list({ page: 2, size: 20 })
    expect(window.meridian.call).toHaveBeenCalledWith('papers.list', { page: 2, size: 20 })
  })

  it('renameOption 把三项送到契约方法上', async () => {
    await papers.renameOption('du-fa', '精读', '细读')
    expect(window.meridian.call)
      .toHaveBeenCalledWith('papers.renameOption', { key: 'du-fa', from: '精读', to: '细读' })
  })

  it('论文会话只把论文身份送给 Core', async () => {
    await chat.forPaper('paper-a')
    expect(window.meridian.call).toHaveBeenCalledWith('chat.forPaper', { paperId: 'paper-a' })
  })

  it('想法关联、归档、转项目和删除都走明确契约', async () => {
    await idea.update('idea-1', { project: 'project-1', archived: true })
    await idea.promote('idea-2')
    await idea.delete('idea-3')
    expect(window.meridian.call).toHaveBeenNthCalledWith(
      1, 'idea.update', { id: 'idea-1', patch: { project: 'project-1', archived: true } },
    )
    expect(window.meridian.call).toHaveBeenNthCalledWith(2, 'idea.promote', { id: 'idea-2' })
    expect(window.meridian.call).toHaveBeenNthCalledWith(3, 'idea.delete', { id: 'idea-3' })
  })

  it('项目目录选择走窄 Main 接口，连接走类型化 Core 契约', async () => {
    const chooseWorkspaceRoot = vi.fn(() => Promise.resolve('/repo'))
    vi.stubGlobal('meridian', {
      call: vi.fn((method: ContractMethod, params: unknown) => Promise.resolve({ method, params })),
      chooseWorkspaceRoot,
    })
    await expect(appMenu.chooseWorkspaceRoot()).resolves.toBe('/repo')
    await project.bindWorkspace('p1', { kind: 'local', root: '/repo' })
    expect(chooseWorkspaceRoot).toHaveBeenCalledOnce()
    expect(window.meridian.call).toHaveBeenCalledWith(
      'project.bindWorkspace', { id: 'p1', binding: { kind: 'local', root: '/repo' } },
    )
  })

  it('core 报错时把错误透出来而不是吞掉', async () => {
    vi.stubGlobal('meridian', { call: () => Promise.reject(new Error('论文不存在:x')) })
    await expect(papers.get('x')).rejects.toThrow('论文不存在:x')
  })

  it('库位置读写走类型化 Core 契约，目录选择与重启走窄 Main 接口', async () => {
    const chooseLibraryRoot = vi.fn(() => Promise.resolve('/papers'))
    const restartApp = vi.fn()
    vi.stubGlobal('meridian', {
      call: vi.fn((method: ContractMethod, params: unknown) => Promise.resolve({ method, params })),
      chooseLibraryRoot,
      restartApp,
    })

    await library.location()
    await library.configure('/papers')
    await library.reset()
    expect(window.meridian.call).toHaveBeenNthCalledWith(1, 'library.location', {})
    expect(window.meridian.call).toHaveBeenNthCalledWith(2, 'library.configure', { root: '/papers' })
    expect(window.meridian.call).toHaveBeenNthCalledWith(3, 'library.reset', {})
    await expect(appMenu.chooseLibraryRoot()).resolves.toBe('/papers')
    appMenu.restartApp()
    expect(chooseLibraryRoot).toHaveBeenCalledOnce()
    expect(restartApp).toHaveBeenCalledOnce()
  })

  it('扩展安装状态由 Core 检查', async () => {
    await extensions.status()
    expect(window.meridian.call).toHaveBeenCalledWith('extensions.status', {})
  })

  it('标题栏最大化通过窄 Main 接口切换', () => {
    const toggleMaximize = vi.fn()
    vi.stubGlobal('meridian', { call: vi.fn(), toggleMaximize })
    appMenu.toggleMaximize()
    expect(toggleMaximize).toHaveBeenCalledOnce()
  })

  it('Help 教程通过窄 Main 订阅打开', () => {
    const unsubscribe = vi.fn()
    const onOpenAgentTutorial = vi.fn(() => unsubscribe)
    vi.stubGlobal('meridian', { call: vi.fn(), onOpenAgentTutorial })
    const handler = vi.fn()
    expect(appMenu.onOpenAgentTutorial(handler)).toBe(unsubscribe)
    expect(onOpenAgentTutorial).toHaveBeenCalledWith(handler)
  })
})
