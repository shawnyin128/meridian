import {
  existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { configureLibrary, currentLibrary, USER_CONFIG_FILENAME } from './library-config.js'
import {
  deleteLibraryBackup, libraryPaths, listLibraryBackups, prepareSelectedLibrary, resetLibrary,
  switchLibraryBackup, validateLibrary, WORKSPACE_CONFIG_FILENAME,
} from './workspace-layout.js'
import { readWikiData } from './wiki/index.js'

const temporary: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'meridian-library-config-'))
  temporary.push(root)
  return root
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop library configuration', () => {
  it('把空目录初始化成与 Paper Wiki CLI 同根兼容的工作区', () => {
    const root = join(tempRoot(), 'papers')
    mkdirSync(root)
    const location = prepareSelectedLibrary(root, new Date('2026-09-14T12:00:00Z'))

    expect(location).toEqual(libraryPaths(root))
    expect(existsSync(join(root, WORKSPACE_CONFIG_FILENAME))).toBe(true)
    expect(existsSync(join(root, 'sources', 'papers'))).toBe(true)
    expect(existsSync(join(root, 'sources', 'notes'))).toBe(true)
    expect(existsSync(join(root, 'wiki', 'papers'))).toBe(true)
    expect(existsSync(join(root, 'wiki', '.drafts', 'ingests'))).toBe(true)
    expect(JSON.parse(readFileSync(join(root, WORKSPACE_CONFIG_FILENAME), 'utf8'))).toMatchObject({
      schema_version: 'meridian.paper_wiki_workspace.v1',
      library_root: location.root,
      source_root: join(location.root, 'sources'),
      wiki_root: location.wiki,
    })
  })

  it('新库的 Wiki 是 Core 读得出的聚合布局:结构与示例库相同,一页都还没有', () => {
    const example = resolve(import.meta.dirname, 'fixtures/wiki-example-vault')
    const paths = prepareSelectedLibrary(join(tempRoot(), 'papers'), new Date('2026-09-14T12:00:00Z'))
    const data = readWikiData(paths.wiki)
    expect(data).not.toBeNull()
    expect({ ...data!, pages: {} }).toEqual({ ...readWikiData(example)!, pages: {} })
    expect(data!.pages).toEqual({})
  })

  it('重置把整座旧库原样移进同级备份,原路径成为空库', () => {
    const parent = tempRoot()
    const root = join(parent, 'library')
    prepareSelectedLibrary(root, new Date('2026-09-14T12:00:00Z'))
    mkdirSync(join(root, '.meridian'), { recursive: true })
    writeFileSync(join(root, '.meridian', 'inbox.json'), '[{"id":"keep"}]\n', 'utf8')
    writeFileSync(join(root, 'sources', 'papers', 'paper.pdf'), 'immutable source', 'utf8')
    writeFileSync(join(root, 'wiki', 'papers', 'paper.md'), '# Paper\n', 'utf8')
    writeFileSync(join(root, 'wiki', 'projects', 'project.md'), '# Project\n', 'utf8')

    const result = resetLibrary(root, new Date('2026-09-15T18:28:38.123Z'))
    const canonicalRoot = libraryPaths(root).root
    const canonicalParent = dirname(canonicalRoot)

    expect(result).toEqual({
      root: canonicalRoot,
      backupRoot: join(canonicalParent, 'library-backup-20260915-182838Z'),
    })
    expect(readFileSync(join(result.backupRoot, '.meridian', 'inbox.json'), 'utf8'))
      .toBe('[{"id":"keep"}]\n')
    expect(readFileSync(join(result.backupRoot, 'sources', 'papers', 'paper.pdf'), 'utf8'))
      .toBe('immutable source')
    expect(readFileSync(join(result.backupRoot, 'wiki', 'papers', 'paper.md'), 'utf8'))
      .toBe('# Paper\n')
    expect(existsSync(join(root, '.meridian'))).toBe(false)
    expect(readdirSync(join(root, 'sources', 'papers'))).toEqual([])
    expect(readdirSync(join(root, 'wiki', 'papers'))).toEqual([])
    expect(readdirSync(join(root, 'wiki', 'projects'))).toEqual([])
    expect(validateLibrary(root)).toEqual(libraryPaths(root))
  })

  it('同一秒重复重置不覆盖已有备份', () => {
    const parent = tempRoot()
    const root = join(parent, 'library')
    const now = new Date('2026-09-15T18:28:38.123Z')
    prepareSelectedLibrary(root, now)
    const first = resetLibrary(root, now)
    const second = resetLibrary(root, now)
    const canonicalParent = dirname(libraryPaths(root).root)

    expect(first.backupRoot).toBe(join(canonicalParent, 'library-backup-20260915-182838Z'))
    expect(second.backupRoot).toBe(join(canonicalParent, 'library-backup-20260915-182838Z-2'))
    expect(existsSync(first.backupRoot)).toBe(true)
    expect(existsSync(second.backupRoot)).toBe(true)
  })

  it('列出、切换和删除应用创建的备份', () => {
    const parent = tempRoot()
    const root = join(parent, 'library')
    prepareSelectedLibrary(root, new Date('2026-09-14T12:00:00Z'))
    writeFileSync(join(root, 'sources', 'papers', 'before.txt'), 'before', 'utf8')
    const original = resetLibrary(root, new Date('2026-09-15T18:28:38.123Z'))
    writeFileSync(join(root, 'sources', 'papers', 'current.txt'), 'current', 'utf8')

    expect(listLibraryBackups(root)).toEqual([{
      id: 'library-backup-20260915-182838Z',
      path: original.backupRoot,
      createdAt: '2026-09-15T18:28:38.000Z',
    }])

    const switched = switchLibraryBackup(
      root, 'library-backup-20260915-182838Z', new Date('2026-09-16T09:10:11.000Z'),
    )
    expect(readFileSync(join(root, 'sources', 'papers', 'before.txt'), 'utf8')).toBe('before')
    expect(existsSync(join(root, 'sources', 'papers', 'current.txt'))).toBe(false)
    expect(readFileSync(join(switched.backupRoot, 'sources', 'papers', 'current.txt'), 'utf8')).toBe('current')
    expect(listLibraryBackups(root).map((backup) => backup.id))
      .toEqual(['library-backup-20260916-091011Z'])

    deleteLibraryBackup(root, 'library-backup-20260916-091011Z')
    expect(listLibraryBackups(root)).toEqual([])
    expect(existsSync(switched.backupRoot)).toBe(false)
  })

  it('备份管理不接受任意相对路径', () => {
    const parent = tempRoot()
    const root = join(parent, 'library')
    const outside = join(parent, 'keep-me')
    prepareSelectedLibrary(root)
    mkdirSync(outside)
    writeFileSync(join(outside, 'file.txt'), 'keep', 'utf8')

    expect(() => deleteLibraryBackup(root, '../keep-me')).toThrow('名称无效')
    expect(() => switchLibraryBackup(root, '../keep-me')).toThrow('名称无效')
    expect(readFileSync(join(outside, 'file.txt'), 'utf8')).toBe('keep')
  })

  it('拒绝把普通非空目录悄悄改造成论文库', () => {
    const root = tempRoot()
    writeFileSync(join(root, 'my-file.txt'), 'mine', 'utf8')

    expect(() => prepareSelectedLibrary(root)).toThrow('不是 Meridian 论文库')
    expect(existsSync(join(root, WORKSPACE_CONFIG_FILENAME))).toBe(false)
  })

  it('接受已初始化的库并拒绝桌面端尚不支持的分散路径', () => {
    const root = join(tempRoot(), 'library')
    prepareSelectedLibrary(root)
    expect(validateLibrary(root)).toEqual(libraryPaths(root))

    const file = join(root, WORKSPACE_CONFIG_FILENAME)
    const config = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    writeFileSync(file, `${JSON.stringify({ ...config, wiki_root: join(tempRoot(), 'wiki') })}\n`, 'utf8')
    expect(() => validateLibrary(root)).toThrow('自定义分散路径')
  })

  it('没有 Wiki 结构文件的库不收', () => {
    const root = join(tempRoot(), 'library')
    prepareSelectedLibrary(root)
    rmSync(join(root, 'wiki', 'schema.yaml'))
    expect(() => validateLibrary(root)).toThrow(`论文库结构不完整：缺少 ${join(libraryPaths(root).wiki, 'schema.yaml')}`)
    expect(() => prepareSelectedLibrary(root)).toThrow('论文库结构不完整')
  })

  it('登记活动库时保留用户配置的其他字段与其他工作区', () => {
    const base = tempRoot()
    const current = join(base, 'current')
    const target = join(base, 'target')
    const configHome = join(base, 'config')
    const currentLocation = prepareSelectedLibrary(current)
    const targetLocation = prepareSelectedLibrary(target)
    mkdirSync(configHome)
    writeFileSync(join(configHome, USER_CONFIG_FILENAME), `${JSON.stringify({
      created_at: '2026-01-01T00:00:00.000Z',
      custom_setting: 'keep-me',
      active_library_root: currentLocation.root,
      workspaces: [{
        library_root: currentLocation.root,
        config_path: join(currentLocation.root, WORKSPACE_CONFIG_FILENAME),
      }],
    })}\n`, 'utf8')

    const result = configureLibrary(target, {
      currentRoot: current,
      source: 'configured',
      configHome,
      now: new Date('2026-09-14T12:00:00Z'),
    })
    const saved = JSON.parse(readFileSync(join(configHome, USER_CONFIG_FILENAME), 'utf8')) as {
      custom_setting: string
      created_at: string
      active_library_root: string
      workspaces: Array<{ library_root: string }>
    }

    expect(result).toMatchObject({
      root: targetLocation.root, source: 'configured', restartRequired: true,
    })
    expect(saved.custom_setting).toBe('keep-me')
    expect(saved.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(saved.active_library_root).toBe(targetLocation.root)
    expect(saved.workspaces.map((workspace) => workspace.library_root)).toEqual(
      [currentLocation.root, targetLocation.root].sort(),
    )
  })

  it('环境变量和测试数据模式只读，不创建目标目录或改配置', () => {
    const base = tempRoot()
    for (const source of ['environment', 'fixture'] as const) {
      const target = join(base, source)
      expect(() => configureLibrary(target, {
        currentRoot: base,
        source,
        configHome: join(base, 'config'),
      })).toThrow()
      expect(existsSync(target)).toBe(false)
    }
    expect(currentLibrary({
      currentRoot: base, source: 'environment', configHome: join(base, 'config'),
    }).locked).toBe(true)
  })

  it('现有用户配置损坏时先停止，不初始化目标目录', () => {
    const base = tempRoot()
    const configHome = join(base, 'config')
    const target = join(base, 'target')
    mkdirSync(configHome)
    writeFileSync(join(configHome, USER_CONFIG_FILENAME), '{broken', 'utf8')

    expect(() => configureLibrary(target, {
      currentRoot: base,
      source: 'fallback',
      configHome,
    })).toThrow('用户论文库配置无效')
    expect(existsSync(target)).toBe(false)
  })

  it('重新选择当前库不要求重启', () => {
    const base = tempRoot()
    const root = join(base, 'library')
    prepareSelectedLibrary(root)
    expect(configureLibrary(root, {
      currentRoot: root,
      source: 'fallback',
      configHome: join(base, 'config'),
    }).restartRequired).toBe(false)
  })
})
