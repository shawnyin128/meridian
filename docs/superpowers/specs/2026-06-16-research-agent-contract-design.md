# Research Agent Contract And Code Style Distillation Design

## Context

Meridian Lab already has a user-level coding-style profile at
`~/.meridian/coding-style.md` and Research Grounding Injection includes
`User Coding Style Principles` plus a static `Research Code Style` section.
That helps with exploratory research-code readability, but it does not yet
solve two higher-level failures:

1. Agents often write research code in an industrial engineering style:
   heavily factored, helper-heavy, and less readable as a linear experiment or
   analysis trace.
2. Agents can silently retreat from hard implementation requirements by writing
   old-version logic, fallback-only logic, stubs, placeholders, swallowed
   errors, or partial behavior while presenting the task as complete.

For research-development work, the second failure is a correctness and trust
failure, not a style issue. A fallback may be useful only when it is explicit,
approved or justified, and the requested current behavior is still implemented
and validated.

## Goal

Meridian 0.6.2 should introduce a research agent contract that is visible to
normal coding agents, reusable across projects, and consumable by Lab before
research-bearing code work.

The contract should:

- preserve the user's preferred exploratory research-code style
- forbid silent fallback, legacy-only implementation, and fake completion
- make blockers explicit instead of allowing agent self-downgrading
- give Lab a path to distill user code examples into durable style principles
- keep Lab as a preflight and grounding layer, not a coding agent
- support realistic Codex evals that expose route and decision rationale during
  tests without adding debug rationale to normal skill output

## Non-Goals

- Do not make Lab perform implementation, debugging, test repair, commits,
  release, or convergence.
- Do not store full user code examples in the profile.
- Do not make every project inherit a large generated AGENTS file.
- Do not treat user coding style as Paper Wiki source fact.
- Do not ban all fallback behavior. Ban hidden or substitute fallback behavior
  that replaces the requested current implementation without explicit approval.
- Do not add normal skill output that explains internal rationale. Rationale is
  for eval/debug harnesses only.

## Recommended Approach

Use a hybrid contract:

1. A user-level detailed reference document:
   `~/.meridian/research-agent-principles.md`
2. The existing user-level compact profile:
   `~/.meridian/coding-style.md`
3. A guarded project `AGENTS.md` injection that points agents at those files
   and states the no-silent-fallback rule.
4. A Lab `Implementation Integrity Gate` inside Research Grounding Injection.
5. A Lab `Code Style Distillation` workflow that proposes profile updates from
   representative user code.

This gives three enforcement points: project instructions, user-level durable
preferences, and task-specific Lab handoff constraints.

## User-Level Reference

Meridian setup should create or migrate:

```text
~/.meridian/research-agent-principles.md
```

The starter document should be human-editable Markdown. It should include:

- research-code style principles
- implementation integrity principles
- fallback policy
- blocker reporting policy
- validation expectations
- relationship to `~/.meridian/coding-style.md`

The default research-code style should say:

- Prefer linear, readable code for exploratory research slices.
- Keep the main experimental or analytical flow easy to scan top to bottom.
- Keep data sources, branch choices, seeds, splits, metrics, sample limits,
  output paths, and result identity visible near the code that uses them.
- Avoid single-use parser, loader, selector, adapter, wrapper, and registry
  layers when they hide experimental decisions.
- Use helper functions only for real reuse, risky boundary isolation, or stable
  external API boundaries.
- Comments should explain research intent, non-obvious choices, data quirks,
  validity limits, and interpretation, not narrate trivial assignments.

The default implementation-integrity policy should say:

- Implement the requested current behavior, not an older API or older layout.
- Do not substitute fallback-only behavior for the requested implementation.
- Do not present stubs, no-ops, placeholders, TODOs, partial branches, or
  swallowed errors as completion.
- If the requested implementation is blocked, stop and report the blocker,
  evidence checked, and options.
- Do not decide unilaterally that "the first version does not need" a requested
  current-version path.
- Fallback code is acceptable only when the primary path exists, is validated,
  and the fallback is explicit, or when the user explicitly approves fallback
  scope.
- Tests must prove the primary requested path, not only the fallback path.

## Compact Coding Style Profile

Keep `~/.meridian/coding-style.md` as the compact profile that Lab injects into
Research Grounding Injection.

Update the starter text so it points to
`~/.meridian/research-agent-principles.md` for the longer contract.

Profile entries should remain short and structured:

- `id`
- `scope`
- `principle`
- `apply_when`
- `avoid`
- `positive_shape`
- `exceptions`
- `provenance`
- `confidence`
- `updated`

The profile stores durable distilled principles, not pasted code.

## Project AGENTS Injection

Meridian setup should add or update one guarded block in the target project's
`AGENTS.md` when Lab readiness is initialized for that repo.

If `AGENTS.md` exists, append or replace only the Meridian block. If it does not
exist, create a minimal file with the block. User text outside the block is
never changed.

