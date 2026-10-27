import { inbox as zh } from '../zh/inbox.js'

/** English counterpart of `zh/inbox`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const inbox = {
  streamLabel: { watch: 'Inmail', discovery: 'Recommended papers' },
  check: {
    checking: 'Checking for new papers…',
    failed: 'Check failed',
    noneNew: 'No new papers',
    lastChecked: 'Last checked',
  },
  checkNewPapers: 'Check for new papers',
  discovering: 'Discovering…',
  refreshDiscovery: 'Refresh discovery',
  sortLabel: 'Sort',
  sort: { recommended: 'Recommended', latest: 'Latest', published: 'Published', impact: 'Impact' },
  discoverySettings: 'Discovery settings',
  watchSettings: 'Watch settings',
  empty: {
    openProjects: 'Open project list',
  },
  dismissAll: 'Dismiss all',
  actions: {
    known: 'Already familiar',
    download: 'Download and add to library',
    readLater: 'Read later',
    dismiss: 'Dismiss',
  },
  notices: {
    dismissedAll: 'All dismissed',
    dismissed: 'Dismissed',
    duplicateToast: 'Already in the library',
    downloaded: 'Added to library',
    downloadFailed: 'Download failed',
    known: 'Marked as familiar',
  },
} satisfies typeof zh
