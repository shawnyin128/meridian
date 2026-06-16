# Lab Grounding Injection 0.6.1

Date: 2026-06-16

## Scope

Meridian 0.6.1 tightens the Lab context boundary after the 0.6.0 Lab-first
routing release.

- Removed Lab-owned `.meridian/memory.md` from lazy initialization,
  validation, templates, release packaging, docs, and setup skill guidance.
- Replaced durable development handoff state with a Research Grounding
  Injection packet.
- Updated Codex and Claude Lab skills so implementation, debugging, tests,
  release, and convergence receive Paper Wiki implementation grounding before
  normal coding, without making Lab a coding agent.
- Added a real Codex live scenario evaluator for Lab routing and grounding
  behavior.

## Live Eval

Command:

```powershell
python -m meridian eval codex-lab-grounding `
  eval/cases/lab_grounding_injection_live.jsonl `
  --out-dir eval/runs/lab-grounding-live-20260616-160904 `
  --repo-root . `
  --overwrite
```

Result:

- Total cases: 32
- Passed: 32
- Failed: 0
- Pass rate: 1.000

The suite includes positive Lab graph, Paper Wiki grounding, open-source code
prior, and Research Grounding Injection cases, plus negative setup, wiki, and
pure mechanical coding cases. The evaluator records `path_rationale` only in
eval artifacts; shipped product skills do not require that diagnostic field.

## Verification

- `python -m pytest`: 225 passed
- `python -m compileall src tests`: passed
- `git diff --check`: passed with CRLF warnings only

## Release Surfaces

Version surfaces are aligned at `0.6.1`:

- `VERSION`
- `pyproject.toml`
- `src/meridian/__init__.py`
- `plugins/codex/meridian/.codex-plugin/plugin.json`
- `plugins/claude-code/meridian/.claude-plugin/plugin.json`
- release version tests
