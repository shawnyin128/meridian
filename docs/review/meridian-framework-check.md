# Meridian Framework Check

## Context/Test Plan

### Context

The user asked to model Meridian's framework check after `shawnyin128/sp-harness`.
The useful pattern in `sp-harness` is not its exact file inventory; it is the
stable maintenance contract:

- run repeatable check categories
- classify findings by severity and fixability
- separate automatic repairs from user decisions
- report the same shape every run
- validate whether the framework still drives the intended agent behavior

Meridian needs the same kind of check, but scoped to its own product boundary:
Paper Wiki and Lab are user-facing skills, MCP is an integration surface, CLI is
an execution primitive, and durable user state lives outside the development
repo when appropriate.

### Proposed Scope

Build a Meridian framework check that is invoked through the existing
`meridian` setup/status entry, not as a fourth product skill.

The check should cover:

- Product skill surface: only `meridian`, `wiki`, and `lab` are exposed as
  product skills; support skills remain internal.
- Plugin bundle parity: Codex and Claude Code package manifests, skill files,
  MCP config, and version surfaces agree.
- Runtime readiness: Python core import/version, active plugin cache version,
  and MCP startup/capabilities are coherent.
- Paper Wiki workspace: user-level library root, `meridian-wiki.json`,
  `sources/`, and `wiki/` are present and separated from the development repo.
- Wiki artifact boundary: canonical reads exclude `.drafts`, `.versions`, debug
  artifacts, and source-quality holds as scientific evidence.
- Lab research space: `.meridian/` skeleton, indexes, state, thread,
  experiment, proposal, node mode, and proposal state conventions are valid.
- Documentation surface: README and setup docs present the same three-entry
  product model without raw CLI command sprawl.
- Evaluation/release assets: critical eval cases, rubrics, health checks, and
  release gates exist and are parseable.

### Non-Goals

- Do not add a new user-visible skill.
- Do not add a Research Dev MCP.
- Do not make the check judge the scientific quality of every wiki page.
- Do not auto-publish wiki changes.
- Do not mutate user research state without explicit confirmation.

### Output Contract

The report should be deterministic and comparable across runs:

- category status: `pass`, `warn`, or `fail`
- severity: `critical`, `degraded`, or `info`
- fixability: `auto`, `confirm`, or `manual`
- finding text in plain language
- exact next action
- optional machine-readable JSON output for future automation

### Fix Policy

The first release should be report-first. Safe deterministic repairs can be
added only where the action is obvious and reversible, such as creating a
missing Lab skeleton after user confirmation or refreshing generated plugin
bundle copies.

### Acceptance Criteria

- The framework check produces a stable category report.
- The report catches the recent classes of drift:
  - repo-local product skill shadowing installed plugin skills
  - plugin/core version mismatch
  - setup reporting ready while Lab `.meridian/` is missing
  - active Paper Wiki workspace missing or inside the development repo
  - MCP unavailable or exposing the wrong tool surface
  - support skills leaking as primary user entries
- The `meridian` skill explains when to run the check and how to act on results.
- The implementation remains lightweight and deterministic.

### Test Plan

- Unit tests for framework check result schema and category aggregation.
- Fixtures for missing workspace, stale plugin version, missing Lab state, and
  support-skill leakage.
- Smoke check for MCP capabilities.
- Plugin bundle parity checks.
- Eval/rubric parse checks where applicable.
- Full unit suite, compileall, diff check, wiki lint/source-audit/catalog, and
  Arbor process-state before release.

### Open Decisions

- Whether the CLI primitive should be named `meridian framework-check`,
  `meridian doctor`, or remain entirely inside the `meridian` skill until a CLI
  becomes necessary.
- Whether v1 should support any `--fix` path, or only report plus suggested
  commands.
- Whether active Codex/Claude plugin cache inspection should be best-effort or
  a hard readiness gate.

## Developer Round

### Changes

- Added `src/meridian/framework_check.py` with a deterministic report-first
  framework check.
- Added a CLI primitive:
  `python3 -m meridian framework-check`.
- Added optional JSON and Markdown report output.
- Added category checks for:
  - product skill surface
  - plugin bundle parity
  - runtime and MCP tool surface
  - Paper Wiki workspace layout
  - canonical artifact-boundary leakage
  - Lab `.meridian/` readiness when a Lab target is provided
  - docs and eval release surfaces
- Updated the shipped `meridian` skill in both plugin bundles to explain the
  Framework Check workflow.
- Added tests for stable category shape, CLI artifact output, missing Lab state,
  product-skill behavior text, and plugin skill copy parity.

### Developer Evidence

- Targeted tests passed:
  `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_framework_check_reports_stable_categories tests.test_cli.CliTests.test_framework_check_cli_writes_json_and_markdown tests.test_cli.CliTests.test_framework_check_catches_missing_lab_state_when_requested tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills`
- Framework check smoke passed:
  `PYTHONPATH=src python3 -m meridian framework-check --project-root .`
- Framework check with active Paper Wiki workspace passed:
  `PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki --json-out /private/tmp/meridian-framework-check.json --report /private/tmp/meridian-framework-check.md`

## Evaluator Round

### Evaluation

- The check follows the `sp-harness` pattern at the framework level: fixed
  categories, severity, fixability, next action, stable JSON, and stable
  Markdown.
- The implementation is adapted to Meridian instead of copying `sp-harness`
  file rules. It checks plugin/wiki/lab/MCP boundaries.
- It does not add a fourth product-facing skill.
- It is report-first and does not mutate user wiki or Lab state.
- It catches the recently observed drift classes:
  - repo-local product skill shadowing
  - plugin bundle skill copy mismatch
  - MCP tool surface mismatch
  - missing Lab `.meridian/` when explicitly checked
  - active workspace layout and artifact-boundary problems

### Gate Evidence

- Full unit suite passed:
  `PYTHONPATH=src python3 -m unittest discover -s tests`
- Compile check passed:
  `PYTHONPYCACHEPREFIX=/private/tmp/meridian-framework-check-pycache PYTHONPATH=src python3 -m compileall src tests`
- Diff hygiene passed:
  `git diff --check`
- Main Paper Wiki lint passed:
  `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`
- Main Paper Wiki source audit passed:
  `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`
- Main Paper Wiki catalog passed:
  `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`
- AGENTS project-map drift hook passed.
- Arbor process-state still reports historical F1/F37 review-evidence findings
  unrelated to this change.

## Convergence Round

### Decision

Converged for F43. The implementation satisfies the planned report-first
Meridian framework check without adding a new visible skill or broadening Lab
or Paper Wiki product scope.

### Residuals

- The first release does not include automatic repair paths. That remains a
  future extension after the report format proves stable.
- Active Codex/Claude plugin cache inspection is currently best-effort through
  bundle/version surfaces, not a hard runtime cache gate.
- Arbor process-state has older review-evidence errors outside this feature.

## Release Round

### Checkpoint Status

- Status: ready for checkpoint commit.
- Commit message: `feat: add meridian framework check`.

### Release Evidence

- Developer and evaluator rounds are recorded above.
- Full unit, compile, diff hygiene, main wiki gates, framework check smoke, and
  AGENTS drift evidence are recorded above.
- The only remaining process-state failures are historical F1/F37 review
  evidence gaps outside this feature.
