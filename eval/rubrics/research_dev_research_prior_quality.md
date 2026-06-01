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
