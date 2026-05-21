# Meridian

Meridian is a Markdown-first Paper Wiki for turning papers, user reading notes,
retrieval results, and refinements into a durable Obsidian knowledge base.

## Install

For local development:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
```

This installs:

- `meridian`: CLI execution primitives
- `meridian-mcp`: MCP stdio server entry

For release packaging boundaries, see `docs/release-packaging.md`. The Python
package is the execution core; product prompt skills, representative evals, and
the clean vault template are part of the source/repo bundle. A user's live
`wiki/` vault is private state and is not part of the release package.

## Product Entries

Meridian has two product entries:

| Entry | Update Wiki | Use Wiki |
|---|---|---|
| Prompt/Skill | ingest sources, add insights, write back synthesis, refine pages, audit health | retrieve context, read pages, trace evidence, answer with provenance |
| MCP | `meridian.update`, `meridian.propose`, `meridian.apply`, `meridian.audit` | `meridian.context`, `meridian.read`, `meridian.trace` |

The CLI commands below are execution primitives for those entries. The user
mental model is:

- **Update Wiki**: add or improve durable wiki knowledge.
- **Use Wiki**: retrieve compiled context for research or coding.

The Prompt/Skill entry starts at:

```text
.codex/skills/meridian-paper-wiki/SKILL.md
```

The MCP entry can be started as a stdio server for MCP clients:

```bash
PYTHONPATH=src python3 -m meridian.mcp serve --wiki-root wiki
```

The JSON bridge remains available for smoke tests and local debugging:

```bash
PYTHONPATH=src python3 -m meridian.mcp capabilities --detail full
```

For client-readiness, run the MCP JSON-RPC harness:

```bash
PYTHONPATH=src python3 -m meridian.mcp harness --wiki-root wiki --out wiki/.index/mcp-stdio-harness.json
```

Design details:

- `docs/wiki-product-entry-contract.md`
- `docs/wiki-mcp-entry-design.md`
- `docs/wiki-mcp-server-setup.md`
- `docs/wiki-entry-demo.md`
- `docs/daily-use-walkthrough.md`
- `docs/paper-wiki-release-readiness-checklist.md`
- `docs/paper-wiki-product-maturity-brief.md`

## Research Dev

Research Dev is the lightweight upper layer for wiki-aware research coding. It
is not a general coding agent or Arbor clone. Use it when a coding task depends
on paper methods, prerequisite concepts, evidence, prior user insights, or
experiment interpretation.

Agent-facing entry:

```text
.codex/skills/meridian-research-dev/SKILL.md
```

MVP workflows:

- Idea to Experiment Design
- Paper or Method to Implementation
- Broken Run to Sanity Check / Debug

Research Dev consumes Paper Wiki through MCP context/read/trace and writes back
through proposal-first wiki updates. The plan and scenarios are documented in
`docs/research-dev-mvp-plan.md` and `docs/research-dev-use-cases.md`.

## Execution Primitives

Initialize a wiki vault:

```bash
meridian wiki init --wiki-root wiki
```

This creates an Obsidian-compatible Markdown vault scaffold: `papers/`,
`claims/`, `methods/`, `evidence/`, `topics/`, `concepts/`, `syntheses/`, immutable
`raw/sources/`, generated `.index/`, draft areas, and reusable templates.

A clean vault template for release bundles is tracked at:

```text
src/meridian/templates/wiki-vault/
```

The project main vault is `wiki/`. It is intended to be opened directly in
Obsidian and is the default root for source audit, catalog, retrieval, and
write-back proposal commands. The current main-vault productization status is
tracked in `docs/main-wiki-productization-quality-brief.md`. Product artifact
roles are defined in `docs/wiki-product-dataflow-and-artifact-boundaries.md`.

```bash
meridian wiki ingest /path/to/paper.pdf --out wiki/.drafts/ingests/<paper-slug>/
```

The default command creates draft-only artifacts and does not publish canonical
wiki pages, update indexes, or run the later Research Dev Agent.

When the output path is inside `wiki/.drafts/...`, Meridian treats `wiki/` as
the vault root and registers the PDF under `wiki/raw/sources/papers/` with a
hash-based source ID. The original input path is preserved in
`wiki/raw/sources/sources.jsonl`, but future wiki pages point at the managed raw
source instead of indexing arbitrary desktop/download paths.

To exercise the confidence-gated wiki path, provide a wiki root and publish
mode:

```bash
meridian wiki ingest /path/to/paper.pdf \
  --out wiki/.drafts/ingests/<paper-slug>/ \
  --wiki-root wiki \
  --publish-mode auto
