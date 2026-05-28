---
name: wiki-concept
description: Use when adding, auditing, publishing, retrieving, or evaluating Meridian preliminary-knowledge concept pages for research coding, debugging, ablation, probe, or prerequisite-background tasks.
---

# Wiki Concept

Use this skill when the task is about preliminary knowledge that sits between papers and methods: concepts that a researcher needs before coding, probing, debugging, or designing ablations.

For product-facing usage, start from the `wiki` skill. Concept maintenance belongs to `Update Wiki`; concept retrieval for coding/debug/probe belongs to `Use Wiki`.

Concept pages live under `wiki/concepts/` and are canonical compiled knowledge. They are not paper summaries, method-family pages, or generic textbook dumps.

## Commands

```bash
meridian wiki concept-audit --wiki-root <wiki-root>
meridian wiki propose-concept-layer --wiki-root <wiki-root> --out-dir <wiki-root>/.drafts/knowledge-repair/<slug>/
meridian wiki concept-layer-lint <wiki-root>/.drafts/knowledge-repair/<slug>/concept-layer-proposal.json --wiki-root <wiki-root>
meridian wiki publish-concept-layer <wiki-root>/.drafts/knowledge-repair/<slug>/concept-layer-proposal.json --wiki-root <wiki-root>
```

## Health-Driven Concept Coverage

When health reports `concept_coverage`, optimize for coding/debug/probe
usefulness rather than concept count:

1. Read the health report and concept audit to identify high-value methods
   missing prerequisite concepts.
2. Prefer methods that appear in method/probe/debug retrieval contexts.
3. Generate a concept-layer proposal and lint it.
4. Publish only low-risk concept pages and backlinks with source provenance.
5. Rerun health and report coverage delta.

Do not create generic concept stubs to improve the score. A concept is useful
only if it has source provenance, implementation implications, failure modes,
minimal checks/probes, and related methods.

Evaluate concept retrieval with:

```bash
meridian wiki retrieval-eval eval/cases/concept_layer_mvp.jsonl \
  --wiki-root <wiki-root> \
  --out-dir eval/runs/<run-id>/ \
  --rubric eval/rubrics/concept_layer_quality.md \
  --top-k 8 \
  --overwrite
```

## Quality Bar

Each concept page should include:

- source paper provenance
- related methods/topics
- `Implementation Implications`
- `Common Failure Modes`
- `Minimal Checks / Probes`
- `Evidence / Provenance`
- retrieval hooks

For method/probe/debug queries, retrieve concepts alongside methods and source papers. Do not use concept pages as paper source facts; they are compiled knowledge with provenance.
