# Wiki Log

## [2026-05-20] init | Main Paper Wiki vault

- Vault root: `/Users/shawn/Desktop/meridian/wiki`
- Created Markdown-first Obsidian-compatible directories for raw sources, canonical papers, candidate records, topics, syntheses, templates, drafts, and indexes.
- Source registry: `raw/sources/sources.jsonl`
- Paper catalog: `.index/papers.jsonl`

## [2026-05-20] ingest | Full library rebuild into main wiki

- Input library: `/Users/shawn/Desktop/我的文库`
- Flow run: `eval/runs/2026-05-20-main-wiki-productization-flow`
- Canonical paper pages after duplicate cleanup: 235
- Managed sources: 237
- Review states: `auto_converged`=234, `source_quality_hold`=1
- Quality gates: `warn`=235
- Note: `quality_gate: warn` is retained because this full-library rebuild intentionally omitted page image extraction; deterministic text/structure convergence is tracked separately through `review_state` and `convergence_state`.

## [2026-05-20] promote | Cross-link graph and candidate records

- Topic pages: 91
- Method/candidate pages: 302
- Claim pages: 1135
- Evidence pages: 2737
- Evidence promotion is capped per paper to prevent long books or reports from flooding the Obsidian graph.
- Paper pages with wikilinks: 235/235.
- Duplicate canonical cleanup evidence: `.index/duplicate-cleanup.json`

## [2026-05-20] audit | Source, lint, and retrieval gates

- Source audit: 237 sources, 0 missing managed files, 0 SHA mismatches, 0 duplicate SHA groups.
- Wiki lint: pass with 0 findings after graph-link promotion and duplicate cleanup.
- Catalog entries: 235.
- Per-paper retrieval audit: 235 papers, 705 queries, recall@5=1.000, recall@1=0.926.
- Domain-general idea retrieval: 6/6 deterministic pass.
- Source-quality retrieval: 1/1 deterministic pass.
- Productization summary: `.index/main-wiki-productization-summary.json`

## [2026-05-20] query | Agent speculative execution write-back proposal

- Proposal: `wiki/.drafts/proposals/Agent-Speculative-Execution-Reading-Plan/proposal.md`
- Source context: `eval/runs/2026-05-20-main-wiki-idea-retrieval/idea-agent-speculative-execution/context.json`
- Policy: draft-only; canonical synthesis publish requires review.

## [2026-05-20] ingest | STS: Efficient Sparse Attention with Speculative Token Sparsity

- Source PDF: `wiki/raw/sources/papers/paper-pdf-00d120e46b19-STS-Efficient-Sparse-Attention-with-Speculative-Token-Sparsity.pdf`
- Canonical draft: [[papers/STS-Efficient-Sparse-Attention-with-Speculative-Token-Sparsity|STS: Efficient Sparse Attention with Speculative Token Sparsity]]
- Draft artifacts: `wiki/.drafts/ingests/2605-15508v2`
- Quality gate: `pass`
- Review state: `auto_ingested`

## [2026-05-20] insight | STS: Efficient Sparse Attention with Speculative Token Sparsity

- Published user insight `insight-2026-05-20-71538c7e52` to `User Insights`.
- Target page: `papers/STS-Efficient-Sparse-Attention-with-Speculative-Token-Sparsity.md`
- Boundary: user-supplied insight; not paper source fact.
- Updated index: `index.md`

## [2026-05-20] refine | STS: Efficient Sparse Attention with Speculative Token Sparsity

- Published refinement `refinement-2026-05-20-569ed606f5`.
- Target page: `papers/STS-Efficient-Sparse-Attention-with-Speculative-Token-Sparsity.md`
- Snapshot: `.versions/papers/STS-Efficient-Sparse-Attention-with-Speculative-Token-Sparsity/base-5f473a12ca.md`
- Change class: `retrieval_metadata_update`
- Updated index: `index.md`
- Updated catalog: `.index/papers.jsonl`

## [2026-05-20] knowledge-repair | knowledge-repair-2026-05-20-a41a95e036

- Applied low-risk knowledge repairs: 400
- Skipped repairs: 0
- High-risk proposal-only repairs: 239
- Repair manifest: `.drafts/knowledge-repair/main-knowledge-repair-r1/repair.json`

## [2026-05-20] migrate | Final LLM Wiki status semantics

