import type {
  GraphNode, ProjectControl, ProjectNextAction, Task,
} from './contract.js'

const TASK_PRIORITY = { p0: 0, p1: 1, p2: 2 } as const

type ActivePathNode = Pick<GraphNode, 'id' | 'label' | 'nextAction'>

function taskOf(tasks: readonly Task[], state: Task['state']): Task | undefined {
  return [...tasks]
    .filter((task) => task.state === state)
    .sort((a, b) => TASK_PRIORITY[a.priority] - TASK_PRIORITY[b.priority]
      || a.start.localeCompare(b.start)
      || a.end.localeCompare(b.end))[0]
}

function taskAction(task: Task): ProjectNextAction {
  return {
    source: 'task', text: task.title,
    task: {
      id: task.id, state: task.state, priority: task.priority,
      start: task.start, end: task.end,
      ...(task.window === undefined ? {} : { window: { ...task.window } }),
    },
  }
}

/**
 * Resolves the operational state shown by every project surface. The App-owned plan wins for
 * executable work; Lab contributes the active node's next action without mutating that plan.
 * A milestone is deliberately not an action, and a missing action remains visible instead of
 * silently reusing the project's broader goal.
 */
export function projectControlState(project: {
  tasks: readonly Task[]
  block?: string
  activePath?: readonly ActivePathNode[]
}): ProjectControl {
  const active = taskOf(project.tasks, 'act')
  const leaf = project.activePath?.at(-1)
  const research = leaf?.nextAction?.trim()
  const planned = taskOf(project.tasks, 'plan')

  const next: ProjectNextAction = active !== undefined
    ? taskAction(active)
    : research && leaf
      ? { source: 'research', text: research, node: { id: leaf.id, label: leaf.label } }
      : planned !== undefined
        ? taskAction(planned)
        : { source: 'missing', text: '需要定义任务' }

  const blocker = project.block?.trim()
  return {
    next,
    ...(blocker ? { blocker: { source: 'manual' as const, text: blocker } } : {}),
  }
}
