/** research screen copy. */
export const research = {
  overview: {
    title: '总览',
    timelineHeading: '时间线 · 项目',
    statsHeading: '概况',
    stats: {
      active: '进行中',
      shelved: '搁置',
      openMilestones: '待完成里程碑',
      recentProgress: '近 7 天科研记录',
    },
    decisions: '需要注意',
    progressHeading: '项目推进',
    activePathNote: (taskText: string | undefined) =>
      `当前科研路径${taskText === undefined ? '' : ` · 任务 ${taskText}`}`,
    /** Suffix after the first in-progress node's label when several nodes are active at once. */
    activeNodesMore: (n: number) => `等 ${n} 个`,
    focusWithActiveTasks: (label: string, n: number) => `${label} · ${n} 条进行中任务`,
    recentHeading: '最近科研记录',
    upcomingHeading: '接下来的里程碑',
    historyProjects: '历史项目',
    milestonePopTitle: (isNew: boolean): string => (isNew ? '添加里程碑' : '里程碑'),
    newMilestoneOn: (date: string) => `添加里程碑 · ${date}`,
  },
  list: {
    title: '项目',
    create: '新建项目',
    sort: '排序',
    sortPriority: '按优先级',
    sortMilestone: '按下一个里程碑',
    renameTitle: '重命名项目',
    rename: '重命名',
    createdFeedNote: (name: string) => `新项目《${name}》已创建`,
  },
  panel: {
    milestoneOn: (date: string) => `里程碑 ${date}`,
    dueToday: '今天',
    dueInDays: (n: number) => `${n} 天后`,
    recentProgressLabel: '最近推进',
    staleAlert: (n: number) => `已 ${n} 天无推进`,
  },
  chips: {
    addProject: '关联项目',
    pickerHeading: '项目',
    unlinked: '已移除关联',
  },
  schedule: {
    startLabel: '开始',
    endLabel: '结束',
    modeLabel: '档期方式',
    startSlot: '开始时段',
    endSlot: '结束时段',
  },
} satisfies Record<string, unknown>
