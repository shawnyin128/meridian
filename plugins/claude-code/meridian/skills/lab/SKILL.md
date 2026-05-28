---
name: lab
description: Use when a research coding task should use Meridian Paper Wiki context to design experiments, implement paper methods, debug broken runs, preserve evidence, or write research findings back to the wiki.
---

# Meridian Lab

Use this skill for research coding. Keep it lightweight: maintain the target
repo's `.meridian/` research space, retrieve Paper Wiki context when research
context matters, then let the agent inspect, run, diagnose, edit, and checkpoint
normally.

## Lazy Init

Lab uses lazy init. The user does not need to initialize Lab before asking a
research-coding question.

At the start of any Lab workflow:

- Check whether the target repo has `.meridian/`.
- If it is missing, ask once before creating the Lab research space.
- On confirmation, create only the minimal skeleton:
  - `.meridian/state.md`
  - `.meridian/memory.md`
  - `.meridian/threads/index.md`
  - `.meridian/experiments/index.md`
  - `.meridian/proposals/index.md`
- Continue the user's original idea/debug/experiment task after the skeleton
  exists.
- Create thread, experiment, and proposal files only when the current workflow
  needs them.

Example:

```text
The user says a run failed in a repo with no `.meridian/`. Ask to create the
Lab research space, create the minimal skeleton after confirmation, then record
the failed run as experiment evidence and continue debugging.
```

## Workflows

### New Idea Placement / Thread Seed

Use when the user shares a new idea, intuition, or side direction.

Minimum completion:

- Preserve the raw idea.
- Check existing `.meridian/threads/` only and show at most three placement
  candidates.
- Ask the user to choose `root`, `child`, `sibling`, or `link`.
- Create a thread seed for `root` or `link`; attach to the existing thread for
  `child` or `sibling`.
- After placement, retrieve Paper Wiki grounding when prior methods, concepts,
  evidence, or failure modes matter.
- Ask before switching the active thread or active node.

Example:

```text
The user gets a tokenizer-pruning idea while debugging KV-cache compression.
Compare it against existing research threads, ask where it belongs, create a
thread seed if needed, then use Paper Wiki only after placement.
```

### Approach Tree Exploration

Use when the user is exploring a research thread.

Minimum completion:

- Maintain an approach tree whose nodes are the smallest verifiable methods.
- Use node modes exactly: `unresolved`, `repairable`, `supported`, `dead`.
- Record assumptions, relevant experiments, key history, and next action.
- Automatically update same-node facts when evidence is strong enough.
- Ask before marking a node `repairable` or `dead`, creating a new node,
  changing active node, closing or reopening a thread, or killing a path.
- Confirm thread close with the user, then write a final summary and extract
  reusable findings into local proposals.

Example:

```text
The current eviction method fails but the failure appears explainable. Record
the evidence, ask whether the node is repairable, then ask before creating
child repair candidates.
```

### Experiment Evidence Recording

Use when planning, running, or interpreting an experiment.

Minimum completion:

- Record experiments as independent evidence records under
  `.meridian/experiments/`.
- Include question, primary target, targets and impacts, command/config/output,
  result, validity, and interpretation.
- Link experiments to nodes or proposals instead of copying results everywhere.
- If an experiment is invalid, preserve it as evidence and retract any
  same-node support that depended only on that invalid evidence.
- Create experiment checkpoint commits before and after experiments when the
  relevant worktree scope is clean or user-confirmed.

Example:

```text
Before running A.1's proxy scoring ablation, commit the relevant setup. After
the run, record the result as an experiment file and update the target node if
the evidence is valid.
```

### Finding Proposal / Wiki Write-back

Use when local research produces a reusable finding.

Minimum completion:

- Create a local finding proposal under `.meridian/proposals/`.
- Use proposal states exactly: `draft`, `strengthening`, `ready`, `published`,
  `rejected`, `archived`.
- Let proposals run strengthening experiments using the same experiment schema.
- Move a proposal to `ready` only when evidence covers the key scope.
- Convert `ready` local proposals into Paper Wiki draft proposals; publish
  canonical wiki updates only after user confirmation and lint/review.
- Use a Wiki Transfer Packet when moving local evidence toward Paper Wiki.

Example:

```text
A local experiment shows dynamic KV eviction needs amortized scoring. Create a
local proposal, add scope-strengthening experiments, and only transfer it to the
Paper Wiki draft path when ready.
```

Common request labels still map to these workflows:

- `Idea Capture / Triage / Evolution`
- `Idea To Experiment Design`
- `Paper Or Method To Implementation`
- `Broken Run To Sanity Check / Debug`

## Wiki Retrieval Contract

Retrieve wiki context after dev-state placement, or before coding when the task
depends on paper methods, metric definitions, prerequisite mechanisms,
implementation hooks, failure modes, prior user insights, claim support, or
reproduction details.

Preferred MCP tools:

- `meridian.context` for compact research/coding context.
- `meridian.read` for selected canonical page sections.
- `meridian.trace` for provenance, evidence, quality, or evolution state.

If MCP is unavailable, use the local execution primitive:

```bash
PYTHONPATH=src python3 -m meridian.mcp context --query "<research/coding intent>"
```

## Wiki Health Signals

If a research-coding task needs wiki context and retrieval returns weak method,
concept, or evidence support, treat that as a wiki signal rather than a reason
to overfit the dev answer:

- missing prerequisite concepts: note a `concept_coverage` gap
- many competing method pages: note a `knowledge_graph` consolidation gap
- unsupported claims: note a `claim_evidence_traceability` gap
- no synthesis for a recurring design question: note a `growth` gap

Continue the dev task with the best available context, but include the gap in
the Research Dev Context Packet and ask before creating a Paper Wiki repair or
write-back proposal.

## Artifacts

Use Markdown artifacts when a task has durable value:

- `.meridian/state.md`
- `.meridian/memory.md`
- `.meridian/threads/index.md`
- `.meridian/threads/<thread>.md`
- `.meridian/experiments/index.md`
- `.meridian/experiments/<experiment>.md`
- `.meridian/proposals/index.md`
- `.meridian/proposals/<proposal>.md`
- `Research Dev Context Packet` for compact wiki/repo context
- `Wiki Transfer Packet` for ready local findings moving toward Paper Wiki

Templates live in:

```text
src/meridian/templates/research-dev/
```

## Evidence And Write-back

For experiments or results, preserve command, config, environment, output path,
metric definition, and interpretation. Write back only through a Paper Wiki
proposal when a local finding becomes a reusable proposal that is `ready`.
Never edit canonical wiki pages directly from Research Dev state.

Keep boundaries clear:

- paper source facts come from papers and evidence records
- wiki synthesis is revisable interpretation
- user insight is user-supplied context
- research threads, nodes, experiments, and local proposals are dev working state
- local experiment results are evidence from the user's repo, not paper facts

## Git Checkpoints

Checkpoint before and after experiments when the relevant change scope is clear.
Commit messages should follow:

```text
<type>[optional scope]: <description>
```

Use types such as `idea`, `approach`, `exp`, `result`, `proposal`, `wiki`, and
`state`. If unrelated dirty worktree changes exist, stop and ask for the commit
scope before checkpointing.
