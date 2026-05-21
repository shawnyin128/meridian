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

### 1. Idea Capture / Triage / Evolution

Use when a user shares a research idea, debug intuition, paper-reading spark, or
possible direction that is not yet ready to become an experiment.

Minimum completion:

- preserve the raw idea faithfully
- normalize it into a testable hypothesis
- retrieve Paper Wiki context when prior work, methods, concepts, evidence, or
  failure modes matter
- summarize support, contradiction, novelty risk, implementation risk, and
  missing evidence
- choose the next decision: `inbox`, `test_next`, `revise`, `pause`, `kill`, or
  `promote`
- create an Idea Card under the target repo's `.meridian/ideas/` when the idea
  is durable enough to track
- write back only durable findings through Paper Wiki proposals

### 2. Idea To Experiment Design

Use when a user has a research idea or suspected mechanism and wants the
smallest useful experiment.

Minimum completion:

- retrieve Paper Wiki context first
- identify relevant methods, concepts, claims, evidence, and gaps
- inspect repo constraints only as needed
- define the research question and expected learning
- propose controls, ablations, probes, and sanity checks
- name command/config/output identity when known
- suggest a git checkpoint before risky implementation

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

### Idea Card

Purpose: keep a research idea as lightweight dev working state before it becomes
an experiment or wiki proposal.

Default target-repo path:

```text
.meridian/ideas/<idea-slug>.md
```

Required sections:

- Raw Idea
- Hypothesis
- Wiki Grounding
- Feasibility Read
- Minimal Test
- Evidence Log
- Decision
- Write-back Candidate

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

The product-facing skill is `.codex/skills/meridian-research-dev/SKILL.md`.

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

## Idea Management Contract

Idea management belongs to Research Dev, not the canonical Paper Wiki layer.
Raw or half-formed ideas are active hypotheses, experiment candidates, or debug
intuitions. They should stay in an Idea Card until they generate durable
research memory.

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

The MVP does not add a `meridian dev` CLI yet. Skill + templates are enough for
the first usable flow and preserve agent freedom. A deterministic `meridian dev
scaffold` command can be added later if repeated template generation becomes
friction.
