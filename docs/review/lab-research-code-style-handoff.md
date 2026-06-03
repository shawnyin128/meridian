# Lab Research Code Style Handoff

## Context/Test Plan

### Context

The user reported a Lab usage failure: when asked for a calibration dataset
construction path, the resulting code followed a production-style decomposition
pattern with many small helper functions. The user prefers research code that
keeps a small experimental slice readable as a mostly linear flow.

Evidence loaded:

- User-provided contrast:
  - disliked: `load_calibration_dataset` delegates parsing, one-dataset loading,
    and text-column selection into separate helpers
  - preferred: one main function keeps the source-specific dataset logic inline,
    with only a thin dataloader wrapper
- Current Lab skill:
  - Lab is not a coding agent
  - Lab hands implementation/debug/test work to the normal coding workflow
  - Development Handoff currently preserves evidence identity but does not
    describe desired research-code shape
- Current docs:
  - `docs/research-coding-framework.md` already states that research-friendly
    code may use purposeful redundancy and should not optimize primarily for
    production-style elegance
  - `docs/research-dev-use-cases.md` and
    `docs/research-dev-state-model.md` define development handoff as the Lab to
    coding-workflow boundary
- Current eval/rubric:
  - Lab behavior eval covers handoff boundary and evidence identity
  - It does not currently test the style of code requested by a Lab handoff

### Problem

Lab is correctly not doing code work, but its handoff does not yet tell the
coding workflow what kind of code shape is appropriate for research slices.
That gap lets a generic coding agent translate a research request into
production-style micro-abstractions that are harder for the researcher to
inspect, modify, and ablate.

### Dry-Run Conclusion

A Lab-only handoff contract is not sufficient to guarantee the final generated
code style. Lab does not own code implementation, so it can only guarantee that
the downstream coding workflow receives an explicit, auditable requirement.

To guarantee the final code shape, the same requirement must also be treated as
a coding-workflow acceptance criterion or evaluator gate. The durable contract
is therefore:

- Lab must emit a concrete `Research Code Style` requirement in the
  `Development Handoff` when a task is an exploratory research slice.
- The receiving coding workflow must preserve that requirement as an
  implementation acceptance criterion.
- Evaluation must fail outputs that omit the style requirement or translate it
  into generic wording such as "write clean research code".

Dry-run result against the user's calibration dataset examples:

| Example | Result | Reason |
| --- | --- | --- |
| Helper-heavy calibration loader with many one-off parse/load/select helpers | Fail | Single-use helper layers hide the experimental branch logic that the researcher needs to inspect and ablate. |
| One main calibration loader with inline source branches plus a thin dataloader wrapper | Pass | Dataset aliases, splits, shuffle behavior, sample limits, and source-specific decisions remain visible in the main flow. |
| Shared reusable loader used across many files or experiments | Conditional pass | Extraction is acceptable only when reuse, risk isolation, or a stable external boundary is real and stated. |

### Goal

Add a lightweight but enforceable Lab-to-coding contract for research-code
style: the handoff should state when the next coding workflow must prefer a
linear, inspection-friendly implementation over highly factored helper
abstractions, and the eval/review plan must treat that requirement as a
downstream acceptance criterion.

### Non-Goals

- Do not make Lab perform code edits.
- Do not impose one universal coding style on every repo.
- Do not ban helper functions.
- Do not weaken normal engineering judgment for shared library code,
  productionized paths, or repeated cross-file behavior.
- Do not add a formatter, linter, routing engine, CLI, MCP surface, or daemon.

### Recommended Approach

Treat this as a `Development Handoff` and eval-contract change, not a new Lab
workflow.

The Lab skill should add a compact `Research Code Style` clause and make its
scope explicit: Lab can guarantee the handoff requirement, while final-code
guarantee requires the receiving coding workflow or evaluator to enforce the
same clause.

The clause should say:

- For one-off experiment slices, calibration builders, probes, ablations,
  sanity checks, and dataset/eval scripts, prefer a single readable main flow.
- Keep control flow, source-specific branches, configs, seeds, splits, metrics,
  and output identity visible near the call site.
- Add helper functions only when they remove real repetition, isolate a
  reusable boundary, or make a risky operation easier to inspect.
- Avoid production-style micro-abstractions that hide the experimental logic
  behind parser/loader/selector layers.
- Prefer purposeful local redundancy when it makes variants easier to compare.

### Rejected Options

| Option | Reason Rejected |
| --- | --- |
| Make Lab directly edit code with this style | Violates the 0.4.x Lab boundary. |
| Add a deterministic code-style linter | Too heavy and brittle for research code. |
| Add a global "never split functions" rule | Wrong for reusable utilities, shared APIs, and complex repeated logic. |
| Put this only in docs | Agents mainly follow the product skill and eval pressure. |

### Acceptance Criteria

