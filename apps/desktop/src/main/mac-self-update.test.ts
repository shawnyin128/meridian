import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canReplaceSelf, createMacSelfUpdate, SWAP_SCRIPT, type ReleaseInfo } from './mac-self-update.js'

const ZIP = Buffer.from('zip bytes of Meridian 0.0.15.3')
const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')
const RELEASE: ReleaseInfo = {
  version: '0.0.15003',
  files: [
    { url: 'Meridian-0.0.15.3-arm64.zip', sha512: sha512(ZIP), size: ZIP.length },
    { url: 'Meridian-0.0.15.3-arm64.dmg', sha512: 'unused', size: 1 },
  ],
}

let root = ''
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }) })

/** An App bundle in a temporary Applications folder, and a self-updater whose OS commands are recorded. */
function setup({ served = ZIP, bundledVersion = '0.0.15003' } = {}) {
  root = mkdtempSync(join(tmpdir(), 'meridian-self-update-'))
  const applications = join(root, 'Applications')
  const bundle = join(applications, 'Meridian.app')
  mkdirSync(join(bundle, 'Contents'), { recursive: true })
  const fetched: string[] = []
  const commands: string[][] = []
  const launched: { script: string; args: readonly string[] }[] = []
  let quits = 0
  const self = createMacSelfUpdate({
    bundle,
    pid: 4242,
    base: (version) => `https://example.test/download/v${version}/`,
    fetch: (url) => {
      fetched.push(url)
      return Promise.resolve(new Response(served, { headers: { 'content-length': String(served.length) } }))
    },
    run: (command, args) => {
      commands.push([command, ...args])
      if (command === '/usr/bin/ditto') {
        expect(readFileSync(args[2]!)).toEqual(served)
        mkdirSync(join(args[3]!, 'Meridian.app', 'Contents'), { recursive: true })
      }
      return Promise.resolve(command === '/usr/bin/plutil' ? `${bundledVersion}\n` : '')
    },
    launch: (script, args) => { launched.push({ script, args }) },
    quit: () => { quits += 1 },
  })
  return { self, bundle, staging: join(applications, '.Meridian.app-update'), fetched, commands, launched, quits: () => quits }
}

describe('createMacSelfUpdate', () => {
  it('downloads the release zip, checks it, and stages the new bundle beside the App', async () => {
    const { self, bundle, staging, fetched, commands, launched, quits } = setup()
    const progress: number[] = []
    await self.download(RELEASE, (percent) => progress.push(percent))

    expect(fetched).toEqual(['https://example.test/download/v0.0.15003/Meridian-0.0.15.3-arm64.zip'])
    expect(progress.at(-1)).toBe(100)
    const staged = join(staging, 'unpacked', 'Meridian.app')
    expect(commands).toEqual([
      ['/usr/bin/ditto', '-x', '-k', join(staging, 'update.zip'), join(staging, 'unpacked')],
      ['/usr/bin/codesign', '--verify', '--deep', '--strict', staged],
      ['/usr/bin/plutil', '-extract', 'CFBundleShortVersionString', 'raw', join(staged, 'Contents', 'Info.plist')],
    ])
    expect(existsSync(join(staging, 'update.zip'))).toBe(false)

    self.install()
    expect(launched).toEqual([{ script: SWAP_SCRIPT, args: ['4242', bundle, staged, staging, '/usr/bin/open'] }])
    expect(quits()).toBe(1)
  })

  it('rejects a download whose checksum differs from the release and leaves nothing beside the App', async () => {
    const { self, staging, commands, launched } = setup({ served: Buffer.from('tampered bytes') })
    await expect(self.download(RELEASE, () => {}))
      .rejects.toThrow('Meridian-0.0.15.3-arm64.zip does not match the checksum its release lists')
    expect(commands).toEqual([])
    expect(existsSync(staging)).toBe(false)
    self.install()
    expect(launched).toEqual([])
  })

  it('rejects an update whose bundle is not the release version, naming both in four parts', async () => {
    const { self, staging } = setup({ bundledVersion: '0.0.15002' })
    await expect(self.download(RELEASE, () => {})).rejects.toThrow('The update is version 0.0.15.2, not 0.0.15.3')
    expect(existsSync(staging)).toBe(false)
  })

  it('rejects a release that has no macOS zip without downloading anything', async () => {
    const { self, fetched } = setup()
    await expect(self.download({ version: '0.0.15003', files: [RELEASE.files[1]!] }, () => {}))
      .rejects.toThrow('Release 0.0.15.3 has no macOS zip')
    expect(fetched).toEqual([])
  })

  it('does nothing on install before a download has finished', () => {
    const { self, launched, quits } = setup()
    self.install()
    expect(launched).toEqual([])
    expect(quits()).toBe(0)
  })

  it('removes what an interrupted update left beside the App when it starts', () => {
    root = mkdtempSync(join(tmpdir(), 'meridian-self-update-'))
    const leftover = join(root, '.Meridian.app-update', 'unpacked', 'Meridian.app')
    mkdirSync(leftover, { recursive: true })
    createMacSelfUpdate({
      bundle: join(root, 'Meridian.app'), pid: 1, base: () => 'https://example.test/',
      fetch: () => Promise.reject(new Error('unused')), run: () => Promise.reject(new Error('unused')),
      launch: () => {}, quit: () => {},
    })
    expect(existsSync(join(root, '.Meridian.app-update'))).toBe(false)
  })
})

