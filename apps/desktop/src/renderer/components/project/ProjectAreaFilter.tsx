import { useState } from 'react'
import type { ReactNode } from 'react'
import { projectAreas } from '../../../shared/project-signals.js'
import { useMessages } from '../../messages/useMessages.js'
import { FilterMenu } from '../FilterMenu.js'

/** The option for projects without an area; no area is ever empty. */
const NO_AREA = ''

/**
 * The area filter of a page listing `projects`: a FilterMenu offering every area they use, in the
 * order the projects first use them, then no area. Returns that filter and the projects it lets
 * through: those holding the picked area, those without one for no area, or all of them. A picked
 * area no project holds any more lets all of them through.
 */
export function useAreaFilter<T extends { topic: string; topics?: readonly string[] | undefined }>(
  projects: readonly T[],
): { filter: ReactNode; shown: T[] } {
  const m = useMessages()
  const [picked, setPicked] = useState<string | null>(null)
  const options = [
    ...[...new Set(projects.flatMap(projectAreas))].map((area) => ({ value: area, label: area })),
    { value: NO_AREA, label: m.project.identity.noArea },
  ]
  const area = options.some((option) => option.value === picked) ? picked : null
  return {
    filter: (
      <FilterMenu
        name={m.project.identity.topic} label={m.project.identity.filterArea} all={m.project.identity.allAreas}
        options={options} current={area} onPick={setPicked}
      />
    ),
    shown: area === null
      ? [...projects]
      : projects.filter((project) => (area === NO_AREA
        ? projectAreas(project).length === 0
        : projectAreas(project).includes(area))),
  }
}
