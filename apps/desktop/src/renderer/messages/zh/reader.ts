/** Reader rail, notes, remark and zoom copy. */
export const reader = {
  rail: {
    label: '论文工具',
    tabs: {
      metadata: '元数据',
      highlights: '高亮与批注',
      notes: '阅读笔记',
      remark: '随笔',
      wiki: '内化到 Wiki',
    },
  },
  page: {
    at: (n: number) => `第 ${n} 页`,
  },
  emptyReading: '还没有高亮和笔记',
  emptyHighlights: '还没有高亮',
  emptyNotes: '还没有笔记',
  notes: {
    ariaLabel: '阅读笔记',
    heading: (count: number) => `阅读笔记 · ${count}`,
    newAria: '新笔记',
    placeholder: (page: number) => `第 ${page} 页的笔记`,
    add: '保存笔记',
    pageAria: (page: number) => `第 ${page} 页笔记`,
  },
  highlights: {
    noteAria: (page: number) => `第 ${page} 页高亮笔记`,
    annotate: '这段高亮的笔记',
  },
  remark: {
    heading: '随笔 · 本篇',
    placeholder: '对整篇论文的随想',
  },
  selection: {
    highlight: '高亮',
    note: '笔记',
    askAi: '问 AI',
  },
  zoom: {
    out: '缩小',
    in: '放大',
    reset: '重置缩放',
  },
} satisfies Record<string, unknown>
