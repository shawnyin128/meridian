// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from './messages/en/index.js'
import { zh } from './messages/zh/index.js'

const RENDERER = join(import.meta.dirname)
const MAIN = join(import.meta.dirname, '..', 'main')
const CORE = join(import.meta.dirname, '..', 'core')
const ZH_CATALOG = join(RENDERER, 'messages', 'zh')

const HAN = /[㐀-鿿]/

/** A Chinese character directly followed by a half-width comma, colon or question mark. */
const HALF_WIDTH_AFTER_HAN = /[一-龥][,:?]/

/** The quoted and template string literals on one line of source; Core's Chinese lives only in these. */
const STRING_LITERALS = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g

/**
 * Files exempt for good, not pending migration: they branch on locale directly and always carry
 * one language's literal text on each branch, so there is no single Chinese source to move into
 * the zh catalog. `lib/format.ts` composes Chinese day names and relative-day words by hand
 * because CLDR's numeric skeletons render zh-CN with slashes instead of this app's copy.
 * `messages/en/settings.ts` names each language in its own script, so the Chinese language name
 * is a fixed value in the English catalog too, not untranslated copy. `routes/Watches.tsx` keeps
 * two regexes of Chinese sentence separators and lead-in verbs used to split a typed line into
 * watch candidates: that is language data for the input affordance, not display copy.
 * `components/project/ProjectIdentity.tsx`'s `STATUS_CLASS` keys are the contract's Chinese
 * `ProjectStatus` enum values; its values are CSS state classes, not copy, so there is nothing to
 * move into the zh catalog.
 */
const EXEMPT = [
  /renderer[\\/]lib[\\/]format\.ts$/,
  /renderer[\\/]messages[\\/]en[\\/]settings\.ts$/,
  /renderer[\\/]routes[\\/]Watches\.tsx$/,
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
        if (HALF_WIDTH_AFTER_HAN.test(line)) offenders.push(`${path}:${at + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('Core 写给用户的中文也不出现半角逗号、冒号、问号', () => {
    const offenders: string[] = []
    for (const path of sources(CORE)) {
      readFileSync(path, 'utf8').split('\n').forEach((line, at) => {
        if ((line.match(STRING_LITERALS) ?? []).some((literal) => HALF_WIDTH_AFTER_HAN.test(literal))) {
          offenders.push(`${path}:${at + 1}  ${line.trim()}`)
        }
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

type Node = Record<string, unknown>

/** Every text of a catalog by key path, a function's text written with each argument as X. */
const texts = (node: Node, prefix = ''): [string, string][] => Object.entries(node).flatMap(([key, value]) => {
  const path = prefix === '' ? key : `${prefix}.${key}`
  if (typeof value === 'object' && value !== null) return texts(value as Node, path)
  if (typeof value === 'function') return [[path, String((value as (...args: unknown[]) => unknown)('X', 'X', 'X', 'X'))]]
  return [[path, String(value)]]
})

/** What each zh key is on screen, read from messages/copy-classes.txt. */
const CLASSES = new Map(readFileSync(join(RENDERER, 'messages', 'copy-classes.txt'), 'utf8').split('\n')
  .filter((line) => line.trim() !== '' && !line.startsWith('#'))
  .map((line) => line.split(' ') as [string, string]))
const KINDS = ['label', 'action', 'state', 'failure', 'notice', 'consequence', 'tooltip', 'empty', 'placeholder', 'aria', 'content']

/** Counts a text's length the way it reads: each Chinese character and each Latin word is one unit; arguments do not count. */
const units = (text: string) => {
  const own = text.replace(/\b(X|NaN)\b/g, ' ')
  return (own.match(/[㐀-鿿]/g) ?? []).length + (own.replace(/[㐀-鿿]/g, ' ').match(/[A-Za-z]+/g) ?? []).length
}

/**
 * The rules no visible text may break (#504): a key named as a hint or a description; sentence
 * punctuation; a parenthetical; an instruction to the user; a busy sentence; more than 12 units.
 * Screen-reader names and content are exempt but for the name; a tooltip may hold a sentence.
 */
const RULES: { rule: string; test: (path: string, text: string) => boolean; exempt: string[] }[] = [
  {
    rule: 'name', exempt: [],
    test: (path) => /(?:^|[a-z])(Hint|Description|Help|Caption|Subtitle|Tooltip|Explanation)$|^(hint|description|help|caption|subtitle|tooltip|explanation)$/
      .test(path.split('.').at(-1)!),
  },
  { rule: 'punctuation', exempt: ['aria', 'content', 'tooltip'], test: (_, text) => /[。，；！]|.、|、./.test(text) },
  { rule: 'parenthetical', exempt: ['aria', 'content', 'tooltip'], test: (_, text) => /[（(]/.test(text) },
  {
    rule: 'instruction', exempt: ['aria', 'content'],
    test: (_, text) => /^(请(?!求)|输入(?![框、，]|$)|粘贴|拖动|点击|松开)|[，。]请|点击|（可|可选：/.test(text),
  },
  { rule: 'busy', exempt: ['aria', 'content'], test: (_, text) => /^正在|中…$/.test(text) },
  { rule: 'length', exempt: ['aria', 'content', 'tooltip'], test: (_, text) => units(text) > 12 },
]

describe('文案只说名字、动作、状态和失败', () => {
  const keys = texts(zh as unknown as Node)

  it('每个键都在分类表里，分类表只列还在的键，类别只有这几种', () => {
    const shown = new Set(keys.map(([path]) => path))
    expect({
      unclassified: keys.filter(([path]) => !CLASSES.has(path)).map(([path]) => path),
      gone: [...CLASSES.keys()].filter((path) => !shown.has(path)),
      unknownKinds: [...CLASSES].filter(([, kind]) => !KINDS.includes(kind)).map(([path, kind]) => `${path} ${kind}`),
    }).toEqual({ unclassified: [], gone: [], unknownKinds: [] })
  })

  it('没有一句提示：不像提示的键名，没有句读、括注、指令、正在…，不长于 12 个字', () => {
    const broken = keys.flatMap(([path, text]) => RULES
      .filter(({ exempt, test }) => !exempt.includes(CLASSES.get(path) ?? '') && test(path, text))
      .map(({ rule }) => `${path} ${rule}: ${text}`))
    expect(broken).toEqual([])
  })

  it('空的键只有共享的空值 — 和无结果，两种语言都是', () => {
    const empty = [...CLASSES].filter(([, kind]) => kind === 'empty').map(([path]) => path).sort()
    const of = (catalog: Node) => new Map(texts(catalog))
    expect([empty, empty.map((path) => of(zh as unknown as Node).get(path)), empty.map((path) => of(en as unknown as Node).get(path))])
      .toEqual([['common.empty', 'common.noResults'], ['—', '无结果'], ['—', 'No results']])
  })
})
