# Final LLM Wiki Product Spec

Meridian's final Paper Wiki product is a Markdown-first compiled knowledge base for research papers. It is not a generic RAG index and not a chat transcript archive. The durable state is the Obsidian vault under `wiki/`.

## Daily Product Entry Points

Meridian has two product entries:

| Entry | Update Wiki | Use Wiki |
|---|---|---|
| Prompt/Skill | ingest, insight, write-back, refine, audit | retrieve, read, trace, answer |
| MCP | `update`, `propose`, `apply`, `audit` | `context`, `read`, `trace` |

The Prompt/Skill entry starts at `.codex/skills/meridian-paper-wiki/SKILL.md`.
The MCP entry is implemented under `src/meridian/mcp/` and starts with
`python3 -m meridian.mcp serve`. CLI commands are execution primitives for
those entries.

Obsidian daily navigation still starts from:

- `wiki/Map of Content.md`: home page for the main knowledge graph.
- `wiki/index.md`: generated canonical catalog.
- `wiki/Paper Index.md`, `wiki/Method Index.md`, `wiki/Topic Index.md`, `wiki/Concept Index.md`, `wiki/Synthesis Index.md`, `wiki/Claim Evidence Index.md`: navigation dashboards.
- `wiki/raw/sources/index.md`: immutable source registry view.

## Artifact Boundary

User-facing canonical artifacts:

- `wiki/papers/*.md`: source-grounded paper understanding.
- `wiki/methods/*.md`: compiled method-family pages plus explicitly marked paper-specific method records.
- `wiki/topics/*.md`: topic hubs connecting methods, papers, claims, and open questions.
- `wiki/concepts/*.md`: preliminary knowledge and prerequisite mechanisms needed for implementation, debugging, probes, and ablations.
- `wiki/claims/*.md`: claim records with supporting/contradicting evidence.
- `wiki/evidence/*.md`: source-grounded evidence records.
- `wiki/syntheses/*.md`: durable query write-back, comparison, method-family, decision, and research-question pages.

Internal artifacts:

- `wiki/.drafts/ingests/**`: extraction, paper candidates, judge packets, and self-check artifacts.
- `wiki/.drafts/proposals/**`: synthesis/write-back proposals before publish.
- `wiki/.drafts/knowledge-repair/**`: audit-driven repair, consolidation, and contradiction-review proposals.
- `wiki/.versions/**`: revision snapshots for auditable rollback.

## Page Responsibilities

- `paper`: explain what a paper does, what mechanism objects exist, what evidence supports claims, and what should block premature use.
- `method`: compile a method family across papers, including mechanism, implementation hooks, failure modes, and key evidence.
- `topic`: organize a research area, key papers, method families, contradictions, and retrieval hooks.
- `concept`: explain recurring prerequisite knowledge, why it matters, implementation implications, failure modes, minimal checks/probes, and source provenance.
- `claim`: state one claim, its scope, confidence, supporting evidence, contradicting evidence, and provenance.
- `evidence`: record one metric/observation/result with source paper, section/page, reliability, and limits.
- `synthesis`: preserve a valuable query result or research thought as durable cross-paper interpretation.
- `user insight`: personalized reading signal; useful for retrieval and evolution, never treated as paper source fact.
- `decision`: a synthesis subtype that records user or project decisions separately from source facts.

## Boundary Contract

Every durable page must preserve these distinctions:

- `Source Facts`: directly supported by source pages or raw-source provenance.
- `Wiki Synthesis`: interpretation across pages, current and revisable.
- `User Ideas / Decisions`: user-provided understanding, preference, hypothesis, or research decision.
- `Uncertainty`: missing provenance, weak evidence, stale state, or review requirements.

Source-quality holds can support cleanup/provenance decisions only. They must not become scientific evidence.

## Publish Path

Normal write path:

1. Draft/proposal artifact under `.drafts/`.
2. Lint checks source boundaries, target collisions, provenance, and source-quality safety.
3. Publish writes canonical Markdown and updates `index.md`, `log.md`, and `.index/*.jsonl`.
4. Evolution/refinement creates `.versions/` snapshots before canonical mutation.

Low-risk deterministic repairs may publish after lint. High-risk content changes stay proposal-first.

## Quality State Semantics

Legacy `quality_gate` is retained for backward compatibility. Final retrieval should prefer:

- `quality_state`: product-level state such as `text_converged`, `multimodal_pending`, `source_quality_hold`, `human_reviewed`, `judge_reviewed`, `needs_source_recheck`, `stale`, or `superseded`.
- `validation_state`: what has actually been validated, such as `text_converged` or `needs_source_recheck`.
- `trust_state`: how downstream agents should use the page, such as `source_grounded_text`, `source_grounded_reviewed`, `requires_review`, or `untrusted_source_text`.
- `review_state`: workflow state, e.g. `auto_converged`, `published_proposal`, `source_quality_hold`.
- `evolution_state`: revision health, e.g. `active`, `stale`, `superseded`, `needs_source_recheck`.

`multimodal_pending` means the paper page is useful source-grounded text understanding, not a failed page. It remains distinct from real source-quality failure.

## Retrieval Policy

Retrieval should return compiled context before raw paper dumps:

- overview query: synthesis/topic pages first, then key papers and evidence.
- method/probe/debug query: method-family pages plus prerequisite concept pages first, then implementation-relevant papers/evidence.
- evidence query: claim/evidence pages first, then source paper sections.
- personal idea query: user insight and synthesis pages can participate, but must be labeled user-supplied.
- contradiction/stale query: claim/synthesis/evolution warnings first.

Context packets must show `result_type`, `corpus_type`, `knowledge_role`, `source_type`, `quality_state`, `review_state`, `evolution_state`, provenance, selection reasons, and read-first sections.

## Obsidian Graph

The graph should expose:

- paper -> method/topic/claim/evidence links.
- method/topic -> related papers, concepts, and syntheses.
- concept -> source papers, prerequisite methods, related concepts, and evidence.
- synthesis -> source papers/claims/evidence.
- user insight -> target paper and optional refinement/synthesis chain.
- contradiction/stale candidates as proposal artifacts until reviewed.

## MCP/API/Local Model Surface

MCP, API, and local-vLLM delivery should wrap the same Markdown corpus rather than replacing it. The current MCP stdio server exposes:

- `meridian.context(query)`
- `meridian.read(page_id)`
- `meridian.trace(page_id)`
- `meridian.update(source_path | note)`
- `meridian.propose(query, title, proposal_type)`
- `meridian.apply(proposal_id)` after lint
- `meridian.audit(scope)`

Future API and local-vLLM wrappers should preserve the same Update Wiki / Use Wiki workflow split.

The Markdown vault remains the source of truth.