Suggested block:

```text
<!-- MERIDIAN RESEARCH AGENT CONTRACT START -->
For research-development code changes, read the Meridian user-level contract
before implementation:

- ~/.meridian/research-agent-principles.md
- ~/.meridian/coding-style.md when code style matters

Do not silently substitute legacy behavior, fallback-only behavior, stubs,
TODO placeholders, no-op implementations, swallowed errors, or partial
implementations for the requested current behavior. If the current
implementation is blocked, stop and report the blocker, evidence checked, and
options.
<!-- MERIDIAN RESEARCH AGENT CONTRACT END -->
```

The block should be small because the full policy lives in the user-level
reference. The block should be installed during setup/migration, not during
ordinary Lab state changes.

## Lab Implementation Integrity Gate

Research Grounding Injection should include:

```markdown
## Implementation Integrity Gate

- required current behavior:
- current API / data layout / version:
- forbidden shortcuts:
  - legacy-only implementation
  - fallback-only implementation
  - placeholder / no-op / TODO-as-success
  - swallowed errors that pretend success
- blocker reporting required: yes
- validation must prove:
```

Lab should fill this section when the next action is implementation, debugging,
tests, experiments, release, or convergence and the task has a research-bearing
or current-version correctness risk.

This section is downstream acceptance context for the normal coding workflow.
Lab still does not implement code.

## Code Style Distillation Workflow

Add a Lab workflow for requests such as:

- "learn my code style from this repo"
- "distill my style from these files"
- "use this implementation as my preferred research-code style"

Minimum behavior:

1. Select representative user-authored files or use the files named by the user.
2. Exclude generated, vendored, cache, build, and external dependency files.
3. Read enough code to identify style patterns, not to reproduce code.
4. Produce a proposal with evidence references to files and short snippets or
   paraphrased shapes.
5. Separate durable user preference from repo-local convention.
6. Ask before writing confirmed profile principles.
7. Write only distilled principles to `~/.meridian/coding-style.md`.
8. Do not store full code blocks in the profile.

The distillation output should classify proposed principles as:

- `confirmed_candidate`: strong evidence and likely durable, awaiting approval
- `repo_local`: likely specific to the current codebase
- `insufficient_evidence`: observed but too weak to record

## Setup And Migration

Meridian setup/status/migration should check:

- `~/.meridian/coding-style.md`
- `~/.meridian/research-agent-principles.md`
- project `AGENTS.md` Meridian contract block when Lab readiness is requested

Missing user-level files are setup-repairable and can be created with starter
content. Existing user text must be preserved.

Project `AGENTS.md` injection should be opt-in through setup/lab-readiness
initialization, not an automatic side effect of unrelated wiki operations.

## Evaluation Strategy

Static and unit tests:

- User-level principles reference initializes and migrates without deleting
  user text.
- Coding-style profile starter points to the detailed reference.
- Project `AGENTS.md` block is created, updated idempotently, and preserves
  surrounding user content.
- Research Grounding Injection includes `Implementation Integrity Gate`.
- Codex and Claude plugin Lab/Meridian skill copies stay synchronized.

Scenario fixtures:

- Positive research-code style cases where the agent should prefer a linear
  main flow.
- Negative cases where production-style factoring is acceptable.
- Current-version implementation cases where fallback-only behavior is a hard
  fail.
- Cases where fallback is acceptable because the primary path exists and the
  fallback is explicit.
- Blocked implementation cases where the correct behavior is to report a
  blocker instead of silently downgrading.
- Distillation cases with user-authored examples, generated files, and
  repo-local conventions.

Live Codex evals:

- Run real Codex prompts against a temporary repo initialized with Meridian.
- Include at least ten positive cases for Lab/contract activation and enough
  negative cases to test stability.
- During eval only, require route rationale and implementation-integrity
  rationale so failures can be diagnosed.
- Assert normal skill text does not require rationale output in ordinary user
  interactions.

## Acceptance Criteria

- Meridian can initialize user-level research agent principles.
- Meridian can inject a guarded AGENTS contract block for Lab-ready repos.
- Lab Research Grounding Injection carries an implementation-integrity gate.
- User style can be distilled from code only through a proposal and approval
  path.
- The compact style profile is preserved as a reusable injection source.
- Hidden legacy-only, fallback-only, placeholder, or no-op implementation is a
  documented hard fail.
- Tests include static, scenario, and live Codex coverage.
- Normal Lab output remains concise and does not expose debug rationale unless
  a test harness explicitly requests it.

## Rollout

Target release: Meridian 0.6.2.

Suggested slices:

1. User-level principles reference and profile migration.
2. Project `AGENTS.md` guarded block helpers and setup skill guidance.
3. Research Grounding Injection integrity gate and plugin skill updates.
4. Code Style Distillation workflow docs and profile update gate.
5. Static tests, scenario fixtures, and live Codex eval cases.

