import { reader as zh } from '../zh/reader.js'

/** English counterpart of `zh/reader`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const reader = {
  rail: {
    label: 'Paper tools',
    tabs: {
      metadata: 'Metadata',
      highlights: 'Highlights',
      notes: 'Reading notes',
      remark: 'Thoughts',
      wiki: 'Add to Wiki',
    },
  },
  page: {
    at: (n: number) => `Page ${n}`,
  },
  emptyReading: 'Highlight a passage or add a note about this page.',
  notes: {
    ariaLabel: 'Reading notes',
    heading: (count: number) => `Reading notes · ${count}`,
    newAria: 'New note',
    placeholder: (page: number) => `Add a note about page ${page}…`,
    add: 'Save note',
    pageAria: (page: number) => `Page ${page} note`,
  },
  highlights: {
    jumpToPage: (page: number) => `Go to highlight on page ${page}`,
    noteAria: (page: number) => `Page ${page} highlight note`,
    annotate: 'Note for this highlight',
  },
  remark: {
    heading: 'Thoughts on this paper',
    placeholder: 'Write your overall thoughts on this paper…',
    save: 'Save thoughts',
  },
  loadingPdf: 'Loading PDF…',
  selection: {
    highlight: 'Highlight',
    note: 'Note',
    askAi: 'Ask AI',
  },
  zoom: {
    out: 'Zoom out',
    in: 'Zoom in',
  },
} satisfies typeof zh
