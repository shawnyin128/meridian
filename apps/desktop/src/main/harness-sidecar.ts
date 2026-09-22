import { join } from 'node:path'

/** Environment passed to Core so installed builds launch the bundled executable directly. */
export function packagedHarnessEnvironment(
  packaged: boolean,
  resourcesPath: string,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  if (!packaged) return { MERIDIAN_HARNESS_CONDA_ENV: 'meridian' }
  const executable = platform === 'win32' ? 'meridian-harness.exe' : 'meridian-harness'
  return { MERIDIAN_HARNESS_EXECUTABLE: join(resourcesPath, 'harness', executable) }
}
