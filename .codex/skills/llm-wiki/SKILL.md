---
name: llm-wiki
description: Control Meridian product-development boundaries for the LLM-maintained Paper Wiki. Use when planning, designing, implementing, or reviewing changes that define or alter product scope, architecture, workflow contracts, artifact boundaries, schema conventions, or durable knowledge-layer invariants. Do not use for routine paper ingest, retrieval, page updates, or wiki maintenance unless the task changes those product boundaries; use wiki, paper-ingest, wiki-retrieve, or other specialized skills instead.
---

# LLM Wiki

## Purpose

Use this skill to keep the project aligned with the LLM Wiki pattern: an LLM incrementally builds and maintains a persistent, interlinked Markdown wiki from curated raw sources. The wiki is a compounding artifact, not a temporary retrieval cache.

The central product promise is accumulated research state: summaries, entities, concepts, claims, contradictions, decisions, and next steps should become durable Markdown structure instead of disappearing into chat history.

For Meridian's current MVP, apply this pattern as a personal paper wiki workflow. Do not frame the product as a multi-agent platform. The first useful version should help the user internalize raw papers, incorporate their Zotero annotations and reading insights, evolve paper analysis through feedback, and feed the wiki back into stronger research ideas.

The Meridian development repo does not own the user's active Paper Wiki vault.
For product-facing use, rely on the configured Paper Wiki library initialized
with `meridian wiki init --library-root <dir>`; that library stores managed
sources under `<dir>/sources/` and the canonical vault under `<dir>/wiki/`.
Local eval runs may create temporary wiki roots, but product-facing source
audit, retrieval, graph, and write-back work should use the active workspace or
an explicit external `--wiki-root <wiki-root>`.

Product-facing wiki artifacts are canonical pages and retrieval/write-back context, not pipeline debug files. Follow `docs/wiki-product-dataflow-and-artifact-boundaries.md`: `wiki/papers/*.md` and `wiki/syntheses/*.md` are user-facing retrieval targets; `wiki/.drafts/ingests/<run>/paper.md` is an internal canonical-page candidate; `review.md`, judge packets, reader checks, and self-check JSON are validation/debug artifacts.

The product-facing entry skill is packaged at `plugins/codex/meridian/skills/wiki/SKILL.md` and `plugins/claude-code/meridian/skills/wiki/SKILL.md`. It exposes two workflows: `Update Wiki` and `Use Wiki`. Treat project-local skills such as `paper-ingest`, `wiki-retrieve`, `wiki-personalize`, `wiki-evolve`, `wiki-knowledge`, and `wiki-concept` as Meridian development/support modules; do not expose them as normal plugin product entries.

Final-product convergence is documented in `docs/final-llm-wiki-product-spec.md`. Treat the product as a compiled knowledge network: papers, methods, topics, concepts, claims, evidence, syntheses, user insights, and evolution state should all participate in retrieval and Obsidian navigation. Use `meridian wiki final-product-check --wiki-root <wiki-root>` as the deterministic readiness smoke.

When architecture or implementation choices are ambiguous, consult `docs/source-grounded-development-principles.md` for the project's source-grounded principles from Karpathy's LLM Wiki gist, Anthropic agent engineering posts, and selected community followup lessons.

## Core Model

Preserve three layers:

1. Raw sources: immutable source material such as articles, papers, notes, transcripts, images, exports, data files, and experiment logs. The agent reads this layer but does not rewrite it.
2. Wiki: LLM-generated Markdown pages such as summaries, entity pages, concept pages, claim pages, comparisons, overviews, decisions, and syntheses. The agent owns maintenance of this layer.
3. Schema: project instructions such as `AGENTS.md`, templates, frontmatter conventions, directory rules, and workflows. The human and agent co-evolve this layer as usage patterns become clear.

Do not replace this model with generic RAG unless the user explicitly asks. Search and retrieval can support the workflow, but the durable output is a maintained wiki.

## MCP Delivery

For Meridian, the Paper Wiki may be delivered as an MCP server so agents and clients can use the wiki without coupling to its internal vault layout.

The MCP entry uses the same two workflow model as the prompt entry:

- `Use Wiki`: `meridian.context`, `meridian.read`, `meridian.trace`.
- `Update Wiki`: `meridian.update`, `meridian.propose`, `meridian.apply`, `meridian.audit`.

The current adapter lives under `src/meridian/mcp/`; a real MCP runtime can wrap those functions.

