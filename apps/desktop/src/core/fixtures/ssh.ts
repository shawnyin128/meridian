import { posix } from 'node:path'
import type { WorkspaceSpace } from '../../shared/contract.js'
import type { SshCommand } from '../project-management/index.js'

/** The `Host` aliases the fixture library offers, as if read from `~/.ssh/config`. */
export const FIXTURE_SSH_HOSTS = ['gpu-lab', 'cluster']

const HOME = '/home/researcher'

/** The entries that are folders, hidden ones included, of each folder every fixture host has. */
const FOLDERS: Readonly<Record<string, readonly string[]>> = {
  '/': ['home', 'srv', 'tmp'],
  '/home': ['researcher'],
  [HOME]: ['.cache', '.ssh', 'checkpoints', 'datasets', 'logs', 'notes', 'projects', 'scratch', 'scripts'],
  [`${HOME}/.cache`]: ['pip', 'torch'],
  [`${HOME}/.cache/pip`]: [],
  [`${HOME}/.cache/torch`]: [],
  [`${HOME}/.ssh`]: [],
  [`${HOME}/checkpoints`]: [],
  [`${HOME}/datasets`]: ['gsm8k', 'mt-bench'],
  [`${HOME}/datasets/gsm8k`]: [],
  [`${HOME}/datasets/mt-bench`]: [],
  [`${HOME}/logs`]: [],
  [`${HOME}/notes`]: [],
  [`${HOME}/projects`]: ['distill', 'kv-cache', 'spec-decoding'],
  [`${HOME}/projects/distill`]: [],
  [`${HOME}/projects/kv-cache`]: ['runs'],
  [`${HOME}/projects/kv-cache/runs`]: [],
  [`${HOME}/projects/spec-decoding`]: ['.meridian', 'experiments', 'src'],
  [`${HOME}/projects/spec-decoding/.meridian`]: [],
  [`${HOME}/projects/spec-decoding/experiments`]: [],
  [`${HOME}/projects/spec-decoding/src`]: [],
  [`${HOME}/scratch`]: [],
  [`${HOME}/scripts`]: [],
  '/srv': ['shared'],
  '/srv/shared': [],
  '/tmp': [],
}

/**
 * The SSH transport of the fixture library. It runs a folder listing as the remote shell of a
 * fixture host would: its `cd` lines enter the home or a quoted folder, and it prints that folder and
 * its entries that are folders. It fails as OpenSSH and the shell do for any other host and any folder
 * the fixture hosts do not have. It never starts `ssh`.
 */
export const fixtureSsh: SshCommand = async ({ host }, command) => {
  if (!FIXTURE_SSH_HOSTS.includes(host)) {
    throw new Error(`ssh: Could not resolve hostname ${host}: nodename nor servname provided, or not known`)
  }
  let folder = HOME
  for (const line of command.split('\n')) {
    if (line === 'cd') folder = HOME
    const quoted = /^cd -- '(.*)'$/.exec(line)?.[1]
    if (quoted !== undefined) folder = posix.resolve(folder, quoted.replaceAll(`'"'"'`, "'"))
  }
  const names = FOLDERS[folder]
  if (names === undefined) throw new Error(`cd: ${folder}: No such file or directory`)
  return Buffer.from([folder, ...names.map((name) => `./${name}`)].map((part) => `${part}\0`).join(''))
}

/** The project spaces the fixture hosts' folders hold, by folder; every other folder holds none. */
const SPACES: Readonly<Record<string, readonly WorkspaceSpace[]>> = {
  [`${HOME}/projects/spec-decoding`]: [
    { space: { kind: 'root' }, project: { id: 'repro', name: '复现 EAGLE-2' } },
    { space: { kind: 'nested', id: 'tree-width' }, project: { id: 'tree-width', name: '动态树宽' } },
  ],
}

/** The project spaces the fixture host `host` holds at `path`, as readWorkspaceSpaces reads a real host's. */
export function fixtureSshSpaces(host: string, path: string): WorkspaceSpace[] {
  if (!FIXTURE_SSH_HOSTS.includes(host)) {
    throw new Error(`ssh: Could not resolve hostname ${host}: nodename nor servname provided, or not known`)
  }
  return structuredClone([...SPACES[posix.normalize(path).replace(/(.)\/+$/, '$1')] ?? []])
}
