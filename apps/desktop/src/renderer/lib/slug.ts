import { slugOf } from '../../shared/slug.js'

export { slugOf } from '../../shared/slug.js'

/**
 * The stable key for `label`: its slug, with `-2`, `-3`… appended until it collides with nothing in
 * `taken`; a label without any letter or digit gets the base `col`.
 */
export function nextKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugOf(label) || 'col'
  let key = base
  for (let n = 2; used.has(key); n += 1) key = `${base}-${n}`
  return key
}

/** The slug of `text` kept to `a-z`, `0-9` and `-` and cut to 40 characters; empty when it has none of them. */
const asciiSlugOf = (text: string): string => slugOf(text).replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-')
  .replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '')

/**
 * A claim id for `text` that no id in `taken` uses (write protocol §7.1): the slug of the text kept to
 * `a-z`, `0-9` and `-`, cut to 40 characters, then `-2`, `-3`… on a collision; `c1`, `c2`… when the
 * text has no such character.
 */
export function claimId(text: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = asciiSlugOf(text)
  if (base === '') {
    let n = 1
    while (used.has(`c${n}`)) n += 1
    return `c${n}`
  }
  let id = base
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
  return id
}

/**
 * The id, and file name, of a new colour theme named `name` that no id in `taken` uses: the slug of
 * the name kept to `a-z`, `0-9` and `-`, cut to 40 characters, or `theme` when the name has no such
 * character, then `-2`, `-3`… on a collision.
 */
export function colourThemeId(name: string, taken: Iterable<string>): string {
  return nextKey(asciiSlugOf(name) || 'theme', taken)
}