describe('canReplaceSelf', () => {
  it('allows a bundle in a writable folder and refuses a translocated or read-only one', () => {
    root = mkdtempSync(join(tmpdir(), 'meridian-self-update-'))
    const writable = join(root, 'Applications', 'Meridian.app')
    mkdirSync(writable, { recursive: true })
    expect(canReplaceSelf(writable)).toBe(true)

    const translocated = join(root, 'AppTranslocation', 'ABC', 'd', 'Meridian.app')
    mkdirSync(translocated, { recursive: true })
    expect(canReplaceSelf(translocated)).toBe(false)

    const locked = join(root, 'Locked', 'Meridian.app')
    mkdirSync(locked, { recursive: true })
    chmodSync(join(root, 'Locked'), 0o555)
    try {
      expect(canReplaceSelf(locked)).toBe(false)
    } finally {
      chmodSync(join(root, 'Locked'), 0o755)
    }
  })
})

describe('SWAP_SCRIPT', () => {
  /** Runs the swap helper for real against folders standing in for the bundles, with an opener that records its argument. */
  function swap({ stageNew = true } = {}) {
    root = mkdtempSync(join(tmpdir(), 'meridian-swap-'))
    const app = join(root, 'Meridian.app')
    const staging = join(root, '.Meridian.app-update')
    const staged = join(staging, 'unpacked', 'Meridian.app')
    mkdirSync(app)
    writeFileSync(join(app, 'version'), 'old')
    if (stageNew) {
      mkdirSync(staged, { recursive: true })
      writeFileSync(join(staged, 'version'), 'new')
    } else {
      mkdirSync(staging)
    }
    const opened = join(root, 'opened')
    const opener = join(root, 'opener.sh')
    writeFileSync(opener, `#!/bin/sh\nprintf '%s' "$1" > '${opened}'\n`)
    chmodSync(opener, 0o755)
    const exited = spawnSync('/usr/bin/true')
    expect(exited.status).toBe(0)
    execFileSync('/bin/sh', ['-c', SWAP_SCRIPT, 'meridian-update', String(exited.pid), app, staged, staging, opener])
    return { app, staging, opened: readFileSync(opened, 'utf8') }
  }

  it('swaps the bundles once the App has exited, opens the new one and clears the staging folder', () => {
    const { app, staging, opened } = swap()
    expect(readFileSync(join(app, 'version'), 'utf8')).toBe('new')
    expect(opened).toBe(app)
    expect(existsSync(staging)).toBe(false)
  })

  it('puts the old bundle back and opens it when the new one cannot be moved in', () => {
    const { app, staging, opened } = swap({ stageNew: false })
    expect(readFileSync(join(app, 'version'), 'utf8')).toBe('old')
    expect(opened).toBe(app)
    expect(existsSync(staging)).toBe(false)
  })
})
