# Lab Official Benchmark Fidelity Gate

## Context/Test Plan

### Context

User feedback showed a Lab failure mode in official benchmark work: the user
asked for an implementation that follows an official evaluation framework and
asked the agent to check for deviations, but Lab-guided work still missed
metric-changing differences.

Concrete reported misses:

- AppWorld: local outputs used official per-task evaluation, but reported SGC
  as a per-task mean instead of matching the official dataset/scenario-level
  aggregation contract.
- tau3/tau2-style evaluation: local runner focused on task ids, reward, Pass^1,
  and official runner shape, but missed an official CLI/config default
  difference where `max_retries` should be `3` and local behavior used `0`.

Current Lab evidence:

- `plugins/codex/meridian/skills/lab/SKILL.md` and the Claude copy already have
  a Research Prior Gate for `method`, `prompt`, `metric`, `eval`, `ablation`,
  `probe`, `failure`, and `baseline`.
- `docs/review/lab-research-prior.md` records that missing prior is a valid
  user-confirmation gate, and that pure local engineering can be `not_needed`.
- `docs/review/lab-research-code-style-handoff.md` records the Lab-to-coding
  handoff boundary: Lab does not implement code, but it can make downstream
  coding acceptance criteria explicit.
- Existing eval assets cover research-prior grounding and coding-style handoff,
  but do not require an official benchmark fidelity contract table.

### Problem

The existing Research Prior Gate is too generic for official benchmark work.
It can make an agent retrieve background prior or inspect local code, but it
does not force the benchmark-specific question:

```text
Relative to the official runner, config defaults, metric functions, and
aggregation granularity, what local behavior changes the reported metric?
```

This means Lab can produce a reasonable development handoff while still missing
the highest-risk official-baseline drift.

### Superpowers Brainstorming: Approach Comparison

| Approach | Description | Trade-off | Decision |
| --- | --- | --- | --- |
| Add a Lab Official Benchmark Fidelity Gate | Treat official benchmark/eval/baseline/metric work as a stricter subtype of Research Prior and require a compact contract table in handoffs. | Lightweight, aligned with Lab boundaries, but downstream coding/review must still enforce it. | Recommended first step. |
| Build a deterministic benchmark fidelity auditor | Add code that compares local wrappers against official repos/configs. | Stronger when benchmark adapters are known, but too broad and brittle for this plugin-level behavior fix. | Reject for this feature; possible future targeted tool. |
| Rely on Superpowers/code review prompts only | Keep Lab unchanged and tell reviewers to ask better questions. | Helps review but fails early planning and handoff; the coding agent may never receive the benchmark contract. | Reject as insufficient alone. |

### Goal

Add a lightweight but hard Lab gate for official benchmark fidelity. When a Lab
task involves official benchmark, baseline, evaluation, metric, score, or
leaderboard faithfulness, Lab must preserve the official contract before it
hands work to coding/review workflows.

### Non-Goals

- Do not make Lab implement code, run official benchmarks, repair tests, commit,
  release, or converge work.
- Do not add a universal benchmark auditor or official-repo crawler.
- Do not require Paper Wiki to contain the official implementation. Official
  code/docs may be local repo evidence or a user-provided source.
- Do not block all benchmark work when evidence is missing. Preserve `missing`
  and ask for user confirmation before accepting under-grounded risk.
- Do not replace downstream review. Lab prepares the fidelity contract; coding
  and review workflows still need to enforce it.

### Recommended Contract

For official benchmark/baseline/eval/metric work, Lab should require an
`Official Benchmark Fidelity` block before finalizing a plan or development
handoff.

Minimum fields:

- official runner entrypoint
- official task source / split source
- official config defaults
- official metric function
- official aggregation granularity
- local wrapper changes
- provider substitution changes
- history/context hook changes
- reporting-only changes
- official metric labels versus derived diagnostic labels
- unresolved fidelity risks and who must confirm them

Review prompt to include in handoff:

```text
Please review benchmark faithfulness, not general code quality. Compare local
wrappers/artifacts against the official benchmark runner, config defaults,
metric functions, and aggregation granularity. Find any local behavior that
changes the reported metric.
```

### Acceptance Criteria

- Lab skill text makes official benchmark/eval/baseline/metric work a stricter
  Research Prior subtype.
- Lab development handoffs include an `Official Benchmark Fidelity` block when
  the task claims official compatibility or reports official-style metrics.
- Missing official runner/config/metric/aggregation evidence is recorded as
  `missing` and requires user confirmation before proceeding.
- The handoff distinguishes provider substitution, history/context hooks, and
  reporting-only changes from metric-changing changes.
- The handoff labels results as official metrics only when runner/config/metric
  function/aggregation granularity match the official contract.
