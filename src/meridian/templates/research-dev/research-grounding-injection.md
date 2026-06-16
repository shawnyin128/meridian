---
type: research-grounding-injection
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_type: lab_idea_graph
confidence: medium
---

# Research Grounding Injection

Use this as a compact pre-coding block, not as durable Lab state. Inject only
the Paper Wiki and implementation grounding that should shape the next coding
workflow.

## Research Anchor

- thread / node / proposal:
- active question:

## Wiki Grounding

| Page | Role | Boundary |
| --- | --- | --- |
|  | `paper | method | concept | claim | evidence | synthesis | user insight` | `source fact | wiki synthesis | user insight | uncertainty` |

## Implementation Prior

- related papers:
- code/repo links:
- relevant modules or functions:
- baseline / metric / probe definitions:
- implementation pattern to preserve:

## Source Boundary

- reliable source facts:
- wiki synthesis:
- user insight:
- missing grounding:
- uncertainty:

## Coding Implication

- inspect first:
- prefer:
- avoid:
- minimal validation:

## Implementation Integrity Gate

- required current behavior:
- current API / data layout / version:
- forbidden shortcuts:
  - legacy-only implementation
  - fallback-only implementation
  - placeholder / no-op / comment-marker-as-success
  - swallowed errors that pretend success
- blocker reporting required: yes
- validation must prove:

## User Coding Style Principles

- Source: `~/.meridian/coding-style.md` or active `MERIDIAN_CONFIG_HOME`.
- Relevant principles:
- Notes:

## Research Code Style

- Applies to exploratory research slice: yes | no
- Expected shape:
  - prefer one readable main flow when building a one-off calibration,
    dataset, probe, ablation, sanity-check, or eval path
  - keep source branches, configs, seeds, splits, metrics, sample limits, and
    output identity visible near the call site
  - avoid single-use parser, loader, selector, and wrapper helpers unless they
    express real reuse, risky boundary isolation, or a stable external API

## Return Signal

State which command, config, output, metric, or observation should return to Lab
as experiment evidence or a local finding proposal candidate.
