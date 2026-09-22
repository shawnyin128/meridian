/** Returns a stable filename slug made from a title's letters and digits. */
export const slugOf = (title: string): string =>
  title.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase()
