---
type: plan
title: "MVP Paper Wiki Workflow Plan"
status: draft
created: 2026-05-18
updated: 2026-05-18
tags:
  - llm-wiki
  - paper-wiki
  - arbor-brainstorm
confidence: medium
---

# MVP Paper Wiki Workflow Plan

## Product Boundary

Meridian MVP is a personal paper wiki workflow for one researcher. It is not a general agents platform, team knowledge base, paper-writing system, or experiment automation system.

The workflow should make papers useful after they are read, not merely summarize PDFs. A paper enters the system with raw source material and optional user annotations. The workflow turns it into a durable, editable, retrievable research state that can later help evaluate and generate ideas.

## Core User Loop

```text
paper or user idea
-> route request
-> build or retrieve paper/wiki context
-> draft structured update or answer
-> review/evolve with user feedback and checks
-> publish to Obsidian wiki
-> feed improved context back into future ideas
```

The loop is intentionally a workflow. LLM calls are steps inside the workflow; they do not dynamically invent the overall process.

## Functional Boundaries By Step

### 1. Route Request

Purpose: decide the workflow path before reading or writing broadly.

Inputs:

- paper source: PDF, arXiv URL, DOI, local file path, BibTeX, Zotero item/export
- user insight: reading note, annotation, pasted critique, correction, emphasis
- user idea or question

Outputs:

- request type: `ingest_paper`, `add_user_insight`, `evolve_analysis`, `retrieve_context`, `develop_idea`, or `lint_wiki`
- target objects when known
- missing required inputs, if any
- write policy: draft-only, direct additive write, or read-only answer

Boundary:

- Routing must not silently write wiki pages.
- Routing asks only for missing decisions that change the path.
- Ambiguous requests default to draft/read-only until the user confirms write intent.

### 2. Build Paper Model

Purpose: convert raw paper material and user insight into a structured paper model.

Independent extraction passes:

- bibliographic identity and source metadata
- problem, motivation, and assumptions
- method and implementation recipe
- claims and evidence
- experiments, metrics, baselines, and results
- limitations, contradictions, and open questions
- user annotations and user judgments

Outputs:

- draft paper page
- candidate claim pages
- candidate method/concept/topic links
- unresolved questions for the user
- provenance map from extracted claims to source locations or annotations

Boundary:

- The workflow must distinguish source facts from user judgment and wiki synthesis.
- The first pass is allowed to be incomplete.
- User feedback can change analysis structure, not only content.

### 3. Retrieve Context

Purpose: find the small set of existing wiki pages that actually matters for a paper, question, or idea.

Retrieval path:

1. Rewrite request into retrieval intent: entities, methods, claims, constraints, output goal.
2. Read `wiki/index.md` and relevant frontmatter when available.
3. Run lexical/BM25-style search over page titles, headings, aliases, tags, and body text.
4. Expand through graph links: paper-to-claim, claim-to-method, method-to-idea, topic-to-paper.
5. Filter by status, confidence, source count, recency, and user-marked importance.
6. Rerank for usefulness to the current request.
7. Emit a context packet with chosen pages, selection reasons, evidence, conflicts, and gaps.

Boundary:

- Retrieval should return a context packet, not a large dump.
- The workflow must explain why selected pages are relevant.
- Vector search is optional later infrastructure, not the starting point.

### 4. Review And Evolve Draft

Purpose: prevent canonical wiki pollution and make paper analysis improve through feedback.

Checks:

- source boundary check
- citation/provenance check
- schema/frontmatter check
- link and graph consistency check
- user feedback incorporation check
- contradiction and gap check

Outputs:

- revised draft
- accepted updates
- rejected or deferred updates with reasons
- analysis history entry when the change is meaningful

Boundary:

- Broad rewrites pass through `wiki/.drafts/`.
- Narrow additive updates can write directly only when provenance is clear and user intent allows it.
- The workflow should preserve why analysis changed when user feedback materially shifts interpretation.

### 5. Publish And Feed Ideas

Purpose: update durable Markdown state and make the wiki useful for future research thinking.

Writes:

