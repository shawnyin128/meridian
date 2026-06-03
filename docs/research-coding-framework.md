---
type: architecture
title: "Research Coding Loop Framework"
status: draft
created: 2026-05-18
updated: 2026-05-18
tags:
  - llm-wiki
  - research-coding
  - workflow-lessons
  - multi-agent-research
confidence: medium
---

# Research Coding Loop Framework

Status note for Meridian 0.4.0: the original "Research Dev Agent" direction is
superseded as a product boundary. Lab owns the idea graph and Wiki-grounded
research memory. Actual code implementation, debugging, tests, commits,
release, and convergence belong to the normal coding workflow. Treat the
development-agent material below as legacy design background, not current
Meridian Lab behavior.

## Product Boundary

Meridian should be understood as a two-product research system:

1. **Paper Wiki Workflow**: a workflow product for building and maintaining a personal paper/research wiki.
2. **Lab Idea Graph**: a lightweight skill for idea placement, Wiki-grounded feasibility, approach trees, experiment evidence, development handoffs, and local finding proposals.

They should work well together, but each must be useful alone.

Standalone modes:

- Wiki-only: the user uses Meridian to internalize papers, capture annotations, evolve paper analysis, retrieve relevant research pages, and develop ideas without touching code.
- Lab-only: the user uses Meridian inside a repo to place ideas, manage approach trees, interpret results, and record experiment memory even when no paper wiki exists yet.
- Integrated: Lab retrieves from the paper wiki before feasibility decisions or development handoffs, then writes experiment results, failed paths, and refined understanding back into the wiki.

This boundary changes the product model: the wiki remains a predefined workflow, Lab remains a lightweight idea graph, and coding remains the responsibility of the normal development workflow.

## Paper Wiki As MCP

The Paper Wiki should be deliverable as an MCP server. This gives the system a clean boundary:

- the wiki owns paper ingestion, annotation integration, claim/method/idea pages, provenance, index, and log
- the MCP layer exposes stable tools and resources over that knowledge
- Lab and external coding workflows consume the wiki through MCP instead of
  depending on vault paths or internal file conventions
- other clients can use the same paper memory without adopting Lab

This preserves the wiki as a workflow product while making it reusable infrastructure. MCP is a delivery surface, not the source of truth. The source of truth remains the Markdown wiki plus raw immutable sources and schema.

Initial MCP capabilities should be small and concrete:

- `search_research_memory`: find relevant papers, claims, methods, ideas, experiments, and results
- `build_context_packet`: return selected pages and selection reasons for a user request or coding task
- `read_wiki_page`: read a specific page with provenance metadata
- `propose_write_back`: accept experiment/code evidence and produce a reviewable wiki update proposal
- `ingest_source`: start a controlled paper or annotation ingest workflow

Writes should be conservative at first. Prefer propose/apply separation so Lab
or the external normal coding workflow can send experiment evidence back
without silently rewriting canonical research memory.

## Source-Grounded Development Principles

See `docs/source-grounded-development-principles.md` for the full synthesis from Karpathy's LLM Wiki guide, Anthropic agent engineering posts, and selected community followup lessons.

The development framework should internalize these rules:

- start with simple, composable workflows and add agentic complexity only where research uncertainty requires it
- use progressive disclosure for skills, wiki pages, and MCP tools
- keep context packets small, high-signal, and provenance-rich
- design Paper Wiki MCP tools around agent tasks, not raw internal files
- require realistic evaluations for MCP tools and dev-agent behavior
- let the external coding workflow inspect, run, diagnose, and recover without
  turning Lab into the developer
- constrain outputs through learning targets, evidence identity, and write-back proposals
- preserve useful negative results and failed paths as research memory

## Legacy Development-Agent Boundary

This section records the earlier development-agent design background. It is not
the current Meridian product boundary. Current Lab behavior should preserve idea
graph state, Paper Wiki grounding, experiment evidence, local finding proposals,
and development handoffs; implementation, debugging, tests, commits, release,
and convergence stay in the external normal coding workflow.

The legacy development plugin direction optimized for research work, not generic software cleanliness. Its job was to help the researcher move through idea, implementation, observation, interpretation, and memory.

Minimum product bar:

1. **Write research-grade code**: produce code that is clear, readable, maintainable, and easy to extend for experiments.
2. **Serve as the wiki gateway**: use the paper/wiki memory as a main entry point for development, so coding decisions can be grounded in prior papers, claims, methods, failed paths, and user insights.
3. **Use git as research time travel**: create meaningful staged checkpoints so uncertain experiments, probes, and refactors can be compared, reverted, or split by impact.

