import { slugOf } from '../../shared/slug.js'

export { slugOf } from '../../shared/slug.js'

/**
 * The stable key corresponding to `label`: the slug of the label, if it collides with the slug in `taken`, try `-2`, `-3`... until there is no collision;
 * Tags without any alphanumeric characters start with `col`.
 */
export function nextKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugOf(label) || 'col'
  let key = base
  for (let n = 2; used.has(key); n += 1) key = `${base}-${n}`
  return key
}

/**
 * A claim id for `text` that no id in `taken` uses (write protocol §7.1): the slug of the text kept to
 * `a-z`, `0-9` and `-`, cut to 40 characters, then `-2`, `-3`… on a collision; `c1`, `c2`… when the
 * text has no such character.
 */
export function claimId(text: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugOf(text).replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40).replace(/-$/, '')
  if (base === '') {
    let n = 1
    while (used.has(`c${n}`)) n += 1
    return `c${n}`
  }
  let id = base
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
  return id
}
