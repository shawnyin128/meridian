# Wiki Evolution Quality Rubric

Use this rubric to judge Meridian refinement proposals, lint reports, and publish results.

## Hard Fails

- Canonical page is modified without a pre-publish snapshot.
- A `.drafts/*` or `.versions/*` target is accepted as a canonical refinement target.
- A source fact correction publishes without source re-check requirement.
- User insight is presented as paper source fact.
- A stale proposal publishes after the target page changed.
- Normal retrieval returns `.versions/*` as a current result.
- Source-quality hold is promoted as scientific evidence.

## Weighted Score

Score each dimension from 1 to 5.

| Dimension | Weight | 5 means |
| --- | ---: | --- |
| Target correctness | 1.2 | The intended canonical page is matched, ambiguous/no-match cases are blocked, and target evidence is visible. |
| Proposal usefulness | 1.1 | `refinement.md`, `diff.md`, and `publish_plan.md` explain what should change and why without pretending final synthesis is done. |
| Boundary preservation | 1.5 | Source facts, wiki synthesis, user insight, decisions, and uncertainty stay distinct. |
| Lint rigor | 1.3 | Lint catches stale targets, missing provenance, source re-check violations, and source-quality misuse. |
| Revision auditability | 1.4 | Snapshot path, revision fields, log entry, and catalog/index updates make the change inspectable and recoverable. |
| Retrieval behavior | 1.0 | Latest canonical revision is retrieved, `.versions/` is excluded, and evolution warnings are visible. |
| Obsidian readability | 0.6 | Canonical page remains readable as Markdown and the Evolution Notes section is clear. |

## Repair Buckets

- `target_matching`
- `schema`
- `boundary`
- `lint`
- `snapshot`
- `publish`
- `retrieval`
- `docs_or_skill`

## Judge Output

```json
{
  "decision": "pass | fail | needs_refine",
  "weighted_score": 0.0,
  "hard_fails": [],
  "dimension_scores": {
    "target_correctness": 0,
    "proposal_usefulness": 0,
    "boundary_preservation": 0,
    "lint_rigor": 0,
    "revision_auditability": 0,
    "retrieval_behavior": 0,
    "obsidian_readability": 0
  },
  "repair_buckets": [],
  "evidence": [],
  "recommended_repairs": []
}
```