These were not separate nice-to-have features in the legacy direction. They
defined why a development plugin would have existed. In the current product,
Lab keeps the research-state side of this loop and hands code work to the
external normal coding workflow.

Research-friendly code is the target artifact:

- readable to the researcher during an active idea loop
- easy to extend with ablations, probes, metrics, baselines, and method variants
- explicit about configs, seeds, dataset splits, commands, output paths, and metric definitions
- often linear for one-off calibration builders, probes, ablations, sanity
  checks, dataset scripts, and eval scripts, so the experimental decisions stay
  visible in the main flow
- instrumented so the researcher can inspect intermediate behavior
- maintainable enough that future experiments can reuse the path
- allowed to contain purposeful redundancy when that redundancy improves comparison, inspection, or variant isolation
- checkpointed so the researcher can recover a useful intermediate state after a later idea turns out wrong

In the legacy development-agent direction, the coding agent would not
automatically push toward the shortest or cleanest abstraction. In research,
code sometimes needs visible seams: separate variants, duplicated-but-comparable
config blocks, probe hooks, debug prints guarded by flags, and result tables
that expose more than a production system would expose.

A concrete anti-pattern is splitting a small exploratory dataset or calibration
path into single-use parser, loader, selector, and wrapper helpers when those
helpers hide the source-specific branches, split choices, shuffle seed, sample
limit, or metric/output identity. The desired shape is a readable main function
or script where those research choices are visible, with helpers reserved for
real reuse, risky boundary isolation, or a stable external API.

For an external normal coding workflow, adaptive reasoning and tool use should
remain flexible. Meridian should define the evidence to preserve, the handoff
identity, and the memory write-back contract. It should not turn Lab into the
owner of every coding step.

Allowed autonomy:

- inspect code, configs, logs, checkpoints, scripts, and generated outputs
- decide whether the next move is code reading, a command, a small probe, an ablation, a sanity check, or a wiki lookup
- proactively retrieve wiki context when paper definitions, prior methods, result memories, failed paths, or the user's accumulated insights are relevant
- add research instrumentation when it directly answers the user's "why" question
- preserve failed attempts as evidence when they change the next research decision

Hard boundaries:

- do not optimize primarily for production-style elegance
- do not collapse exploratory code into canonical paths without marking the transition
- do not run expensive experiments without a clear learning target and evidence plan
- do not treat passing tests as sufficient research interpretation
- do not silently rewrite broad wiki state from a coding task; use a write-back packet or wiki workflow gate

## Git Checkpoint Discipline

Research coding has unusually high rollback pressure. The researcher often does not know which implementation detail, probe, ablation, or failed experiment will become useful later. Git should therefore be treated as a research timeline, not only as a release mechanism.

The external normal coding workflow should encourage and prepare staged commits
when:

- a hypothesis implementation first becomes runnable
- an ablation/probe/debug instrumentation layer is added
- a result changes the next research decision
- an exploratory branch is about to be simplified or merged into a cleaner path
- a risky refactor could erase useful negative evidence
- the user is about to try a different direction but may need to return quickly

Checkpoint commits should be small enough to support impact-based rollback:

- one conceptual research move per commit when feasible
- keep mechanical cleanup separate from hypothesis logic
- keep instrumentation/probes separate from method changes
- include command/config/result identity in commit messages or linked experiment notes when relevant
- avoid committing generated heavy artifacts unless they are intentionally part of the evidence record

The external normal coding workflow should not commit when the user limits
commit behavior or unrelated dirty work makes the scope ambiguous. Otherwise,
that workflow should default to focused checkpoints after runnable research-code
slices, diagnostic fixes, experiment setups, or interpreted results. The
checkpoint is part of the research timeline, not a release gate.

Git history, experiment notes, and wiki write-back should line up:

```text
commit -> command/config -> result artifact -> interpretation -> wiki/result page
```

This alignment lets the researcher answer: "What changed?", "What did it affect?", "Can I roll it back?", and "What did we learn?"

## Purpose

Meridian should evolve from a paper wiki into a lightweight end-to-end research coding framework. The goal is not to rebuild a managed feature workflow and not to create a general multi-agent coding platform. The goal is to support the real loop of one researcher:

```text
read papers -> form ideas -> write code -> run experiments -> interpret results -> update research memory -> generate better ideas
```

Lab state sits on the idea-graph side of this loop. A raw idea is not a
canonical wiki fact; it is active research working state. Meridian should place
the idea in the target repo's `.meridian/` research space, ground it with Paper
Wiki context after placement, connect it to approach nodes and experiment
evidence, and only write durable findings back to the wiki through
proposal-first paths.

