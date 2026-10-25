import { later as zh } from '../zh/later.js'

/** English counterpart of `zh/later`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const later = {
  title: 'Read later',
  groupBy: 'Group by',
  modes: { time: 'Date added', src: 'Source' },
  actions: {
    removeFrom: 'Remove from read later',
  },
  removed: (title: string) => `Removed “${title}” from read later`,
} satisfies typeof zh
