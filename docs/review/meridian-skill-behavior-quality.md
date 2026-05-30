# Meridian Skill Behavior Quality

## Context/Test Plan

### Context

Meridian is now packaged as one plugin with three user-facing skills:

- `meridian`: setup, status, and migration.
- `wiki`: Paper Wiki update/use workflows.
- `lab`: wiki-grounded research coding workflows.

The source skill copies and Codex/Claude plugin package copies currently match.
The risk is not copy drift; it is behavior drift caused by prompt text:

- `wiki` correctly says CLI commands are execution primitives, but still shows
  several command paths. Agents may over-focus on commands or fallback `rg`
  instead of using the product workflow.
- `lab` is behaviorally rich and useful, but long enough that agents may miss
  the most important duties: continue the coding task, preserve evidence, ask
  before boundary-changing state transitions, and checkpoint focused research
  slices.
- `meridian` is intentionally small, but must not become the normal Paper Wiki
  or Lab entry.
- Bundle surfaces such as README, plugin manifests, `.mcp.json`, and
  distribution docs must reinforce the same mental model instead of adding a
  parallel product story.

### Plan

Run a text-quality and behavior-quality pass over the shipped product surfaces.
This pass should optimize the agent-facing prompts, not the underlying wiki or
Lab core.

The work should:

- Keep only three user-facing skills: `meridian`, `wiki`, and `lab`.
- Keep support skills internal to the `wiki` workflow.
- Make each skill's trigger and non-trigger boundary obvious from the first
  screen of text.
- Replace overlong negative rule piles with positive examples and minimum
  completion criteria.
- Keep CLI and MCP references as implementation hints, not product commands the
  user must learn.
- Preserve Lab's lightweight principle: no Lab MCP, daemon, database, or rigid
  routing engine.
- Add behavior-oriented checks/eval cases that catch skill drift without
  overfitting exact wording.

### Acceptance Criteria

- `meridian` stays setup-only and explicitly hands normal work to `wiki` or
  `lab`.
- `wiki` clearly selects between Update Wiki and Use Wiki, retrieves through the
  active workspace, and does not encourage manual vault search before Meridian
  retrieval.
- `lab` clearly handles idea placement, approach trees, experiment evidence,
  local proposals, coding slices, and checkpointing without weakening native
  coding/debugging behavior.
- README and plugin manifest prompts reinforce the same three-skill model.
- Behavior checks cover wrong-skill selection, skipped workspace init, skipped
  retrieval, skipped Lab thread seed, unsafe wiki publish, debug artifact
  leakage, and excessive CLI exposure.

### Done-When Criteria

| Criterion | Verification Method | Evidence Owner |
| --- | --- | --- |
| Agent entry selection is clear | Scenario review or eval cases for setup, wiki update/use, and Lab research coding | develop |
| Product skills stay concise and positive | Content check for workflow count, examples, completion criteria, and absence of command-list sprawl | develop |
| Support skills stay internal | Bundle/package check that product docs expose `meridian`, `wiki`, and `lab` while support skills remain delegated modules | evaluate |
| Drift is testable after future edits | Eval/rubric assets or targeted tests catch representative behavior failures without exact-wording dependence | evaluate |

### Test Plan

- Structural checks for shipped skills:
  - product skills exist in repo and both plugin packages
  - plugin copies match repo copies
  - support skills are present but not marketed as primary user entries
- Behavior scenario cases:
  - setup request routes to `meridian`
  - uploaded PDF routes to `wiki` Update Wiki
  - research question routes to `wiki` Use Wiki
  - coding/debug/probe task routes to `lab`
  - new durable idea with no threads asks for root thread seed
  - wiki publish remains proposal/lint gated
  - debug artifacts are not reported as product output
- Documentation checks:
  - README first-level story exposes three skills
  - MCP is described as managed integration, not a required manual command path
  - CLI remains an execution primitive

### Risks

- Over-tightening prompts could make agents less autonomous. The pass should
  constrain product boundaries, not inspect/run/diagnose freedom.
- Exact word-count tests can make future writing brittle. Prefer structural and
  scenario behavior checks.
- If the README becomes too minimal, install/update failure recovery may become
  harder. Keep setup docs available but do not make them the first mental model.

## Developer Round

### Changes

- Added first-screen behavior boundaries to `.codex/skills/meridian/SKILL.md`:
  setup/status/migration only, with explicit handoff to `wiki` and `lab`.
