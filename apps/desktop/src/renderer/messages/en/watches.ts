import { formatNumber } from '../../lib/number.js'
import { pluralEn } from '../../lib/plural.js'
import { watches as zh } from '../zh/watches.js'

/** English counterpart of `zh/watches`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const watches = {
  add: (kind: string) => `Add ${kind.charAt(0).toLowerCase()}${kind.slice(1)}`,
  identityUnconfirmed: 'Unconfirmed',
  paused: 'Paused',
  resume: 'Resume',
  confirmRemove: (name: string) => `Remove “${name}”?`,
  confirmRemoveDescription: 'Its papers in the inbox go too',
  confirmRemoveLabel: 'Remove',
  authorNamePlaceholder: 'Author name',
  currentIdentity: (affiliations: string) => `Current identity: ${affiliations}`,
  noAffiliation: 'No affiliation on record',
  reconfirm: 'Verify again',
  authorSearchFailed: 'Author search failed',
  candidateInfo: (papers: number, citations: number, hIndex: number) =>
    `${formatNumber('en', papers)} ${pluralEn(papers, { one: 'paper', other: 'papers' })} · ${formatNumber('en', citations)} ${pluralEn(citations, { one: 'citation', other: 'citations' })} · h-index ${formatNumber('en', hIndex)}`,
  follow: 'Watch',
  choose: 'Choose',
  saveByName: 'Watch this name without verification',
  saveUnconfirmed: 'Save as unconfirmed author',
  suggestHeading: 'Find keywords and authors',
  sourceLabel: 'Suggestion source',
  sourceFocus: 'Describe a focus',
  sourceProject: 'Use a project',
  focusPlaceholder: 'Research direction',
  projectLabel: 'Project',
  suggestAction: 'Find suggestions',
  suggesting: 'Finding…',
  suggestionFailed: 'Watch suggestions failed',
  suggestionBasis: (n: number) => `Based on ${formatNumber('en', n)} relevant ${pluralEn(n, { one: 'paper', other: 'papers' })}`,
  suggestionStale: 'Offline · last suggestions',
  topicSuggestions: 'Keywords worth watching',
  authorSuggestions: 'Authors worth following',
  relatedPapers: (n: number) => n === 0
    ? 'From your project'
    : `${formatNumber('en', n)} relevant ${pluralEn(n, { one: 'paper', other: 'papers' })}`,
  suggestedAuthorInfo: (relevant: number, hIndex: number, citations: number) => (
    `${formatNumber('en', relevant)} relevant ${pluralEn(relevant, { one: 'paper', other: 'papers' })} · h-index ${formatNumber('en', hIndex)} · ${formatNumber('en', citations)} citations`
  ),
  addAction: 'Add',
  addAllTopics: 'Add all keywords',
  notices: {
    added: 'Watch added',
    updated: 'Watch updated',
    resumed: 'Resumed',
    pausedNote: 'Paused',
    removed: 'Watch removed',
  },
} satisfies typeof zh
