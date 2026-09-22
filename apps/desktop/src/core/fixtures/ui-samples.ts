import type { JobsStatus, MetadataJob } from '../../shared/contract.js'

const STEP_MS = 2_000
const STEPS: readonly MetadataJob['step'][] = ['read', 'detect', 'lookup', 'write']

/** Adds a cycling upload only to the opt-in fixture review mode. */
export function withUiSampleUpload(status: JobsStatus, now: number): JobsStatus {
  const step = STEPS[Math.floor(now / STEP_MS) % STEPS.length] ?? 'read'
  const batch = Math.max(0, ...status.uploads.map((job) => job.batch)) + 1
  const sample: MetadataJob = {
    id: 'ui-sample-upload',
    batch,
    paperId: '2511-10645v1',
    title: 'UI sample · metadata extraction',
    bytes: 3_145_728,
    step,
    found: null,
    error: null,
  }
  return { ...status, uploads: [sample, ...status.uploads] }
}