- Updated paper quality-state fields on 236 pages.
- Preserved legacy `quality_gate` while adding retrieval-visible `quality_state`, `validation_state`, and `trust_state`.
- Status counts: `{"multimodal_pending": 234, "source_quality_hold": 1, "text_converged": 1}`

## [2026-05-20] publish | Transformer Architecture Method Family Synthesis

- Published write-back proposal: `wiki/syntheses/Transformer-Architecture-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Transformer-Architecture-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Post-Training Quantization Method Family Synthesis

- Published write-back proposal: `wiki/syntheses/Post-Training-Quantization-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Post-Training-Quantization-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Kv-Cache Compression Method Family Synthesis

- Published write-back proposal: `wiki/syntheses/Kv-Cache-Compression-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Kv-Cache-Compression-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Transformer Architecture Topic Overview

- Published write-back proposal: `wiki/syntheses/Transformer-Architecture-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Transformer-Architecture-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Low-Bit Quantization Topic Overview

- Published write-back proposal: `wiki/syntheses/Low-Bit-Quantization-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Low-Bit-Quantization-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Hardware-Aware Quantization Topic Overview

- Published write-back proposal: `wiki/syntheses/Hardware-Aware-Quantization-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Hardware-Aware-Quantization-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] navigation | Obsidian navigation pages

- Updated `Map of Content.md`
- Updated `Paper Index.md`
- Updated `Method Index.md`
- Updated `Topic Index.md`
- Updated `Synthesis Index.md`
- Updated `Claim Evidence Index.md`

## [2026-05-20] publish | Transformer Architecture Method Family Synthesis

- Published write-back proposal: `syntheses/Transformer-Architecture-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Transformer-Architecture-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Post-Training Quantization Method Family Synthesis

- Published write-back proposal: `syntheses/Post-Training-Quantization-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Post-Training-Quantization-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Kv-Cache Compression Method Family Synthesis

- Published write-back proposal: `syntheses/Kv-Cache-Compression-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Kv-Cache-Compression-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Transformer Architecture Topic Overview

- Published write-back proposal: `syntheses/Transformer-Architecture-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Transformer-Architecture-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Low-Bit Quantization Topic Overview

- Published write-back proposal: `syntheses/Low-Bit-Quantization-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Low-Bit-Quantization-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Hardware-Aware Quantization Topic Overview

- Published write-back proposal: `syntheses/Hardware-Aware-Quantization-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Hardware-Aware-Quantization-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Transformer Architecture Method Family Synthesis

- Published write-back proposal: `syntheses/Transformer-Architecture-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Transformer-Architecture-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Post-Training Quantization Method Family Synthesis

- Published write-back proposal: `syntheses/Post-Training-Quantization-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Post-Training-Quantization-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Kv-Cache Compression Method Family Synthesis

- Published write-back proposal: `syntheses/Kv-Cache-Compression-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Kv-Cache-Compression-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Transformer Architecture Topic Overview

- Published write-back proposal: `syntheses/Transformer-Architecture-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Transformer-Architecture-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Low-Bit Quantization Topic Overview

- Published write-back proposal: `syntheses/Low-Bit-Quantization-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Low-Bit-Quantization-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-20] publish | Hardware-Aware Quantization Topic Overview

- Published write-back proposal: `syntheses/Hardware-Aware-Quantization-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/final-synthesis-growth-r1/Hardware-Aware-Quantization-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] concept-layer | concept-layer-2026-05-21-6f642c4c03

- Created concept pages: 9
- Added method/topic concept backlinks: 86
- Skipped low-risk actions: 0
- Concept proposal: `.drafts/knowledge-repair/concept-layer-mvp/concept-layer-proposal.json`

## [2026-05-21] concept-layer | concept-layer-2026-05-21-5033d76f92

- Created concept pages: 9
- Added method/topic concept backlinks: 25
- Skipped low-risk actions: 18
- Concept proposal: `.drafts/knowledge-repair/concept-layer-mvp/concept-layer-proposal.json`

## [2026-05-21] concept-layer | concept-layer-2026-05-21-2d0f4ac12b

- Created concept pages: 9
- Added method/topic concept backlinks: 1
- Skipped low-risk actions: 38
- Concept proposal: `.drafts/knowledge-repair/concept-layer-mvp/concept-layer-proposal.json`

## [2026-05-21] concept-layer | concept-layer-2026-05-21-4d0cf2d57d

