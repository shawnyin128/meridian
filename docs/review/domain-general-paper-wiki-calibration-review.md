---
type: "arbor_review"
feature_id: "F13"
title: "Domain-General Paper Wiki Calibration Review"
status: "draft"
created: "2026-05-20"
updated: "2026-05-20"
---

# Domain-General Paper Wiki Calibration Review

## Context/Test Plan

Goal: prove the Paper Wiki ingest and retrieval workflow is domain-general rather than quantization-specific.

Acceptance focus:

- domain-diverse paper ingest cases and rubric
- real cross-domain ingest outputs
- generalized mechanism fixes, not hand-edited `paper.md`
- idea-level retrieval evaluation with complex research intents
- documented conclusion about remaining quantization bias
- regression tests and release checks

## Developer Round 1

Implemented:

- Added `eval/cases/domain_general_paper_ingest.jsonl` covering 12 real-paper domains.
- Added `eval/rubrics/domain_general_paper_wiki_quality_v0.md`.
- Added `eval/cases/domain_general_idea_retrieval.jsonl` for six complex research intents.
- Added domain contracts and routing guards for attention kernels, agent workflow speculation, audio-language, video representation, KV-cache compression, survey synthesis, PINN, clustering, and preference/test-time RL.
- Replaced long extracted single-method summaries in `What To Remember` and `Mechanism` purpose with contract-driven narratives.
- Expanded retrieval section intent matching and retained all core matched sections.
- Added regression tests for KV-cache versus clustering, agent workflow versus token decoding/computer architecture, audio-language routing, video representation routing, cross-domain contamination, and retrieval section-intent coverage.

Real run evidence:

- Final ingest run: `eval/runs/2026-05-20-domain-general-r10/eval_manifest.json`
- Final idea retrieval run: `eval/runs/2026-05-20-domain-general-idea-retrieval-r4/retrieval_summary.json`
- Quality brief: `docs/domain-general-paper-wiki-calibration-brief.md`

## Evaluator Round 1

Checks performed:

- Replayed domain-diverse ingest after every generalized fix.
- Inspected real outputs for PyramidKV, FlashAttention-3, Speculative Actions, and contamination grep across canonical paper pages.
- Ran idea-level retrieval against the generated canonical wiki.
- Diagnosed failures by mechanism:
  - PyramidKV was initially polluted by generic clustering; fixed by separating KV-cache efficiency context from clustering research.
  - Speculative Actions was initially polluted by computer-architecture analogy; fixed by filtering analogy topics in agent-action context.
  - Retrieval eval initially failed despite correct pages because section packet vocabulary and top-section truncation dropped `Limitations / Uncertainty`; fixed by expanding section intent terms and retaining all core section hits.
  - Speculative Actions limitation text was initially generic hardware/simulator scope; fixed with action-level verifier/rollback/environment-state limitations.

Final metrics:

- Ingest: 12 / 12 pass, average quality score 4.958, minimum 4.822.
- Retrieval: 6 / 6 deterministic pass, required recall@5 1.000, section hit rate 1.000.

Residual risks:

- LLM-as-Judge packets were generated but not executed by an API backend.
- Visual/table/equation understanding remains shallow.
- Candidate-record appendices can still include noisy extracted source sentences.

## Convergence Round 1

Converged for the current F13 goal.

Developer and evaluator evidence agree that the current ingest/retrieval skill is no longer quantization-specific on the selected domain-diverse set. Remaining issues are broader paper-understanding depth and future domain coverage, not blockers for the domain-general MVP calibration checkpoint.

## Release Round 1

Release gate before commit:

- Run targeted regression tests.
- Run full unit suite.
- Run compileall.
- Run `git diff --check`.
- Run Arbor process-state checks.
- Commit with a scoped feature message.
