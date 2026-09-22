---
type: research-thread
title: ""
status: open
created: YYYY-MM-DD
updated: YYYY-MM-DD
active_node: A
related_threads: []
---

# Research Thread: <Title>

## Root Problem

State the research problem this thread is trying to resolve.

## Placement

- relation: `root | child | sibling | link`
- placed_after_thread_check: true
- inspired_by:
- parent_thread:
- parent_node:

## Wiki Grounding

Run Paper Wiki grounding after placement when papers, methods, concepts,
evidence, or failure modes matter.

| Page | Role | Why It Matters |
| --- | --- | --- |

## Approach Tree

Maintain approach nodes as the smallest verifiable methods. Node modes are
exactly `unresolved`, `repairable`, `supported`, or `dead`.

### Node A: <Initial Approach>

- mode: `unresolved`
- active: true
- parent:
- problem_inherited:
- method:

#### Research Prior

- status: `needed | checked | missing | deferred | not_needed`
- trigger: `method | prompt | metric | eval | ablation | probe | failure | baseline`
- query:
- mcp grounding: `meridian.context | meridian.read | meridian.trace | not_needed | deferred`
- wiki grounding:
- agent judgment:
- user confirmation: `required | accepted | not_required`
- impact:

#### Official Benchmark Fidelity

- official runner entrypoint:
- official task source / split source:
- official config defaults:
- official metric function:
- official aggregation granularity:
- local wrapper changes:
- provider substitution:
- history/context hook:
- reporting-only:
- result label: `official metric | derived diagnostic | local variant | missing`
- benchmark faithfulness review:

#### Assumptions

| Statement | Status | Evidence | Note |
| --- | --- | --- | --- |
|  | `unknown | supported | refuted` |  |  |

#### Experiments

- `<experiment-id>`

#### Supporting Artifacts

Experiments, Paper Wiki priors, implementation links, and local proposals
support this research point and are not default graph nodes.

| Type | ID | Title | Impact | Path |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

#### History

- YYYY-MM-DD: Created thread seed.

#### Next Action

Define the next research move.

## Graph Relations

Use this table for non-tree research graph links between core research points.
Generated graph files are rebuilt from this control-plane Markdown.

| Source | Relation | Target | Strength | Note |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Thread Final Summary

Only fill this when the user decides the thread is closed.

- final decision:
- supported path:
- dead paths:
- key experiments:
- reusable findings:
- local proposals created:
