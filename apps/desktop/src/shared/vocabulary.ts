/**
 * Constants shared by both sides of the contract that do not need schemas.
 * Keeping them separate lets the renderer import their types without pulling Zod into its bundle.
 */

/** Active project state counted by the sidebar badge and expanded in the project list. */
export const ACTIVE_PROJECT = '进行中'

/** Paused project state whose focus field records the restart condition. */
export const SHELVED_PROJECT = '搁置'

/** Finished project state whose focus field records the outcome. */
export const FINISHED_PROJECT = '已完成'

/** Project states in list-group and menu-transition order. */
export const PROJECT_STATUSES = [ACTIVE_PROJECT, SHELVED_PROJECT, FINISHED_PROJECT] as const

/** Default state for a paper with no recorded reading relationship. */
export const UNREAD_PAPER = '未读'

/** State for papers being read now, shown separately in the paper table. */
export const READING_PAPER = '在读'

/** State for papers the reader has set aside to read later. */
export const LATER_PAPER = '稍后阅读'

/** Reading states in paper-table selector order. */
export const READ_STATES = [UNREAD_PAPER, READING_PAPER, '已读', LATER_PAPER] as const

/**
 * Trash retention in days. Expired records and their content are removed; the
 * same value drives remaining-day calculations and recovery copy in the UI.
 */
export const TRASH_RETENTION_DAYS = 7

/** Maximum results per search, matching the demo search UI. */
export const SEARCH_LIMIT = 8

/** The `by` a claim, evidence item or conflict carries when the user wrote it in the app. */
export const HUMAN_PRODUCER = '我'

/** Wiki paper-page ID prefix followed by the paper-table row ID. */
export const PAPER_PAGE = 'papers/'

/** Project-page directory and vault ID prefix; project pages live in the wiki alongside topic pages. */
export const PROJECTS_DIR = 'projects'

/** Built-in paper columns in initial order; title is always fixed first, and new vaults show all of these. */
export const PAPER_COLUMNS = ['short', 'rating', 'authors', 'y', 'venue', 'topics', 'st', 'remark'] as const

/** Built-in columns that cannot be hidden or removed. */
export const LOCKED_PAPER_COLUMNS = ['authors', 'y'] as const

/** Groupable built-in fields in menu order, shared by paper-table group chips and facets. */
export const GROUPABLE_PAPER_FIELDS = ['topics', 'projects', 'readState'] as const

/** Default grouping fields before a vault has chosen its own. */
export const DEFAULT_PAPER_GROUPS = ['topics', 'projects', 'readState'] as const

/** UI labels for the two watch types. */
export const WATCH_KINDS = { topic: '主题', author: '作者' } as const

/** Prefix for research-log entries saved from chat so their origin remains visible on the project page. */
export const CHAT_EVENT_PREFIX = '[对话] '

/** UI labels for custom-column types, shared by creation, type changes, and recent-change titles. */
export const COLUMN_TYPE_LABEL = { text: '文本', select: '单选', multi: '多选' } as const
