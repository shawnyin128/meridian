import { createHash } from 'node:crypto'
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { displayVersion } from '../shared/app-version.js'

/** One file of a release as `latest-mac.yml` lists it: a name relative to the release, its base64 SHA-512, its size. */
export interface ReleaseFile {
  url: string
  sha512: string
  size?: number
}

/** A release the feed found: its stored version and its files. */
export interface ReleaseInfo {
  version: string
  files: readonly ReleaseFile[]
}

/** Installs a release by replacing the App's own bundle, for builds Squirrel.Mac cannot update. */
export interface SelfUpdate {
  /** Downloads, verifies and unpacks `release` beside the App; rejects with the reason when any check fails. */
  download(release: ReleaseInfo, onProgress: (percent: number) => void): Promise<void>
  /** Starts the helper that swaps the bundles once the App has exited, then quits; does nothing before a download finished. */
  install(): void
}

/**
 * Waits for the App to exit, moves the old bundle aside, moves the new one into its place and opens
 * it; if the new bundle cannot be moved in, the old one goes back. Arguments: App pid, bundle path,
 * unpacked new bundle, staging folder (on the bundle's volume, so both moves are renames), opener.
 */
export const SWAP_SCRIPT = [
  'pid="$1"; app="$2"; staged="$3"; staging="$4"; opener="$5"',
  'while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done',
  'if mv "$app" "$staging/previous.app"; then',
  '  mv "$staged" "$app" || mv "$staging/previous.app" "$app"',
  'fi',
  '"$opener" "$app"',
  'rm -rf "$staging"',
].join('\n')

/** True when the App can replace `bundle` in place: it is not translocated and both it and its folder are writable. */
export function canReplaceSelf(bundle: string): boolean {
  // macOS runs a quarantined App from a randomized read-only mount; replacing that copy changes nothing.
  if (bundle.includes('/AppTranslocation/')) return false
  try {
    accessSync(bundle, constants.W_OK)
    accessSync(dirname(bundle), constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Creates the self-updater for `bundle` and removes what an interrupted earlier update left beside
 * it. `base(version)` is the URL the files of a release resolve against; `run` resolves with a
 * command's stdout and rejects on a non-zero exit; `launch` starts `SWAP_SCRIPT` detached with its
 * arguments.
 */
export function createMacSelfUpdate({ bundle, pid, base, fetch, run, launch, quit }: {
  bundle: string
  pid: number
  base: (version: string) => string
  fetch: (url: string) => Promise<Response>
  run: (command: string, args: readonly string[]) => Promise<string>
  launch: (script: string, args: readonly string[]) => void
  quit: () => void
}): SelfUpdate {
  const staging = join(dirname(bundle), `.${basename(bundle)}-update`)
  rmSync(staging, { recursive: true, force: true })
  let staged: string | undefined

  const fetchVerified = async (file: ReleaseFile, url: URL, target: string, onProgress: (percent: number) => void) => {
    const response = await fetch(url.href)
    if (!response.ok || response.body === null) {
      throw Object.assign(new Error(`Downloading ${file.url} failed with HTTP ${response.status}`), { statusCode: response.status })
    }
    const total = Number(response.headers.get('content-length')) || file.size || 0
    const hash = createHash('sha512')
    let received = 0
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        hash.update(chunk)
        received += chunk.length
        if (total > 0) onProgress(Math.min(100, (received / total) * 100))
        done(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(response.body as NodeReadableStream), meter, createWriteStream(target))
    if (hash.digest('base64') !== file.sha512) throw new Error(`${file.url} does not match the checksum its release lists`)
  }

  return {
    async download(release, onProgress) {
      const file = release.files.find((candidate) => candidate.url.endsWith('.zip'))
      if (file === undefined) throw new Error(`Release ${displayVersion(release.version)} has no macOS zip`)
      staged = undefined
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(staging, { recursive: true })
      try {
        const zip = join(staging, 'update.zip')
        await fetchVerified(file, new URL(file.url, base(release.version)), zip, onProgress)
        const unpacked = join(staging, 'unpacked')
        // ditto keeps the bundle's symlinks, permissions and signature intact, which unzip does not.
        await run('/usr/bin/ditto', ['-x', '-k', zip, unpacked])
        rmSync(zip)
        const app = join(unpacked, basename(bundle))
        if (!existsSync(app)) throw new Error(`The update for ${displayVersion(release.version)} holds no ${basename(bundle)}`)
        await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
        const version = (await run('/usr/bin/plutil', [
          '-extract', 'CFBundleShortVersionString', 'raw', join(app, 'Contents', 'Info.plist'),
        ])).trim()
        if (version !== release.version) throw new Error(`The update is version ${displayVersion(version)}, not ${displayVersion(release.version)}`)
        staged = app
      } catch (error) {
        rmSync(staging, { recursive: true, force: true })
        throw error
      }
    },
    install() {
      if (staged === undefined) return
      launch(SWAP_SCRIPT, [String(pid), bundle, staged, staging, '/usr/bin/open'])
      quit()
    },
  }
}
