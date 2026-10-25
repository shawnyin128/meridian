import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(process.cwd(), 'apps/desktop/src/renderer')

/** Every renderer source but the tests: [path relative to the renderer, its lines]. */
const SOURCES = readdirSync(RENDERER, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
  .map((entry) => relative(RENDERER, join(entry.parentPath, entry.name)).split('\\').join('/'))
  .sort()
  .map((file) => [file, readFileSync(join(RENDERER, file), 'utf8').split('\n')])

/**
 * `file:line` of every source line matching `pattern`. `allowed` maps a file to the reason it may
 * match, and to how many lines may, when it may only a few times; every line of the file is allowed
 * when no count is given. A file that matches more often than its count reports all its lines.
 */
function copies(pattern, allowed) {
  return SOURCES.flatMap(([file, lines]) => {
    const found = lines.flatMap((line, at) => (pattern.test(line) ? [`${file}:${at + 1}`] : []))
    const allowance = allowed[file]
    if (allowance === undefined) return found
    return allowance.count === undefined || found.length <= allowance.count ? [] : found
  })
}

describe('each shared behaviour has one implementation', () => {
  it('an element\'s width is kept only through useElementWidth', () => {
    expect(copies(/set\w*\(\s*\w+\.clientWidth\s*\)|width: \w+\.clientWidth\b/, {
      'hooks/useElementWidth.ts': { reason: 'the width itself' },
    })).toEqual([])
  })

  it('whether text is cut off is measured only through isClipped', () => {
    expect(copies(/scroll(Width|Height) *(>|<=) *\w+\.client(Width|Height) *\+ *1\b/, {
      'hooks/useClipped.ts': { reason: 'isClipped itself' },
    })).toEqual([])
  })
})
