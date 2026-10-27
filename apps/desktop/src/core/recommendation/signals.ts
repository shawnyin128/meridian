const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'based', 'by', 'for', 'from', 'in', 'is', 'it',
  'its', 'language', 'large', 'model', 'models', 'of', 'on', 'paper', 'the', 'to',
  'using', 'via', 'with',
])

const words = (value: string): string[] => (
  value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
).filter((word) => word.length > 1 && !STOP_WORDS.has(word))

/**
 * The terms of `wikiTerms`, in order, that the paper's title or abstract contains, as a phrase or as
 * every one of the term's words; at most three.
 */
export function matchingWikiTerms(paper: { title: string; abstract: string }, wikiTerms: readonly string[]): string[] {
  const body = `${paper.title}\n${paper.abstract}`.toLocaleLowerCase()
  const bodyWords = new Set(words(body))
  return wikiTerms.filter((term) => {
    const normalized = term.trim().toLocaleLowerCase()
    if (normalized === '') return false
    if (body.includes(normalized)) return true
    const termWords = words(normalized)
    return termWords.length > 0 && termWords.every((word) => bodyWords.has(word))
  }).slice(0, 3)
}