Treat MCP as a delivery surface, not the source of truth:

- raw sources remain immutable
- Markdown wiki pages remain the durable compiled knowledge layer
- schema, templates, frontmatter, index, and log remain the operating contract
- MCP tools expose stable access to search, context packets, page reads, ingest entrypoints, and write-back proposals

Prefer conservative MCP boundaries:

- read/query/context tools before broad write tools
- propose/apply separation for wiki updates
- explicit provenance and uncertainty in returned context
- no client should need to know physical page locations to request research context
- agent-ergonomic tool responses: concise by default, detailed on request, with semantic IDs and selection reasons

The Research Dev Agent should consume paper/wiki memory through this MCP surface whenever available.

## Source-Grounded Principles

Follow these principles while the project is still design-heavy:

- progressive disclosure beats loading everything up front
- context packets beat retrieval dumps
- MCP is a delivery surface, not the source of truth
- tools should be few, high-signal, well-namespaced, and evaluated on realistic tasks
- write operations should start as proposals before canonical wiki mutation
- Research Dev Agent autonomy should be constrained by evidence contracts, not by brittle route machines
- research-grade code is clear, inspectable, extensible, and sometimes purposefully redundant
- wiki lookup should be a first-class dev action when method definitions, prior work, failed paths, or user insights matter
- git checkpoints should preserve research uncertainty: hypothesis code, probes, ablations, results, and risky refactors should be recoverable by impact
- community followups are experience signals, not implementation templates

## Design Rules

- Treat the wiki as compiled knowledge. New sources and important queries should update the wiki, not only produce chat answers.
- Keep raw sources read-only. If source cleanup is needed, create derived notes or metadata instead of mutating the original.
- Make edits auditable. Prefer clear diffs, provenance links, and log entries over silent rewrites.
- Keep the human in charge of source selection, emphasis, and judgment. Let the agent handle summarizing, cross-referencing, filing, and maintenance.
- Favor Markdown files, Obsidian links, plain directories, git history, and simple Unix-readable logs before adding databases or custom infrastructure.
- Preserve source provenance on claims. Any synthesized claim should point back to one or more source pages or raw source references when possible.
- Distinguish source facts, wiki synthesis, and user decisions. Do not blur "the source says", "the wiki currently infers", and "we decided".
- Treat user reading notes as first-class personalized wiki state. Preserve the raw note for provenance, then internalize it into non-source-fact canonical interpretation sections when lint passes; keep `User Insights` as an audit layer, and require source re-check before source-grounded edits.
- Treat preliminary knowledge as first-class concept state under `wiki/concepts/`. Concept pages should explain prerequisite mechanisms, implementation implications, failure modes, minimal checks/probes, and source provenance; do not collapse them into method pages or generic textbook notes.
- File valuable query outputs back into the wiki when they represent durable analysis, comparison, synthesis, or planning.
- Use proposal-first write-back for retrieval outputs. A valuable query should become `wiki/.drafts/proposals/<slug>/` first, pass `proposal-lint`, and only then publish to the canonical synthesis layer.
- Keep product output boundaries clean. Default CLI/user guidance should report the managed source PDF, canonical wiki page, quality/review state, and retrieval/proposal paths. Internal `review.md`, draft `paper.md`, self-check, judge, and extraction artifacts are available for audit but should not be presented as normal wiki entries.
- Prefer final quality semantics over legacy `quality_gate` alone. Retrieval-visible fields are `quality_state`, `validation_state`, `trust_state`, `review_state`, and `evolution_state`; `quality_gate: warn` can coexist with `quality_state: multimodal_pending` when a text-grounded page is usable but not fully multimodal-reviewed.

## Meridian Paper Ingest Flow

For the current prototype, use the confidence-gated flow as the default shape:

```text
PDF or source export
  -> extraction artifacts
  -> draft paper model and candidate records
  -> quality gate
  -> canonical draft publish when allowed
  -> bounded LLM-as-Judge packet
  -> recorded judge result
  -> convergence decision
```

Do not make mandatory human review the steady-state path. Human review is for calibration, high-impact papers, conflicts, user-insight integration, low-confidence extraction, or sampled audits.

Default command path:

