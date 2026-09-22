import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  existsSync, fsyncSync, linkSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { movePage, removePage, spliceLines, writeImmutable, writeJson, writePage } from './writer.js'

// Flush and rename leave no directly inspectable trace, so verify whether they run and in which order.
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return { ...real, fsyncSync: vi.fn(real.fsyncSync), renameSync: vi.fn(real.renameSync) }
})

/** Error shape produced by rename on EPERM when another Windows process holds the file open. */
const EPERM = Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })

/** Whether this host can run the locked-file case, which relies on Windows rename semantics. */
const onWindows = process.platform === 'win32'

/**
 * Opens the page in another process and holds it for `ms` milliseconds, writing
 * `flag` once the lock is acquired. It uses FileShare.Read, matching the way an
 * Obsidian vault scan permits reads while preventing replacement. Returns when
 * the child process exits.
 */
function holdOpen(file: string, ms: number, flag: string): Promise<unknown> {
  const child = spawn('powershell', ['-NoProfile', '-Command',
    `$f=[System.IO.File]::Open('${file}','Open','ReadWrite','Read');`
    + `Set-Content -LiteralPath '${flag}' -Value ready;`
    + `Start-Sleep -Milliseconds ${ms}; $f.Close()`])
  return once(child, 'exit')
}

/** Waits for the child process to acquire the page lock. Throws on timeout. */
function waitFor(flag: string): void {
  const shared = new Int32Array(new SharedArrayBuffer(4))
  for (let tried = 0; tried < 200 && !existsSync(flag); tried += 1) Atomics.wait(shared, 0, 0, 25)
  if (!existsSync(flag)) throw new Error('那个进程没能攥住这一页')
}

/** A one-line edit must preserve every other byte in a page containing frontmatter, body text, and mixed CRLF endings. */
const PAGE = [
  '---',
  'type: "project"',
  'name: "投机解码"',
  'status: "进行中"',
  'tasks: []',
  '---',
  '',
  '# 投机解码',
  '',
  '## 科研记录',
  '',
  '- 2026-09-08 创建项目',
  '',
].join('\n')

