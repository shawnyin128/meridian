/**
 * The part before the colon in the title of the paper. The browser header, `@` drop-down and wiki article base share this rule.
 * The subtitle after the colon does not appear in these places. If there is no colon in the title, it is the entire title.
 */
export const shortTitle = (title: string) => title.split(':')[0]!

/** If the user has set a short title, it will be used first; if not, the existing fallback rules before the colon will be retained. */
export const paperShortTitle = (paper: { title: string; shortTitle?: string | undefined }): string =>
  paper.shortTitle?.trim() || shortTitle(paper.title)
