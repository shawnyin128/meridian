import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { ExtensionClient, ExtensionStatus } from '../../shared/contract.js'

const INSTALL_COMMANDS: Record<ExtensionClient, string> = {
  codex: [
    'codex plugin marketplace add shawnyin128/meridian --ref master --sparse .agents/plugins --sparse plugins/codex/meridian',
    'codex plugin add meridian@meridian',
  ].join('\n'),
  'claude-code': [
    'claude plugin marketplace add shawnyin128/meridian --sparse .claude-plugin plugins/claude-code/meridian',
    'claude plugin install meridian@meridian',
  ].join('\n'),
}

const UPDATE_COMMANDS: Record<ExtensionClient, string> = {
  codex: [
    'codex plugin marketplace upgrade meridian',
    'codex plugin remove meridian@meridian',
    'codex plugin add meridian@meridian',
  ].join('\n'),
  'claude-code': 'claude plugin update meridian@meridian',
}

interface ClientLayout {
  id: ExtensionClient
  name: string
  cacheRoot: (home: string) => string
  manifest: string
  /** The package directories the client itself lists as installed, newest first, or null when it lists none. */
  registered: (home: string, cacheRoot: string) => string[] | null
}

const PLUGIN_KEY = 'meridian@meridian'

/** Claude Code lists installed plugins, with their package paths, in plugins/installed_plugins.json. */
function claudeRegistered(home: string): string[] | null {
  try {
    const file = JSON.parse(readFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8')) as {
      plugins?: Record<string, { installPath?: unknown }[] | undefined>
    }
    const paths = (file.plugins?.[PLUGIN_KEY] ?? []).flatMap((entry) => (
      typeof entry.installPath === 'string' && entry.installPath !== '' ? [entry.installPath] : []
    ))
    return paths.length === 0 ? null : paths
  } catch {
    return null
  }
}

/** Codex lists installed plugins as config.toml sections and keeps no path, so its cached packages stand in. */
function codexRegistered(home: string, cacheRoot: string): string[] | null {
  let lines: string[]
  try {
    lines = readFileSync(join(home, '.codex', 'config.toml'), 'utf8').split(/\r?\n/)
  } catch {
    return null
  }
  const start = lines.findIndex((line) => line.trim() === `[plugins."${PLUGIN_KEY}"]`)
  if (start === -1) return null
  const end = lines.findIndex((line, at) => at > start && line.trim().startsWith('['))
  const section = lines.slice(start + 1, end === -1 ? undefined : end)
  if (section.some((line) => /^\s*enabled\s*=\s*false\s*$/.test(line))) return null
  return cachedVersions(cacheRoot).map((directory) => join(cacheRoot, directory))
}

const CLIENTS: ClientLayout[] = [
  {
    id: 'codex',
    name: 'Codex',
    cacheRoot: (home) => join(home, '.codex', 'plugins', 'cache', 'meridian', 'meridian'),
    manifest: join('.codex-plugin', 'plugin.json'),
    registered: codexRegistered,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    cacheRoot: (home) => join(home, '.claude', 'plugins', 'cache', 'meridian', 'meridian'),
    manifest: join('.claude-plugin', 'plugin.json'),
    registered: (home) => claudeRegistered(home),
  },
]

const REQUIRED_SURFACES = [
  '.mcp.json',
  join('skills', 'meridian', 'SKILL.md'),
  join('skills', 'wiki', 'SKILL.md'),
  join('skills', 'lab', 'SKILL.md'),
  join('skills', 'meridian-coding', 'SKILL.md'),
] as const

/** Read a cached plugin manifest without trusting its version field or throwing into Settings. */
function manifestVersion(path: string, fallback: string): string {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
    return typeof value.version === 'string' && value.version.length > 0 ? value.version : fallback
  } catch {
    return fallback
  }
}

/** Newest cached package first; numeric comparison keeps 0.10 after 0.9. */
function cachedVersions(root: string): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' }))
}

/** Whether dotted numeric version `left` is older than `right`; 0.0.10 is newer than 0.0.9. */
export function olderThan(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }) < 0
}

/**
 * A client counts as having the plugin only when it lists it as installed; a leftover package cache
 * does not. A listed plugin whose package is missing or incomplete, or older than `pluginVersion`,
 * needs an update.
 */
function inspectClient(layout: ClientLayout, home: string, pluginVersion: string | undefined): ExtensionStatus {
  const commands = { installCommand: INSTALL_COMMANDS[layout.id], updateCommand: UPDATE_COMMANDS[layout.id] }
  const packages = layout.registered(home, layout.cacheRoot(home))
  if (packages === null) return { id: layout.id, name: layout.name, state: 'not-installed', ...commands }
  for (const packageRoot of packages) {
    const manifest = join(packageRoot, layout.manifest)
    if (!existsSync(manifest)) continue
    const complete = REQUIRED_SURFACES.every((surface) => existsSync(join(packageRoot, surface)))
    const version = manifestVersion(manifest, basename(packageRoot))
    const current = complete && (pluginVersion === undefined || !olderThan(version, pluginVersion))
    return {
      id: layout.id,
      name: layout.name,
      state: current ? 'installed' : 'update-required',
      version,
      ...commands,
    }
  }
  return { id: layout.id, name: layout.name, state: 'update-required', ...commands }
}

/**
 * Inspect each client's own plugin list and package files only; this never invokes an agent CLI or changes client state.
 * A plugin older than `pluginVersion`, the newest plugin version known, needs an update.
 */
export function extensionStatuses(home: string = homedir(), pluginVersion?: string): ExtensionStatus[] {
  return CLIENTS.map((layout) => inspectClient(layout, home, pluginVersion))
}
