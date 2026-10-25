import { describe, expect, it } from 'vitest'
import { sshFolders } from '../project-management/index.js'
import { FIXTURE_SSH_HOSTS, fixtureSsh } from './ssh.js'

describe('the fixture library browses canned SSH hosts', () => {
  it('测试库的主机连上后列出主目录，隐藏文件夹不显示但输入 ~/ 能进去；别的主机连不上并给出原因', async () => {
    expect(await sshFolders({ host: 'gpu-lab' }, undefined, fixtureSsh)).toEqual({
      state: 'ready', path: '/home/researcher', parent: '/home',
      folders: ['checkpoints', 'datasets', 'logs', 'notes', 'projects', 'scratch', 'scripts'].map((name) => ({ name, path: `/home/researcher/${name}` })),
    })
    expect(await sshFolders({ host: 'gpu-lab' }, '~/.cache/', fixtureSsh)).toMatchObject({
      state: 'ready', path: '/home/researcher/.cache', folders: [{ name: 'pip' }, { name: 'torch' }],
    })
    expect(await sshFolders({ host: 'gpu-lab' }, '/home/researcher/missing', fixtureSsh)).toEqual({
      state: 'failed', issue: 'cd: /home/researcher/missing: No such file or directory',
    })
    expect(await sshFolders({ host: 'unknown-host' }, undefined, fixtureSsh)).toEqual({
      state: 'failed',
      issue: 'ssh: Could not resolve hostname unknown-host: nodename nor servname provided, or not known',
    })
  })

  it('测试库里列出的每个文件夹和每个上一级都能再打开', async () => {
    const seen = new Set<string>()
    const open = async (path: string | undefined): Promise<void> => {
      const level = await sshFolders({ host: FIXTURE_SSH_HOSTS[0]! }, path, fixtureSsh)
      expect(level.state, path).toBe('ready')
      if (level.state !== 'ready' || seen.has(level.path)) return
      seen.add(level.path)
      for (const next of [level.parent, ...level.folders.map((folder) => folder.path)]) if (next !== null) await open(next)
    }
    await open(undefined)
    expect(seen.size).toBeGreaterThan(10)
  })
})
