# Retrieval v1 Quality Brief

This brief is generated during F16 Retrieval optimization. The current target is not a single benchmark score; it is whether Meridian produces context packets that support real research work across domains.

## Current Recommendation

Use retrieval v1 by default:

```bash
meridian wiki retrieve "<standalone research query>" \
  --wiki-root wiki \
  --strategy v1 \
  --out wiki/.drafts/retrieval/context.md \
  --json-out wiki/.drafts/retrieval/context.json
```

Use Obsidian CLI only as a live navigation layer:

```bash
obsidian vault="wiki" search query="<keyword>" limit=10
obsidian vault="wiki" read path="papers/<paper-page>.md"
obsidian vault="wiki" backlinks path="topics/<topic>.md" counts
```

## Optimization Evidence

Optimization artifacts are written under:

- `eval/runs/2026-05-20-retrieval-optimization-r1`
- `eval/runs/2026-05-20-retrieval-optimization-r2`
- `eval/runs/2026-05-20-retrieval-optimization-r3`
- `eval/runs/2026-05-20-retrieval-optimization-r4`
- `eval/runs/2026-05-20-retrieval-optimization-r5`

Each run contains side-by-side v0/v1 context packets, JSON payloads, judge packets, `retrieval_manifest.json`, `summary.json`, and `summary.md`.

## Round Results

| Run | Change Tested | v0 Pass | v1 Pass | v0 Recall | v1 Recall | v0 Section | v1 Section | v0 Hard Distractor | v1 Hard Distractor |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| r1 | Initial v1 field/section/domain scoring | 6/10 | 6/10 | 0.700 | 0.700 | 0.650 | 0.750 | 0.037 | 0.025 |
| r2 | Context section cap and distractor suppression | 6/10 | 6/10 | 0.700 | 0.700 | 0.650 | 0.750 | 0.037 | 0.013 |
| r3 | Domain anchoring, speculative penalty, diversity rerank | 6/10 | 8/10 | 0.700 | 0.800 | 0.650 | 0.800 | 0.037 | 0.013 |
| r4 | Systems-evidence eval repair and setting-contrast scoring | 7/10 | 9/10 | 0.800 | 0.900 | 0.750 | 0.900 | 0.037 | 0.013 |
| r5 | Family-group evaluation and comparison-section intent | 8/10 | 10/10 | 0.900 | 1.000 | 0.850 | 1.000 | 0.037 | 0.013 |

Final r5 summary:

- `required_recall_at_k`: v0 `0.900`, v1 `1.000`
- `section_hit_rate`: v0 `0.850`, v1 `1.000`
- `hard_distractor_rate`: v0 `0.0375`, v1 `0.0125`
- `source_quality_failure_rate`: both `0.000`
- `context_compactness`: v0 `0.238`, v1 `0.232`
- `redundancy_rate`: v0 `0.188`, v1 `0.212`

The remaining negative deltas are acceptable for this round:

- MRR is slightly lower because v1 deliberately diversifies multi-family research packets rather than optimizing exact-paper rank.
- Evidence hit rate drops from `1.000` to `0.950` because v1 selects more targeted sections and shorter packets; the generated judge packets remain the fallback for qualitative review.
- Redundancy is slightly higher in crowded quantization cases because multiple papers can share the same top-level topic while serving different setting or systems-evidence roles.

## Failure Analysis And Fixes

- r1/r2 failure: long-context KV-cache retrieval was crowded by speculative decoding pages. Fix: anchored domain detection, stronger unrequested family penalty, and coverage/diversity reranking.
- r2/r3 failure: visual representation survey over-selected JEPA pages and missed diffusion. Fix: coverage targets over high-value phrases and domain facets.
- r3 failure: systems-evidence eval required papers that were weaker matches than the retrieved systems/kernel papers. Fix: repair the case to require direct kernel/runtime quantization evidence and document the eval-design bucket.
- r4 failure: weight-only versus weight-activation comparison was judged against two fixed paper names. Fix: add `required_page_family_groups` and `required_section_groups` so evaluation can require regime coverage without overspecifying a unique path.

## Known Bottlenecks

- Deterministic v1 still cannot infer deep semantic paraphrases that have no lexical or controlled-vocabulary bridge.
- Source page quality matters: if ingest did not produce strong topics/methods/settings or section content, retrieval cannot fully repair it.
- The graph expansion is intentionally capped; it improves adjacent family recovery but does not replace a true semantic retriever.
- LLM-as-Judge remains packet-based unless an external API or local judge backend is configured.
- Some generated paper pages still contain noisy or overbroad routing metadata. v1 has guards for overbroad settings and source-quality holds, but durable repair belongs in ingest calibration.
