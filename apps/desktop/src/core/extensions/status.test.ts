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

function installPackage(home: string, client: 'codex' | 'claude-code', version: string, complete = true): void {
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

  it('优先检查数值意义上最新的缓存版本', () => {
    const home = tempHome()
    installPackage(home, 'codex', '0.9.0', false)
    installPackage(home, 'codex', '0.10.0')

    expect(extensionStatuses(home)[0]).toMatchObject({
      id: 'codex', state: 'installed', version: '0.10.0',
    })
  })
})
