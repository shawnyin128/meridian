import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { WikiAggregationRecord, WikiData, WikiKindRecord, WikiPaperRecord } from './model.js'

/** schema.yaml shape: kinds, sections, and anchor configuration. */
type Schema = {
  kinds: Record<string, WikiKindRecord>
  sections: { key: string; label: string }[]
  anchor: { require_quote: boolean }
}

/**
 * Reads one page as the record the wiki model holds: its frontmatter parsed
 * as YAML with the `kind` key dropped, and its body — the lines after the last
 * `<!-- /generated -->`, or after the closing `---` when the page has no
 * generated region — with CRs stripped and whitespace at either end dropped.
 * Throws if the page has no closed frontmatter, or `kind` is given and the
 * page's frontmatter names a different one.
 */
export function readWikiPage(file: string, kind: string | null): WikiPaperRecord | WikiAggregationRecord {
  const bare = readFileSync(file, 'utf8').split('\n').map((row) => (row.endsWith('\r') ? row.slice(0, -1) : row))
  const close = bare.indexOf('---', 1)
  if (bare[0] !== '---' || close < 0) throw new Error(`页面没有收口的 frontmatter:${file}`)
  const fm = (parse(bare.slice(1, close).join('\n')) ?? {}) as Record<string, unknown>
  if (kind !== null && fm['kind'] !== kind) throw new Error(`${file} 的 kind 是 ${String(fm['kind'])},不是 ${kind}`)
  const rest = { ...fm }
  delete rest['kind']
  const last = bare.lastIndexOf('<!-- /generated -->')
  const body = bare.slice((last < 0 ? close : last) + 1).join('\n').trim()
  return kind === null
    ? { kind: 'paper', fm: rest as WikiPaperRecord['fm'], body }
    : { kind, fm: rest as WikiAggregationRecord['fm'], body }
}

/**
 * Reads the aggregation layout under `wikiDir`: `schema.yaml`, every paper
 * page under `papers/`, and every page under each kind's directory, in file
 * name order. Throws if there is no `schema.yaml`, naming that file, or if a
 * page cannot be read.
 */
export function readWikiData(wikiDir: string): WikiData {
  const schemaFile = join(wikiDir, 'schema.yaml')
  if (!existsSync(schemaFile)) throw new Error(`库里没有 Wiki 结构文件:${schemaFile}`)
  const schema = parse(readFileSync(schemaFile, 'utf8')) as Schema
  const pages: WikiData['pages'] = {}
  const scan = (dir: string, kind: string | null): void => {
    const full = join(wikiDir, dir)
    if (!existsSync(full)) return
    for (const name of readdirSync(full).filter((n) => n.endsWith('.md')).sort()) {
      const id = `${dir}/${name.slice(0, -'.md'.length)}`
      try {
        pages[id] = readWikiPage(join(full, name), kind)
      } catch (err) {
        throw new Error(`${id}:${err instanceof Error ? err.message : String(err)}`, { cause: err })
      }
    }
  }
  scan('papers', null)
  for (const [kind, spec] of Object.entries(schema.kinds)) scan(spec.dir, kind)
  return {
    requireQuote: schema.anchor.require_quote,
    kinds: schema.kinds,
    sections: schema.sections,
    pages,
  }
}
