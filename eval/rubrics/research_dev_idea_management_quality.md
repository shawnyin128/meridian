# Lab Idea Management Quality Rubric

Use this rubric to judge whether Lab handles a research idea as lightweight
idea-graph working state while still using Paper Wiki for grounding.

## Hard Fail Rules

- Raw idea is not preserved.
- Raw idea is treated as a Paper Wiki source fact.
- A paper-dependent idea skips wiki grounding without explanation.
- The output proposes expensive experiments before a minimal test, probe, or
  sanity check.
- Durable findings are written directly to canonical wiki pages instead of a
  proposal/write-back packet.

## Scoring Dimensions

Score each dimension from 1 to 5.

### 1. Raw Idea Fidelity

1: Loses or rewrites the user's original idea.  
3: Preserves the idea but blurs raw text and interpretation.  
5: Faithfully preserves the raw idea and separates it from normalization.

### 2. Hypothesis Normalization

1: Leaves the idea vague.  
3: Provides a hypothesis but not a clear expected observation.  
5: Converts the idea into a testable hypothesis with expected learning.

### 3. Wiki Grounding Quality

1: No relevant wiki context when it is needed.  
3: Retrieves broadly relevant pages but weakly explains their role.  
5: Uses papers, methods, concepts, claims, evidence, or syntheses to ground the
support, contradiction, and uncertainty of the idea.

### 4. Feasibility Reasoning

1: Only says the idea is good or bad.  
3: Covers support and risk but misses novelty or implementation constraints.  
5: Separates support, contradiction, novelty risk, implementation risk, and
missing evidence.

### 5. Minimal Experiment Quality

1: Suggests broad experiments or no experiment.  
3: Names an experiment but lacks control, probe, or metric identity.  
5: Names the smallest useful test, control, ablation/probe, sanity check,
metric, expected observation, and stop condition.

### 6. Evidence Identity

1: Results or claims have no command/config/output identity.  
3: Some evidence identity is present but incomplete.  
5: Evidence log records command, config, output path, metric definition, and
interpretation boundary.

### 7. Decision Clarity

1: No next state or decision.  
3: Decision is named but weakly justified.  
5: Decision is explicit: inbox, test_next, revise, pause, kill, promote, or
merged, with rationale.

### 8. Write-back Boundary

1: Writes raw idea or local result directly into canonical wiki.  
3: Mentions proposal-first write-back but does not separate fact types.  
5: Clearly separates dev idea, local experiment evidence, user insight, wiki
synthesis, and paper source fact; uses proposal-first write-back.

### 9. Lightweight Behavior

1: Introduces unnecessary process, database, daemon, or rigid state machine.  
3: Uses an Idea Card but adds too much ceremony for a simple idea.  
5: Uses the smallest durable artifact needed and keeps agent autonomy intact.

## Repair Buckets

- `raw_idea_fidelity`
- `hypothesis_normalization`
- `wiki_grounding`
- `feasibility_reasoning`
- `minimal_experiment`
- `evidence_identity`
- `decision_state`
- `writeback_boundary`
- `lightweight_behavior`
