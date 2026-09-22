import { feed as zh } from '../zh/feed.js'

/** English counterpart of `zh/feed`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const feed = {
  title: 'Feed',
  sourceFieldLabel: 'Source',
  filters: { all: 'All' },
  sources: { steward: 'Meridian', me: 'Me', lab: 'Lab', inbox: 'Inbox' },
} satisfies typeof zh
