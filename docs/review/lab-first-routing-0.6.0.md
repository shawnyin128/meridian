# Lab-First Routing 0.6.0

## Problem

Lab routing was too dependent on explicit user wording. The product skill said
to use Lab when managing research ideas as an idea graph, so ordinary research
development requests in a Meridian-initialized repo could bypass Lab even when
they involved methods, experiments, ablations, probes, metrics, baselines,
failure interpretation, or durable findings.

The root cause was not the Lab workflow body. The workflow already handled idea
placement, approach trees, experiment evidence, and development handoffs. The
weak point was the entry contract: the first-screen skill description did not
make `.meridian/` project state a routing signal.

## Decision

Meridian 0.6.0 starts the 0.6.x routing optimization line by making Lab the
default research/dev preflight layer for repos that already have `.meridian/`.
This is project-state routing before keyword routing.

Lab still is not a coding agent. When the next useful action is implementation,
debugging, testing, running experiments, release, or convergence, Lab produces
a development handoff and the normal coding workflow performs the code work.

## Routing Contract

Agents should classify initialized research repos with this gate before
bypassing Lab:

```text
lab_route: use | skip
reason: <why Lab is or is not the right layer>
repo_state: meridian_initialized | needs_lazy_init | not_lab_repo
research_prior: checked | missing | deferred | not_needed
handoff: yes | no
```

Use `lab_route: use` for research direction, method choice, experiment design,
ablation, probe, metric, baseline, evaluation protocol, failure interpretation,
paper grounding, idea placement, approach state, experiment evidence, local
findings, or development work whose result should update research state.

Use `lab_route: skip` only for pure mechanical engineering with no research
interpretation, no durable idea/evidence state, and no Paper Wiki grounding
need.

## Scope

- Updated Codex and Claude Code Lab skill entry descriptions.
- Added a `Lab-First Routing Gate` section near the top of both Lab skills.
- Updated the setup skill delegation boundary so setup points research
  development requests in `.meridian/` repos to Lab preflight.
- Updated README user-facing skill semantics.
- Bumped release surfaces to `0.6.0`.

## Verification

- Red test first:
  `python -m pytest tests/test_cli.py::CliTests::test_release_version_surfaces_are_aligned tests/test_cli.py::CliTests::test_python_module_entrypoints_execute_cli_main tests/test_cli.py::CliTests::test_meridian_product_skill_behavior_boundaries`
  failed on old `0.5.3` versions and missing Lab-first gate text.
- Green focused test:
  `python -m pytest tests/test_cli.py::CliTests::test_release_version_surfaces_are_aligned tests/test_cli.py::CliTests::test_python_module_entrypoints_execute_cli_main tests/test_cli.py::CliTests::test_meridian_product_skill_behavior_boundaries tests/test_cli.py::CliTests::test_meridian_plugin_skill_copies_match_repo_skills`
  passed with `4 passed`.
- Full test suite:
  `python -m pytest`
  passed with `214 passed`.
- Version smoke:
  `python -m meridian --version`
  printed `meridian 0.6.0`.

## Scenario Coverage

The first 0.6.0 implementation had enough unit coverage to prevent the skill
text from losing the Lab-first gate, but it did not yet have enough
scenario-level evidence to claim real routing improvement. The gap was the
Meridian skill behavior evaluation set: it still had a stale case where a probe
needed by a Lab node went directly to the normal coding workflow.

The evaluation set now includes Lab-first preflight cases for:

- an initialized `.meridian/` repo that needs an ablation probe for the active
  node
- an initialized `.meridian/` repo where a metric/eval/failure regression needs
  interpretation
- setup already being ready, followed by a probe implementation request tied to
  a Lab node

The rubric now has a `Lab-First Research/Dev Routing` dimension and a
`lab_first_routing` repair bucket. It hard-fails both directions:

- research-development work in an initialized `.meridian/` repo bypassing Lab
  preflight
- pure mechanical engineering creating Lab state or unnecessary wiki grounding

This still does not prove model routing will improve in every client. It proves
the shipped product contract, evaluation cases, and regression tests now encode
the desired behavior. Real improvement should be measured by running these
cases through the active client/model and comparing before/after pass rate,
especially on ambiguous implementation requests tied to existing Lab state.

## Live Codex Routing Harness

The project now includes a live routing harness:

```bash
python -m meridian eval codex-routing \
  eval/cases/meridian_skill_behavior_quality.jsonl \
  --case-id lab-initialized-research-dev-preflight \
  --out-dir eval/runs/codex-routing-0.6.0-smoke \
  --repo-root . \
  --overwrite
```

This command calls `codex exec` for real. It writes:

- `prompt.md`: the exact routing prompt sent to Codex
- `events.jsonl`: raw Codex JSONL events
- `last-message.json`: the schema-constrained model response
- `result.json`: case-level verdict
- `summary.json` and `report.md`: aggregate pass/fail summary

By default, the harness runs `codex exec` with `--ignore-user-config` and
`--ignore-rules` so host startup skills, stale installed plugins, or unrelated
project/session rules do not contaminate the routing measurement. Use
`--use-user-config` only when intentionally testing the full host Codex setup.

The test output schema requires `path_rationale`, an ordered explanation of the
route decision. This field is only for eval artifacts and debugging. Meridian
product skills must not require user-visible rationale output.

- `repo_state_signal`
- `intent_signal`
- `lab_boundary_signal`
- `handoff_signal`

This makes failures diagnosable: the run can show whether Codex missed the
`.meridian/` signal, misread the user intent, misunderstood the Lab boundary, or
failed to hand implementation work to normal coding.

### Current Live Run Status

After external access was explicitly approved, the first live run reached Codex
but failed the case:

- expected `selected_entry: lab`
- got `selected_entry: normal_coding_workflow`
- expected `routing: lab_first_preflight`
- got `routing: setup_status`

The `path_rationale` showed this was a harness contamination issue rather than
a clean route miss: the agent followed host/session startup behavior and
oriented itself in the repo instead of classifying `Case.user_request`. The
harness now isolates Codex config/rules by default and tells the model to ignore
surrounding startup protocols so the measured signal is the routing decision
for the scenario prompt.

A second harness issue was found on Windows: passing the multi-line prompt as a
command-line argument let Codex see the eval preamble but not reliably classify
the full `Case.user_request`. The runner now invokes `codex exec -` and sends
the prompt over stdin. `result.json` command snapshots store `<stdin-prompt>`
instead of embedding the full prompt in the command list.

The current Lab-first live scenario pack now passes:

```bash
python -m meridian eval codex-routing \
  eval/cases/meridian_skill_behavior_quality.jsonl \
  --case-id lab-initialized-research-dev-preflight \
  --case-id lab-initialized-failure-analysis-preflight \
  --case-id setup-after-ready-code-boundary \
  --out-dir eval/runs/codex-routing-0.6.0-lab-first \
  --repo-root . \
  --overwrite \
  --timeout 300
```

Result:

- total cases: 3
- passed: 3
- failed: 0
- pass rate: 1.0

The passing rationales exercise the intended decision path: `.meridian/` repo
state, research-development or experiment/failure intent, Lab-first preflight,
and conditional handoff to the normal coding workflow when concrete
implementation/debug/test work is identified.
