---
type: rubric
title: "Wiki Retrieval Quality Rubric v0"
status: draft
created: 2026-05-20
updated: 2026-05-20
tags:
  - paper-wiki
  - retrieval
  - llm-as-judge
schema_version: "meridian.wiki_retrieval_rubric.v0"
---

# Wiki Retrieval Quality Rubric v0

## Judge Target

Judge the retrieval context packet, not the final synthesis answer. The question is whether the packet gives a future agent the right papers, sections, provenance, and caveats to answer a realistic research request.

## Inputs

The judge packet should include:

- case JSON snapshot;
- query, intent, required pages, acceptable pages, distractors, and required sections;
- retrieved `context.md` and `context.json`;
- selected top-k page snippets or linked canonical pages;
- source-audit or lint summary when the case involves source quality;
- notes about unavailable fixtures or intentionally underspecified paths.

## Scoring

Score each dimension from 1 to 5. Use half-points only when the evidence is genuinely between anchors.

| Dimension | Weight | 1 | 3 | 5 |
| --- | ---: | --- | --- | --- |
| Intent interpretation | 1.5 | Treats the query as keyword search only | Captures broad intent but misses setting or action | Identifies task type, target setting, and downstream research action |
| Page selection | 2.0 | Misses required pages or ranks distractors first | Includes some relevant pages but with weak ordering | Top results contain required pages or valid families and demote distractors |
| Section selection | 1.5 | No useful read-first sections | Some relevant sections but misses the user's action | Surfaces the exact mechanism, evidence, implementation, or limitation sections needed |
| Retrieval explainability | 1.0 | Reasons are title overlap or generic | Some frontmatter/section evidence | Reasons name meaningful matched fields and why they matter |
| Taxonomy boundary | 1.0 | Collapses methods/topics/settings or repeats title terms | Mostly distinct with some leakage | Cleanly distinguishes methods, topics, settings, aliases, evidence, and source quality |
| Evidence alignment | 1.5 | Uses weak evidence for strong claims | Evidence is partially aligned | Routes to metrics, baselines, systems evidence, or provenance required by the task |
| Source-quality routing | 1.0 | Treats bad sources as reliable evidence | Flags uncertainty but still mixes roles | Separates cleanup targets from scientific evidence |
| Context compactness | 0.75 | Too large or too sparse to inspect | Usable with some noise | Small, ranked, and directly actionable |
| Research actionability | 1.75 | Does not help decide what to read or do next | Helpful but requires major manual filtering | Clearly supports implementation, ablation, comparison, synthesis, or cleanup decisions |

## Hard Fails

Return `fail` regardless of weighted score if any hard fail is present:

- source-quality hold or low-confidence extraction is presented as reliable scientific evidence;
- required page family is absent from top-k for a query whose expected pages are declared and available;
- a declared distractor dominates the top result without a strong rationale;
- context JSON or Markdown is invalid enough to block downstream use;
- source facts, wiki synthesis, and user ideas are collapsed in a way that would mislead a research decision;
- the packet hides `review_state`, `quality_gate`, or provenance signals for an evidence-heavy query.

## Decision Policy

Compute the weighted average after hard-fail checks:

- `pass`: weighted score >= 4.25 and no hard fail;
- `needs_refine`: weighted score >= 3.25 and < 4.25, or one important but local miss;
- `fail`: weighted score < 3.25 or any hard fail.

For release gates, use stricter aggregate thresholds from `docs/wiki-layer-test-strategy.md`.

## Judge Output Schema

```json
{
  "schema_version": "meridian.wiki_retrieval_judge_result.v0",
  "case_id": "...",
  "decision": "pass | needs_refine | fail",
  "weighted_score": 0.0,
  "dimension_scores": {
    "intent_interpretation": 0,
    "page_selection": 0,
    "section_selection": 0,
    "retrieval_explainability": 0,
    "taxonomy_boundary": 0,
    "evidence_alignment": 0,
    "source_quality_routing": 0,
    "context_compactness": 0,
    "research_actionability": 0
  },
  "hard_fails": [],
  "required_page_hits": [],
  "missing_required_pages": [],
  "distractor_hits": [],
  "required_section_hits": [],
  "missing_required_sections": [],
  "findings": [
    {
      "severity": "critical | major | minor",
      "dimension": "page_selection",
      "artifact": "context.md | context.json | page:<relative-path>",
      "problem": "...",
      "evidence": "...",
      "suggested_fix": "..."
    }
  ],
  "recommended_refine_bucket": "query_parser | scorer | frontmatter | ingest_skill | controlled_vocabulary | source_management | packet_format | rubric | other",
  "calibration_notes": "..."
}
```

## Calibration Notes

The judge should be penalized for rewarding fluent final answers when the retrieved packet is weak. It should also be penalized for expecting a single unique path when the case intentionally allows multiple paper families.
