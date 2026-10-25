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
  it('a jump lands on its row or anchor only through useArrival, which flashes it', () => {
    expect(copies(/\.scrollIntoView\(/, {
      'hooks/useArrival.ts': { reason: 'the landing itself' },
      'shell/CommandPalette.tsx': { reason: 'the option the arrow keys reach stays in view; nothing jumped' },
      'components/reader/ReadingNotes.tsx': { reason: 'the card of the highlight selected on the page, which shows as selected, stays in view' },
      'routes/Reader.tsx': { count: 1, reason: 'opening a paper resumes at its last page, and a note being written is shown again; neither names an anchor' },
    })).toEqual([])
  })

  it('a field saves and cancels by key only through commitKeys', () => {
    expect(copies(/key [!=]== 'Escape'|'Enter' && !composing|commitsMultiline\(/, {
      'lib/keyboard.ts': { reason: 'commitKeys itself' },
      'components/MarkdownEditor.tsx': { reason: 'tells CodeMirror the commit key is taken, for the box around it to act on' },
      'shell/AppShell.tsx': { reason: 'Escape outside every field peels the top dismissible layer' },
      'components/Grip.tsx': { reason: 'Escape ends a resize drag where it started' },
      'hooks/useGanttDrag.ts': { reason: 'Escape ends a bar drag where it started' },
      'components/paper-table/ColumnAdd.tsx': { reason: 'the column type picker, a radio group, drops the new column on Escape' },
    })).toEqual([])
  })

  it('focus goes back to the element that opened a layer only through useOpenerFocus', () => {
    expect(copies(/[!=]== document\.body/, {
      'hooks/useOpenerFocus.ts': { reason: 'the opener focus itself' },
    })).toEqual([])
  })

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

  it('a timestamp\'s day and an author list are written only through the shared format', () => {
    expect(copies(/\.date\((localDayOf|localDay|dayOf)\(|function localDay\(|authors[^\n]*\.join\(/, {
      'lib/format.ts': { reason: 'the format itself' },
    })).toEqual([])
  })
})
