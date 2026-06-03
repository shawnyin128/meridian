# User Coding Style Profile 0.5.0

## Context

Meridian 0.4.9 added a static Lab handoff rule for research code style: exploratory research slices should prefer a readable linear main flow over production-style micro-abstractions. That fixed the immediate calibration-dataset example, but it hardcoded one user's preference into the Lab skill.

The user-level problem is broader: coding style is personal and changes through feedback. Lab should be able to collect stable user coding principles and hand them off to coding agents, while Arbor or other development workflows still own implementation, debugging, tests, commits, and release convergence.

Claudeception is a useful reference for the trigger shape, not the product scope:

- Use a mandatory evaluation point after relevant work.
- Keep only reusable, non-trivial, specific, and verified learnings.
- Prefer updating an existing artifact over creating duplicates.
- Support retrospective learning from feedback.

Meridian should borrow those ideas without becoming an automatic skill generator or a hidden coding workflow.

## Problem

The current Lab behavior is too soft in three places:

1. It can state research-code style in a handoff, but it has no user-level profile to reuse across projects.
2. It has no stable gate that asks whether a user's code-style correction should become a durable principle.
3. It cannot distinguish a local one-off complaint from a reusable personal coding preference.

A pure Arbor solution would be misplaced because the style profile should also be available to Lab idea graph handoffs and Paper Wiki grounded research planning. A pure Lab solution would also be incomplete because the best style feedback often appears after a downstream coding agent writes code.

## Goal

Meridian 0.5.0 should introduce a user-level coding style profile and a stable update gate:

- `meridian` setup/status initializes, checks, and migrates the profile.
- `lab` reads relevant profile entries before writing development handoffs.
- The Lab skill defines a mandatory Coding Style Feedback Gate for user feedback about code organization, abstraction level, naming, comments, tests, experiment ergonomics, or research-code readability.
- Hook-backed reminders may be added only if they are reliable across Codex and Claude; the skill-level gate remains the canonical fallback.

## Non-Goals

- Do not make Lab implement code, debug code, commit code, or release code.
- Do not create or rewrite skills automatically from every user correction.
- Do not store full pasted code examples as durable user profile content.
- Do not force a universal Meridian coding style on all users.
- Do not make profile updates silently when the feedback is ambiguous.
- Do not depend on hidden hooks as the only trigger path.

## Proposed User Profile

Create a user-level Markdown profile under the Meridian config home, for example:

`~/.meridian/coding-style.md`

Each principle should be short, scoped, and provenance-aware:

- `id`: stable slug.
- `scope`: examples include `research_code`, `python`, `experiments`, `evaluation`, `production`, `docs`.
- `principle`: one-sentence user preference.
- `apply_when`: concrete situations where the principle should affect code.
- `avoid`: anti-pattern the user disliked.
- `positive_shape`: what the user expects instead.
- `exceptions`: when not to apply the principle.
- `provenance`: short summary of the feedback that created or updated it.
- `confidence`: `confirmed`, `tentative`, or `needs-review`.
- `updated`: date.

The profile should be human-editable Markdown first. A small structured header or fenced block is acceptable only if it materially improves migration and tests.

## Coding Style Feedback Gate

The gate should run whenever the user gives feedback after code work or code-review work and the feedback is about code shape rather than task correctness alone.

Strong triggers:

- "This is too over-engineered."
- "Do not split this into so many helper functions."
- "For research code I want one linear function."
- "This naming/comment/test style is not how I work."
- "Remember this style for future Lab handoffs."

Weak triggers:

- "This file is messy."
- "This is hard to maintain."
- "I do not like this structure."

No trigger:

- A pure bug report.
- A one-off request tied to a specific API or benchmark.
- A style preference that conflicts with existing repo conventions and has no user-level statement.

Gate outcomes:

- `record_user_level_principle`: clear, reusable, scoped, and explicitly evidenced by user feedback.
- `ask_whether_to_record`: plausible user-level preference, but scope or confidence is unclear.
- `do_not_record_task_local_only`: local correction, bug fix, or repo-specific convention.

The agent must not treat "no evidence" as "no action." If it thinks a reusable style principle may exist but evidence is insufficient, it should ask for confirmation instead of writing the profile silently.

## Lab Handoff Consumer

Before Lab writes a development handoff, it should:

1. Read the coding style profile if it exists.
2. Select only entries relevant to the handoff's language, task type, and research-code phase.
3. Add a compact `User Coding Style Principles` section to the handoff.
4. Keep task-specific `Research Code Style` separate from durable user preferences.
5. Avoid dumping the full profile into every handoff.

Example expected handoff shape:

```markdown
## User Coding Style Principles

- For exploratory research code, prefer one readable linear main flow over many single-use helper functions.
- Keep dataset/source branches, seeds, splits, sample limits, and output identity visible near the code path that uses them.
```

## Setup And Migration

The `meridian` setup/status skill should own profile lifecycle checks:

- Create a starter profile if missing.
- Report profile schema/version drift.
- Migrate old profile headings or fields when Meridian plugin requirements change.
- Keep profile checks separate from active Paper Wiki workspace checks.
- Treat missing profile as repairable setup drift, not as Paper Wiki failure.

The framework check should report profile readiness as a small Meridian state check, not as a broad project health report.

## Trigger Hardening

The first implementation should make the skill-level gate mandatory and testable. Hook-backed reminders are a second layer:

- If Codex and Claude plugin hooks can reliably run a lightweight "style feedback review needed" reminder, add them.
- If runtime hook behavior is inconsistent, keep the skill gate as the product guarantee and report hook readiness as warn-level setup drift.
- Duplicate hook and skill triggers must no-op or merge into a single pending profile-review action.

This avoids repeating prior hook ambiguity while still learning from Claudeception's explicit activator pattern.

## Acceptance Criteria

- Meridian setup/status creates or repairs a user-level coding style profile.
- Profile entries are scoped, provenance-aware, and concise.
- Lab handoffs include relevant user profile principles without taking over coding.
- User code-style feedback is classified into record, ask, or do-not-record.
- Ambiguous feedback asks the user before durable profile writes.
- Existing principles are updated in place instead of duplicated.
- Codex and Claude plugin skill copies stay in sync.
- The feature ships as Meridian 0.5.0 after tests and release gates pass.

## Test Plan

### Static Asset Tests

- Assert the Codex and Claude `meridian`, `wiki`, and `lab` skill copies are synchronized for profile and gate wording.
- Assert the Lab skill contains the Coding Style Feedback Gate and Lab handoff consumer instructions.
- Assert the Meridian setup/status skill contains profile initialization and migration checks.

### Profile Tests

- Missing profile creates a starter Markdown profile in the user config home.
- Existing current profile passes unchanged.
- Old or incomplete profile is detected and migrated without deleting user text.
- Duplicate principle update merges into the existing principle.
- Full code blocks are not stored as durable profile content.

### Gate Fixture Tests

- Strong feedback records a scoped principle.
- Weak feedback asks the user whether to record.
- Bug-only feedback does not update the profile.
- Repo-local convention does not become a user-level principle unless the user says so.
- Research-code abstraction feedback updates the existing exploratory research-code principle.

### Lab Handoff Tests

- A research coding handoff includes relevant user coding style principles.
- A non-coding idea graph update does not inject coding style.
- The handoff separates durable user principles from task-specific research-code style.
- Missing profile degrades gracefully and does not block ordinary Lab use.

### Release Gates

- Full unit suite.
- `compileall` over source and tests.
- Plugin source/cache parity checks.
- Framework check.
- Version bump and release publish path.

## Suggested Work Split

| Slice | Scope | Why First |
| --- | --- | --- |
| Core profile and setup | User profile file, starter content, migration/status checks | Gives all later behavior a durable home |
| Feedback gate | Skill wording, classification rules, fixtures | Makes trigger behavior stable before hooks |
| Lab handoff consumer | Relevant profile selection and handoff section | Delivers the main product value |
| Trigger hardening | Optional hook-backed reminder or explicit fallback report | Useful only after the core gate works |

## Decision Defaults

| Decision | Default |
| --- | --- |
| Storage | User-level Markdown under Meridian config home |
| Update policy | Ask before writing ambiguous principles |
| Profile scope | Personal coding style, not repo conventions |
| Lab role | Consumer and handoff writer, not coding workflow |
| Hook role | Optional reminder layer, not the source of truth |
| Release target | Meridian 0.5.0 |

## Developer Round 2026-06-03

### Changes

- Added `src/meridian/lab/coding_style.py` with user-level coding-style profile helpers:
  - profile path under `MERIDIAN_CONFIG_HOME` or `~/.meridian/coding-style.md`
  - starter profile initialization
  - conservative migration that preserves user text
  - validation findings for missing, stale, incomplete, or code-block-heavy profiles
  - deterministic feedback classification into `record_user_level_principle`, `ask_whether_to_record`, and `do_not_record_task_local_only`
- Exported the profile helpers from `meridian.lab`.
- Added a `User Profile` category to `framework-check`.
- Updated the `meridian` setup skill to initialize and migrate the coding-style profile.
- Updated the `lab` skill with `User Coding Style Profile`, `Coding Style Feedback Gate`, and `User Coding Style Principles` handoff behavior.
- Updated the development handoff template to include `User Coding Style Principles`.
- Added coding-style eval fixtures and rubric.
- Updated Lab use-case docs.
- Bumped version surfaces to `0.5.0`.

### Validation

| Check | Result |
| --- | --- |
| Targeted coding-style/profile/skill/framework tests | Passed |
| Full unit suite | Passed, 161 tests |
| Compileall over `src` and `tests` | Passed |
| `git diff --check` | Passed |
| Version smoke | `meridian 0.5.0` |
| Framework check | Ran; warning is expected before local plugin cache is updated to 0.5.0 |

### Residual Scope

- Hook-backed trigger hardening was not implemented in this core 0.5.0 slice.
- The product guarantee is the skill-level Coding Style Feedback Gate plus profile setup/migration checks.
- Local installed Codex/Claude plugin caches still need the publish/update-local-plugin path before framework-check can pass without cache drift warnings.

## Convergence Round 2026-06-03

Decision: core 0.5.0 scope converged.

Developer evidence and verification align with the accepted plan:

- User-level profile has a durable Markdown home.
- Setup/status behavior can initialize and migrate the profile.
- Lab has a mandatory feedback gate and handoff consumer wording.
- Ambiguous feedback asks before durable writes.
- Bug-only feedback stays task-local.
- Lab still does not implement code, debug, test, commit, release, or converge.

The optional hook-backed reminder remains a separate hardening item and does not block the 0.5.0 core.
