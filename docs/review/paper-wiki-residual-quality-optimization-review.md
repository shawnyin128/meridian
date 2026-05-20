---
type: "arbor_review"
feature_id: "F14"
title: "Paper Wiki Residual Quality Optimization Review"
status: "draft"
created: "2026-05-20"
updated: "2026-05-20"
---

# Paper Wiki Residual Quality Optimization Review

## Context/Test Plan

F13 proved Meridian is not quantization-specific on the domain-diverse calibration set, but left three explicit quality risks:

- candidate records can still include noisy extracted source sentences
- visual/table/equation semantics are shallow
- generic metric extraction can over-collect broad metrics such as accuracy/precision/recall

This feature optimizes those residual issues one by one. Each fix must be generalized, covered by regression tests, and visible in a real domain-diverse rerun.

Acceptance checks:

- candidate method summaries become concise and domain-contract based for single-method papers
- visual/table/equation pointers carry semantic labels rather than only object counts
- metric extraction avoids routing on generic words unless there is evidence context
- before/after evidence is recorded in a quality brief update
- retrieval readiness from F13 is preserved

## Developer Round 1

Implemented generalized ingest and quality-check changes:

- added contract-first fallback summaries for non-quantization single-method domains
- added semantic visual/table/algorithm/equation mechanism facts from caption-like page text
- refined metric extraction with sentence-level evidence context and numeric-format exclusions
- added quality-check penalties for noisy method summaries
- added regression coverage for noisy summaries, low-precision metric false positives, visual/table mechanism facts, KV-cache compression, and speculative-action summaries

Real calibration reruns:

- ingest run: `eval/runs/2026-05-20-residual-quality-r2/`
- idea retrieval run: `eval/runs/2026-05-20-residual-quality-idea-r1/`
- quality brief: `docs/paper-wiki-residual-quality-optimization-brief.md`

Observed improvements against `eval/runs/2026-05-20-domain-general-r10/`:

- average method summary length: 481.2 -> 160.5 chars
- max method summary length: 829 -> 199 chars
- noisy method summaries: 8 -> 0
- papers with false `precision` metric: 5 -> 0
- semantic visual/table/algorithm/equation records: 6 -> 48
- idea retrieval remained 6/6 deterministic pass with recall@5 1.000 and section hit rate 1.000

Targeted tests:

- `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_quality_check_penalizes_noisy_method_summaries tests.test_cli.CliTests.test_attention_kernel_low_precision_does_not_become_ptq tests.test_cli.CliTests.test_visual_table_equation_pages_create_semantic_mechanism_facts`
- `PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_kv_cache_compression_does_not_become_clustering_algorithm tests.test_cli.CliTests.test_attention_kernel_low_precision_does_not_become_ptq tests.test_cli.CliTests.test_visual_table_equation_pages_create_semantic_mechanism_facts tests.test_cli.CliTests.test_agent_speculative_actions_are_not_token_decoding`

Both targeted test commands passed.

## Evaluator Round 1

The fixes are generalized and not single-paper edits. The before/after evidence shows improvement on three explicit residual dimensions without hurting retrieval readiness.

Residual risks:

- visual facts are caption/page-text derived and should not be described as full image understanding
- quality average/minimum did not increase because the prior rubric was already near ceiling; improvement is visible in targeted residual metrics
- LLM-as-Judge packets are generated but not executed through an external model in this local run

Evaluator decision: pass for F14.

## Convergence Round 1

F14 converged because the residual issues each have a generalized fix, regression coverage, real before/after evidence, and preserved idea-level retrieval metrics. No product-boundary escalation is needed.

## Release Round 1

Release gate status:

- full unit suite: pass
- compileall: pass
- `git diff --check`: pass
- AGENTS project-map drift hook: pass
- Arbor process-state check: pass
