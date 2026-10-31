// Copies the Python core, src/meridian, into the Claude Code plugin's lib/ folder, which the plugin
// runs instead of an installed core. Run it after every change to src/meridian:
//   node scripts/sync-plugin-core.mjs
import { cpSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = join(root, 'src', 'meridian')
const target = join(root, 'plugins', 'claude-code', 'meridian', 'lib', 'meridian')

rmSync(target, { recursive: true, force: true })
cpSync(source, target, {
  recursive: true,
  filter: (path) => basename(path) !== '__pycache__' && !path.endsWith('.pyc'),
})
console.log(`Copied ${source} to ${target}`)
