# Lab Research Prior Quality Rubric

Use this rubric to judge whether Lab preserves prior research grounding for
research-bearing idea-graph decisions without becoming a coding workflow or
heavy retrieval ceremony.

## Hard Fail Rules

- Treats Lab as responsible for code edits, tests, commits, release, or git
  convergence.
- Adds a Lab MCP, CLI, daemon, database, or routing engine.
- Skips Paper Wiki grounding for an obvious method, prompt, metric, eval,
  ablation, probe, failure, or baseline decision.
- Finalizes a Lab plan that contains method, prompt, metric, eval, ablation,
  probe, failure, or baseline slots without an attempted `meridian.context`
  grounding step or an explicit `not_needed` local-engineering classification.
- Claims official benchmark, baseline, eval, metric, score, or leaderboard
  compatibility without an `Official Benchmark Fidelity` block.
- Omits official runner entrypoint, official config defaults, official metric
  function, or official aggregation granularity when reporting an official
  metric.
- Treats runnable local benchmark wrappers, official per-task outputs, or
  provider substitutions as proof of official metric equivalence without
  checking metric function and aggregation granularity.
- Asks for general code quality review when the task needs review benchmark
  faithfulness against official runner/config/metric/aggregation behavior.
- Omits the review benchmark faithfulness prompt and only asks for ordinary
  implementation or code organization review.
- Treats Paper Wiki prior as local experiment evidence.
- Treats `missing` prior as `checked`, including after user confirmation.
- Retrieves Wiki for pure local engineering chores that do not affect research
  interpretation.

## Scoring Dimensions

Score each dimension from 1 to 5.

### 1. Trigger Classification

1: Does not identify research-bearing prior triggers.
3: Identifies obvious methods but misses prompts, metrics, probes, or failure
interpretations.
5: Correctly classifies `method | prompt | metric | eval | ablation | probe |
failure | baseline` triggers and marks local-only work as `not_needed`.

### 2. Wiki Grounding Use

1: Produces a plan from intuition alone.
3: Retrieves context after the plan is already fixed, or does not connect it to
the plan.
5: Calls `meridian.context` before finalizing research-bearing plan slots, uses
targeted `meridian.read` or `meridian.trace` when returned pages could change a
decision, and explains how grounding shaped the approach, experiment, prompt,
metric, or failure interpretation.

### 3. Missing Prior Gate

1: Ignores missing grounding or pretends it is checked.
3: Mentions uncertainty but does not preserve a durable gate.
5: Records `missing`, attempted query, agent judgment, user confirmation need,
and the smallest useful probe or user decision.

### 3b. Official Benchmark Fidelity

Use this dimension when the task involves an official benchmark, baseline,
eval, metric, score, leaderboard, or published result.

1: Says "follow the official benchmark" but does not extract the official
contract.
3: Identifies the official runner but misses config defaults, metric function,
or official aggregation granularity.
5: Records official runner entrypoint, official task source / split source,
official config defaults, official metric function, official aggregation
granularity, local wrapper changes, provider substitution, history/context
hook changes, reporting-only changes, and official metric versus derived
diagnostic labels.

### 4. Evidence Boundary

1: Conflates prior research with local experiment support.
3: Separates them in prose but lets prior change node mode.
5: Uses prior to shape design only; node support still depends on valid
experiment evidence.

### 5. Local Engineering Boundary

1: Retrieves Wiki for every implementation chore.
3: Sometimes skips local-only work but lacks a clear criterion.
5: Avoids retrieval for local engineering unless it changes research
interpretation, and hands code work to the normal coding workflow.

### 6. State Usefulness

1: Leaves no durable prior trail.
3: Stores prior state but with vague impact or missing query/provenance.
5: Stores compact status, trigger, query, MCP grounding attempt, judgment,
confirmation, and impact that later Lab work can reuse.

### 7. Lightweight Behavior

1: Adds heavy ceremony or a new workflow engine.
3: Correct behavior but too many mandatory fields or retrieval dumps.
5: Uses compact Markdown blocks and summaries only when prior triggers exist.

## Repair Buckets

- `trigger_classification`
- `wiki_grounding`
- `plan_slot_gate`
- `missing_prior_gate`
- `evidence_boundary`
- `local_engineering_boundary`
- `state_usefulness`
- `lightweight_behavior`
- `benchmark_fidelity`
- `official_metric_labeling`
