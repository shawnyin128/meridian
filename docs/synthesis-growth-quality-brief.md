# Synthesis Growth Quality Brief

- Date: `2026-05-21`
- Wiki root: `wiki/`
- Status: `pass with documented residuals`

## Result

The canonical synthesis layer grew from 6 pages to 30 pages during the product maturity pass.

Published synthesis coverage now includes:

- method-family comparisons
- topic overviews
- evidence-map scaffolds
- limitation / failure-boundary summaries
- implementation / probe planning pages
- research-question pages

Key product-maturity additions:

- `wiki/syntheses/Activation-Outlier-Quantization-Evidence-Map.md`
- `wiki/syntheses/KV-Cache-Compression-Failure-Boundary-Summary.md`
- `wiki/syntheses/Speculative-Decoding-Probe-Planning-Page.md`
- `wiki/syntheses/Preference-Optimization-Evidence-And-Drift-Question.md`
- `wiki/syntheses/PDE-Residual-Scientific-ML-Implementation-Checks.md`
- `wiki/syntheses/Clustering-Objective-Representation-Probe-Plan.md`
- `wiki/syntheses/Agent-Workflow-Tool-State-Grounding-Overview.md`
- `wiki/syntheses/Diffusion-Conditioning-Representation-Synthesis.md`

## Evidence

Commands used:

```bash
PYTHONPATH=src python3 -m meridian wiki propose-synthesis-batch --wiki-root wiki --out-dir wiki/.drafts/proposals/product-maturity-synthesis-r1 --max-items 12 --overwrite
PYTHONPATH=src python3 -m meridian wiki publish-synthesis-batch wiki/.drafts/proposals/product-maturity-synthesis-r1/batch.json --wiki-root wiki
PYTHONPATH=src python3 -m meridian wiki propose-synthesis-batch --wiki-root wiki --out-dir wiki/.drafts/proposals/product-maturity-synthesis-r2 --max-items 24 --overwrite
PYTHONPATH=src python3 -m meridian wiki publish-synthesis-batch wiki/.drafts/proposals/product-maturity-synthesis-r2/batch.json --wiki-root wiki
PYTHONPATH=src python3 -m meridian wiki propose-synthesis-batch --wiki-root wiki --out-dir wiki/.drafts/proposals/product-maturity-synthesis-r3 --max-items 10 --overwrite
PYTHONPATH=src python3 -m meridian wiki publish-synthesis-batch wiki/.drafts/proposals/product-maturity-synthesis-r3/batch.json --wiki-root wiki
```

Batch results:

- r1: 6 published, 6 skipped, 0 failed
- r2: 12 published, 12 skipped, 0 failed
- r3: 8 published, 2 skipped, 0 failed; 2 low-value generic method-family pages were removed before release catalog rebuild

## Quality Boundary

These pages are low-confidence synthesis scaffolds, not final theses. They preserve the required sections:

- `Source Facts`
- `Wiki Synthesis`
- `User Ideas / Decisions`
- `Evidence Map`
- `Open Questions`
- `Retrieval Hooks`

The useful product shift is that retrieval can now return compiled pages for common research intents before falling back to individual papers.

## Residuals

- Some syntheses are still scaffold-level and need later evolution passes to become dense thesis pages.
- The generated pages are source-grounded through retrieval context, but high-impact claims should still be traced before use in a paper or experiment plan.
- The next useful loop is sampled evolution of the highest-used synthesis pages, not another blind growth pass.
