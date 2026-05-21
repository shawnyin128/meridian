# Concept Layer Schema

Meridian concept pages are first-class preliminary-knowledge pages under `wiki/concepts/`. A concept is not a paper summary, method family, or generic textbook article. It is recurring background knowledge that affects how a researcher understands, implements, debugs, probes, or ablates methods across papers.

Examples include activation outliers, quantization error propagation, KV-cache memory bandwidth, attention sink, speculative decoding acceptance rate, KL regularization, PDE residuals, and k-means objective landscape.

## Frontmatter

Required fields:

- `type: concept`
- `title`
- `status`
- `created`, `updated`
- `aliases`
- `sources`, `source_papers`
- `related_methods`, `related_topics`, `related_claims`, `related_evidence`
- `prerequisite_for`
- `supports`, `contradicts`
- `confidence`
- `review_state`
- `evolution_state`
- `revision_id`

## Body Sections

- `What It Is`
- `Why It Matters`
- `Where It Appears`
- `Used By Methods`
- `Implementation Implications`
- `Common Failure Modes`
- `Minimal Checks / Probes`
- `Evidence / Provenance`
- `Related Concepts`
- `Open Questions`
- `Retrieval Hooks`

## Boundary

Concept pages compile source-grounded and wiki-synthesis context into implementation-ready background. They can say why a concept matters and what checks to run, but they must keep source paper provenance visible and must not promote source-quality holds or user insight into paper evidence.

Low-risk concept repairs may create concept pages and add method/topic backlinks. High-risk repairs include merging concepts, rewriting method mechanisms, declaring contradictions, or changing claim confidence.