```bash
meridian wiki flow <paper.pdf> \
  --out wiki/.drafts/ingests/<paper-slug>/ \
  --wiki-root wiki \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

The canonical wiki page may be auto-published only as a draft. It must preserve machine-readable state such as `status`, `review_state`, `quality_gate`, provenance fields, source links, and artifact links. A converged automatic ingest can move to `review_state: auto_converged`; this means the workflow accepted the packet, not that a human personally reviewed every claim.

The draft run file at `wiki/.drafts/ingests/<paper-slug>/paper.md` is a `paper_candidate` for publish/replay compatibility. Do not tell the user to read it as the final wiki product. The daily reading and retrieval target is the canonical page under `wiki/papers/`.

When an LLM-as-Judge result is available, record it and converge:

```bash
meridian wiki judge-record <run.json> <judge-result.json>
meridian wiki converge <run.json>
```

If convergence says refinement is needed, update the ingest skill/schema/content generation before scaling to scenario-specific evaluation.

## Page Frontmatter

Use YAML frontmatter on wiki pages unless the user chooses a different schema. Keep it simple and machine-readable.

Recommended baseline:

```yaml
---
type: idea | paper | claim | concept | entity | project | decision | source | synthesis
title: "Human-readable page title"
status: inbox | active | draft | reviewed | superseded | archived
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources:
  - "[[source-page-or-id]]"
tags:
  - llm-wiki
aliases: []
confidence: low | medium | high
---
```

Add fields only when they support an actual workflow. Good additions include `contradicts`, `supports`, `related`, `next_actions`, `source_count`, `owner`, or `review_after`. Avoid decorative metadata.

## Suggested Structure

Adapt names to the project, but keep the responsibilities separate:

```text
raw/              immutable source files and exports
raw/assets/       locally downloaded images and attachments
wiki/             generated Markdown wiki
wiki/index.md     content catalog and navigation
wiki/log.md       append-only chronological activity log
wiki/templates/   page templates and frontmatter examples
AGENTS.md         schema and operating rules for Codex agents
```

At small scale, `index.md` plus `rg` is enough. Add search tools only after the index becomes a real bottleneck.

## Operations

### Ingest

When processing a new source:

1. Read the source and identify durable information, claims, entities, concepts, contradictions, and possible next actions.
2. Decide whether to discuss interpretation with the user before writing broad wiki changes.
3. Create or update the source summary page.
4. Update affected entity, concept, claim, project, decision, or synthesis pages.
5. Add cross-links and provenance.
6. Update `wiki/index.md`.
7. Append a parseable entry to `wiki/log.md`.

A single source may touch many pages. Keep updates coherent rather than dumping everything into one summary.

### Query

When answering from the wiki:

1. Run `meridian wiki retrieve` against the canonical corpus when the question is research intent, comparison, implementation/probe planning, evidence lookup, or limitation lookup.
2. Read `wiki/index.md` or Obsidian navigation only as complementary orientation.
3. Read the smallest sufficient set of canonical wiki pages and source references.
4. Answer with citations or page references.
5. If the answer creates durable synthesis, ask whether to file it or file it directly when the user has already asked for wiki maintenance.

Durable write-back path:

```bash
meridian wiki propose-writeback \
  --wiki-root wiki \
  --query "<standalone research query>" \
  --context wiki/.drafts/retrieval/<slug>/context.json \
  --title "<synthesis title>" \
  --proposal-type synthesis
meridian wiki proposal-lint wiki/.drafts/proposals/<slug>/proposal.json --wiki-root wiki
meridian wiki publish-proposal wiki/.drafts/proposals/<slug>/proposal.json --wiki-root wiki
```

Proposal and canonical synthesis pages must preserve the section boundary:

- `Source Facts`: directly supported facts from retrieved pages/source artifacts.
- `Wiki Synthesis`: cross-source interpretation or comparison.
- `User Ideas / Decisions`: user notes, hypotheses, preferences, and decisions.
- `Open Questions`: uncertainty, weak retrieval, and checks before use.

Never promote source-quality holds as scientific evidence. They can only support cleanup/provenance decisions.

### Final Product Convergence

When the task is to make the wiki more like the final LLM Wiki product rather than fixing one page, use the convergence loop:

```bash
meridian wiki final-status-migrate --wiki-root wiki
meridian wiki propose-synthesis-batch --wiki-root wiki --out-dir wiki/.drafts/proposals/<batch>/
meridian wiki publish-synthesis-batch wiki/.drafts/proposals/<batch>/batch.json --wiki-root wiki
meridian wiki propose-method-consolidation --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/<batch>/
meridian wiki propose-contradiction-review --wiki-root wiki --out-dir wiki/.drafts/knowledge-repair/<batch>/
meridian wiki build-navigation --wiki-root wiki
meridian wiki final-product-check --wiki-root wiki
```

Publish low-confidence synthesis scaffolds only when they preserve `Source Facts`, `Wiki Synthesis`, `User Ideas / Decisions`, `Evidence Map`, and source-quality guardrails. Keep method-family consolidation and contradiction/stale detection proposal-first unless a low-risk linted repair is available.

### Personalize

When the user gives a paper-reading insight, correction, implementation note, retrieval hint, or future question, route it through the user insight workflow:

```bash
meridian wiki add-insight \
  --wiki-root wiki \
  --paper "<paper identifier or query>" \
  --note "<user note>" \
  --insight-type paper-note