- Codex and Claude Code Lab skill copies remain synchronized.
- Eval coverage includes negative cases modeled on:
  - official per-task outputs averaged into the wrong aggregate;
  - official default retry/config mismatch that still produces runnable results.
- Eval/rubric checks hard-fail generic handoffs that say only "follow the
  official benchmark" or "review code quality" without the official contract.

### Done-When Criteria

| Criterion | Verification Method | Owner |
| --- | --- | --- |
| Official fidelity gate exists in Lab | Skill text checks for `Official Benchmark Fidelity` in both plugin copies | develop |
| Handoff has concrete contract fields | Eval case and tests require runner, split, config defaults, metric function, aggregation, and local-change classification | develop/evaluate |
| Missing evidence is safe | Rubric/eval rejects `checked` when official evidence is absent and requires user-confirmed `missing` state | evaluate |
| Review question is benchmark-specific | Skill/eval checks include the faithfulness review prompt and reject generic code-quality review text | evaluate |
| Lab boundary is preserved | Tests confirm Lab still hands code/test/commit/release work to normal coding workflows | evaluate |
| Release remains lightweight | Full unit suite, compileall, diff check, framework-check, and plugin copy parity | release |

### Test Plan

Targeted checks:

- Product Lab skill behavior checks for:
  - `Official Benchmark Fidelity`
  - official runner entrypoint
  - official config defaults
  - metric function
  - aggregation granularity
  - official metric versus derived diagnostic labels
  - benchmark faithfulness review prompt
- Codex/Claude Lab skill copy parity.
- Eval JSONL/rubric cases:
  - AppWorld-style wrong aggregation granularity.
  - tau-style official default mismatch.
  - positive case with provider substitution and history hook clearly labeled
    as local changes.
  - missing official implementation evidence preserved as `missing` plus user
    confirmation gate.

Release gates:

- `PYTHONPATH=src python3 -m unittest discover -s tests`
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-benchmark-fidelity-pycache PYTHONPATH=src python3 -m compileall src tests`
- `git diff --check`
- `PYTHONPATH=src python3 -m meridian framework-check --project-root .`

### Decision Trace Handoff

Key decisions:

- Implement as a Lab handoff/gate contract, not as Lab-owned code execution.
- Treat official benchmark fidelity as a stricter Research Prior subtype.
- Focus on metric-changing drift: runner, split, config defaults, metric
  function, and aggregation granularity.
- Keep provider substitution and history hooks allowed only when explicitly
  labeled as local deviations.

Rejected options:

- A universal deterministic official-benchmark auditor.
- Generic "review code quality" prompts.
- Relying only on Paper Wiki prior retrieval.
- Blocking all work when official evidence is missing.

Allowed implementation discretion:

- The implementation may choose exact field names and template placement as
  long as the handoff contract remains compact and testable.
- Eval cases may live in existing Lab eval files or a new benchmark-fidelity
  case file.
- The review prompt can be short, but it must ask for benchmark faithfulness,
  not generic code quality.

Decision invariants:

- Lab does not implement code or run benchmark jobs.
- Official metrics are not claimed when local behavior changes metric
  computation or aggregation.
- Missing official evidence remains visible and user-confirmed, not silently
  converted to checked grounding.
- The first release should be text/eval/test focused, with no new runtime
  daemon, CLI, MCP tool, or hook dependency.

## Developer Round

### RED

Added `test_lab_official_benchmark_fidelity_gate_assets_parse` before changing
the product assets.

RED command:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache-f53-red PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_lab_official_benchmark_fidelity_gate_assets_parse
```

Expected failure:

- The Lab skills did not contain `Official Benchmark Fidelity`.
- The research-prior eval set did not include AppWorld-style aggregation or
  tau-style default-mismatch cases.
- The research-prior rubric did not hard-fail missing official runner/config,
  metric, aggregation, or benchmark-faithfulness review fields.

### Implementation

Updated both product Lab skills:

- `plugins/codex/meridian/skills/lab/SKILL.md`
- `plugins/claude-code/meridian/skills/lab/SKILL.md`

Added an `Official Benchmark Fidelity` gate for official benchmark, baseline,
eval, metric, score, leaderboard, and published-result work. The gate requires
the Lab plan or development handoff to preserve:

- official runner entrypoint
- official task source / split source
- official config defaults
- official metric function
- official aggregation granularity
- local wrapper changes classified as provider substitution, history/context
  hook, reporting-only, or metric-changing behavior
- official metric versus derived diagnostic/local variant labels
- missing official evidence as a user-confirmed risk
- a benchmark-specific review prompt:

```text
Please review benchmark faithfulness, not general code quality. Compare local wrappers/artifacts against the official benchmark runner, config defaults, metric functions, and aggregation granularity. Find any local behavior that changes the reported metric.
```

