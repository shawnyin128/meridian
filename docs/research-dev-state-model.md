---
type: product-design
title: "Lab Idea Graph State Model"
status: draft
created: 2026-05-25
updated: 2026-05-26
tags:
  - research-dev
  - state-model
  - paper-wiki
confidence: medium
---

# Lab Idea Graph State Model

Lab is a skill-only workflow for research idea graph management. It keeps active
research state in the target repo's `.meridian/` directory and uses Paper Wiki
as the grounding and long-term write-back substrate. It does not add a Lab MCP
server, CLI, daemon, database, workflow engine, or coding agent.

The older "Research Dev" framing is superseded for product behavior. Lab now
owns idea placement, approach trees, experiment evidence, and local finding
proposals. Code implementation, debugging, tests, commits, release, and
convergence belong to the user's normal coding workflow.

## Source Of Truth

```text
.meridian/
  state.md
  threads/index.md
  threads/<thread>.md
  experiments/index.md
  experiments/<experiment>.md
  proposals/index.md
  proposals/<proposal>.md
```

`state.md` stores only the global `active_thread`. Each thread stores its own
`active_node`. Index files are navigation artifacts maintained by skill
convention and checklist; individual thread, experiment, and proposal files are
the source of truth. Lab does not keep a separate `memory.md`; in Arbor repos,
short-term workflow recovery belongs to Arbor, and unplaced ideas should be
placed or confirmed instead of being parked in a second memory file.

## Lazy Init

Lab uses lazy init. The user should not need to remember a separate setup step
before sharing an idea, failed run, or experiment plan.

At the start of any Lab workflow, the agent checks for `.meridian/` in the
target repo. If it is missing, the agent asks for confirmation and then creates
only the minimal skeleton:

```text
.meridian/state.md
.meridian/threads/index.md
.meridian/experiments/index.md
.meridian/proposals/index.md
```

Thread, experiment, and proposal files are created only when the current task
needs them. This keeps Lab project setup cheap while still giving every repo a
stable place for active pointers, thread navigation, experiment evidence, and
local finding proposals without duplicating Arbor memory.

The repo includes `initialize_lab_space` as an internal helper for release/debug
checks and agent workflows. It is not a product CLI, MCP server, daemon,
database, or router.

## Core Objects

### Research Thread

A Research Thread is one research problem. It owns an approach tree and can be
closed only by user judgment. Closing a thread creates a final summary and
extracts reusable findings into local proposals.

### Approach Node

An Approach Node is the smallest verifiable method in a thread's approach tree.
Node modes are exactly:

- `unresolved`: no reliable conclusion yet.
- `repairable`: the node failed, but has a credible explanation and repair
  direction.
- `supported`: evidence supports continuing along this path.
- `dead`: the node failed in a way that is not repairable.

The agent may automatically update same-node facts such as experiment results,
assumption status, node history, `supported`, and invalid-evidence retraction.
The user must confirm `repairable`, `dead`, new node creation, active thread or
node switching, thread close/reopen, and canonical wiki publish.

Approach nodes can also carry a `Research Prior` block when the node depends on
an existing method family, prompt pattern, metric, evaluation protocol,
ablation, probe, baseline, or failure interpretation. Before Lab finalizes a
plan, feasibility judgment, experiment design, or Research Grounding Injection,
it scans for these research-prior slots and grounds each research-bearing slot through
`meridian.context` first. This block records what the Paper Wiki grounding
contributed to the node design without changing node mode by itself.

Allowed Research Prior states are exactly:

- `needed`: Lab judges prior research should be checked, but it has not been
  checked yet.
- `checked`: Paper Wiki grounding was found and shaped the plan.
- `missing`: Lab checked because prior was needed, but found no strong enough
  grounding.
- `deferred`: prior is needed, but this round intentionally postpones the
  lookup and records why.
- `not_needed`: the item is local-only or does not affect research judgment.

`needed` is a temporary planning marker, not a final answer. A final Lab plan
should turn every identified slot into `checked`, `missing`, `deferred`, or
`not_needed`.

Allowed Research Prior triggers are exactly:

- `method`
- `prompt`
- `metric`
- `eval`
- `ablation`
- `probe`
- `failure`
- `baseline`

`missing` is an important under-grounded state, not an error. It means Lab
decided prior grounding was needed but the Paper Wiki did not provide enough
relevant or trustworthy context. The agent may propose a judgment or minimal
local probe, but if that judgment affects an approach node, experiment design,
metric validity, prompt design, or failure interpretation, the user must confirm
before Lab treats it as the current path. User confirmation does not convert
`missing` into `checked`; it only records that the user accepted the
under-grounded risk for this exploration step.

The default grounding path is `meridian.context`, followed by `meridian.read`
for selected canonical sections when returned pages could change the plan, and
`meridian.trace` when provenance, trust state, or evidence identity affects the
decision.

Official benchmark, baseline, eval, metric, score, and leaderboard work uses a
stricter `Official Benchmark Fidelity` sub-block. It records official runner
entrypoint, task source / split source, config defaults, metric function,
aggregation granularity, local wrapper changes, provider substitution,
history/context hook changes, reporting-only changes, and whether reported
numbers are official metrics or derived diagnostics. Missing official evidence
stays `missing` and requires user confirmation before the under-grounded path
is accepted.

