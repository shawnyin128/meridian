import type { ProjectDetail } from '../../shared/contract.js'
import { projectTopics } from '../../shared/project-signals.js'
import { topicTitleKey } from '../../shared/topic-proposal.js'
import { DEFAULT_PROJECT_TOPIC } from '../../shared/vocabulary.js'

/** One stored topic of a project: its Wiki topic page, and the title `topic`/`topics` held for it when it was written. */
export type TopicPin = { page: string; title: string }

/** The vault's topic pages outside the trash, by id: each one's title and parents. */
export type TopicPages = ReadonlyMap<string, { title: string; parents: readonly string[] }>

/** One topic of a project: its title, and the topic page that holds it or null. */
type Topic = { title: string; page: string | null }

/** The stored topic fields of a project. */
type StoredTopics = { topic: string; topics?: string[] | undefined; topicPins?: TopicPin[] | undefined }

/** The topic page whose title matches `title` as topicTitleKey has it, if any. */
function pageTitled(pages: TopicPages, title: string): string | undefined {
  const key = topicTitleKey(title)
  for (const [id, page] of pages) if (topicTitleKey(page.title) === key) return id
  return undefined
}

/**
 * The page of each title `topic`/`topics` hold, in order: the pin stored with that title, else the
 * topic page whose title matches it, else null. A pin whose page is not in `pages` still counts, so
 * a topic page in the trash keeps its place. An older App writes `topic`/`topics` alone, so a title
 * it added has no pin and is matched by name, and a title it removed drops its pin.
 */
export function topicPinsOf(project: StoredTopics, pages: TopicPages): Topic[] {
  return projectTopics(project).map((title) => ({
    title,
    page: project.topicPins?.find((pin) => pin.title === title)?.page ?? pageTitled(pages, title) ?? null,
  }))
}

/**
 * The topic fields Core serves for `project`: each topic page in `pages` under its current title,
 * then each title no page holds as it is stored; a pinned page that is not in `pages` is left out.
 */
export function servedTopics(project: StoredTopics, pages: TopicPages): Pick<ProjectDetail, 'topic' | 'topics' | 'topicPages'> {
  const shown = topicPinsOf(project, pages).flatMap(({ title, page }): Topic[] => {
    if (page === null) return [{ title, page }]
    const held = pages.get(page)
    return held === undefined ? [] : [{ title: held.title, page }]
  })
  return {
    topic: shown[0]?.title ?? DEFAULT_PROJECT_TOPIC,
    ...(shown.length > 1 ? { topics: shown.map(({ title }) => title) } : {}),
    ...(shown.length > 0 ? { topicPages: shown.map(({ page }) => page) } : {}),
  }
}

/** Every page in `pages` that holds `ids` or sits above one of them, each once. */
export function topicScopeOf(ids: readonly string[], pages: TopicPages): string[] {
  const scope = new Set<string>()
  const climb = (id: string): void => {
    if (scope.has(id) || !pages.has(id)) return
    scope.add(id)
    for (const parent of pages.get(id)!.parents) climb(parent)
  }
  for (const id of ids) climb(id)
  return [...scope]
}

/**
 * The stored topic fields for topics `chosen`, each a title with the page that holds it or null,
 * after which the pins of `held` whose pages are not in `pages` stay, so a topic page in the trash
 * comes back with it. Titles repeat once, by topicTitleKey.
 */
export function storedTopics(
  chosen: readonly Topic[], held: StoredTopics, pages: TopicPages,
): StoredTopics {
  const kept = (held.topicPins ?? []).filter((pin) => !pages.has(pin.page) && !chosen.some(({ page }) => page === pin.page))
  const all = [...new Map<string, Topic>([...chosen, ...kept].map((topic) => [topicTitleKey(topic.title), topic])).values()]
  const pins = all.flatMap(({ title, page }) => (page === null ? [] : [{ page, title }]))
  return {
    topic: all[0]?.title ?? DEFAULT_PROJECT_TOPIC,
    topics: all.length > 1 ? all.map(({ title }) => title) : undefined,
    topicPins: pins.length > 0 ? pins : undefined,
  }
}

/** Each of `titles` with the topic page whose title matches it, or null. */
export function titledTopics(titles: readonly string[], pages: TopicPages): Topic[] {
  return titles.map((title) => {
    const page = pageTitled(pages, title)
    return page === undefined ? { title, page: null } : { title: pages.get(page)!.title, page }
  })
}
