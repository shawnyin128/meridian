# High-Leverage Synthesis / Evolution Brief

Created: 2026-05-21

## Goal

This pass tested whether synthesis pages can become durable cross-paper knowledge rather than thin retrieval scaffolds. The optimization focused on real research and coding intents, then used retrieval failures to improve the synthesis body contract and context packing.

## What Changed

- Regenerated 8 high-value canonical syntheses with a denser synthesis body.
- Added explicit synthesis contracts to published synthesis pages:
  - `Working synthesis target`
  - `Source-fact boundary`
  - `Review contract`
  - `Retrieval contract`
- Kept synthesis writes canonical and auditable through the existing synthesis batch proposal and publish path.

## Published Synthesis Pages

The pass refreshed these synthesis pages in `wiki/syntheses/`:

- `Calibration-Aware-Ptq-Method-Family-Synthesis.md`
- `Clustering-Algorithm-Method-Family-Synthesis.md`
- `Hardware-Aware-Quantization-Method-Family-Synthesis.md`
- `Kv-Cache-Compression-Method-Family-Synthesis.md`
- `Long-Context-Inference-Method-Family-Synthesis.md`
- `Post-Training-Quantization-Method-Family-Synthesis.md`
- `Speculative-Decoding-Method-Family-Synthesis.md`
- `Transformer-Architecture-Method-Family-Synthesis.md`

## Quality Effect

Before this pass, these pages existed but were closer to safe scaffold pages. After the pass, the refreshed pages explicitly tell future agents what synthesis job the page is meant to serve, what cannot be treated as source fact, and how the page should be used in retrieval.

This matters because retrieval should increasingly return compiled context first, then supporting papers and evidence, rather than making every future query re-synthesize the same method-family boundaries from paper summaries.

## Residuals

- The refreshed syntheses are still source-grounded synthesis targets, not final human-polished survey articles.
- High-risk claims, contradictions, and confidence changes remain proposal-first.
- More user-driven syntheses should be added from actual research sessions instead of only system-generated clusters.

