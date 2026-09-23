// Sets one of Meridian's two version numbers on every surface that carries it.
//   node scripts/bump-version.mjs app 0.0.14.1  the desktop app, released by pushing v<stored semver>
//     (scripts/app-version.mjs: 0.0.14.1 is stored as 0.0.14001)
//   node scripts/bump-version.mjs plugin 0.0.2  the skills and MCP (plugins and Python core), released from master
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { semverOf } from './app-version.mjs'

const [target, version] = process.argv.slice(2)
const pattern = target === 'app' ? /^\d+\.\d+\.\d+(\.\d+)?$/ : /^\d+\.\d+\.\d+$/
if (!['app', 'plugin'].includes(target ?? '') || !pattern.test(version ?? '')) {
  console.error('Usage: node scripts/bump-version.mjs <app MAJOR.LARGE.SMALL[.FIX]|plugin major.minor.patch>')
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

if (target === 'app') {
  const stored = semverOf(version)
  replaceOnce('apps/desktop/package.json', /^( {2}"version": )"[^"]+"/m, `$1"${stored}"`)
  replaceOnce(
    'package-lock.json',
    /("apps\/desktop": \{\s*"name": "@meridian\/desktop",\s*"version": )"[^"]+"/,
    `$1"${stored}"`,
  )
} else {
  writeFileSync(join(root, 'VERSION'), `${version}\n`)
  replaceOnce('pyproject.toml', /^version = "[^"]+"$/m, `version = "${version}"`)
  replaceOnce('src/meridian/__init__.py', /^__version__ = "[^"]+"$/m, `__version__ = "${version}"`)
  for (const manifest of [
    'plugins/agent/meridian/plugin.json',
    'plugins/claude-code/meridian/.claude-plugin/plugin.json',
    'plugins/codex/meridian/.codex-plugin/plugin.json',
  ]) {
    replaceOnce(manifest, /^( {2}"version": )"[^"]+"/m, `$1"${version}"`)
  }
}
console.log(`Meridian ${target} version set to ${version}`)
