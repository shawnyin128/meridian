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
  memory.md
  threads/index.md
  threads/<thread>.md
  experiments/index.md
  experiments/<experiment>.md
  proposals/index.md
  proposals/<proposal>.md
```

`state.md` stores the global `active_thread`. `memory.md` stores short-lived
notes that are not yet stable enough to become a thread, experiment, or
proposal. Each thread stores its own `active_node`. Index files are navigation
artifacts maintained by skill convention and checklist; individual thread,
experiment, and proposal files are the source of truth.

## Lazy Init

Lab uses lazy init. The user should not need to remember a separate setup step
before sharing an idea, failed run, or experiment plan.

At the start of any Lab workflow, the agent checks for `.meridian/` in the
target repo. If it is missing, the agent asks for confirmation and then creates
only the minimal skeleton:

```text
.meridian/state.md
.meridian/memory.md
.meridian/threads/index.md
.meridian/experiments/index.md
.meridian/proposals/index.md
```

Thread, experiment, and proposal files are created only when the current task
needs them. This keeps Lab project setup cheap while still giving every repo a
stable place for active pointers, short memory, thread navigation, experiment
evidence, and local finding proposals.

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

### Experiment

An Experiment is an independent evidence record. It stores the question,
primary target, targets and impacts, command/config/output identity, result,
validity, and interpretation. Experiments can target nodes or local proposals.
If an experiment is invalid, preserve it as evidence. If a node was supported
only by invalidated evidence, retract the node to `unresolved` and record the
reason in node history.

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

## Development Handoff

Lab does not perform code work or git convergence. When an approach node needs
implementation, debugging, tests, reruns, commits, release, or convergence, Lab
creates a Development Handoff Packet instead of doing the work itself.

The handoff should include:

- active thread/node or raw idea
- Paper Wiki grounding that shaped the decision
- smallest development question or task
- expected command/config/output identity
- metric or validity criteria
- what result would update the Lab node or proposal

After the coding workflow completes, Lab can record the returned experiment
evidence and update the idea graph.

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
