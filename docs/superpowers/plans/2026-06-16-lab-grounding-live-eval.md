# Lab Grounding Live Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Codex live evaluation suite that checks whether initialized Meridian research-development requests route through Lab and produce Research Grounding Injection decisions before coding.

**Architecture:** Reuse the existing `meridian eval codex-routing` pattern: JSONL cases, `codex exec --output-schema`, per-case artifacts, aggregate JSON/Markdown reports, and deterministic local scoring. Keep `path_rationale` eval-only in prompts and output schemas; product skills must not mention it.

**Tech Stack:** Python stdlib, existing Meridian CLI, `codex exec`, JSONL scenario files, pytest for deterministic runner tests.

---

### Task 1: Add Scenario Assets And RED Tests

**Files:**
- Create: `eval/cases/lab_grounding_injection_live.jsonl`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write failing asset tests**

Add tests that require at least 30 live cases, including at least 10 positive Lab preflight cases, at least 10 coding-grounding positive cases, and at least 10 negative or non-Lab cases. Cases must include expected booleans for research graph checks, Paper Wiki checks, open-source code checks, Research Grounding Injection, and expected handoff.

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
python -m pytest tests/test_cli.py::CliTests::test_lab_grounding_live_eval_cases_parse -q
```

Expected: fail because `eval/cases/lab_grounding_injection_live.jsonl` does not exist.

- [ ] **Step 3: Add the JSONL cases**

Add 30+ realistic cases covering idea capture, continuing a research direction, active node recovery, completed work write-back, evidence reconciliation, baseline/eval design, paper-grounded feasibility, code-grounded probe implementation, debugging, metric regression, and mechanical/setup/wiki negatives.

- [ ] **Step 4: Re-run asset tests**

Run the same pytest target and expect pass after the case file exists.

### Task 2: Add Lab Grounding Live Runner

**Files:**
- Modify: `src/meridian/evals/codex_routing.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write failing runner tests**

Add tests for `run_codex_lab_grounding_eval`, `build_lab_grounding_prompt`, and scoring behavior. The fake runner must write a schema-compliant last message with `selected_entry`, `routing`, grounding booleans, `handoff_to`, `reason`, and `path_rationale`.

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
python -m pytest tests/test_cli.py::CliTests::test_codex_lab_grounding_eval_runner_scores_grounding_fields -q
```

Expected: fail because the new functions do not exist.

- [ ] **Step 3: Implement runner functions**

Reuse `run_codex_routing_eval` primitives where practical, but give the new suite its own schema version, prompt, output schema, scoring fields, and report title. Keep `--limit` supported for debugging, but do not use it for the final requested run.

- [ ] **Step 4: Re-run runner tests**

Run the focused tests and expect pass.

### Task 3: Add CLI Entry

**Files:**
- Modify: `src/meridian/cli.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write failing CLI test**

Add a test that invokes `main(["eval", "codex-lab-grounding", ...])` with a fake runner and checks that summary/report paths are printed and non-zero failures return exit code 1.

- [ ] **Step 2: Implement CLI command**

Add `meridian eval codex-lab-grounding` with the same operational flags as `codex-routing`: `--out-dir`, `--repo-root`, `--codex-bin`, `--model`, `--profile`, `--case-id`, `--limit`, `--timeout`, `--overwrite`, and `--use-user-config`.

- [ ] **Step 3: Re-run CLI tests**

Run focused CLI tests and expect pass.

### Task 4: Verify And Run Full Live Eval

**Files:**
- No production file changes expected after this point.

- [ ] **Step 1: Run deterministic verification**

Run:

```powershell
python -m pytest tests/test_cli.py::CliTests::test_lab_grounding_live_eval_cases_parse tests/test_cli.py::CliTests::test_codex_lab_grounding_eval_runner_scores_grounding_fields tests/test_cli.py::CliTests::test_codex_lab_grounding_prompt_does_not_leak_expected_answer -q
python -m pytest
python -m compileall src tests
git diff --check
```

- [ ] **Step 2: Run full live Codex evaluation**

Run all cases, without `--limit`:

```powershell
python -m meridian eval codex-lab-grounding eval/cases/lab_grounding_injection_live.jsonl --out-dir eval/runs/lab-grounding-live-YYYYMMDD-HHMMSS --repo-root . --overwrite
```

Expected: all cases execute through real `codex exec`; summary and report are written under `eval/runs/...`.

- [ ] **Step 3: Report results**

Summarize pass/fail counts, top failure patterns, report path, and whether product skills remain free of `path_rationale`.
