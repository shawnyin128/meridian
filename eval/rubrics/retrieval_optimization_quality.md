---
title: "Retrieval Optimization Quality Rubric"
schema_version: "meridian.retrieval_optimization_rubric.v1"
---

# Retrieval Optimization Quality Rubric

Judge the retrieval context packet, not a final answer. The candidate strategy should improve the next research step by retrieving the right paper families, the right sections, the right evidence, and fewer misleading distractors.

## Hard Fails

- A source-quality hold is used as scientific evidence for a normal research query.
- A declared hard distractor is ranked as the primary result.
- A required paper family is missing when the query makes that family central.
- For comparison or survey cases with acceptable alternatives, a required family group is missing. Judge the group-level outcome, not one arbitrary paper path.
- The packet contains only generic title matches and no mechanism/evidence/limitation sections for an implementation or evidence query.

## Scored Criteria

| Criterion | Weight | What Good Looks Like |
| --- | ---: | --- |
| Intent interpretation | 1.2 | The packet recognizes whether the request is method lookup, comparison, implementation/probe, evidence check, limitation lookup, cross-domain analogy, survey, or source cleanup. |
| Page-family selection | 1.5 | Required families or required family groups are present, adjacent pages are useful, and hard distractors are demoted or absent. |
| Section targeting | 1.2 | Read-first sections contain the mechanism, evidence, implementation hooks, or limitations implied by the query. |
| Evidence usefulness | 1.1 | The packet surfaces metrics, datasets, system evidence, task families, or failure boundaries relevant to the request. |
| Source-quality routing | 1.0 | Source-quality pages are retrieved only for cleanup/source-quality requests and are clearly not treated as scientific evidence. |
| Context compactness | 0.8 | The packet is short enough to use directly and avoids repeated low-signal snippets. |
| Explainability | 0.8 | Selection reasons name matched fields, domains, graph/facet expansion, or source-quality guards rather than only lexical overlap. |
| Research actionability | 1.4 | A researcher could decide what to read, implement, compare, or avoid next from the packet alone. |

## Required Judge Output

```json
{
  "schema_version": "meridian.retrieval_optimization_judge_result.v1",
  "case_id": "",
  "decision": "candidate_better | candidate_same | candidate_worse | fail",
  "scores": {
    "intent_interpretation": 0,
    "page_family_selection": 0,
    "section_targeting": 0,
    "evidence_usefulness": 0,
    "source_quality_routing": 0,
    "context_compactness": 0,
    "explainability": 0,
    "research_actionability": 0
  },
  "baseline_failures": [],
  "candidate_failures": [],
  "improvement_notes": [],
  "residual_risks": [],
  "repair_buckets": []
}
```
