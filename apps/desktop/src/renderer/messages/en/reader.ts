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
  emptyReading: 'No highlights or notes yet',
  emptyHighlights: 'No highlights yet',
  emptyNotes: 'No notes yet',
  notes: {
    ariaLabel: 'Reading notes',
    heading: (count: number) => `Reading notes · ${count}`,
    newAria: 'New note',
    placeholder: (page: number) => `Add a note about page ${page}…`,
    pageAria: (page: number) => `Page ${page} note`,
  },
  highlights: {
    noteAria: (page: number) => `Page ${page} highlight annotation`,
    annotate: 'Annotation for this highlight',
  },
  remark: {
    heading: 'Thoughts on this paper',
    placeholder: 'Write your overall thoughts on this paper…',
  },
  selection: {
    highlight: 'Highlight',
    note: 'Annotate',
    askAi: 'Ask AI',
  },
  zoom: {
    out: 'Zoom out',
    in: 'Zoom in',
    reset: 'Reset zoom',
  },
} satisfies typeof zh
