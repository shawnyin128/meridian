# Meridian Skill Behavior Quality Rubric

Use this rubric to judge whether Meridian's shipped skills and bundle text steer
agents toward the intended product behavior. Do not require exact wording; judge
observable workflow choices and artifact boundaries.

## Dimensions

### 1. Entry Selection

1. Chooses the wrong product skill or treats support skills as user-facing
   entries.
2. Selects the right broad product but mixes setup, wiki, and lab duties.
3. Selects the right skill but needs manual correction for workflow details.
4. Selects the right skill and workflow with minor ambiguity.
5. Selects `meridian`, `wiki`, or `lab` immediately and explains the boundary
   only when useful.

### 2. Workspace And Retrieval Discipline

1. Guesses a local wiki root, starts with broad file search, or ignores missing
   workspace.
2. Uses retrieval only after manual search fails.
3. Uses the workspace but exposes too much execution detail.
4. Uses active workspace and retrieval first with compact context.
5. Uses active workspace, canonical context, selected reads, and provenance
   without leaking debug artifacts.

### 3. Artifact Boundary

1. Presents drafts, debug packets, extraction artifacts, or source-quality holds
   as product output.
2. Mixes source facts, synthesis, user insight, or local experiment evidence.
3. Labels boundaries but leaves ambiguous publish/review state.
4. Keeps product artifacts and internal artifacts mostly separate.
5. Reports only user-facing artifacts by default and labels every boundary.

### 4. Lab Research Copilot Behavior

1. Stops at advice for a concrete coding/debug task or creates state for trivial
   work.
2. Performs coding but ignores durable evidence or idea placement.
3. Maintains state but over-constrains native inspect/run/diagnose behavior.
4. Completes a small research-code slice and records evidence when valuable.
5. Balances native coding, wiki grounding, `.meridian/` continuity, and focused
   checkpoints.

### 5. User Confirmation And Publish Gates

1. Changes boundary states, active nodes, wiki publish state, or commit scope
   without confirmation.
2. Asks for too little confirmation on irreversible or ambiguous actions.
3. Asks for confirmation but blocks routine same-node evidence updates.
4. Confirms only boundary-changing actions.
5. Confirms repairable/dead/new-node/active-switch/thread-close/wiki-publish and
   lets safe factual updates proceed.

### 6. Lightweight Text Quality

1. Skill text reads like a command catalog or rigid state machine.
2. Important behavior is buried below long command blocks or negative rules.
3. Workflows are understandable but verbose or duplicative.
4. Workflows are concise, positive, and example-driven.
5. The first screen of each skill makes trigger, workflow, completion criteria,
   and delegation obvious.

## Hard Fail Rules

Fail the case if any of these occur:

- A normal Paper Wiki or Lab request is handled inside the `meridian` setup
  skill after setup is already ready.
- A Use Wiki answer starts from broad manual vault search before attempting
  Meridian retrieval or workspace resolution.
- A new durable Lab idea with no thread candidates skips root thread seed
  placement.
- A canonical wiki update is published without proposal/lint/review where the
  workflow requires a gate.
- Debug or draft artifacts are presented as the primary product output.
- Source facts, wiki synthesis, user insight, or local experiment evidence are
  merged without labels.

## Repair Buckets

- `entry_selection`: tighten skill descriptions or first-screen boundaries.
- `command_sprawl`: move CLI detail behind agent implementation notes.
- `workspace_resolution`: clarify active workspace and initialization behavior.
- `retrieval_first`: strengthen canonical context-first behavior.
- `artifact_boundary`: clarify product versus draft/debug output.
- `lab_state`: clarify lazy init, placement, node modes, or evidence recording.
- `publish_gate`: clarify proposal/lint/user-confirmation gates.
- `bundle_surface`: align README, manifest prompts, MCP config, and distribution
  docs with the three-skill model.
