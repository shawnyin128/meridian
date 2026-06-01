---
type: product-plan
title: "Lab Idea Graph MVP Plan"
status: draft
created: 2026-05-21
updated: 2026-05-21
tags:
  - lab
  - idea-graph
  - llm-wiki
  - mcp
  - mvp
confidence: medium
---

# Lab Idea Graph MVP Plan

Lab is Meridian's lightweight upper layer for research idea graph management. It
uses Paper Wiki as the research-memory substrate and keeps coding work outside
Lab. The MVP is skill/template first: no new daemon, database, route machine,
experiment platform, or coding agent.

## Current State Model

Lab uses a target-repo `.meridian/` research space rather than
loose `.meridian/ideas/` Idea Cards as the primary state model. The canonical
state contract is documented in `docs/research-dev-state-model.md`.

Lab creates the research space lazily. If a Lab workflow starts in a repo
without `.meridian/`, the agent asks for confirmation, creates the minimal
`state.md`, `memory.md`, and index skeleton, then continues the user's original
idea or evidence-management task.

The primary objects are:

- Research Thread: one research problem.
- Approach Node: the smallest verifiable method in an approach tree.
- Research Prior: the Paper Wiki grounding state for research-bearing method,
  prompt, metric, evaluation, baseline, ablation, probe, or failure decisions.
- Experiment: an independent evidence record.
- Finding Proposal: a local reusable finding that transfers to Paper Wiki only
  after it is `ready`.

Legacy Idea Cards remain available for older artifacts, but new durable work
should use `.meridian/threads/`, `.meridian/experiments/`, and
`.meridian/proposals/`.

## Product Boundary

Lab helps a researcher turn ideas, papers, failures, and results into a durable
idea graph, evidence records, and proposal-ready findings.

It owns:

- lightweight idea capture and triage
- wiki-aware context gathering
- Wiki-grounded feasibility review
- Research Prior classification and missing-prior gates
- approach tree management
- experiment evidence recording
- result interpretation as Lab state
- development handoff packets
- write-back packets to Paper Wiki

It does not own:

- Paper Wiki ingestion internals
- canonical wiki mutation outside proposal-first flows
- canonical `wiki/ideas/` pages for every raw idea
- general repo cleanup as a primary product
- code implementation, debugging, tests, commits, release, or convergence
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
- after placement, run the Research Prior Gate before feasibility or experiment
  planning when the idea contains method, prompt, metric, eval, ablation, probe,
  failure, or baseline slots
- ask before switching active thread or node

### 2. Approach Tree Exploration

Use when a user is exploring a research thread or suspected mechanism.

Minimum completion:

- maintain approach nodes as smallest verifiable methods
- use only `unresolved`, `repairable`, `supported`, and `dead`
- scan the node plan for method, prompt, metric, evaluation, ablation, probe,
  baseline, or failure slots before finalizing it
- record Research Prior state for every research-bearing slot
- record assumptions, experiments, key history, and next action
- update same-node facts automatically when evidence is strong
- ask before changing structure, active node, `repairable`, `dead`, or thread
  close/reopen

### 3. Wiki-Grounded Feasibility Review

Use when a user asks whether an idea, approach, repair, or experiment direction
is plausible.

Minimum completion:

- retrieve paper, method, prerequisite concept, and evidence context before
  finalizing a plan that contains a research-prior slot
- treat missing prior grounding as a valid `missing` state that requires user
  confirmation before agent judgment becomes the current path
- read selected canonical pages and trace provenance for decision-driving claims
- separate source fact, wiki synthesis, user insight, local evidence, and
  uncertainty
- identify the smallest evidence needed next
- create a development handoff only when code/debug/test work is the next step

### 4. Experiment Evidence Recording

Use when a result, metric, training loop, baseline, or reproduction teaches
something that should update the idea graph.

Minimum completion:

- preserve command/config/output identity
- scan the design for metric, baseline, prompt, evaluation protocol, ablation,
  probe, or failure slots
- record Research Prior state for every research-bearing slot before treating
  the experiment design as ready
