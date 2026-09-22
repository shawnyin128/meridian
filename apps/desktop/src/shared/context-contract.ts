import { z } from 'zod'


export const CONTEXT_SCHEMA_VERSION = 'meridian.context.v1' as const

export const ContextSectionSchema = z.object({
  heading: z.string().min(1),
  snippet: z.string(),
  score: z.number(),
  layer: z.enum(['source_fact', 'wiki_synthesis', 'user_insight', 'open_question', 'page_content']),
}).strict()

export const ContextMembershipSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
}).strict()

export const ContextTrustSchema = z.object({
  confidence: z.string().optional(),
  review_state: z.string().optional(),
  quality_state: z.string().optional(),
  validation_state: z.string().optional(),
  trust_state: z.string().optional(),
  evolution_state: z.string().optional(),
}).strict()

export const ContextProvenanceSchema = z.object({
  canonical_path: z.string().min(1),
  source_id: z.string().optional(),
  source_pdf: z.string().optional(),
  sources: z.array(z.string()).optional(),
  trust: ContextTrustSchema.optional(),
}).strict()

export const ContextResultSchema = z.object({
  id: z.string().startsWith('wiki:'),
  uri: z.string().startsWith('meridian://wiki/'),
  title: z.string().min(1),
  result_type: z.string().min(1),
  knowledge_role: z.string().min(1),
  score: z.number(),
  selection_reasons: z.array(z.string()),
  excerpt: z.string(),
  sections: z.array(ContextSectionSchema),
  memberships: z.array(ContextMembershipSchema),
  provenance: ContextProvenanceSchema,
}).strict()

/** Compact read-only research context shared by MCP, Core callbacks, and the Harness. */
export const ContextPacketSchema = z.object({
  schema_version: z.literal(CONTEXT_SCHEMA_VERSION),
  query: z.string().min(1),
  generated_at: z.iso.datetime({ offset: true }),
  source: z.object({
    kind: z.literal('paper_wiki'),
    layout: z.enum(['app_native', 'legacy']),
  }).strict(),
  budget: z.object({
    max_results: z.number().int().min(1),
    max_chars_per_result: z.number().int().min(200),
    returned_results: z.number().int().min(0),
    result_limit_reached: z.boolean(),
  }).strict(),
  results: z.array(ContextResultSchema),
  warnings: z.array(z.string()),
}).strict()

export type ContextPacket = z.infer<typeof ContextPacketSchema>
export type ContextResult = z.infer<typeof ContextResultSchema>
