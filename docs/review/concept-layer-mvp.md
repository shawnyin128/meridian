# Concept Layer MVP Review

## Feature

Preliminary knowledge concept layer MVP.

## Context/Test Plan

Goal: make preliminary knowledge a first-class canonical layer so research coding, debugging, ablation, and probe queries retrieve prerequisite concepts alongside methods, papers, and evidence.

Review checks:

- Concept schema and directory exist.
- Concept audit/proposal/lint/publish commands work.
- Concept pages are source-provenanced and not generic stubs.
- Method/topic pages can expose concept prerequisites.
- Retrieval includes `result_type: concept`.
- Concept eval covers multiple domains and coding/debug/probe scenarios.

## Developer Round

Implemented:

- `src/meridian/wiki/concepts.py`
- CLI commands:
  - `concept-audit`
  - `propose-concept-layer`
  - `concept-layer-lint`
  - `publish-concept-layer`
- `wiki/concepts/` vault initialization and template.
- Catalog/retrieval support for concepts.
- Concept eval cases/rubric.
- Main wiki concept publish: 9 concept pages, 86 initial backlinks.

During smoke retrieval, a failure was found: concept extraction used retrieval/navigation text and generated backlinks, causing KV-cache queries to mix in quantization concepts.

Mechanism fix:

- Concept extraction now uses concept-relevant source sections only.
- Generated retrieval hooks, prerequisite concept sections, and broad inherited frontmatter are not concept evidence.
- Concept publish synchronizes generated prerequisite sections so stale generated links can be removed.

Final main wiki state after repair:

- Concept pages: 9
- Unpromoted concept candidates: 0
- Missing source papers: 0
- Missing implementation implications: 0
- Missing minimal checks/probes: 0
- Source-quality contamination: 0

## Evaluator Round

Regression tests added:

- concept proposal/lint/publish/retrieval end-to-end
- lint rejection for unprovenanced/generic concept proposal

Main wiki evaluation:

```bash
meridian wiki retrieval-eval eval/cases/concept_layer_mvp.jsonl \
  --wiki-root wiki \
  --out-dir eval/runs/concept-layer-mvp \
  --rubric eval/rubrics/concept_layer_quality.md \
  --top-k 8 \
  --overwrite
```

Results:

- total cases: 5
- deterministic passes: 5
- average required recall@k: 1.0
- average section hit rate: 1.0

## Convergence Round

Converged for MVP.

Remaining limitations are documented in `docs/concept-layer-optimization-brief.md`: concept discovery is conservative and seed-driven; broader domain coverage should come through future proposal-first expansions rather than automatic high-risk synthesis.

## Release Round

Release gates run or scheduled before commit:

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass after EOF cleanup.
- `meridian wiki lint --wiki-root wiki`: pass with one info-only paper wikilink finding.
- `meridian wiki source-audit --wiki-root wiki`: pass, 238 sources, 0 missing, 0 SHA mismatch, 0 duplicate SHA groups.
- `meridian wiki catalog --wiki-root wiki`: pass.
- `meridian wiki knowledge-audit --wiki-root wiki`: warn with documented residual knowledge-layer gaps.
- `meridian wiki concept-audit --wiki-root wiki`: warn with documented residual method/topic concept coverage gaps.
- `meridian wiki retrieval-eval eval/cases/concept_layer_mvp.jsonl --wiki-root wiki --out-dir eval/runs/concept-layer-mvp --rubric eval/rubrics/concept_layer_quality.md --top-k 8 --overwrite`: pass, 5/5 deterministic cases.
- Arbor process-state and AGENTS drift hooks: run before final commit.
