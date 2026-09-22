import { later as zh } from '../zh/later.js'

/** English counterpart of `zh/later`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const later = {
  title: (count: number) => `Read Later · ${count}`,
  empty: 'Nothing saved for later.',
  groupBy: 'Group by',
  modes: { time: 'Date added', src: 'Source' },
  actions: {
    downloading: 'Downloading from arXiv…',
    removeFrom: 'Remove from Read Later',
  },
  removed: (title: string) => `Removed “${title}” from Read Later`,
} satisfies typeof zh
