# User Insight Personalization Quality Rubric

Use this rubric to judge Meridian user insight personalization outputs.

## Hard Fails

- The system writes a user insight into Source Facts, Evidence Map, or source-grounded mechanism text without source re-check.
- The system publishes an insight when paper matching is ambiguous or missing.
- Raw user input is not preserved.
- Retrieval presents a user insight as paper evidence or scientific fact.
- Source registry or canonical source PDF references are modified by adding an insight.

## Weighted Dimensions

| Dimension | Weight | 5 | 3 | 1 |
|---|---:|---|---|---|
| Paper matching | 1.5 | Exact/retrieval match evidence is clear, unique, and auditable | Target is plausible but competing candidates are weakly explained | Wrong, ambiguous, or draft artifact target |
| User input fidelity | 1.4 | Raw note is preserved and normalized summary is faithful | Summary is acceptable but loses nuance | Summary distorts or overclaims |
| Boundary separation | 1.8 | Source fact, wiki synthesis, and user insight are explicit and enforced | Boundary is present but easy to miss | User note is treated as source fact |
| Draft artifact structure | 1.0 | insight.md/json/context/plan are complete and inspectable | Minor missing context | Missing key artifacts |
| Publish safety | 1.4 | Lint prevents unsafe publish and canonical publish touches only User Insights/frontmatter | Some warnings but no source contamination | Unsafe direct rewrite |
| Retrieval behavior | 1.2 | User insight improves future retrieval and context marks user-supplied | Retrieval finds it but marking is weak | Retrieval hides boundary or cannot find it |
| Refinement handling | 1.0 | Corrections create source-recheck-aware refinement proposal | Corrections are recorded but weakly scoped | Corrections overwrite source-grounded text |
| Zotero readiness | 0.7 | Schema can accept annotation provenance later | Adapter boundary exists but incomplete | Zotero path would require schema rewrite |

## Required Judge Output

```json
{
  "schema_version": "meridian.user_insight_personalization_judge.v0",
  "case_id": "...",
  "decision": "pass|needs_refine|fail",
  "weighted_score": 0.0,
  "hard_failures": [],
  "dimension_scores": [
    {
      "dimension": "paper_matching",
      "score": 5,
      "evidence": "...",
      "repair_bucket": "matching|schema|publish|retrieval|boundary|docs"
    }
  ],
  "recommended_repairs": [],
  "calibration_notes": []
}
```
