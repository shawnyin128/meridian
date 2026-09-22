import { z } from 'zod'
import {
  AttachmentSchema, ChatMessageSchema, ChatSessionSchema, InboxEntrySchema, LaterEntrySchema,
  DeliverySettingsSchema, PaperColumnsSchema, PaperReadingSchema, PaperRowSchema, ResearchIdeaSchema,
  TrashEntrySchema,
} from '../../shared/contract.js'

/**
 * User-editable paper-page fields plus the page timestamp. An absent `readState` means the page has no
 * read-state line. The contract reads both absent and explicit unread as the same value, but undo must
 * distinguish them to restore the exact page representation.
 */
export const PaperSnapshotSchema = PaperRowSchema
  .pick({ topics: true, updated: true })
  .extend({
    // Undo snapshots before 2.0 have no bibliographic fields; absence means legacy undo must not touch them.
    title: PaperRowSchema.shape.title.optional(),
    shortTitle: PaperRowSchema.shape.shortTitle,
    authors: PaperRowSchema.shape.authors,
    year: PaperRowSchema.shape.year,
    venue: PaperRowSchema.shape.venue.optional(),
    rating: PaperRowSchema.shape.rating,
    identifier: PaperRowSchema.shape.identifier,
    submitted: PaperRowSchema.shape.submitted,
    readState: PaperRowSchema.shape.readState.optional(),
    custom: PaperRowSchema.shape.custom.default({}),
  })

/**
 * Stored inbox recommendation: cross-boundary fields plus archived topics from topic watches, whether
 * it has left inbox, its arXiv id, and bibliographic metadata used during download/import.
 */
export const InboxRecordSchema = InboxEntrySchema.extend({
  pdf: z.string().default(''),
  topic: z.string(),
  gone: z.boolean(),
  arxiv: z.string().default(''),
  /** Semantic Scholar paper id, used only to feed explicit discovery feedback back into ranking. */
  semanticId: z.string().default(''),
  meta: z.object({
    authors: z.array(z.string()),
    submitted: z.string(),
    journalRef: z.string().nullable(),
  }).strict().default({ authors: [], submitted: '', journalRef: null }),
})

/** Stored read-later item. `day` derives from vault today and `downloaded` from library presence; neither is stored. */
export const LaterRecordSchema = LaterEntrySchema.omit({ day: true, downloaded: true })

/**
 * Stored chat: cross-boundary fields plus messages and whether its title is final. Message count is
 * derived. An unnamed ordinary chat takes its title from the first user message. A paper chat carries
 * `paperId`, takes its title from the paper page, and is unique per paper.
 */
export const ChatRecordSchema = ChatSessionSchema.omit({ messageCount: true }).extend({
  named: z.boolean(),
  messages: z.array(ChatMessageSchema),
  // Read-only compatibility for old vaults; current ideas live in `.meridian/ideas.json` and are not written here or to activity.
  idea: z.object({
    feed: z.string(),
    version: z.number().int().min(1),
    first: z.string(),
  }).strict().optional(),
})

const TrashBase = TrashEntrySchema.omit({ kind: true, restorable: true })

/** One `.meridian/paper-readings.json` entry; highlights, notes, remarks, and progress are isolated by paper-page id. */
export const PaperReadingRecordSchema = PaperReadingSchema
export type PaperReadingRecord = z.infer<typeof PaperReadingRecordSchema>

/**
 * Trash entry with everything required for restoration; `restorable` derives from destination
 * availability. Deleting a paper or project moves its page to `.meridian/trash/<id>.md`; `page` keeps
 * the original relative path for restoration. Paper entries also retain any reading record they had.
 */
export const TrashRecordSchema = z.discriminatedUnion('kind', [
  TrashBase.extend({
    kind: z.literal('paper'), page: z.string(), reading: PaperReadingRecordSchema.optional(),
  }),
  TrashBase.extend({ kind: z.literal('project'), page: z.string() }),
  TrashBase.extend({ kind: z.literal('idea'), idea: ResearchIdeaSchema }),
  TrashBase.extend({
    kind: z.literal('attachment'), projectId: z.string(), attachment: AttachmentSchema,
  }),
  TrashBase.extend({ kind: z.literal('inbox'), entryId: z.string() }),
])

/**
 * `.meridian/state.json` vault state. `seq` assigns ids and only increases, preventing reuse across
 * restarts. `gitManaged` stores the last Git-management conclusion shown to the user, while
 * `sharedSources` stores the last reported count of sources referenced by multiple pages; both are
 * absent before first report. `columns` is omitted until paper columns are customized. `fetchedAt`
 * records the last complete fetch of enabled watches. `deliverySettings` limits watched and discovered
 * deliveries. `projectOrder` and `ideaOrder` hold a manual display order set by drag or a one-shot
 * sort action; either is omitted until its list is reordered for the first time. `agentIdeas` lists
 * `<project id>:<idea id>` for each workspace agent idea already taken into the idea list, so a
 * deleted one does not come back.
 */
export const VaultStateSchema = z.object({
  seq: z.number().int(),
  gitManaged: z.boolean().optional(),
  sharedSources: z.number().int().optional(),
  columns: PaperColumnsSchema.optional(),
  fetchedAt: z.number().int().optional(),
  projectOrder: z.array(z.string()).optional(),
  ideaOrder: z.array(z.string()).optional(),
  agentIdeas: z.array(z.string()).optional(),
  deliverySettings: DeliverySettingsSchema.optional(),
  discoverySchedules: z.record(z.string(), z.object({
    lastFetchedAt: z.number().int().nullable(),
    cursor: z.number().int().min(0),
    requests: z.record(z.string(), z.object({
      fingerprint: z.string(),
      fetchedAt: z.number().int(),
    }).strict()).optional(),
  }).strict()).optional(),
  discoveryPreferences: z.record(z.string(), z.object({
    coreIntentId: z.string().nullable(),
    disabledIntentIds: z.array(z.string()),
  }).strict()).optional(),
})

export type PaperSnapshot = z.infer<typeof PaperSnapshotSchema>
export type InboxRecord = z.infer<typeof InboxRecordSchema>
export type LaterRecord = z.infer<typeof LaterRecordSchema>
export type ChatRecord = z.infer<typeof ChatRecordSchema>
export type TrashRecord = z.infer<typeof TrashRecordSchema>
export type VaultState = z.infer<typeof VaultStateSchema>

/** Full page text; null means the page did not exist. Proposal undo restores these snapshots. */
export const PageTextSchema = z.object({ path: z.string(), text: z.string().nullable() }).strict()

export type PageText = z.infer<typeof PageTextSchema>
