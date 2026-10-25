import { later as zh } from '../zh/later.js'

/** English counterpart of `zh/later`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const later = {
  title: 'Read Later',
  empty: 'No papers saved for later yet',
  groupBy: 'Group by',
  modes: { time: 'Date added', src: 'Source' },
  actions: {
    removeFrom: 'Remove from Read Later',
  },
  removed: (title: string) => `Removed “${title}” from Read Later`,
} satisfies typeof zh
