import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkOut, MARKER, protectedRoots } from './safety.mjs'

/** A throwaway home folder, so no case reads the real `~/.meridian`. */
let home = ''
const fakeHome = () => {
  home = mkdtempSync(join(tmpdir(), 'meridian-test-library-home-'))
  return home
}
afterEach(() => rmSync(home, { recursive: true, force: true }))

describe('测试库输出目录的安全检查', () => {
  it('拒绝写进真实配置目录 ~/.meridian 及其子目录', () => {
    const roots = protectedRoots({ home: fakeHome(), platform: 'darwin' })
    expect(() => checkOut(join(home, '.meridian'), roots)).toThrow(/overlaps real Meridian data/)
    expect(() => checkOut(join(home, '.meridian', 'library'), roots)).toThrow(/overlaps real Meridian data/)
    expect(() => checkOut(join(home, 'Library', 'Application Support', '@meridian', 'desktop', 'x'), roots))
      .toThrow(/overlaps real Meridian data/)
  })

  it('拒绝写进配置目录登记过的论文库,也拒绝包住它的目录', () => {
    fakeHome()
    const library = join(home, 'Research', 'library')
    mkdirSync(join(home, '.meridian'), { recursive: true })
    writeFileSync(join(home, '.meridian', 'paper-wiki-workspaces.json'), JSON.stringify({
      active_library_root: library, workspaces: [{ library_root: library }],
    }))
    const roots = protectedRoots({ home, platform: 'linux' })
    expect(() => checkOut(join(library, 'test'), roots)).toThrow(/overlaps real Meridian data/)
    expect(() => checkOut(join(home, 'Research'), roots)).toThrow(/overlaps real Meridian data/)
  })

  it('拒绝不是本工具建的非空目录,接受不存在、空的和带标记的目录', () => {
    const roots = protectedRoots({ home: fakeHome(), platform: 'darwin' })
    const foreign = join(home, 'foreign')
    mkdirSync(foreign)
    writeFileSync(join(foreign, 'notes.md'), '')
    expect(() => checkOut(foreign, roots)).toThrow(/not empty and this tool did not create it/)
    expect(() => checkOut(join(home, 'missing'), roots)).not.toThrow()
    mkdirSync(join(home, 'empty'))
    expect(() => checkOut(join(home, 'empty'), roots)).not.toThrow()
    writeFileSync(join(foreign, MARKER), '{}')
    expect(() => checkOut(foreign, roots)).not.toThrow()
  })

  it('打开时要求目录带标记', () => {
    const roots = protectedRoots({ home: fakeHome(), platform: 'darwin' })
    mkdirSync(join(home, 'empty'))
    expect(() => checkOut(join(home, 'empty'), roots, { seeded: true })).toThrow(/no test library was seeded there/)
  })
})
