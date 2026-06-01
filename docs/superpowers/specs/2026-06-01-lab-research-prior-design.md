# Lab Research Prior Design

Date: 2026-06-01
Status: proposed

## Purpose

Improve Lab so research plans and idea-graph state actively preserve the prior
research basis behind methods, prompts, metrics, experiments, and failure
interpretations.

This is a Lab behavior and state-model refinement. Lab remains an idea-graph
manager, not a coding agent, workflow engine, MCP product, CLI, daemon, or
release system. Paper Wiki remains the grounding substrate.

## Problem

The current Lab skill says to retrieve Paper Wiki context when prior methods or
evidence matter, but the trigger is too implicit. In practice, a plan can
include research-bearing decisions such as LLM-as-Judge prompt design, rubric
calibration, ablation structure, probe design, metric validity, or known failure
modes without Lab reliably asking what prior work says.

The old shape is:

```text
idea -> plan -> agent may remember to retrieve wiki context
```

The desired shape is:

```text
idea -> approach / experiment / evaluation / failure slot
     -> slot carries a research-prior obligation
     -> Paper Wiki grounding or explicit missing-prior gate
     -> plan, evidence, or handoff
```

## Scope

### In Scope

- Add a lightweight `Research Prior` block to Lab thread, approach node, and
  experiment templates where relevant.
- Update Lab behavior so high-prior research slots trigger prior classification
  before plan finalization.
- Preserve prior provenance and its impact on the plan in `.meridian/` state.
- Add a `missing` prior state for cases where Lab judged a prior necessary but
  Paper Wiki did not provide enough grounding.
- Update eval/rubric coverage for prompt, metric, eval, ablation, probe, and
  failure-interpretation scenarios.

### Out Of Scope

- No new Lab MCP, CLI, daemon, database, or routing engine.
- No code implementation or git convergence behavior inside Lab.
- No requirement to retrieve Wiki for pure local engineering chores.
- No fixed numeric cap on how many priors can be checked.
- No promotion of paper prior into local experiment evidence.

## Research Prior Block

Use the same compact block shape in thread, approach node, and experiment
contexts:

```text
Research Prior
- status:
- trigger:
- query:
- wiki grounding:
- agent judgment:
- user confirmation:
- impact:
```

Allowed `status` values:

- `needed`: Lab judges prior research should be checked, but it has not been
  checked yet.
- `checked`: usable Paper Wiki grounding was found and shaped the plan.
- `missing`: Lab checked because prior was needed, but found no strong enough
  grounding.
- `deferred`: prior is needed, but this round intentionally postpones the
  lookup; the reason must be recorded.
- `not_needed`: the item is local-only or does not affect research judgment.

Allowed `trigger` values:

- `method`
- `prompt`
- `metric`
- `eval`
- `ablation`
- `probe`
- `failure`
- `baseline`

The block records summaries and page references, not large retrieval dumps.

## Trigger Rules

Lab should classify research priors whenever it creates or updates:

- an approach node that names a method family or mechanism
- an experiment design with a baseline, ablation, probe, metric, or evaluation
  protocol
- a prompt or rubric design, especially LLM-as-Judge or human-agreement tasks
- a failure interpretation that may match known failure modes
- a development handoff whose implementation details depend on a research
  method or measurement convention

Pure local engineering items such as file layout, CLI flag wiring, logging
format, and test command cleanup are `not_needed` unless they materially affect
research interpretation.

## Missing Prior Gate

`missing` is a valid and important terminal result for a lookup. It means:

```text
Lab judged this decision should have research grounding.
Paper Wiki did not provide enough relevant or trustworthy grounding.
The agent may propose a judgment or minimal local probe.
The decision is not grounded until the user accepts the risk or evidence arrives.
```

When a missing prior affects an approach node, experiment design, metric
validity, prompt design, or failure interpretation, Lab should ask for user
confirmation before treating the agent judgment as the current path.

User confirmation does not convert `missing` to `checked`. It changes the gate
from `required` to `accepted`, while preserving the under-grounded state.

Example:

```text
Research Prior
- status: missing
- trigger: prompt
- query: "LLM-as-Judge prompt design and rubric calibration"
- wiki grounding: no strong prior found
- agent judgment: use pairwise rubric with calibration examples
- user confirmation: accepted
- impact: proceed with a local probe; do not treat judge results as reliable
  until calibration evidence exists
```

## Behavior Impact

Lab becomes more structured, but not more agentic. It still manages ideas,
approach trees, experiment evidence, and local finding proposals. It still hands
implementation, debugging, tests, commits, release, and convergence to the
normal coding workflow.

The practical change is that Lab must preserve why a research decision was made:

- `checked` prior: what Paper Wiki pages shaped the decision and how
- `missing` prior: what was searched, why it matters, and what user judgment or
  probe is needed
- `not_needed` prior: why no research grounding was required

Development handoff packets should include relevant prior blocks when the
handoff depends on a research method, prompt, metric, or evaluation design.

## Risks And Mitigations

- Template noise: only write a `Research Prior` block when a trigger exists or
  a skipped prior decision matters.
- Over-retrieval: retrieve for research-bearing decisions, not local-only
  engineering chores.
- Evidence confusion: prior shapes design; node support still comes from valid
  experiment evidence.
- Weak Wiki coverage: record `missing` instead of pretending the plan is
  grounded.
- State bloat: store page refs and impact summaries, not full context dumps.

## Testing

Add or update checks for:

- Lab skill describes research-prior behavior without reintroducing coding-agent
  ownership.
- Templates contain the compact `Research Prior` block where appropriate.
- Eval cases cover:
  - LLM-as-Judge prompt/rubric design
  - metric validity or pairwise/scalar evaluation choice
  - ablation/probe design
  - failure interpretation with known-failure lookup
  - missing prior that requires user confirmation
- Rubric checks:
  - correct trigger classification
  - Paper Wiki grounding when prior is required
  - valid `missing` handling
  - no conflation of prior with experiment evidence
  - no Wiki retrieval for pure local engineering

## Release Evidence

Minimum verification after implementation:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-lab-prior-pycache PYTHONPATH=src python3 -m compileall src tests
git diff --check
PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki
```

Expected result: Lab remains skill-first and lightweight, while research-bearing
Lab plans leave durable prior state that later agents can inspect.
