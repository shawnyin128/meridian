import { describe, expect, it } from 'vitest'
import { sshFolders } from '../project-management/index.js'
import { FIXTURE_SSH_HOSTS, fixtureSsh } from './ssh.js'

describe('the fixture library browses canned SSH hosts', () => {
  it('测试库的主机连上后列出主目录，隐藏文件夹不显示；别的主机连不上并给出原因', () => {
    expect(sshFolders({ host: 'gpu-lab' }, undefined, fixtureSsh(undefined))).toEqual({
      state: 'ready', path: '/home/researcher', parent: '/home',
      folders: ['datasets', 'notes', 'projects'].map((name) => ({ name, path: `/home/researcher/${name}` })),
    })
    expect(sshFolders({ host: 'unknown-host' }, undefined, fixtureSsh(undefined))).toEqual({
      state: 'failed',
      issue: 'ssh: Could not resolve hostname unknown-host: nodename nor servname provided, or not known',
    })
  })

  it('测试库里列出的每个文件夹和每个上一级都能再打开', () => {
    const seen = new Set<string>()
    const open = (path: string | undefined): void => {
      const level = sshFolders({ host: FIXTURE_SSH_HOSTS[0]! }, path, fixtureSsh(path))
      expect(level.state, path).toBe('ready')
      if (level.state !== 'ready' || seen.has(level.path)) return
      seen.add(level.path)
      for (const next of [level.parent, ...level.folders.map((folder) => folder.path)]) if (next !== null) open(next)
    }
    open(undefined)
    expect(seen.size).toBeGreaterThan(10)
  })
})