- record result, validity, and interpretation
- link the experiment to node/proposal targets
- update same-node support only when evidence is valid
- prepare a development handoff if more code/debug work is needed

### 5. Development Handoff

Use when the next useful action is implementation, debugging, testing,
experiments, commits, release, or convergence.

Minimum completion:

- name the motivating thread/node or idea
- include the wiki context that shaped the decision
- state the smallest development question or task
- define expected evidence and validity criteria
- hand off to the normal coding workflow instead of editing code inside Lab

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
- Research Prior blocks inside relevant approach nodes
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
- Research Prior when design depends on prior practice
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

### Lab Context Packet

Purpose: put high-signal wiki and idea-graph context in one compact artifact.

Required sections:

- User Intent
- Scenario
- Wiki Context
- Idea Graph Context
- Evidence Identity
- Source Facts
- Wiki Synthesis
- User Insight
- Uncertainty / Gaps
- Recommended Next Research Move
- Development Handoff Needed

### Experiment / Evidence Plan

Purpose: define the evidence that would update a node or proposal.

Required sections:

- Research Question
- Hypothesis Or Failure Mode
- Minimal Evidence
- Controls
- Ablations / Probes
- Sanity Checks
- Command / Config / Output Identity
- Expected Observation
- Stop Condition
- Interpretation Plan

### Development Handoff Packet

Purpose: give a coding workflow enough context to implement/debug/test without
making Lab responsible for the code.

Required sections:

- Active Thread / Node
- Wiki Context Used
- Development Question
- Evidence To Produce
- Validity Criteria
- Return To Lab

### Wiki Transfer Packet

Purpose: turn local finding or experiment evidence into durable wiki memory.

Required sections:

- Trigger
- Local Evidence Identity
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

The product-facing skill is `plugins/codex/meridian/skills/lab/SKILL.md`.

The skill should:

- start from one of the five MVP workflows
- scan each Lab plan for research-prior slots before finalizing it
- use `meridian.context` as the default grounding path for each research-bearing
  slot, followed by targeted `meridian.read`/`meridian.trace` when returned
  context could change the decision
- keep context packets compact
- manage ideas, approach nodes, experiment evidence, and local finding proposals
- produce development handoffs when implementation, debugging, tests, commits,
  release, or convergence are needed
- require evidence identity for experiments and results
- write back through proposal-first Paper Wiki tools

It should not force every request through a managed feature loop. Lab should
stay lightweight during ordinary exploration and add Paper Wiki grounding,
approach-tree state, experiment evidence, and local finding proposals only when
the task has research value. It should not perform the coding work itself.

## Research Space Contract

Idea and approach management belongs to Lab, not the canonical Paper
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

Use Paper Wiki before feasibility judgment or development handoff when a
request depends on:

- paper methods or baselines
- metric definitions
- prerequisite mechanisms
- implementation hooks
- known failure modes
- prior user insights
- claim/evidence support
- reproduction details
- related syntheses or method-family pages

Default MCP grounding path for research-prior slots:

```text
meridian.context(query)
-> meridian.read(page, selected sections)
-> meridian.trace(page) when evidence or trust state matters
```

If MCP is not registered in the active client, use the equivalent local
execution primitive:

```bash
PYTHONPATH=src python3 -m meridian.mcp context --wiki-root wiki --query "<research intent>"
```

## Write-back Contract

Use proposal-first write-back when Lab state captures durable research memory:

- experiment result interpretation
- failed path that should be remembered
- implementation detail returned by a development handoff and missing from a
  paper page
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

## Development Handoff Contract

Hand off when a Lab conclusion needs code work:

- implementation of a hypothesis or probe
- debugging a failed run
- running tests or experiments
- committing checkpoint state
- release or convergence work

The handoff should identify the research move and the evidence Lab expects
back. It should not prescribe a rigid agent route.

## Evaluation Plan

Evaluate the Research Dev MVP with scenario-level cases, not exact command
sequences.

Primary dimensions:

- correct scenario classification
- wiki retrieval usage when needed
- compact Lab context quality
- development handoff quality
- evidence identity
- sanity/probe quality
- code-work boundary
- write-back boundary
- handoff discipline
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
