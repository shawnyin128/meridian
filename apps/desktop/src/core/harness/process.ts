import { existsSync } from 'node:fs'
import { delimiter, dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { HarnessChild } from './rpc.js'

export type HarnessProcessConfig = {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

type ProcessEnvironment = Readonly<NodeJS.ProcessEnv>

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url))

const FORWARDED_ENVIRONMENT_KEYS = [
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE',
  'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy',
] as const

/** Forward only process essentials, proxy routing, and trust-store configuration. */
function isolatedEnvironment(environment: ProcessEnvironment): NodeJS.ProcessEnv {
  return Object.fromEntries(FORWARDED_ENVIRONMENT_KEYS.flatMap((key) => {
    const value = environment[key]
    return value === undefined ? [] : [[key, value]]
  }))
}

/**
 * Resolve the Python Harness entrypoint without a shell. Development checkouts use the local
 * package source; installed builds can supply an executable or module path explicitly.
 */
export function harnessProcessConfig(
  environment: ProcessEnvironment = process.env,
  cwd = process.cwd(),
): HarnessProcessConfig {
  const executable = environment['MERIDIAN_HARNESS_EXECUTABLE']
  if (executable !== undefined && executable !== '') {
    return {
      command: executable,
      args: [],
      cwd,
      env: {
        ...isolatedEnvironment(environment),
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    }
  }
  const explicitCommand = environment['MERIDIAN_HARNESS_COMMAND'] ?? environment['PYTHON']
  const condaEnvironment = environment['MERIDIAN_HARNESS_CONDA_ENV']
  const useConda = explicitCommand === undefined && condaEnvironment !== undefined
    && condaEnvironment !== ''
  const condaRoot = useConda && environment['CONDA_EXE'] !== undefined
    ? resolve(environment['CONDA_EXE'], '..', '..') : undefined
  const condaPython = condaRoot === undefined ? undefined : resolve(
    condaRoot, 'envs', condaEnvironment ?? '',
    process.platform === 'win32' ? 'python.exe' : 'bin/python',
  )
  const useCondaRun = useConda && condaPython === undefined
  const command = explicitCommand
    ?? condaPython
    ?? (useCondaRun ? 'conda' : 'python')
  const module = environment['MERIDIAN_HARNESS_MODULE'] ?? 'meridian_harness'
  const configuredSource = environment['MERIDIAN_HARNESS_PYTHONPATH']
  const localSources = [
    resolve(cwd, 'apps', 'harness', 'src'),
    resolve(cwd, '..', 'harness', 'src'),
    resolve(MODULE_DIRECTORY, '../../../../harness/src'),
    resolve(MODULE_DIRECTORY, '../../../harness/src'),
  ]
  const source = configuredSource ?? localSources.find((candidate) => existsSync(candidate))
  const localRuntime = condaPython !== undefined && configuredSource === undefined
    && source !== undefined
    ? resolve(source, '..', '.runtime') : undefined
  const inheritedPath = environment['PYTHONPATH']
  const pythonPathParts = [source, localRuntime, inheritedPath]
    .filter((entry): entry is string => entry !== undefined && entry !== '')
  const pythonPath = pythonPathParts.length === 0 ? undefined : pythonPathParts.join(delimiter)
  return {
    command,
    args: useCondaRun
      ? ['run', '--no-capture-output', '-n', condaEnvironment, 'python', '-m', module]
      : ['-m', module],
    cwd,
    env: {
      ...isolatedEnvironment(environment),
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      ...(pythonPath === undefined ? {} : { PYTHONPATH: pythonPath }),
    },
  }
}

/** Start one isolated stdio Harness process; stdout remains exclusively reserved for JSONL RPC. */
export function launchHarnessProcess(config = harnessProcessConfig()): HarnessChild {
  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (child.stdin === null || child.stdout === null || child.stderr === null) {
    child.kill()
    throw new Error('Harness process did not expose all stdio channels')
  }
  return child as HarnessChild
}