- canonical paper, claim, method, concept, topic, idea, or experiment pages
- `wiki/index.md`
- `wiki/log.md`
- `wiki/graph/edges.jsonl`
- `wiki/graph/citations.jsonl`

Idea feedback outputs:

- research angles
- hypotheses
- paper-reading targets
- experiment sketches
- failure-path memory to avoid repeated dead ends

Boundary:

- Publish is not just file writing; it must update navigation and history.
- Idea feedback must cite the context packet it relied on.
- Failed or weak ideas should be recorded when they prevent repeated work.

## Development Plan

The implementation should start with the Paper Wiki, not the Research Dev Agent. The Paper Wiki is the research memory substrate that later development tools should consume through MCP or context packets.

The development loop for Paper Wiki should be:

```text
brainstorm prototype boundary
-> build minimal prototype
-> human review against real research needs
-> build many evaluation cases
-> run evaluation
-> analyze failures
-> refine workflow/schema/tools
-> repeat
```

See `docs/paper-wiki-prototype-evaluation-plan.md` for the detailed prototype and evaluation plan.

### Phase 0: Workflow Kernel

Goal: establish directory shape, schemas, templates, routing contract, and draft/publish rules.

Deliverables:

- vault directory scaffold
- page templates for paper, claim, method, concept, idea, experiment, and source
- frontmatter schema and validation script
- request routing contract
- draft/publish policy
- index/log conventions

### Phase 1: One-Paper Ingestion

Goal: make one paper usable in the wiki with user insight support.

Deliverables:

- raw paper intake path
- optional Zotero/exported annotation intake path
- paper model extraction workflow
- paper page draft generation
- claim/method/concept candidate generation
- provenance capture
- publish to canonical wiki after review

### Phase 2: Evolutionary Analysis

Goal: make analysis improve when the user corrects or expands it.

Deliverables:

- feedback request path
- analysis history section
- structure revision support
- contradiction/gap update support
- draft comparison and publish gate

### Phase 3: Retrieval Context Packet

Goal: retrieve the right wiki pages for a user idea or question.

Deliverables:

- index/frontmatter search
- lexical search
- graph expansion
- reranking policy
- context packet format
- retrieval explanation and gap reporting

### Phase 4: Idea Feedback Loop

Goal: use the paper wiki to improve research ideas.

Deliverables:

- idea critique workflow
- hypothesis and experiment sketch output
- next-paper recommendation output
- write-back path for durable ideas and failed/deferred routes

## Test Plan

### Structure Tests

- Validate required directories exist.
- Validate templates contain required frontmatter fields.
- Validate wiki pages have legal `type`, `status`, `sources`, and `updated` fields.
- Validate `wiki/log.md` headings follow the parseable format.

### Workflow Scenario Tests

- Ingest a paper without user notes and produce a draft paper page plus log entry.
- Ingest a paper with user annotations and keep source facts separate from user judgment.
- Apply user feedback that changes the analysis emphasis and verify analysis history is updated.
- Ask an idea question and verify retrieval returns a small context packet with selection reasons.
- Publish a draft and verify index, log, and graph updates occur together.

### Negative Tests

- Missing paper source should stop at routing with a clear missing-input message.
- Unclear write intent should not modify canonical wiki pages.
- A claim without provenance should remain draft or be marked low confidence.
- Retrieval with weak matches should say what is missing instead of overclaiming.
- Broad rewrite should not bypass `wiki/.drafts/`.

### Evaluation Focus

- Does the workflow produce research state that can be reused later?
- Are source facts, user judgment, and synthesis visibly separate?
- Can a user correct the analysis without fighting the schema?
- Does retrieval return a defensible context packet instead of generic search results?
- Does publishing update all state surfaces consistently?

## Open Decisions

- Exact paper parser for first implementation.
- Zotero connection method: export-first vs API-first.
- Whether graph files should be updated by simple scripts from day one or deferred until pages exist.
- Whether first retrieval uses only `rg` plus frontmatter, or includes a local BM25 helper immediately.
- How much user approval is required before publishing narrow additive updates.