- Added first-screen behavior priority to `.codex/skills/wiki/SKILL.md`:
  classify Update Wiki versus Use Wiki from user intent, use active workspace,
  and keep CLI/MCP as execution primitives.
- Added first-screen behavior priority to `.codex/skills/lab/SKILL.md`:
  preserve native coding/debugging ability while guarding Lab state, evidence,
  write-back, and checkpoint boundaries.
- Synchronized the three product skill copies into both plugin packages.
- Updated README and plugin manifest wording to reinforce the three-skill model.
- Added behavior eval assets:
  - `eval/cases/meridian_skill_behavior_quality.jsonl`
  - `eval/rubrics/meridian_skill_behavior_quality.md`
- Added tests for product skill behavior boundaries, plugin skill copy parity,
  and eval/rubric parseability.

### Developer Evidence

- Targeted behavior/package tests passed:
  `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_meridian_setup_skill_exists tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills tests.test_cli.CliTests.test_meridian_skill_behavior_eval_assets_parse tests.test_cli.CliTests.test_product_wiki_skill_uses_reliable_context_entry tests.test_cli.CliTests.test_plugin_release_assets_exist`
- Full unit suite passed:
  `PYTHONPATH=src python3 -m unittest discover -s tests`
- Compile check passed:
  `PYTHONPYCACHEPREFIX=/private/tmp/meridian-skill-quality-pycache PYTHONPATH=src python3 -m compileall src tests`
- Diff hygiene passed:
  `git diff --check`

## Evaluator Round

### Evaluation

- Entry selection evidence: tests require `meridian`, `wiki`, and `lab` to have
  explicit first-screen boundaries and behavior priorities.
- Bundle parity evidence: tests require repo product skills to match Codex and
  Claude Code plugin skill copies.
- Behavior drift evidence: new JSONL cases and rubric cover wrong-skill
  selection, command sprawl, skipped workspace init, skipped retrieval, skipped
  Lab root thread seed, unsafe publish, and debug artifact leakage.
- Product-boundary evidence: README and manifest now present the three-skill
  model before detailed installation/update mechanics.

### Gate Evidence

- Main wiki lint: pass, 0 findings.
- Main wiki source audit: pass, 241 sources, 0 missing files, 0 SHA mismatches.
- Main wiki catalog: pass, 237 catalog entries.
- AGENTS project-map drift hook: pass, no missing top-level candidates or stale
  mapped project paths.
- Arbor process-state: warning-only, 0 errors. Residual warnings are older open
  feature metadata for F1/F2 and missing release-round evidence for prior F37.

## Convergence Round

### Decision

Converged for the planned skill behavior quality pass. The implementation
matches the Context/Test Plan: it improves the shipped skill and bundle text,
keeps the three user-facing entries, preserves support skills as internal
delegates, avoids new MCP/CLI surfaces, and adds behavior-oriented regression
assets.

### Residuals

- Runtime readiness doctor remains a planned follow-up, not part of this pass.
- Install/update closure remains a planned follow-up.
- Existing Arbor warnings for F1/F2 and F37 are not caused by this change.

## Feedback Repair Round

### Feedback

The user reported that `meridian` setup can report overall ready while not
creating or even flagging missing Lab `.meridian/` state in the current research
repo.

### Root Cause

`meridian` Status Check treated core, active Paper Wiki workspace, visible
skills, and MCP readiness as sufficient for `ready`. Lab research-space checks
were mentioned only under Migration Check, so a full setup/status request could
miss `.meridian/` readiness and produce a misleading all-ready answer.

### Repair

- Updated `meridian` skill Status Check to report Paper Wiki/plugin readiness
  separately from Lab research-space readiness.
- Added `needs_lab_init` for the case where the user wants Meridian ready for
  Lab workflows but the target repo lacks `.meridian/`.
- Clarified that `.meridian/` creation requires user confirmation and creates
  only the minimal Lab skeleton.
- Synchronized Codex and Claude Code plugin skill copies.
- Added regression coverage to skill behavior tests and eval cases.

### Evidence

- Targeted tests passed:
  `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_meridian_setup_skill_exists tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills tests.test_cli.CliTests.test_meridian_skill_behavior_eval_assets_parse`
- Full unit suite passed:
  `PYTHONPATH=src python3 -m unittest discover -s tests`
- Compile check passed:
  `PYTHONPYCACHEPREFIX=/private/tmp/meridian-lab-ready-pycache PYTHONPATH=src python3 -m compileall src tests`
- Diff hygiene passed:
  `git diff --check`