```

This publishes a canonical draft paper page when the quality gate does not fail,
updates `wiki/index.md` and `wiki/log.md`, and records whether the page still
needs review.

The user-facing reading object is the canonical page in `wiki/papers/<paper>.md`.
The similarly shaped file under `wiki/.drafts/ingests/<run>/paper.md` is only an
internal canonical-page candidate kept for audit and publish replay. It is not
the daily wiki entry and is not a retrieval target. `review.md`, judge packets,
and self-check files are debug/eval artifacts; use `--verbose-artifacts` when
you need those internal paths.

A canonical paper page should be mechanism-level, not an abstract summary. It
should answer: what problem the paper actually attacks, what method objects
exist, what each component consumes and produces, what assumptions matter for
implementation, what evidence backs the claims, and what caveats should block
premature promotion.

The preferred prototype path is the full flow:

```bash
meridian wiki flow /path/to/paper.pdf \
  --out wiki/.drafts/ingests/<paper-slug>/ \
  --wiki-root wiki \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

This runs ingest, publishes a canonical draft when allowed, builds a bounded
LLM-as-Judge packet, builds a reader self-check packet, and writes `flow.json`.
Default CLI output is product-oriented: managed source PDF, canonical wiki page,
quality/review state, index/log updates, and the internal artifact root. It does
not present `review.md`, `judge-packet.md`, or self-check JSON as product
outputs unless `--verbose-artifacts` is set.
The reader self-check is the mechanism-level guardrail: one reader explains the
paper from `paper.md` only, another explains it from source excerpts, and the
reconciliation must attribute mismatches to generation-mechanism buckets. The
packet also forces checklist results, comparison-dimension gaps,
frontmatter/retrieval audit, candidate-record audit, detailed weighted rubric
scores, false-confidence flags, hard-failure checks, and regression tests to add.

After a judge produces JSON, record and converge it:

```bash
meridian wiki judge-record wiki/.drafts/ingests/<paper-slug>/run.json judge-result.json
meridian wiki converge wiki/.drafts/ingests/<paper-slug>/run.json
```

To prepare an LLM-as-Judge input packet:

```bash
meridian wiki judge-pack wiki/.drafts/ingests/<paper-slug>/run.json \
  --rubric eval/rubrics/paper_wiki_quality_v0.md \
  --out wiki/.drafts/ingests/<paper-slug>/judge-packet.md
```

To prepare only the two-reader self-check packet:

```bash
meridian wiki reader-check wiki/.drafts/ingests/<paper-slug>/run.json \
  --out wiki/.drafts/ingests/<paper-slug>/reader-check.md
```

To run a JSONL evaluation set through the full flow and prepare one judge packet
per case:

```bash
meridian wiki eval eval/cases/paper_ingest_quality.example.jsonl \
  --out-dir eval/runs/<run-id>/ \
  --mode flow \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

`--mode flow` writes per-case `flow.json`, `run.json`, `judge-packet.md`, a
case snapshot, and a shared draft wiki under `<out-dir>/wiki` unless `--wiki-root`
is provided.

After an LLM judge writes per-case results, e.g.
`eval/runs/<run-id>/<case-id>/judge-result.json`, converge the run and summarize
it:

```bash
meridian wiki eval-converge eval/runs/<run-id>/eval_manifest.json
meridian wiki eval-summary eval/runs/<run-id>/eval_manifest.json
```

Human calibration records judge quality without re-reviewing every artifact:

```bash
meridian wiki eval-calibrate eval/runs/<run-id>/eval_manifest.json \
  --case-id <case-id> \
  --human-decision agree \
  --bucket paper_model \
  --notes "Judge found the main issue."
```

## Canonical Wiki Management

Publish an existing draft run and promote candidate records into the wiki graph:

```bash
meridian wiki publish-run wiki/.drafts/ingests/<paper-slug>/run.json \
  --wiki-root wiki
