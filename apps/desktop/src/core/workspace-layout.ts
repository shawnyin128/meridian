import {
  existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

export const WORKSPACE_CONFIG_FILENAME = 'meridian-wiki.json'
export const WORKSPACE_SCHEMA_VERSION = 'meridian.paper_wiki_workspace.v1'

export type LibraryPaths = {
  root: string
  originals: string
  wiki: string
  readingNotes: string
}

export type LibraryReset = {
  root: string
  backupRoot: string
}

export type LibraryBackup = {
  id: string
  path: string
  createdAt: string
}

type WorkspaceConfig = {
  library_root: string
  source_root: string
  wiki_root: string
}

const WIKI_DIRS = [
  '.drafts/ingests', '.drafts/retrieval', '.drafts/proposals', '.drafts/insights',
  '.drafts/refinements', '.versions', '.index', 'raw/sources/papers', 'papers',
  'projects', 'claims', 'methods', 'evidence', 'topics', 'concepts', 'syntheses', 'templates',
] as const

const FINDER_METADATA = new Set(['.DS_Store', '.localized'])

/**
 * Complete wiki/schema.yaml for a new library: topics live under topics/, methods under methods/,
 * and method tables add a "used for" column derived from member topics. The two append sections
 * are experiments and open questions (findings are claims); cells must include source quotations.
 */
const WIKI_SCHEMA = [
  'version: 1',
  '',
  'kinds:',
  '  topic:',
  '    dir: topics',
  '    label: 主题',
  '    describe:',
  '      section: 问题',
  '      hint: 要做到什么、为什么难',
  '  method:',
  '    dir: methods',
  '    label: 方法',
  '    describe:',
  '      section: 机制',
  '      hint: 这一族共享什么',
  '    derived_columns:',
  '      - key: used_for',
  '        label: 用于',
  '        from_kind: topic',
  '',
  'sections:',
  '  - {key: experiments, label: 实验}',
  '  - {key: open, label: 未解决}',
  '',
  'anchor:',
  '  require_quote: true',
  '',
].join('\n')

/** Fixed physical layout of a library. Paths derive from one root; callers cannot split sources, Wiki, and personal state. */
export function libraryPaths(root: string): LibraryPaths {
  const absolute = canonical(root)
  return {
    root: absolute,
    originals: join(absolute, 'sources', 'papers'),
    wiki: join(absolute, 'wiki'),
    readingNotes: join(absolute, '.meridian', 'paper-readings.json'),
  }
}

/**
 * Validate an initialized library. Desktop Core currently supports only the standard single-root
 * layout. Reject external source_root/wiki_root configurations until desktop support is real so the
 * UI never displays one path while writing another. Also reject libraries without wiki/schema.yaml.
 */
export function validateLibrary(root: string): LibraryPaths {
  const paths = libraryPaths(root)
  const configFile = join(paths.root, WORKSPACE_CONFIG_FILENAME)
  if (!existsSync(configFile)) throw new Error(`所选目录不是 Meridian 论文库：缺少 ${WORKSPACE_CONFIG_FILENAME}`)
  let config: WorkspaceConfig
  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as Partial<WorkspaceConfig>
    if (typeof parsed.library_root !== 'string' || typeof parsed.source_root !== 'string'
      || typeof parsed.wiki_root !== 'string') throw new Error('路径字段不完整')
    config = parsed as WorkspaceConfig
  } catch (error) {
    throw new Error(`${WORKSPACE_CONFIG_FILENAME} 无效：${error instanceof Error ? error.message : String(error)}`)
  }
  if (canonical(config.library_root) !== paths.root
    || canonical(config.source_root) !== join(paths.root, 'sources')
    || canonical(config.wiki_root) !== paths.wiki) {
    throw new Error('这个库使用了自定义分散路径，当前桌面端只支持同一库根目录下的标准布局')
  }
  for (const directory of [paths.originals, join(paths.wiki, 'papers')]) {
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new Error(`论文库结构不完整：缺少 ${directory}`)
    }
  }
  const schema = join(paths.wiki, 'schema.yaml')
  if (!existsSync(schema)) throw new Error(`论文库结构不完整：缺少 ${schema}`)
  return paths
}

function canonical(path: string): string {
  const absolute = resolve(path)
  return existsSync(absolute) ? realpathSync.native(absolute) : absolute
}

