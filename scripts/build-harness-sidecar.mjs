import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const harness = join(root, 'apps', 'harness')
const target = `${process.platform}-${process.arch}`
const output = join(harness, 'dist', target)
const build = join(harness, 'build', target)
const binaryName = process.platform === 'win32' ? 'meridian-harness.exe' : 'meridian-harness'
const binary = join(output, 'meridian-harness', binaryName)
const python = process.env['MERIDIAN_HARNESS_BUILD_PYTHON'] ?? process.env['PYTHON'] ?? 'python'

rmSync(output, { recursive: true, force: true })
rmSync(build, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
mkdirSync(build, { recursive: true })

const args = [
  '-m', 'PyInstaller',
  '--noconfirm', '--clean', '--onedir',
  '--name', 'meridian-harness',
  '--distpath', output,
  '--workpath', build,
  '--specpath', build,
  '--paths', join(harness, 'src'),
  join(harness, 'sidecar_entry.py'),
]
const result = spawnSync(python, args, {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, PYINSTALLER_CONFIG_DIR: join(build, 'config') },
})
if (result.error !== undefined) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
if (!existsSync(binary)) throw new Error(`Harness sidecar was not created: ${binary}`)
if (process.platform !== 'win32') chmodSync(binary, 0o755)

process.stdout.write(`Built Harness sidecar: ${binary}\n`)
