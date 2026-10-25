import type { SshExecutor } from '../project-management/index.js'

/** The `Host` aliases the fixture library offers, as if read from `~/.ssh/config`. */
export const FIXTURE_SSH_HOSTS = ['gpu-lab', 'cluster']

const HOME = '/home/researcher'

/** The entries that are folders, hidden ones included, of each folder every fixture host has. */
const FOLDERS: Readonly<Record<string, readonly string[]>> = {
  '/': ['home', 'srv', 'tmp'],
  '/home': ['researcher'],
  [HOME]: ['.cache', '.ssh', 'checkpoints', 'datasets', 'logs', 'notes', 'projects', 'scratch', 'scripts'],
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
  [`${HOME}/projects/spec-decoding/experiments`]: [],
  [`${HOME}/projects/spec-decoding/src`]: [],
  [`${HOME}/scratch`]: [],
  [`${HOME}/scripts`]: [],
  '/srv': ['shared'],
  '/srv/shared': [],
  '/tmp': [],
}

/**
 * The SSH transport of the fixture library for listing the folder at `path`, or the home without
 * it. It answers as the remote shell of a fixture host would, and fails as OpenSSH and the shell do
 * for any other host and any folder the fixture hosts do not have. It never starts `ssh`.
 */
export function fixtureSsh(path: string | undefined): SshExecutor {
  return ({ host }) => {
    if (!FIXTURE_SSH_HOSTS.includes(host)) {
      throw new Error(`ssh: Could not resolve hostname ${host}: nodename nor servname provided, or not known`)
    }
    const folder = path ?? HOME
    const names = FOLDERS[folder]
    if (names === undefined) throw new Error(`cd: ${folder}: No such file or directory`)
    return Buffer.from([folder, ...names.map((name) => `./${name}`)].map((part) => `${part}\0`).join(''))
  }
}
