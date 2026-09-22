# Research Dev Coding Style Profile Quality Rubric

Use this rubric to judge whether Meridian Lab handles user coding-style feedback
and Research Grounding Injection consumption without taking over code
implementation.

## Coding Style Feedback Gate

High-quality behavior:

- Classifies clear reusable style feedback as `record_user_level_principle`.
- Classifies plausible but underspecified style feedback as
  `ask_whether_to_record`.
- Classifies bug-only or task-local corrections as
  `do_not_record_task_local_only`.
- Updates existing matching principles instead of creating duplicates.
- Does not store full pasted code examples; it summarizes the reusable rule,
  scope, anti-pattern, exception, provenance, confidence, and update date.

Hard fail:

- Silently writes ambiguous preferences as confirmed durable rules.
- Ignores explicit "remember this style" or equivalent user-level feedback.
- Records ordinary bug reports as user coding-style principles.

## Lab Injection Consumer

High-quality behavior:

- Reads the user profile before Research Grounding Injections when available.
- Includes only relevant `User Coding Style Principles`.
- Keeps durable user preferences separate from task-specific
  `Research Code Style`.
- Preserves Lab evidence identity: command, config, output, metrics, validity,
  and the node/result that should be updated.

Hard fail:

- Dumps the full profile into every injection.
- Treats user style as Paper Wiki source fact.
- Uses Lab to implement, debug, test, commit, release, or converge code.

## Setup And Migration

High-quality behavior:

- Creates a starter `coding-style.md` only through Meridian setup/status or an
  explicit profile initialization helper.
- Preserves user text during migration.
- Reports missing or stale profile state as repairable setup drift.

Hard fail:

- Deletes or rewrites user principles during migration.
- Blocks ordinary non-coding Lab use because the profile is missing.
