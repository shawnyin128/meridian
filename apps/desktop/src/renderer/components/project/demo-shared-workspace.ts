import type { ProjectDetail, RecordEvent, ResearchGraph } from '../../../shared/contract.js'

/**
 * Demo only: two projects sharing one repository, until Core reads several projects per workspace.
 * The shoot script stores the scenario under STORE_KEY: the repository's folder name, the project
 * already in it, the project bound to it second, and that second project's own graph and records.
 */
type SharedWorkspaceDemo = {
  leaf: string
  first: string
  second: string
  graph: ResearchGraph
  events: RecordEvent[]
}

const STORE_KEY = 'meridian.demo.sharedWorkspace'

/** Demo only: the root the second project was bound to in this session, or null. */
let secondRoot: string | null = null

const scenario = (): SharedWorkspaceDemo | null => {
  const stored = window.localStorage.getItem(STORE_KEY)
  return stored === null ? null : JSON.parse(stored) as SharedWorkspaceDemo
}

const inSharedRepo = (demo: SharedWorkspaceDemo, path: string): boolean =>
  path.trim().replace(/[\\/]+$/, '').endsWith(`/${demo.leaf}`)

/** Demo only: the names of the projects the folder at `path` already holds, as project `name` binds it. */
export function demoProjectsAt(path: string, name: string): string[] {
  const demo = scenario()
  if (demo === null || !inSharedRepo(demo, path)) return []
  return [demo.first, ...(secondRoot === null ? [] : [demo.second])].filter((held) => held !== name)
}

/** Demo only: whether binding project `name` to `path` is the demo's second binding; records it when it is. */
export function demoBind(name: string, path: string): boolean {
  const demo = scenario()
  if (demo === null || name !== demo.second || !inSharedRepo(demo, path)) return false
  secondRoot = path.trim()
  return true
}

/** Demo only: the other projects sharing project `name`'s workspace. */
export function demoSiblings(name: string): string[] {
  const demo = scenario()
  if (demo === null || secondRoot === null) return []
  if (name === demo.first) return [demo.second]
  if (name === demo.second) return [demo.first]
  return []
}

/** Demo only: `project` with the second project's own workspace records once the demo bound it. */
export function demoProject(project: ProjectDetail | null): ProjectDetail | null {
  const demo = scenario()
  if (project === null || demo === null || project.name !== demo.second || secondRoot === null) return project
  return {
    ...project,
    workspace: {
      kind: 'local', root: secondRoot, state: 'ready',
      planPath: `${secondRoot}/.meridian/projects/${project.id}/control/plan.json`,
      graph: demo.graph, events: demo.events,
    },
  }
}
