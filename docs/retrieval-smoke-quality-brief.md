---
type: evaluation_brief
title: "Retrieval Smoke Quality Brief"
status: current
created: 2026-05-20
updated: 2026-05-20
tags:
  - paper-wiki
  - retrieval
  - evaluation
confidence: medium
---

# Retrieval Smoke Quality Brief

## Scope

This brief records the first retrieval evaluation run over representative canonical Paper Wiki pages.

Run:

```bash
PYTHONPATH=src python3 -m meridian wiki retrieval-eval \
  eval/cases/wiki_retrieval_quantization_smoke.jsonl \
  --wiki-root eval/runs/2026-05-19-quality-selfcheck/round4-final/wiki \
  --out-dir eval/runs/2026-05-20-retrieval-smoke \
  --rubric eval/rubrics/wiki_retrieval_quality_v0.md \
  --top-k 5 \
  --overwrite
```

The output run directory is intentionally under ignored `eval/runs/`. The durable case definitions and rubric are tracked.

## Result

Deterministic result after the retrieval-eval runner and intent-aware section scoring:

| Metric | Value |
| --- | ---: |
| Cases | 4 |
| Deterministic passes | 4 |
| Deterministic failures | 0 |
| Average required recall@5 | 1.0 |
| Average section hit rate | 1.0 |
| Judge results recorded | 0 |

Covered scenarios:

- MoE quantization calibration and implementation ablations.
- Rotation-based quantization implementation checkpoints.
- Systems evidence for throughput, speedup, memory, and kernels.
- Weight-only versus weight-activation/KV-cache scope separation.

## What The Run Proved

- The retrieval-eval runner can build a catalog, run per-case retrieval, write `context.md`, `context.json`, `judge-packet.md`, `retrieval_manifest.json`, and `retrieval_summary.json`.
- Deterministic metrics catch missing required pages and missing read-first sections.
- Intent-aware section scoring improves context packets for implementation, evidence, and scope/limitation queries.
- Context packets now surface up to five read-first sections per result, which is enough to include `Limitations / Uncertainty` for scope-sensitive queries without becoming a retrieval dump.

## Remaining Gaps

- This was a quantization-only smoke set. It does not prove cross-domain generalization.
- The run did not include LLM-as-Judge results; it only prepared judge packets and deterministic metrics.
- The canonical pages used here are from an older generated wiki and still contain some stale body metadata patterns such as `Retrieval Anchors` and repeated `Source` blocks. Current ingest avoids these, but old pages remain useful as a stress test.
- Source-quality cleanup scenarios are designed but not yet represented in this smoke set.
- The retrieval engine is still lexical/frontmatter plus section scoring. It should be evaluated further before adding vector search or MCP delivery.

## Current Judgment

Retrieval v0 is usable enough for the next Paper Wiki MVP step: query-time context packets and draft write-back proposals. It is not yet proven enough to be called a stable retrieval layer across the full user library.
