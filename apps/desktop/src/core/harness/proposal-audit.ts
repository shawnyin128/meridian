import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  HarnessPaperWikiQualitySchema, HarnessPaperWikiRejectionFeedbackSchema, HarnessPaperWikiReviewSchema,
} from '../../shared/contract.js'
import type {
  HarnessPaperWikiQuality, HarnessPaperWikiRejectionFeedback, HarnessPaperWikiReview,
} from '../../shared/contract.js'
import { readRecord } from '../vault/stored-records.js'

export const HARNESS_PROPOSAL_LOG = '.meridian/harness-proposals.jsonl'

export type HarnessProposalAuditEvent = {
  schemaVersion: 'meridian.harness-proposal-audit.v1'
  event: 'generated' | 'applied' | 'rejected'
  proposalId: string
  targetId: string
  scopeDigest: string
  at: string
  body?: string
  action?: 'create' | 'update'
  review?: HarnessPaperWikiReview
  quality?: HarnessPaperWikiQuality
  feedback?: HarnessPaperWikiRejectionFeedback
  /** The change entry an `applied` event's Wiki write recorded. */
  change?: string
}

export type PendingHarnessProposal = {
  id: string
  targetId: string
  scopeDigest: string
  generatedAt: string
  body: string
  action?: 'create' | 'update'
  review?: HarnessPaperWikiReview
  quality?: HarnessPaperWikiQuality
}

/** A proposal written to the Wiki, with `change`, the change entry its write recorded. */
export type AppliedHarnessProposal = PendingHarnessProposal & { change: string }

function parseEvent(line: string, index: number): HarnessProposalAuditEvent {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new Error(`Harness proposal audit line ${index + 1} is not valid JSON`)
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Harness proposal audit line ${index + 1} is not an object`)
  }
  const event = value as Partial<HarnessProposalAuditEvent>
  const validEvent = event.event === 'generated' || event.event === 'applied' || event.event === 'rejected'
  if (event.schemaVersion !== 'meridian.harness-proposal-audit.v1' || !validEvent
    || typeof event.proposalId !== 'string' || typeof event.targetId !== 'string'
    || typeof event.scopeDigest !== 'string' || typeof event.at !== 'string') {
    throw new Error(`Harness proposal audit line ${index + 1} has an invalid shape`)
  }
  if (event.action !== undefined && event.action !== 'create' && event.action !== 'update') {
    throw new Error(`Harness proposal audit line ${index + 1} has an invalid action`)
  }
  if (event.event === 'generated' && (typeof event.body !== 'string' || event.body.trim() === '')) {
    throw new Error(`Harness proposal audit line ${index + 1} has no proposal body`)
  }
  // A later version may add fields inside these; they are read without them.
  if (event.review !== undefined) {
    const parsed = readRecord(HarnessPaperWikiReviewSchema, event.review)
    if ('error' in parsed) {
      throw new Error(`Harness proposal audit line ${index + 1} has an invalid review projection`)
    }
    event.review = parsed.value
  }
  if (event.quality !== undefined) {
    const parsed = readRecord(HarnessPaperWikiQualitySchema, event.quality)
    if ('error' in parsed || parsed.value.caseId !== event.targetId) {
      throw new Error(`Harness proposal audit line ${index + 1} has an invalid quality report`)
    }
    event.quality = parsed.value
  }
  if (event.feedback !== undefined) {
    const parsed = readRecord(HarnessPaperWikiRejectionFeedbackSchema, event.feedback)
    if ('error' in parsed || event.event !== 'rejected') {
      throw new Error(`Harness proposal audit line ${index + 1} has invalid rejection feedback`)
    }
    event.feedback = parsed.value
  }
  if (event.change !== undefined && (typeof event.change !== 'string' || event.event !== 'applied')) {
    throw new Error(`Harness proposal audit line ${index + 1} has an invalid change entry`)
  }
  return event as HarnessProposalAuditEvent
}

/** The proposal generated event `event` holds. */
function proposalOf(event: HarnessProposalAuditEvent): PendingHarnessProposal {
  return {
    id: event.proposalId,
    targetId: event.targetId,
    scopeDigest: event.scopeDigest,
    generatedAt: event.at,
    body: event.body!,
    ...(event.action === undefined ? {} : { action: event.action }),
    ...(event.review === undefined ? {} : { review: event.review }),
    ...(event.quality === undefined ? {} : { quality: event.quality }),
  }
}

/**
 * Reads the audit log at `file` line by line, oldest first, dropping a final line left incomplete by a
 * write cut short. A complete line it cannot read is reported on stderr and skipped, and fields it does
 * not know are read without. Returns an empty list when the log does not exist.
 */
function readEvents(file: string): HarnessProposalAuditEvent[] {
  if (!existsSync(file)) return []
  const raw = readFileSync(file, 'utf8')
  const lines = raw.split('\n').filter((line) => line.trim() !== '')
  if (!raw.endsWith('\n') && lines.length > 0) {
    try {
      JSON.parse(lines.at(-1)!)
    } catch {
      lines.pop()
    }
  }
  return lines.flatMap((line, index) => {
    try {
      return [parseEvent(line, index)]
    } catch (error) {
      console.error(`[harness] an unreadable proposal audit record is skipped: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  })
}

/** Append one durable proposal event without giving Harness access to the vault path. */
export function createHarnessProposalAudit(root: string) {
  const file = join(root, HARNESS_PROPOSAL_LOG)
  return {
    pending(): PendingHarnessProposal[] {
      const pending = new Map<string, PendingHarnessProposal>()
      for (const event of readEvents(file)) {
        if (event.event === 'generated') {
          pending.set(event.proposalId, proposalOf(event))
        } else {
          pending.delete(event.proposalId)
        }
      }
      return [...pending.values()].sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))
    },

    /**
     * Returns each proposal whose last event is an `applied` one that recorded its change entry, as its
     * `generated` event held it, in log order. Undoing that change makes the proposal pending again.
     */
    applied(): AppliedHarnessProposal[] {
      const generated = new Map<string, PendingHarnessProposal>()
      const applied = new Map<string, AppliedHarnessProposal>()
      for (const event of readEvents(file)) {
        if (event.event === 'generated') generated.set(event.proposalId, proposalOf(event))
        const proposal = generated.get(event.proposalId)
        if (event.event === 'applied' && event.change !== undefined && proposal !== undefined) {
          applied.set(event.proposalId, { ...proposal, change: event.change })
        } else applied.delete(event.proposalId)
      }
      return [...applied.values()]
    },

    /**
     * Returns the body of the most recent `applied` event for each target, in log order, later events
     * overwriting earlier ones for the same target. Migrating an app library reads this to tell which
     * paper pages a past apply is known to have produced verbatim.
     */
    appliedBodies(): Map<string, string> {
      const bodies = new Map<string, string>()
      for (const event of readEvents(file)) {
        if (event.event === 'applied' && event.body !== undefined) bodies.set(event.targetId, event.body)
      }
      return bodies
    },

    record(event: Omit<HarnessProposalAuditEvent, 'schemaVersion'>): void {
      mkdirSync(dirname(file), { recursive: true })
      const handle = openSync(file, 'a', 0o600)
      try {
        writeFileSync(handle, `${JSON.stringify({
          schemaVersion: 'meridian.harness-proposal-audit.v1',
          ...event,
        })}\n`, 'utf8')
        fsyncSync(handle)
      } finally {
        closeSync(handle)
      }
      chmodSync(file, 0o600)
    },
  }
}
