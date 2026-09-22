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