The shared system surface is still the LLM-maintained research state, but the products around it have different control models:

- The paper wiki is workflow-first: predictable ingest, evolve, retrieve, lint, and write-back paths.
- Lab is idea-graph-first: it uses lightweight Markdown state to preserve idea
  placement, approach trees, experiment evidence, and handoffs.
- The external normal coding workflow owns adaptive implementation, debugging,
  tests, commits, release, and convergence.
- The integration contract is a context packet, development handoff, and
  write-back protocol between wiki state, Lab state, and coding evidence.

## Research Event Boundary

Research development is a trial-and-error loop between ideas and evidence. The full event surface is broad: reproduction, experiment design, execution, debugging, sanity checks, analysis, paper implementation, data work, evaluation, result recording, research decisions, and repo organization. See `docs/research-event-map.md` for the full map.

The framework should not own all of those as first-class MVP workflows. Many are ordinary coding or data-engineering tasks that should be handled directly when they are small.

The state model lives in `docs/research-dev-state-model.md`. The scenario-level
product contract lives in `docs/research-dev-use-cases.md`, and the
implementation plan lives in `docs/research-dev-mvp-plan.md`. Treat those
documents as the Lab MVP's user-facing map before implementing skills, MCP
usage patterns, or evaluation cases.

The high-leverage MVP workflows are now organized around research-space state:

1. **New idea placement**: compare against existing threads, confirm root/child/sibling/link, then seed the research thread.
2. **Approach exploration**: maintain a tree of smallest verifiable method nodes with unresolved/repairable/supported/dead modes.
3. **Experiment evidence**: record independent experiment files with command/config/output identity and target impacts.
4. **Finding proposal maturation**: strengthen reusable local findings before transferring ready proposals to Paper Wiki.
5. **Sanity and reproduction checks**: prevent wasting GPU on broken code, wrong metrics, or inactive configs.

These matter because they sit at the boundary between paper knowledge,
implementation, experiment evidence, and the user's next idea. Other tasks enter
the framework only when they support one of these workflows.

## Product Interaction Contract

The two products communicate through explicit artifacts, not hidden chat state.

### Wiki To Lab And External Coding Workflow

The wiki provides:

- relevant paper, claim, method, idea, and failed-path pages
- context packets with selection reasons and gaps
- paper-grounded definitions of metrics, methods, and claims
- prior experiment memory and unresolved questions

Lab consumes this context before idea placement, feasibility review, handoff, or
result interpretation. The external normal coding workflow can also consume it
before planning experiments or coding when the task depends on prior research
knowledge.

### Lab And External Coding Workflow To Wiki

Lab and the external normal coding workflow write back:

- experiment notes: purpose, config, command, environment, result, interpretation, next step
- result-to-claim updates
- failed experiment memory
- newly discovered implementation details from reproduction work
- refined idea or hypothesis status

Lab and the external normal coding workflow should not silently rewrite broad
canonical wiki pages. Broad research-state updates should go through wiki
workflow review/draft gates.

### Shared Context Packet

Both products should use the same context packet shape:

- request intent
- selected pages/files/runs
- why each item was selected
- relevant evidence
- conflicts or uncertainty
- gaps and next questions
- allowed write policy

## Why Feature Workflows Do Not Fit Research Directly

Managed feature workflows are designed for long-running repository development. Their strongest ideas are context recovery, project-local memory, review evidence, done-when criteria, decision trace, and release checkpoints.

Those ideas are useful, but their default unit is a managed software feature. Research coding has a different unit: a hypothesis under uncertainty. That difference creates friction:

- Research is exploratory; success may be a negative result, not a completed feature.
- The work loops through papers, ideas, code, experiment logs, and interpretation, not only repo diffs.
- "Done" is often "we learned this path is weak" rather than "the feature passes tests."
- The user needs idea feedback and literature grounding before implementation, not only a develop/evaluate handoff.
- Heavy feature registries and release checkpoints can slow down small exploratory steps.
- Evaluation must judge research state updates, not only code correctness.

So the new framework should borrow evidence discipline, but replace feature-centric workflow with research-loop state.

## Borrowed From Mature Dev Workflows

Keep these:

- Project-local context entrypoint: `AGENTS.md`.
- Short-term unresolved state: a project-local session memory file.
- Durable review/evidence artifacts for important decisions.
- Done-when thinking, but adapted to research outcomes.
- Decision trace: key assumptions, rejected options, and invariants should survive across sessions.
- Outcome-first evaluation: check final state and evidence, not exact path matching.
- Optional delegation packet with objective, output format, scope, effort budget, and stop condition.