describe('vault writer', () => {
  let dir: string
  /** Partial output lands here: on the same volume as the page but outside the user's knowledge directory. */
  let staging: string

  beforeEach(() => {
    vi.clearAllMocks()
    dir = mkdtempSync(join(tmpdir(), 'meridian-writer-'))
    staging = mkdtempSync(join(tmpdir(), 'meridian-staging-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
  })

  it('不可变来源先完整落到 staging,且绝不覆盖同名文件', () => {
    const file = join(dir, 'sources', 'paper.pdf')
    writeImmutable(file, Uint8Array.from([1, 2, 3]), staging)
    expect([...readFileSync(file)]).toEqual([1, 2, 3])
    expect(() => writeImmutable(file, Uint8Array.from([9]), staging)).toThrow()
    expect([...readFileSync(file)]).toEqual([1, 2, 3])
    expect(readdirSync(staging)).toEqual([])
  })

  it('换掉一行,别的字节一个不动', () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    spliceLines(file, 3, 4, ['status: "搁置"'], staging)
    const after = readFileSync(file, 'utf8')
    expect(after.split('\n')).toEqual(PAGE.split('\n').map((row, i) => (i === 3 ? 'status: "搁置"' : row)))
  })

  it('换掉的行数与原来不一样时,前后两段仍逐字节保留', () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    spliceLines(file, 11, 12, ['- 2026-09-08 创建项目', '- 2026-09-09 记一笔'], staging)
    const rows = readFileSync(file, 'utf8').split('\n')
    expect(rows.slice(0, 11)).toEqual(PAGE.split('\n').slice(0, 11))
    expect(rows.slice(13)).toEqual(PAGE.split('\n').slice(12))
    expect(rows[12]).toBe('- 2026-09-09 记一笔')
  })

  it('没被改到的行原样保留行尾的 CR', () => {
    const file = join(dir, 'crlf.md')
    writeFileSync(file, 'a\r\nb\r\nc\r\n', 'utf8')
    spliceLines(file, 1, 2, ['B'], staging)
    expect(readFileSync(file, 'utf8')).toBe('a\r\nB\nc\r\n')
  })

  it('换行是写好一份新的再换上去,写到一半被打断也不会留下半截的页', () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    const link = join(dir, 'link.md')
    linkSync(file, link)
    spliceLines(file, 3, 4, ['status: "搁置"'], staging)
    // The hard link still targets the original file: rename only changes the directory entry, never the old bytes in place.
    expect(readFileSync(link, 'utf8')).toBe(PAGE)
    expect(readFileSync(file, 'utf8')).not.toBe(PAGE)
    expect(readdirSync(dir).sort()).toEqual(['link.md', 'page.md'])
  })

  it('写好的那一份先刷到盘上,再换到页上', () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    spliceLines(file, 3, 4, ['status: "搁置"'], staging)
    // Rename is atomic; flushing ensures the replacement is not left only in the page cache.
    expect(vi.mocked(fsyncSync)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fsyncSync).mock.invocationCallOrder[0]!)
      .toBeLessThan(vi.mocked(renameSync).mock.invocationCallOrder[0]!)
  })

  it('换名字这一步失败时,半成品留在暂存目录里,页旁边一个字节都没多', () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error('换不上去') })
    expect(() => spliceLines(file, 3, 4, ['status: "搁置"'], staging)).toThrow('换不上去')
    expect(readdirSync(dir)).toEqual(['page.md'])
    expect(readdirSync(staging)).toEqual(['page.md.tmp'])
    expect(readFileSync(file, 'utf8')).toBe(PAGE)
  })

  it('换名字撞上 EPERM 时退让再试,试成了页就换上去了', () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    vi.mocked(renameSync)
      .mockImplementationOnce(() => { throw EPERM })
      .mockImplementationOnce(() => { throw EPERM })
    spliceLines(file, 3, 4, ['status: "搁置"'], staging)
    expect(vi.mocked(renameSync)).toHaveBeenCalledTimes(3)
    expect(readFileSync(file, 'utf8').split('\n')[3]).toBe('status: "搁置"')
  })

  it.runIf(onWindows)('别的进程攥着这一页时重试,它一松手页就换上去了', async () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    const done = holdOpen(file, 60, join(dir, 'held'))
    try {
      waitFor(join(dir, 'held'))
      spliceLines(file, 3, 4, ['status: "搁置"'], staging)
      expect(readFileSync(file, 'utf8').split('\n')[3]).toBe('status: "搁置"')
      expect(vi.mocked(renameSync).mock.calls.length).toBeGreaterThan(1)
    } finally {
      await done
    }
  })

  it.runIf(onWindows)('那个进程一直攥着不放就抛出,页原样不动', async () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    const done = holdOpen(file, 1500, join(dir, 'held'))
    try {
      waitFor(join(dir, 'held'))
      expect(() => spliceLines(file, 3, 4, ['status: "搁置"'], staging)).toThrow(/开着这一页/)
      expect(readFileSync(file, 'utf8')).toBe(PAGE)
    } finally {
      await done
    }
  })

  it('写一页会把上级目录一并建好', () => {
    const file = join(dir, 'wiki', 'projects', 'project-1.md')
    writePage(file, PAGE, staging)
    expect(readFileSync(file, 'utf8')).toBe(PAGE)
  })

  it('写页是写好一份新的再换上去,写到一半被打断也不会留下半截的页', () => {
    const file = join(dir, 'page.md')
    writeFileSync(file, PAGE, 'utf8')
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error('换不上去') })
    expect(() => writePage(file, '换了的正文', staging)).toThrow('换不上去')
    expect(readFileSync(file, 'utf8')).toBe(PAGE)
  })

  it('写 JSON 写出来的是带缩进、末尾换行的文本', () => {
    const file = join(dir, '.meridian', 'watches.json')
    writeJson(file, [{ id: 'w-1', active: true }], staging)
    expect(readFileSync(file, 'utf8')).toBe('[\n  {\n    "id": "w-1",\n    "active": true\n  }\n]\n')
  })

  it('写 JSON 写到一半被打断,原来的文件保持原样', () => {
    const file = join(dir, 'state.json')
    writeFileSync(file, '{\n  "seq": 1\n}\n', 'utf8')
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error('换不上去') })
    expect(() => writeJson(file, { seq: 2 }, staging)).toThrow('换不上去')
    expect(readFileSync(file, 'utf8')).toBe('{\n  "seq": 1\n}\n')
  })

  it('搬走一页会把目的地的上级目录建好,原处不再有这一页', () => {
    const from = join(dir, 'wiki', 'papers', 'p.md')
    writePage(from, PAGE, staging)
    const to = join(dir, '.meridian', 'trash', 'trash-1.md')
    movePage(from, to)
    expect(readFileSync(to, 'utf8')).toBe(PAGE)
    expect(() => readFileSync(from, 'utf8')).toThrow()
  })

  it('删掉一页之后这一页就不在了', () => {
    const file = join(dir, 'p.md')
    writePage(file, PAGE, staging)
    removePage(file)
    expect(() => readFileSync(file, 'utf8')).toThrow()
  })
})
