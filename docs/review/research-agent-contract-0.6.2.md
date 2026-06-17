# Research Agent Contract 0.6.2

## Scope

Meridian 0.6.2 adds a research-agent contract for research-development work:

- user-level `research-agent-principles.md`
- compact `coding-style.md` cross-link
- guarded project `AGENTS.md` injection during Lab readiness init
- Lab Research Grounding Injection `Implementation Integrity Gate`
- Code Style Distillation workflow
- deterministic and live Codex eval assets for contract routing and integrity

## Boundaries

- Lab remains a preflight, idea-graph, grounding, and proposal layer.
- Normal coding workflow still owns implementation, debugging, tests, commits,
  release, and convergence.
- Eval-only rationale remains in eval prompts and schemas, not normal skill output.

## Verification

- targeted tests: `4 passed` for research-agent contract prompt/assets,
  scorer, mismatch detection, and CLI runner smoke.
- review-fix targeted tests: `5 passed` for AGENTS contract framework checks,
  duplicate/stale contract validation, research-agent prompt/assets, scorer,
  and mismatch detection.
- full tests: `245 passed`.
- compileall: `python -m compileall src tests` passed.
- diff check: `git diff --check` passed.
- live Codex eval:
  `python -m meridian eval codex-research-agent-contract eval/cases/research_agent_contract_live.jsonl --out-dir eval/runs/research-agent-contract-live-20260616-24case-final2 --overwrite --timeout 300`
  passed `24/24` cases, including 14 positive Lab/research-agent scenarios
  and 10 negative routing-boundary scenarios.
- setup doctor: runtime/import/MCP capability checks passed for version `0.6.2`;
  status is `degraded` only because the local Codex and Claude plugin caches
  are not installed in this worktree environment.
