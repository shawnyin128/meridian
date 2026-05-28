---
type: product-plan
title: "Research Dev MVP Plan"
status: draft
created: 2026-05-21
updated: 2026-05-21
tags:
  - research-dev-agent
  - llm-wiki
  - mcp
  - mvp
confidence: medium
---

# Research Dev MVP Plan

Research Dev is Meridian's lightweight upper layer for research coding. It uses
Paper Wiki as the research-memory substrate and keeps the agent free to inspect,
run, diagnose, and edit code. The MVP is skill/template first: no new daemon,
database, route machine, or experiment platform.

## Current State Model

Research Dev now uses a target-repo `.meridian/` research space rather than
loose `.meridian/ideas/` Idea Cards as the primary state model. The canonical
state contract is documented in `docs/research-dev-state-model.md`.

Lab creates the research space lazily. If a Lab workflow starts in a repo
without `.meridian/`, the agent asks for confirmation, creates the minimal
`state.md`, `memory.md`, and index skeleton, then continues the user's original
idea/debug/experiment task.

The primary objects are:

- Research Thread: one research problem.
- Approach Node: the smallest verifiable method in an approach tree.
- Experiment: an independent evidence record.
- Finding Proposal: a local reusable finding that transfers to Paper Wiki only
  after it is `ready`.

Legacy Idea Cards remain available for older artifacts, but new durable work
should use `.meridian/threads/`, `.meridian/experiments/`, and
`.meridian/proposals/`.

## Product Boundary

Research Dev helps a researcher turn ideas, papers, failures, and results into
research-friendly code and durable evidence.

It owns:

- research intent classification
- lightweight idea capture and triage
- wiki-aware context gathering
- repo/code/config/log inspection
- experiment and sanity-check planning
- research-friendly implementation guidance
- result interpretation and checkpoint recommendations
- write-back packets to Paper Wiki

It does not own:

- Paper Wiki ingestion internals
- canonical wiki mutation outside proposal-first flows
- canonical `wiki/ideas/` pages for every raw idea
- general repo cleanup as a primary product
- full experiment orchestration
- broad autonomous multi-agent coding
- a new database or background service

## MVP Workflows

### 1. New Idea Placement / Thread Seed

Use when a user shares a research idea, debug intuition, paper-reading spark, or
possible direction that is not yet ready to become an experiment.

Minimum completion:

- preserve the raw idea faithfully
- check existing threads and show at most three placement candidates
- when no existing thread candidates exist, present `root` as the safe
  placement instead of skipping Lab state
- ask the user to choose `root`, `child`, `sibling`, or `link`
- create a thread seed for `root` or `link`, or attach to an existing thread for
  `child` or `sibling`
- retrieve Paper Wiki context after placement when prior work, methods,
  concepts, evidence, or failure modes matter
- ask before switching active thread or node

### 2. Approach Tree Exploration

Use when a user is exploring a research thread or suspected mechanism.

Minimum completion:

- maintain approach nodes as smallest verifiable methods
- use only `unresolved`, `repairable`, `supported`, and `dead`
- record assumptions, experiments, key history, and next action
- update same-node facts automatically when evidence is strong
- ask before changing structure, active node, `repairable`, `dead`, or thread
  close/reopen

### 3. Paper Or Method To Implementation

Use when a user wants to implement or adapt a paper/method in a codebase.

Minimum completion:

- retrieve paper, method, prerequisite concept, and evidence context
- read implementation hooks and minimal checks before editing
- inspect the codebase entrypoints and config path
- produce research-friendly code or an implementation plan
- preserve knobs for ablation, probing, metrics, and variants
- document assumptions and sanity checks
- create a write-back packet when implementation reveals hidden details or wiki gaps

### 4. Broken Run To Sanity Check / Debug

Use when a result, metric, training loop, baseline, or reproduction is broken.

Minimum completion:

- classify plausible failure buckets
- retrieve method failure modes, prerequisite concepts, and evidence definitions
- inspect logs/configs/code paths relevant to the failure
- rank debug hypotheses
- propose or run cheap probes before expensive reruns
- interpret what each check rules in or out
- preserve durable discoveries as write-back proposals

## Artifact Schema

### Research Thread

Purpose: keep one research problem, its active approach node, approach tree,
wiki grounding, final summary, and local proposal extraction.

Default target-repo path:

```text
.meridian/threads/<thread-slug>.md
```

Required sections:

- Root Problem
- Placement
- Wiki Grounding
- Approach Tree
- Thread Final Summary

### Experiment

Purpose: preserve command/config/output identity and interpretation as
independent evidence.

Default target-repo path:

```text
.meridian/experiments/<experiment-id>.md
```

Required sections:

- Question
- Targets And Impacts
- Command / Config / Output
- Result
- Validity
- Interpretation

### Finding Proposal

Purpose: mature a reusable local research finding before it becomes a Paper Wiki
draft proposal.

Default target-repo path:

```text
.meridian/proposals/<proposal-slug>.md
```

Required sections:

- Reusable Finding
- Evidence
- Scope Checklist
- Strengthening Experiments
- State
- Target Wiki Update
- Transfer Notes