- Created concept pages: 9
- Added method/topic concept backlinks: 0
- Skipped low-risk actions: 9
- Concept proposal: `.drafts/knowledge-repair/concept-layer-mvp/concept-layer-proposal.json`

## [2026-05-21] navigation | Obsidian navigation pages

- Updated `Map of Content.md`
- Updated `Paper Index.md`
- Updated `Method Index.md`
- Updated `Topic Index.md`
- Updated `Concept Index.md`
- Updated `Synthesis Index.md`
- Updated `Claim Evidence Index.md`

## [2026-05-21] publish | Calibration-Aware Ptq Method Family Synthesis

- Published write-back proposal: `syntheses/Calibration-Aware-Ptq-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r1/Calibration-Aware-Ptq-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Hardware-Aware Quantization Method Family Synthesis

- Published write-back proposal: `syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r1/Hardware-Aware-Quantization-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Long-Context Inference Method Family Synthesis

- Published write-back proposal: `syntheses/Long-Context-Inference-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r1/Long-Context-Inference-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Performance Evaluation Topic Overview

- Published write-back proposal: `syntheses/Performance-Evaluation-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r1/Performance-Evaluation-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Benchmark Evaluation Topic Overview

- Published write-back proposal: `syntheses/Benchmark-Evaluation-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r1/Benchmark-Evaluation-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Calibration Data Selection Topic Overview

- Published write-back proposal: `syntheses/Calibration-Data-Selection-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r1/Calibration-Data-Selection-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Clustering Algorithm Method Family Synthesis

- Published write-back proposal: `syntheses/Clustering-Algorithm-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Clustering-Algorithm-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Speculative Decoding Method Family Synthesis

- Published write-back proposal: `syntheses/Speculative-Decoding-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Speculative-Decoding-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Survey Synthesis Method Family Synthesis

- Published write-back proposal: `syntheses/Survey-Synthesis-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Survey-Synthesis-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Outlier-Aware Quantization Method Family Synthesis

- Published write-back proposal: `syntheses/Outlier-Aware-Quantization-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Outlier-Aware-Quantization-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Rotation-Based Quantization Method Family Synthesis

- Published write-back proposal: `syntheses/Rotation-Based-Quantization-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Rotation-Based-Quantization-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Paper-Specific Research Method Method Family Synthesis

- Published write-back proposal: `syntheses/Paper-Specific-Research-Method-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Paper-Specific-Research-Method-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Parameter-Efficient Adaptation Topic Overview

- Published write-back proposal: `syntheses/Parameter-Efficient-Adaptation-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Parameter-Efficient-Adaptation-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Long-Context Inference Topic Overview

- Published write-back proposal: `syntheses/Long-Context-Inference-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Long-Context-Inference-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Context Extrapolation Topic Overview

- Published write-back proposal: `syntheses/Context-Extrapolation-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Context-Extrapolation-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Lookup-Table Inference Topic Overview

- Published write-back proposal: `syntheses/Lookup-Table-Inference-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Lookup-Table-Inference-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Kv-Cache Compression Topic Overview

- Published write-back proposal: `syntheses/Kv-Cache-Compression-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Kv-Cache-Compression-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Speculative Decoding Topic Overview

- Published write-back proposal: `syntheses/Speculative-Decoding-Topic-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r2/Speculative-Decoding-Topic-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] concept-layer | concept-layer-2026-05-21-efbfe77500

- Created concept pages: 24
- Added method/topic concept backlinks: 62
- Skipped low-risk actions: 0
- Concept proposal: `.drafts/knowledge-repair/product-maturity-concepts-r2/concept-layer-proposal.json`

## [2026-05-21] navigation | Obsidian navigation pages

- Updated `Map of Content.md`
- Updated `Paper Index.md`
- Updated `Method Index.md`
- Updated `Topic Index.md`
- Updated `Concept Index.md`
- Updated `Synthesis Index.md`
- Updated `Claim Evidence Index.md`

## [2026-05-21] publish | Activation Outlier Quantization Evidence Map

- Published write-back proposal: `syntheses/Activation-Outlier-Quantization-Evidence-Map.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r3/Activation-Outlier-Quantization-Evidence-Map/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | KV-Cache Compression Failure Boundary Summary

- Published write-back proposal: `syntheses/KV-Cache-Compression-Failure-Boundary-Summary.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r3/KV-Cache-Compression-Failure-Boundary-Summary/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Speculative Decoding Probe Planning Page

