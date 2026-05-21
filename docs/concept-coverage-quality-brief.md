# Concept Coverage Quality Brief

- Date: `2026-05-21`
- Wiki root: `wiki/`
- Status: `pass with conservative residuals`

## Result

The preliminary knowledge layer grew from 9 concepts to 24 concepts.

Concept-audit metrics after the pass:

- concept pages: 24
- candidate concepts: 24
- unpromoted candidate concepts: 0
- methods with prerequisite concepts: 31 / 302
- topics with key concepts: 45 / 91
- concepts missing source papers: 0
- concepts missing related methods: 0
- low-information concept stubs: 0
- source-quality contamination: 0

## New Coverage

The pass added cross-domain preliminary knowledge for:

- calibration representativeness
- lookup-table inference
- rotation transform invariance
- cache retention policy
- IO-aware attention scheduling
- verification cost model
- dynamic draft tree
- preference data underspecification
- reward model overoptimization
- boundary conditions
- collocation points
- centroid assignment stability
- representation collapse
- diffusion conditioning signal
- agent tool-state grounding

Each published concept page includes:

- `What It Is`
- `Why It Matters`
- `Implementation Implications`
- `Common Failure Modes`
- `Minimal Checks / Probes`
- `Evidence / Provenance`

## Evidence

Commands used:

```bash
PYTHONPATH=src python3 -m meridian wiki propose-concept-layer --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/product-maturity-concepts-r2 --max-concepts 24 --overwrite
PYTHONPATH=src python3 -m meridian wiki concept-layer-lint wiki/.drafts/knowledge-repair/product-maturity-concepts-r2/concept-layer-proposal.json --wiki-root wiki
PYTHONPATH=src python3 -m meridian wiki publish-concept-layer wiki/.drafts/knowledge-repair/product-maturity-concepts-r2/concept-layer-proposal.json --wiki-root wiki
PYTHONPATH=src python3 -m meridian wiki concept-audit --wiki-root wiki --out wiki/.index/concept-audit.json --brief docs/concept-layer-quality-audit.md
```

Publish result:

- created or refreshed concepts: 24
- method/topic backlinks added: 62
- skipped actions: 0
- lint status: pass

## Product Interpretation

The concept layer is now useful for coding/debug/probe retrieval. It can return prerequisite concepts with implementation checks before the agent reads paper-specific method pages.

## Residuals

- Prerequisite concept coverage is intentionally conservative: 31 / 302 method pages have explicit concept links.
- Many paper-specific method candidate pages remain low-value retrieval targets unless the query is exact.
- Future growth should be usage-driven: add concepts when retrieval or coding work exposes missing prerequisites.
