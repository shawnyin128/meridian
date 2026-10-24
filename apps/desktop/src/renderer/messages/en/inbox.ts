import { pluralEn } from '../../lib/plural.js'
import { inbox as zh } from '../zh/inbox.js'

/** English counterpart of `zh/inbox`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const inbox = {
  streamLabel: { watch: 'Inmail', discovery: 'Recommended papers' },
  headAll: (streamLabel: string, count: number) => `${streamLabel} · ${count}`,
  headWatch: (label: string, count: number) => `${label} · ${count}`,
  check: {
    checking: 'Checking for new papers…',
    failed: 'Check failed',
    lastChecked: 'Last checked',
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
    discoveryNone: 'No new discoveries yet',
    discoveryNoSeeds: 'No project papers with an arXiv ID yet',
    openProjects: 'Open project list',
    watch: 'No new papers yet',
  },
  dismissAll: 'Dismiss all',
  actions: {
    more: 'More like this',
    less: 'Less like this',
    known: 'Already familiar',
    download: 'Download and add to library',
    readLater: 'Read later',
    dismiss: 'Dismiss',
  },
  notices: {
    queued: 'Saved for later',
    alreadyQueued: 'Already saved for later',
    dismissedAll: 'All dismissed',
    dismissed: 'Dismissed',
    duplicateToast: 'Already in the library',
    downloaded: 'Added to library',
    downloadFailed: 'Download failed',
    remembered: 'Got it',
    known: 'Marked as familiar',
  },
} satisfies typeof zh
