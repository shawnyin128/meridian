# Concept Layer Optimization Brief

Generated for the Preliminary Knowledge / Concept Layer MVP.

## What Changed

- Added `wiki/concepts/` as a canonical knowledge-layer directory.
- Added deterministic CLI support:
  - `meridian wiki concept-audit`
  - `meridian wiki propose-concept-layer`
  - `meridian wiki concept-layer-lint`
  - `meridian wiki publish-concept-layer`
- Extended catalog/retrieval to include `result_type: concept`.
- Added `Prerequisite Concepts` links on method pages and `Key Concepts` links on topic pages where low-risk concept relationships were available.
- Added concept eval cases and rubric for coding/debug/probe-oriented retrieval.

## Main Wiki Results

- Concept pages published: 9
- Candidate concepts detected: 9
- Unpromoted candidate concepts: 0
- Methods with prerequisite concepts: 11 / 302
- Topics with key concepts: 32 / 91
- Concepts missing source papers: 0
- Concepts missing method links: 0
- Concepts missing implementation implications: 0
- Concepts missing minimal checks/probes: 0
- Low-information concept stubs: 0
- Source-quality contamination: 0

Published concepts include:

- `Activation outliers`
- `Quantization error propagation`
- `Per-channel scaling`
- `KV-cache memory bandwidth`
- `Attention sink`
- `Speculative decoding acceptance rate`
- `KL regularization`
- `PDE residual`
- `K-means objective landscape`

## Retrieval Evaluation

Run:

```bash
meridian wiki retrieval-eval eval/cases/concept_layer_mvp.jsonl \
  --wiki-root wiki \
  --out-dir eval/runs/concept-layer-mvp \
  --rubric eval/rubrics/concept_layer_quality.md \
  --top-k 8 \
  --overwrite
```

Result:

- Total cases: 5
- Deterministic pass: 5
- Deterministic fail: 0
- Average required recall@k: 1.0
- Average section hit rate: 1.0

Covered scenarios:

- PTQ ablation preliminary knowledge
- KV-cache compression implementation/debug
- RLHF/DPO/TTRL KL regularization comparison
- PINN/PDE residual implementation checks
- K-means objective and clustering probe design

## Important Fix During Convergence

The first concept proposal incorrectly allowed retrieval/navigation text and inherited method/topic backlinks to affect concept extraction. That caused unrelated concepts such as activation outliers to attach to KV-cache pages.

The extraction mechanism now uses concept-relevant source sections only and avoids using generated retrieval hooks, prerequisite sections, or broad inherited frontmatter as concept evidence. Concept publish also synchronizes generated prerequisite sections so stale generated links can be removed.

## Residuals

- Coverage is intentionally seeded and conservative. It proves the product path, not full automatic concept discovery.
- Only 11 / 302 method pages currently expose prerequisite concepts. This is acceptable for MVP because low-risk concept coverage is limited to recurring concepts with strong source signal.
- Future improvement should add more domain-diverse concept seeds and LLM-assisted concept candidate review, but still keep proposal-first publish and source provenance gates.
