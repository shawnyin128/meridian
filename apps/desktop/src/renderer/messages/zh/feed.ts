/** Feed screen copy. */
export const feed = {
  title: '动态',
  sourceFieldLabel: '来源',
  filters: { all: '全部' },
  sources: { steward: 'Meridian', me: '我', lab: '实验', inbox: '收件' },
  empty: '还没有动态',
  firstRun: {
    heading: '开始使用',
    steps: { library: '选择论文库', model: '设置模型', plugin: '安装 agent 插件', paper: '导入第一篇论文' },
    dismiss: '隐藏',
  },
} satisfies Record<string, unknown>
