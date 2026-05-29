# Meridian Skill Behavior Evaluation

## Context/Test Plan

### Context

This planned follow-up adds and maintains evaluation assets for Meridian skill
behavior. The cases should judge whether an agent selects the right product
entry and preserves boundaries, without overfitting exact wording.

### Plan

- Cover setup, wiki update/use, Lab coding/debug, Lab idea placement, and
  support-skill delegation.
- Include hard failures for unsafe publish, debug artifact leakage, skipped
  workspace init, skipped retrieval, and skipped Lab root thread seed.
- Keep the rubric behavior-oriented.

### Acceptance Criteria

- Eval cases are JSONL parseable.
- Rubric names dimensions, hard fails, and repair buckets.
- Tests verify assets exist and cover all three user-facing skills.

### Test Plan

- JSONL parse checks.
- Rubric content checks.
- Scenario coverage checks for `meridian`, `wiki`, and `lab`.
