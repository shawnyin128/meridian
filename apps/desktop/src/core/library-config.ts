import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LibraryLocation, LibrarySource } from '../shared/contract.js'
import { writeJson } from './vault/writer.js'
import { libraryPaths, prepareSelectedLibrary } from './workspace-layout.js'

export const USER_CONFIG_SCHEMA_VERSION = 'meridian.paper_wiki_user_config.v1'
export const USER_CONFIG_FILENAME = 'paper-wiki-workspaces.json'

type UserConfig = Record<string, unknown> & {
  created_at?: string
  workspaces?: unknown
}

export type LibraryConfigOptions = {
  currentRoot: string
  source: LibrarySource
  configHome: string
  now?: Date
}

/** Current library shown in Settings; derived internal paths remain in Core and do not cross into the renderer. */
export function currentLibrary(options: LibraryConfigOptions): LibraryLocation {
  return location(options.currentRoot, options.source, false)
}

/**
 * Validate or initialize the target library, then register it as the active workspace using the
 * Python CLI user-configuration format. This only switches the pointer; it neither copies nor
 * deletes the current library. The running Core keeps serving the old library until restart.
 */
export function configureLibrary(root: string, options: LibraryConfigOptions): LibraryLocation {
  if (options.source === 'environment' || options.source === 'fixture') {
    throw new Error(options.source === 'environment'
      ? '当前库由 MERIDIAN_VAULT_ROOT 指定，请先移除该环境变量再在设置中切换'
      : '测试数据模式不能切换论文库')
  }
  const now = options.now ?? new Date()
  // Confirm that existing user configuration can be merged safely before writing into the target.
  const payload = readUserConfig(join(options.configHome, USER_CONFIG_FILENAME), now)
  const paths = prepareSelectedLibrary(root, now)
  registerActiveLibrary(paths.root, options.configHome, now, payload)
  return location(paths.root, 'configured', paths.root !== libraryPaths(options.currentRoot).root)
}

/** Neither `currentLibrary` nor `configureLibrary` opens the vault, so `openError` is always null here; only Core's own `library.location` handler knows whether the running vault failed to open. */
function location(root: string, source: LibrarySource, restartRequired: boolean): LibraryLocation {
  return {
    root: libraryPaths(root).root,
    source,
    locked: source === 'environment' || source === 'fixture',
    restartRequired,
    openError: null,
  }
}

function readUserConfig(path: string, now: Date): UserConfig {
  if (!existsSync(path)) return { created_at: now.toISOString(), workspaces: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('顶层必须是对象')
    }
    const payload = parsed as UserConfig
    if (payload.workspaces !== undefined && !Array.isArray(payload.workspaces)) {
      throw new Error('workspaces 必须是数组')
    }
    if (Array.isArray(payload.workspaces)
      && payload.workspaces.some((entry) => entry === null || typeof entry !== 'object' || Array.isArray(entry))) {
      throw new Error('workspaces 的每一项必须是对象')
    }
    return payload
  } catch (error) {
    throw new Error(`用户论文库配置无效：${error instanceof Error ? error.message : String(error)}`)
  }
}

function registerActiveLibrary(root: string, configHome: string, now: Date, payload: UserConfig): void {
  const paths = libraryPaths(root)
  const sourceRoot = join(paths.root, 'sources')
  const target = join(configHome, USER_CONFIG_FILENAME)
  const prior = (payload.workspaces ?? []) as unknown[]
  const workspaces = prior.filter((entry) => {
    if (entry === null || typeof entry !== 'object') return true
    return (entry as { library_root?: unknown }).library_root !== paths.root
  })
  workspaces.push({
    library_root: paths.root,
    config_path: join(paths.root, 'meridian-wiki.json'),
    wiki_root: paths.wiki,
    source_root: sourceRoot,
  })
  workspaces.sort((left, right) => workspaceRoot(left).localeCompare(workspaceRoot(right)))

  const stamp = now.toISOString()
  const next = {
    ...payload,
    schema_version: USER_CONFIG_SCHEMA_VERSION,
    updated_at: stamp,
    active_library_root: paths.root,
    workspaces,
  }
  writeJson(target, next, join(configHome, '.tmp'))
}

function workspaceRoot(value: unknown): string {
  if (value === null || typeof value !== 'object') return ''
  const root = (value as { library_root?: unknown }).library_root
  return typeof root === 'string' ? root : ''
}
