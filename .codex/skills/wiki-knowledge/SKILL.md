---
name: wiki-knowledge
description: Use when auditing, repairing, publishing, retrieving, or evolving Meridian Paper Wiki method/topic/concept/claim/evidence/synthesis knowledge-layer pages.
---

# Wiki Knowledge

Use this skill when the task is about the compiled knowledge layer above individual paper pages.

For product-facing usage, start from the `wiki` skill and choose `Update Wiki` when repairing or promoting knowledge, or `Use Wiki` when consuming compiled knowledge. This skill is the knowledge-layer support module.

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

Concept-layer checks add preliminary-knowledge pages for coding/debug/probe prerequisites:

```bash
meridian wiki concept-audit --wiki-root wiki
meridian wiki propose-concept-layer --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/<slug>/
meridian wiki concept-layer-lint wiki/.drafts/knowledge-repair/<slug>/concept-layer-proposal.json --wiki-root wiki
meridian wiki publish-concept-layer wiki/.drafts/knowledge-repair/<slug>/concept-layer-proposal.json --wiki-root wiki
```

## Health-Driven Repair Routing

When `meridian wiki health` reports knowledge-layer buckets, convert the bucket
into a proposal-first repair path instead of editing pages directly:

| Health bucket | First action | Publish rule |
|---|---|---|
| `knowledge_graph` duplicate method/topic aliases | `propose-method-consolidation` | Publish only low-risk backlinks, aliases, and role metadata after lint. |
| `canonical_linking` isolated papers | `propose-knowledge-repair` | Publish low-risk topic/method/concept backlinks after lint. |
| `claim_evidence_traceability` evidence gaps | `propose-knowledge-repair` or refinement proposal | Attach source-grounded evidence or mark `needs_evidence`; do not invent support. |
| stale, contradiction, or source-quality findings | `propose-contradiction-review` | Proposal-only unless review/lint validates the state. |

After any safe publish, rerun `meridian wiki health --wiki-root wiki` and report
the bucket delta. If a repair requires merging pages, changing confidence,
rewriting synthesis, or promoting user insight into evidence, leave it as a
review proposal.

## Boundaries

- Low-risk repairs may add frontmatter fields, create missing method/topic pages from paper metadata, and restructure method/topic pages with snippets from linked canonical paper sections.
- High-risk repairs stay proposal-only: merging pages, changing claim confidence, declaring contradictions, rewriting syntheses, or promoting user insight into source-grounded claims.
- Candidate claim/evidence pages can stay compact if they preserve source paper, confidence, review state, candidate id, and provenance.
- Concept pages must not be paper summaries, method-family pages, or generic textbook dumps. They are cross-paper preliminary knowledge with source provenance, implementation implications, failure modes, and minimal checks/probes.
- Paper-specific method records can remain as candidate records when they are linked to method-family pages or suppressed in normal retrieval; do not merge them automatically.
- Contradiction/stale detection is candidate generation unless a linted refinement publishes the state.
- Normal retrieval may return papers, syntheses, methods, topics, concepts, claims, and evidence, but `.drafts` and `.versions` remain internal.

## Retrieval Discipline

For method/probe/design/debug queries, expect compiled method/topic pages plus prerequisite concept pages and key papers. For evidence/provenance queries, expect claim/evidence records plus source papers. Always check `result_type` and `knowledge_role` before treating a result as paper evidence.
