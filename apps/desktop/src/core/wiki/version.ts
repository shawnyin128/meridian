import { createHash } from 'node:crypto'
import type { PageVersion } from '../../shared/contract.js'
import type { Json } from '../vault/frontmatter.js'
import { emitKey } from '../vault/frontmatter.js'
import type { WikiAggregationRecord, WikiPaperRecord } from './model.js'
import { isPaper } from './model.js'

/** First 16 hex characters of the SHA-256 of the UTF-8 text. */
const fingerprint = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)

/**
 * Returns the version of the page whose file holds `text` (write protocol §3.2), null for a page that does
 * not exist. With `\r\n` read as `\n`: `fm` fingerprints the lines between the opening `---` and the
 * closing one, minus top-level `updated:` lines; `body` fingerprints the lines after the closing `---`,
 * each run from a `<!-- generated:NAME -->` line through the next `<!-- /generated -->` line (or the end,
 * when none follows) removed, then trimmed. A page without a closed frontmatter has an empty `fm` and all its lines as the body.
 */
export function pageVersion(text: string | null): PageVersion | null {
  if (text === null) return null
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  const fm = close < 0 ? [] : lines.slice(1, close).filter((line) => !line.startsWith('updated:'))
  const body: string[] = []
  let open = false
  for (const line of lines.slice(close + 1)) {
    if (!open && /^<!-- generated:\S+ -->$/.test(line)) open = true
    else if (open && line === '<!-- /generated -->') open = false
    else if (!open) body.push(line)
  }
  return { fm: fingerprint(fm.join('\n')), body: fingerprint(body.join('\n').trim()) }
}

/**
 * Returns the text a page record stands for when it has no file: the frontmatter fences around `kind`
 * (aggregations only) and every frontmatter key in record order the way emitKey writes it, keys whose
 * value is null or absent left out, then the body. Its pageVersion is the fixture store's page version.
 */
export function recordText(page: WikiPaperRecord | WikiAggregationRecord): string {
  const keys = Object.entries(page.fm).filter(([, value]) => value !== undefined && value !== null) as [string, Json][]
  return [
    '---',
    ...(isPaper(page) ? [] : emitKey('kind', page.kind, '')),
    ...keys.flatMap(([key, value]) => emitKey(key, value, '')),
    '---',
    page.body,
  ].join('\n')
}
