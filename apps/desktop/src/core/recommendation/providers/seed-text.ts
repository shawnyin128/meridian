/** Words that never start or end a key phrase and carry no topic in similarity. */
const STOP_WORDS = new Set([
  'a', 'about', 'achieve', 'achieves', 'across', 'all', 'also', 'an', 'and', 'any', 'approach', 'approaches',
  'are', 'as', 'at', 'based', 'be', 'been', 'being', 'both', 'but', 'by', 'can', 'compared', 'data', 'demonstrate',
  'different', 'do', 'does', 'each', 'effective', 'efficient', 'existing', 'first', 'for', 'from', 'further',
  'has', 'have', 'high', 'how', 'however', 'i', 'improve', 'improves', 'in', 'into', 'introduce', 'is', 'it',
  'its', 'large', 'language', 'less', 'like', 'many', 'method', 'methods', 'model', 'models', 'more', 'most',
  'much', 'new', 'not', 'novel', 'of', 'on', 'one', 'only', 'or', 'other', 'our', 'over', 'paper', 'performance',
  'present', 'propose', 'proposed', 'results', 'show', 'shows', 'significantly', 'simple', 'such', 'than',
  'that', 'the', 'their', 'them', 'these', 'this', 'those', 'through', 'to', 'two', 'up', 'use', 'used',
  'using', 'via', 'we', 'well', 'when', 'where', 'which', 'while', 'with', 'without', 'work', 'yet',
])

/** Words allowed inside a phrase though never at its ends, as in "mixture of experts". */
const JOINERS = new Set(['of'])

const tokens = (value: string): string[] => (
  value.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []
)

/** Topic words for similarity: tokens that are neither stop words, numbers nor single letters. */
export const topicWords = (value: string): string[] => tokens(value).filter((word) => (
  word.length > 2 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)
))

/**
 * The phrases that best say what the seeds are about, for use as search queries. Phrases of one to
 * three words never cross punctuation; titles count twice, and a phrase several seeds share outranks
 * one only a single seed repeats. Multi-word phrases come first; a single word only fills the
 * remaining slots, and only when it appears in a seed title, since lone abstract words are rarely a
 * topic. Phrases with a digit, such as model sizes, are never chosen. A shorter phrase inside a chosen
 * longer one is not chosen again.
 */
export function keyPhrases(seeds: readonly { title: string; abstract: string }[], limit: number): string[] {
  const scores = new Map<string, { seeds: Set<number>; count: number }>()
  seeds.forEach((seed, at) => {
    const text = `${seed.title}. ${seed.title}. ${seed.abstract}`
    for (const segment of text.split(/[.;:,!?()[\]{}"“”]|\s[-–—]\s/)) {
      const words = tokens(segment)
      for (let start = 0; start < words.length; start += 1) {
        for (let size = 1; size <= 3 && start + size <= words.length; size += 1) {
          const run = words.slice(start, start + size)
          const ends = [run[0]!, run.at(-1)!]
          if (ends.some((word) => STOP_WORDS.has(word) || JOINERS.has(word) || word.length < 3 || /^\d+$/.test(word))) continue
          if (run.slice(1, -1).some((word) => STOP_WORDS.has(word) && !JOINERS.has(word))) continue
          if (new Set(run).size < run.length || run.some((word) => /\d/.test(word))) continue
          const phrase = run.join(' ')
          const held = scores.get(phrase) ?? { seeds: new Set<number>(), count: 0 }
          held.seeds.add(at)
          held.count += 1
          scores.set(phrase, held)
        }
      }
    }
  })
  const ranked = [...scores.entries()].map(([phrase, held]) => ({
    phrase,
    score: held.seeds.size * 2 + Math.min(held.count, 6) * (1 + (phrase.split(' ').length - 1) * 0.6),
  })).filter((item) => scores.get(item.phrase)!.count >= 2).sort((left, right) => (
    right.score - left.score || right.phrase.length - left.phrase.length || left.phrase.localeCompare(right.phrase)
  ))
  const titleWords = new Set(seeds.flatMap((seed) => tokens(seed.title)))
  const multiWord = ranked.filter((item) => item.phrase.includes(' '))
  const singleWord = ranked.filter((item) => !item.phrase.includes(' ') && titleWords.has(item.phrase))
  const chosen: string[] = []
  for (const { phrase } of [...multiWord, ...singleWord]) {
    if (chosen.some((held) => ` ${held} `.includes(` ${phrase} `) || ` ${phrase} `.includes(` ${held} `))) continue
    chosen.push(phrase)
    if (chosen.length === limit) break
  }
  return chosen
}

type Vector = Map<string, number>

/**
 * How close each candidate's title and abstract are to the nearest seed: TF-IDF cosine similarity,
 * with document frequencies taken over the seeds and candidates together. Returns one score in
 * [0, 1] per candidate, in order.
 */
export function seedSimilarity(
  seeds: readonly { title: string; abstract: string }[],
  candidates: readonly { title: string; abstract: string }[],
): number[] {
  const seedWords = seeds.map((seed) => topicWords(`${seed.title} ${seed.title} ${seed.abstract}`))
  const candidateWords = candidates.map((paper) => topicWords(`${paper.title} ${paper.abstract}`))
  const documents = [...seedWords, ...candidateWords]
  const frequency = new Map<string, number>()
  for (const words of documents) for (const word of new Set(words)) frequency.set(word, (frequency.get(word) ?? 0) + 1)
  const vector = (words: string[]): Vector => {
    const counts = new Map<string, number>()
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
    const weights: Vector = new Map()
    let norm = 0
    for (const [word, count] of counts) {
      const weight = (1 + Math.log(count)) * Math.log((documents.length + 1) / (frequency.get(word)! + 1))
      weights.set(word, weight)
      norm += weight * weight
    }
    norm = Math.sqrt(norm) || 1
    for (const [word, weight] of weights) weights.set(word, weight / norm)
    return weights
  }
  const seedVectors = seedWords.map(vector)
  return candidateWords.map((words) => {
    const candidate = vector(words)
    return Math.max(0, ...seedVectors.map((seed) => {
      let dot = 0
      for (const [word, weight] of candidate) dot += weight * (seed.get(word) ?? 0)
      return dot
    }))
  })
}
