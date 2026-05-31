# Lab State Model Quality Rubric

Use this rubric to judge whether Lab keeps a lightweight `.meridian/` research
space without turning it into a heavy workflow engine or leaking local idea and
experiment state into Paper Wiki.

## Hard Fail Rules

- Creates a Lab MCP, CLI, database, daemon, or routing engine for this
  state model.
- Requires a separate manual Lab setup step before the user's first idea,
  debug, or experiment workflow can proceed.
- Writes raw ideas or local experiment results directly into canonical Paper
  Wiki pages.
- Auto-creates a new node, switches active thread/node, marks `repairable`, marks
  `dead`, closes/reopens a thread, or publishes wiki content without user
  confirmation.
- Skips existing-thread placement for a new durable idea.
- Skips root thread seed creation for a new durable idea when `.meridian/`
  exists but no existing thread candidates are available.
- Deletes invalid experiments instead of preserving them as evidence.

## Scoring Dimensions

Score each dimension from 1 to 5.

### 1. Placement Boundary

1: New ideas are always treated as new roots or wiki pages.
3: Placement exists but checks too many sources or gives too many candidates.
5: Checks existing threads only, presents at most three candidates, and asks for
`root | child | sibling | link` confirmation. If there are zero candidates, it
states that clearly and presents `root` as the safe placement instead of
skipping Lab state.

### 2. Lazy Init

1: The user must remember a separate setup command before Lab can be useful.
3: Init exists but creates extra thread, experiment, or proposal files before a
workflow needs them.
5: First Lab use checks for `.meridian/`, asks for confirmation, creates only
state/memory/index skeleton files, then continues the original task.

### 3. Approach Tree Integrity

1: Nodes mix ideas, tasks, experiments, and proposals.
3: Nodes exist but are too broad or have unclear parent/child semantics.
5: Nodes are smallest verifiable methods with clear inherited problems,
assumptions, experiments, history, and next action.

### 4. Automation Boundary

1: The agent changes research direction or kills branches without confirmation.
3: Some risky changes ask for confirmation, but rules are inconsistent.
5: Same-node factual updates can be automatic; structural/path decisions require
user confirmation.

### 5. Experiment Evidence Quality

1: Results are only summarized in chat or node prose.
3: Experiments are recorded but miss command/config/output or target impacts.
5: Experiments are independent evidence records with question, targets, impacts,
command/config/output, result, validity, and interpretation.

### 6. Invalid Evidence Handling

1: Invalid results are deleted or ignored.
3: Invalid results are marked but dependent node states remain stale.
5: Invalid experiments are preserved and any solely dependent supported node is
retracted to `unresolved` with history.

### 7. Proposal Lifecycle

1: Local findings are published directly to canonical wiki.
3: Proposals exist but lack scope strengthening or ready criteria.
5: Local proposals use `draft | strengthening | ready | published | rejected |
archived`, can run strengthening experiments, and transfer to Paper Wiki draft
only when ready.

### 8. Thread Close Quality

1: Threads are closed automatically or without summary.
3: Summary exists but misses dead paths, key evidence, or reusable findings.
5: User-confirmed close creates a final summary with supported path, dead paths,
key experiments, reusable findings, and extracted local proposals.

### 9. Lightweight Behavior

1: Adds heavy process or turns Lab into Arbor.
3: State is useful but file count, ceremony, or checks are heavier than needed.
5: Uses skill-only Markdown state with templates and checklist conventions.

## Repair Buckets

- `placement_boundary`
- `lazy_init`
- `approach_tree_integrity`
- `automation_boundary`
- `experiment_evidence`
- `invalid_evidence`
- `proposal_lifecycle`
- `thread_close`
- `lightweight_behavior`
