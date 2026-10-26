import { z } from 'zod'
import {
  AttachmentSchema, ChatMessageSchema, ChatSessionSchema, InboxEntrySchema, InboxStreamSchema, LaterEntrySchema,
  DeliverySettingsSchema, PaperColumnsSchema, PaperReadingSchema, PaperRowSchema, RecommendationReasonSchema,
  ResearchIdeaSchema, TrashEntrySchema,
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
 * `downloaded` is still written for older Apps; listing derives it from the vault's paper pages.
 * `left` says why a `gone` entry left, as one of `InboxLeft` when this version wrote it; `gone` stays
 * the truth, since an older App restoring an entry from the trash leaves `left` as it was. `reasons`
 * holds the reasons of the stream that delivered it first, and each stream in `also` its own.
 */
export const InboxRecordSchema = InboxEntrySchema.extend({
  also: z.array(InboxStreamSchema.extend({ reasons: z.array(RecommendationReasonSchema) }).strict()).optional(),
  pdf: z.string().default(''),
  topic: z.string(),
  gone: z.boolean(),
  left: z.string().optional(),
  arxiv: z.string().default(''),
  /** Semantic Scholar paper id, used to feed explicit discovery feedback back into ranking and to tell papers apart. */
  semanticId: z.string().default(''),
  /** DOI, used only to tell papers apart. */
  doi: z.string().optional(),
  meta: z.object({
    authors: z.array(z.string()),
    submitted: z.string(),
    journalRef: z.string().nullable(),
  }).strict().default({ authors: [], submitted: '', journalRef: null }),
})

/**
 * One paper `.meridian/discovery/delivered.json` remembers as delivered: the id of the inbox entry that
 * delivered it and its identity, as `PaperIdentity` holds it. The file outlives inbox records, which
 * every App deletes with their watch or project, so a paper delivered once is never delivered again.
 */
export const DeliveredRecordSchema = z.object({
  id: z.string(),
  keys: z.array(z.string()),
  title: z.string(),
  year: z.number().int().nullable(),
}).strict()

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

/**
 * One `.meridian/metadata-fills.json` entry: the bibliographic fields of paper `paper` the App last
 * filled from a metadata source, each with the value it wrote, so a later fill may replace those
 * values and never one the user typed.
 */
export const MetadataFillRecordSchema = z.object({ paper: z.string(), fields: z.record(z.string(), z.unknown()) })

/** One `.meridian/paper-readings.json` entry; highlights, notes, remarks, and progress are isolated by paper-page id. */
export const PaperReadingRecordSchema = PaperReadingSchema
export type PaperReadingRecord = z.infer<typeof PaperReadingRecordSchema>

/**
 * Trash entry with everything required for restoration; `restorable` derives from destination
 * availability. Deleting a paper, a project or a Wiki aggregation page moves its page to
 * `.meridian/trash/<id>.md`; `page` keeps the original relative path for restoration. A Wiki page
 * merged into another holds in `ideas` each idea whose relations the merge repointed, with its
 * related pages `before` and `after` the merge; putting the page back returns an idea to `before`
 * while it still relates to `after`. Paper entries also retain any reading record they had.
 * An inbox entry's `feedback` names the discovery feedback that removed it; restoring clears that
 * feedback from the entry. A read-later entry holds the removed item and its index in the queue, where
 * restoring puts it back; a chat entry holds the whole chat and its index in the chat list the same way,
 * and an attachment entry its index in the project's attachments. An attachment entry an older version
 * wrote has no index and goes back at the end.
 */
export const TrashRecordSchema = z.discriminatedUnion('kind', [
  TrashBase.extend({
    kind: z.literal('paper'), page: z.string(), reading: PaperReadingRecordSchema.optional(),
  }),
  TrashBase.extend({ kind: z.literal('project'), page: z.string() }),
  TrashBase.extend({
    kind: z.literal('page'), page: z.string(),
    ideas: z.array(z.object({ id: z.string(), before: z.array(z.string()), after: z.array(z.string()) })).optional(),
  }),
  TrashBase.extend({ kind: z.literal('idea'), idea: ResearchIdeaSchema }),
  TrashBase.extend({
    kind: z.literal('attachment'), projectId: z.string(), attachment: AttachmentSchema,
    position: z.number().int().min(0).optional(),
  }),
  TrashBase.extend({
    kind: z.literal('inbox'), entryId: z.string(), feedback: z.enum(['less', 'known']).optional(),
  }),
  TrashBase.extend({ kind: z.literal('later'), later: LaterRecordSchema, position: z.number().int().min(0) }),
  TrashBase.extend({ kind: z.literal('chat'), chat: ChatRecordSchema, position: z.number().int().min(0) }),
])

/** One project's discovery preferences: the direction chosen as core and the directions turned off. */
export const DiscoveryPreferencesRecordSchema = z.object({
  coreIntentId: z.string().nullable(),
  disabledIntentIds: z.array(z.string()),
})

/** A candidate paper kept for a later run: the provider-neutral discovery paper, as fetched. */
export const CandidateRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  abstract: z.string(),
  submitted: z.string(),
  journalRef: z.string().nullable(),
  pdf: z.string(),
  ranking: InboxEntrySchema.shape.ranking.unwrap().exactOptional(),
  semanticId: z.string(),
  doi: z.string().exactOptional(),
  matches: z.array(z.object({
    intentId: z.string(), intentLabel: z.string(), seedPaperIds: z.array(z.string()), core: z.boolean(),
  }).strict()).exactOptional(),
  origins: z.array(z.object({
    source: z.enum(['similarity', 'citation', 'reference', 'author']),
    seedPaperIds: z.array(z.string()),
    provider: z.literal('arxiv').exactOptional(),
  }).strict()).exactOptional(),
  wikiTerms: z.array(z.string()).exactOptional(),
}).strict()

