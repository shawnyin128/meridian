---
type: "calibration_brief"
title: "Paper Wiki Residual Quality Optimization Brief"
status: "draft"
created: "2026-05-20"
updated: "2026-05-20"
tags:
  - llm-wiki
  - paper-ingest
  - retrieval-eval
  - residual-quality
---

# Paper Wiki Residual Quality Optimization Brief

## Scope

This pass targets the remaining quality issues after domain-general calibration:

- candidate method records sometimes preserved long source sentences instead of concise mechanism contracts
- visual/table/equation evidence was mostly page-pointer metadata, not semantic evidence records
- generic metric extraction over-collected words such as `precision` when they meant numeric format rather than an evaluation metric

The fixes are mechanism-level changes in the ingest pipeline and quality checker, not hand edits to individual `paper.md` files.

## Before / After

Comparison baseline: `eval/runs/2026-05-20-domain-general-r10/`

Current run: `eval/runs/2026-05-20-residual-quality-r2/`

Idea retrieval verification: `eval/runs/2026-05-20-residual-quality-idea-r1/`

| Check | Baseline | Current | Result |
| --- | ---: | ---: | --- |
| Average method summary length | 481.2 chars | 160.5 chars | improved |
| Max method summary length | 829 chars | 199 chars | improved |
| Noisy method summaries | 8 | 0 | improved |
| Papers with false `precision` metric | 5 | 0 | improved |
| Semantic visual/table/algorithm/equation records | 6 | 48 | improved |
| Ingest quality average | 4.957 | 4.957 | preserved |
| Ingest quality minimum | 4.822 | 4.822 | preserved |
| Idea retrieval deterministic pass rate | 6 / 6 | 6 / 6 | preserved |
| Idea retrieval required recall@5 | 1.000 | 1.000 | preserved |
| Idea retrieval section hit rate | 1.000 | 1.000 | preserved |

## Changes

Method summaries now prefer domain contract summaries for single-method papers when the paper context clearly maps to a known domain pattern: KV-cache compression, attention kernels, agent speculative actions, audio-language modeling, video JEPA, PINN/PDE, clustering/PCA theory, LLM-agent surveys, DPO/preference optimization, and TTRL/test-time RL.

Visual/table/equation extraction now creates semantic mechanism facts from caption-like page text. The records distinguish algorithm/pseudocode details, result tables, mechanism figures, ablation figures, and equation/theorem details. These facts appear in `Mechanism Details To Verify`, so downstream retrieval can route to page-level evidence rather than only frontmatter tags.

Metric extraction now uses sentence-level context. It rejects `precision` when it is used as a numeric format phrase such as low precision, FP8 precision, FP16 precision, machine precision, or precision computation. It also rejects non-metric recall usages such as "let us recall equation".

The quality self-check now penalizes noisy method summaries in candidate records. This catches the failure mode even when a page still has claims, method records, and evidence with valid schema.

## Evidence

Representative current outputs:

- `eval/runs/2026-05-20-residual-quality-r2/dg-kv-pyramidkv/paper.md`
- `eval/runs/2026-05-20-residual-quality-r2/dg-attention-flashattention3/paper.md`
- `eval/runs/2026-05-20-residual-quality-r2/dg-agent-speculative-actions/paper.md`
- `eval/runs/2026-05-20-residual-quality-r2/dg-sciml-pinn/paper.md`

The current FlashAttention page keeps `precision` as part of low-precision compute context while removing it from metric frontmatter. It keeps throughput, speedup, memory, loss/RMSE-style evidence, and accuracy/numerical accuracy as evidence-facing metrics.

The current mechanism details are more retrieval-ready because they expose visual and table evidence as page-grounded records. They are still shallow caption/text-derived evidence, not full multimodal figure understanding.

## Remaining Limits

This pass improves the deterministic ingest path, but it does not make the system a full multimodal paper reader. Figure understanding is still bounded by extracted caption/page text unless page images are rendered and a model reads them.

The quality score is preserved rather than increased because the prior rubric already scored most domain-general pages near ceiling. The measurable improvement is therefore in targeted residual metrics: summary noise, false metric extraction, and visual/evidence semantic coverage.

LLM-as-Judge packets remain available but were not executed through an external API in this pass.
