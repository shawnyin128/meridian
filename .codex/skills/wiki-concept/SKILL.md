---
name: wiki-concept
description: Use when adding, auditing, publishing, retrieving, or evaluating Meridian preliminary-knowledge concept pages for research coding, debugging, ablation, probe, or prerequisite-background tasks.
---

# Wiki Concept

Use this skill when the task is about preliminary knowledge that sits between papers and methods: concepts that a researcher needs before coding, probing, debugging, or designing ablations.

Concept pages live under `wiki/concepts/` and are canonical compiled knowledge. They are not paper summaries, method-family pages, or generic textbook dumps.

## Commands

```bash
meridian wiki concept-audit --wiki-root wiki
meridian wiki propose-concept-layer --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/<slug>/
meridian wiki concept-layer-lint wiki/.drafts/knowledge-repair/<slug>/concept-layer-proposal.json --wiki-root wiki
meridian wiki publish-concept-layer wiki/.drafts/knowledge-repair/<slug>/concept-layer-proposal.json --wiki-root wiki
```

Evaluate concept retrieval with:

```bash
meridian wiki retrieval-eval eval/cases/concept_layer_mvp.jsonl \
  --wiki-root wiki \
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