/**
 * One `.meridian/discovery/progress.json` record: how far one scope's refreshes have got. `id` is
 * `project:<project id>` or `watch:<watch id>`; `steps` holds, per discovery direction id, how many queries it has run;
 * `candidates` holds the papers fetched beyond a run's cap, offered first by the next run; `favouredAt`
 * is when the scope last delivered more than an even split of a run's cap; `newest` holds the arXiv ids
 * of the newest page a watch fetched last; `poolStalled` is true when a run served the scope from its
 * pool, without provider calls, and delivered nothing, and no run has delivered since. Each is absent
 * until set.
 */
export const RefreshProgressRecordSchema = z.object({
  id: z.string(),
  steps: z.record(z.string(), z.number().int().min(0)).optional(),
  candidates: z.array(CandidateRecordSchema).optional(),
  favouredAt: z.number().int().optional(),
  newest: z.array(z.string()).optional(),
  poolStalled: z.boolean().optional(),
}).strict()

/**
 * `.meridian/state.json` vault state. `seq` assigns ids and only increases, preventing reuse across
 * restarts. `gitManaged` stores the last Git-management conclusion shown to the user, while
 * `sharedSources` stores the last reported count of sources referenced by multiple pages; both are
 * absent before first report. `columns` is omitted until paper columns are customized. `fetchedAt`
 * records the last complete fetch of enabled watches. `deliverySettings` limits watched and discovered
 * deliveries, its per-scope limit stored at the top level beside it and read inside it only from data
 * written while that limit was in development. `projectOrder` and `ideaOrder` hold a manual display order set by drag or a one-shot
 * sort action; either is omitted until its list is reordered for the first time. `agentIdeas` lists
 * `<project id>:<idea id>` for each workspace agent idea already taken into the idea list, so a
 * deleted one does not come back. `discoveryPreferences` holds each project's preferences as stored;
 * they are read key by key with `DiscoveryPreferencesRecordSchema`, so none of them can keep the vault
 * from opening. Strict, so a key this version does not know is reported to the reader, which keeps it,
 * instead of being dropped.
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
  /** Research-record events already copied into the feed, as `project:date:text` keys. */
  feedEvents: z.array(z.string()).optional(),
  deliverySettings: DeliverySettingsSchema.optional(),
  /** How many cards each watch or project shows after a refresh; absent means the default. */
  maxShownPerScope: DeliverySettingsSchema.shape.maxShownPerScope,
  discoverySchedules: z.record(z.string(), z.object({
    lastFetchedAt: z.number().int().nullable(),
    cursor: z.number().int().min(0),
    requests: z.record(z.string(), z.object({
      fingerprint: z.string(),
      fetchedAt: z.number().int(),
    }).strict()).optional(),
  }).strict()).optional(),
  discoveryPreferences: z.record(z.string(), z.unknown()).optional(),
}).strict()

export type PaperSnapshot = z.infer<typeof PaperSnapshotSchema>
export type InboxRecord = z.infer<typeof InboxRecordSchema>
export type DeliveredRecord = z.infer<typeof DeliveredRecordSchema>
/**
 * Why an inbox entry left the feed: added to the vault, queued to read later, dismissed, given `less`
 * or `known` feedback, or folded away as seen when a refresh ranked it below its scope's limit.
 */
export type InboxLeft = 'library' | 'later' | 'dismissed' | 'less' | 'known' | 'folded'
export type LaterRecord = z.infer<typeof LaterRecordSchema>
export type ChatRecord = z.infer<typeof ChatRecordSchema>
export type TrashRecord = z.infer<typeof TrashRecordSchema>
export type VaultState = z.infer<typeof VaultStateSchema>
export type RefreshProgressRecord = z.infer<typeof RefreshProgressRecordSchema>

/** Full page text; null means the page did not exist. Proposal undo restores these snapshots. */
export const PageTextSchema = z.object({ path: z.string(), text: z.string().nullable() }).strict()

export type PageText = z.infer<typeof PageTextSchema>