Do not keep these as MVP defaults:

- Full feature-intake, development, review, and release ceremony.
- Feature registry as the primary product state.
- Release checkpoints for exploratory research steps.
- Multi-agent or worktree fan-out as the default coding path.
- Strict feature completion framing for uncertain experiments.

## Borrowed From Anthropic Multi-Agent Research

Anthropic's research system is useful here because it separates open-ended research from ordinary coding. The important lessons:

- Multi-agent systems are valuable when the task is broad, high-value, and parallelizable.
- They are costly and should not be used for simple or tightly coupled coding tasks.
- The lead process needs explicit delegation packets: objective, output format, tools/sources, boundaries, and effort budget.
- Start wide, then narrow down.
- Subagents should return artifacts or compact findings, not huge conversation transcripts.
- Evaluation should focus on outcome quality, source quality, citation accuracy, completeness, and reasonable tool use.
- Persistent memory and checkpoints matter because long research tasks can exceed a single context window.

For Meridian, multi-agent work should be a research burst, not the default execution model.

Use parallel agents only for:

- literature survey across independent subtopics
- alternative method search
- prior-work conflict checking
- benchmark/dataset landscape exploration
- independent result interpretation
- adversarial review of a research claim or experiment plan

Avoid parallel agents for:

- editing the same code path
- tightly coupled implementation
- small bug fixes
- tasks where all workers need the same evolving context

## Core State Model

Meridian should track three state layers.

### 1. Research Wiki State

Markdown pages:

- `papers/`
- `claims/`
- `methods/`
- `concepts/`
- `ideas/`
- `hypotheses/`
- `experiments/`
- `results/`
- `open_questions.md`
- `context_brief.md`

Purpose: preserve research understanding and idea context.

### 2. Code Work State

Project-local artifacts:

- repo map
- active code task
- changed files
- command plan
- test plan
- known environment constraints
- implementation notes

Purpose: keep coding grounded in the research question and prevent broad accidental refactors.

### 3. Experiment Result State

Experiment artifacts:

- run configs
- command logs
- metrics
- plots
- failed runs
- interpretation notes
- result-to-claim links

Purpose: turn code execution into research evidence.

## Main Workflow

```text
1. Clarify research event
2. Retrieve paper/wiki/code/result context
3. Choose the high-leverage workflow
4. Plan the smallest research-code slice
5. Run, inspect, or diagnose
6. Update research memory and next decision
```

### 1. Clarify Research Event

Classify the request:

- experiment design
- sanity check
- result interpretation
- experiment memory
- reproduction diagnosis
- direct explanation or ordinary coding

Boundary:

- Do not force every request into managed workflow.
- If the request is pure explanation, answer directly.
- If the request is ordinary coding, handle it as coding unless it changes research evidence.
- If it changes research state, experiment evidence, or next decisions, create a small workflow slice.
- If the task requires adaptive code inspection or command execution, route to
  the normal coding workflow rather than Paper Wiki or Lab.

### 2. Retrieve Paper/Wiki/Code/Result Context

Build a context packet from:

- relevant paper pages
- claims and methods
- prior ideas and failed paths
- experiment results
- code entrypoints
- current repo constraints

The packet must say:

- why each item was selected
- what evidence it provides
- what remains uncertain
- whether the task needs literature breadth, code depth, or experiment evidence

Boundary:

- Retrieval is not a dump.
- The framework should prefer a small defensible packet over large context stuffing.

### 3. Choose The High-Leverage Workflow

Pick one primary workflow:

- Experiment design: produce experiment matrix, controls, sanity checks, and minimum run.
- Sanity check: prove the loop, metric, data, or config is not obviously broken.
- Result interpretation: explain what the run supports, weakens, or fails to answer.
- Experiment memory: write durable run notes and update result tables or wiki state.
- Reproduction diagnosis: localize mismatch between paper, repo, data, hyperparameters, environment, and reported number.

Boundary:

- Do not create a large generic task plan.
- Do not let repo cleanup, script writing, or debugging become the product unless it serves the selected workflow.

### 4. Plan The Smallest Research-Code Slice

A slice is not a software feature. It is a bounded research move:

- reproduce a result
- add one measurement
- implement one method variant
- inspect one failure mode
- compare one baseline
- test one hypothesis

Each slice needs:

- research question
- expected learning
- files or commands likely involved
- minimum evidence to interpret the result
- stop condition

Boundary:

- The plan should be small enough to evaluate even if the hypothesis fails.
- A negative result is valid if it updates the wiki and next-step state.

### 5. Run, Inspect, Or Diagnose

Use normal coding practices, but keep the research question visible.

For implementation:

- change the smallest code surface that tests the hypothesis
- preserve existing repo conventions
- avoid speculative refactors

For experiments:

- record config, command, environment, and output path
- capture failures as evidence
- avoid rerunning expensive work without a reason

Boundary:

- Do not turn every experiment into a polished product feature.
- Do not let exploratory scripts silently become canonical without review.

### 6. Update Research Memory And Next Decision

Evaluation and write-back have two layers:

- Code validity: did the command/test/run execute as intended?
- Research validity: what did this result actually prove, disprove, or fail to answer?

Check:

- metric definition
- baseline comparability
- data/config identity
- statistical or run-to-run caveats
- contradiction with prior paper/wiki claims
- whether the result changes the hypothesis

Boundary:

- Passing tests is not enough.
- A chart or metric without interpretation is not a result.
- Durable learning belongs in the wiki or experiment memory, not only chat.

Write back:

- updated paper/method/claim pages
- hypothesis status
- experiment result page
- failed route memory
- next paper or experiment suggestions
- short-term coding resume pointer when work is unfinished

Boundary:

- Durable research learning belongs in the wiki.
- Transient uncommitted code state belongs in short-term memory.
- Completed work should be recoverable from git history, docs, and wiki state.

## Lightweight Artifact Layout

```text
AGENTS.md
.meridian/memory.md
wiki/
  papers/
  claims/
  methods/
  ideas/
  hypotheses/
  experiments/
  results/
  index.md
  log.md
  context_brief.md
  open_questions.md
research/
  active-slice.md
  lab-log.md
  runs/
dev/
  context-packets/
  work-notes/
  tool-traces/
docs/review/
  <important-slice>-review.md
```

This keeps workflow continuity without making a feature registry the center of the product.

## Request Interface

The user should be able to ask in natural language:

- "Read this paper and connect it to my current project."
- "I think this method might fix my failure mode. Check the wiki and tell me if this idea is new."
- "Plan the smallest experiment to test this."
- "What sanity checks should I run before spending GPU?"
- "This baseline number is off. Diagnose likely causes."
- "Interpret these logs and tell me whether the hypothesis survived."
- "Implement the experiment scaffold."
- "Interpret these results and update the wiki."
- "What should I try next?"

The interface should respond with one of three modes:

1. Direct answer: for simple explanation.
2. Research context packet: for idea/paper/retrieval questions.
4. Research-code slice: for bounded implementation, debugging, reproduction,
   probe, or experiment work.

## Development Plan

### Phase 0: State Schema

- Define wiki page templates for papers, claims, methods, ideas, hypotheses, experiments, and results.
- Define `research/active-slice.md` and `research/lab-log.md`.
- Define context packet format.

### Phase 1: Paper To Idea Context

- Ingest one paper into wiki state.
- Add user notes or Zotero annotations.
- Retrieve relevant prior paper/claim/method pages for a new idea.
- Produce a context packet with gaps and next questions.

### Phase 2: Idea To Research-Code Slice

- Convert an idea into a bounded slice.
- Link the slice to paper/wiki evidence.
- Define done-when as learning criteria, not feature completion.
- Generate command/test/experiment plan.

### Phase 3: Slice Execution And Result Capture

- Implement or run one slice.
- Capture commands, configs, metrics, and output paths.
- Interpret the result.
- Update hypothesis/result wiki pages.

### Phase 4: Optional Research Burst

- Add bounded parallel research only for broad literature/context exploration.
- Require delegation packets and effort budgets.
- Store subagent outputs as artifacts or compact findings.
- Merge findings into a context packet before coding.

## Test Plan

Structure tests:

- Required directories and templates exist.
- Wiki pages validate frontmatter.
- Active slice file contains research question, expected learning, stop condition, and evidence plan.
- Lab log entries are parseable.

Scenario tests:

- Paper plus user insight creates a paper page and claim/method candidates.
- A user idea retrieves relevant wiki and code context.
- A slice plan names the smallest code/experiment move and stop condition.
- A completed run creates result interpretation and updates hypothesis status.
- A failed experiment is recorded as useful negative evidence.

Negative tests:

- A pure explanation request should not create workflow artifacts.
- A coding request without a research question should not pretend to be a research slice.
- A result without command/config/metric identity should not update claims as confirmed.
- Parallel research should not run for tightly coupled code edits.
- Missing or weak retrieval should report gaps instead of inventing support.

Evaluation focus:

- Did the system preserve research learning?
- Did it improve the next idea or experiment?
- Did it avoid over-ceremony for small coding steps?
- Did it keep source facts, user judgment, code evidence, and result interpretation separate?
