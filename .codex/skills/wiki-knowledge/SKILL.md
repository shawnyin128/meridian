---
name: wiki-knowledge
description: Use when auditing, repairing, publishing, retrieving, or evolving Meridian Paper Wiki method/topic/claim/evidence/synthesis knowledge-layer pages.
---

# Wiki Knowledge

Use this skill when the task is about the compiled knowledge layer above individual paper pages.

## Commands

Audit the knowledge layer:

```bash
meridian wiki knowledge-audit --wiki-root wiki
```

Create and review a repair proposal:

```bash
meridian wiki propose-knowledge-repair --wiki-root wiki --out wiki/.drafts/knowledge-repair/<slug>/
meridian wiki knowledge-repair-lint wiki/.drafts/knowledge-repair/<slug>/repair.json --wiki-root wiki
```

Publish only lint-passing low-risk repairs:

```bash
meridian wiki publish-knowledge-repair wiki/.drafts/knowledge-repair/<slug>/repair.json --wiki-root wiki
```

Final-product knowledge-layer checks add two proposal generators:

```bash
meridian wiki propose-method-consolidation --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/<slug>/
meridian wiki propose-contradiction-review --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/<slug>/
```

Use them to group paper-specific method records under compiled method-family pages and to surface unsupported/stale/source-quality candidates without declaring canonical contradictions.

## Boundaries

- Low-risk repairs may add frontmatter fields, create missing method/topic pages from paper metadata, and restructure method/topic pages with snippets from linked canonical paper sections.
- High-risk repairs stay proposal-only: merging pages, changing claim confidence, declaring contradictions, rewriting syntheses, or promoting user insight into source-grounded claims.
- Candidate claim/evidence pages can stay compact if they preserve source paper, confidence, review state, candidate id, and provenance.
- Paper-specific method records can remain as candidate records when they are linked to method-family pages or suppressed in normal retrieval; do not merge them automatically.
- Contradiction/stale detection is candidate generation unless a linted refinement publishes the state.
- Normal retrieval may return papers, syntheses, methods, topics, claims, and evidence, but `.drafts` and `.versions` remain internal.

## Retrieval Discipline

For method/probe/design queries, expect compiled method/topic pages plus key papers. For evidence/provenance queries, expect claim/evidence records plus source papers. Always check `result_type` and `knowledge_role` before treating a result as paper evidence.
