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
  emptyReading: '选中文字可以高亮，也可以直接记录当前页的想法。',
  notes: {
    ariaLabel: '阅读笔记',
    heading: (count: number) => `阅读笔记 · ${count}`,
    newAria: '新笔记',
    placeholder: (page: number) => `第 ${page} 页的笔记`,
    add: '保存笔记',
    pageAria: (page: number) => `第 ${page} 页笔记`,
  },
  highlights: {
    jumpToPage: (page: number) => `第 ${page} 页 · 高亮`,
    noteAria: (page: number) => `第 ${page} 页高亮笔记`,
    annotate: '这段高亮的笔记',
  },
  remark: {
    heading: '随笔 · 本篇',
    placeholder: '对整篇论文的随想',
    save: '存随笔',
  },
  loadingPdf: '正在加载 PDF…',
  selection: {
    highlight: '高亮',
    note: '笔记',
    askAi: '问 AI',
  },
  zoom: {
    out: '缩小',
    in: '放大',
  },
} satisfies Record<string, unknown>
