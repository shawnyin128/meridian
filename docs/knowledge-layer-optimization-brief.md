# Knowledge Layer Optimization Brief

## Summary

The main wiki has moved from a paper-centered library toward a compiled knowledge layer. The current implementation audits method/topic/claim/evidence/synthesis health, proposes low-risk repairs, lint-gates publish, snapshots updated canonical knowledge pages, and extends retrieval to knowledge-layer catalogs.

## Before / After

Before safe repair publish:

- Low-information knowledge pages: 400
- Pages with required section gaps: 400
- Pages with frontmatter gaps: 400
- Source-quality misuse: 0

After safe repair publish:

- Low-information knowledge pages: 239
- Pages with required section gaps: 239
- Pages with frontmatter gaps: 0
- Source-quality misuse: 0

The remaining 239 warnings are paper-specific method candidate records. They are intentionally left as proposal-only because turning them into method-family synthesis requires source-aware consolidation, not deterministic formatting.

## What Improved

- Aggregate method/topic pages now have structured sections instead of only paper lists.
- Existing method/topic pages received revision snapshots under `.versions/` before mutation.
- `meridian wiki catalog` now writes paper, synthesis, method, topic, claim, and evidence catalogs.
- `meridian wiki retrieve --strategy v1` can return methods, topics, claims, and evidence with `result_type` and `knowledge_role`.
- Method/probe queries are routed toward compiled method pages; evidence/provenance queries preselect claim/evidence records alongside source papers.

## Remaining Limits

- No automatic contradiction declaration is allowed yet. The repair proposal can surface candidates, but contradiction publish should remain refinement/judge-driven.
- Paper-specific method candidate pages are still compact records, not full method-family pages.
- There are no canonical synthesis pages in the main wiki yet, so synthesis-to-paper traceability remains available in schema/tests but not exercised by a large real synthesis layer.

## Commands

```bash
meridian wiki knowledge-audit --wiki-root wiki
meridian wiki propose-knowledge-repair --wiki-root wiki --out wiki/.drafts/knowledge-repair/<slug>/
meridian wiki knowledge-repair-lint wiki/.drafts/knowledge-repair/<slug>/repair.json --wiki-root wiki
meridian wiki publish-knowledge-repair wiki/.drafts/knowledge-repair/<slug>/repair.json --wiki-root wiki
meridian wiki retrieve "<research intent>" --wiki-root wiki --strategy v1
```
