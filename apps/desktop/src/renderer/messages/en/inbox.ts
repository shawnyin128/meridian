import { pluralEn } from '../../lib/plural.js'
import { inbox as zh } from '../zh/inbox.js'

/** English counterpart of `zh/inbox`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const inbox = {
  streamLabel: { watch: 'Inmail', discovery: 'Recommended papers' },
  headAll: (streamLabel: string, count: number) => `${streamLabel} · ${count}`,
  headWatch: (label: string, count: number) => `${label} · ${count} ${pluralEn(count, { one: 'paper', other: 'papers' })}`,
  check: {
    checking: 'Checking for new papers…',
    failed: (reason: string) => `Check failed: ${reason}`,
    lastChecked: (when: string) => `Last checked ${when}`,
  },
  checkNewPapers: 'Check for new papers',
  discovering: 'Discovering…',
  refreshDiscovery: 'Refresh discovery',
  sortLabel: 'Sort',
  sort: { recommended: 'Recommended', latest: 'Latest', published: 'Published', impact: 'Impact' },
  discoverySettings: 'Discovery settings',
  watchSettings: 'Watch settings',
  discoverySummary: (projects: number, intents: number) =>
    `${projects} ${pluralEn(projects, { one: 'project', other: 'projects' })} · ${intents} active research ${pluralEn(intents, { one: 'direction', other: 'directions' })}`,
  empty: {
    discoveryNone: 'No new discoveries yet.',
    discoveryNoSeeds: 'Link an arXiv paper to a project to get recommendations.',
    watch: 'No new papers from your watches.',
  },
  dismissAll: 'Dismiss all',
  actions: {
    more: 'More like this',
    less: 'Less like this',
    known: 'Already familiar',
    download: 'Download and add to library',
    readLater: 'Read later',
    dismiss: 'Dismiss',
    open: 'Open',
  },
  notices: {
    queued: 'Saved for later',
    alreadyQueued: 'Already saved for later',
    dismissedAll: 'All dismissed · can be restored from trash',
    dismissed: 'Dismissed · can be restored from trash',
    duplicateToast: 'Already in the library · not added again',
    alreadyInLibrary: (title: string) => `Already in the library: "${title}"`,
    downloaded: 'Downloaded and added to library · ready to read',
    moreLike: 'Got it · showing you more papers like this',
    lessLike: 'Got it · showing you fewer papers like this',
    known: 'Marked as familiar',
  },
} satisfies typeof zh
