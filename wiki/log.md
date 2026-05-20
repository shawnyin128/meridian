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
