import type { Conclusion, Conclusions, PaperRow } from '../../shared/contract.js'
import type { ProjectRecord } from './page.js'

/** Source marker for an item added manually from project details. */
export const MANUAL_SOURCE = '手动添加'

/** Returns the source a conclusion saved from the chat session titled `title` records. */
export const chatSource = (title: string): string => `对话「${title}」`

/** Returns how many conclusions in `list` are verified, pending and conflicting. */
export function conclusionCounts(list: readonly Conclusion[]): Conclusions {
  return {
    verified: list.filter((conclusion) => conclusion.state === 'verified').length,
    pending: list.filter((conclusion) => conclusion.state === 'pending').length,
    conflicting: list.filter((conclusion) => conclusion.state === 'conflicting').length,
  }
}

/** Adds project links and project conclusions derived from the project side to one paper row. */
export function withProjectLinks(
  row: PaperRow,
  projects: readonly Pick<ProjectRecord, 'id' | 'name' | 'papers' | 'conclusionList'>[],
): PaperRow {
  const cited = projects.reduce((count, project) => count + project.conclusionList.filter(
    (conclusion) => conclusion.paper === row.id,
  ).length, 0)
  return {
    ...row,
    projects: projects.filter((project) => project.papers.includes(row.id)).map(
      (project) => ({ id: project.id, name: project.name }),
    ),
    conclusionCount: row.conclusionCount + cited,
  }
}
