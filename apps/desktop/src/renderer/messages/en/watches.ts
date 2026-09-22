import { pluralEn } from '../../lib/plural.js'
import { watches as zh } from '../zh/watches.js'

/** English counterpart of `zh/watches`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const watches = {
  add: (kind: string) => `Add ${kind.charAt(0).toLowerCase()}${kind.slice(1)}`,
  empty: (kind: string) => `No ${kind.charAt(0).toLowerCase()}${kind.slice(1)} added yet.`,
  identityUnknown: 'Author not verified',
  identityUnconfirmed: 'Unconfirmed',
  paused: 'Paused',
  pause: 'Pause',
  resume: 'Resume',
  confirmRemove: (name: string) => `Remove “${name}”? New papers from this watch will be removed from the inbox. This cannot be undone.`,
  confirmRemoveLabel: 'Remove',
  authorNamePlaceholder: 'Author name',
  currentIdentity: (affiliations: string) => `Current identity: ${affiliations}`,
  noAffiliation: 'No affiliation on record',
  reconfirm: 'Verify again',
  searching: 'Looking for authors with this name…',
  noMatches: 'No confirmable authors found.',
  candidateInfo: (papers: number, citations: number, hIndex: number) =>
    `${papers} ${pluralEn(papers, { one: 'paper', other: 'papers' })} · ${citations} ${pluralEn(citations, { one: 'citation', other: 'citations' })} · h-index ${hIndex}`,
  follow: 'Watch',
  choose: 'Choose',
  saveByName: 'Watch this name without verification',
  saveUnconfirmed: 'Save as unconfirmed author',
  suggestHeading: 'Find topics and authors',
  sourceLabel: 'Suggestion source',
  sourceFocus: 'Describe a focus',
  sourceProject: 'Use a project',
  focusPlaceholder: 'What research do you want to keep up with?',
  projectLabel: 'Project used for suggestions',
  noProjects: 'No projects available',
  suggestAction: 'Find suggestions',
  suggesting: 'Finding…',
  allAdded: 'All suggestions added.',
  noneSuggested: 'No new topics or authors found. Try a more specific focus.',
  suggestionBasis: (n: number) => `Based on ${n} relevant ${pluralEn(n, { one: 'paper', other: 'papers' })}`,
  topicSuggestions: 'Topics worth watching',
  authorSuggestions: 'Authors worth following',
  relatedPapers: (n: number) => n === 0
    ? 'From your project'
    : `${n} relevant ${pluralEn(n, { one: 'paper', other: 'papers' })}`,
  suggestedAuthorInfo: (relevant: number, hIndex: number, citations: number) => (
    `${relevant} relevant ${pluralEn(relevant, { one: 'paper', other: 'papers' })} · h-index ${hIndex} · ${citations.toLocaleString('en-US')} citations`
  ),
  addAction: 'Add',
  addAllTopics: 'Add all topics',
  notices: {
    added: 'Watch added · matching papers will appear in the inbox',
    updated: 'Watch updated · existing papers are unchanged and future checks use the new criteria',
    resumed: 'Resumed · matching papers will appear in the inbox again',
    pausedNote: 'Paused · no new papers will be delivered and existing papers are unchanged',
    removed: 'Watch removed · papers already in the library are kept',
  },
} satisfies typeof zh
