import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

/** File that marks a folder as a test library this tool created. */
export const MARKER = '.meridian-test-library.json'

/**
 * Returns the real Meridian data a test library must stay clear of: the config home `~/.meridian`,
 * the App's user-data folder on `platform`, and every library `paper-wiki-workspaces.json` in that
 * config home lists. Reads only that one file. Throws when the file exists but is not JSON.
 */
export function protectedRoots({ home = homedir(), platform = process.platform, appData = process.env.APPDATA } = {}) {
  const configHome = join(home, '.meridian')
  const userData = platform === 'darwin' ? join(home, 'Library', 'Application Support', '@meridian', 'desktop')
    : platform === 'win32' ? join(appData ?? join(home, 'AppData', 'Roaming'), '@meridian', 'desktop')
      : join(home, '.config', '@meridian', 'desktop')
  const listing = join(configHome, 'paper-wiki-workspaces.json')
  const config = existsSync(listing) ? JSON.parse(readFileSync(listing, 'utf8')) : {}
  const libraries = [config.active_library_root, ...(config.workspaces ?? []).map((item) => item.library_root)]
  return [configHome, userData, ...libraries.filter((root) => typeof root === 'string' && root !== '')]
}

/** `path` absolute with symlinks resolved as far as it exists, lowercased where the file system ignores case. */
function canonical(path, platform) {
  let head = resolve(path)
  const tail = []
  while (!existsSync(head) && dirname(head) !== head) {
    tail.unshift(basename(head))
    head = dirname(head)
  }
  const real = join(realpathSync.native(head), ...tail)
  return platform === 'darwin' || platform === 'win32' ? real.toLowerCase() : real
}

const within = (child, parent) => {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

/**
 * Throws unless `out` may hold a test library: it neither lies inside nor contains any of `roots`,
 * and it is missing, empty, or carries the MARKER. With `seeded`, it must carry the MARKER.
 */
export function checkOut(out, roots, { platform = process.platform, seeded = false } = {}) {
  const target = canonical(out, platform)
  for (const root of roots) {
    const held = canonical(root, platform)
    if (within(target, held) || within(held, target)) {
      throw new Error(`Refusing ${out}: it overlaps real Meridian data at ${root}`)
    }
  }
  const names = existsSync(out) ? readdirSync(out).filter((name) => name !== '.DS_Store') : []
  if (seeded && !names.includes(MARKER)) throw new Error(`Refusing ${out}: no test library was seeded there`)
  if (names.length > 0 && !names.includes(MARKER)) {
    throw new Error(`Refusing ${out}: it is not empty and this tool did not create it`)
  }
}
