/**
 * The count after a heading's text, ` · N` in the heading's own type; nothing without a count. The
 * heading components render it through their `count`.
 */
export function HeadingCount({ count }: { count: number | undefined }) {
  return count === undefined ? null : <span className="heading-count"> · {count}</span>
}

/** A heading's whole text with its count, as `HeadingCount` shows it, for a tooltip or a name. */
export const headingText = (text: string, count: number | undefined): string =>
  count === undefined ? text : `${text} · ${count}`
