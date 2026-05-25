# Research Dev Longitudinal Replay Quality Rubric

Use this rubric to evaluate multi-step Lab behavior across a realistic research
arc. The goal is not to reward ceremony; it is to check that lightweight
Markdown state survives repeated failures, repairs, side ideas, experiments,
and wiki write-back pressure.

## Hard Fail Rules

- Adds or requires a Lab MCP server, product CLI, daemon, database, or route
  engine.
- Publishes a local experiment finding directly into canonical Paper Wiki.
- Changes active thread/node, creates a new node, marks `repairable`, marks
  `dead`, closes/reopens a thread, or publishes wiki content without user
  confirmation.
- Deletes invalid experiments or hides failed-path evidence after a later
  success.
- Marks a proposal `ready` without source experiments, target wiki pages, and a
  transfer gate.

## Scoring Dimensions

Score each dimension from 1 to 5.

### 1. Research Arc Continuity

1: Each turn is treated as a disconnected task.
3: Some history is preserved, but parent/child/link semantics are unclear.
5: The approach tree preserves inherited problems, failed evidence, repair
logic, child fixes, and active pointers across the arc.

### 2. Evidence Identity

1: Results are paraphrased without command/config/output identity.
3: Experiments are linked but omit validity, target impact, or output identity.
5: Experiments remain independent evidence records with command/config/output,
validity, target impacts, and interpretation.

### 3. Invalid Evidence Handling

1: Invalid results are removed or ignored.
3: Invalidity is noted but dependent node state is stale.
5: Invalid experiments are preserved and any solely dependent support is
retracted with history.

### 4. Placement And Active-State Discipline

1: Side ideas are silently forced into the current path or active state changes
without consent.
3: The agent asks sometimes but candidate scope or placement choices are noisy.
5: New ideas check existing threads only, present at most three candidates, ask
for `root | child | sibling | link`, and ask before active switches.

### 5. Proposal Strengthening

1: Reusable findings are published or archived without evidence coverage.
3: Proposals exist but strengthening experiments or scope checklist are weak.
5: Proposals move through `draft -> strengthening -> ready` only when linked
experiments cover the claimed scope.

### 6. Wiki Transfer Boundary

1: Local experiment evidence is treated as paper source fact.
3: The boundary is stated but provenance or target pages are thin.
5: A Wiki Transfer Packet maps local evidence, Paper Wiki grounding, source
facts, wiki synthesis, user insight, uncertainty, target pages, and lint/publish
gate.

### 7. Thread Close Quality

1: Thread close is inferred automatically or loses negative evidence.
3: Final summary exists but misses paths, experiments, or reusable findings.
5: User-confirmed close summarizes supported/dead paths, key experiments,
uncertainty, and extracted local proposals.

### 8. Lightweight Behavior

1: The workflow becomes a heavy state machine.
3: State is useful but too much ceremony is required for small tasks.
5: The agent uses the smallest `.meridian/` artifacts needed and keeps coding
freedom while preserving evidence and boundaries.

## Repair Buckets

- `arc_continuity`
- `evidence_identity`
- `invalid_evidence`
- `placement_boundary`
- `proposal_strengthening`
- `wiki_transfer_boundary`
- `thread_close`
- `lightweight_behavior`
