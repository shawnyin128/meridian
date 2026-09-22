import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { extensionStatuses } from './status.js'

const temporary: string[] = []

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'meridian-extension-status-'))
  temporary.push(home)
  return home
}

/** Lists the plugin as installed the way each client does: a config.toml section, or an installed_plugins.json entry. */
function register(home: string, client: 'codex' | 'claude-code', version: string, enabled = true): void {
  if (client === 'codex') {
    mkdirSync(join(home, '.codex'), { recursive: true })
    writeFileSync(join(home, '.codex', 'config.toml'),
      `[plugins."other@elsewhere"]\nenabled = true\n\n[plugins."meridian@meridian"]\nenabled = ${enabled}\n`, 'utf8')
    return
  }
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  const installPath = join(home, '.claude', 'plugins', 'cache', 'meridian', 'meridian', version)
  writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'meridian@meridian': [{ scope: 'user', installPath, version }] } }), 'utf8')
}

function cachePackage(home: string, client: 'codex' | 'claude-code', version: string, complete = true): void {
  const clientRoot = client === 'codex' ? '.codex' : '.claude'
  const manifestDir = client === 'codex' ? '.codex-plugin' : '.claude-plugin'
  const root = join(home, clientRoot, 'plugins', 'cache', 'meridian', 'meridian', version)
  mkdirSync(join(root, manifestDir), { recursive: true })
  writeFileSync(join(root, manifestDir, 'plugin.json'), `${JSON.stringify({ version })}\n`, 'utf8')
  if (!complete) return
  writeFileSync(join(root, '.mcp.json'), '{}\n', 'utf8')
  for (const skill of ['meridian', 'wiki', 'lab', 'meridian-coding']) {
    mkdirSync(join(root, 'skills', skill), { recursive: true })
    writeFileSync(join(root, 'skills', skill, 'SKILL.md'), `# ${skill}\n`, 'utf8')
  }
}

function installPackage(home: string, client: 'codex' | 'claude-code', version: string, complete = true): void {
  cachePackage(home, client, version, complete)
  register(home, client, version)
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('extension status', () => {
  it('没有缓存包时返回未安装并附带仓库中的两步安装命令', () => {
    const status = extensionStatuses(tempHome())
    expect(status.map((item) => [item.id, item.state])).toEqual([
      ['codex', 'not-installed'],
      ['claude-code', 'not-installed'],
    ])
    expect(status[0]?.installCommand).toContain('codex plugin marketplace add')
    expect(status[0]?.installCommand).toContain('codex plugin add meridian@meridian')
    expect(status[1]?.installCommand).toContain('claude plugin marketplace add')
    expect(status[1]?.installCommand).toContain('claude plugin install meridian@meridian')
  })

  it('完整包显示已安装并读取 manifest 版本', () => {
    const home = tempHome()
    installPackage(home, 'codex', '0.0.1')
    installPackage(home, 'claude-code', '0.8.0')

    expect(extensionStatuses(home).map((item) => [item.id, item.state, item.version])).toEqual([
      ['codex', 'installed', '0.0.1'],
      ['claude-code', 'installed', '0.8.0'],
    ])
  })

  it('发现旧的不完整包时提示更新而不误报未安装', () => {
    const home = tempHome()
    installPackage(home, 'codex', '0.7.0', false)

    expect(extensionStatuses(home)[0]).toMatchObject({
      id: 'codex', state: 'update-required', version: '0.7.0',
    })
  })

  it('插件与 App 同一版本号：比 App 旧的完整包提示更新，同版或更新的算已安装', () => {
    const home = tempHome()
    installPackage(home, 'codex', '0.0.9')
    installPackage(home, 'claude-code', '0.0.10')

    expect(extensionStatuses(home, '0.0.10').map((item) => [item.id, item.state, item.version])).toEqual([
      ['codex', 'update-required', '0.0.9'],
      ['claude-code', 'installed', '0.0.10'],
    ])
    expect(extensionStatuses(home, '0.0.9').map((item) => item.state)).toEqual(['installed', 'installed'])
  })

  it('卸载后留下的缓存包不算已安装', () => {
    const home = tempHome()
    cachePackage(home, 'codex', '0.0.4')
    cachePackage(home, 'claude-code', '0.0.4')
    register(home, 'codex', '0.0.4', false)
    expect(extensionStatuses(home).map((item) => item.state)).toEqual(['not-installed', 'not-installed'])
  })

  it('Claude Code 以登记的安装路径为准，不看更高版本的旧缓存', () => {
    const home = tempHome()
    cachePackage(home, 'claude-code', '0.0.4')
    installPackage(home, 'claude-code', '0.0.1')
    expect(extensionStatuses(home, '0.0.1')[1]).toMatchObject({ state: 'installed', version: '0.0.1' })
  })

  it('登记了但包文件缺失时提示重新安装', () => {
    const home = tempHome()
    register(home, 'codex', '0.0.1')
    mkdirSync(join(home, '.codex', 'plugins', 'cache', 'meridian', 'meridian', '0.0.1'), { recursive: true })
    register(home, 'claude-code', '0.0.1')
    expect(extensionStatuses(home).map((item) => [item.state, item.version])).toEqual([
      ['update-required', undefined], ['update-required', undefined],
    ])
  })

  it('优先检查数值意义上最新的缓存版本', () => {
    const home = tempHome()
    installPackage(home, 'codex', '0.9.0', false)
    installPackage(home, 'codex', '0.10.0')

    expect(extensionStatuses(home)[0]).toMatchObject({
      id: 'codex', state: 'installed', version: '0.10.0',
    })
  })
})
