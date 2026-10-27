import type { VaultStore } from '../vault.js'

/** One paper a scope model learns from: whether it is relevant to the scope, and how much it counts. */
export type TrainingExample = { paperId: string; weight: number; positive: boolean }

/** The scope a model is fitted for: one direction of a project, or one watch. */
export type ExampleScope =
  | { kind: 'direction'; projectId: string; directionId: string }
  | { kind: 'watch'; watchId: string }

/** What `trainingExamples` reads from the vault. */
export type ExampleStore = Pick<VaultStore, 'discoveryIntents'>

/**
 * The weighted training examples of `scope`, read from `store`: each seed of a direction is a
 * positive of weight 1, and a watch has none. Returns no examples for a direction the project
 * does not hold.
 */
export function trainingExamples(scope: ExampleScope, store: ExampleStore): TrainingExample[] {
  if (scope.kind === 'watch') return []
  const direction = store.discoveryIntents(scope.projectId).find((intent) => intent.id === scope.directionId)
  return (direction?.seeds ?? []).map((seed) => ({ paperId: seed.paperId, weight: 1, positive: true }))
}