meridian wiki insight-lint wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
meridian wiki publish-insight wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
```

The publish path internalizes the insight into non-source-fact canonical interpretation sections and updates `user_insights` / `personalized` frontmatter. It must not rewrite `Source Facts`, `What To Remember`, `Mechanism`, or `Evidence Map` from user input alone. If the user says a source-grounded section is wrong, record a source-fact correction request and require source re-check before changing source facts.

### Evolve

When a canonical paper, synthesis, topic, method, claim, or evidence page should improve, route the change through refinement:

```bash
meridian wiki propose-refine \
  --wiki-root wiki \
  --target "<canonical page path, title, alias, or query>" \
  --reason "<why refine>" \
  --note "<refinement note>"
meridian wiki refinement-lint wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
meridian wiki publish-refinement wiki/.drafts/refinements/<slug>/refinement.json --wiki-root wiki
```

Publishing a refinement creates a `.versions/` snapshot before updating the canonical page, appends `## Evolution Notes`, updates revision frontmatter, and rebuilds index/catalog state. Normal retrieval uses the latest canonical page only; `.versions/` is audit/rollback state, not the retrieval corpus.

If a refinement affects source facts, it must require source re-check. User insight can motivate a refinement, but it cannot become source fact without source provenance.

### Knowledge Layer

When method/topic/claim/evidence/synthesis pages are sparse, duplicated, disconnected, or too stub-like to support retrieval, route through the knowledge-layer workflow:

```bash
meridian wiki knowledge-audit --wiki-root wiki
meridian wiki propose-knowledge-repair --wiki-root wiki --out wiki/.drafts/knowledge-repair/<slug>/
meridian wiki knowledge-repair-lint wiki/.drafts/knowledge-repair/<slug>/repair.json --wiki-root wiki
meridian wiki publish-knowledge-repair wiki/.drafts/knowledge-repair/<slug>/repair.json --wiki-root wiki
```

Low-risk repairs may add frontmatter, create missing method/topic pages from canonical paper metadata, and enrich aggregate method/topic pages using snippets from linked canonical papers. High-risk repairs stay proposal-only: page merges, claim confidence changes, contradiction declarations, synthesis rewrites, and user-insight promotion into source-grounded claims.

Normal retrieval searches papers, syntheses, methods, topics, claims, and evidence. Check `result_type` and `knowledge_role`: a `candidate_record` can be useful provenance, but it is not reviewed wiki synthesis.

### Lint

Periodically health-check the wiki for:

- contradictions between pages
- stale claims superseded by newer sources
- orphan pages with no inbound or outbound links
- important concepts mentioned repeatedly but lacking their own pages
- missing cross-references
- claims without provenance
- projects without next actions
- inbox items not yet integrated

Prefer actionable fixes or a compact review report over broad commentary.

## Logging

Keep `wiki/log.md` chronological and append-only. Use a consistent heading prefix so simple tools can parse it:

```markdown
## [YYYY-MM-DD] ingest | Source title
## [YYYY-MM-DD] query | Question or output title
## [YYYY-MM-DD] lint | Scope
```

Each entry should state what changed, which pages were touched, and any unresolved follow-ups.

## Implementation Bias

For this project, prefer the smallest useful system:

- Markdown before databases.
- Obsidian-compatible links before custom graph storage.
- Templates and `AGENTS.md` before framework code.
- Local scripts before services.
- Human-reviewable diffs before opaque automation.
- A well-defined workflow before an agents platform.

Only add infrastructure when it clearly reduces repeated manual work or protects consistency at a scale the current wiki has actually reached.