/**
 * Prepare a directory selected in Settings. A truly empty directory may become a new library; an
 * ordinary non-empty directory must already be valid so Meridian never scatters files silently in an
 * arbitrary user folder. New libraries include wiki/schema.yaml (WIKI_SCHEMA) for Core aggregation.
 */
export function prepareSelectedLibrary(root: string, now = new Date()): LibraryPaths {
  if (!isAbsolute(root)) throw new Error('论文库必须使用绝对路径')
  const paths = libraryPaths(root)
  if (!existsSync(paths.root)) return initializeLibrary(paths, now)
  if (!statSync(paths.root).isDirectory()) throw new Error('所选位置不是目录')
  const meaningful = readdirSync(paths.root).filter((name) => !FINDER_METADATA.has(name))
  return meaningful.length === 0 ? initializeLibrary(paths, now) : validateLibrary(paths.root)
}

/** Upgrade the app-owned fallback from the early unmarked layout in place. Never use this for arbitrary Settings selections. Add wiki/schema.yaml when absent. */
export function prepareFallbackLibrary(root: string, now = new Date()): LibraryPaths {
  const paths = libraryPaths(root)
  return initializeLibrary(paths, now)
}

/**
 * Move the current library to a sibling backup, then create an empty library at the original path.
 * The backup preserves the exact bytes of sources, Wiki, and personal state. Keeping the original
 * path means user configuration and the next launch point to the new library. Callers must restart
 * immediately so a process holding the old VaultStore cannot continue writing.
 */
export function resetLibrary(root: string, now = new Date()): LibraryReset {
  const paths = validateLibrary(root)
  const backupRoot = nextBackupRoot(paths.root, now)

  renameSync(paths.root, backupRoot)
  try {
    initializeLibrary(libraryPaths(paths.root), now)
  } catch (error) {
    // The new library can contain only the skeleton from initializeLibrary; on failure, remove it and restore the old library in place.
    rmSync(paths.root, { recursive: true, force: true })
    renameSync(backupRoot, paths.root)
    throw error
  }
  return { root: paths.root, backupRoot }
}

/** List only complete, app-created sibling backups for the active library, newest first. */
export function listLibraryBackups(root: string): LibraryBackup[] {
  const activeRoot = validateLibrary(root).root
  const parent = dirname(activeRoot)
  const pattern = backupNamePattern(activeRoot)
  return readdirSync(parent, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return []
    const match = pattern.exec(entry.name)
    if (match === null) return []
    const candidate = join(parent, entry.name)
    try {
      validateLibraryBackup(candidate, activeRoot)
    } catch {
      return []
    }
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = Number(match[4])
    const minute = Number(match[5])
    const second = Number(match[6])
    return [{
      id: entry.name,
      path: candidate,
      createdAt: new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString(),
    }]
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id))
}

/**
 * Restore one inactive sibling backup into the active library path. The current library is moved
 * to a fresh backup first, so switching is reversible. Callers must restart immediately afterward.
 */
export function switchLibraryBackup(root: string, id: string, now = new Date()): LibraryReset {
  const activeRoot = validateLibrary(root).root
  const selectedRoot = resolveLibraryBackup(activeRoot, id)
  const currentBackupRoot = nextBackupRoot(activeRoot, now)

  renameSync(activeRoot, currentBackupRoot)
  try {
    renameSync(selectedRoot, activeRoot)
    try {
      validateLibrary(activeRoot)
    } catch (error) {
      renameSync(activeRoot, selectedRoot)
      renameSync(currentBackupRoot, activeRoot)
      throw error
    }
  } catch (error) {
    if (!existsSync(activeRoot) && existsSync(currentBackupRoot)) {
      renameSync(currentBackupRoot, activeRoot)
    }
    throw error
  }
  return { root: activeRoot, backupRoot: currentBackupRoot }
}

/** Permanently remove one exact app-created sibling backup. Arbitrary paths are never accepted. */
export function deleteLibraryBackup(root: string, id: string): void {
  const activeRoot = validateLibrary(root).root
  const backupRoot = resolveLibraryBackup(activeRoot, id)
  rmSync(backupRoot, { recursive: true })
}

