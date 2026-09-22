// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname)
const MAIN = join(import.meta.dirname, '..', 'main')
const ZH_CATALOG = join(RENDERER, 'messages', 'zh')

const HAN = /[㐀-鿿]/

/**
 * Files exempt for good, not pending migration: they branch on locale directly and always carry
 * one language's literal text on each branch, so there is no single Chinese source to move into
 * the zh catalog. `lib/format.ts` composes Chinese day names and relative-day words by hand
 * because CLDR's numeric skeletons render zh-CN with slashes instead of this app's copy.
 * `messages/en/settings.ts` names each language in its own script, so the Chinese language name
 * is a fixed value in the English catalog too, not untranslated copy. `routes/Watches.tsx` keeps
 * two regexes of Chinese sentence separators and lead-in verbs used to split a typed line into
 * watch candidates: that is language data for the input affordance, not display copy.
 * `routes/Inbox.tsx` and `routes/Later.tsx` match a Chinese prefix Core throws from
 * `core/inbox/download.ts` to tell a download failure apart from other errors; Core is not
 * localized yet, so this is parsing input, not renderer-authored copy.
 * `components/project/ProjectIdentity.tsx`'s `STATUS_CLASS` keys are the contract's Chinese
 * `ProjectStatus` enum values; its values are CSS state classes, not copy, so there is nothing to
 * move into the zh catalog.
 */
const EXEMPT = [
  /renderer[\\/]lib[\\/]format\.ts$/,
  /renderer[\\/]messages[\\/]en[\\/]settings\.ts$/,
  /renderer[\\/]routes[\\/]Watches\.tsx$/,
  /renderer[\\/]routes[\\/]Inbox\.tsx$/,
  /renderer[\\/]routes[\\/]Later\.tsx$/,
  /renderer[\\/]components[\\/]project[\\/]ProjectIdentity\.tsx$/,
]

/**
 * Files that still hold Chinese copy inline. Each copy task deletes its own lines and the guard
 * then holds that area. The array must be empty when Phase 2 ends.
 */
const PENDING = [
  /main[\\/]messages\.ts$/,
]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('用户可见文案的标点', () => {
  it('中文句子里不出现半角逗号、冒号、问号', () => {
    const offenders: string[] = []
    for (const path of sources(ZH_CATALOG)) {
      readFileSync(path, 'utf8').split('\n').forEach((line, at) => {
        if (/[一-龥][,:?]/.test(line)) offenders.push(`${path}:${at + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('渲染层与主进程里的中文', () => {
  it('中文只出现在中文目录里', () => {
    const offenders: string[] = []
    for (const path of [...sources(RENDERER), ...sources(MAIN)]) {
      if (path.startsWith(ZH_CATALOG)) continue
      if (EXEMPT.some((exempt) => exempt.test(path))) continue
      if (PENDING.some((pending) => pending.test(path))) continue
      readFileSync(path, 'utf8').split('\n').forEach((line, at) => {
        if (HAN.test(line)) offenders.push(`${path}:${at + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('待迁移清单只收真的还有中文的文件', () => {
    const stale = PENDING.filter((pending) => {
      const matched = [...sources(RENDERER), ...sources(MAIN)]
        .filter((path) => !path.startsWith(ZH_CATALOG) && pending.test(path))
      return matched.length > 0 && matched.every((path) => !HAN.test(readFileSync(path, 'utf8')))
    })
    expect(stale.map(String)).toEqual([])
  })
})
