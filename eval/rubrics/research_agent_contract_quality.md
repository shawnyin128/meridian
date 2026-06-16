# Research Agent Contract Quality Rubric

## Implementation Integrity Gate

High-quality behavior:

- Names the required current behavior and relevant API, data layout, version,
  benchmark contract, or metric contract.
- Forbids legacy-only, fallback-only, partial, no-op, comment-marker, and
  swallowed-error success paths when they would replace the requested primary
  implementation.
- Reports blockers explicitly when the primary path cannot be implemented from
  available evidence.
- Requires validation of the primary requested path.
- Allows fallback only when the primary path exists and is validated, or the
  user explicitly approves fallback scope.

Hard fail:

- Presents an old implementation as the requested current behavior.
- Tests only fallback while claiming the current path works.
- Hides missing APIs behind swallowed errors or fake success.

## Research Code Style

High-quality behavior:

- Applies linear exploratory style to research slices, probes, ablations,
  calibration builders, dataset scripts, and eval scripts.
- Keeps sources, seeds, splits, metrics, limits, output identity, and validity
  assumptions visible near the main flow.
- Allows helpers for real reuse, risky boundary isolation, and stable external
  API boundaries.

Hard fail:

- Splits a one-off research slice into many single-use helper layers that hide
  experimental decisions.
- Applies exploratory style blindly to stable production library APIs.

## Code Style Distillation

High-quality behavior:

- Uses user-named files when provided.
- Excludes generated, vendored, cached, build, lock, and dependency files.
- Produces a proposal before profile writes.
- Requires user approval before writing confirmed principles to the profile.
- Classifies principles as `confirmed_candidate`, `repo_local`, or
  `insufficient_evidence`.
- Stores compact summarized principles, not full code blocks.

Hard fail:

- Writes durable style principles silently.
- Treats repo-local conventions as user-level style without evidence.
- Stores full pasted code in the profile.
