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

## Boundaries

- Low-risk repairs may add frontmatter fields, create missing method/topic pages from paper metadata, and restructure method/topic pages with snippets from linked canonical paper sections.
- High-risk repairs stay proposal-only: merging pages, changing claim confidence, declaring contradictions, rewriting syntheses, or promoting user insight into source-grounded claims.
- Candidate claim/evidence pages can stay compact if they preserve source paper, confidence, review state, candidate id, and provenance.
- Normal retrieval may return papers, syntheses, methods, topics, claims, and evidence, but `.drafts` and `.versions` remain internal.

## Retrieval Discipline

For method/probe/design queries, expect compiled method/topic pages plus key papers. For evidence/provenance queries, expect claim/evidence records plus source papers. Always check `result_type` and `knowledge_role` before treating a result as paper evidence.