### Experiment

An Experiment is an independent evidence record. It stores the question,
primary target, targets and impacts, command/config/output identity, result,
validity, and interpretation. Experiments can target nodes or local proposals.
If an experiment is invalid, preserve it as evidence. If a node was supported
only by invalidated evidence, retract the node to `unresolved` and record the
reason in node history.

Experiments can carry their own Research Prior block when the experimental
design depends on a metric, baseline, prompt, evaluation protocol, ablation,
probe, or failure claim. This prior explains why the experiment is designed a
certain way; the experiment result remains the evidence that can support,
refute, or update nodes and proposals.

### Finding Proposal

A Finding Proposal is a local reusable research finding. Proposal states are
exactly:

- `draft`
- `strengthening`
- `ready`
- `published`
- `rejected`
- `archived`

Proposals can run strengthening experiments using the shared experiment schema.
A proposal becomes `ready` only after evidence covers the key scope. Ready
local proposals can be transferred into Paper Wiki draft proposals; canonical
wiki publish still requires lint/review and user confirmation.

Before transfer, create a Wiki Transfer Packet. It maps local experiment
evidence to Paper Wiki grounding and explicitly separates source facts, wiki
synthesis, local experiment evidence, user insight, and uncertainty. A ready
proposal without source experiments, target wiki pages, and a transfer gate is
not publish-ready.

## New Idea Placement

When a new idea appears:

1. Preserve the raw idea.
2. Check existing `.meridian/threads/` only.
3. Show at most three placement candidates.
4. If there are no existing thread candidates, say so and present `root` as
   the safe placement. A missing candidate is not a reason to skip thread
   creation for a durable research idea.
5. Ask the user to choose `root`, `child`, `sibling`, or `link`.
6. Create an independent thread seed for `root` or `link`; attach to the
   existing tree for `child` or `sibling`.
7. After placement, run Paper Wiki grounding when paper/method/concept/evidence
   context matters.
8. Ask before switching active thread or active node.

`link` records inspiration or relatedness but still creates an independent
thread seed. `sibling` means an alternative approach under the same parent
problem. `child` means the node inherits a parent problem or repair target.

When `.meridian/` already exists with only `threads/index.md`, the correct
new-idea behavior is to ask for or create a root thread seed and then continue
the requested development task. Direct coding without a thread seed is reserved
for pure engineering chores or when the user explicitly says not to record Lab
state.

## Thread Close And Reopen

Thread close is never inferred from node color alone. The user decides when the
research thread is done or paused indefinitely. Closing a thread creates a final
summary covering supported paths, dead paths, key experiments, reusable
findings, and local proposals. Reopening a thread requires user confirmation of
the active node.

## Git Checkpoints

## Research Grounding Injection

Lab does not perform code work or git convergence. When an approach node needs
implementation, debugging, tests, reruns, commits, release, or convergence, Lab
injects implementation-relevant Paper Wiki grounding into the normal coding
workflow instead of creating a durable Lab handoff state file.

The injection should include:

- active thread/node or raw idea
- Paper Wiki grounding that should shape implementation
- related papers, code/repo links, relevant modules/functions, baseline/metric
  definitions, probe definitions, or paper implementation patterns when
  available
- Official Benchmark Fidelity when the task claims official benchmark,
  baseline, eval, metric, score, or leaderboard compatibility
- smallest development question or task as a coding implication
- Implementation Integrity Gate when the implementation could be silently
  downgraded to legacy, fallback-only, partial, stub, no-op, or swallowed-error
  behavior; name the required current behavior, current API/data
  layout/version/contract when relevant, forbidden shortcuts, blocker-reporting
  requirement, and validation that proves the requested primary path rather
  than only a fallback path
- Research Code Style for exploratory slices: prefer a readable main flow that
  keeps source branches, configs, seeds, splits, metrics, sample limits, and
  output identity visible near the call site; avoid single-use
  parser/loader/selector helper layers unless real reuse, risky boundary
  isolation, or a stable external API justifies them.
- expected command/config/output identity
- metric or validity criteria
- official metric versus derived diagnostic labels for benchmark results
- return signal: what result would update the Lab node or proposal

Lab can require this style in the injection, but final generated code satisfies
it only if the receiving coding workflow or evaluator enforces it as an
acceptance criterion. After the coding workflow completes, Lab can record the
returned experiment evidence and update the idea graph.

## Paper Wiki Boundary

Lab manages the research search tree and local evidence. Paper Wiki
manages long-term compiled knowledge. A local finding proposal is the maturity
layer between them:

```text
local experiment -> reusable finding proposal -> Paper Wiki draft -> canonical wiki
```

Local experiment evidence is not paper source fact. It can become wiki
synthesis, implementation notes, failure modes, or research-question context
only through proposal-first write-back.

## Lab State Validation

Lab remains skill-only: there is no Lab product CLI, MCP server,
daemon, database, or workflow engine. The repo does include a small internal
validator for release/debug checks:

```python
from meridian.lab import validate_lab_space

report = validate_lab_space(repo_root)
```

The validator checks the `.meridian/` layout, `active_thread`, per-thread
`active_node`, allowed node modes, experiment validity values, proposal states,
and the ready-proposal transfer gate. It is a guardrail for templates and tests,
not an agent router.