function nextBackupRoot(activeRoot: string, now: Date): string {
  const parent = dirname(activeRoot)
  if (parent === activeRoot) throw new Error('不能重置文件系统根目录')
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-')
  const stem = `${basename(activeRoot)}-backup-${stamp}`
  let candidate = join(parent, stem)
  for (let suffix = 2; existsSync(candidate); suffix += 1) candidate = join(parent, `${stem}-${suffix}`)
  return candidate
}

function backupNamePattern(activeRoot: string): RegExp {
  const escaped = basename(activeRoot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}-backup-(\\d{4})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})(\\d{2})Z(?:-\\d+)?$`)
}

function resolveLibraryBackup(activeRoot: string, id: string): string {
  if (!backupNamePattern(activeRoot).test(id) || basename(id) !== id) {
    throw new Error('所选备份名称无效')
  }
  const parent = dirname(activeRoot)
  const entry = readdirSync(parent, { withFileTypes: true })
    .find((candidate) => candidate.name === id && candidate.isDirectory())
  if (entry === undefined) throw new Error('所选备份不存在')
  const candidate = join(parent, entry.name)
  validateLibraryBackup(candidate, activeRoot)
  return candidate
}

/** Backups keep the active root in their config because they are restored into that path. */
function validateLibraryBackup(backupRoot: string, activeRoot: string): void {
  const configFile = join(backupRoot, WORKSPACE_CONFIG_FILENAME)
  if (!existsSync(configFile)) throw new Error(`备份不完整：缺少 ${WORKSPACE_CONFIG_FILENAME}`)
  let config: WorkspaceConfig
  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as Partial<WorkspaceConfig>
    if (typeof parsed.library_root !== 'string' || typeof parsed.source_root !== 'string'
      || typeof parsed.wiki_root !== 'string') throw new Error('路径字段不完整')
    config = parsed as WorkspaceConfig
  } catch (error) {
    throw new Error(`备份中的 ${WORKSPACE_CONFIG_FILENAME} 无效：${error instanceof Error ? error.message : String(error)}`)
  }
  if (canonical(config.library_root) !== activeRoot
    || canonical(config.source_root) !== join(activeRoot, 'sources')
    || canonical(config.wiki_root) !== join(activeRoot, 'wiki')) {
    throw new Error('备份不属于当前论文库')
  }
  for (const path of [
    join(backupRoot, 'sources', 'papers'), join(backupRoot, 'wiki', 'papers'),
  ]) {
    if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`备份结构不完整：缺少 ${path}`)
  }
  const schema = join(backupRoot, 'wiki', 'schema.yaml')
  if (!existsSync(schema)) throw new Error(`备份结构不完整：缺少 ${schema}`)
}

function writeMissing(path: string, text: string): void {
  if (!existsSync(path)) writeFileSync(path, text, 'utf8')
}

function initializeLibrary(paths: LibraryPaths, now: Date): LibraryPaths {
  const sourceRoot = join(paths.root, 'sources')
  const directories = [
    paths.root, sourceRoot, paths.originals, join(sourceRoot, 'assets'), join(sourceRoot, 'notes'),
    ...WIKI_DIRS.map((relative) => join(paths.wiki, relative)),
  ]
  for (const directory of directories) mkdirSync(directory, { recursive: true })

  const stamp = now.toISOString()
  writeMissing(join(paths.root, WORKSPACE_CONFIG_FILENAME), `${JSON.stringify({
    schema_version: WORKSPACE_SCHEMA_VERSION,
    created_at: stamp,
    updated_at: stamp,
    library_root: paths.root,
    source_root: sourceRoot,
    wiki_root: paths.wiki,
    source_policy: 'copy_into_managed_store',
    source_registry: join(sourceRoot, 'sources.jsonl'),
  }, null, 2)}\n`)
  writeMissing(join(sourceRoot, 'sources.jsonl'), '')
  writeMissing(join(sourceRoot, 'index.md'), '# Source Index\n\nNo registered sources yet.\n')
  writeMissing(join(paths.wiki, 'index.md'), '# Wiki Index\n\n## Papers\n\n- None yet.\n')
  writeMissing(join(paths.wiki, 'log.md'), '# Wiki Log\n')
  writeMissing(join(paths.wiki, 'schema.yaml'), WIKI_SCHEMA)
  writeMissing(join(paths.wiki, 'raw', 'sources', 'index.md'), '# Source Index\n\nNo registered sources yet.\n')
  return validateLibrary(paths.root)
}