Updated Lab docs and templates:

- `docs/research-dev-state-model.md`
- `docs/research-dev-use-cases.md`
- `src/meridian/templates/research-dev/thread.md`
- `src/meridian/templates/research-dev/experiment.md`

Updated evaluation assets:

- Added AppWorld-style wrong aggregation and tau-style default mismatch cases
  to `eval/cases/research_dev_research_prior.jsonl`.
- Added benchmark-fidelity hard-fail rules, score anchors, and repair buckets
  to `eval/rubrics/research_dev_research_prior_quality.md`.

Updated tests:

- `tests/test_cli.py` now checks both Lab skill copies, eval cases, and the
  research-prior rubric for the official benchmark fidelity contract.

### GREEN

Targeted new test:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache-f53-green3 PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_lab_official_benchmark_fidelity_gate_assets_parse
```

Result: pass.

Related targeted suite:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache-f53-targeted PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_lab_official_benchmark_fidelity_gate_assets_parse tests.test_cli.CliTests.test_lab_research_prior_assets_parse tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries tests.test_cli.CliTests.test_research_dev_state_model_assets_parse tests.test_cli.CliTests.test_research_dev_mvp_assets_exist tests.test_cli.CliTests.test_research_dev_eval_assets_parse
```

Result: `Ran 7 tests ... OK`.

## Evaluator Round

### Verification

Full unit suite:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache-f53-full PYTHONPATH=src python3 -m unittest discover -s tests
```

Result: `Ran 164 tests ... OK`.

Compile:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache-f53-compile PYTHONPATH=src python3 -m compileall src tests
```

Result: pass.

Framework check:

```bash
MERIDIAN_CONFIG_HOME=/private/tmp/meridian-framework-config-f53 PYTHONPATH=src python3 -m meridian framework-check --project-root /Users/shawn/Desktop/meridian
```

Result: `Framework status: pass`; `8 pass, 0 warn, 0 fail`.

Diff hygiene:

```bash
git diff --check
```

Result: pass.

### Evaluation Notes

- The full unit suite rewrote the deterministic audit snapshot
  `docs/knowledge-layer-quality-audit.md`; that known test side effect was
  restored because it is unrelated to F53.
- The implementation preserves the Lab boundary: it strengthens planning and
  handoff contracts, but does not make Lab run code, benchmark jobs, commits,
  releases, or convergence loops.
- The benchmark-specific review prompt is now a first-class handoff artifact,
  so downstream review should ask for official runner/config/default/metric
  and aggregation parity instead of ordinary code quality alone.

### Verdict

Accepted for local convergence.

## Convergence Round

### Decision

F53 is locally converged and ready for release handling.

### Why

The implemented changes match the user-reported failure mode directly:

- AppWorld-style official per-task outputs are no longer enough to justify an
  official aggregate unless official aggregation granularity is checked.
- tau-style runnable local wrappers are no longer enough to justify official
  parity unless official config defaults are checked.
- Generic "review code quality" is explicitly insufficient for benchmark
  baseline work; the handoff must request benchmark faithfulness review.

### Remaining Scope

- Commit, version bump, local plugin update, and push are release work and have
  not been performed in this convergence round.
- F52 remains a separate planned ingest identity/duplicate-guard feature.

## Release Round

### Decision

Publish patch release `0.5.3`.

### Version Management

Version-managed surfaces are aligned at `0.5.3`:

- `VERSION`
- `pyproject.toml`
- `src/meridian/__init__.py`
- `plugins/codex/meridian/.codex-plugin/plugin.json`
- `plugins/claude-code/meridian/.claude-plugin/plugin.json`
- release/version assertions in `tests/test_cli.py`

### Release Verification

| Check | Result |
| --- | --- |
| Targeted version/plugin/F53 tests | Passed, `Ran 5 tests ... OK` |
| `PYTHONPATH=src python3 -m meridian --version` | Passed, `meridian 0.5.3` |
| `PYTHONPATH=src python3 -m meridian.mcp capabilities --detail full` | Passed |
| Full unit suite | Passed, `Ran 164 tests ... OK` |
| Compile check | Passed |
| `git diff --check` | Passed |
| `framework-check` before local plugin cache sync | Warn only: local Codex/Claude plugin caches had not yet installed `0.5.3` |

### Notes

- The full unit suite rewrote `docs/knowledge-layer-quality-audit.md`; that
  deterministic audit snapshot was restored because it is unrelated to F53.
- The release does not add runtime daemons, hooks, CLI commands, or MCP tools.
  It is a skill/template/docs/eval/test release with version surface alignment.

### Publish Status

Ready to commit, push, and update local Codex/Claude plugin caches.
