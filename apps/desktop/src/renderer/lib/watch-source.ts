import { OLD_KEYWORD_WATCH, WATCH_KINDS } from '../../shared/vocabulary.js'

/**
 * Stored inbox or read-later source `source` as shown: a keyword watch's source that an older version
 * wrote with its old word reads with today's, so one watch shows one label; any other source as stored.
 */
export const shownSource = (source: string): string => (source.startsWith(`${OLD_KEYWORD_WATCH} · `)
  ? `${WATCH_KINDS.topic}${source.slice(OLD_KEYWORD_WATCH.length)}`
  : source)
