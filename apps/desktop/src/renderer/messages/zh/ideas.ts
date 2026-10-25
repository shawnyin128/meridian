/** ideas screen copy. */
export const ideas = {
  title: '想法',
  groups: {
    open: '未开始',
    active: '进行中',
    done: '已完成',
  },
  sort: '排序',
  sortUpdated: '按更新时间',
  create: '新建想法',
  byProject: { heading: '各项目的想法', ideas: '想法', active: '进行中', done: '已完成' },
  sourceKind: { chat: '对话', paperReading: '论文阅读' },
  link: {
    unavailable: '关联项目不可用',
    project: (name: string) => `项目 · ${name}`,
    originalUnavailable: '原关联项目当前不可用',
  },
  relation: { rows: { projects: '项目', pages: 'Wiki' }, candidate: '来源', page: (title: string) => `Wiki · ${title}` },
  work: {
    heading: '所在项目',
    none: '未放进项目',
    selectAriaLabel: (title: string) => `所在项目：${title}`,
  },
  candidate: { dismiss: '忽略' },
  manage: (title: string) => `管理想法：${title}`,
  updated: (date: string) => `${date} 更新`,
  detailHeading: '想法详情',
  bodyLabel: '想法',
  promote: {
    action: '转为项目',
    openProject: '打开项目',
  },
  openSourceChat: '打开来源对话',
  sourceChatDeleted: '对话已删除',
  editor: {
    sourceLabel: (source: string) => `来源：${source}`,
    titleLabel: '标题',
    titlePlaceholder: '标题',
    bodyPlaceholder: '想法',
  },
  nodeDraft: {
    nodeTitleLabel: '节点标题',
    afterLabel: '接在哪个节点后',
    newRootOption: '作为新的根节点',
  },
} satisfies Record<string, unknown>
