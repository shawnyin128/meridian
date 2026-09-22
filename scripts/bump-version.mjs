// Sets one version number on every surface that ships together: the Python core, the desktop app,
// and the agent plugins. Usage: node scripts/bump-version.mjs 0.0.3
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: node scripts/bump-version.mjs <major.minor.patch>')
  process.exit(1)
}
const root = resolve(import.meta.dirname, '..')

/** Replaces exactly one match of `pattern` in `path`; fails when the file does not have exactly one. */
function replaceOnce(path, pattern, replacement) {
  const file = join(root, path)
  const text = readFileSync(file, 'utf8')
  const matches = text.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)) ?? []
  if (matches.length !== 1) throw new Error(`${path}: expected one version to replace, found ${matches.length}`)
  writeFileSync(file, text.replace(pattern, replacement))
}

writeFileSync(join(root, 'VERSION'), `${version}\n`)
replaceOnce('pyproject.toml', /^version = "[^"]+"$/m, `version = "${version}"`)
replaceOnce('src/meridian/__init__.py', /^__version__ = "[^"]+"$/m, `__version__ = "${version}"`)
for (const manifest of [
  'apps/desktop/package.json',
  'plugins/agent/meridian/plugin.json',
  'plugins/claude-code/meridian/.claude-plugin/plugin.json',
  'plugins/codex/meridian/.codex-plugin/plugin.json',
]) {
  replaceOnce(manifest, /^( {2}"version": )"[^"]+"/m, `$1"${version}"`)
}
replaceOnce(
  'package-lock.json',
  /("apps\/desktop": \{\s*"name": "@meridian\/desktop",\s*"version": )"[^"]+"/,
  `$1"${version}"`,
)
console.log(`Meridian version set to ${version}`)