- Published write-back proposal: `syntheses/Speculative-Decoding-Probe-Planning-Page.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r3/Speculative-Decoding-Probe-Planning-Page/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Preference Optimization Evidence And Drift Question

- Published write-back proposal: `syntheses/Preference-Optimization-Evidence-And-Drift-Question.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r3/Preference-Optimization-Evidence-And-Drift-Question/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | PDE Residual Scientific ML Implementation Checks

- Published write-back proposal: `syntheses/PDE-Residual-Scientific-ML-Implementation-Checks.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r3/PDE-Residual-Scientific-ML-Implementation-Checks/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Clustering Objective Representation Probe Plan

- Published write-back proposal: `syntheses/Clustering-Objective-Representation-Probe-Plan.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r3/Clustering-Objective-Representation-Probe-Plan/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Agent Workflow Tool-State Grounding Overview

- Published write-back proposal: `syntheses/Agent-Workflow-Tool-State-Grounding-Overview.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r3/Agent-Workflow-Tool-State-Grounding-Overview/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Diffusion Conditioning Representation Synthesis

- Published write-back proposal: `syntheses/Diffusion-Conditioning-Representation-Synthesis.md`
- Proposal manifest: `.drafts/proposals/product-maturity-synthesis-r3/Diffusion-Conditioning-Representation-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] navigation | Obsidian navigation pages

- Updated `Map of Content.md`
- Updated `Paper Index.md`
- Updated `Method Index.md`
- Updated `Topic Index.md`
- Updated `Concept Index.md`
- Updated `Synthesis Index.md`
- Updated `Claim Evidence Index.md`

## [2026-05-21] knowledge-repair | method-consolidation-2026-05-21

- Updated paper-specific method candidates: 239
- Skipped candidates: 0
- Consolidation manifest: `.drafts/knowledge-repair/high-leverage-method-consolidation-r1/method-consolidation.json`
- Low-risk publish only records family routing and retrieval visibility; it does not merge or rewrite method pages.

## [2026-05-21] publish | Transformer Architecture Method Family Synthesis

- Published write-back proposal: `syntheses/Transformer-Architecture-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/high-leverage-synthesis-r1/Transformer-Architecture-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] concept-layer | concept-layer-2026-05-21-d3ae447c4c

- Created concept pages: 0
- Added method/topic concept backlinks: 62
- Skipped low-risk actions: 0
- Concept proposal: `.drafts/knowledge-repair/high-leverage-concept-links-r1/concept-layer-proposal.json`

## [2026-05-21] publish | Post-Training Quantization Method Family Synthesis

- Published write-back proposal: `syntheses/Post-Training-Quantization-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/high-leverage-synthesis-r1/Post-Training-Quantization-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Kv-Cache Compression Method Family Synthesis

- Published write-back proposal: `syntheses/Kv-Cache-Compression-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/high-leverage-synthesis-r1/Kv-Cache-Compression-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Calibration-Aware Ptq Method Family Synthesis

- Published write-back proposal: `syntheses/Calibration-Aware-Ptq-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/high-leverage-synthesis-r1/Calibration-Aware-Ptq-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Hardware-Aware Quantization Method Family Synthesis

- Published write-back proposal: `syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/high-leverage-synthesis-r1/Hardware-Aware-Quantization-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Long-Context Inference Method Family Synthesis

- Published write-back proposal: `syntheses/Long-Context-Inference-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/high-leverage-synthesis-r1/Long-Context-Inference-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Clustering Algorithm Method Family Synthesis

- Published write-back proposal: `syntheses/Clustering-Algorithm-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/high-leverage-synthesis-r1/Clustering-Algorithm-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] publish | Speculative Decoding Method Family Synthesis

- Published write-back proposal: `syntheses/Speculative-Decoding-Method-Family-Synthesis.md`
- Proposal manifest: `.drafts/proposals/high-leverage-synthesis-r1/Speculative-Decoding-Method-Family-Synthesis/proposal.json`
- Updated index: `index.md`
- Updated synthesis catalog: `.index/syntheses.jsonl`

## [2026-05-21] navigation | Obsidian navigation pages

- Updated `Map of Content.md`
- Updated `Paper Index.md`
- Updated `Method Index.md`
- Updated `Topic Index.md`
- Updated `Concept Index.md`
- Updated `Synthesis Index.md`
- Updated `Claim Evidence Index.md`