### Research Dev Context Packet

Purpose: put high-signal wiki and repo context in one compact artifact.

Required sections:

- User Intent
- Scenario
- Wiki Context
- Repo Context
- Evidence Identity
- Source Facts
- Wiki Synthesis
- User Insight
- Uncertainty / Gaps
- Recommended Research-Code Slice
- Git Checkpoint Recommendation

### Experiment / Evidence Plan

Purpose: define the smallest research-code slice that can teach something.

Required sections:

- Research Question
- Hypothesis Or Failure Mode
- Minimal Slice
- Controls
- Ablations / Probes
- Sanity Checks
- Command / Config / Output Identity
- Expected Observation
- Stop Condition
- Interpretation Plan

### Dev Write-back Packet

Purpose: turn implementation or experiment evidence into durable wiki memory.

Required sections:

- Trigger
- Code / Commit Identity
- Command / Config / Environment
- Result Artifacts
- Metric Definitions
- Interpretation
- Hypothesis Impact
- Affected Wiki Pages
- Proposed Wiki Update
- Boundary Notes
- Next Decision

Templates live in `src/meridian/templates/research-dev/`.

## Skill Behavior

The product-facing skill is `.codex/skills/lab/SKILL.md`.

The skill should:

- start from one of the four MVP workflows
- retrieve wiki context when the task depends on prior papers, methods, concepts, evidence, failed paths, or user insights
- keep context packets compact
- let the agent choose code-reading, commands, probes, tests, or edits
- require evidence identity for experiments and results
- encourage git checkpoints at research-impact boundaries
- write back through proposal-first Paper Wiki tools

It should not force every request through a managed Arbor loop. Arbor remains
useful for durable project evidence, release gates, and larger implementation
features, but Research Dev should stay lightweight during ordinary exploration.

## Research Space Contract

Idea and approach management belongs to Research Dev, not the canonical Paper
Wiki layer. Raw or half-formed ideas are active hypotheses, experiment
candidates, or debug intuitions. They should be placed into the target repo's
`.meridian/` research space as threads, approach nodes, experiments, or local
finding proposals until they generate durable research memory.

Use Paper Wiki to ground an idea before investing in code when the idea depends
on prior work, method details, prerequisite concepts, evidence, or known failure
modes. The grounding should answer:

- what supports the idea
- what contradicts or weakens it
- whether it looks novel or already covered
- what implementation risk or missing evidence remains
- what smallest test could change the decision

Promotion and write-back are proposal-first:

- failed path worth remembering -> synthesis proposal
- cross-paper judgment -> synthesis proposal
- method understanding changed -> refinement proposal
- prerequisite concept clarified -> concept proposal
- personal interpretation -> user insight
- recurring open problem -> research-question synthesis

## Wiki Retrieval Contract

Use Paper Wiki before development when a request depends on:

- paper methods or baselines
- metric definitions
- prerequisite mechanisms
- implementation hooks
- known failure modes
- prior user insights
- claim/evidence support
- reproduction details
- related syntheses or method-family pages

Preferred MCP sequence:

```text
meridian.context(query)
-> meridian.read(page, selected sections)
-> meridian.trace(page) when evidence or trust state matters
```

If MCP is not registered in the active client, use the equivalent local
execution primitive:

```bash
PYTHONPATH=src python3 -m meridian.mcp context --wiki-root wiki --query "<research/coding intent>"
```

## Write-back Contract

Use proposal-first write-back when a development task creates durable research
memory:

- experiment result interpretation
- failed path that should be remembered
- implementation detail missing from a paper page
- mismatch between code and paper claim
- new synthesis or research decision

Preferred MCP sequence:

```text
meridian.propose(query, title, proposal_type, context_path, user_note)
-> meridian.apply(proposal_manifest) only after lint passes
```

Do not treat user interpretation or local experiment evidence as paper source
fact. Put it in synthesis, user insight, result memory, or a source-recheck
proposal.

## Git Checkpoint Contract

Suggest a checkpoint when:

- a hypothesis implementation first becomes runnable
- a probe, ablation, or instrumentation layer is added
- a result changes the next research decision
- a risky refactor could erase useful exploratory state
- the user is about to pivot directions

Checkpoint guidance should identify the research move, not only the file diff.

## Evaluation Plan

Evaluate the Research Dev MVP with scenario-level cases, not exact command
sequences.

Primary dimensions:

- correct scenario classification
- wiki retrieval usage when needed
- compact context packet quality
- research-code slice quality
- evidence identity
- sanity/probe quality
- research-friendly code principle
- write-back boundary
- checkpoint discipline
- lightweight behavior

The first eval assets live at:

- `eval/cases/research_dev_mvp.jsonl`
- `eval/rubrics/research_dev_mvp_quality.md`

## Implementation Decision

The MVP does not add a `meridian dev` CLI. Skill + templates are enough for the
first usable flow and preserve agent freedom. The internal
`meridian.lab.validate_lab_space` helper exists only for release/debug checks
over `.meridian/` layout, active pointers, node modes, experiment validity,
proposal states, and ready-proposal transfer gates.