- Lab development handoffs must express a concrete research-code style
  requirement when the task is an exploratory research slice, without claiming
  that Lab performed the code work.
- The preference distinguishes exploratory research slices from shared
  production/library code.
- The guidance favors linear, inspectable main flows for calibration datasets,
  probes, ablations, sanity checks, and small experiment scripts.
- The guidance allows helper functions when there is real reuse, risk
  isolation, or a clear boundary.
- The guidance explicitly says a Lab-only contract cannot guarantee final code
  style unless the receiving coding workflow or evaluator treats it as an
  acceptance criterion.
- Codex and Claude Code Lab skills stay in sync.
- Existing docs that mention development handoff or research-friendly code are
  updated to match the new contract.
- Eval coverage includes a negative calibration-dataset example that fails when
  the handoff merely says "write clean research code" or permits excessive
  one-off helper splitting.
- Eval coverage includes a positive calibration-dataset example that passes
  when the handoff requires a linear main flow with visible source branches,
  configs, seeds, splits, and sample limits.

### Done-When Criteria

| Criterion | Verification Method | Owner |
| --- | --- | --- |
| Lab handoff states the research-code style contract | Skill text check for `Research Code Style` and handoff guidance in both plugin packages | develop |
| The contract remains boundary-safe | Tests/assertions confirm Lab still says it does not edit code and hands implementation to the normal coding workflow | develop/evaluate |
| Final-code guarantee boundary is explicit | Review/eval checks confirm the skill says downstream enforcement is required for final generated code style | develop/evaluate |
| Docs match product behavior | Content checks for `docs/research-dev-use-cases.md`, `docs/research-dev-state-model.md`, and `docs/research-coding-framework.md` | develop/evaluate |
| Eval catches over-engineered handoffs | JSONL/rubric parse checks plus a case/rubric assertion for calibration dataset style | develop/evaluate |
| Release remains lightweight | Full unit suite, compileall, diff check, framework-check, and plugin skill copy parity | release |

### Test Plan

Targeted checks:

- Product skill behavior tests for:
  - `Research Code Style`
  - linear research slice wording
  - no Lab code editing
  - final-code guarantee requires downstream acceptance/evaluation
  - Codex/Claude skill copy parity
- Eval JSONL parse check for a calibration-dataset handoff case.
- Rubric content check for research-code style.

Release gates:

- `PYTHONPATH=src python3 -m unittest discover -s tests`
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-research-code-style-pycache PYTHONPATH=src python3 -m compileall src tests`
- `git diff --check`
- `PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki`

### Implementation Evidence

Implemented:

- Codex and Claude Code Lab skills now require `Research Code Style` in
  development handoffs for exploratory research slices.
- The development handoff template has a dedicated `Research Code Style`
  section and downstream acceptance criterion field.
- Lab use-case and state-model docs explain that Lab can require the handoff
  but final generated code requires downstream enforcement.
- The legacy research-coding framework now records the concrete anti-pattern:
  single-use parser/loader/selector helper layers for a small calibration or
  dataset path when those helpers hide experimental decisions.
- `research_dev_mvp` eval coverage includes a calibration dataset handoff
  case that rejects generic "clean research code" wording and helper-heavy
  one-off decomposition.
- The Lab quality rubric includes `Research Code Style` scoring and hard-fail
  behavior for missing or vague handoff style requirements.

Verified:

- Bumped release surfaces to `0.4.9`: `VERSION`, `pyproject.toml`, Python
  `__version__`, Codex plugin manifest, Claude Code plugin manifest, and
  release version test expectation.
- `PYTHONPATH=src python3 -m meridian --version`: `meridian 0.4.9`.
- `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills tests.test_cli.CliTests.test_research_dev_mvp_assets_exist tests.test_cli.CliTests.test_research_dev_eval_assets_parse`
- `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_release_version_surfaces_are_aligned tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills tests.test_cli.CliTests.test_research_dev_mvp_assets_exist tests.test_cli.CliTests.test_research_dev_eval_assets_parse`
- `PYTHONPATH=src python3 -m unittest discover -s tests`
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-0.4.9-pycache PYTHONPATH=src python3 -m compileall src tests`
- `PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki`
- `git diff --check`

Note: framework-check reports a plugin-cache warning before local plugin update
because `0.4.9` is not installed in Codex/Claude caches yet. Re-run after local
plugin update as the final publish check.

### Decision Trace Handoff

- The style rule belongs to the Lab-to-coding handoff because Lab does not own
  implementation.
- Do not claim Lab can guarantee downstream code by itself. It can guarantee
  handoff obligations; final generated code requires coding-workflow or
  evaluator enforcement.
- The implementation should keep this as a short positive contract, not a long
  prohibition list.
- The preferred default is "linear until reuse/risk justifies extraction".
- The evaluator should focus on whether the handoff helps a coding agent
  preserve research inspectability, not whether the final code has exactly one
  function.