```

This creates or updates:

- `wiki/papers/<paper>.md`
- `wiki/methods/*.md`
- `wiki/claims/*.md`
- `wiki/evidence/*.md`
- `wiki/topics/*.md`
- `wiki/concepts/*.md` once the concept layer is proposed/published
- `wiki/index.md`
- `wiki/log.md`
- `wiki/.index/papers.jsonl`

Audit raw source management:

```bash
meridian wiki source-audit --wiki-root wiki
```

This checks managed PDFs in `wiki/raw/sources/papers/` against
`wiki/raw/sources/sources.jsonl` and writes both
`wiki/.index/source-audit.json` and an Obsidian-readable
`wiki/raw/sources/index.md`.

Rebuild or health-check the canonical wiki:

```bash
meridian wiki rebuild-index --wiki-root wiki
meridian wiki lint --wiki-root wiki
```

Use Obsidian CLI as a live vault navigation layer when Obsidian is open:

```bash
obsidian vault="wiki" search query="activation outliers" limit=10
obsidian vault="wiki" read path="papers/<paper-page>.md"
obsidian vault="wiki" backlinks path="papers/<paper-page>.md"
```

## Retrieval v1

Canonical draft paper pages can be wrapped into a machine-readable corpus catalog:

```bash
meridian wiki catalog --wiki-root wiki
```

This scans `wiki/papers/*.md` and `wiki/syntheses/*.md`, writing
`wiki/.index/papers.jsonl` and `wiki/.index/syntheses.jsonl`; it also writes
knowledge-layer catalogs for `methods/`, `topics/`, `claims/`, `evidence/`, and `concepts/`.
The catalogs keep frontmatter as the routing source of truth, plus section previews for
context-packet construction. Draft ingest candidates under
`wiki/.drafts/ingests/**` are intentionally excluded even when their text matches
the query.

## Preliminary Knowledge / Concept Layer

Concept pages are canonical preliminary-knowledge pages under `wiki/concepts/`.
They capture recurring background mechanisms that matter for research coding,
debugging, ablation design, and probes, such as activation outliers, KV-cache
memory bandwidth, KL regularization, PDE residuals, or k-means objective
landscapes. They are source-provenanced compiled knowledge, not generic textbook
notes.

```bash
meridian wiki concept-audit --wiki-root wiki
meridian wiki propose-concept-layer --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/<slug>/
meridian wiki concept-layer-lint wiki/.drafts/knowledge-repair/<slug>/concept-layer-proposal.json --wiki-root wiki
meridian wiki publish-concept-layer wiki/.drafts/knowledge-repair/<slug>/concept-layer-proposal.json --wiki-root wiki
```

Published concept pages are retrievable with `result_type: concept`. For
method/probe/debug queries, retrieval should return method pages together with
prerequisite concepts and source/evidence pages.

Retrieve research context with:

```bash
meridian wiki retrieve "I need MoE PTQ papers for activation outlier ablations" \
  --wiki-root wiki \
  --strategy v1 \
  --top-k 5 \
  --out wiki/.drafts/retrieval/context.md \
  --json-out wiki/.drafts/retrieval/context.json
```

The output is a ranked context packet, not a final answer. Results can include
paper, synthesis, method, topic, claim, and evidence pages, each marked with
`result_type` and `knowledge_role`. Retrieval v1 combines
frontmatter/facet routing, deterministic BM25-style field weighting,
section-aware scoring, capped graph expansion, source-quality guards, hard
distractor suppression, and compact read-first snippets. v0 remains available
for comparison with `--strategy v0`.

## Knowledge Layer

The compiled knowledge layer keeps method/topic/claim/evidence/synthesis pages
useful for retrieval instead of leaving the vault as a paper dump. Audit it with:

## Final LLM Wiki Product Loop

The main vault now has a final-product convergence path:

```bash
meridian wiki final-status-migrate --wiki-root wiki
meridian wiki propose-synthesis-batch --wiki-root wiki --out-dir wiki/.drafts/proposals/final-synthesis-growth-r1
meridian wiki publish-synthesis-batch wiki/.drafts/proposals/final-synthesis-growth-r1/batch.json --wiki-root wiki
meridian wiki propose-method-consolidation --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/final-method-consolidation-r1
meridian wiki propose-contradiction-review --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/final-contradiction-review-r1
meridian wiki build-navigation --wiki-root wiki
meridian wiki final-product-check --wiki-root wiki
```

This loop preserves the final LLM Wiki boundary:

- paper pages are source-grounded understanding;
- method/topic/claim/evidence pages are the compiled knowledge layer;
- synthesis pages are durable query/write-back outputs;
- user insights are personalized but source-separated;
- evolution/revision keeps canonical pages auditable;
- retrieval v1 should return compiled context with `corpus_type`,
  `result_type`, `knowledge_role`, `quality_state`, `validation_state`,
  `trust_state`, provenance, and read-first sections.

See:

- `docs/final-llm-wiki-product-spec.md`
- `docs/final-llm-wiki-product-quality-brief.md`
- `eval/cases/final_llm_wiki_product.jsonl`
- `eval/rubrics/final_llm_wiki_product_quality.md`

```bash
meridian wiki knowledge-audit --wiki-root wiki
```

Generate a proposal for low-risk structural repairs:

```bash
meridian wiki propose-knowledge-repair --wiki-root wiki \
  --out wiki/.drafts/knowledge-repair/<slug>/
meridian wiki knowledge-repair-lint wiki/.drafts/knowledge-repair/<slug>/repair.json \
  --wiki-root wiki
```

Publish only lint-passing low-risk repairs:

```bash
meridian wiki publish-knowledge-repair wiki/.drafts/knowledge-repair/<slug>/repair.json \
  --wiki-root wiki
```

Low-risk repairs can add machine-readable frontmatter, create missing
method/topic pages from canonical paper metadata, and restructure aggregate
method/topic pages with linked paper snippets. High-risk actions such as merging
pages, changing claim confidence, declaring contradictions, rewriting syntheses,
or promoting user insight into source-grounded claims stay proposal-only.

## Query Write-back and Synthesis Layer

When a retrieval result produces durable understanding, turn it into a draft
proposal instead of leaving it only in chat:

```bash
meridian wiki propose-writeback \
  --wiki-root wiki \
  --query "<research intent>" \
  --context wiki/.drafts/retrieval/context.json \
  --title "<synthesis title>" \
  --proposal-type synthesis \
  --user-note "Optional user interpretation or decision."
```

Supported proposal types are `synthesis`, `comparison`, `method-family`,
`decision`, and `research-question`. The command writes:

- `wiki/.drafts/proposals/<slug>/proposal.md`
- `wiki/.drafts/proposals/<slug>/proposal.json`
- `wiki/.drafts/proposals/<slug>/source_context.json`
- `wiki/.drafts/proposals/<slug>/publish_plan.md`

Lint before publishing:

```bash
meridian wiki proposal-lint wiki/.drafts/proposals/<slug>/proposal.json \
  --wiki-root wiki
```

Publish only after lint passes:

```bash
meridian wiki publish-proposal wiki/.drafts/proposals/<slug>/proposal.json \
  --wiki-root wiki
```

Published synthesis-layer pages live in `wiki/syntheses/`, update
`wiki/index.md`, append to `wiki/log.md`, rebuild `.index/syntheses.jsonl`, and
become retrievable by future `meridian wiki retrieve` calls. The schema forces
separate sections for `Source Facts`, `Wiki Synthesis`, `User Ideas /
Decisions`, `Evidence Map`, `Open Questions`, and `Retrieval Hooks`; user notes
must not be mixed into source facts. Source-quality holds can only support
cleanup/provenance notes, not scientific evidence.

See `docs/wiki-writeback-synthesis-layer.md` for the full contract.

## User Insight Personalization

Add a personal reading note without confusing it with paper source facts:

```bash
meridian wiki add-insight \
  --wiki-root wiki \
  --paper "CodeQuant" \
  --note "For my project, this is most useful for expert-routing probe design." \
  --insight-type implementation-note
```

The command matches a canonical paper page and writes a draft under
`wiki/.drafts/insights/<slug>/`. Ambiguous or missing paper matches produce a
disambiguation artifact and do not mutate canonical pages.

Validate and publish:

```bash
meridian wiki insight-lint wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
meridian wiki publish-insight wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
```

Publishing appends to the target paper page's `## User Insights` section,
updates `user_insights` / `personalized` frontmatter, rebuilds index/catalog,
and appends to `wiki/log.md`. Retrieval can match `User Insights`, but context
packets mark the hit as user-supplied, not paper source fact or scientific
evidence.

See `docs/user-insight-personalization-mvp.md` for the schema, source-fact
boundary, and future Zotero annotation adapter design.

## Wiki Evolution and Revisions

Refine a canonical paper or synthesis page through a proposal rather than a
silent edit:

```bash
meridian wiki propose-refine \
  --wiki-root wiki \
  --target wiki/papers/<paper>.md \
  --reason "method section is too shallow" \
  --note "Clarify the mechanism before using this page for ablation planning."
```

This writes:

- `wiki/.drafts/refinements/<slug>/refinement.md`
- `wiki/.drafts/refinements/<slug>/refinement.json`
- `wiki/.drafts/refinements/<slug>/diff.md`
- `wiki/.drafts/refinements/<slug>/source_context.json`
- `wiki/.drafts/refinements/<slug>/publish_plan.md`

Lint and publish:

```bash
meridian wiki refinement-lint wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
meridian wiki publish-refinement wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
```

Publishing creates a pre-change snapshot under `wiki/.versions/`, appends a
canonical `## Evolution Notes` entry, updates `revision_id`, `revision_count`,
`previous_revision`, `evolution_state`, and `last_refinement_id` frontmatter,
then rebuilds index/catalog state. Normal retrieval uses the latest canonical
page and ignores `.versions/`, but context packets show revision/evolution
warnings when a page is stale, superseded, conflicting, or needs source re-check.

See `docs/wiki-evolution-mvp.md` for the schema and source-fact correction
rules.

Run side-by-side retrieval optimization evaluation:

```bash
meridian wiki retrieval-optimize-eval eval/cases/retrieval_optimization_v1.jsonl \
  --wiki-root wiki \
  --out-dir eval/runs/<run-id>/ \
  --rubric eval/rubrics/retrieval_optimization_quality.md \
  --top-k 8 \
  --overwrite
```

This writes `context.v0.md`, `context.v1.md`, JSON payloads, judge packets,
`retrieval_manifest.json`, `summary.json`, and `summary.md` for every case.

Run scenario-based retrieval evaluation:

```bash
meridian wiki retrieval-eval eval/cases/wiki_retrieval_quality.example.jsonl \
  --wiki-root wiki \
  --out-dir eval/runs/<run-id>/ \
  --rubric eval/rubrics/wiki_retrieval_quality_v0.md

meridian wiki retrieval-eval-summary eval/runs/<run-id>/retrieval_manifest.json
```

Audit whether each canonical paper can be found from generated research-intent
queries:

```bash
meridian wiki retrieval-audit \
  --wiki-root wiki \
  --out-dir eval/runs/<run-id>/ \
  --top-k 5 \
  --queries-per-paper 3
```

This writes per-paper retrieval contexts plus aggregate self-recall, target-rank,
metadata-sparsity, and neighbor-reasonableness metrics.

File durable query outputs back as draft proposals:

```bash
meridian wiki propose-writeback \
  --wiki-root wiki \
  --query "I need MoE PTQ papers for activation outlier ablations" \
  --context wiki/.drafts/retrieval/context.json \
  --title "MoE PTQ Outlier Ablation Reading Plan" \
  --proposal-type synthesis
```

This writes to `wiki/.drafts/proposals/` and records the event in `wiki/log.md`;
it does not publish canonical synthesis pages.

## Testing Strategy

The wiki layer test plan lives in `docs/wiki-layer-test-strategy.md`. It covers
source management tests, canonical wiki management tests, retrieval scenario
evaluation, LLM-as-Judge rubric expectations, human calibration, and release
gates.

Retrieval quality examples and rubric:

```bash
eval/cases/wiki_retrieval_quality.example.jsonl
eval/cases/wiki_retrieval_quantization_smoke.jsonl
eval/cases/wiki_retrieval_generalization.example.jsonl
eval/rubrics/wiki_retrieval_quality_v0.md
```
