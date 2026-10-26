import { useState } from 'react'
import type { ReactNode } from 'react'
import { projectTopics } from '../../../shared/project-signals.js'
import { useMessages } from '../../messages/useMessages.js'
import { FilterMenu } from '../FilterMenu.js'

/** The option for projects without a topic; no topic page id or title is ever empty. */
const NO_TOPIC = ''

type FilteredProject = {
  topic: string
  topics?: readonly string[] | undefined
  topicPages?: readonly (string | null)[] | undefined
  topicScope?: readonly string[] | undefined
}

/** Each topic of `project`: its title, and its topic page or, for a title no page holds, the title itself as its key. */
const keyedTopics = (project: FilteredProject): { key: string; title: string }[] =>
  projectTopics(project).map((title, at) => ({ key: project.topicPages?.[at] ?? title, title }))

/**
 * The topic filter of a page listing `projects`: a FilterMenu offering every topic they hold, in the
 * order the projects first hold them, then no topic. Returns that filter and the projects it lets
 * through: for a topic, those holding its page or a topic page under it, or a title no page holds;
 * for no topic, those without one; else all of them. A picked topic no project holds any more lets
 * all of them through.
 */
export function useTopicFilter<T extends FilteredProject>(projects: readonly T[]): { filter: ReactNode; shown: T[] } {
  const m = useMessages()
  const [picked, setPicked] = useState<string | null>(null)
  const options = [
    ...[...new Map(projects.flatMap(keyedTopics).map(({ key, title }) => [key, title])).entries()]
      .map(([value, label]) => ({ value, label })),
    { value: NO_TOPIC, label: m.project.identity.noTopic },
  ]
  const topic = options.some((option) => option.value === picked) ? picked : null
  return {
    filter: (
      <FilterMenu
        name={m.project.identity.topic} label={m.project.identity.filterTopic} all={m.project.identity.allTopics}
        options={options} current={topic} onPick={setPicked}
      />
    ),
    shown: topic === null
      ? [...projects]
      : projects.filter((project) => (topic === NO_TOPIC
        ? projectTopics(project).length === 0
        : (project.topicScope ?? []).includes(topic) || keyedTopics(project).some(({ key }) => key === topic))),
  }
}
