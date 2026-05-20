# Final LLM Wiki Product Quality Brief

- Generated: `2026-05-20T23:55:40.805349+00:00`
- Status: `warn`

## Canonical Corpus

- papers: 236
- methods: 302
- topics: 91
- claims: 1135
- evidence: 2737
- syntheses: 6

## Quality-State Coverage

- Papers with final quality-state fields: 236 / 236
- Missing navigation pages: 0
- Retrieval result types for synthesis overview smoke: method, method-family, topic, claim, evidence, paper, synthesis, method-family
- Knowledge audit status: `warn`

## Residual Findings

- No final-product hard blockers found by deterministic checks.
- Final product retrieval eval: `eval/runs/final-llm-wiki-product-r1/summary.json`
  - v0 deterministic pass: 1 / 5
  - v1 deterministic pass: 5 / 5
  - required_recall_at_k: 0.467 -> 1.000
  - MRR: 0.265 -> 0.521
  - context_compactness: 0.210 -> 0.384
  - source_quality_failure_rate: 0.000
  - v1 result mix includes method, topic, synthesis, claim, evidence, and paper pages.

## Interpretation

The deterministic check verifies the product shell: canonical pages, synthesis growth, retrieval visibility, quality-state semantics, navigation, and source-quality safety. It does not replace source-aware review of individual scientific claims.
